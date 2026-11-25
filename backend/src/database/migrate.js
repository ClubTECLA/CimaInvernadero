import { pool } from "../db.js";

export async function migrate() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS especificaciones (
        id     INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        largo  FLOAT COMMENT 'Distancia desde la entrada hacia adentro (metros)',
        ancho  FLOAT COMMENT 'Distancia desde la izquierda hacia la derecha (metros)',
        altura FLOAT COMMENT 'Altura desde el suelo (metros)'
      )
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ubicacion (
        id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        largo DECIMAL(8,3) NOT NULL,
        ancho DECIMAL(8,3) NOT NULL,
        altura DECIMAL(8,3) NOT NULL,
        descripcion VARCHAR(500) NULL,
        image_path VARCHAR(255) NULL,
        map_image_path VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await connection.query("ALTER TABLE ubicacion MODIFY COLUMN largo DECIMAL(8,2) NOT NULL, MODIFY COLUMN ancho DECIMAL(8,2) NOT NULL, MODIFY COLUMN altura DECIMAL(8,2) NOT NULL");
    const [imagenPlanoColumna] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ubicacion' AND COLUMN_NAME = 'map_image_path'");
    if (!imagenPlanoColumna.length) await connection.query("ALTER TABLE ubicacion ADD COLUMN map_image_path VARCHAR(255) NULL AFTER image_path");
    await connection.query(`
      INSERT INTO ubicacion (id, nombre, largo, ancho, altura, descripcion, image_path)
      SELECT 1, 'Invernadero', 9.700, 6.720, 2.550,
             'Ubicación principal del proyecto', NULL
      WHERE NOT EXISTS (SELECT 1 FROM ubicacion WHERE id = 1)
    `);

    await connection.query(`
      INSERT INTO especificaciones (id, largo, ancho, altura)
      SELECT 1, -10, -10, -10
      WHERE NOT EXISTS (SELECT 1 FROM especificaciones WHERE id = 1)
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS zona (
        id   INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        ubicacion_id INT NULL,
        zona VARCHAR(255),
        descripcion VARCHAR(500) NULL,
        image_path VARCHAR(255) NULL,
        largo_inicio DECIMAL(8,3) NULL,
        largo_fin DECIMAL(8,3) NULL,
        ancho_inicio DECIMAL(8,3) NULL,
        ancho_fin DECIMAL(8,3) NULL,
        altura_inicio DECIMAL(8,3) NULL,
        altura_fin DECIMAL(8,3) NULL
      )
    `);

    const columnasZona = [
      ["ubicacion_id", "INT NULL"],
      ["descripcion", "VARCHAR(500) NULL"],
      ["image_path", "VARCHAR(255) NULL"],
      ["largo_inicio", "DECIMAL(8,3) NULL"],
      ["largo_fin", "DECIMAL(8,3) NULL"],
      ["ancho_inicio", "DECIMAL(8,3) NULL"],
      ["ancho_fin", "DECIMAL(8,3) NULL"],
      ["altura_inicio", "DECIMAL(8,3) NULL"],
      ["altura_fin", "DECIMAL(8,3) NULL"],
    ];
    for (const [nombre, tipo] of columnasZona) {
      const [columnas] = await connection.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zona' AND COLUMN_NAME = ?`,
        [nombre],
      );
      if (columnas.length === 0) {
        await connection.query(`ALTER TABLE zona ADD COLUMN ${nombre} ${tipo}`);
      }
    }

    await connection.query("UPDATE zona SET ubicacion_id = 1 WHERE ubicacion_id IS NULL");
    await connection.query("ALTER TABLE zona MODIFY COLUMN ubicacion_id INT NOT NULL");
    const [zonaFk] = await connection.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zona'
        AND COLUMN_NAME = 'ubicacion_id' AND REFERENCED_TABLE_NAME = 'ubicacion'
    `);
    if (!zonaFk.length) {
      await connection.query("ALTER TABLE zona ADD CONSTRAINT fk_zona_ubicacion FOREIGN KEY (ubicacion_id) REFERENCES ubicacion(id) ON DELETE CASCADE");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tipo_dispositivo (
        id          INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        nombre      VARCHAR(255),
        categoria   ENUM('SENSOR', 'ACTUADOR') NOT NULL DEFAULT 'SENSOR',
        descripcion VARCHAR(255),
        image_path  VARCHAR(255)
      )
    `);

    const [categoriaTipo] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tipo_dispositivo' AND COLUMN_NAME = 'categoria'`);
    if (!categoriaTipo.length) await connection.query("ALTER TABLE tipo_dispositivo ADD COLUMN categoria ENUM('SENSOR', 'ACTUADOR') NOT NULL DEFAULT 'SENSOR' AFTER nombre");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tipo_dato (
        id     INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        nombre VARCHAR(255),
        unidad VARCHAR(100)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS proposito (
        id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        nombre VARCHAR(255) NOT NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS dispositivo (
        id        INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        specs_id  INT,
        zona_id   INT NOT NULL,
        tipo_id   INT NULL,
        estado    ENUM('OPERATIVO', 'INACTIVO', 'EN MANTENIMIENTO', 'FALLANDO'),
        nombre    VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_dispositivo_specs FOREIGN KEY (specs_id) REFERENCES especificaciones(id),
        CONSTRAINT fk_dispositivo_zona  FOREIGN KEY (zona_id)  REFERENCES zona(id),
        CONSTRAINT fk_dispositivo_tipo  FOREIGN KEY (tipo_id)  REFERENCES tipo_dispositivo(id)
      )
    `);

    await connection.query("ALTER TABLE dispositivo MODIFY COLUMN tipo_id INT NULL");

    const [columnaZonaDispositivo] = await connection.query(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispositivo' AND COLUMN_NAME = 'zona_id'`,
    );
    if (columnaZonaDispositivo[0]?.IS_NULLABLE === "NO") {
      await connection.query("ALTER TABLE dispositivo MODIFY COLUMN zona_id INT NULL");
    }

    await connection.query(`
      UPDATE dispositivo d
      JOIN zona z ON z.id = d.zona_id
      SET d.zona_id = NULL
      WHERE LOWER(TRIM(z.zona)) = 'sin zona'
    `);
    await connection.query("DELETE FROM zona WHERE LOWER(TRIM(zona)) = 'sin zona'");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS lecturas (
        id            INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        dato          FLOAT,
        dispositivo_id INT NOT NULL,
        tipo_dato_id   INT NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_lectura_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id),
        CONSTRAINT fk_lectura_tipo_dato   FOREIGN KEY (tipo_dato_id)   REFERENCES tipo_dato(id)
      )
    `);

    const [bateriaLecturaExiste] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lecturas' AND COLUMN_NAME='bateria_porcentaje'",
    );
    if (!bateriaLecturaExiste.length) {
      await connection.query("ALTER TABLE lecturas ADD COLUMN bateria_porcentaje DECIMAL(5,2) NULL");
    }

    await connection.query(`CREATE TABLE IF NOT EXISTS tipo_dispositivo_tipo_dato (
      tipo_dispositivo_id INT NOT NULL, tipo_dato_id INT NOT NULL,
      PRIMARY KEY (tipo_dispositivo_id, tipo_dato_id),
      CONSTRAINT fk_tipo_dato_dispositivo_tipo FOREIGN KEY (tipo_dispositivo_id) REFERENCES tipo_dispositivo(id) ON DELETE CASCADE,
      CONSTRAINT fk_tipo_dato_dispositivo_dato FOREIGN KEY (tipo_dato_id) REFERENCES tipo_dato(id) ON DELETE RESTRICT
    )`);
    await connection.query(`INSERT IGNORE INTO tipo_dispositivo_tipo_dato (tipo_dispositivo_id,tipo_dato_id)
      SELECT t.id,d.id FROM tipo_dispositivo t JOIN tipo_dato d
      WHERE t.nombre IN ('DHT11','DHT22') AND d.nombre IN ('Temperatura','Humedad')`);
    await connection.query(`CREATE TABLE IF NOT EXISTS sensor (
      id INT AUTO_INCREMENT PRIMARY KEY, dispositivo_id INT NOT NULL, tipo_dispositivo_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL, estado ENUM('OPERATIVO','INACTIVO','EN MANTENIMIENTO','FALLANDO') NOT NULL DEFAULT 'OPERATIVO',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sensor_nodo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE CASCADE,
      CONSTRAINT fk_sensor_tipo FOREIGN KEY (tipo_dispositivo_id) REFERENCES tipo_dispositivo(id) ON DELETE RESTRICT,
      INDEX idx_sensor_nodo (dispositivo_id)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS actuador (
      id INT AUTO_INCREMENT PRIMARY KEY, dispositivo_id INT NOT NULL, tipo_dispositivo_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL, estado ENUM('OPERATIVO','INACTIVO','EN MANTENIMIENTO','FALLANDO') NOT NULL DEFAULT 'OPERATIVO',
      encendido TINYINT(1) NOT NULL DEFAULT 0, control_automatico_activo TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_actuador_nodo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE CASCADE,
      CONSTRAINT fk_actuador_tipo FOREIGN KEY (tipo_dispositivo_id) REFERENCES tipo_dispositivo(id) ON DELETE RESTRICT,
      INDEX idx_actuador_nodo (dispositivo_id)
    )`);

    const [sensorStateColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor' AND COLUMN_NAME='identificador_fisico'`);
    if (!sensorStateColumn.length) await connection.query(`ALTER TABLE sensor ADD COLUMN identificador_fisico VARCHAR(255) NULL`);
    const [sensorSerialColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor' AND COLUMN_NAME='numero_serie'`);
    if (!sensorSerialColumn.length) await connection.query(`ALTER TABLE sensor ADD COLUMN numero_serie VARCHAR(255) NULL`);
    const [sensorDescriptionColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor' AND COLUMN_NAME='descripcion'`);
    if (!sensorDescriptionColumn.length) await connection.query(`ALTER TABLE sensor ADD COLUMN descripcion VARCHAR(500) NULL`);
    await connection.query(`CREATE TABLE IF NOT EXISTS nodo_sensor (
      id INT AUTO_INCREMENT PRIMARY KEY, dispositivo_id INT NOT NULL, sensor_id INT NOT NULL,
      sensor_firmware_id VARCHAR(100) NULL,
      canal VARCHAR(100) NOT NULL, instalado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      retirado_en DATETIME NULL, activo BOOLEAN NOT NULL DEFAULT TRUE, notas VARCHAR(500) NULL,
      CONSTRAINT fk_nodo_sensor_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
      CONSTRAINT fk_nodo_sensor_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE RESTRICT,
      INDEX idx_nodo_sensor_dispositivo (dispositivo_id), INDEX idx_nodo_sensor_sensor (sensor_id),
      INDEX idx_nodo_sensor_activo (activo), INDEX idx_nodo_sensor_historial (dispositivo_id, canal, retirado_en)
    )`);
    const [sensorFirmwareSlotCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nodo_sensor' AND COLUMN_NAME='sensor_firmware_id'`);
    if (!sensorFirmwareSlotCol.length) await connection.query(`ALTER TABLE nodo_sensor ADD COLUMN sensor_firmware_id VARCHAR(100) NULL AFTER sensor_id`);
    await connection.query(`CREATE TABLE IF NOT EXISTS sensor_measurement_config (
      sensor_id INT NOT NULL, tipo_dato_id INT NOT NULL,
      installation_min DECIMAL(18,6) NULL, installation_max DECIMAL(18,6) NULL,
      manufacturer_min DECIMAL(18,6) NULL, manufacturer_max DECIMAL(18,6) NULL,
      manufacturer_reference VARCHAR(500) NULL,
      calibration_status ENUM('NOT_RECORDED','UNCALIBRATED','CALIBRATED') NOT NULL DEFAULT 'NOT_RECORDED',
      calibration_reference VARCHAR(500) NULL, calibrated_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (sensor_id,tipo_dato_id),
      CONSTRAINT fk_sensor_measurement_config_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE RESTRICT,
      CONSTRAINT fk_sensor_measurement_config_type FOREIGN KEY (tipo_dato_id) REFERENCES tipo_dato(id) ON DELETE RESTRICT
    )`);
    const [lecturaSensorColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lecturas' AND COLUMN_NAME='sensor_id'`);
    if (!lecturaSensorColumn.length) await connection.query(`ALTER TABLE lecturas ADD COLUMN sensor_id INT NULL AFTER tipo_dato_id`);
    const [lecturaSensorFk] = await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lecturas' AND COLUMN_NAME='sensor_id' AND REFERENCED_TABLE_NAME='sensor'`);
    if (!lecturaSensorFk.length) await connection.query(`ALTER TABLE lecturas ADD CONSTRAINT fk_lectura_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE SET NULL`);
    const [capturedAtColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lecturas' AND COLUMN_NAME='captured_at'`);
    if (!capturedAtColumn.length) await connection.query(`ALTER TABLE lecturas ADD COLUMN captured_at DATETIME NULL`);
    const [sampleUptimeColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lecturas' AND COLUMN_NAME='sample_uptime_ms'`);
    if (!sampleUptimeColumn.length) await connection.query(`ALTER TABLE lecturas ADD COLUMN sample_uptime_ms BIGINT UNSIGNED NULL`);
    await connection.query(`UPDATE lecturas SET captured_at=created_at WHERE captured_at IS NULL`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway (
      id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(120) NOT NULL,
      credential_hash CHAR(64) NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1,
      creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_gateway_activo (activo)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_telemetry_dedupe (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, gateway_id INT NOT NULL, firmware_node_id INT UNSIGNED NOT NULL,
      boot_id CHAR(36) NOT NULL, seq INT UNSIGNED NOT NULL, sensor_id INT NOT NULL,
      tipo_dato_id INT NOT NULL, manifest_revision CHAR(64) NULL, assignment_revision CHAR(64) NULL,
      lectura_id INT NOT NULL, recibido_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_telemetry_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
      CONSTRAINT fk_telemetry_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE RESTRICT,
      CONSTRAINT fk_telemetry_reading FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE CASCADE,
      UNIQUE KEY uq_telemetry_sample (gateway_id, firmware_node_id, boot_id, seq, sensor_id, tipo_dato_id)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_telemetry_rejection (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, gateway_id INT NOT NULL, dispositivo_id INT NOT NULL,
      firmware_node_id INT UNSIGNED NOT NULL, boot_id CHAR(36) NOT NULL, seq INT UNSIGNED NOT NULL,
      sensor_id INT NULL, sensor_firmware_id VARCHAR(100) NULL, canal VARCHAR(100) NULL,
      tipo_dato_id INT NULL, received_value DECIMAL(18,6) NULL, received_unit VARCHAR(100) NULL,
      validation_details JSON NULL, reason VARCHAR(64) NOT NULL, manifest_revision CHAR(64) NULL,
      assignment_revision CHAR(64) NULL, recibido_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_rejection_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
      CONSTRAINT fk_rejection_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
      INDEX idx_rejection_sample (gateway_id, firmware_node_id, boot_id, seq)
    )`);
    for (const [column, definition] of [
      ["received_value", "DECIMAL(18,6) NULL"], ["received_unit", "VARCHAR(100) NULL"], ["validation_details", "JSON NULL"],
    ]) {
      const [exists] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_telemetry_rejection' AND COLUMN_NAME=?`, [column]);
      if (!exists.length) await connection.query(`ALTER TABLE gateway_telemetry_rejection ADD COLUMN ${column} ${definition}`);
    }
    for (const [table, column] of [
      ["gateway_telemetry_dedupe", "manifest_revision"],
      ["gateway_telemetry_dedupe", "assignment_revision"],
      ["gateway_telemetry_rejection", "manifest_revision"],
      ["gateway_telemetry_rejection", "assignment_revision"],
    ]) {
      const [exists] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`, [table, column]);
      if (!exists.length) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} CHAR(64) NULL`);
    }
    const [legacyDeviceColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor' AND COLUMN_NAME='dispositivo_id'`);
    if (legacyDeviceColumn.length) {
      const [legacyAssignments] = await connection.query(`SELECT s.id, s.dispositivo_id FROM sensor s LEFT JOIN nodo_sensor ns ON ns.sensor_id=s.id AND ns.activo=1 WHERE s.dispositivo_id IS NOT NULL AND ns.id IS NULL`);
      for (const sensor of legacyAssignments) await connection.query(`INSERT INTO nodo_sensor (dispositivo_id, sensor_id, sensor_firmware_id, canal, notas) VALUES (?, ?, ?, ?, 'Migración de asignación heredada')`, [sensor.dispositivo_id, sensor.id, `legacy-${sensor.id}`, `legacy-${sensor.id}`]);
    }

    await connection.query(`UPDATE dispositivo d
      JOIN tipo_dispositivo t ON t.id = d.tipo_id
      SET d.tipo_id = NULL
      WHERE t.categoria = 'NODO'`);
    await connection.query(`UPDATE tipo_dispositivo t SET categoria = 'SENSOR'
      WHERE t.categoria = 'NODO' AND EXISTS (SELECT 1 FROM sensor s WHERE s.tipo_dispositivo_id = t.id)`);
    await connection.query(`UPDATE tipo_dispositivo t SET categoria = 'ACTUADOR'
      WHERE t.categoria = 'NODO' AND EXISTS (SELECT 1 FROM actuador a WHERE a.tipo_dispositivo_id = t.id)`);
    await connection.query("DELETE FROM tipo_dispositivo WHERE categoria = 'NODO'");
    await connection.query("ALTER TABLE tipo_dispositivo MODIFY COLUMN categoria ENUM('SENSOR', 'ACTUADOR') NOT NULL DEFAULT 'SENSOR'");

    await connection.query(`CREATE TABLE IF NOT EXISTS actuador_regla (
      id INT AUTO_INCREMENT PRIMARY KEY, actuador_id INT NOT NULL, sensor_id INT NOT NULL, tipo_dato_id INT NOT NULL,
      valor_minimo DECIMAL(12,4) NOT NULL, valor_maximo DECIMAL(12,4) NOT NULL,
      modo ENUM('ACTIVAR_DEBAJO','ACTIVAR_ENCIMA') NOT NULL DEFAULT 'ACTIVAR_DEBAJO',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_regla_actuador FOREIGN KEY (actuador_id) REFERENCES actuador(id) ON DELETE CASCADE,
      CONSTRAINT fk_regla_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE CASCADE,
      CONSTRAINT fk_regla_dato FOREIGN KEY (tipo_dato_id) REFERENCES tipo_dato(id) ON DELETE RESTRICT,
      UNIQUE KEY uq_regla_actuador_sensor_dato (actuador_id,sensor_id,tipo_dato_id)
    )`);

    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_command (
      id CHAR(36) PRIMARY KEY,
      idempotency_key CHAR(36) NOT NULL UNIQUE,
      dispositivo_id INT NOT NULL,
      tipo VARCHAR(64) NOT NULL,
      payload JSON NOT NULL,
      estado ENUM('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO','APLICADO_NODO','RECHAZADO_NODO','SIN_CONFIRMACION','CANCELADO','CONFIRMADO','FALLIDO','VENCIDO') NOT NULL DEFAULT 'EN_COLA',
      respuesta VARCHAR(500) NULL,
      vence_at DATETIME NOT NULL,
      creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      entregado_at DATETIME NULL,
      respondido_at DATETIME NULL,
      CONSTRAINT fk_gateway_command_nodo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE CASCADE,
      INDEX idx_gateway_command_queue (estado, creado_at),
      INDEX idx_gateway_command_node (dispositivo_id, creado_at)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_node_assignment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gateway_id INT NOT NULL,
      dispositivo_id INT NOT NULL,
      firmware_node_id INT UNSIGNED NOT NULL,
      mac_address CHAR(17) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      nodo_activo_id INT GENERATED ALWAYS AS (IF(activo = 1, dispositivo_id, NULL)) STORED,
      mac_activa CHAR(17) GENERATED ALWAYS AS (IF(activo = 1, mac_address, NULL)) STORED,
      firmware_id_activo INT UNSIGNED GENERATED ALWAYS AS (IF(activo = 1, firmware_node_id, NULL)) STORED,
      vigente_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      vigente_hasta DATETIME NULL,
      CONSTRAINT fk_gateway_assignment_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
      CONSTRAINT fk_gateway_assignment_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
      UNIQUE KEY uq_gateway_firmware_node (gateway_id, firmware_id_activo),
      UNIQUE KEY uq_gateway_node_active (nodo_activo_id),
      UNIQUE KEY uq_gateway_mac_active (mac_activa),
      INDEX idx_gateway_assignment_manifest (gateway_id, activo)
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_discovery_candidate (
      gateway_id INT NOT NULL, firmware_node_id INT UNSIGNED NOT NULL, mac_address CHAR(17) NOT NULL,
      boot_id CHAR(36) NULL, wire_version VARCHAR(32) NULL, firmware_version VARCHAR(64) NULL,
      capabilities JSON NULL, first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (gateway_id, firmware_node_id, mac_address),
      CONSTRAINT fk_gateway_candidate_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
      INDEX idx_gateway_candidate_seen (gateway_id, last_seen_at)
    )`);
    const [activeFirmwareDuplicates] = await connection.query(`SELECT firmware_node_id,COUNT(*) AS total
      FROM gateway_node_assignment WHERE activo=1 GROUP BY firmware_node_id HAVING COUNT(*)>1 LIMIT 1`);
    if (activeFirmwareDuplicates.length) throw new Error(`Conflicto de inventario: firmware_node_id ${activeFirmwareDuplicates[0].firmware_node_id} tiene más de una asignación activa; resuélvelo explícitamente antes de imponer unicidad global`);
    const [globalFirmwareColumn] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_assignment' AND COLUMN_NAME='firmware_id_global_activo'`);
    if (!globalFirmwareColumn.length) await connection.query(`ALTER TABLE gateway_node_assignment ADD COLUMN firmware_id_global_activo INT UNSIGNED GENERATED ALWAYS AS (IF(activo=1,firmware_node_id,NULL)) STORED`);
    const [globalFirmwareIndex] = await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_assignment' AND INDEX_NAME='uq_gateway_firmware_global_active'`);
    if (!globalFirmwareIndex.length) await connection.query(`ALTER TABLE gateway_node_assignment ADD UNIQUE KEY uq_gateway_firmware_global_active (firmware_id_global_activo)`);
    const [gatewayIdCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME='gateway_id'`);
    if (!gatewayIdCol.length) await connection.query(`ALTER TABLE gateway_command ADD COLUMN gateway_id INT NULL AFTER dispositivo_id`);
    const [firmwareNodeCommandCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME='firmware_node_id'`);
    if (!firmwareNodeCommandCol.length) await connection.query(`ALTER TABLE gateway_command ADD COLUMN firmware_node_id INT UNSIGNED NULL AFTER gateway_id`);
    const [commandRevisionCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME='config_revision'`);
    if (!commandRevisionCol.length) await connection.query(`ALTER TABLE gateway_command ADD COLUMN config_revision VARCHAR(64) NULL AFTER firmware_node_id`);
    const [commandAckStageCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME='ack_stage'`);
    if (!commandAckStageCol.length) await connection.query(`ALTER TABLE gateway_command ADD COLUMN ack_stage ENUM('NONE','RECEIVED','APPLIED','REJECTED') NOT NULL DEFAULT 'NONE' AFTER estado`);
    await connection.query(`ALTER TABLE gateway_command MODIFY COLUMN ack_stage ENUM('NONE','RECEIVED','APPLIED','REJECTED','UNKNOWN_CONFIRMED') NOT NULL DEFAULT 'NONE'`);
    await connection.query(`ALTER TABLE gateway_command MODIFY COLUMN estado ENUM('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO','APLICADO_NODO','RECHAZADO_NODO','SIN_CONFIRMACION','CANCELADO','CONFIRMADO','FALLIDO','VENCIDO') NOT NULL DEFAULT 'EN_COLA'`);
    const commandLifecycleColumns = [
      ["gateway_received_at", "DATETIME NULL"], ["node_received_at", "DATETIME NULL"],
      ["node_completed_at", "DATETIME NULL"], ["expired_at", "DATETIME NULL"],
      ["attempts_gateway", "INT NOT NULL DEFAULT 0"], ["attempts_radio", "INT NOT NULL DEFAULT 0"],
      ["last_attempt_at", "DATETIME NULL"], ["last_boot_id", "CHAR(36) NULL"],
      ["last_seq", "INT UNSIGNED NULL"], ["applied_config_revision", "VARCHAR(64) NULL"],
      ["config_revision_expected_u32", "INT UNSIGNED NULL"], ["config_revision_target_u32", "INT UNSIGNED NULL"],
      ["applied_config_revision_u32", "INT UNSIGNED NULL"],
      ["gateway_unknown_ack_at", "DATETIME NULL"],
      ["late_ack_expires_at", "DATETIME NULL"],
      ["delivery_lease_id", "CHAR(36) NULL"], ["delivery_lease_expires_at", "DATETIME NULL"],
      ["delivery_lease_consumed_at", "DATETIME NULL"], ["delivery_attempts", "INT UNSIGNED NOT NULL DEFAULT 0"],
    ];
    for (const [name, definition] of commandLifecycleColumns) {
      const [exists] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME=?`, [name]);
      if (!exists.length) await connection.query(`ALTER TABLE gateway_command ADD COLUMN ${name} ${definition}`);
    }
    await connection.query(`UPDATE gateway_command SET estado='SIN_CONFIRMACION', expired_at=COALESCE(expired_at,NOW()),
      late_ack_expires_at=COALESCE(late_ack_expires_at,DATE_ADD(NOW(), INTERVAL 30 DAY)),
      respuesta=COALESCE(respuesta,'Comando previo a config_revision uint32; no se despachó durante la transición')
      WHERE config_revision_target_u32 IS NULL AND estado IN ('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO')`);
    await connection.query(`UPDATE gateway_command SET late_ack_expires_at=DATE_ADD(COALESCE(expired_at,NOW()), INTERVAL 30 DAY)
      WHERE estado='SIN_CONFIRMACION' AND late_ack_expires_at IS NULL`);
    const [gatewayFk] = await connection.query(`SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND COLUMN_NAME='gateway_id' AND REFERENCED_TABLE_NAME='gateway'`);
    if (!gatewayFk.length) await connection.query(`ALTER TABLE gateway_command ADD CONSTRAINT fk_gateway_command_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT`);
    const [commandGatewayIndex] = await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_command' AND INDEX_NAME='idx_gateway_command_gateway_queue'`);
    if (!commandGatewayIndex.length) await connection.query(`ALTER TABLE gateway_command ADD INDEX idx_gateway_command_gateway_queue (gateway_id, estado, creado_at)`);
    await connection.query(`UPDATE gateway_command c JOIN gateway_node_assignment a ON a.dispositivo_id=c.dispositivo_id AND a.activo=1
      SET c.gateway_id=a.gateway_id WHERE c.gateway_id IS NULL`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_heartbeat (
      gateway_id INT PRIMARY KEY,
      recibido_at DATETIME NOT NULL,
      CONSTRAINT fk_gateway_heartbeat_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE CASCADE
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_node_presence (
      gateway_id INT NOT NULL, firmware_node_id INT UNSIGNED NOT NULL, dispositivo_id INT NOT NULL,
      boot_id CHAR(36) NOT NULL, seq INT UNSIGNED NOT NULL, firmware_version VARCHAR(64) NULL,
      config_revision_applied VARCHAR(64) NULL,
      effective_mode ENUM('OPERATIVO','INACTIVO','EN MANTENIMIENTO') NULL,
      last_applied_command_id CHAR(36) NULL,
      manifest_revision_applied CHAR(64) NULL,
      assignment_revision_applied CHAR(64) NULL,
      recibido_at DATETIME NOT NULL,
      PRIMARY KEY (gateway_id, firmware_node_id),
      CONSTRAINT fk_node_presence_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
      CONSTRAINT fk_node_presence_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
      INDEX idx_node_presence_received (recibido_at)
    )`);
    const [presenceConfigCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_presence' AND COLUMN_NAME='config_revision_applied'`);
    if (!presenceConfigCol.length) await connection.query(`ALTER TABLE gateway_node_presence ADD COLUMN config_revision_applied VARCHAR(64) NULL`);
    const [presenceConfigU32Col] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_presence' AND COLUMN_NAME='config_revision_applied_u32'`);
    if (!presenceConfigU32Col.length) await connection.query(`ALTER TABLE gateway_node_presence ADD COLUMN config_revision_applied_u32 INT UNSIGNED NULL`);
    const [presenceModeCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_presence' AND COLUMN_NAME='effective_mode'`);
    if (!presenceModeCol.length) await connection.query(`ALTER TABLE gateway_node_presence ADD COLUMN effective_mode ENUM('OPERATIVO','INACTIVO','EN MANTENIMIENTO') NULL`);
    const [presenceLastCommandCol] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_presence' AND COLUMN_NAME='last_applied_command_id'`);
    if (!presenceLastCommandCol.length) await connection.query(`ALTER TABLE gateway_node_presence ADD COLUMN last_applied_command_id CHAR(36) NULL`);
    for (const column of ['manifest_revision_applied', 'assignment_revision_applied']) {
      const [exists] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='gateway_node_presence' AND COLUMN_NAME=?`, [column]);
      if (!exists.length) await connection.query(`ALTER TABLE gateway_node_presence ADD COLUMN ${column} CHAR(64) NULL`);
    }
    await connection.query(`ALTER TABLE sensor MODIFY COLUMN estado ENUM('OPERATIVO','ACTIVO','INACTIVO','EN MANTENIMIENTO','RETIRADO','FALLANDO') NOT NULL DEFAULT 'OPERATIVO'`);
    await connection.query(`CREATE TABLE IF NOT EXISTS gateway_command_mutex (
      id TINYINT PRIMARY KEY
    )`);
    await connection.query("INSERT IGNORE INTO gateway_command_mutex (id) VALUES (1)");

    const [columnas] = await connection.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_NAME = 'dispositivo'
      AND COLUMN_NAME = 'proposito_id'
      AND TABLE_SCHEMA = DATABASE()
    `);

    if (columnas.length === 0) {
      await connection.query(`
        ALTER TABLE dispositivo
        ADD COLUMN proposito_id INT AFTER estado
      `);
    }

    await connection.query(`
      INSERT INTO proposito (id, nombre)
      SELECT 1, 'General'
      WHERE NOT EXISTS (SELECT 1 FROM proposito WHERE id = 1)
    `);

    await connection.query(`
      UPDATE dispositivo SET proposito_id = 1 WHERE proposito_id IS NULL
    `);

    await connection.query(`
      ALTER TABLE dispositivo
      MODIFY COLUMN proposito_id INT NOT NULL
    `);

    const [constraints] = await connection.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'dispositivo'
      AND COLUMN_NAME = 'proposito_id'
      AND CONSTRAINT_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'proposito'
    `);

    if (constraints.length === 0) {
      await connection.query(`
        ALTER TABLE dispositivo
        ADD CONSTRAINT fk_dispositivo_proposito
        FOREIGN KEY (proposito_id) REFERENCES proposito(id)
      `);
    }

    const camposNodo = [
      ["descripcion", "VARCHAR(500) NULL"], ["image_path", "VARCHAR(255) NULL"],
      ["mac_address", "VARCHAR(17) NULL"],
      ["tipo_alimentacion", "ENUM('BATERIA','CORRIENTE_DIRECTA') NOT NULL DEFAULT 'BATERIA'"],
      ["bateria_quimica", "VARCHAR(80) NULL"], ["bateria_capacidad_mah", "DECIMAL(10,2) NULL"],
      ["bateria_porcentaje", "DECIMAL(5,2) NULL"], ["intervalo_lectura_segundos", "INT NULL"],
      ["bateria_actualizada_at", "DATETIME NULL"], ["ultima_comunicacion", "DATETIME NULL"],
      ["ultimo_heartbeat_at", "DATETIME NULL"],
      ["management_poll_interval_seconds", "INT NOT NULL DEFAULT 600"],
      ["config_revision", "INT UNSIGNED NOT NULL DEFAULT 1"],
    ];
    for (const [nombre, definicion] of camposNodo) {
      const [existe] = await connection.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='dispositivo' AND COLUMN_NAME=?`, [nombre]);
      if (!existe.length) await connection.query(`ALTER TABLE dispositivo ADD COLUMN ${nombre} ${definicion}`);
    }

    const [indiceMac] = await connection.query(`
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dispositivo'
        AND INDEX_NAME = 'uq_dispositivo_mac_address'
    `);
    if (!indiceMac.length) {
      await connection.query("ALTER TABLE dispositivo ADD UNIQUE KEY uq_dispositivo_mac_address (mac_address)");
    }

    await connection.commit();
    console.log("✅ Migración completada");
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en la migración:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}
