import { pool } from "../db.js";

export async function seed() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Si ya hay datos, no hace nada
    const [zonas] = await connection.query(
      "SELECT COUNT(*) as total FROM zona",
    );
    if (zonas[0].total > 0) {
      console.log("⏭️  Seed omitido, ya hay datos");
      connection.release();
      return;
    }

    // ─── ZONAS ───────────────────────────────────────────────
    await connection.query(`
      INSERT INTO zona (zona) VALUES
        ('Norte'),
        ('Sur'),
        ('Este'),
        ('Oeste'),
        ('Interior')
    `);
    console.log("✅ Zonas insertadas");

    // ─── TIPOS DE DISPOSITIVO ────────────────────────────────
    await connection.query(`
      INSERT INTO tipo_dispositivo (nombre, descripcion, image_path) VALUES
        ('DHT11', 'Sensor básico de temperatura y humedad, rango 0-50°C, precisión ±2°C', null),
        ('DHT22', 'Sensor de temperatura y humedad de mayor precisión, rango -40 a 80°C, precisión ±0.5°C', null)
    `);
    console.log("✅ Tipos de dispositivo insertados");

    // ─── TIPOS DE DATO ────────────────────────────────────────
    await connection.query(`
      INSERT INTO tipo_dato (nombre, unidad) VALUES
        ('Temperatura', '°C'),
        ('Humedad',     '%'),
        ('VPD',         'kPa')
    `);
    console.log("✅ Tipos de dato insertados");

    // ─── ESPECIFICACIONES ─────────────────────────────────────
    // Punto de origen: esquina izquierda de la entrada
    const [specs] = await connection.query(`
      INSERT INTO especificaciones (largo, ancho, altura) VALUES
        (-10, -10, -10),
        (0.5, 0.5, 1.5)
    `);
    console.log("✅ Especificaciones insertadas, primer ID:", specs.insertId);

    // ─── PROPOSITO ───────────────────────────────────────────────
    await connection.query(`
      INSERT INTO proposito (nombre) VALUES
        ('General'),
        ('Mantenimiento')
    `);
    console.log("✅ Propósitos insertados");

    // ─── DISPOSITIVO ─────────────────────────────────────────
    // specs_id 1, zona_id 5 (Interior), tipo_id 2 (DHT22)
    await connection.query(
      `
      INSERT INTO dispositivo (specs_id, zona_id, tipo_id, estado, proposito_id, nombre) VALUES
        (?, 5, 2, 'OPERATIVO', 1, 'DHT22-01')
    `,
      [specs.insertId],
    );
    console.log("✅ Dispositivo insertado");

    // ─── LECTURAS DE PRUEBA ───────────────────────────────────
    await connection.query(`
      INSERT INTO lecturas (dato, dispositivo_id, tipo_dato_id, created_at) VALUES
        (23.5, 1, 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
        (65.2, 1, 2, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
        (0.92, 1, 3, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),

        (24.1, 1, 1, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
        (63.8, 1, 2, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
        (0.98, 1, 3, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),

        (24.8, 1, 1, DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
        (61.5, 1, 2, DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
        (1.05, 1, 3, DATE_SUB(NOW(), INTERVAL 10 MINUTE)),

        (25.2, 1, 1, NOW()),
        (60.1, 1, 2, NOW()),
        (1.12, 1, 3, NOW())
    `);
    console.log("✅ Lecturas de prueba insertadas");

    await connection.commit();
    console.log("🌱 Seed completado correctamente");
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error en el seed:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}
