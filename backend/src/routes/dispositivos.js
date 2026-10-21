import { Router } from "express";
import { pool } from "../db.js";

import { verificarToken } from "../middleware/auth.js";
import { DIMENSIONES_SITIO } from "../config/sitio.js";

const estadosValidos = [
  "OPERATIVO",
  "INACTIVO",
  "EN MANTENIMIENTO",
];

const categoriasComponente = {
  sensor: { tabla: "sensor", categoria: "SENSOR" },
  actuador: { tabla: "actuador", categoria: "ACTUADOR" },
};

function validarUbicacion(ubicacion) {
  if (!ubicacion || typeof ubicacion !== "object") return null;
  const coordenadas = [ubicacion.largo, ubicacion.ancho, ubicacion.altura].map(Number);
  if (
    [ubicacion.largo, ubicacion.ancho, ubicacion.altura].some(
      (valor) => valor === undefined || valor === null || valor === "",
    ) || coordenadas.some((valor) => !Number.isFinite(valor) || valor < 0) ||
    coordenadas[0] > DIMENSIONES_SITIO.largo ||
    coordenadas[1] > DIMENSIONES_SITIO.ancho ||
    coordenadas[2] > DIMENSIONES_SITIO.altura
  ) {
    return null;
  }
  return { largo: coordenadas[0], ancho: coordenadas[1], altura: coordenadas[2] };
}

async function buscarZonaPorUbicacion(connection, ubicacion) {
  const [zonas] = await connection.query(
    `SELECT id, zona
     FROM zona
     WHERE largo_inicio IS NOT NULL AND largo_fin IS NOT NULL
       AND ancho_inicio IS NOT NULL AND ancho_fin IS NOT NULL
       AND ? >= largo_inicio AND ? <= largo_fin
       AND ? >= ancho_inicio AND ? <= ancho_fin
     ORDER BY largo_inicio DESC, ancho_inicio DESC
     LIMIT 1`,
    [
      ubicacion.largo,
      ubicacion.largo,
      ubicacion.ancho,
      ubicacion.ancho,
    ],
  );
  return zonas[0] || null;
}

function validarRutaImagen(imagePath) {
  if (imagePath === null || imagePath === undefined || imagePath === "") {
    return imagePath === "" ? null : imagePath;
  }
  return typeof imagePath === "string" &&
    /^\/uploads\/dispositivos\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(imagePath)
    ? imagePath
    : undefined;
}

const router = Router();

router.get("/actuadores", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.nombre, a.estado, a.encendido, a.control_automatico_activo, t.nombre AS tipo_dispositivo,
             d.id AS nodo_id, d.nombre AS nodo, z.zona,
             d.tipo_alimentacion, d.intervalo_lectura_segundos,
             d.bateria_porcentaje, d.ultima_comunicacion
      FROM actuador a
      JOIN dispositivo d ON d.id = a.dispositivo_id
      LEFT JOIN tipo_dispositivo t ON t.id = a.tipo_dispositivo_id
      LEFT JOIN zona z ON z.id = d.zona_id
      ORDER BY d.nombre, a.id
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar actuadores:", error.message);
    res.status(500).json({ error: "Error al consultar actuadores registrados en nodos" });
  }
});

router.get("/nodos/:id/componentes", async (req, res) => {
  try {
    // Fail-safe: una tarea no puede permanecer activa si su actuador o sensor dejó de estar operativo.
    await pool.query(`
      UPDATE actuador a
      LEFT JOIN actuador_regla r ON r.actuador_id = a.id
      LEFT JOIN sensor s ON s.id = r.sensor_id
      SET a.control_automatico_activo = 0
      WHERE a.dispositivo_id = ? AND a.control_automatico_activo = 1
        AND (a.estado <> 'OPERATIVO' OR s.estado IS NULL OR s.estado <> 'OPERATIVO')
    `, [req.params.id]);
    const [componentes] = await pool.query(`
      SELECT s.id, s.dispositivo_id AS nodo_id, s.tipo_dispositivo_id AS tipo_id,
             s.nombre, s.estado, NULL AS encendido, NULL AS control_automatico_activo,
             t.nombre AS tipo, COALESCE(t.categoria, 'SENSOR') AS categoria,
             COALESCE(GROUP_CONCAT(DISTINCT td.nombre ORDER BY td.id SEPARATOR ', '), '') AS tipos_dato
      FROM sensor s
      LEFT JOIN tipo_dispositivo t ON t.id = s.tipo_dispositivo_id
      LEFT JOIN tipo_dispositivo_tipo_dato m ON m.tipo_dispositivo_id = t.id
      LEFT JOIN tipo_dato td ON td.id = m.tipo_dato_id
      WHERE s.dispositivo_id = ?
      GROUP BY s.id
      UNION ALL
      SELECT a.id, a.dispositivo_id AS nodo_id, a.tipo_dispositivo_id AS tipo_id,
             a.nombre, a.estado, a.encendido, a.control_automatico_activo,
             t.nombre AS tipo, 'ACTUADOR' AS categoria, '' AS tipos_dato
      FROM actuador a
      LEFT JOIN tipo_dispositivo t ON t.id = a.tipo_dispositivo_id
      WHERE a.dispositivo_id = ?
      ORDER BY categoria, tipo, id
    `, [req.params.id, req.params.id]);
    res.json(componentes);
  } catch (error) {
    console.error("Error al consultar los componentes del nodo:", error.message);
    res.status(500).json({ error: "No fue posible consultar los componentes del nodo" });
  }
});

router.get("/nodos/:nodoId/actuadores/:actuadorId/reglas", async (req, res) => {
  try {
    const [reglas] = await pool.query(`
      SELECT r.id, r.sensor_id, r.tipo_dato_id, r.valor_minimo, r.valor_maximo,
             r.modo, s.nombre AS sensor, s.estado AS sensor_estado,
             td.nombre AS tipo_dato, td.unidad
      FROM actuador_regla r
      JOIN actuador a ON a.id = r.actuador_id
      JOIN sensor s ON s.id = r.sensor_id
      JOIN tipo_dato td ON td.id = r.tipo_dato_id
      WHERE a.id = ? AND a.dispositivo_id = ?
      ORDER BY r.id
    `, [req.params.actuadorId, req.params.nodoId]);
    const [actuador] = await pool.query(
      "SELECT id FROM actuador WHERE id = ? AND dispositivo_id = ?",
      [req.params.actuadorId, req.params.nodoId],
    );
    if (!actuador.length) return res.status(404).json({ error: "Actuador no encontrado en este nodo" });
    res.json(reglas);
  } catch (error) {
    console.error("Error al consultar reglas del actuador:", error.message);
    res.status(500).json({ error: "No fue posible consultar las reglas del actuador" });
  }
});

router.put("/nodos/:nodoId/actuadores/:actuadorId/reglas", verificarToken, async (req, res) => {
  const { reglas } = req.body;
  if (!Array.isArray(reglas) || reglas.length < 1) {
    return res.status(400).json({ error: "Asocia al menos un sensor con límites mínimo y máximo" });
  }
  if (reglas.length > 1) return res.status(400).json({ error: "Cada actuador puede tener reglas para un solo sensor" });
  if (reglas.some((regla) => !regla ||
    [regla.sensor_id, regla.tipo_dato_id, regla.valor_minimo, regla.valor_maximo, regla.modo]
      .some((valor) => valor === undefined || valor === null || valor === "")
  )) {
    return res.status(400).json({ error: "Cada regla requiere sensor, dato, mínimo, máximo y condición de activación" });
  }

  const normalizadas = reglas.map((regla) => ({
    sensor_id: Number(regla?.sensor_id),
    tipo_dato_id: Number(regla?.tipo_dato_id),
    valor_minimo: Number(regla?.valor_minimo),
    valor_maximo: Number(regla?.valor_maximo),
    modo: regla?.modo,
  }));
  if (normalizadas.some((regla) =>
    !Number.isInteger(regla.sensor_id) || regla.sensor_id < 1 ||
    !Number.isInteger(regla.tipo_dato_id) || regla.tipo_dato_id < 1 ||
    !Number.isFinite(regla.valor_minimo) || !Number.isFinite(regla.valor_maximo) ||
    regla.valor_minimo >= regla.valor_maximo ||
    !["ACTIVAR_DEBAJO", "ACTIVAR_ENCIMA"].includes(regla.modo)
  )) {
    return res.status(400).json({ error: "Revisa sensores, valores mínimo/máximo y condición de activación" });
  }
  const claves = normalizadas.map((regla) => `${regla.sensor_id}:${regla.tipo_dato_id}`);
  if (new Set(claves).size !== claves.length) {
    return res.status(400).json({ error: "No repitas el mismo sensor y tipo de dato" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [nodo] = await connection.query(
      "SELECT id FROM dispositivo WHERE id = ? FOR UPDATE",
      [req.params.nodoId],
    );
    if (!nodo.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Nodo no encontrado" });
    }
    const [actuador] = await connection.query(
      "SELECT id, tipo_dispositivo_id FROM actuador WHERE id = ? AND dispositivo_id = ? FOR UPDATE",
      [req.params.actuadorId, req.params.nodoId],
    );
    if (!actuador.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Actuador no encontrado en este nodo" });
    }
    const [tareaExistente] = await connection.query(`
      SELECT a.id
      FROM actuador a
      JOIN actuador_regla r ON r.actuador_id = a.id
      WHERE a.dispositivo_id = ?
        AND a.tipo_dispositivo_id = ?
        AND a.id <> ?
      LIMIT 1
    `, [req.params.nodoId, actuador[0].tipo_dispositivo_id, req.params.actuadorId]);
    if (tareaExistente.length) {
      await connection.rollback();
      return res.status(409).json({ error: "Ya existe una tarea para este tipo de actuador en el nodo" });
    }

    for (const regla of normalizadas) {
      const [sensorDato] = await connection.query(`
        SELECT s.id
        FROM sensor s
        JOIN tipo_dispositivo_tipo_dato m ON m.tipo_dispositivo_id = s.tipo_dispositivo_id
        WHERE s.id = ? AND s.dispositivo_id = ? AND m.tipo_dato_id = ?
      `, [regla.sensor_id, req.params.nodoId, regla.tipo_dato_id]);
      if (!sensorDato.length) {
        await connection.rollback();
        return res.status(400).json({ error: "Cada regla debe usar un sensor y tipo de dato asignados al mismo nodo" });
      }
    }

    await connection.query("DELETE FROM actuador_regla WHERE actuador_id = ?", [req.params.actuadorId]);
    await connection.query(
      `INSERT INTO actuador_regla
       (actuador_id, sensor_id, tipo_dato_id, valor_minimo, valor_maximo, modo)
       VALUES ?`,
      [normalizadas.map((regla) => [req.params.actuadorId, regla.sensor_id, regla.tipo_dato_id, regla.valor_minimo, regla.valor_maximo, regla.modo])],
    );
    await connection.commit();
    res.json({ message: "Reglas guardadas", total: normalizadas.length });
  } catch (error) {
    await connection.rollback();
    console.error("Error al guardar reglas del actuador:", error.message);
    res.status(500).json({ error: "No fue posible guardar las reglas del actuador" });
  } finally {
    connection.release();
  }
});

router.post("/nodos/:id/componentes", verificarToken, async (req, res) => {
  const { tipo_id, estado = "OPERATIVO" } = req.body;
  if (!Number.isInteger(Number(tipo_id)) || Number(tipo_id) < 1) return res.status(400).json({ error: "Selecciona un tipo de componente válido" });
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [nodo] = await connection.query("SELECT id FROM dispositivo WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!nodo.length) { await connection.rollback(); return res.status(404).json({ error: "Nodo no encontrado" }); }
    const [tipo] = await connection.query("SELECT id, nombre, categoria FROM tipo_dispositivo WHERE id = ?", [tipo_id]);
    if (!tipo.length) { await connection.rollback(); return res.status(404).json({ error: "Tipo de componente no encontrado" }); }
    const tabla = tipo[0].categoria === "ACTUADOR" ? "actuador" : "sensor";
    const [duplicado] = await connection.query(
      `SELECT id FROM ${tabla} WHERE dispositivo_id = ? AND tipo_dispositivo_id = ? LIMIT 1`,
      [req.params.id, tipo[0].id],
    );
    if (duplicado.length) {
      await connection.rollback();
      return res.status(409).json({ error: `${tipo[0].nombre} ya está asignado a este nodo` });
    }
    const [result] = await connection.query(
      `INSERT INTO ${tabla} (dispositivo_id, tipo_dispositivo_id, nombre, estado) VALUES (?, ?, ?, ?)`,
      [req.params.id, tipo[0].id, tipo[0].nombre, estado],
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, tipo_id: tipo[0].id, tipo: tipo[0].nombre, categoria: tipo[0].categoria, estado });
  } catch (error) {
    await connection.rollback();
    console.error("Error al agregar componente al nodo:", error.message);
    res.status(500).json({ error: "No fue posible agregar el componente al nodo" });
  } finally {
    connection.release();
  }
});

router.patch("/nodos/:nodoId/componentes/:categoria/:id", verificarToken, async (req, res) => {
  const componente = categoriasComponente[req.params.categoria];
  const { estado, tipo_id, encendido, control_automatico_activo: controlAutomaticoActivo } = req.body;
  if (!componente) return res.status(400).json({ error: "La categoría debe ser sensor o actuador" });
  if (encendido !== undefined && (componente.categoria !== "ACTUADOR" || typeof encendido !== "boolean")) return res.status(400).json({ error: "El control de encendido solo acepta true o false para actuadores" });
  if (controlAutomaticoActivo !== undefined && (componente.categoria !== "ACTUADOR" || typeof controlAutomaticoActivo !== "boolean")) return res.status(400).json({ error: "El control automático solo acepta true o false para actuadores" });
  if (tipo_id !== undefined && (!Number.isInteger(Number(tipo_id)) || Number(tipo_id) < 1)) return res.status(400).json({ error: "Selecciona un tipo válido" });
  if (estado !== undefined && !estadosValidos.includes(estado)) return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  if (estado === undefined && tipo_id === undefined && encendido === undefined && controlAutomaticoActivo === undefined) return res.status(400).json({ error: "Indica qué dato deseas actualizar" });
  try {
    if (controlAutomaticoActivo === true) {
      const [control] = await pool.query(`
        SELECT a.estado AS actuador_estado, s.estado AS sensor_estado
        FROM actuador a
        LEFT JOIN actuador_regla r ON r.actuador_id = a.id
        LEFT JOIN sensor s ON s.id = r.sensor_id
        WHERE a.id = ? AND a.dispositivo_id = ?
        LIMIT 1
      `, [req.params.id, req.params.nodoId]);
      if (!control.length) return res.status(404).json({ error: "Actuador no encontrado en este nodo" });
      if (control[0].actuador_estado !== "OPERATIVO") return res.status(409).json({ error: "No se puede activar la tarea: el actuador no está operativo" });
      if (!control[0].sensor_estado) return res.status(409).json({ error: "Configura primero los límites de la tarea" });
      if (control[0].sensor_estado !== "OPERATIVO") return res.status(409).json({ error: "No se puede activar la tarea: el sensor asociado no está operativo" });
    }
    if (tipo_id !== undefined) {
      const [tipo] = await pool.query("SELECT id, nombre, categoria FROM tipo_dispositivo WHERE id = ?", [tipo_id]);
      if (!tipo.length || tipo[0].categoria !== componente.categoria) return res.status(400).json({ error: "El tipo no corresponde a la categoría del componente" });
      const [duplicado] = await pool.query(
        `SELECT id FROM ${componente.tabla}
         WHERE dispositivo_id = ? AND tipo_dispositivo_id = ? AND id <> ? LIMIT 1`,
        [req.params.nodoId, tipo_id, req.params.id],
      );
      if (duplicado.length) return res.status(409).json({ error: `${tipo[0].nombre} ya está asignado a otro componente de este nodo` });
      if (componente.tabla === "sensor") {
        const [reglasInvalidas] = await pool.query(`
          SELECT COUNT(*) AS total
          FROM actuador_regla r
          LEFT JOIN tipo_dispositivo_tipo_dato m
            ON m.tipo_dispositivo_id = ? AND m.tipo_dato_id = r.tipo_dato_id
          WHERE r.sensor_id = ? AND m.tipo_dato_id IS NULL
        `, [tipo_id, req.params.id]);
        if (Number(reglasInvalidas[0].total) > 0) {
          return res.status(409).json({ error: "Actualiza primero las reglas de los actuadores que usan este sensor" });
        }
      }
    }
    const campos = [];
    const valores = [];
    if (estado !== undefined) { campos.push("estado = ?"); valores.push(estado); }
    if (encendido !== undefined) { campos.push("encendido = ?"); valores.push(encendido ? 1 : 0); }
    if (controlAutomaticoActivo !== undefined) { campos.push("control_automatico_activo = ?"); valores.push(controlAutomaticoActivo ? 1 : 0); }
    if (tipo_id !== undefined) {
      campos.push("tipo_dispositivo_id = ?", "nombre = (SELECT nombre FROM tipo_dispositivo WHERE id = ?)");
      valores.push(tipo_id, tipo_id);
    }
    valores.push(req.params.id, req.params.nodoId);
    const [result] = await pool.query(
      `UPDATE ${componente.tabla} SET ${campos.join(", ")} WHERE id = ? AND dispositivo_id = ?`, valores,
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Componente no encontrado en este nodo" });
    let tareasPausadas = 0;
    if (estado && estado !== "OPERATIVO" && componente.categoria === "SENSOR") {
      const [pausa] = await pool.query(`
        UPDATE actuador a
        JOIN actuador_regla r ON r.actuador_id = a.id
        SET a.control_automatico_activo = 0
        WHERE r.sensor_id = ? AND a.control_automatico_activo = 1
      `, [req.params.id]);
      tareasPausadas = pausa.affectedRows;
    } else if (estado && estado !== "OPERATIVO" && componente.categoria === "ACTUADOR") {
      const [pausa] = await pool.query(
        "UPDATE actuador SET control_automatico_activo = 0 WHERE id = ? AND dispositivo_id = ? AND control_automatico_activo = 1",
        [req.params.id, req.params.nodoId],
      );
      tareasPausadas = pausa.affectedRows;
    }
    res.json({ message: "Componente actualizado", tareas_pausadas: tareasPausadas });
  } catch (error) {
    console.error("Error al actualizar componente:", error.message);
    res.status(500).json({ error: "No fue posible actualizar el componente" });
  }
});

router.delete("/nodos/:nodoId/componentes/:categoria/:id", verificarToken, async (req, res) => {
  const componente = categoriasComponente[req.params.categoria];
  if (!componente) return res.status(400).json({ error: "La categoría debe ser sensor o actuador" });
  try {
    if (componente.tabla === "sensor") {
      const [reglas] = await pool.query(
        "SELECT COUNT(*) AS total FROM actuador_regla WHERE sensor_id = ?",
        [req.params.id],
      );
      if (Number(reglas[0].total) > 0) {
        return res.status(409).json({ error: "Este sensor está asociado a reglas de actuadores. Quita o reemplaza esas reglas antes de eliminarlo" });
      }
    }
    const [result] = await pool.query(
      `DELETE FROM ${componente.tabla} WHERE id = ? AND dispositivo_id = ?`,
      [req.params.id, req.params.nodoId],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Componente no encontrado en este nodo" });
    res.json({ message: "Componente eliminado" });
  } catch (error) {
    console.error("Error al eliminar componente:", error.message);
    res.status(500).json({ error: "No fue posible eliminar el componente" });
  }
});

// GET /api/dispositivos -> dispositivos con sus especificaciones, zona y tipo
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
  SELECT 
    d.id,
    CASE
      WHEN d.estado IN ('INACTIVO', 'EN MANTENIMIENTO') THEN d.estado
      WHEN d.estado = 'FALLANDO' THEN d.estado
      WHEN d.ultima_comunicacion IS NULL
        OR d.ultima_comunicacion < DATE_SUB(NOW(), INTERVAL 1 HOUR)
        THEN 'FALLANDO'
      ELSE d.estado
    END AS estado,
    d.nombre,
    d.descripcion AS descripcion_nodo,
    d.tipo_alimentacion,
    d.bateria_quimica,
    d.bateria_capacidad_mah,
    d.intervalo_lectura_segundos,
    intervalo.intervalo_calculado_segundos,
    d.bateria_porcentaje,
    d.bateria_actualizada_at,
    d.ultima_comunicacion,
    d.created_at,
    d.specs_id,
    d.image_path AS image_path_nodo,
    d.image_path AS image_path,
    p.nombre AS proposito,
    e.altura,
    e.ancho,
    e.largo,
    z.zona AS zona,
    t.nombre AS tipo_dispositivo,
    t.categoria AS tipo_categoria,
    t.descripcion
  FROM dispositivo d
  LEFT JOIN proposito p ON d.proposito_id = p.id
  LEFT JOIN especificaciones e ON d.specs_id = e.id
  LEFT JOIN zona z ON d.zona_id = z.id
  LEFT JOIN tipo_dispositivo t ON d.tipo_id = t.id
  LEFT JOIN (
    SELECT
      dispositivo_id,
      created_at,
      TIMESTAMPDIFF(
        SECOND,
        LEAD(created_at) OVER (
          PARTITION BY dispositivo_id ORDER BY created_at DESC
        ),
        created_at
      ) AS intervalo_calculado_segundos
    FROM (
      SELECT DISTINCT dispositivo_id, created_at
      FROM lecturas
    ) ciclos
  ) intervalo
    ON intervalo.dispositivo_id = d.id
   AND intervalo.created_at = (
     SELECT MAX(l2.created_at)
     FROM lecturas l2
     WHERE l2.dispositivo_id = d.id
   )
  ORDER BY d.created_at DESC
`);
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar dispositivos:", error.message);
    res.status(500).json({ error: "Error al consultar los dispositivos" });
  }
});

// GET /api/dispositivos/:id -> un dispositivo con sus especificaciones, zona y tipo
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        d.id,
        CASE
          WHEN d.estado IN ('INACTIVO', 'EN MANTENIMIENTO') THEN d.estado
          WHEN d.estado = 'FALLANDO' THEN d.estado
          WHEN d.ultima_comunicacion IS NULL
            OR d.ultima_comunicacion < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            THEN 'FALLANDO'
          ELSE d.estado
        END AS estado,
        d.nombre,
        d.descripcion AS descripcion_nodo,
        d.tipo_alimentacion,
        d.bateria_quimica,
        d.bateria_capacidad_mah,
        d.intervalo_lectura_segundos,
        intervalo.intervalo_calculado_segundos,
        d.bateria_porcentaje,
        d.bateria_actualizada_at,
        d.ultima_comunicacion,
        d.created_at,
        d.specs_id,
        d.image_path AS image_path_nodo,
        d.image_path AS image_path,
        p.nombre AS proposito,
        e.altura,
        e.ancho,
        e.largo,
        z.zona AS zona,
        t.nombre AS tipo_dispositivo,
        t.categoria AS tipo_categoria,
        t.descripcion
      FROM dispositivo d
      LEFT JOIN proposito p ON d.proposito_id = p.id
      LEFT JOIN especificaciones e ON d.specs_id = e.id
      LEFT JOIN zona z ON d.zona_id = z.id
      LEFT JOIN tipo_dispositivo t ON d.tipo_id = t.id
      LEFT JOIN (
        SELECT
          dispositivo_id,
          created_at,
          TIMESTAMPDIFF(
            SECOND,
            LEAD(created_at) OVER (
              PARTITION BY dispositivo_id ORDER BY created_at DESC
            ),
            created_at
          ) AS intervalo_calculado_segundos
        FROM (
          SELECT DISTINCT dispositivo_id, created_at
          FROM lecturas
        ) ciclos
      ) intervalo
        ON intervalo.dispositivo_id = d.id
       AND intervalo.created_at = (
         SELECT MAX(l2.created_at)
         FROM lecturas l2
         WHERE l2.dispositivo_id = d.id
       )
      WHERE d.id = ?
      ORDER BY d.created_at DESC
    `,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar el dispositivo:", error.message);
    res.status(500).json({ error: "Error al consultar el dispositivo" });
  }
});

// Alta de nodo: recibe coordenadas, asigna zona y guarda ubicación en una transacción.
router.post("/nodos", verificarToken, async (req, res) => {
  const {
    nombre,
    descripcion = null,
    tipo_id = null,
    estado,
    tipo_alimentacion = "BATERIA",
    bateria_quimica = null,
    bateria_capacidad_mah = null,
    ubicacion,
    image_path,
  } = req.body;
  const coordenadas = validarUbicacion(ubicacion);
  const rutaImagen = validarRutaImagen(image_path);
  if (!nombre?.trim() || !estado || !coordenadas) {
    return res.status(400).json({
      error: "Nombre, estado y una ubicación válida son requeridos",
    });
  }
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  }
  if (!["BATERIA", "CORRIENTE_DIRECTA"].includes(tipo_alimentacion)) {
    return res.status(400).json({ error: "Selecciona batería o corriente directa como alimentación" });
  }
  if (bateria_quimica !== null && (typeof bateria_quimica !== "string" || bateria_quimica.length > 80)) {
    return res.status(400).json({ error: "La química o modelo de batería debe tener máximo 80 caracteres" });
  }
  if (bateria_capacidad_mah !== null && bateria_capacidad_mah !== "" && (!Number.isFinite(Number(bateria_capacidad_mah)) || Number(bateria_capacidad_mah) <= 0)) {
    return res.status(400).json({ error: "La capacidad de batería debe ser mayor a cero" });
  }
  if (rutaImagen === undefined) {
    return res.status(400).json({ error: "La ruta de imagen del nodo no es válida" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const zona = await buscarZonaPorUbicacion(connection, coordenadas);
    if (tipo_id !== null) {
      const [tipos] = await connection.query(
        "SELECT id FROM tipo_dispositivo WHERE id = ?",
        [tipo_id],
      );
      if (tipos.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Tipo de nodo no encontrado" });
      }
    }

    const [propositos] = await connection.query(
      "SELECT id FROM proposito WHERE nombre = 'General' LIMIT 1",
    );
    let propositoId = propositos[0]?.id;
    if (!propositoId) {
      const [propositoCreado] = await connection.query(
        "INSERT INTO proposito (nombre) VALUES ('General')",
      );
      propositoId = propositoCreado.insertId;
    }

    const [ubicacionGuardada] = await connection.query(
      "INSERT INTO especificaciones (largo, ancho, altura) VALUES (?, ?, ?)",
      [coordenadas.largo, coordenadas.ancho, coordenadas.altura],
    );
    const [result] = await connection.query(
      `INSERT INTO dispositivo
       (specs_id, zona_id, tipo_id, estado, proposito_id, nombre, descripcion, image_path, tipo_alimentacion,
        bateria_quimica, bateria_capacidad_mah, bateria_porcentaje, bateria_actualizada_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ubicacionGuardada.insertId,
        zona?.id ?? null,
        tipo_id,
        estado,
        propositoId,
        nombre.trim(),
        typeof descripcion === "string" ? descripcion.trim() || null : null,
        rutaImagen ?? null,
        tipo_alimentacion,
        tipo_alimentacion === "BATERIA" ? (bateria_quimica?.trim() || null) : null,
        tipo_alimentacion === "BATERIA" && bateria_capacidad_mah !== "" ? bateria_capacidad_mah : null,
        null,
        null,
      ],
    );
    await connection.commit();
    res.status(201).json({
      message: "Nodo registrado correctamente",
      id: result.insertId,
      zona: zona?.zona ?? null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al registrar nodo:", error.message);
    res.status(500).json({ error: "Error al registrar el nodo" });
  } finally {
    connection.release();
  }
});

// Actualización del nodo: recalcula la zona cuando cambian las coordenadas.
router.patch("/nodos/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    descripcion,
    tipo_id,
    estado,
    tipo_alimentacion,
    bateria_quimica,
    bateria_capacidad_mah,
    ubicacion,
    image_path,
  } = req.body;
  const coordenadas = ubicacion === undefined ? undefined : validarUbicacion(ubicacion);
  const rutaImagen = Object.hasOwn(req.body, "image_path")
    ? validarRutaImagen(image_path)
    : undefined;

  if (coordenadas === null) {
    return res.status(400).json({ error: "La ubicación debe incluir coordenadas válidas" });
  }
  if (estado !== undefined && !estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  }
  if (tipo_alimentacion !== undefined && !["BATERIA", "CORRIENTE_DIRECTA"].includes(tipo_alimentacion)) {
    return res.status(400).json({ error: "Selecciona batería o corriente directa como alimentación" });
  }
  if (bateria_quimica !== undefined && bateria_quimica !== null && (typeof bateria_quimica !== "string" || bateria_quimica.length > 80)) {
    return res.status(400).json({ error: "La química o modelo de batería debe tener máximo 80 caracteres" });
  }
  if (bateria_capacidad_mah !== undefined && bateria_capacidad_mah !== null && bateria_capacidad_mah !== "" && (!Number.isFinite(Number(bateria_capacidad_mah)) || Number(bateria_capacidad_mah) <= 0)) {
    return res.status(400).json({ error: "La capacidad de batería debe ser mayor a cero" });
  }
  if (rutaImagen === undefined && Object.hasOwn(req.body, "image_path")) {
    return res.status(400).json({ error: "La ruta de imagen del nodo no es válida" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [nodos] = await connection.query(
      "SELECT specs_id FROM dispositivo WHERE id = ? FOR UPDATE",
      [id],
    );
    if (nodos.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Nodo ${id} no encontrado` });
    }

    const campos = [];
    const valores = [];
    if (nombre !== undefined) {
      if (!nombre.trim()) {
        await connection.rollback();
        return res.status(400).json({ error: "El nombre del nodo es obligatorio" });
      }
      campos.push("nombre = ?");
      valores.push(nombre.trim());
    }
    if (descripcion !== undefined) {
      if (descripcion !== null && (typeof descripcion !== "string" || descripcion.length > 500)) {
        await connection.rollback();
        return res.status(400).json({ error: "La descripción debe tener máximo 500 caracteres" });
      }
      campos.push("descripcion = ?");
      valores.push(typeof descripcion === "string" ? descripcion.trim() || null : null);
    }
    if (tipo_id !== undefined) {
      const [tipos] = await connection.query(
        "SELECT id FROM tipo_dispositivo WHERE id = ?",
        [tipo_id],
      );
      if (tipos.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Tipo de nodo no encontrado" });
      }
      campos.push("tipo_id = ?");
      valores.push(tipo_id);
    }
    if (estado !== undefined) {
      campos.push("estado = ?");
      valores.push(estado);
    }
    if (tipo_alimentacion !== undefined) {
      campos.push("tipo_alimentacion = ?");
      valores.push(tipo_alimentacion);
      if (tipo_alimentacion === "CORRIENTE_DIRECTA") {
        campos.push("bateria_porcentaje = NULL", "bateria_actualizada_at = NULL");
      }
    }
    if (bateria_quimica !== undefined) {
      campos.push("bateria_quimica = ?");
      valores.push(typeof bateria_quimica === "string" ? bateria_quimica.trim() || null : null);
    }
    if (bateria_capacidad_mah !== undefined) {
      campos.push("bateria_capacidad_mah = ?");
      valores.push(bateria_capacidad_mah === "" ? null : bateria_capacidad_mah);
    }
    if (coordenadas) {
      const zona = await buscarZonaPorUbicacion(connection, coordenadas);

      const specsAnterior = nodos[0].specs_id;
      let specsNuevo = specsAnterior;
      if (specsAnterior && specsAnterior !== 1) {
        const [usos] = await connection.query(
          "SELECT COUNT(*) AS total FROM dispositivo WHERE specs_id = ? AND id <> ?",
          [specsAnterior, id],
        );
        if (Number(usos[0].total) === 0) {
          await connection.query(
            "UPDATE especificaciones SET largo = ?, ancho = ?, altura = ? WHERE id = ?",
            [coordenadas.largo, coordenadas.ancho, coordenadas.altura, specsAnterior],
          );
        } else {
          const [nuevaUbicacion] = await connection.query(
            "INSERT INTO especificaciones (largo, ancho, altura) VALUES (?, ?, ?)",
            [coordenadas.largo, coordenadas.ancho, coordenadas.altura],
          );
          specsNuevo = nuevaUbicacion.insertId;
        }
      } else {
        const [nuevaUbicacion] = await connection.query(
          "INSERT INTO especificaciones (largo, ancho, altura) VALUES (?, ?, ?)",
          [coordenadas.largo, coordenadas.ancho, coordenadas.altura],
        );
        specsNuevo = nuevaUbicacion.insertId;
      }
      campos.push("specs_id = ?", "zona_id = ?");
      valores.push(specsNuevo, zona?.id ?? null);
    }
    if (Object.hasOwn(req.body, "image_path")) {
      campos.push("image_path = ?");
      valores.push(rutaImagen ?? null);
    }
    if (campos.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: "No se recibieron cambios para guardar" });
    }

    valores.push(id);
    await connection.query(
      `UPDATE dispositivo SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );

    const specsAnterior = nodos[0].specs_id;
    if (coordenadas && specsAnterior && specsAnterior !== 1) {
      await connection.query(
        `DELETE FROM especificaciones
         WHERE id = ? AND NOT EXISTS (
           SELECT 1 FROM dispositivo WHERE specs_id = ?
         )`,
        [specsAnterior, specsAnterior],
      );
    }

    await connection.commit();
    res.json({ message: "Nodo actualizado correctamente" });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar nodo:", error.message);
    res.status(500).json({ error: "Error al actualizar el nodo" });
  } finally {
    connection.release();
  }
});

// POST /api/dispositivos (compatibilidad con clientes anteriores)
router.post("/", verificarToken, async (req, res) => {
  const {
    specs_id,
    zona_id,
    tipo_id,
    estado,
    proposito_id,
    nombre,
  } = req.body;

  if (!zona_id || !tipo_id || !estado || !nombre || !proposito_id) {
    return res.status(400).json({
      error: "la zona, tipo, estado, el proposito y el nombre son requeridos",
    });
  }
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (specs_id !== undefined && specs_id !== null) {
      const [especificaciones] = await connection.query(
        "SELECT id FROM especificaciones WHERE id = ?",
        [specs_id],
      );

      if (especificaciones.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Especificaciones ${specs_id} no encontradas` });
      }
    }

    const [zona] = await connection.query("SELECT id FROM zona WHERE id = ?", [
      zona_id,
    ]);

    if (zona.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Zona ${zona_id} no encontrada` });
    }

    const [tipo] = await connection.query(
      "SELECT id FROM tipo_dispositivo WHERE id = ?",
      [tipo_id],
    );

    if (tipo.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Tipo de dispositivo ${tipo_id} no encontrado` });
    }

    const [proposito] = await connection.query(
      "SELECT id FROM proposito WHERE id = ?",
      [proposito_id],
    );

    if (proposito.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Proposito ${proposito_id} no encontrado` });
    }

    const [result] = await connection.query(
      `INSERT INTO dispositivo
       (specs_id, zona_id, tipo_id, estado, proposito_id, nombre,
        bateria_porcentaje, bateria_actualizada_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        specs_id,
        zona_id,
        tipo_id,
        estado,
        proposito_id,
        nombre,
        null,
        null,
      ],
    );

    await connection.commit();
    res.status(201).json({
      message: `Dispositivo registrado correctamente`,
      id: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al registrar dispositivo:", error.message);
    res.status(500).json({ error: "Error al registrar el dispositivo" });
  } finally {
    connection.release();
  }
});

// PATCH /api/dispositivos/:id -> actualizar solo los campos enviados
router.patch("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const {
    specs_id,
    zona_id,
    tipo_id,
    estado,
    proposito_id,
    nombre,
  } = req.body;

  if (estado !== undefined && !estadosValidos.includes(estado)) {
    return res.status(400).json({ error: "Elige Operativo, Inactivo o En mantenimiento; Problemas o fallas es automático" });
  }

  // Construye dinámicamente solo los campos que llegaron
  const campos = [];
  const valores = [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let especificacionesAnteriores = null;

    // Revisar que las especificaciones existan
    if (specs_id !== undefined) {
      const [dispositivos] = await connection.query(
        "SELECT specs_id FROM dispositivo WHERE id = ? FOR UPDATE",
        [id],
      );

      if (dispositivos.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
      }

      especificacionesAnteriores = dispositivos[0].specs_id;

      if (specs_id !== null) {
        const [specs] = await connection.query(
          "SELECT id FROM especificaciones WHERE id = ?",
          [specs_id],
        );

        if (specs.length === 0) {
          await connection.rollback();
          return res
            .status(404)
            .json({ error: `Especificaciones ${specs_id} no encontradas` });
        }
      }

      campos.push("specs_id = ?");
      valores.push(specs_id);
    }

    // Revisar que la zona exista
    if (zona_id !== undefined) {
      const [zona] = await connection.query(
        "SELECT id FROM zona WHERE id = ?",
        [zona_id],
      );

      if (zona.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Zona ${zona_id} no encontrada` });
      }

      campos.push("zona_id = ?");
      valores.push(zona_id);
    }

    // Revisar que el tipo de dispositivo exista
    if (tipo_id !== undefined) {
      const [tipo] = await connection.query(
        "SELECT id FROM tipo_dispositivo WHERE id = ?",
        [tipo_id],
      );

      if (tipo.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Tipo de dispositivo ${tipo_id} no encontrado` });
      }

      campos.push("tipo_id = ?");
      valores.push(tipo_id);
    }

    // Revisar que el proposito exista
    if (proposito_id !== undefined) {
      const [proposito] = await connection.query(
        "SELECT id FROM proposito WHERE id = ?",
        [proposito_id],
      );

      if (proposito.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Proposito ${proposito_id} no encontrado` });
      }

      campos.push("proposito_id = ?");
      valores.push(proposito_id);
    }

    if (estado !== undefined) {
      campos.push("estado = ?");
      valores.push(estado);
    }
    if (nombre !== undefined) {
      campos.push("nombre = ?");
      valores.push(nombre);
    }

    if (campos.length === 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ error: "Debes enviar al menos un campo para actualizar" });
    }

    valores.push(id); // el id va al final para el WHERE

    const [result] = await connection.query(
      `UPDATE dispositivo SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
    }

    if (
      especificacionesAnteriores &&
      especificacionesAnteriores !== 1 &&
      especificacionesAnteriores !== specs_id
    ) {
      await connection.query(
        `DELETE FROM especificaciones
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM dispositivo WHERE specs_id = ?
           )`,
        [especificacionesAnteriores, especificacionesAnteriores],
      );
    }

    await connection.commit();
    res.status(200).json({
      message: `Dispositivo actualizado correctamente`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar dispositivo:", error.message);
    res.status(500).json({ error: "Error al actualizar el dispositivo" });
  } finally {
    connection.release();
  }
});

// DELETE /api/dispositivos/:id -> eliminar un dispositivo
router.delete("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    // Verifica si algúna lectura usa este dispositivo antes de borrar
    const [lecturas] = await connection.query(
      "SELECT id FROM lecturas WHERE dispositivo_id = ?",
      [id],
    );
    if (lecturas.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: `No se puede eliminar, ${lecturas.length} lectura(s) usan este dispositivo`,
      });
    }

    const [dispositivo] = await connection.query(
      "SELECT specs_id FROM dispositivo WHERE id = ? FOR UPDATE",
      [id],
    );

    const [result] = await connection.query(
      "DELETE FROM dispositivo WHERE id = ?",
      [id],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
    }

    if (dispositivo[0]?.specs_id && dispositivo[0]?.specs_id !== 1) {
      await connection.query(
        `DELETE FROM especificaciones
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM dispositivo WHERE specs_id = ?
           )`,
        [dispositivo[0].specs_id, dispositivo[0].specs_id],
      );
    }

    await connection.commit();
    res.json({ message: `Dispositivo ${id} eliminado correctamente` });
  } catch (error) {
    await connection.rollback();
    console.error("Error al eliminar dispositivo:", error.message);
    res.status(500).json({ error: "Error al eliminar el dispositivo" });
  } finally {
    connection.release();
  }
});

export default router;
