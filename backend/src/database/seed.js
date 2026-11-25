import { pool } from "../db.js";

const nodos = [
  { nombre: "Nodo 1", anteriores: ["DHT22-01", "ESP32-01"], componentes: ["DHT22"], actuadores: ["Riego norte demo"] },
  { nombre: "Nodo 2", anteriores: ["DHT22-03", "ESP32-02"], componentes: ["DHT22", "VEML7700", "SCD41"] },
  { nombre: "Nodo 3", anteriores: ["DHT22-04", "ESP32-03"], componentes: ["DHT22"] },
  { nombre: "Nodo 4", anteriores: [], componentes: ["SEN0193"], actuadores: ["Riego por goteo"] },
];

const tiposDato = [
  ["Temperatura", "°C"], ["Humedad", "%"], ["VPD", "kPa"],
  ["Iluminancia", "lux"], ["Dióxido de carbono", "ppm"], ["Humedad del sustrato", "%"],
];
const tiposComponente = [
  ["DHT22", "SENSOR", "Sensor combinado de temperatura y humedad"],
  ["VEML7700", "SENSOR", "Sensor de iluminancia"],
  ["SCD41", "SENSOR", "Sensor de dióxido de carbono"],
  ["SEN0193", "SENSOR", "Sensor de humedad del sustrato"],
  ["Riego", "ACTUADOR", "Actuador de riego por goteo"],
];
const asociaciones = {
  DHT22: ["Temperatura", "Humedad", "VPD"],
  VEML7700: ["Iluminancia"],
  SCD41: ["Dióxido de carbono"],
  SEN0193: ["Humedad del sustrato"],
};

const nodosDemo = [
  { nombre: "Nodo 1", zona: "Zona demo A", largo: 1.2, ancho: 1.1, altura: 1.2, estado: "OPERATIVO", energia: "BATERIA", bateria: 91, minutosSinComunicacion: 1 },
  { nombre: "Nodo 2", zona: "Zona demo B", largo: 7.1, ancho: 1.2, altura: 1.4, estado: "INACTIVO", energia: "CORRIENTE_DIRECTA", bateria: null, minutosSinComunicacion: 2 },
  { nombre: "Nodo 3", zona: "Zona demo C", largo: 1.4, ancho: 5.2, altura: 1.3, estado: "EN MANTENIMIENTO", energia: "BATERIA", bateria: 41, minutosSinComunicacion: 5 },
  { nombre: "Nodo 4", zona: "Zona demo D", largo: 7.8, ancho: 5.3, altura: 1.1, estado: "OPERATIVO", energia: "BATERIA", bateria: 9, minutosSinComunicacion: 40 },
];

async function tipoDatoId(connection, nombre, unidad) {
  const [rows] = await connection.query("SELECT id FROM tipo_dato WHERE nombre = ? LIMIT 1", [nombre]);
  if (rows.length) return rows[0].id;
  const [result] = await connection.query("INSERT INTO tipo_dato (nombre, unidad) VALUES (?, ?)", [nombre, unidad]);
  return result.insertId;
}

async function tipoComponenteId(connection, nombre, categoria, descripcion) {
  const [rows] = await connection.query("SELECT id, categoria FROM tipo_dispositivo WHERE nombre = ? LIMIT 1", [nombre]);
  if (rows.length) {
    if (rows[0].categoria !== categoria) {
      await connection.query("UPDATE tipo_dispositivo SET categoria = ?, descripcion = ? WHERE id = ?", [categoria, descripcion, rows[0].id]);
    }
    return rows[0].id;
  }
  const [result] = await connection.query(
    "INSERT INTO tipo_dispositivo (nombre, categoria, descripcion, image_path) VALUES (?, ?, ?, NULL)",
    [nombre, categoria, descripcion],
  );
  return result.insertId;
}

async function componenteId(connection, nodoId, tipoId, nombre, tabla, actuador = false) {
  const [rows] = await connection.query(
    "SELECT id FROM " + tabla + " WHERE dispositivo_id = ? AND tipo_dispositivo_id = ? ORDER BY id LIMIT 1",
    [nodoId, tipoId],
  );
  if (rows.length) {
    await connection.query("UPDATE " + tabla + " SET nombre = ? WHERE id = ?", [nombre, rows[0].id]);
    return rows[0].id;
  }
  const columnas = actuador ? ", encendido, control_automatico_activo" : "";
  const valores = actuador ? ", 0, 0" : "";
  const [result] = await connection.query(
    "INSERT INTO " + tabla + " (dispositivo_id, tipo_dispositivo_id, nombre" + columnas + ") VALUES (?, ?, ?" + valores + ")",
    [nodoId, tipoId, nombre],
  );
  return result.insertId;
}

async function crearZonasDemo(connection, ubicacion) {
  const mitadLargo = Number(ubicacion.largo) / 2;
  const mitadAncho = Number(ubicacion.ancho) / 2;
  const definiciones = [
    ["Zona demo A", 0, mitadLargo, 0, mitadAncho],
    ["Zona demo B", mitadLargo, Number(ubicacion.largo), 0, mitadAncho],
    ["Zona demo C", 0, mitadLargo, mitadAncho, Number(ubicacion.ancho)],
    ["Zona demo D", mitadLargo, Number(ubicacion.largo), mitadAncho, Number(ubicacion.ancho)],
  ];
  const ids = {};

  for (const [nombre, largoInicio, largoFin, anchoInicio, anchoFin] of definiciones) {
    const [existentes] = await connection.query(
      "SELECT id FROM zona WHERE ubicacion_id = ? AND zona = ? ORDER BY id LIMIT 1",
      [ubicacion.id, nombre],
    );
    if (existentes.length) {
      ids[nombre] = existentes[0].id;
      continue;
    }
    const [resultado] = await connection.query(
      `INSERT INTO zona
       (ubicacion_id, zona, descripcion, largo_inicio, largo_fin, ancho_inicio, ancho_fin, altura_inicio, altura_fin)
       VALUES (?, ?, 'Zona sintética para revisión visual local', ?, ?, ?, ?, 0, ?)`,
      [ubicacion.id, nombre, largoInicio, largoFin, anchoInicio, anchoFin, Number(ubicacion.altura)],
    );
    ids[nombre] = resultado.insertId;
  }
  return ids;
}

async function prepararNodoDemo(connection, nodo, nodoId, zonaId) {
  const [[actual]] = await connection.query(
    "SELECT specs_id, zona_id FROM dispositivo WHERE id = ?",
    [nodoId],
  );
  let specsId = actual.specs_id;
  if (!specsId) {
    const [specs] = await connection.query(
      "INSERT INTO especificaciones (largo, ancho, altura) VALUES (?, ?, ?)",
      [nodo.largo, nodo.ancho, nodo.altura],
    );
    specsId = specs.insertId;
  }

  const minutos = nodo.minutosSinComunicacion;
  const tipoBateria = nodo.energia === "BATERIA" ? (nodo.nombre === "Nodo 4" ? "NiMH" : "Li-ion") : null;
  const capacidad = nodo.nombre === "Nodo 4" ? 1200 : 2200;
  await connection.query(
    `UPDATE dispositivo
     SET specs_id = COALESCE(specs_id, ?),
         zona_id = COALESCE(zona_id, ?),
         estado = ?,
         tipo_alimentacion = ?,
         bateria_quimica = ?,
         bateria_capacidad_mah = ?,
         bateria_porcentaje = ?,
         bateria_actualizada_at = CASE WHEN ? = 'BATERIA' THEN DATE_SUB(NOW(), INTERVAL ? MINUTE) ELSE NULL END,
         intervalo_lectura_segundos = 300,
         management_poll_interval_seconds = 600,
         ultima_comunicacion = DATE_SUB(NOW(), INTERVAL ? MINUTE),
         ultimo_heartbeat_at = DATE_SUB(NOW(), INTERVAL ? MINUTE)
     WHERE id = ?`,
    [
      specsId, zonaId, nodo.estado, nodo.energia, tipoBateria,
      nodo.energia === "BATERIA" ? capacidad : null,
      nodo.bateria, nodo.energia, minutos, minutos, minutos, nodoId,
    ],
  );
}

async function crearReglaDemo(connection, actuadorId, nodoId, tipoSensor, tipoDatoId, minimo, maximo) {
  const [[sensor]] = await connection.query(
    `SELECT s.id FROM sensor s
     JOIN tipo_dispositivo t ON t.id = s.tipo_dispositivo_id
     WHERE s.dispositivo_id = ? AND t.nombre = ?
     ORDER BY s.id LIMIT 1`,
    [nodoId, tipoSensor],
  );
  if (!sensor) return;
  await connection.query(
    `INSERT INTO actuador_regla
     (actuador_id, sensor_id, tipo_dato_id, valor_minimo, valor_maximo, modo)
     VALUES (?, ?, ?, ?, ?, 'ACTIVAR_DEBAJO')
     ON DUPLICATE KEY UPDATE valor_minimo = VALUES(valor_minimo), valor_maximo = VALUES(valor_maximo), modo = VALUES(modo)`,
    [actuadorId, sensor.id, tipoDatoId, minimo, maximo],
  );
}

function calcularVpd(t, h) {
  const sat = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  return Number((sat * (1 - h / 100)).toFixed(2));
}

export async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const datoIds = {};
    for (const [nombre, unidad] of tiposDato) datoIds[nombre] = await tipoDatoId(connection, nombre, unidad);

    const componenteTipos = {};
    for (const [nombre, categoria, descripcion] of tiposComponente) {
      componenteTipos[nombre] = await tipoComponenteId(connection, nombre, categoria, descripcion);
    }
    for (const [tipo, datos] of Object.entries(asociaciones)) {
      for (const nombre of datos) {
        await connection.query(
          "INSERT IGNORE INTO tipo_dispositivo_tipo_dato (tipo_dispositivo_id, tipo_dato_id) VALUES (?, ?)",
          [componenteTipos[tipo], datoIds[nombre]],
        );
      }
    }

    const [propositos] = await connection.query("SELECT id FROM proposito WHERE nombre = 'General' LIMIT 1");
    let propositoId = propositos[0]?.id;
    if (!propositoId) {
      const [result] = await connection.query("INSERT INTO proposito (nombre) VALUES ('General')");
      propositoId = result.insertId;
    }

    const [[ubicacionDemo]] = await connection.query("SELECT id, largo, ancho, altura FROM ubicacion WHERE id = 1");
    if (!ubicacionDemo) throw new Error("No existe la ubicación base para los datos de demostración");
    const zonasDemoIds = await crearZonasDemo(connection, ubicacionDemo);

    const nodoIds = {};
    for (const nodo of nodos) {
      let actual = null;
      for (const nombre of [nodo.nombre, ...nodo.anteriores]) {
        const [rows] = await connection.query("SELECT id FROM dispositivo WHERE nombre = ? ORDER BY id LIMIT 1", [nombre]);
        if (rows.length) { actual = rows[0]; break; }
      }
      if (actual) {
        nodoIds[nodo.nombre] = actual.id;
        // Solo se renombra y desvincula el tipo de nodo; ubicación y zona permanecen intactas.
        await connection.query("UPDATE dispositivo SET nombre = ?, tipo_id = NULL WHERE id = ?", [nodo.nombre, actual.id]);
      } else {
        const [result] = await connection.query(
          "INSERT INTO dispositivo (specs_id, zona_id, tipo_id, estado, proposito_id, nombre) VALUES (NULL, NULL, NULL, 'OPERATIVO', ?, ?)",
          [propositoId, nodo.nombre],
        );
        nodoIds[nodo.nombre] = result.insertId;
      }
    }

    for (const nodo of nodos) {
      for (const tipo of nodo.componentes) {
        if (tipo === "DHT22") {
          await connection.query(
            "UPDATE sensor s JOIN tipo_dispositivo t ON t.id = s.tipo_dispositivo_id SET s.tipo_dispositivo_id = ?, s.nombre = 'DHT22' WHERE s.dispositivo_id = ? AND t.nombre = 'DHT11'",
            [componenteTipos.DHT22, nodoIds[nodo.nombre]],
          );
        }
        await componenteId(connection, nodoIds[nodo.nombre], componenteTipos[tipo], tipo, "sensor");
      }
      for (const nombre of nodo.actuadores || []) {
        await componenteId(connection, nodoIds[nodo.nombre], componenteTipos.Riego, nombre, "actuador", true);
      }
    }

    for (const nodo of nodosDemo) {
      await prepararNodoDemo(connection, nodo, nodoIds[nodo.nombre], zonasDemoIds[nodo.zona]);
    }

    const [[actuadorNorte]] = await connection.query(
      "SELECT id FROM actuador WHERE dispositivo_id = ? ORDER BY id LIMIT 1",
      [nodoIds["Nodo 1"]],
    );
    const [[actuadorSur]] = await connection.query(
      "SELECT id FROM actuador WHERE dispositivo_id = ? ORDER BY id LIMIT 1",
      [nodoIds["Nodo 4"]],
    );
    if (actuadorNorte) {
      await connection.query("UPDATE actuador SET estado = 'OPERATIVO', encendido = 0, control_automatico_activo = 1 WHERE id = ?", [actuadorNorte.id]);
      await crearReglaDemo(connection, actuadorNorte.id, nodoIds["Nodo 1"], "DHT22", datoIds.Humedad, 40, 50);
    }
    if (actuadorSur) {
      await connection.query("UPDATE actuador SET estado = 'OPERATIVO', encendido = 0, control_automatico_activo = 0 WHERE id = ?", [actuadorSur.id]);
      await crearReglaDemo(connection, actuadorSur.id, nodoIds["Nodo 4"], "SEN0193", datoIds["Humedad del sustrato"], 30, 55);
    }

    const muestras = {
      "Nodo 1": { Temperatura: [24.1, 24.3, 24.2], Humedad: [62, 63, 64] },
      "Nodo 2": { Temperatura: [23.7, 23.9, 23.8], Humedad: [67, 68, 69], Iluminancia: [7040, 7280, 7440], "Dióxido de carbono": [612, 619, 625] },
      "Nodo 3": { Temperatura: [25.0, 25.2, 25.1], Humedad: [58, 59, 60] },
      "Nodo 4": { "Humedad del sustrato": [42, 43, 44] },
    };
    const minutos = [25, 15, 5];
    let agregadas = 0;
    const valoresExistentes = new Map();

    for (const [nombreNodo, datos] of Object.entries(muestras)) {
      const nodoId = nodoIds[nombreNodo];
      const datosConVpd = { ...datos };
      if (nombreNodo !== "Nodo 4") {
        datosConVpd.VPD = datos.Temperatura.map((t, i) => calcularVpd(t, datos.Humedad[i]));
      }
      for (const [nombreDato, valores] of Object.entries(datosConVpd)) {
        for (let i = 0; i < minutos.length; i += 1) {
          const datoId = datoIds[nombreDato];
          const claveMuestra = `${nodoId}:${datoId}`;
          if (!valoresExistentes.has(claveMuestra)) {
            const [filasExistentes] = await connection.query(
              "SELECT DISTINCT dato FROM lecturas WHERE dispositivo_id = ? AND tipo_dato_id = ?",
              [nodoId, datoId],
            );
            valoresExistentes.set(claveMuestra, new Set(filasExistentes.map((fila) => Number(fila.dato))));
          }
          const valoresRegistrados = valoresExistentes.get(claveMuestra);
          if (valoresRegistrados.has(Number(valores[i]))) continue;
          await connection.query(
            "INSERT INTO lecturas (dato, dispositivo_id, tipo_dato_id, created_at) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))",
            [valores[i], nodoId, datoId, minutos[i]],
          );
          valoresRegistrados.add(Number(valores[i]));
          agregadas += 1;
        }
      }
    }

    await connection.commit();
    console.log("Datos demo listos: 4 nodos, 4 zonas, estados y batería variados; " + agregadas + " lecturas nuevas agregadas sin duplicar muestras.");
  } catch (error) {
    await connection.rollback();
    console.error("Error en el seed:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}
