import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { verificarToken } from "../middleware/auth.js";
import { verificarGateway } from "../middleware/gatewayAuth.js";
import { parseHeartbeatGraceSeconds } from "../utils/heartbeat.js";
import { isIdempotentTerminalAck, validateGatewayCommandAck } from "../utils/gatewayCommandAck.js";
import { validateSensorMeasurementConfig } from "../utils/sensorMeasurementValidation.js";
import { calculateGatewayAssignmentRevision, calculateGatewayManifestRevision } from "../utils/gatewayRevisions.js";

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMAND_DELIVERY_MARGIN_SECONDS = Math.max(60, Math.min(7200, Number(process.env.COMMAND_DELIVERY_MARGIN_SECONDS) || 180));
const COMMAND_LATE_ACK_WINDOW_SECONDS = Math.max(86400, Math.min(31536000, Number(process.env.COMMAND_LATE_ACK_WINDOW_SECONDS) || 2592000));

function configuredApiBaseUrl() {
  const raw = process.env.GATEWAY_API_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
const tiposComandoValidos = new Set([
  "CONFIGURAR_NODO",
  "CONFIGURAR_REGLA_ACTUADOR",
  "CAMBIAR_ESTADO_TAREA",
  "REGISTRAR_COMPONENTE",
  "ACTUALIZAR_COMPONENTE",
  "ELIMINAR_COMPONENTE",
]);

function leerMac(value) {
  const mac = String(value || "").trim().toUpperCase();
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ? mac : null;
}

function comandoPublico(fila) {
  const configRevisionTarget = fila.config_revision_target_u32 === null || fila.config_revision_target_u32 === undefined
    ? null
    : Number(fila.config_revision_target_u32);
  const resultUnknownFinal = fila.estado === "SIN_CONFIRMACION" && fila.late_ack_seconds_remaining !== undefined && Number(fila.late_ack_seconds_remaining) <= 0;
  const gatewayQueueTerminal = ["APLICADO_NODO", "RECHAZADO_NODO"].includes(fila.estado) || (fila.estado === "SIN_CONFIRMACION" && (fila.ack_stage === "UNKNOWN_CONFIRMED" || resultUnknownFinal));
  return {
    id: fila.id,
    command_id: fila.id,
    idempotency_key: fila.idempotency_key,
    nodo_id: fila.dispositivo_id,
    gateway_id: fila.gateway_id,
    firmware_node_id: fila.firmware_node_id,
    assignment_active: fila.assignment_active === undefined ? undefined : Boolean(Number(fila.assignment_active)),
    config_revision: configRevisionTarget,
    command_config_revision: configRevisionTarget,
    command_config_revision_expected: fila.config_revision_expected_u32 === null ? null : Number(fila.config_revision_expected_u32),
    command_config_revision_target: configRevisionTarget,
    config_revision_expected: fila.config_revision_expected_u32 === null ? null : Number(fila.config_revision_expected_u32),
    config_revision_target: configRevisionTarget,
    config_revision_legacy: fila.config_revision || null,
    tipo: fila.tipo,
    payload: typeof fila.payload === "string" ? JSON.parse(fila.payload) : fila.payload,
    estado: fila.estado,
    ack_stage: fila.ack_stage || "NONE",
    vence_at: fila.vence_at,
    ttl_remaining_seconds: fila.ttl_remaining_seconds === undefined ? undefined : Number(fila.ttl_remaining_seconds),
    gateway_received_at: fila.gateway_received_at || fila.entregado_at,
    node_received_at: fila.node_received_at,
    node_completed_at: fila.node_completed_at || fila.respondido_at,
    expired_at: fila.expired_at,
    attempts_gateway: fila.attempts_gateway || 0,
    attempts_radio: fila.attempts_radio || 0,
    last_attempt_at: fila.last_attempt_at,
    last_boot_id: fila.last_boot_id,
    last_seq: fila.last_seq,
    applied_config_revision: fila.applied_config_revision_u32 === null ? null : Number(fila.applied_config_revision_u32),
    command_config_revision_applied: fila.applied_config_revision_u32 === null ? null : Number(fila.applied_config_revision_u32),
    applied_config_revision_legacy: fila.applied_config_revision || null,
    gateway_unknown_ack_at: fila.gateway_unknown_ack_at,
    late_ack_expires_at: fila.late_ack_expires_at,
    late_ack_seconds_remaining: fila.late_ack_seconds_remaining === undefined ? undefined : Number(fila.late_ack_seconds_remaining),
    result_unknown_final: resultUnknownFinal,
    delivery_lease_id: fila.delivery_lease_id,
    delivery_lease_expires_at: fila.delivery_lease_expires_at,
    delivery_lease_consumed_at: fila.delivery_lease_consumed_at,
    lease_remaining_seconds: fila.lease_remaining_seconds === undefined ? undefined : Number(fila.lease_remaining_seconds),
    delivery_attempts: Number(fila.delivery_attempts || 0),
    result_status: fila.estado === "APLICADO_NODO" ? "APPLIED" : fila.estado === "RECHAZADO_NODO" ? "REJECTED" : fila.estado === "SIN_CONFIRMACION" ? "UNKNOWN" : "PENDING",
    gateway_queue_terminal: gatewayQueueTerminal,
    remove_reported: gatewayQueueTerminal,
    respuesta: fila.respuesta,
    creado_at: fila.creado_at,
    respondido_at: fila.respondido_at,
  };
}

// Registro operativo autenticado: la API key se entrega una sola vez.
router.post("/v1/gateways", verificarToken, async (req, res) => {
  const nombre = typeof req.body.nombre === "string" ? req.body.nombre.trim() : "";
  if (!nombre || nombre.length > 120) return res.status(400).json({ error: "nombre es obligatorio (máximo 120 caracteres)" });
  const apiKey = randomBytes(32).toString("base64url");
  try {
    const [result] = await pool.query("INSERT INTO gateway (nombre, credential_hash) VALUES (?, ?)", [nombre, createHash("sha256").update(apiKey).digest("hex")]);
    return res.status(201).json({ schema_version: 1, gateway_id: result.insertId, api_key: apiKey, api_base_url: configuredApiBaseUrl() });
  } catch (error) {
    console.error("No fue posible registrar el gateway:", error.message);
    return res.status(500).json({ error: "No fue posible registrar el gateway" });
  }
});

// Administrative inventory; bearer tokens are global in the current auth model (no tenant ownership claims exist).
router.get("/v1/gateways", verificarToken, async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT g.id AS gateway_id,g.nombre,g.activo,g.creado_at,
      (SELECT COUNT(*) FROM gateway_node_assignment a WHERE a.gateway_id=g.id AND a.activo=1) AS nodos_asignados
      FROM gateway g ORDER BY g.id`);
    return res.json({ schema_version: 1, gateways: rows });
  } catch (error) {
    console.error("No fue posible listar gateways:", error.message);
    return res.status(500).json({ error: "No fue posible consultar gateways" });
  }
});

router.get("/v1/gateways/:gateway_id/nodes", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  if (!Number.isInteger(gatewayId) || gatewayId < 1) return res.status(400).json({ error: "gateway_id inválido" });
  try {
    const [rows] = await pool.query(`SELECT a.id AS asignacion_id,a.gateway_id,a.dispositivo_id AS nodo_id,
      a.firmware_node_id,a.mac_address,a.vigente_desde,a.vigente_hasta,a.activo,d.nombre,d.estado,
      p.manifest_revision_applied,p.assignment_revision_applied
      FROM gateway_node_assignment a JOIN dispositivo d ON d.id=a.dispositivo_id
      LEFT JOIN gateway_node_presence p ON p.gateway_id=a.gateway_id AND p.firmware_node_id=a.firmware_node_id
      WHERE a.gateway_id=? ORDER BY a.vigente_desde DESC,a.id DESC`, [gatewayId]);
    const [desiredAssignmentRevision,desiredManifestRevision] = await Promise.all([
      calculateGatewayAssignmentRevision(pool,gatewayId),calculateGatewayManifestRevision(pool,gatewayId),
    ]);
    const assignments = rows.map((row) => {
      const active = Boolean(Number(row.activo));
      const hasApplied = Boolean(row.manifest_revision_applied && row.assignment_revision_applied);
      return { ...row,
        manifest_revision_desired: active ? desiredManifestRevision : null,
        assignment_revision_desired: active ? desiredAssignmentRevision : null,
        manifest_sync_status: !active ? "REVOKED" : !hasApplied ? "UNKNOWN"
          : row.manifest_revision_applied === desiredManifestRevision && row.assignment_revision_applied === desiredAssignmentRevision ? "CURRENT" : "OUT_OF_DATE",
      };
    });
    return res.json({ schema_version: 1,gateway_id: gatewayId,
      manifest_revision_desired: desiredManifestRevision,assignment_revision_desired: desiredAssignmentRevision,assignments });
  } catch (error) {
    console.error("No fue posible listar asignaciones:", error.message);
    return res.status(500).json({ error: "No fue posible consultar asignaciones" });
  }
});

// Discovery only records candidates observed by the authenticated gateway. Assignment always remains explicit.
router.post("/v1/discovery/candidates", verificarGateway, async (req, res) => {
  const candidates = req.body?.nodes;
  if (!Array.isArray(candidates) || candidates.length > 64) return res.status(400).json({ error: "nodes debe ser un arreglo de hasta 64 candidatos" });
  const normalized = [];
  for (const item of candidates) {
    const firmwareNodeId = Number(item?.firmware_node_id);
    const mac = leerMac(item?.mac_address);
    if (!Number.isInteger(firmwareNodeId) || firmwareNodeId < 1 || firmwareNodeId > 4294967295 || !mac ||
        (item.boot_id != null && !UUID_PATTERN.test(item.boot_id)) ||
        (item.wire_version != null && (typeof item.wire_version !== "string" || item.wire_version.length > 32)) ||
        (item.firmware_version != null && (typeof item.firmware_version !== "string" || item.firmware_version.length > 64)) ||
        (item.capabilities != null && !Array.isArray(item.capabilities))) {
      return res.status(400).json({ error: "Candidato inválido: requiere firmware_node_id uint32 y mac_address; campos opcionales inválidos" });
    }
    normalized.push([req.gateway.id,firmwareNodeId,mac,item.boot_id || null,item.wire_version || null,item.firmware_version || null,JSON.stringify(item.capabilities ?? null)]);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const row of normalized) await connection.query(`INSERT INTO gateway_discovery_candidate
      (gateway_id,firmware_node_id,mac_address,boot_id,wire_version,firmware_version,capabilities)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE boot_id=VALUES(boot_id),wire_version=VALUES(wire_version),
      firmware_version=VALUES(firmware_version),capabilities=VALUES(capabilities),last_seen_at=NOW()`, row);
    await connection.commit();
    return res.status(202).json({ schema_version: 1, observed: normalized.length, assigned_automatically: false });
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible registrar candidatos:", error.message);
    return res.status(500).json({ error: "No fue posible registrar candidatos" });
  } finally { connection.release(); }
});

router.get("/v1/gateways/:gateway_id/candidates", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  if (!Number.isInteger(gatewayId) || gatewayId < 1) return res.status(400).json({ error: "gateway_id inválido" });
  try {
    const [rows] = await pool.query(`SELECT c.* FROM gateway_discovery_candidate c
      LEFT JOIN gateway_node_assignment a ON a.firmware_node_id=c.firmware_node_id AND a.activo=1
      WHERE c.gateway_id=? AND a.id IS NULL ORDER BY c.last_seen_at DESC`, [gatewayId]);
    return res.json({ schema_version: 1, candidates: rows });
  } catch (error) {
    console.error("No fue posible consultar candidatos:", error.message);
    return res.status(500).json({ error: "No fue posible consultar candidatos" });
  }
});

router.put("/v1/gateways/:gateway_id/nodes", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  const nodeId = Number(req.body.nodo_id);
  const firmwareNodeId = Number(req.body.firmware_node_id);
  const mac = leerMac(req.body.mac_address);
  const pollInterval = Number(req.body.management_poll_interval_seconds ?? 600);
  if (!Number.isInteger(gatewayId) || gatewayId < 1 || !Number.isInteger(nodeId) || nodeId < 1 || !Number.isInteger(firmwareNodeId) || firmwareNodeId < 1 || firmwareNodeId > 4294967295 || !mac || !Number.isInteger(pollInterval) || pollInterval < 60 || pollInterval > 86400) {
    return res.status(400).json({ error: "gateway_id, nodo_id SQL, firmware_node_id uint32 positivo, mac_address y management_poll_interval_seconds (60-86400) son obligatorios/válidos" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [gateway] = await connection.query("SELECT id FROM gateway WHERE id=? AND activo=1 FOR UPDATE", [gatewayId]);
    const [node] = await connection.query("SELECT id FROM dispositivo WHERE id=? FOR UPDATE", [nodeId]);
    if (!gateway.length || !node.length) { await connection.rollback(); return res.status(404).json({ error: "No se encontró el gateway o nodo indicado" }); }
    const [firmwareOwner] = await connection.query(`SELECT dispositivo_id,gateway_id FROM gateway_node_assignment
      WHERE firmware_node_id=? AND activo=1 AND dispositivo_id<>? LIMIT 1 FOR UPDATE`, [firmwareNodeId,nodeId]);
    if (firmwareOwner.length) { await connection.rollback(); return res.status(409).json({ error: "firmware_node_id ya está vinculado a otro dispositivo SQL", gateway_id: firmwareOwner[0].gateway_id, nodo_id: firmwareOwner[0].dispositivo_id }); }
    await connection.query("UPDATE gateway_node_assignment SET activo=0, vigente_hasta=NOW() WHERE dispositivo_id=? AND activo=1", [nodeId]);
    await connection.query("UPDATE dispositivo SET management_poll_interval_seconds=? WHERE id=?", [pollInterval, nodeId]);
    const [result] = await connection.query(`INSERT INTO gateway_node_assignment
      (gateway_id, dispositivo_id, firmware_node_id, mac_address) VALUES (?, ?, ?, ?)` , [gatewayId, nodeId, firmwareNodeId, mac]);
    await connection.commit();
    return res.status(201).json({ schema_version: 1, asignacion_id: result.insertId, gateway_id: gatewayId, nodo_id: nodeId, firmware_node_id: firmwareNodeId, mac_address: mac });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "La MAC o el ID de firmware ya tienen una asignación vigente" });
    console.error("No fue posible asignar el nodo al gateway:", error.message);
    return res.status(500).json({ error: "No fue posible asignar el nodo al gateway" });
  } finally { connection.release(); }
});

router.put("/v1/gateways/:gateway_id/nodes/:nodo_id/sensors", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  const nodeId = Number(req.params.nodo_id);
  const sensorId = Number(req.body.sensor_id);
  const firmwareId = typeof req.body.sensor_firmware_id === "string" ? req.body.sensor_firmware_id.trim() : "";
  const channel = typeof req.body.canal === "string" ? req.body.canal.trim() : "";
  if (![gatewayId, nodeId, sensorId].every((value) => Number.isInteger(value) && value > 0) || !/^[A-Za-z0-9._:-]{1,100}$/.test(firmwareId) || !/^[A-Za-z0-9._:-]{1,100}$/.test(channel)) {
    return res.status(400).json({ error: "gateway_id, nodo_id, sensor_id, sensor_firmware_id y canal son obligatorios" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assignment] = await connection.query(`SELECT id FROM gateway_node_assignment WHERE gateway_id=? AND dispositivo_id=? AND activo=1 FOR UPDATE`, [gatewayId, nodeId]);
    const [sensor] = await connection.query("SELECT id FROM sensor WHERE id=? FOR UPDATE", [sensorId]);
    if (!assignment.length || !sensor.length) { await connection.rollback(); return res.status(404).json({ error: "Nodo no asignado a ese gateway o sensor inexistente" }); }
    await connection.query(`UPDATE nodo_sensor SET activo=0, retirado_en=NOW() WHERE dispositivo_id=? AND sensor_id=? AND activo=1`, [nodeId, sensorId]);
    const [result] = await connection.query(`INSERT INTO nodo_sensor (dispositivo_id,sensor_id,sensor_firmware_id,canal) VALUES (?,?,?,?)`, [nodeId,sensorId,firmwareId,channel]);
    await connection.commit();
    return res.status(201).json({ schema_version: 1, asignacion_sensor_id: result.insertId, nodo_id: nodeId, sensor_id: sensorId, sensor_firmware_id: firmwareId, canal: channel });
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible asignar el sensor:", error.message);
    return res.status(500).json({ error: "No fue posible asignar el sensor" });
  } finally { connection.release(); }
});

router.get("/v1/gateways/:gateway_id/nodes/:nodo_id/sensors", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  const nodeId = Number(req.params.nodo_id);
  if (![gatewayId,nodeId].every((value) => Number.isInteger(value) && value > 0)) {
    return res.status(400).json({ error: "gateway_id y nodo_id deben ser enteros positivos" });
  }
  try {
    const [assignment] = await pool.query(`SELECT id FROM gateway_node_assignment
      WHERE gateway_id=? AND dispositivo_id=? AND activo=1 LIMIT 1`, [gatewayId,nodeId]);
    if (!assignment.length) return res.status(404).json({ error: "El nodo no tiene una asignación activa en ese gateway" });
    const [rows] = await pool.query(`SELECT ns.id AS asignacion_sensor_id,ns.sensor_id,s.nombre,
      t.nombre AS tipo_sensor,ns.sensor_firmware_id,ns.canal,
      CASE WHEN s.estado='ACTIVO' THEN 'OPERATIVO' ELSE s.estado END AS estado_administrativo,
      ns.instalado_en,ns.notas
      FROM nodo_sensor ns JOIN sensor s ON s.id=ns.sensor_id
      JOIN tipo_dispositivo t ON t.id=s.tipo_dispositivo_id
      WHERE ns.dispositivo_id=? AND ns.activo=1 ORDER BY ns.canal,s.id`, [nodeId]);
    return res.json({ schema_version: 1,gateway_id: gatewayId,nodo_id: nodeId,sensores: rows });
  } catch (error) {
    console.error("No fue posible consultar mapeos de sensores:", error.message);
    return res.status(500).json({ error: "No fue posible consultar mapeos de sensores" });
  }
});

router.get("/v1/sensors/:sensor_id/measurements/:tipo_dato_id/validation", verificarToken, async (req, res) => {
  const sensorId = Number(req.params.sensor_id);
  const typeId = Number(req.params.tipo_dato_id);
  if (![sensorId, typeId].every((value) => Number.isInteger(value) && value > 0)) return res.status(400).json({ error: "sensor_id y tipo_dato_id deben ser enteros positivos" });
  try {
    const [rows] = await pool.query(`SELECT td.id AS tipo_dato_id, td.unidad,
      c.installation_min, c.installation_max, c.manufacturer_min, c.manufacturer_max,
      c.manufacturer_reference, COALESCE(c.calibration_status,'NOT_RECORDED') AS calibration_status,
      c.calibration_reference, c.calibrated_at, c.updated_at
      FROM sensor s JOIN tipo_dispositivo_tipo_dato m ON m.tipo_dispositivo_id=s.tipo_dispositivo_id
      JOIN tipo_dato td ON td.id=m.tipo_dato_id
      LEFT JOIN sensor_measurement_config c ON c.sensor_id=s.id AND c.tipo_dato_id=td.id
      WHERE s.id=? AND td.id=?`, [sensorId, typeId]);
    if (!rows.length) return res.status(404).json({ error: "Sensor o tipo de dato compatible no encontrado" });
    return res.json({ schema_version: 1, sensor_id: sensorId, ...rows[0], range_semantics: { installation: "configured acceptance range; optional", manufacturer: "physical specification; null until supported by a reference" } });
  } catch (error) {
    console.error("No fue posible consultar validación de medida:", error.message);
    return res.status(500).json({ error: "No fue posible consultar los límites del sensor" });
  }
});

router.put("/v1/sensors/:sensor_id/measurements/:tipo_dato_id/validation", verificarToken, async (req, res) => {
  const sensorId = Number(req.params.sensor_id);
  const typeId = Number(req.params.tipo_dato_id);
  if (![sensorId, typeId].every((value) => Number.isInteger(value) && value > 0)) return res.status(400).json({ error: "sensor_id y tipo_dato_id deben ser enteros positivos" });
  try {
    const [types] = await pool.query(`SELECT td.unidad FROM sensor s
      JOIN tipo_dispositivo_tipo_dato m ON m.tipo_dispositivo_id=s.tipo_dispositivo_id
      JOIN tipo_dato td ON td.id=m.tipo_dato_id WHERE s.id=? AND td.id=?`, [sensorId, typeId]);
    if (!types.length) return res.status(404).json({ error: "Sensor o tipo de dato compatible no encontrado" });
    const validation = validateSensorMeasurementConfig(req.body, types[0].unidad);
    if (!validation.valid) return res.status(validation.conflict ? 409 : 400).json({ error: validation.error, unidad_catalogo: types[0].unidad });
    const value = validation.values;
    await pool.query(`INSERT INTO sensor_measurement_config
      (sensor_id,tipo_dato_id,installation_min,installation_max,manufacturer_min,manufacturer_max,manufacturer_reference,calibration_status,calibration_reference,calibrated_at)
      VALUES (?,?,?,?,?,?,?,?,?,IF(?='CALIBRATED',NOW(),NULL))
      ON DUPLICATE KEY UPDATE installation_min=VALUES(installation_min), installation_max=VALUES(installation_max),
        manufacturer_min=VALUES(manufacturer_min), manufacturer_max=VALUES(manufacturer_max), manufacturer_reference=VALUES(manufacturer_reference),
        calibration_status=VALUES(calibration_status), calibration_reference=VALUES(calibration_reference), calibrated_at=VALUES(calibrated_at)`,
    [sensorId,typeId,value.installationMin,value.installationMax,value.manufacturerMin,value.manufacturerMax,value.manufacturerReference,value.calibrationStatus,value.calibrationReference,value.calibrationStatus]);
    return res.status(200).json({ schema_version: 1, sensor_id: sensorId, tipo_dato_id: typeId, unidad: types[0].unidad,
      installation_min: value.installationMin, installation_max: value.installationMax,
      manufacturer_min: value.manufacturerMin, manufacturer_max: value.manufacturerMax, manufacturer_reference: value.manufacturerReference,
      calibration_status: value.calibrationStatus, calibration_reference: value.calibrationReference,
      manufacturer_limits_verified_by_reference: value.manufacturerMin !== null || value.manufacturerMax !== null });
  } catch (error) {
    console.error("No fue posible guardar validación de medida:", error.message);
    return res.status(500).json({ error: "No fue posible guardar la configuración de validación" });
  }
});

router.delete("/v1/gateways/:gateway_id/nodes/:nodo_id", verificarToken, async (req, res) => {
  const gatewayId = Number(req.params.gateway_id);
  const nodeId = Number(req.params.nodo_id);
  if (![gatewayId, nodeId].every((value) => Number.isInteger(value) && value > 0)) return res.status(400).json({ error: "gateway_id y nodo_id deben ser enteros positivos" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assignments] = await connection.query(`SELECT id FROM gateway_node_assignment
      WHERE gateway_id=? AND dispositivo_id=? AND activo=1 FOR UPDATE`, [gatewayId, nodeId]);
    if (!assignments.length) { await connection.rollback(); return res.status(404).json({ error: "No existe asignación activa para ese nodo y gateway" }); }
    await connection.query(`UPDATE gateway_node_assignment SET activo=0, vigente_hasta=NOW() WHERE gateway_id=? AND dispositivo_id=? AND activo=1`, [gatewayId,nodeId]);
    await connection.commit();
    return res.json({ schema_version: 1, revoked: true, gateway_id: gatewayId, nodo_id: nodeId,
      assignment_id: assignments[0].id, historical_assignment_preserved: true });
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible revocar asignación de nodo:", error.message);
    return res.status(500).json({ error: "No fue posible revocar la asignación" });
  } finally { connection.release(); }
});

router.get("/v1/manifest", verificarGateway, async (req, res) => {
  try {
    const [nodes] = await pool.query(`SELECT a.dispositivo_id AS nodo_id, a.firmware_node_id, a.mac_address,
      d.estado AS estado_administrativo, d.intervalo_lectura_segundos, d.management_poll_interval_seconds,
      d.config_revision, p.recibido_at AS ultimo_heartbeat_at,
      p.manifest_revision_applied, p.assignment_revision_applied,
      DATE_ADD(p.recibido_at, INTERVAL d.management_poll_interval_seconds SECOND) AS next_expected_management_window,
      DATE_ADD(p.recibido_at, INTERVAL (d.management_poll_interval_seconds + ?) SECOND) AS management_deadline_at,
      ? AS management_poll_margin_seconds
      FROM gateway_node_assignment a JOIN dispositivo d ON d.id=a.dispositivo_id
      LEFT JOIN gateway_node_presence p ON p.gateway_id=a.gateway_id AND p.firmware_node_id=a.firmware_node_id
      WHERE a.gateway_id=? AND a.activo=1 ORDER BY a.firmware_node_id`, [parseHeartbeatGraceSeconds(process.env.HEARTBEAT_GRACE_SECONDS), COMMAND_DELIVERY_MARGIN_SECONDS, req.gateway.id]);
    for (const node of nodes) {
      const [sensors] = await pool.query(`SELECT s.id AS sensor_id, ns.sensor_firmware_id, ns.canal,
        CASE WHEN s.estado='ACTIVO' THEN 'OPERATIVO' ELSE s.estado END AS estado_administrativo,
        s.tipo_dispositivo_id
        FROM nodo_sensor ns JOIN sensor s ON s.id=ns.sensor_id
        WHERE ns.dispositivo_id=? AND ns.activo=1 ORDER BY ns.canal, s.id`, [node.nodo_id]);
      node.sensores = [];
      for (const sensor of sensors) {
        const [measurements] = await pool.query(`SELECT td.id AS tipo_dato_id, td.nombre AS tipo_dato, td.unidad,
          c.installation_min, c.installation_max, c.manufacturer_min, c.manufacturer_max,
          c.manufacturer_reference, COALESCE(c.calibration_status,'NOT_RECORDED') AS calibration_status,
          c.calibration_reference, c.calibrated_at
          FROM tipo_dispositivo_tipo_dato m JOIN tipo_dato td ON td.id=m.tipo_dato_id
          LEFT JOIN sensor_measurement_config c ON c.sensor_id=? AND c.tipo_dato_id=td.id
          WHERE m.tipo_dispositivo_id=? ORDER BY td.id`, [sensor.sensor_id, sensor.tipo_dispositivo_id]);
        node.sensores.push({
          sensor_id: sensor.sensor_id,
          sensor_firmware_id: sensor.sensor_firmware_id,
          canal: sensor.canal,
          estado_administrativo: sensor.estado_administrativo,
          estado: sensor.estado_administrativo,
          tipo_dato_ids: measurements.map((measurement) => Number(measurement.tipo_dato_id)),
          mediciones: measurements.map((measurement) => ({
            tipo_dato_id: Number(measurement.tipo_dato_id),
            tipo_dato: measurement.tipo_dato,
            unidad: measurement.unidad,
            installation_limits: {
              minimum: measurement.installation_min === null ? null : Number(measurement.installation_min),
              maximum: measurement.installation_max === null ? null : Number(measurement.installation_max),
              semantics: "configured installation acceptance range; nullable and not a manufacturer specification",
            },
            manufacturer_limits: {
              minimum: measurement.manufacturer_min === null ? null : Number(measurement.manufacturer_min),
              maximum: measurement.manufacturer_max === null ? null : Number(measurement.manufacturer_max),
              reference: measurement.manufacturer_reference,
              semantics: measurement.manufacturer_reference ? "manufacturer specification with recorded reference" : "unconfigured; do not infer hardware limits",
            },
            calibration_status: measurement.calibration_status,
            calibration_reference: measurement.calibration_reference,
            calibrated_at: measurement.calibrated_at,
          })),
        });
      }
    }
    const assignmentSnapshot = nodes.map((node) => ({
      nodo_id: node.nodo_id,
      firmware_node_id: node.firmware_node_id,
      mac_address: node.mac_address,
      sensores: node.sensores.map((sensor) => ({
        sensor_id: sensor.sensor_id,
        sensor_firmware_id: sensor.sensor_firmware_id,
        canal: sensor.canal,
      })),
    }));
    const assignmentRevision = createHash("sha256").update(JSON.stringify(assignmentSnapshot)).digest("hex");
    const manifestSnapshot = nodes.map((node) => ({
      nodo_id: node.nodo_id, firmware_node_id: node.firmware_node_id, mac_address: node.mac_address,
      estado_administrativo: node.estado_administrativo, intervalo_lectura_segundos: node.intervalo_lectura_segundos,
      management_poll_interval_seconds: node.management_poll_interval_seconds,
      sensores: node.sensores,
    }));
    const manifestRevision = createHash("sha256").update(JSON.stringify(manifestSnapshot)).digest("hex");
    for (const node of nodes) {
      node.command_config_revision = Number(node.config_revision);
      const hasAppliedRevisions = Boolean(node.manifest_revision_applied && node.assignment_revision_applied);
      node.manifest_sync_status = !hasAppliedRevisions ? "UNKNOWN"
        : node.manifest_revision_applied === manifestRevision && node.assignment_revision_applied === assignmentRevision ? "CURRENT" : "OUT_OF_DATE";
    }
    res.set("ETag", `"${manifestRevision}"`);
    return res.json({ schema_version: 1, gateway_id: req.gateway.id, generated_at: new Date().toISOString(), assignment_revision: assignmentRevision, manifest_revision: manifestRevision, nodes });
  } catch (error) {
    console.error("No fue posible generar el manifiesto del gateway:", error.message);
    return res.status(500).json({ error: "No fue posible consultar el manifiesto" });
  }
});

router.post("/v1/heartbeat", verificarGateway, async (req, res) => {
  const rawNodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
  const revisionAliasConflict = rawNodes.some((node) => Object.prototype.hasOwnProperty.call(node, "command_config_revision_applied") &&
    Object.prototype.hasOwnProperty.call(node, "config_revision_applied") && node.command_config_revision_applied !== node.config_revision_applied);
  const nodes = rawNodes.map((node) => ({ ...node,
    config_revision_applied: Object.prototype.hasOwnProperty.call(node, "command_config_revision_applied")
      ? node.command_config_revision_applied : node.config_revision_applied,
  }));
  const appliedRevisionPairIsValid = (node) => {
    const hasManifestRevision = Object.prototype.hasOwnProperty.call(node, "manifest_revision_applied");
    const hasAssignmentRevision = Object.prototype.hasOwnProperty.call(node, "assignment_revision_applied");
    if (hasManifestRevision !== hasAssignmentRevision) return false;
    if (!hasManifestRevision) return true;
    if (node.manifest_revision_applied === null && node.assignment_revision_applied === null) return true;
    return typeof node.manifest_revision_applied === "string" && /^[0-9a-f]{64}$/i.test(node.manifest_revision_applied) &&
      typeof node.assignment_revision_applied === "string" && /^[0-9a-f]{64}$/i.test(node.assignment_revision_applied);
  };
  if (revisionAliasConflict || nodes.length > 64 || nodes.some((node) => !Number.isInteger(Number(node.firmware_node_id)) || Number(node.firmware_node_id) < 1 || Number(node.firmware_node_id) > 4294967295 ||
      typeof node.boot_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(node.boot_id) ||
      !Number.isInteger(Number(node.seq)) || Number(node.seq) < 0 || Number(node.seq) > 4294967295 ||
      !Number.isInteger(node.config_revision_applied) || node.config_revision_applied < 0 || node.config_revision_applied > 4294967295 ||
      !["OPERATIVO", "INACTIVO", "EN MANTENIMIENTO"].includes(node.effective_mode) ||
      !appliedRevisionPairIsValid(node) ||
      (node.last_applied_command_id !== undefined && !UUID_PATTERN.test(String(node.last_applied_command_id))) ||
      (node.firmware_version !== undefined && (typeof node.firmware_version !== "string" || node.firmware_version.length > 64)))) {
    return res.status(400).json({ error: "nodes requiere firmware_node_id uint32, boot_id UUID, seq uint32, command_config_revision_applied uint32 (o el alias legacy config_revision_applied) y effective_mode válidos; firmware_version es opcional; los aliases deben coincidir" });
  }
  try {
    const [assignments] = await pool.query(`SELECT dispositivo_id, firmware_node_id FROM gateway_node_assignment WHERE gateway_id=? AND activo=1`, [req.gateway.id]);
    const assigned = new Map(assignments.map((row) => [Number(row.firmware_node_id), Number(row.dispositivo_id)]));
    if (nodes.some((node) => !assigned.has(Number(node.firmware_node_id)))) return res.status(403).json({ error: "El heartbeat incluye un nodo no asignado a este gateway" });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const node of nodes) {
        const firmwareNodeId = Number(node.firmware_node_id);
        const deviceId = assigned.get(firmwareNodeId);
        const [previous] = await connection.query(`SELECT boot_id,seq FROM gateway_node_presence WHERE gateway_id=? AND firmware_node_id=? FOR UPDATE`, [req.gateway.id, firmwareNodeId]);
        if (previous.length && previous[0].boot_id === node.boot_id && Number(node.seq) <= Number(previous[0].seq)) {
          await connection.rollback();
          return res.status(409).json({ error: "Heartbeat repetido o atrasado para este boot_id/seq; no se actualizó last_seen" });
        }
        await connection.query("UPDATE dispositivo SET ultimo_heartbeat_at=NOW(), ultima_comunicacion=NOW() WHERE id=?", [deviceId]);
        const hasAppliedRevisions = Object.prototype.hasOwnProperty.call(node, "manifest_revision_applied");
        const manifestRevisionApplied = typeof node.manifest_revision_applied === "string" ? node.manifest_revision_applied.toLowerCase() : null;
        const assignmentRevisionApplied = typeof node.assignment_revision_applied === "string" ? node.assignment_revision_applied.toLowerCase() : null;
        await connection.query(`INSERT INTO gateway_node_presence (gateway_id,firmware_node_id,dispositivo_id,boot_id,seq,firmware_version,config_revision_applied_u32,effective_mode,last_applied_command_id,manifest_revision_applied,assignment_revision_applied,recibido_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE dispositivo_id=VALUES(dispositivo_id),
          seq=IF(boot_id<>VALUES(boot_id),VALUES(seq),GREATEST(seq,VALUES(seq))), boot_id=VALUES(boot_id),
          firmware_version=COALESCE(VALUES(firmware_version),firmware_version),
          config_revision_applied_u32=VALUES(config_revision_applied_u32), effective_mode=VALUES(effective_mode),
          last_applied_command_id=COALESCE(VALUES(last_applied_command_id),last_applied_command_id),
          manifest_revision_applied=IF(?,VALUES(manifest_revision_applied),manifest_revision_applied),
          assignment_revision_applied=IF(?,VALUES(assignment_revision_applied),assignment_revision_applied), recibido_at=NOW()`,
        [req.gateway.id, firmwareNodeId, deviceId, node.boot_id, Number(node.seq), node.firmware_version || null,
          node.config_revision_applied, node.effective_mode, node.last_applied_command_id || null,
          manifestRevisionApplied, assignmentRevisionApplied, hasAppliedRevisions ? 1 : 0, hasAppliedRevisions ? 1 : 0]);
        if (node.last_applied_command_id) await connection.query(`UPDATE gateway_command SET estado='APLICADO_NODO', ack_stage='APPLIED',
          applied_config_revision_u32=?, node_received_at=COALESCE(node_received_at,NOW()), node_completed_at=NOW(), respondido_at=NOW(), last_boot_id=?, last_seq=?
          WHERE id=? AND gateway_id=? AND firmware_node_id=? AND config_revision_target_u32=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO','SIN_CONFIRMACION')
            AND (estado<>'SIN_CONFIRMACION' OR late_ack_expires_at>NOW())`,
        [node.config_revision_applied, node.boot_id, Number(node.seq), node.last_applied_command_id, req.gateway.id, firmwareNodeId, node.config_revision_applied]);
      }
      await connection.query(`INSERT INTO gateway_heartbeat (gateway_id, recibido_at) VALUES (?, NOW())
        ON DUPLICATE KEY UPDATE recibido_at=VALUES(recibido_at)`, [req.gateway.id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    return res.json({ schema_version: 1, accepted: true, received_at: new Date().toISOString() });
  } catch (error) {
    console.error("No fue posible registrar heartbeat:", error.message);
    return res.status(500).json({ error: "No fue posible registrar heartbeat" });
  }
});

// El panel crea una orden. Guardarla en la cola no significa que el equipo la recibió.
router.post(["/commands", "/v1/commands"], verificarToken, async (req, res) => {
  const { nodo_id, tipo, payload, idempotency_key } = req.body;
  let timeoutSeconds = Number(req.body.timeout_seconds ?? 15);
  const solicitudId = typeof idempotency_key === "string" ? idempotency_key : "";
  if (!Number.isInteger(Number(nodo_id)) || Number(nodo_id) < 1 || !tiposComandoValidos.has(tipo)) {
    return res.status(400).json({ error: "Indique un nodo y un tipo de comando válido" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Buffer.byteLength(JSON.stringify(payload)) > 8192) {
    return res.status(400).json({ error: "El contenido del comando debe ser un objeto de hasta 8 KB" });
  }
  if (!UUID_PATTERN.test(solicitudId)) {
    return res.status(400).json({ error: "idempotency_key debe ser un UUID" });
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 86400) {
    return res.status(400).json({ error: "El tiempo de espera debe estar entre 5 segundos y 24 horas" });
  }

  const id = randomUUID();
  const connection = await pool.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    await connection.query("SELECT id FROM gateway_command_mutex WHERE id=1 FOR UPDATE");
    await connection.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=NOW(), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at <= NOW()`);
    const [asignacion] = await connection.query(`SELECT a.gateway_id, a.firmware_node_id, d.management_poll_interval_seconds,
        d.config_revision AS desired_config_revision, COALESCE(p.config_revision_applied_u32,0) AS applied_config_revision_u32
      FROM gateway_node_assignment a JOIN dispositivo d ON d.id=a.dispositivo_id
      LEFT JOIN gateway_node_presence p ON p.gateway_id=a.gateway_id AND p.firmware_node_id=a.firmware_node_id
      WHERE a.dispositivo_id=? AND a.activo=1 FOR UPDATE`, [nodo_id]);
    if (!asignacion.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(409).json({ error: "Asigne el nodo a un gateway antes de crear comandos" });
    }
    const [duplicado] = await connection.query("SELECT * FROM gateway_command WHERE idempotency_key=?", [solicitudId]);
    if (duplicado.length) {
      if (Number(duplicado[0].dispositivo_id) !== Number(nodo_id) || Number(duplicado[0].gateway_id) !== Number(asignacion[0].gateway_id)) {
        await connection.rollback(); transactionOpen = false;
        return res.status(409).json({ error: "idempotency_key ya se usó para otro nodo o gateway" });
      }
      await connection.commit();
      transactionOpen = false;
      return res.status(202).json(comandoPublico(duplicado[0]));
    }
    const [pendientes] = await connection.query(`SELECT id FROM gateway_command
      WHERE gateway_id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at > NOW()
        AND config_revision_target_u32 IS NOT NULL
        AND EXISTS (SELECT 1 FROM gateway_node_assignment a WHERE a.gateway_id=gateway_command.gateway_id
          AND a.dispositivo_id=gateway_command.dispositivo_id AND a.firmware_node_id=gateway_command.firmware_node_id AND a.activo=1)
      LIMIT 1`, [asignacion[0].gateway_id]);
    if (pendientes.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(409).json({ error: "Hay otro cambio esperando confirmación del gateway. Espere su respuesta antes de enviar otro." });
    }
    const pollInterval = Math.max(60, Number(asignacion[0].management_poll_interval_seconds) || 600);
    timeoutSeconds = Math.max(timeoutSeconds, pollInterval + COMMAND_DELIVERY_MARGIN_SECONDS);
    if (timeoutSeconds > 86400) { await connection.rollback(); transactionOpen = false; return res.status(400).json({ error: "El intervalo de sueño y margen superan el TTL máximo de 24 horas" }); }
    const revisionEsperada = Number(asignacion[0].applied_config_revision_u32);
    const revisionObjetivo = Math.max(Number(asignacion[0].desired_config_revision), revisionEsperada) + 1;
    if (revisionObjetivo > 4294967295) { await connection.rollback(); transactionOpen = false; return res.status(409).json({ error: "Se agotó config_revision uint32; requiere enrolamiento/versionado nuevo antes de emitir más cambios" }); }
    await connection.query("UPDATE dispositivo SET config_revision=? WHERE id=?", [revisionObjetivo, Number(nodo_id)]);
    await connection.query(`
      INSERT INTO gateway_command (id, idempotency_key, dispositivo_id, gateway_id, firmware_node_id, config_revision_expected_u32, config_revision_target_u32, tipo, payload, vence_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE id = id
    `, [id, solicitudId, Number(nodo_id), asignacion[0].gateway_id, asignacion[0].firmware_node_id, revisionEsperada, revisionObjetivo, tipo, JSON.stringify(payload), timeoutSeconds]);
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
router.get(["/commands/:id([0-9a-f-]{36})", "/v1/commands/:id([0-9a-f-]{36})"], verificarToken, async (req, res) => {
  try {
    await pool.query(`UPDATE gateway_command SET estado = 'SIN_CONFIRMACION', expired_at=NOW(), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE id = ? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at <= NOW()`, [req.params.id]);
    const [rows] = await pool.query("SELECT * FROM gateway_command WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No se encontró el comando" });
    res.json(comandoPublico(rows[0]));
  } catch (error) {
    console.error("No fue posible consultar el comando:", error.message);
    res.status(500).json({ error: "No fue posible consultar la confirmación" });
  }
});

// El gateway revalida una orden retenida antes de una retransmisión después de un reboot.
router.get("/v1/commands/:id([0-9a-f-]{36})/status", verificarGateway, async (req, res) => {
  try {
    await pool.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=COALESCE(expired_at,NOW()), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE id=? AND gateway_id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at<=NOW()`, [req.params.id, req.gateway.id]);
    const [rows] = await pool.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),vence_at)) AS ttl_remaining_seconds,
      GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),late_ack_expires_at)) AS late_ack_seconds_remaining,
      EXISTS (SELECT 1 FROM gateway_node_assignment a WHERE a.gateway_id=gateway_command.gateway_id
        AND a.dispositivo_id=gateway_command.dispositivo_id AND a.firmware_node_id=gateway_command.firmware_node_id AND a.activo=1) AS assignment_active
      FROM gateway_command WHERE id=? AND gateway_id=?`, [req.params.id, req.gateway.id]);
    if (!rows.length) return res.status(404).json({ error: "No se encontró el comando para este gateway" });
    return res.json(comandoPublico(rows[0]));
  } catch (error) {
    console.error("No fue posible revalidar el comando:", error.message);
    return res.status(500).json({ error: "No fue posible consultar el estado del comando" });
  }
});

// Cada lease autoriza como máximo una transmisión radio y expira en 30 s o antes del TTL.
router.post("/v1/commands/:id([0-9a-f-]{36})/lease", verificarGateway, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=COALESCE(expired_at,NOW()), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE id=? AND gateway_id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at<=NOW()`, [req.params.id, req.gateway.id]);
    const [rows] = await connection.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),vence_at)) AS ttl_remaining_seconds,
      GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),delivery_lease_expires_at)) AS lease_remaining_seconds
      FROM gateway_command WHERE id=? AND gateway_id=? FOR UPDATE`, [req.params.id, req.gateway.id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: "No se encontró el comando para este gateway" }); }
    const command = rows[0];
    const [assignment] = await connection.query(`SELECT id FROM gateway_node_assignment WHERE gateway_id=? AND dispositivo_id=? AND firmware_node_id=? AND activo=1 FOR UPDATE`,
      [req.gateway.id, command.dispositivo_id, command.firmware_node_id]);
    if (!assignment.length) { await connection.rollback(); return res.status(409).json({ error: "La asignación nodo↔gateway fue revocada; no se autoriza transmisión", code: "assignment_revoked", delivery_authorized: false }); }
    if (!["RECIBIDO_GATEWAY", "RECIBIDO_NODO"].includes(command.estado) || Number(command.ttl_remaining_seconds) <= 0) {
      await connection.rollback(); return res.status(409).json({ error: "El comando no está activo para transmisión; consulta su estado antes de quitarlo de la cola", result_status: command.estado === "SIN_CONFIRMACION" ? "UNKNOWN" : command.estado });
    }
    if (command.delivery_lease_id && !command.delivery_lease_consumed_at && Number(command.lease_remaining_seconds) > 0) {
      await connection.commit();
      return res.json({ ...comandoPublico(command), delivery_authorized: false, lease_reused: true, lease_seconds_remaining: Number(command.lease_remaining_seconds) });
    }
    const leaseId = randomUUID();
    const leaseSeconds = Math.max(1, Math.min(30, Number(command.ttl_remaining_seconds)));
    await connection.query(`UPDATE gateway_command SET delivery_lease_id=?, delivery_lease_expires_at=DATE_ADD(NOW(),INTERVAL ? SECOND),
      delivery_lease_consumed_at=NULL WHERE id=? AND gateway_id=?`, [leaseId, leaseSeconds, req.params.id, req.gateway.id]);
    const [updated] = await connection.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),vence_at)) AS ttl_remaining_seconds,
      GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),delivery_lease_expires_at)) AS lease_remaining_seconds
      FROM gateway_command WHERE id=? AND gateway_id=?`, [req.params.id, req.gateway.id]);
    await connection.commit();
    return res.json({ ...comandoPublico(updated[0]), delivery_authorized: false, lease_seconds_remaining: Number(updated[0].lease_remaining_seconds) });
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible crear lease de entrega:", error.message);
    return res.status(500).json({ error: "No fue posible autorizar un intento de entrega" });
  } finally { connection.release(); }
});

// Consumir el lease antes de radio; un token consumido no autoriza segundo envío.
router.post("/v1/commands/:id([0-9a-f-]{36})/dispatch", verificarGateway, async (req, res) => {
  const leaseId = typeof req.body.delivery_lease_id === "string" ? req.body.delivery_lease_id : "";
  if (!UUID_PATTERN.test(leaseId)) return res.status(400).json({ error: "delivery_lease_id UUID es obligatorio" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=COALESCE(expired_at,NOW()), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE id=? AND gateway_id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at<=NOW()`, [req.params.id, req.gateway.id]);
    const [rows] = await connection.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),vence_at)) AS ttl_remaining_seconds
      FROM gateway_command WHERE id=? AND gateway_id=? FOR UPDATE`, [req.params.id, req.gateway.id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: "No se encontró el comando para este gateway" }); }
    const command = rows[0];
    const [assignment] = await connection.query(`SELECT id FROM gateway_node_assignment WHERE gateway_id=? AND dispositivo_id=? AND firmware_node_id=? AND activo=1 FOR UPDATE`,
      [req.gateway.id, command.dispositivo_id, command.firmware_node_id]);
    if (!assignment.length) { await connection.rollback(); return res.status(409).json({ error: "La asignación nodo↔gateway fue revocada; no se autoriza transmisión", code: "assignment_revoked", delivery_authorized: false }); }
    if (!["RECIBIDO_GATEWAY", "RECIBIDO_NODO"].includes(command.estado) || Number(command.ttl_remaining_seconds) <= 0 ||
        command.delivery_lease_id !== leaseId || command.delivery_lease_consumed_at || new Date(command.delivery_lease_expires_at).getTime() <= Date.now()) {
      await connection.rollback(); return res.status(409).json({ error: "Lease expirado, consumido o comando ya no activo; revalida antes de retransmitir" });
    }
    await connection.query(`UPDATE gateway_command SET delivery_lease_consumed_at=NOW(), delivery_attempts=delivery_attempts+1,
      attempts_radio=attempts_radio+1, last_attempt_at=NOW() WHERE id=? AND gateway_id=?`, [req.params.id, req.gateway.id]);
    const [updated] = await connection.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),vence_at)) AS ttl_remaining_seconds,
      GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),delivery_lease_expires_at)) AS lease_remaining_seconds
      FROM gateway_command WHERE id=? AND gateway_id=?`, [req.params.id, req.gateway.id]);
    await connection.commit();
    return res.json({ ...comandoPublico(updated[0]), delivery_authorized: true, radio_send_budget: 1,
      lease_seconds_remaining: Number(updated[0].lease_remaining_seconds) });
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible consumir lease de entrega:", error.message);
    return res.status(500).json({ error: "No fue posible consumir lease de entrega" });
  } finally { connection.release(); }
});

// El gateway toma comandos una sola vez y debe enviar el ACK con el mismo id.
router.get(["/queue/pending", "/v1/commands/pending"], verificarGateway, async (req, res) => {
  const limit = Math.min(25, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=NOW(), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND)) WHERE estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at <= NOW()`);
    const [rows] = await connection.query(`SELECT c.*, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),c.vence_at)) AS ttl_remaining_seconds FROM gateway_command c
      JOIN gateway_node_assignment a ON a.gateway_id=c.gateway_id AND a.dispositivo_id=c.dispositivo_id
        AND a.firmware_node_id=c.firmware_node_id AND a.activo=1
      WHERE c.gateway_id=? AND c.estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND c.vence_at > NOW()
        AND c.config_revision_target_u32 IS NOT NULL ORDER BY c.creado_at LIMIT ? FOR UPDATE SKIP LOCKED`, [req.gateway.id, limit]);
    if (rows.length) {
      await connection.query(`UPDATE gateway_command SET estado=IF(estado='EN_COLA','RECIBIDO_GATEWAY',estado),
        entregado_at=COALESCE(entregado_at,NOW()), gateway_received_at=COALESCE(gateway_received_at,NOW()),
        attempts_gateway=attempts_gateway+1, last_attempt_at=NOW() WHERE id IN (?)`, [rows.map((row) => row.id)]);
    }
    const [updatedRows] = rows.length ? await connection.query("SELECT * FROM gateway_command WHERE id IN (?)", [rows.map((row) => row.id)]) : [[]];
    await connection.commit();
    res.json(updatedRows.map(comandoPublico));
  } catch (error) {
    await connection.rollback();
    console.error("No fue posible entregar comandos al gateway:", error.message);
    res.status(500).json({ error: "No fue posible consultar la cola" });
  } finally {
    connection.release();
  }
});

router.post(["/queue/:id/ack", "/v1/commands/:id/ack"], verificarGateway, async (req, res) => {
  const ackBody = { ...req.body,
    config_revision_expected: req.body.command_config_revision_expected ?? req.body.config_revision_expected,
    config_revision_applied: req.body.command_config_revision_applied ?? req.body.config_revision_applied,
  };
  const { firmware_node_id, boot_id, seq, message, config_revision_expected, config_revision_applied } = ackBody;
  const validation = validateGatewayCommandAck(req.body);
  const stage = validation.stage;
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  try {
    const [command] = await pool.query(`SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),late_ack_expires_at)) AS late_ack_seconds_remaining
      FROM gateway_command WHERE id=? AND gateway_id=?`, [req.params.id, req.gateway.id]);
    if (!command.length) return res.status(404).json({ error: "No se encontró el comando para este gateway" });
    const expectedRevision = command[0].config_revision_expected_u32;
    if (Number(command[0].firmware_node_id) !== Number(firmware_node_id) || Number(expectedRevision) !== config_revision_expected ||
        (stage === "APPLIED" && Number(command[0].config_revision_target_u32) !== config_revision_applied)) {
      return res.status(409).json({ error: "El ACK corresponde a otro nodo o revisión de configuración" });
    }
    if (isIdempotentTerminalAck(command[0], stage)) {
      return res.json(comandoPublico(command[0]));
    }
    if (["APLICADO_NODO", "RECHAZADO_NODO", "VENCIDO", "CANCELADO"].includes(command[0].estado)) {
      return res.status(409).json({ error: "El comando ya tiene un resultado terminal distinto", estado: command[0].estado, ack_stage: command[0].ack_stage });
    }
    if (stage === "NO_CONFIRMATION_UNKNOWN") {
      await pool.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=COALESCE(expired_at,NOW()), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
        WHERE id=? AND gateway_id=? AND firmware_node_id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at<=NOW()`,
      [req.params.id, req.gateway.id, Number(firmware_node_id)]);
      const [current] = await pool.query("SELECT *, GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(),late_ack_expires_at)) AS late_ack_seconds_remaining FROM gateway_command WHERE id=? AND gateway_id=? AND firmware_node_id=?", [req.params.id, req.gateway.id, Number(firmware_node_id)]);
      if (!current.length) return res.status(404).json({ error: "No se encontró el comando" });
      if (current[0].estado !== "SIN_CONFIRMACION") return res.status(409).json({ error: "El servidor todavía considera el comando activo; no retire su copia local", estado: current[0].estado });
      if (current[0].ack_stage === "UNKNOWN_CONFIRMED") return res.json(comandoPublico(current[0]));
      await pool.query(`UPDATE gateway_command SET ack_stage='UNKNOWN_CONFIRMED', gateway_unknown_ack_at=NOW(),
        last_boot_id=COALESCE(?,last_boot_id), last_seq=COALESCE(?,last_seq)
        WHERE id=? AND gateway_id=? AND firmware_node_id=? AND estado='SIN_CONFIRMACION'`,
      [boot_id ?? null, seq === undefined || seq === null ? null : Number(seq), req.params.id, req.gateway.id, Number(firmware_node_id)]);
      const [confirmed] = await pool.query("SELECT * FROM gateway_command WHERE id=? AND gateway_id=?", [req.params.id, req.gateway.id]);
      return res.json(comandoPublico(confirmed[0]));
    }
    if (command[0].estado === "SIN_CONFIRMACION" && Number(command[0].late_ack_seconds_remaining ?? 0) <= 0) {
      return res.status(410).json({ command_id: req.params.id, result_status: "UNKNOWN", estado: "SIN_CONFIRMACION",
        late_ack_window_expired: true, gateway_queue_terminal: true, remove_reported: true });
    }
    if (stage === "RECEIVED") {
      const [result] = await pool.query(`UPDATE gateway_command SET estado='RECIBIDO_NODO', ack_stage='RECEIVED',
        node_received_at=COALESCE(node_received_at,NOW()), last_boot_id=?, last_seq=?, attempts_radio=attempts_radio+1, last_attempt_at=NOW()
        WHERE id=? AND gateway_id=? AND firmware_node_id=? AND estado IN ('RECIBIDO_GATEWAY','RECIBIDO_NODO','ENTREGADO') AND vence_at>NOW()`,
      [boot_id, Number(seq), req.params.id, req.gateway.id, Number(firmware_node_id)]);
      if (result.affectedRows) return res.json({ id: req.params.id, estado: "RECIBIDO_NODO", ack_stage: "RECEIVED" });
      return res.status(409).json({ error: "El comando no está entregado o venció antes del ACK" });
    }
    await pool.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=NOW(), late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(vence_at,INTERVAL ${COMMAND_LATE_ACK_WINDOW_SECONDS} SECOND))
      WHERE id=? AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO') AND vence_at <= NOW()`, [req.params.id]);
    const [result] = await pool.query(`UPDATE gateway_command
      SET estado=?, ack_stage=?, respuesta=?, respondido_at=NOW(), node_completed_at=NOW(), last_boot_id=?, last_seq=?, applied_config_revision_u32=?
      WHERE id=? AND gateway_id=? AND firmware_node_id=? AND estado IN ('RECIBIDO_NODO','SIN_CONFIRMACION')
        AND (vence_at > NOW() OR (estado='SIN_CONFIRMACION' AND late_ack_expires_at>NOW()))`,
    [stage === "APPLIED" ? "APLICADO_NODO" : "RECHAZADO_NODO", stage, message?.trim() || null, boot_id, Number(seq), config_revision_applied ?? null,
      req.params.id, req.gateway.id, Number(firmware_node_id)]);
    if (result.affectedRows) return res.json({ id: req.params.id, estado: stage === "APPLIED" ? "APLICADO_NODO" : "RECHAZADO_NODO", ack_stage: stage, applied_config_revision: config_revision_applied || null });

    const [rows] = await pool.query("SELECT estado FROM gateway_command WHERE id=? AND gateway_id=?", [req.params.id, req.gateway.id]);
    if (!rows.length) return res.status(404).json({ error: "No se encontró el comando" });
    if (["APLICADO_NODO", "RECHAZADO_NODO"].includes(rows[0].estado)) return res.json({ id: req.params.id, estado: rows[0].estado, duplicada: true });
    return res.status(409).json({ error: rows[0].estado === "SIN_CONFIRMACION" ? "El comando venció sin confirmación del nodo; el resultado es desconocido" : "El comando aún no fue recibido/aplicado por el nodo", estado: rows[0].estado });
  } catch (error) {
    console.error("No fue posible guardar la confirmación del gateway:", error.message);
    res.status(500).json({ error: "No fue posible registrar la respuesta" });
  }
});

export default router;
