import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const enabled = process.env.GATEWAY_API_DB_TESTS === "1";

test("gateway assignment, telemetry validation/statistics and command lifecycle persist through API+DB", { skip: !enabled }, async (t) => {
  assert.match(process.env.DB_NAME || "", /^cima_gateway_it_[a-z0-9_]+$/i, "Use a disposable DB whose name starts with cima_gateway_it_");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST), "Integration DB host must be loopback");
  process.env.JWT_SECRET = process.env.JWT_SECRET || "isolated-gateway-integration-test-secret";
  process.env.GATEWAY_API_BASE_URL = "http://gateway-api.lan/api";

  const [{ pool }, { migrate }, { seed }, expressModule, jwtModule, gatewayModule, readingsModule] = await Promise.all([
    import("../db.js"), import("../database/migrate.js"), import("../database/seed.js"), import("express"),
    import("jsonwebtoken"), import("../routes/gatewayCommands.js"), import("../routes/lecturas.js"),
  ]);
  const express = expressModule.default;
  const jwt = jwtModule.default;
  const [existingTables] = await pool.query(`SELECT COUNT(*) AS total FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE()`);
  assert.equal(Number(existingTables[0].total), 0, "Integration test requires an empty disposable database");
  const app = express();
  app.use(express.json());
  app.use("/api/gateway", gatewayModule.default);
  app.use("/api/lecturas", readingsModule.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  await migrate();
  await migrate();
  await seed();
  const adminToken = jwt.sign({ sub: "gateway-api-test" }, process.env.JWT_SECRET);
  const apiKey = `test-gateway-key-${randomUUID()}-long-enough`;
  const [gatewayInsert] = await pool.query("INSERT INTO gateway (nombre,credential_hash) VALUES (?,?)", ["isolated integration gateway", createHash("sha256").update(apiKey).digest("hex")]);
  const gatewayId = Number(gatewayInsert.insertId);
  const [nodeRows] = await pool.query("SELECT id FROM dispositivo WHERE nombre='Nodo 1' ORDER BY id LIMIT 1");
  const [node2Rows] = await pool.query("SELECT id FROM dispositivo WHERE nombre='Nodo 2' ORDER BY id LIMIT 1");
  const nodeId = Number(nodeRows[0]?.id);
  const node2Id = Number(node2Rows[0]?.id);
  assert.ok(nodeId && node2Id, "seed should create test nodes");
  const [sensorRows] = await pool.query(`SELECT s.id, s.tipo_dispositivo_id FROM sensor s
    JOIN tipo_dispositivo t ON t.id=s.tipo_dispositivo_id WHERE s.dispositivo_id=? AND t.nombre='DHT22' ORDER BY s.id LIMIT 1`, [nodeId]);
  const sensorId = Number(sensorRows[0]?.id);
  const [typeRows] = await pool.query("SELECT id FROM tipo_dato WHERE nombre='Temperatura' ORDER BY id LIMIT 1");
  const typeId = Number(typeRows[0]?.id);
  assert.ok(sensorId && typeId, "seed should create test sensor/type");

  const serverOrigin = `http://127.0.0.1:${server.address().port}`;
  const adminHeaders = { authorization: `Bearer ${adminToken}`, "content-type": "application/json" };
  const gatewayHeaders = { "x-gateway-id": String(gatewayId), "x-gateway-key": apiKey, "content-type": "application/json" };
  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(`${serverOrigin}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }

  const registeredGateway = await request("/api/gateway/v1/gateways", { method: "POST", headers: adminHeaders, body: { nombre: "provisioning URL check" } });
  assert.equal(registeredGateway.status, 201);
  assert.equal(registeredGateway.body.api_base_url, "http://gateway-api.lan/api");
  assert.ok(registeredGateway.body.api_key, "gateway registration returns its one-time credential");

  const gatewayList = await request("/api/gateway/v1/gateways", { headers: adminHeaders });
  assert.equal(gatewayList.status, 200);
  const assignmentList = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes`, { headers: adminHeaders });
  assert.equal(assignmentList.status, 200);
  const candidateReport = await request("/api/gateway/v1/discovery/candidates", { method: "POST", headers: gatewayHeaders, body: { nodes: [
    { firmware_node_id: 70002, mac_address: "24:6F:28:AA:BB:DD", wire_version: "v3", capabilities: ["dht22-1/gpio4"] },
  ] } });
  assert.equal(candidateReport.status, 202);
  assert.equal(candidateReport.body.assigned_automatically, false);
  const candidateList = await request(`/api/gateway/v1/gateways/${gatewayId}/candidates`, { headers: adminHeaders });
  assert.equal(candidateList.status, 200);
  assert.equal(candidateList.body.candidates.length, 1, "discovery remains a candidate until a human assigns it");
  assert.equal(candidateList.body.candidates[0].firmware_node_id, 70002);

  const [[revisionBeforeAssignment]] = await pool.query("SELECT config_revision FROM dispositivo WHERE id=?", [nodeId]);
  const assign = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes`, { method: "PUT", headers: adminHeaders, body: {
    nodo_id: nodeId, firmware_node_id: 70001, mac_address: "24:6F:28:AA:BB:CC", management_poll_interval_seconds: 600,
  } });
  assert.equal(assign.status, 201);
  const [[revisionAfterAssignment]] = await pool.query("SELECT config_revision FROM dispositivo WHERE id=?", [nodeId]);
  assert.equal(Number(revisionAfterAssignment.config_revision), Number(revisionBeforeAssignment.config_revision), "assignment mutation must not advance command config revision");
  const conflict = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes`, { method: "PUT", headers: adminHeaders, body: {
    nodo_id: node2Id, firmware_node_id: 70001, mac_address: "24:6F:28:AA:BB:CD", management_poll_interval_seconds: 600,
  } });
  assert.equal(conflict.status, 409);
  const crossGatewayConflict = await request(`/api/gateway/v1/gateways/${registeredGateway.body.gateway_id}/nodes`, { method: "PUT", headers: adminHeaders, body: {
    nodo_id: node2Id, firmware_node_id: 70001, mac_address: "24:6F:28:AA:BB:CE", management_poll_interval_seconds: 600,
  } });
  assert.equal(crossGatewayConflict.status, 409, "firmware identity is globally unique across active gateway assignments");
  const [[node2Assignment]] = await pool.query("SELECT COUNT(*) AS total FROM gateway_node_assignment WHERE dispositivo_id=? AND activo=1", [node2Id]);
  assert.equal(Number(node2Assignment.total), 0, "conflict rolls back without partial assignment");

  const mapSensor = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes/${nodeId}/sensors`, { method: "PUT", headers: adminHeaders, body: {
    sensor_id: sensorId, sensor_firmware_id: "dht22-1", canal: "gpio4",
  } });
  assert.equal(mapSensor.status, 201);
  const sensorMappings = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes/${nodeId}/sensors`, { headers: adminHeaders });
  assert.equal(sensorMappings.status, 200);
  assert.equal(sensorMappings.body.sensores.length, 1);
  assert.equal(Number(sensorMappings.body.sensores[0].sensor_id), sensorId);
  assert.equal(sensorMappings.body.sensores[0].sensor_firmware_id, "dht22-1");
  assert.equal(sensorMappings.body.sensores[0].canal, "gpio4");
  const [[revisionAfterSensorAssignment]] = await pool.query("SELECT config_revision FROM dispositivo WHERE id=?", [nodeId]);
  assert.equal(Number(revisionAfterSensorAssignment.config_revision), Number(revisionBeforeAssignment.config_revision), "sensor installation mapping must not advance command config revision");
  const validationPath = `/api/gateway/v1/sensors/${sensorId}/measurements/${typeId}/validation`;
  const invalidManufacturerRange = await request(validationPath, { method: "PUT", headers: adminHeaders, body: {
    unidad: "°C", installation_min: 10, installation_max: 35, manufacturer_min: 0, manufacturer_max: 80,
    calibration_status: "UNCALIBRATED",
  } });
  assert.equal(invalidManufacturerRange.status, 400, "manufacturer bounds require provenance");
  const configSave = await request(validationPath, { method: "PUT", headers: adminHeaders, body: {
    unidad: "°C", installation_min: 10, installation_max: 35, manufacturer_min: null, manufacturer_max: null,
    manufacturer_reference: null, calibration_status: "UNCALIBRATED", calibration_reference: null,
  } });
  assert.equal(configSave.status, 200);
  let manifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(manifest.status, 200);
  const manifestNode = manifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId);
  const manifestSensor = manifestNode.sensores.find((sensor) => Number(sensor.sensor_id) === sensorId);
  assert.equal(manifestSensor.mediciones[0].unidad, "°C");
  assert.equal(manifestSensor.mediciones[0].installation_limits.minimum, 10);
  assert.equal(manifestSensor.mediciones[0].manufacturer_limits.minimum, null);
  const assignmentsWithSync = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes`, { headers: adminHeaders });
  assert.equal(assignmentsWithSync.body.manifest_revision_desired, manifest.body.manifest_revision);
  assert.equal(assignmentsWithSync.body.assignment_revision_desired, manifest.body.assignment_revision);
  assert.equal(assignmentsWithSync.body.assignments.find((item) => Number(item.nodo_id) === nodeId).manifest_sync_status, "UNKNOWN");

  const heartbeatBase = {
    firmware_node_id: 70001, boot_id: "4d8b49e4-3fc4-423c-912a-58ac68219eaf", seq: 1,
    command_config_revision_applied: 0, effective_mode: "OPERATIVO",
  };
  const conflictingRevisionAliases = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, config_revision_applied: 1,
  }] } });
  assert.equal(conflictingRevisionAliases.status, 400, "legacy and canonical command revision aliases cannot disagree");
  const invalidPartialManifestRevision = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, manifest_revision_applied: manifest.body.manifest_revision,
  }] } });
  assert.equal(invalidPartialManifestRevision.status, 400, "applied manifest and assignment hashes are an atomic pair");
  const invalidManifestRevision = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, manifest_revision_applied: "not-a-sha256", assignment_revision_applied: manifest.body.assignment_revision,
  }] } });
  assert.equal(invalidManifestRevision.status, 400);
  const firstHeartbeat = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, manifest_revision_applied: manifest.body.manifest_revision.toUpperCase(),
    assignment_revision_applied: manifest.body.assignment_revision.toUpperCase(),
  }] } });
  assert.equal(firstHeartbeat.status, 200);
  const assignmentsAfterHeartbeat = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes`, { headers: adminHeaders });
  assert.equal(assignmentsAfterHeartbeat.body.assignments.find((item) => Number(item.nodo_id) === nodeId).manifest_sync_status, "CURRENT");
  const [[persistedAppliedRevisions]] = await pool.query(`SELECT manifest_revision_applied, assignment_revision_applied
    FROM gateway_node_presence WHERE gateway_id=? AND firmware_node_id=70001`, [gatewayId]);
  assert.equal(persistedAppliedRevisions.manifest_revision_applied, manifest.body.manifest_revision);
  assert.equal(persistedAppliedRevisions.assignment_revision_applied, manifest.body.assignment_revision);
  const currentManifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  const currentManifestNode = currentManifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId);
  assert.equal(currentManifestNode.manifest_sync_status, "CURRENT");
  assert.equal(currentManifestNode.manifest_revision_applied, manifest.body.manifest_revision);
  assert.equal(currentManifestNode.assignment_revision_applied, manifest.body.assignment_revision);
  const configRevisionBeforeMeasurementChange = currentManifestNode.config_revision;
  const changedMeasurementConfig = await request(validationPath, { method: "PUT", headers: adminHeaders, body: {
    unidad: "°C", installation_min: 10, installation_max: 36, manufacturer_min: null, manufacturer_max: null,
    manufacturer_reference: null, calibration_status: "UNCALIBRATED", calibration_reference: null,
  } });
  assert.equal(changedMeasurementConfig.status, 200);
  manifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  const changedManifestNode = manifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId);
  assert.notEqual(manifest.body.manifest_revision, currentManifest.body.manifest_revision, "measurement metadata changes the desired manifest hash");
  assert.equal(changedManifestNode.config_revision, configRevisionBeforeMeasurementChange, "manifest hashes are independent from command config_revision");
  assert.equal(changedManifestNode.manifest_sync_status, "OUT_OF_DATE");
  const appliedUpdatedManifest = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, seq: 2, manifest_revision_applied: manifest.body.manifest_revision,
    assignment_revision_applied: manifest.body.assignment_revision,
  }] } });
  assert.equal(appliedUpdatedManifest.status, 200);
  const updatedManifestStatus = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(updatedManifestStatus.body.nodes.find((node) => Number(node.nodo_id) === nodeId).manifest_sync_status, "CURRENT");
  const replayedHeartbeat = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, seq: 2, manifest_revision_applied: "0".repeat(64), assignment_revision_applied: "f".repeat(64),
  }] } });
  assert.equal(replayedHeartbeat.status, 409, "same-boot duplicate seq cannot overwrite applied manifest state");
  const afterReplayManifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(afterReplayManifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId).manifest_sync_status, "CURRENT");
  const legacyHeartbeat = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, seq: 3,
  }] } });
  assert.equal(legacyHeartbeat.status, 200, "legacy firmware may omit applied hash fields");
  const afterLegacyManifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(afterLegacyManifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId).manifest_sync_status, "CURRENT", "omitted legacy fields preserve last known values");
  const staleManifestHeartbeat = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, seq: 4, manifest_revision_applied: "0".repeat(64), assignment_revision_applied: "f".repeat(64),
  }] } });
  assert.equal(staleManifestHeartbeat.status, 200);
  const staleManifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(staleManifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId).manifest_sync_status, "OUT_OF_DATE");
  const clearedManifestHeartbeat = await request("/api/gateway/v1/heartbeat", { method: "POST", headers: gatewayHeaders, body: { nodes: [{
    ...heartbeatBase, seq: 5, manifest_revision_applied: null, assignment_revision_applied: null,
  }] } });
  assert.equal(clearedManifestHeartbeat.status, 200);
  const unknownManifest = await request("/api/gateway/v1/manifest", { headers: gatewayHeaders });
  assert.equal(unknownManifest.body.nodes.find((node) => Number(node.nodo_id) === nodeId).manifest_sync_status, "UNKNOWN");
  await pool.query("UPDATE dispositivo SET ultimo_heartbeat_at=DATE_SUB(NOW(),INTERVAL 10 MINUTE) WHERE id=?", [nodeId]);
  const [[heartbeatBefore]] = await pool.query("SELECT ultimo_heartbeat_at FROM dispositivo WHERE id=?", [nodeId]);
  const telemetryBase = {
    dispositivo_id: nodeId, firmware_node_id: 70001, boot_id: "4d8b49e4-3fc4-423c-912a-58ac68219eaf", seq: 2,
    sample_uptime_ms: 100000, time_quality: "SYNCED", captured_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    manifest_revision: manifest.body.manifest_revision, assignment_revision: manifest.body.assignment_revision,
  };
  const outOfRange = await request("/api/lecturas", { method: "POST", headers: gatewayHeaders, body: {
    ...telemetryBase, lecturas: [{ sensor_id: sensorId, sensor_firmware_id: "dht22-1", canal: "gpio4", tipo_dato_id: typeId, dato: 9, unidad: "°C" }],
  } });
  assert.equal(outOfRange.status, 200);
  assert.equal(outOfRange.body.items[0].reason, "outside_installation_range");
  const [[quarantine]] = await pool.query(`SELECT received_value,received_unit,validation_details FROM gateway_telemetry_rejection
    WHERE gateway_id=? AND firmware_node_id=70001 AND boot_id=? AND seq=2 AND reason='outside_installation_range' ORDER BY id DESC LIMIT 1`, [gatewayId, telemetryBase.boot_id]);
  assert.equal(Number(quarantine.received_value), 9);
  assert.equal(quarantine.received_unit, "°C");
  const quarantineDetails = typeof quarantine.validation_details === "string" ? JSON.parse(quarantine.validation_details) : quarantine.validation_details;
  assert.equal(Number(quarantineDetails.bounds.installation_min), 10);
  const [[heartbeatAfter]] = await pool.query("SELECT ultimo_heartbeat_at FROM dispositivo WHERE id=?", [nodeId]);
  assert.equal(new Date(heartbeatAfter.ultimo_heartbeat_at).getTime(), new Date(heartbeatBefore.ultimo_heartbeat_at).getTime(), "telemetry does not refresh heartbeat");

  const oldCaptured = await request("/api/lecturas", { method: "POST", headers: gatewayHeaders, body: {
    ...telemetryBase, seq: 3, lecturas: [{ sensor_id: sensorId, sensor_firmware_id: "dht22-1", canal: "gpio4", tipo_dato_id: typeId, dato: 30, unidad: "°C" }],
  } });
  assert.equal(oldCaptured.status, 201);
  const latest = await request(`/api/lecturas/ultimas?dispositivo_id=${nodeId}`);
  assert.ok(latest.body.datos.some((item) => Number(item.sensor_id) === sensorId && item.captured_at));
  const latestKeys = latest.body.datos.map((item) => `${item.sensor_id ?? "legacy"}:${item.tipo_dato}`);
  assert.equal(new Set(latestKeys).size, latestKeys.length, "latest readings are unique by physical sensor and type");
  const stats = await request("/api/lecturas/promedio");
  assert.equal(stats.body.schema_version, 2);
  assert.ok(Array.isArray(stats.body.datos), "legacy global alias remains for Inicio");
  assert.ok(stats.body.global.scope.includes("global"));
  assert.ok(Array.isArray(stats.body.por_sensor.datos));
  assert.ok(!stats.body.por_sensor.datos.some((item) => Number(item.sensor_id) === sensorId), "old captured sample is excluded from the recent window");
  const temperatureGroups = stats.body.por_sensor.datos.filter((item) => Number(item.tipo_dato_id) === typeId);
  assert.ok(new Set(temperatureGroups.map((item) => Number(item.dispositivo_id))).size > 1, "per-sensor response keeps node scopes separate");

  const commandPath = "/api/gateway/commands";
  const commandPayload = { nodo_id: nodeId, tipo: "CONFIGURAR_NODO", payload: { interval: 600 }, idempotency_key: randomUUID() };
  const created = await request(commandPath, { method: "POST", headers: adminHeaders, body: commandPayload });
  assert.equal(created.status, 202);
  assert.equal(created.body.estado, "EN_COLA");
  const retryCreate = await request(commandPath, { method: "POST", headers: adminHeaders, body: commandPayload });
  assert.equal(retryCreate.body.command_id, created.body.command_id);
  const pending = await request("/api/gateway/v1/commands/pending", { headers: gatewayHeaders });
  assert.ok(pending.body.some((command) => command.command_id === created.body.command_id));
  const commandId = created.body.command_id;
  const lease = await request(`/api/gateway/v1/commands/${commandId}/lease`, { method: "POST", headers: gatewayHeaders, body: {} });
  const sameLease = await request(`/api/gateway/v1/commands/${commandId}/lease`, { method: "POST", headers: gatewayHeaders, body: {} });
  assert.equal(sameLease.body.delivery_lease_id, lease.body.delivery_lease_id);
  const dispatch = await request(`/api/gateway/v1/commands/${commandId}/dispatch`, { method: "POST", headers: gatewayHeaders, body: { delivery_lease_id: lease.body.delivery_lease_id } });
  assert.equal(dispatch.body.delivery_authorized, true);
  assert.equal(dispatch.body.radio_send_budget, 1);
  const duplicateDispatch = await request(`/api/gateway/v1/commands/${commandId}/dispatch`, { method: "POST", headers: gatewayHeaders, body: { delivery_lease_id: lease.body.delivery_lease_id } });
  assert.equal(duplicateDispatch.status, 409);
  await pool.query("UPDATE gateway_command SET vence_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?", [commandId]);
  const expiredStatus = await request(`/api/gateway/v1/commands/${commandId}/status`, { headers: gatewayHeaders });
  assert.equal(expiredStatus.body.estado, "SIN_CONFIRMACION");
  const unknownAckBody = { firmware_node_id: 70001, config_revision_expected: created.body.config_revision_expected, stage: "NO_CONFIRMATION_UNKNOWN" };
  const unknownAck = await request(`/api/gateway/v1/commands/${commandId}/ack`, { method: "POST", headers: gatewayHeaders, body: unknownAckBody });
  assert.equal(unknownAck.status, 200);
  assert.equal(unknownAck.body.remove_reported, true);
  assert.equal(unknownAck.body.result_status, "UNKNOWN");
  const duplicateUnknownAck = await request(`/api/gateway/v1/commands/${commandId}/ack`, { method: "POST", headers: gatewayHeaders, body: { ...unknownAckBody, boot_id: null, seq: null } });
  assert.equal(duplicateUnknownAck.status, 200);
  const [[unknownRow]] = await pool.query("SELECT estado,ack_stage,attempts_radio,late_ack_expires_at FROM gateway_command WHERE id=?", [commandId]);
  assert.equal(unknownRow.estado, "SIN_CONFIRMACION");
  assert.equal(unknownRow.ack_stage, "UNKNOWN_CONFIRMED");
  assert.equal(Number(unknownRow.attempts_radio), 1, "UNKNOWN HTTP ACK is not a radio attempt");
  await pool.query("UPDATE gateway_command SET late_ack_expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?", [commandId]);
  const finalStatus = await request(`/api/gateway/v1/commands/${commandId}/status`, { headers: gatewayHeaders });
  assert.equal(finalStatus.body.result_unknown_final, true);
  assert.equal(finalStatus.body.remove_reported, true);
  const lateAck = await request(`/api/gateway/v1/commands/${commandId}/ack`, { method: "POST", headers: gatewayHeaders, body: {
    firmware_node_id: 70001, config_revision_expected: created.body.config_revision_expected, stage: "APPLIED",
    config_revision_applied: created.body.config_revision_target, boot_id: "4d8b49e4-3fc4-423c-912a-58ac68219eaf", seq: 80,
  } });
  assert.equal(lateAck.status, 410);
  assert.equal(lateAck.body.remove_reported, true);
  const [[stillUnknown]] = await pool.query("SELECT estado,ack_stage FROM gateway_command WHERE id=?", [commandId]);
  assert.equal(stillUnknown.estado, "SIN_CONFIRMACION");
  assert.equal(stillUnknown.ack_stage, "UNKNOWN_CONFIRMED");

  const secondCommand = await request(commandPath, { method: "POST", headers: adminHeaders, body: {
    nodo_id: nodeId, tipo: "CONFIGURAR_NODO", payload: { interval: 900 }, idempotency_key: randomUUID(),
  } });
  assert.equal(secondCommand.status, 202);
  await request("/api/gateway/v1/commands/pending", { headers: gatewayHeaders });
  const receivedAckBody = { firmware_node_id: 70001, config_revision_expected: secondCommand.body.config_revision_expected,
    stage: "RECEIVED", boot_id: telemetryBase.boot_id, seq: 10 };
  const receivedAck = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/ack`, { method: "POST", headers: gatewayHeaders, body: receivedAckBody });
  assert.equal(receivedAck.status, 200);
  const nodeReceivedStatus = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/status`, { headers: gatewayHeaders });
  assert.equal(nodeReceivedStatus.body.estado, "RECIBIDO_NODO");
  const secondLease = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/lease`, { method: "POST", headers: gatewayHeaders, body: {} });
  const secondDispatch = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/dispatch`, { method: "POST", headers: gatewayHeaders, body: { delivery_lease_id: secondLease.body.delivery_lease_id } });
  assert.equal(secondDispatch.body.delivery_authorized, true);
  const appliedAckBody = { firmware_node_id: 70001, config_revision_expected: secondCommand.body.config_revision_expected,
    config_revision_applied: secondCommand.body.config_revision_target, stage: "APPLIED", boot_id: telemetryBase.boot_id, seq: 11 };
  const appliedAck = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/ack`, { method: "POST", headers: gatewayHeaders, body: appliedAckBody });
  assert.equal(appliedAck.status, 200);
  assert.equal(appliedAck.body.estado, "APLICADO_NODO");
  const duplicateAppliedAck = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/ack`, { method: "POST", headers: gatewayHeaders, body: appliedAckBody });
  assert.equal(duplicateAppliedAck.status, 200);
  const conflictingTerminalAck = await request(`/api/gateway/v1/commands/${secondCommand.body.command_id}/ack`, { method: "POST", headers: gatewayHeaders, body: {
    firmware_node_id: 70001, config_revision_expected: secondCommand.body.config_revision_expected,
    stage: "REJECTED", message: "contradictory retry", boot_id: telemetryBase.boot_id, seq: 12,
  } });
  assert.equal(conflictingTerminalAck.status, 409);

  const thirdCommand = await request(commandPath, { method: "POST", headers: adminHeaders, body: {
    nodo_id: nodeId, tipo: "CONFIGURAR_NODO", payload: { interval: 1200 }, idempotency_key: randomUUID(),
  } });
  assert.equal(thirdCommand.status, 202);
  await request("/api/gateway/v1/commands/pending", { headers: gatewayHeaders });
  const thirdLease = await request(`/api/gateway/v1/commands/${thirdCommand.body.command_id}/lease`, { method: "POST", headers: gatewayHeaders, body: {} });
  const revoked = await request(`/api/gateway/v1/gateways/${gatewayId}/nodes/${nodeId}`, { method: "DELETE", headers: adminHeaders });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.historical_assignment_preserved, true);
  const revokedDispatch = await request(`/api/gateway/v1/commands/${thirdCommand.body.command_id}/dispatch`, { method: "POST", headers: gatewayHeaders, body: { delivery_lease_id: thirdLease.body.delivery_lease_id } });
  assert.equal(revokedDispatch.status, 409);
  assert.equal(revokedDispatch.body.code, "assignment_revoked");
  const pendingAfterRevoke = await request("/api/gateway/v1/commands/pending", { headers: gatewayHeaders });
  assert.equal(pendingAfterRevoke.body.some((command) => command.command_id === thirdCommand.body.command_id), false);
  const [[assignmentHistory]] = await pool.query("SELECT activo,vigente_hasta FROM gateway_node_assignment WHERE id=?", [assign.body.asignacion_id]);
  assert.equal(Number(assignmentHistory.activo), 0);
  assert.ok(assignmentHistory.vigente_hasta);
});
