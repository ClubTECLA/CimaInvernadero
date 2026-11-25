import { createHash } from "node:crypto";

// Keep this snapshot shape and ordering aligned with GET /v1/manifest.
export async function calculateGatewayAssignmentRevision(connection, gatewayId) {
  const [nodes] = await connection.query(`SELECT dispositivo_id AS nodo_id, firmware_node_id, mac_address
    FROM gateway_node_assignment WHERE gateway_id=? AND activo=1 ORDER BY firmware_node_id`, [gatewayId]);
  const snapshot = [];
  for (const node of nodes) {
    const [sensors] = await connection.query(`SELECT s.id AS sensor_id, ns.sensor_firmware_id, ns.canal
      FROM nodo_sensor ns JOIN sensor s ON s.id=ns.sensor_id
      WHERE ns.dispositivo_id=? AND ns.activo=1 ORDER BY ns.canal, s.id`, [node.nodo_id]);
    snapshot.push({
      nodo_id: node.nodo_id,
      firmware_node_id: node.firmware_node_id,
      mac_address: node.mac_address,
      sensores: sensors.map((sensor) => ({
        sensor_id: sensor.sensor_id,
        sensor_firmware_id: sensor.sensor_firmware_id,
        canal: sensor.canal,
      })),
    });
  }
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// Keep this manifest snapshot shape/order aligned with GET /v1/manifest.
export async function calculateGatewayManifestRevision(connection, gatewayId) {
  const [nodes] = await connection.query(`SELECT a.dispositivo_id AS nodo_id,a.firmware_node_id,a.mac_address,
    d.estado AS estado_administrativo,d.intervalo_lectura_segundos,d.management_poll_interval_seconds
    FROM gateway_node_assignment a JOIN dispositivo d ON d.id=a.dispositivo_id
    WHERE a.gateway_id=? AND a.activo=1 ORDER BY a.firmware_node_id`, [gatewayId]);
  const snapshot = [];
  for (const node of nodes) {
    const [sensors] = await connection.query(`SELECT s.id AS sensor_id,ns.sensor_firmware_id,ns.canal,
      CASE WHEN s.estado='ACTIVO' THEN 'OPERATIVO' ELSE s.estado END AS estado_administrativo,
      s.tipo_dispositivo_id FROM nodo_sensor ns JOIN sensor s ON s.id=ns.sensor_id
      WHERE ns.dispositivo_id=? AND ns.activo=1 ORDER BY ns.canal,s.id`, [node.nodo_id]);
    const sensorSnapshot = [];
    for (const sensor of sensors) {
      const [measurements] = await connection.query(`SELECT td.id AS tipo_dato_id,td.nombre AS tipo_dato,td.unidad,
        c.installation_min,c.installation_max,c.manufacturer_min,c.manufacturer_max,c.manufacturer_reference,
        COALESCE(c.calibration_status,'NOT_RECORDED') AS calibration_status,c.calibration_reference,c.calibrated_at
        FROM tipo_dispositivo_tipo_dato m JOIN tipo_dato td ON td.id=m.tipo_dato_id
        LEFT JOIN sensor_measurement_config c ON c.sensor_id=? AND c.tipo_dato_id=td.id
        WHERE m.tipo_dispositivo_id=? ORDER BY td.id`, [sensor.sensor_id,sensor.tipo_dispositivo_id]);
      sensorSnapshot.push({
        sensor_id: sensor.sensor_id,
        sensor_firmware_id: sensor.sensor_firmware_id,
        canal: sensor.canal,
        estado_administrativo: sensor.estado_administrativo,
        estado: sensor.estado_administrativo,
        tipo_dato_ids: measurements.map((measurement) => Number(measurement.tipo_dato_id)),
        mediciones: measurements.map((measurement) => ({
          tipo_dato_id: Number(measurement.tipo_dato_id),tipo_dato: measurement.tipo_dato,unidad: measurement.unidad,
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
    snapshot.push({
      nodo_id: node.nodo_id,
      firmware_node_id: node.firmware_node_id,mac_address: node.mac_address,
      estado_administrativo: node.estado_administrativo,
      intervalo_lectura_segundos: node.intervalo_lectura_segundos,
      management_poll_interval_seconds: node.management_poll_interval_seconds,
      sensores: sensorSnapshot,
    });
  }
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
