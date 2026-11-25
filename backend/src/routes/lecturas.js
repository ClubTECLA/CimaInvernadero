import { Router } from "express";
import { pool } from "../db.js";
import ExcelJS from "exceljs";

import { verificarToken } from "../middleware/auth.js";
import { verificarGateway } from "../middleware/gatewayAuth.js";
import {
  isFiniteNumber,
  isIsoDateOrDateTime,
  parsePositiveInteger,
} from "../utils/validation.js";
import { calculateGatewayAssignmentRevision } from "../utils/gatewayRevisions.js";
import { validateSensorMeasurement } from "../utils/sensorMeasurementValidation.js";

const router = Router();

function fechaParaConsulta(valor, esFinal = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return `${valor} ${esFinal ? "23:59:59" : "00:00:00"}`;
  }
  return new Date(valor).toISOString().slice(0, 19).replace("T", " ");
}

function convertirFechaComparacion(valor, esFinal = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return Date.parse(`${valor}T${esFinal ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  return Date.parse(valor);
}

// GET /api/lecturas -> todas las lecturas, con filtros opcionales
router.get("/", async (req, res) => {
  const {
    dispositivo_id,
    tipo_dato_id,
    zona_id,
    ubicacion_id,
    tipo_dispositivo_id,
    fecha_inicio,
    fecha_fin,
  } = req.query;
  const page = parsePositiveInteger(req.query.page, 1);
  const limit = parsePositiveInteger(req.query.limit, 20, 100);

  if (page === null || limit === null) {
    return res.status(400).json({
      error: "page debe ser un entero positivo y limit debe estar entre 1 y 100",
    });
  }

  if (!isIsoDateOrDateTime(fecha_inicio) || !isIsoDateOrDateTime(fecha_fin)) {
    return res
      .status(400)
      .json({ error: "Las fechas deben usar el formato YYYY-MM-DD" });
  }

  if (fecha_inicio && fecha_fin && convertirFechaComparacion(fecha_inicio) > convertirFechaComparacion(fecha_fin, true)) {
    return res.status(400).json({
      error: "La fecha inicial no puede ser posterior a la fecha final",
    });
  }
  const offset = (page - 1) * limit;

  const condiciones = [];
  const valores = [];

  if (dispositivo_id !== undefined) {
    condiciones.push("l.dispositivo_id = ?");
    valores.push(dispositivo_id);
  }
  if (tipo_dato_id !== undefined) {
    condiciones.push("l.tipo_dato_id = ?");
    valores.push(tipo_dato_id);
  }
  if (zona_id !== undefined) {
    condiciones.push("d.zona_id = ?");
    valores.push(zona_id);
  }
  if (ubicacion_id !== undefined) {
    condiciones.push("z.ubicacion_id = ?");
    valores.push(ubicacion_id);
  }
  if (tipo_dispositivo_id !== undefined) {
    condiciones.push("d.tipo_id = ?");
    valores.push(tipo_dispositivo_id);
  }
  if (fecha_inicio) {
    condiciones.push("l.created_at >= ?");
    valores.push(fechaParaConsulta(fecha_inicio));
  }
  if (fecha_fin) {
    condiciones.push("l.created_at <= ?");
    valores.push(fechaParaConsulta(fecha_fin, true));
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        l.id,
        l.dato,
        l.bateria_porcentaje,
        l.created_at,
        td.nombre  AS tipo_dato,
        td.unidad,
        d.nombre   AS dispositivo,
        z.zona     AS zona,
        t.nombre   AS tipo_dispositivo
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      LEFT JOIN zona        z  ON d.zona_id        = z.id
      LEFT JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...valores, limit, offset],
    );

    const [total] = await pool.query(
      `SELECT COUNT(*) as total
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      LEFT JOIN zona        z  ON d.zona_id        = z.id
      LEFT JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      ${where}`,
      valores,
    );

    res.json({
      datos: rows,
      total: total[0].total,
      pagina: page,
      limite: limit,
      total_paginas: Math.ceil(total[0].total / limit),
    });
  } catch (error) {
    console.error("Error al consultar lecturas:", error.message);
    res.status(500).json({ error: "Error al consultar las lecturas" });
  }
});

// GET /api/lecturas/exportar/previa -> estado actual de los nodos incluidos en la exportación
router.get("/exportar/previa", async (req, res) => {
  const { dispositivo_id, tipo_dato_id, zona_id, tipo_dispositivo_id, fecha_inicio, fecha_fin } = req.query;

  if (!isIsoDateOrDateTime(fecha_inicio) || !isIsoDateOrDateTime(fecha_fin)) {
    return res.status(400).json({ error: "Las fechas deben usar el formato YYYY-MM-DD" });
  }
  if (fecha_inicio && fecha_fin && convertirFechaComparacion(fecha_inicio) > convertirFechaComparacion(fecha_fin, true)) {
    return res.status(400).json({ error: "La fecha inicial no puede ser posterior a la fecha final" });
  }

  const condicionesLecturas = [];
  const valoresLecturas = [];
  if (dispositivo_id) { condicionesLecturas.push("l.dispositivo_id = ?"); valoresLecturas.push(dispositivo_id); }
  if (tipo_dato_id) { condicionesLecturas.push("l.tipo_dato_id = ?"); valoresLecturas.push(tipo_dato_id); }
  if (tipo_dispositivo_id) { condicionesLecturas.push("dl.tipo_id = ?"); valoresLecturas.push(tipo_dispositivo_id); }
  if (zona_id) { condicionesLecturas.push("dl.zona_id = ?"); valoresLecturas.push(zona_id); }
  if (fecha_inicio) { condicionesLecturas.push("l.created_at >= ?"); valoresLecturas.push(fechaParaConsulta(fecha_inicio)); }
  if (fecha_fin) { condicionesLecturas.push("l.created_at <= ?"); valoresLecturas.push(fechaParaConsulta(fecha_fin, true)); }
  const whereLecturas = condicionesLecturas.length ? `WHERE ${condicionesLecturas.join(" AND ")}` : "";

  const condicionesNodos = [];
  const valoresNodos = [];
  if (dispositivo_id) { condicionesNodos.push("d.id = ?"); valoresNodos.push(dispositivo_id); }
  if (tipo_dispositivo_id) { condicionesNodos.push("d.tipo_id = ?"); valoresNodos.push(tipo_dispositivo_id); }
  if (zona_id) { condicionesNodos.push("d.zona_id = ?"); valoresNodos.push(zona_id); }
  const whereNodos = condicionesNodos.length ? `WHERE ${condicionesNodos.join(" AND ")}` : "";

  try {
    const [rows] = await pool.query(`
      WITH lecturas_filtradas AS (
        SELECT l.dispositivo_id, l.tipo_dato_id, l.dato, l.created_at,
               ROW_NUMBER() OVER (PARTITION BY l.dispositivo_id, l.tipo_dato_id ORDER BY l.created_at DESC, l.id DESC) AS orden
        FROM lecturas l
        JOIN dispositivo dl ON dl.id = l.dispositivo_id
        ${whereLecturas}
      )
      SELECT d.id AS nodo_id, d.nombre AS nodo, d.tipo_alimentacion,
             d.bateria_porcentaje AS bateria_actual, d.bateria_actualizada_at,
             CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.largo END AS ubicacion_largo,
             CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.ancho END AS ubicacion_ancho,
             CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.altura END AS ubicacion_altura,
             z.zona, td.nombre AS tipo_dato, td.unidad, lf.dato AS valor, lf.created_at AS fecha_lectura
      FROM dispositivo d
      LEFT JOIN especificaciones e ON e.id = d.specs_id
      LEFT JOIN zona z ON z.id = d.zona_id
      LEFT JOIN lecturas_filtradas lf ON lf.dispositivo_id = d.id AND lf.orden = 1
      LEFT JOIN tipo_dato td ON td.id = lf.tipo_dato_id
      ${whereNodos}
      ORDER BY d.nombre, td.nombre
    `, [...valoresLecturas, ...valoresNodos]);
    res.json(rows);
  } catch (error) {
    console.error("Error al preparar vista previa de exportación:", error.message);
    res.status(500).json({ error: "No fue posible preparar la vista previa" });
  }
});

// GET /api/lecturas/exportar?filtros...
router.get("/exportar", async (req, res) => {
  const {
    dispositivo_id,
    tipo_dato_id,
    zona_id,
    ubicacion_id,
    tipo_dispositivo_id,
    fecha_inicio,
    fecha_fin,
  } = req.query;

  if (!isIsoDateOrDateTime(fecha_inicio) || !isIsoDateOrDateTime(fecha_fin)) {
    return res
      .status(400)
      .json({ error: "Las fechas deben usar el formato YYYY-MM-DD" });
  }

  if (fecha_inicio && fecha_fin && convertirFechaComparacion(fecha_inicio) > convertirFechaComparacion(fecha_fin, true)) {
    return res.status(400).json({
      error: "La fecha inicial no puede ser posterior a la fecha final",
    });
  }

  const condiciones = [];
  const valores = [];

  if (dispositivo_id) {
    condiciones.push("l.dispositivo_id = ?");
    valores.push(dispositivo_id);
  }
  if (tipo_dato_id) {
    condiciones.push("l.tipo_dato_id = ?");
    valores.push(tipo_dato_id);
  }
  if (zona_id) {
    condiciones.push("d.zona_id = ?");
    valores.push(zona_id);
  }
  if (ubicacion_id) {
    condiciones.push("z.ubicacion_id = ?");
    valores.push(ubicacion_id);
  }
  if (tipo_dispositivo_id) {
    condiciones.push("d.tipo_id = ?");
    valores.push(tipo_dispositivo_id);
  }
  if (fecha_inicio) {
    condiciones.push("l.created_at >= ?");
    valores.push(fechaParaConsulta(fecha_inicio));
  }
  if (fecha_fin) {
    condiciones.push("l.created_at <= ?");
    valores.push(fechaParaConsulta(fecha_fin, true));
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        l.id,
        l.dato,
        l.created_at,
        td.nombre AS tipo_dato,
        td.unidad,
        d.nombre  AS dispositivo,
        d.tipo_alimentacion,
        d.bateria_porcentaje AS bateria_actual,
        CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.largo END AS ubicacion_largo,
        CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.ancho END AS ubicacion_ancho,
        CASE WHEN d.specs_id IS NOT NULL AND d.specs_id <> 1 THEN e.altura END AS ubicacion_altura,
        u.nombre AS ubicacion,
        z.zona
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      LEFT JOIN especificaciones e ON e.id = d.specs_id
      LEFT JOIN zona        z  ON d.zona_id        = z.id
      LEFT JOIN ubicacion   u  ON z.ubicacion_id   = u.id
      LEFT JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      ${where}
      ORDER BY l.created_at DESC
    `,
      valores,
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Monitoreo del sitio";
    workbook.created = new Date();
    workbook.modified = new Date();

    const lecturasSheet = workbook.addWorksheet("Lecturas", {
      properties: { defaultRowHeight: 20 },
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    lecturasSheet.mergeCells("A1:I1");
    lecturasSheet.getCell("A1").value = "Historial de lecturas";
    lecturasSheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF234A35" } };
    lecturasSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7CDBB" } };
    lecturasSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
    lecturasSheet.getRow(1).height = 32;
    lecturasSheet.mergeCells("A2:I2");
    lecturasSheet.getCell("A2").value = `Generado el ${new Date().toLocaleString("es-MX")}`;
    lecturasSheet.getCell("A2").font = { italic: true, color: { argb: "FF557166" } };
    const ubicacionesInforme = [...new Set(rows.map((l) => l.ubicacion).filter(Boolean))];
    const ubicacionInforme = ubicacionesInforme.length === 0
      ? "Sin ubicación registrada"
      : ubicacionesInforme.length === 1 ? ubicacionesInforme[0] : "Varias ubicaciones";
    lecturasSheet.mergeCells("A3:I3");
    lecturasSheet.getCell("A3").value = `Ubicación: ${ubicacionInforme}`;
    lecturasSheet.getCell("A3").font = { bold: true, color: { argb: "FF3F7054" } };
    lecturasSheet.mergeCells("A4:I4");
    lecturasSheet.getCell("A4").value = `Registros exportados: ${rows.length.toLocaleString("es-MX")}`;
    lecturasSheet.getCell("A4").font = { bold: true, color: { argb: "FF3F7054" } };

    const columnas = [
      "ID de lectura", "Zona", "Nodo", "Tipo de dato", "Valor",
      "Unidad", "Batería (%)", "Fecha y hora", "Posición del nodo (m)",
    ];
    const filas = rows.map((l) => {
      const tienePosicion = l.ubicacion_largo !== null && l.ubicacion_largo !== undefined;
      const posicion = tienePosicion
        ? `${Number(l.ubicacion_largo).toFixed(2)} × ${Number(l.ubicacion_ancho).toFixed(2)} × ${Number(l.ubicacion_altura).toFixed(2)}`
        : "Sin posición registrada";
      const bateria = l.tipo_alimentacion === "CORRIENTE_DIRECTA"
        ? "No aplica"
        : l.bateria_actual === null || l.bateria_actual === undefined || l.bateria_actual === ""
          ? "Sin dato"
          : Number(l.bateria_actual);
      return [
        l.id, l.zona || "Sin zona asignada", l.dispositivo, l.tipo_dato,
        Number(l.dato), l.unidad, bateria, new Date(l.created_at), posicion,
      ];
    });

    const encabezadoLecturas = lecturasSheet.getRow(6);
    encabezadoLecturas.values = columnas;
    encabezadoLecturas.height = 24;
    encabezadoLecturas.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF234A35" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC7D9B5" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF9DBB8A" } } };
    });
    filas.forEach((fila, indice) => {
      const row = lecturasSheet.addRow(fila);
      row.alignment = { vertical: "middle" };
      if (indice % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F6E8" } };
        });
      }
    });
    lecturasSheet.views = [{ state: "frozen", ySplit: 6 }];
    [14, 22, 18, 22, 12, 12, 15, 22, 25].forEach((width, index) => {
      lecturasSheet.getColumn(index + 1).width = width;
    });
    lecturasSheet.getColumn(6).numFmt = "0.00";
    lecturasSheet.getColumn(7).numFmt = "0.00";
    lecturasSheet.getColumn(8).numFmt = "dd/mm/yyyy hh:mm:ss";
    lecturasSheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 6) row.alignment = { vertical: "middle" };
    });

    const resumen = workbook.addWorksheet("Resumen");
    resumen.mergeCells("A1:B1");
    resumen.getCell("A1").value = "Resumen de la exportación";
    resumen.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF234A35" } };
    resumen.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7CDBB" } };
    resumen.getRow(1).height = 32;
    resumen.addRow(["Indicador", "Resultado"]);
    resumen.addRow(["Lecturas exportadas", rows.length]);
    resumen.addRow(["Cantidad de dispositivos", new Set(rows.map((l) => l.dispositivo)).size]);
    resumen.addRow(["Tipos de dato incluidos", new Set(rows.map((l) => l.tipo_dato)).size]);
    ["A2", "B2"].forEach((celda) => {
      resumen.getCell(celda).font = { bold: true, color: { argb: "FF234A35" } };
      resumen.getCell(celda).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC7D9B5" } };
    });
    resumen.columns = [{ width: 28 }, { width: 24 }];
    resumen.views = [{ state: "frozen", ySplit: 2 }];

    const archivo = await workbook.xlsx.writeBuffer();
    const selloFecha = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=lecturas_invernadero_${selloFecha}.xlsx`);
    res.send(Buffer.from(archivo));
  } catch (error) {
    console.error("Error al exportar:", error.message);
    res.status(500).json({ error: "Error al exportar las lecturas" });
  }
});

// GET /api/lecturas/ultimas?dispositivo_id=1
router.get("/ultimas", async (req, res) => {
  const { dispositivo_id } = req.query;

  if (!dispositivo_id) {
    return res.status(400).json({ error: "dispositivo_id es requerido" });
  }

  try {
    const [rows] = await pool.query(
      `
      WITH lecturas_ordenadas AS (
        SELECT l.id, l.dato, l.created_at, l.captured_at, l.sensor_id, l.tipo_dato_id, l.dispositivo_id,
          ROW_NUMBER() OVER (PARTITION BY l.dispositivo_id, l.sensor_id, l.tipo_dato_id
            ORDER BY COALESCE(l.captured_at,l.created_at) DESC, l.created_at DESC, l.id DESC) AS orden
        FROM lecturas l WHERE l.dispositivo_id=?
      )
      SELECT l.id, l.dato, l.created_at AS received_at, l.captured_at, l.sensor_id,
             s.nombre AS sensor, td.nombre AS tipo_dato, td.unidad,
             d.id AS dispositivo_id, d.nombre AS dispositivo,
             z.zona AS zona,
             t.nombre AS tipo_dispositivo
      FROM lecturas_ordenadas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      LEFT JOIN sensor s ON s.id=l.sensor_id
      LEFT JOIN zona        z  ON d.zona_id        = z.id
      LEFT JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      WHERE l.orden=1
      `,
      [dispositivo_id],
    );

    res.json({ datos: rows });
  } catch (error) {
    console.error("Error al consultar últimas lecturas:", error.message);
    res.status(500).json({ error: "Error al consultar las últimas lecturas" });
  }
});

// GET /api/lecturas/promedio -> promedio de lecturas recientes por tipo de dato
router.get("/promedio", async (req, res) => {
  const { proposito_id, ubicacion_id } = req.query;

  const condiciones = ["COALESCE(l.captured_at,l.created_at) >= NOW() - INTERVAL 60 MINUTE", "COALESCE(l.captured_at,l.created_at) <= NOW()"];
  const valores = [];

  if (proposito_id) {
    condiciones.push("d.proposito_id = ?");
    valores.push(proposito_id);
  }
  const tieneFiltroUbicacion = ubicacion_id !== undefined && ubicacion_id !== "";
  const ubicacionId = Number(ubicacion_id);
  if (tieneFiltroUbicacion && (!Number.isInteger(ubicacionId) || ubicacionId < 1)) {
    return res.status(400).json({ error: "La ubicación seleccionada no es válida" });
  }
  if (tieneFiltroUbicacion) {
    condiciones.push("EXISTS (SELECT 1 FROM zona z_filtro WHERE z_filtro.id = d.zona_id AND z_filtro.ubicacion_id = ?)");
    valores.push(ubicacionId);
  }

  const where = `WHERE ${condiciones.join(" AND ")}`;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        td.id AS tipo_dato_id,
        td.nombre AS tipo_dato,
        td.unidad,
        ROUND(AVG(l.dato), 2) AS promedio,
        COUNT(*) AS cantidad_lecturas
      FROM lecturas l
      JOIN tipo_dato td ON l.tipo_dato_id = td.id
      JOIN dispositivo d ON l.dispositivo_id = d.id
      LEFT JOIN zona z ON d.zona_id = z.id
      ${where}
      GROUP BY td.id, td.nombre, td.unidad
    `,
      valores,
    );

    const [porSensor] = await pool.query(`
      SELECT d.id AS dispositivo_id, d.nombre AS dispositivo, l.sensor_id,
        s.nombre AS sensor, td.id AS tipo_dato_id, td.nombre AS tipo_dato, td.unidad,
        ROUND(AVG(l.dato),2) AS promedio, COUNT(*) AS cantidad_lecturas,
        CASE WHEN l.sensor_id IS NULL THEN 'LEGACY_SIN_SENSOR_ASOCIADO' ELSE 'SENSOR_FISICO' END AS granularidad
      FROM lecturas l
      JOIN tipo_dato td ON td.id=l.tipo_dato_id
      JOIN dispositivo d ON d.id=l.dispositivo_id
      LEFT JOIN sensor s ON s.id=l.sensor_id
      LEFT JOIN zona z ON z.id=d.zona_id
      ${where}
      GROUP BY d.id,d.nombre,l.sensor_id,s.nombre,td.id,td.nombre,td.unidad
      ORDER BY d.id,l.sensor_id,td.id`, valores);

    res.json({
      schema_version: 2,
      periodo: { segundos: 3600, scope: "timestamp de captura; usa created_at de recepción si captured_at es NULL (muestras UNSYNCED y legado)" },
      global: { scope: "promedio global por tipo_dato en todos los nodos/sensores filtrados", datos: rows },
      por_sensor: { scope: "promedio por nodo + sensor físico + tipo_dato; las lecturas históricas sensor_id NULL quedan identificadas como legacy", datos: porSensor },
      datos: rows,
    });
  } catch (error) {
    console.error("Error al consultar promedios:", error.message);
    res.status(500).json({ error: "Error al consultar los promedios" });
  }
});

// POST /api/lecturas -> recibe el payload del gateway después de ESP-NOW.
// La batería y el intervalo configurado son opcionales. El intervalo real
// se calcula en el backend con lecturas consecutivas válidas; los huecos
// largos de comunicación se excluyen del cálculo.
// { dispositivo_id, bateria_porcentaje, intervalo_lectura_segundos, lecturas: [...] }
router.post("/", verificarGateway, async (req, res) => {
  const { dispositivo_id, firmware_node_id, boot_id, seq, sample_uptime_ms, captured_at, time_quality = "UNSYNCED", manifest_revision, assignment_revision, lecturas, bateria_porcentaje, intervalo_lectura_segundos: intervaloRecibido } = req.body;

  if (
    bateria_porcentaje !== undefined &&
    bateria_porcentaje !== null &&
    bateria_porcentaje !== ""
  ) {
    const bateria = Number(bateria_porcentaje);
    if (!Number.isFinite(bateria) || bateria < 0 || bateria > 100) {
      return res.status(400).json({
        error: "bateria_porcentaje debe estar entre 0 y 100",
      });
    }
  }

  if (!Number.isInteger(Number(firmware_node_id)) || Number(firmware_node_id) < 1 || Number(firmware_node_id) > 4294967295 ||
      typeof boot_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boot_id) ||
      !Number.isInteger(Number(seq)) || Number(seq) < 0 || Number(seq) > 4294967295 ||
      !Number.isSafeInteger(Number(sample_uptime_ms)) || Number(sample_uptime_ms) < 0 ||
      typeof manifest_revision !== "string" || !/^[0-9a-f]{64}$/i.test(manifest_revision) ||
      typeof assignment_revision !== "string" || !/^[0-9a-f]{64}$/i.test(assignment_revision) ||
      !["SYNCED", "UNSYNCED"].includes(time_quality) ||
      (time_quality === "SYNCED" && !captured_at) ||
      (captured_at !== undefined && (typeof captured_at !== "string" || !Number.isFinite(Date.parse(captured_at))))) {
    return res.status(400).json({ error: "firmware_node_id, boot_id, seq, manifest_revision, assignment_revision y captured_at deben identificar la muestra" });
  }

  if (intervaloRecibido !== undefined && intervaloRecibido !== null && intervaloRecibido !== "") {
    const intervalo = Number(intervaloRecibido);
    if (!Number.isInteger(intervalo) || intervalo < 5 || intervalo > 86400) {
      return res.status(400).json({
        error: "intervalo_lectura_segundos debe ser un número entero entre 5 y 86400",
      });
    }
  }

  if (
    !Number.isInteger(Number(dispositivo_id)) || Number(dispositivo_id) < 1 ||
    !lecturas ||
    !Array.isArray(lecturas) ||
    lecturas.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "dispositivo_id y lecturas son requeridos" });
  }

  if (lecturas.length > 1000) {
    return res.status(400).json({
      error: "No se pueden registrar más de 1000 lecturas por solicitud",
    });
  }

  const lecturaInvalida = lecturas.find(
    (lectura) =>
      !lectura ||
      !isFiniteNumber(lectura.dato) ||
      parsePositiveInteger(lectura.tipo_dato_id, null) === null,
  );

  if (lecturaInvalida) {
    return res.status(400).json({
      error: "Cada lectura debe incluir dato numérico y tipo_dato_id válido",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM gateway WHERE id=? AND activo=1 FOR UPDATE", [req.gateway.id]);

    // Verifica que el dispositivo exista
    const [dispositivo] = await connection.query(
      `SELECT id, estado, tipo_alimentacion, intervalo_lectura_segundos, bateria_porcentaje
       FROM dispositivo WHERE id = ? FOR UPDATE`,
      [dispositivo_id],
    );
    if (dispositivo.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Dispositivo ${dispositivo_id} no encontrado` });
    }

    if (dispositivo[0].estado !== "OPERATIVO") {
      await connection.rollback();
      return res.status(409).json({ error: "El nodo no está en estado administrativo OPERATIVO; no se aceptan lecturas productivas" });
    }
    const [assignment] = await connection.query(`SELECT id FROM gateway_node_assignment
      WHERE gateway_id=? AND dispositivo_id=? AND firmware_node_id=? AND activo=1`,
    [req.gateway.id, Number(dispositivo_id), Number(firmware_node_id)]);
    if (!assignment.length) {
      await connection.rollback();
      return res.status(403).json({ error: "El nodo/ID de firmware no está asignado a este gateway" });
    }
    const currentAssignmentRevision = await calculateGatewayAssignmentRevision(connection, req.gateway.id);
    const assignmentIsCurrent = assignment_revision.toLowerCase() === currentAssignmentRevision;

    // Verifica que todos los tipo_dato_id existan
    const tiposDatoIds = [...new Set(lecturas.map((l) => l.tipo_dato_id))];
    const [tiposEncontrados] = await connection.query(
      "SELECT id FROM tipo_dato WHERE id IN (?)",
      [tiposDatoIds],
    );
    const idsEncontrados = tiposEncontrados.map((t) => t.id);
    const idsInvalidos = tiposDatoIds.filter(
      (id) => !idsEncontrados.includes(id),
    );
    if (idsInvalidos.length > 0) {
      await connection.rollback();
      return res.status(404).json({
        error: `Los siguientes tipo_dato_id no existen: ${idsInvalidos.join(", ")}`,
      });
    }

    const [sensors] = await connection.query(`SELECT s.id, s.estado, ns.sensor_firmware_id, ns.canal, s.tipo_dispositivo_id
      FROM nodo_sensor ns JOIN sensor s ON s.id=ns.sensor_id
      WHERE ns.dispositivo_id=? AND ns.activo=1`, [dispositivo_id]);
    const prepared = [];
    const itemResults = [];
    const batchKeys = new Set();
    for (const reading of lecturas) {
      if (!assignmentIsCurrent) {
        itemResults.push({ sensor_id: reading.sensor_id ? Number(reading.sensor_id) : null, tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: "stale_assignment_revision", action: "quarantine_resync_manifest_no_retry" });
        continue;
      }
      if (!reading.sensor_id) {
        itemResults.push({ sensor_id: null, tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: "sensor_id_required", action: "resync_manifest_no_retry" });
        continue;
      }
      const sensor = sensors.find((candidate) => Number(candidate.id) === Number(reading.sensor_id));
      if (!sensor) { itemResults.push({ sensor_id: Number(reading.sensor_id), tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: "sensor_not_assigned", action: "resync_manifest_no_retry" }); continue; }
      if (typeof reading.sensor_firmware_id !== "string" || reading.sensor_firmware_id !== sensor.sensor_firmware_id || typeof reading.canal !== "string" || reading.canal !== sensor.canal) {
        itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: "stale_or_unknown_sensor_mapping", action: "quarantine_resync_manifest_no_retry" });
        continue;
      }
      if (sensor.estado !== "OPERATIVO" && sensor.estado !== "ACTIVO") {
        itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: sensor.estado === "EN MANTENIMIENTO" ? "maintenance_local_only" : `sensor_${sensor.estado.toLowerCase()}`, action: "keep_local_no_retry" });
        continue;
      }
      const [compatible] = await connection.query(`SELECT td.id AS tipo_dato_id, td.unidad,
        c.installation_min, c.installation_max, c.manufacturer_min, c.manufacturer_max,
        COALESCE(c.calibration_status,'NOT_RECORDED') AS calibration_status
        FROM tipo_dispositivo_tipo_dato m JOIN tipo_dato td ON td.id=m.tipo_dato_id
        LEFT JOIN sensor_measurement_config c ON c.sensor_id=? AND c.tipo_dato_id=td.id
        WHERE m.tipo_dispositivo_id=? AND td.id=? LIMIT 1`, [sensor.id, sensor.tipo_dispositivo_id, reading.tipo_dato_id]);
      if (!compatible.length) { itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "rejected", reason: "type_not_supported", action: "resync_manifest_no_retry", received_value: Number(reading.dato) }); continue; }
      const measurementValidation = validateSensorMeasurement(reading.dato, reading.unidad, compatible[0]);
      if (!measurementValidation.valid) {
        itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "rejected",
          reason: measurementValidation.reason, action: "quarantine_inspect_sensor_or_mapping",
          received_value: Number(reading.dato), received_unit: reading.unidad ?? null,
          validation_details: { expected_unit: compatible[0].unidad, bounds: measurementValidation.bounds || null,
            calibration_status: compatible[0].calibration_status } });
        continue;
      }
      const batchKey = `${sensor.id}:${reading.tipo_dato_id}`;
      if (batchKeys.has(batchKey)) { itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "duplicate" }); continue; }
      batchKeys.add(batchKey);
      const [duplicate] = await connection.query(`SELECT lectura_id FROM gateway_telemetry_dedupe
        WHERE gateway_id=? AND firmware_node_id=? AND boot_id=? AND seq=? AND sensor_id=? AND tipo_dato_id=?`,
      [req.gateway.id, Number(firmware_node_id), boot_id, Number(seq), Number(sensor.id), Number(reading.tipo_dato_id)]);
      if (duplicate.length) itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "duplicate", lectura_id: duplicate[0].lectura_id });
      else {
        prepared.push({ ...reading, sensor_id: sensor.id, manifest_revision, assignment_revision });
        itemResults.push({ sensor_id: Number(sensor.id), tipo_dato_id: reading.tipo_dato_id, status: "accepted",
          unidad: measurementValidation.unit, unit_assumed: measurementValidation.unit_assumed,
          calibration_status: measurementValidation.calibration_status });
      }
    }

    // Store each accepted sensor sample with its physical sensor identity.
    const bateriaActualizada = dispositivo[0].tipo_alimentacion === "CORRIENTE_DIRECTA"
      ? null
      : bateria_porcentaje === undefined
        ? dispositivo[0].bateria_porcentaje
        : bateria_porcentaje === ""
          ? null
          : bateria_porcentaje;
    const bateriaRecibida = dispositivo[0].tipo_alimentacion === "BATERIA" && bateria_porcentaje !== undefined;
    const intervaloActualizado = intervaloRecibido === undefined || intervaloRecibido === null || intervaloRecibido === ""
      ? null
      : Number(intervaloRecibido);

    for (const reading of prepared) {
      const [result] = await connection.query(`INSERT INTO lecturas
        (dato, dispositivo_id, tipo_dato_id, sensor_id, bateria_porcentaje, created_at, captured_at, sample_uptime_ms)
        VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)` ,
        [reading.dato, dispositivo_id, reading.tipo_dato_id, reading.sensor_id, bateriaActualizada, time_quality === "SYNCED" && captured_at ? new Date(captured_at) : null, Number(sample_uptime_ms)]);
      await connection.query(`INSERT INTO gateway_telemetry_dedupe
        (gateway_id, firmware_node_id, boot_id, seq, sensor_id, tipo_dato_id, manifest_revision, assignment_revision, lectura_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.gateway.id, Number(firmware_node_id), boot_id, Number(seq), reading.sensor_id, reading.tipo_dato_id, reading.manifest_revision, reading.assignment_revision, result.insertId]);
    }
    for (const rejected of itemResults.filter((item) => item.status === "rejected")) {
      const original = lecturas.find((reading) => Number(reading.sensor_id || 0) === Number(rejected.sensor_id || 0) && Number(reading.tipo_dato_id) === Number(rejected.tipo_dato_id));
      await connection.query(`INSERT INTO gateway_telemetry_rejection
        (gateway_id,dispositivo_id,firmware_node_id,boot_id,seq,sensor_id,sensor_firmware_id,canal,tipo_dato_id,received_value,received_unit,validation_details,reason,manifest_revision,assignment_revision)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.gateway.id, Number(dispositivo_id), Number(firmware_node_id), boot_id, Number(seq),
        rejected.sensor_id || null, original?.sensor_firmware_id || null, original?.canal || null,
        rejected.tipo_dato_id || null, original?.dato === undefined ? rejected.received_value ?? null : Number(original.dato),
        original?.unidad ?? rejected.received_unit ?? null, rejected.validation_details ? JSON.stringify(rejected.validation_details) : null,
        rejected.reason, manifest_revision, assignment_revision]);
    }

    await connection.query(
      `UPDATE dispositivo
       SET intervalo_lectura_segundos = COALESCE(?, intervalo_lectura_segundos),
           bateria_porcentaje = ?,
           bateria_actualizada_at = CASE
             WHEN ? = 0 THEN bateria_actualizada_at
             WHEN ? IS NULL THEN NULL
             ELSE NOW()
           END
       WHERE id = ?`,
      [
        intervaloActualizado,
        bateriaActualizada,
        bateriaRecibida ? 1 : 0,
        bateriaActualizada,
        dispositivo_id,
      ],
    );

    await connection.commit();
    res.status(prepared.length ? 201 : 200).json({
      schema_version: 1,
      accepted: true,
      message: `${prepared.length} lecturas productivas registradas; heartbeat se informa por endpoint separado`,
      duplicate_count: itemResults.filter((item) => item.status === "duplicate").length,
      time_quality,
      gateway_received_at: new Date().toISOString(),
      items: itemResults,
      dispositivo_id,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al registrar lecturas:", error.message);
    res.status(500).json({ error: "Error al registrar las lecturas" });
  } finally {
    connection.release();
  }
});

// PATCH /api/lecturas/:id -> corregir un dato o tipo_dato_id de una lectura
router.patch("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { dato, tipo_dato_id } = req.body;

  const campos = [];
  const valores = [];

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (tipo_dato_id !== undefined) {
      const [tipo] = await connection.query(
        "SELECT id FROM tipo_dato WHERE id = ?",
        [tipo_dato_id],
      );
      if (tipo.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Tipo de dato ${tipo_dato_id} no encontrado` });
      }
      campos.push("tipo_dato_id = ?");
      valores.push(tipo_dato_id);
    }

    if (dato !== undefined && !isFiniteNumber(dato)) {
      await connection.rollback();
      return res.status(400).json({ error: "dato debe ser un número válido" });
    }

    if (dato !== undefined) {
      campos.push("dato = ?");
      valores.push(dato);
    }

    if (campos.length === 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ error: "Debes enviar al menos un campo para actualizar" });
    }

    valores.push(id);

    const [result] = await connection.query(
      `UPDATE lecturas SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Lectura ${id} no encontrada` });
    }

    await connection.commit();
    res.json({ message: `Lectura ${id} actualizada correctamente` });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar lectura:", error.message);
    res.status(500).json({ error: "Error al actualizar la lectura" });
  } finally {
    connection.release();
  }
});

// DELETE /api/lecturas/:id -> eliminar una lectura
router.delete("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query("DELETE FROM lecturas WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Lectura ${id} no encontrada` });
    }
    res.json({ message: `Lectura ${id} eliminada correctamente` });
  } catch (error) {
    console.error("Error al eliminar lectura:", error.message);
    res.status(500).json({ error: "Error al eliminar la lectura" });
  }
});

export default router;
