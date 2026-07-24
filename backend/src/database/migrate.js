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
      CREATE TABLE IF NOT EXISTS zona (
        id   INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        zona VARCHAR(255)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tipo_dispositivo (
        id          INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
        nombre      VARCHAR(255),
        descripcion VARCHAR(255),
        image_path  VARCHAR(255)
      )
    `);

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
        tipo_id   INT NOT NULL,
        estado    ENUM('OPERATIVO', 'INACTIVO', 'EN MANTENIMIENTO', 'FALLANDO'),
        nombre    VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_dispositivo_specs FOREIGN KEY (specs_id) REFERENCES especificaciones(id),
        CONSTRAINT fk_dispositivo_zona  FOREIGN KEY (zona_id)  REFERENCES zona(id),
        CONSTRAINT fk_dispositivo_tipo  FOREIGN KEY (tipo_id)  REFERENCES tipo_dispositivo(id)
      )
    `);

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
