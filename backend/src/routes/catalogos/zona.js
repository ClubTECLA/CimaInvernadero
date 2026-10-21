import { Router } from "express";
import { pool } from "../../db.js";

import { verificarToken } from "../../middleware/auth.js";
import { zonasSeTraslapan } from "../../utils/zonas.js";

const router = Router();
const camposLimite = [
  "largo_inicio",
  "largo_fin",
  "ancho_inicio",
  "ancho_fin",
];

function normalizarLimites(body, dimensiones) {
  const valores = camposLimite.map((campo) => {
    const valor = body[campo];
    if (valor === "" || valor === null || valor === undefined) return null;
    const numero = Number(valor);
    const centesimas = Math.round(numero * 100);
    const precisionValida = Number.isFinite(numero) && Math.abs(numero * 100 - centesimas) < 1e-7;
    return precisionValida && numero >= 0 ? centesimas / 100 : NaN;
  });

  if (valores.some(Number.isNaN)) {
    return { error: "Los límites deben ser números con hasta dos decimales, iguales o mayores que cero" };
  }

  if (valores.some((valor) => valor === null)) {
    return { error: "Para registrar una zona, indique los cuatro límites de largo y ancho" };
  }
  const maximos = [dimensiones.largo, dimensiones.largo, dimensiones.ancho, dimensiones.ancho];
  if (valores.some((valor, indice) => valor > maximos[indice])) {
    return { error: `Los límites no pueden exceder ${Number(dimensiones.largo).toFixed(2)} m de largo ni ${Number(dimensiones.ancho).toFixed(2)} m de ancho` };
  }
  for (let eje = 0; eje < camposLimite.length; eje += 2) {
    if (valores[eje] >= valores[eje + 1]) {
      return { error: "Cada límite inicial debe ser menor que su límite final" };
    }
  }

  return { valores };
}

async function buscarTraslape(connection, valores, ubicacionId, idIgnorado = null) {
  const sql = "SELECT id, zona, largo_inicio, largo_fin, ancho_inicio, ancho_fin, altura_inicio, altura_fin " +
    "FROM zona WHERE largo_inicio IS NOT NULL AND largo_fin IS NOT NULL " +
    "AND ancho_inicio IS NOT NULL AND ancho_fin IS NOT NULL " +
    "AND ubicacion_id = ? " + (idIgnorado === null ? "" : "AND id <> ?");
  const parametros = idIgnorado === null ? [ubicacionId] : [ubicacionId, idIgnorado];
  const [zonas] = await connection.query(sql, parametros);
  const nuevaZona = Object.fromEntries(camposLimite.map((campo, indice) => [campo, valores[indice]]));
  return zonas.find((zona) => zonasSeTraslapan(nuevaZona, zona)) || null;
}

// GET /api/zona -> todas las zonas
router.get("/", async (req, res) => {
  try {
    const parametros = req.query.ubicacion_id ? [req.query.ubicacion_id] : [];
    const filtro = req.query.ubicacion_id ? "WHERE z.ubicacion_id = ?" : "";
    const [rows] = await pool.query(`SELECT z.*, u.nombre AS ubicacion_nombre FROM zona z JOIN ubicacion u ON u.id = z.ubicacion_id ${filtro} ORDER BY z.id ASC`, parametros);
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar las zonas:", error.message);
    res.status(500).json({ error: "Error al consultar las zonas" });
  }
});

// GET /api/zona/:id -> una zona por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM zona WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar la zona:", error.message);
    res.status(500).json({ error: "Error al consultar la zona" });
  }
});

// POST /api/zona -> crear nueva zona
router.post("/", verificarToken, async (req, res) => {
  const { zona, ubicacion_id = 1, descripcion, image_path } = req.body;

  if (!zona) {
    return res.status(400).json({ error: "La zona es requeridos" });
  }
  if (String(zona).trim().toLowerCase() === "sin zona") {
    return res.status(409).json({ error: "'Sin zona' está reservada como opción predeterminada" });
  }
  const [[ubicacion]] = await pool.query("SELECT id, largo, ancho, altura FROM ubicacion WHERE id = ?", [ubicacion_id]);
  if (!ubicacion) return res.status(404).json({ error: "Ubicación no encontrada" });
  const { valores: limites, error } = normalizarLimites(req.body, ubicacion);
  if (error) return res.status(400).json({ error });

  try {
    const traslapada = await buscarTraslape(pool, limites, ubicacion_id);
    if (traslapada) {
      return res.status(409).json({
        error: "Los límites se traslapan con \"" + traslapada.zona + "\". Ajuste los rangos para que las zonas no ocupen el mismo espacio.",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO zona
       (ubicacion_id, zona, descripcion, image_path, largo_inicio, largo_fin, ancho_inicio, ancho_fin, altura_inicio, altura_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [ubicacion_id, zona, descripcion ?? null, image_path ?? null, ...limites, ubicacion.altura],
    );
    res.status(201).json({ id: result.insertId, zona });
  } catch (error) {
    console.error("Error al crear zona:", error.message);
    res.status(500).json({ error: "Error al crear la zona" });
  }
});

// PATCH /api/zona/:id -> actualizar una zona
router.patch("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { zona, ubicacion_id = 1, descripcion, image_path } = req.body;

  if (!zona) {
    return res.status(400).json({ error: "La zona es requerida" });
  }
  if (String(zona).trim().toLowerCase() === "sin zona") {
    return res.status(409).json({ error: "'Sin zona' está reservada como opción predeterminada" });
  }
  const [[zonaActual]] = await pool.query("SELECT zona FROM zona WHERE id = ?", [id]);
  if (zonaActual && String(zonaActual.zona).trim().toLowerCase() === "sin zona") {
    return res.status(409).json({ error: "La opción predeterminada 'Sin zona' no se puede editar" });
  }
  const [[ubicacion]] = await pool.query("SELECT id, largo, ancho, altura FROM ubicacion WHERE id = ?", [ubicacion_id]);
  if (!ubicacion) return res.status(404).json({ error: "Ubicación no encontrada" });
  const { valores: limites, error } = normalizarLimites(req.body, ubicacion);
  if (error) return res.status(400).json({ error });

  try {
    const traslapada = await buscarTraslape(pool, limites, ubicacion_id, id);
    if (traslapada) {
      return res.status(409).json({
        error: "Los límites se traslapan con \"" + traslapada.zona + "\". Ajuste los rangos para que las zonas no ocupen el mismo espacio.",
      });
    }

    const [result] = await pool.query(
      `UPDATE zona
       SET ubicacion_id = ?, zona = ?, descripcion = ?, image_path = ?,
           largo_inicio = ?, largo_fin = ?, ancho_inicio = ?,
           ancho_fin = ?, altura_inicio = 0, altura_fin = ?
       WHERE id = ?`,
      [ubicacion_id, zona, descripcion ?? null, image_path ?? null, ...limites, ubicacion.altura, id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    res.json({ id: Number(id), zona });
  } catch (error) {
    console.error("Error al actualizar zona:", error.message);
    res.status(500).json({ error: "Error al actualizar la zona" });
  }
});

// DELETE /api/zona/:id -> eliminar una zona
router.delete("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existente] = await connection.query("SELECT id, zona FROM zona WHERE id = ? FOR UPDATE", [id]);
    if (existente.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    if (String(existente[0].zona).trim().toLowerCase() === "sin zona") {
      await connection.rollback();
      return res.status(409).json({ error: "'Sin zona' no se administra como una zona del catálogo" });
    }

    const [reasignados] = await connection.query(
      "UPDATE dispositivo SET zona_id = NULL WHERE zona_id = ?",
      [id],
    );
    await connection.query("DELETE FROM zona WHERE id = ?", [id]);
    await connection.commit();
    res.json({
      message: "Zona eliminada correctamente",
      nodos_reasignados: reasignados.affectedRows,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al eliminar zona:", error.message);
    res.status(500).json({ error: "Error al eliminar la zona" });
  } finally {
    connection.release();
  }
});

export default router;
