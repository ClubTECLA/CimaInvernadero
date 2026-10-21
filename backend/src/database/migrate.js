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
      estado ENUM('EN_COLA','ENTREGADO','CONFIRMADO','FALLIDO','VENCIDO') NOT NULL DEFAULT 'EN_COLA',
      respuesta VARCHAR(500) NULL,
      vence_at DATETIME NOT NULL,
      creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      entregado_at DATETIME NULL,
      respondido_at DATETIME NULL,
      CONSTRAINT fk_gateway_command_nodo FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE CASCADE,
      INDEX idx_gateway_command_queue (estado, creado_at),
      INDEX idx_gateway_command_node (dispositivo_id, creado_at)
    )`);
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
