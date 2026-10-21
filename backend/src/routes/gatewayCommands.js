import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { verificarToken } from "../middleware/auth.js";
import { verificarGateway } from "../middleware/gatewayAuth.js";

const router = Router();
const tiposComandoValidos = new Set([
  "CONFIGURAR_NODO",
  "CONFIGURAR_REGLA_ACTUADOR",
  "CAMBIAR_ESTADO_TAREA",
  "REGISTRAR_COMPONENTE",
  "ACTUALIZAR_COMPONENTE",
  "ELIMINAR_COMPONENTE",
]);

function comandoPublico(fila) {
  return {
    id: fila.id,
    idempotency_key: fila.idempotency_key,
    nodo_id: fila.dispositivo_id,
    tipo: fila.tipo,
    payload: typeof fila.payload === "string" ? JSON.parse(fila.payload) : fila.payload,
    estado: fila.estado,
    respuesta: fila.respuesta,
    creado_at: fila.creado_at,
    vence_at: fila.vence_at,
    respondido_at: fila.respondido_at,
  };
}

// El panel crea una orden. Guardarla en la cola no significa que el equipo la recibió.
router.post("/commands", verificarToken, async (req, res) => {
  const { nodo_id, tipo, payload, idempotency_key } = req.body;
  const timeoutSeconds = Number(req.body.timeout_seconds ?? 15);
  const solicitudId = typeof idempotency_key === "string" ? idempotency_key : "";
  if (!Number.isInteger(Number(nodo_id)) || Number(nodo_id) < 1 || !tiposComandoValidos.has(tipo)) {
    return res.status(400).json({ error: "Indique un nodo y un tipo de comando válido" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Buffer.byteLength(JSON.stringify(payload)) > 8192) {
    return res.status(400).json({ error: "El contenido del comando debe ser un objeto de hasta 8 KB" });
  }
  if (!/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    return res.status(400).json({ error: "idempotency_key debe ser un UUID" });
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 120) {
    return res.status(400).json({ error: "El tiempo de espera debe estar entre 5 y 120 segundos" });
  }

  const id = randomUUID();
  const connection = await pool.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    await connection.query("SELECT id FROM gateway_command_mutex WHERE id=1 FOR UPDATE");
    await connection.query(`UPDATE gateway_command SET estado='VENCIDO'
      WHERE estado IN ('EN_COLA','ENTREGADO') AND vence_at <= NOW()`);
    const [duplicado] = await connection.query("SELECT * FROM gateway_command WHERE idempotency_key=?", [solicitudId]);
    if (duplicado.length) {
      await connection.commit();
      transactionOpen = false;
      return res.status(202).json(comandoPublico(duplicado[0]));
    }
    const [pendientes] = await connection.query(`SELECT id FROM gateway_command
      WHERE estado IN ('EN_COLA','ENTREGADO') AND vence_at > NOW() LIMIT 1`);
    if (pendientes.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(409).json({ error: "Hay otro cambio esperando confirmación del gateway. Espere su respuesta antes de enviar otro." });
    }
    const [nodos] = await connection.query("SELECT id FROM dispositivo WHERE id = ?", [nodo_id]);
    if (!nodos.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(404).json({ error: "No se encontró el nodo indicado" });
    }
    await connection.query(`
      INSERT INTO gateway_command (id, idempotency_key, dispositivo_id, tipo, payload, vence_at)
      VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE id = id
    `, [id, solicitudId, Number(nodo_id), tipo, JSON.stringify(payload), timeoutSeconds]);
    const [rows] = await connection.query("SELECT * FROM gateway_command WHERE idempotency_key = ?", [solicitudId]);
    await connection.commit();
    transactionOpen = false;
    res.status(202).json(comandoPublico(rows[0]));
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    console.error("No fue posible encolar el comando del gateway:", error.message);
    res.status(500).json({ error: "No fue posible crear el comando" });
  } finally {
    connection.release();
  }
});

// El panel consulta el resultado hasta obtener confirmación o vencimiento.
router.get("/commands/:id", verificarToken, async (req, res) => {
  try {
    await pool.query(`UPDATE gateway_command SET estado = 'VENCIDO'
      WHERE id = ? AND estado IN ('EN_COLA','ENTREGADO') AND vence_at <= NOW()`, [req.params.id]);
    const [rows] = await pool.query("SELECT * FROM gateway_command WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No se encontró el comando" });
    res.json(comandoPublico(rows[0]));
  } catch (error) {
    console.error("No fue posible consultar el comando:", error.message);
    res.status(500).json({ error: "No fue posible consultar la confirmación" });
  }
});

// El gateway toma comandos una sola vez y debe enviar el ACK con el mismo id.
router.get("/queue/pending", verificarGateway, async (req, res) => {
  const limit = Math.min(25, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("UPDATE gateway_command SET estado='VENCIDO' WHERE estado IN ('EN_COLA','ENTREGADO') AND vence_at <= NOW()");
    const [rows] = await connection.query(`SELECT * FROM gateway_command
      WHERE estado='EN_COLA' AND vence_at > NOW() ORDER BY creado_at LIMIT ? FOR UPDATE SKIP LOCKED`, [limit]);
    if (rows.length) {
      await connection.query("UPDATE gateway_command SET estado='ENTREGADO', entregado_at=NOW() WHERE id IN (?)", [rows.map((row) => row.id)]);
    }
    await connection.commit();
    res.json(rows.map((row) => ({ ...comandoPublico(row), estado: "ENTREGADO" })));
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible entregar comandos al gateway:", error.message);
    res.status(500).json({ error: "No fue posible consultar la cola" });
  } finally {
    connection.release();
  }
});

router.post("/queue/:id/ack", verificarGateway, async (req, res) => {
  const { success, message } = req.body;
  if (typeof success !== "boolean" || (message !== undefined && (typeof message !== "string" || message.length > 500))) {
    return res.status(400).json({ error: "La respuesta requiere success booleano y un mensaje de hasta 500 caracteres" });
  }
  try {
    await pool.query(`UPDATE gateway_command SET estado='VENCIDO'
      WHERE id=? AND estado IN ('EN_COLA','ENTREGADO') AND vence_at <= NOW()`, [req.params.id]);
    const [result] = await pool.query(`UPDATE gateway_command
      SET estado=?, respuesta=?, respondido_at=NOW()
      WHERE id=? AND estado='ENTREGADO' AND vence_at > NOW()`,
    [success ? "CONFIRMADO" : "FALLIDO", message?.trim() || null, req.params.id]);
    if (result.affectedRows) return res.json({ id: req.params.id, estado: success ? "CONFIRMADO" : "FALLIDO" });

    const [rows] = await pool.query("SELECT estado FROM gateway_command WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No se encontró el comando" });
    if (["CONFIRMADO", "FALLIDO"].includes(rows[0].estado)) return res.json({ id: req.params.id, estado: rows[0].estado, duplicada: true });
    return res.status(409).json({ error: rows[0].estado === "VENCIDO" ? "El comando venció antes de recibir respuesta" : "El comando aún no fue entregado al gateway", estado: rows[0].estado });
  } catch (error) {
    console.error("No fue posible guardar la confirmación del gateway:", error.message);
    res.status(500).json({ error: "No fue posible registrar la respuesta" });
  }
});

export default router;
