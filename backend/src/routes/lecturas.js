import { Router } from "express";
import { pool } from "../db.js";

import { verificarToken } from "../middleware/auth.js";

const router = Router();

// GET /api/lecturas -> todas las lecturas, con filtros opcionales
router.get("/", async (req, res) => {
  const { dispositivo_id, tipo_dato_id, zona_id, tipo_dispositivo_id } =
    req.query;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
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
  if (tipo_dispositivo_id !== undefined) {
    condiciones.push("d.tipo_id = ?");
    valores.push(tipo_dispositivo_id);
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
        td.nombre  AS tipo_dato,
        td.unidad,
        d.nombre   AS dispositivo,
        z.zona     AS zona,
        t.nombre   AS tipo_dispositivo
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      JOIN zona             z  ON d.zona_id        = z.id
      JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
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
      JOIN zona             z  ON d.zona_id        = z.id
      JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
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

// GET /api/lecturas/exportar?filtros...
router.get("/exportar", async (req, res) => {
  const { dispositivo_id, tipo_dato_id, zona_id, tipo_dispositivo_id } =
    req.query;

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
  if (tipo_dispositivo_id) {
    condiciones.push("d.tipo_id = ?");
    valores.push(tipo_dispositivo_id);
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
        z.zona
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      JOIN zona             z  ON d.zona_id        = z.id
      JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      ${where}
      ORDER BY l.created_at DESC
    `,
      valores,
    );

    const encabezado = "ID,Dispositivo,Zona,Tipo de dato,Valor,Unidad,Fecha\n";
    const filas = rows
      .map(
        (l) =>
          `${l.id},"${l.dispositivo}","${l.zona}","${l.tipo_dato}",${l.dato},"${l.unidad}","${new Date(l.created_at).toLocaleString("es-MX")}"`,
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=lecturas.csv");
    res.send("\uFEFF" + encabezado + filas);
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
      SELECT l.id, l.dato, l.created_at,
             td.nombre AS tipo_dato, td.unidad,
             d.nombre AS dispositivo,
             z.zona AS zona,
             t.nombre AS tipo_dispositivo
      FROM lecturas l
      JOIN tipo_dato        td ON l.tipo_dato_id   = td.id
      JOIN dispositivo      d  ON l.dispositivo_id = d.id
      JOIN zona             z  ON d.zona_id        = z.id
      JOIN tipo_dispositivo t  ON d.tipo_id        = t.id
      INNER JOIN (
        SELECT tipo_dato_id, MAX(created_at) AS max_fecha
        FROM lecturas
        WHERE dispositivo_id = ?
        GROUP BY tipo_dato_id
      ) ult ON ult.tipo_dato_id = l.tipo_dato_id 
            AND ult.max_fecha   = l.created_at
      WHERE l.dispositivo_id = ?
      `,
      [dispositivo_id, dispositivo_id],
    );

    res.json({ datos: rows });
  } catch (error) {
    console.error("Error al consultar últimas lecturas:", error.message);
    res.status(500).json({ error: "Error al consultar las últimas lecturas" });
  }
});

// POST /api/lecturas -> recibe el payload del ESP32
router.post("/", async (req, res) => {
  const { dispositivo_id, lecturas } = req.body;

  if (
    !dispositivo_id ||
    !lecturas ||
    !Array.isArray(lecturas) ||
    lecturas.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "dispositivo_id y lecturas son requeridos" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verifica que el dispositivo exista
    const [dispositivo] = await connection.query(
      "SELECT id FROM dispositivo WHERE id = ?",
      [dispositivo_id],
    );
    if (dispositivo.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Dispositivo ${dispositivo_id} no encontrado` });
    }

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

    // Inserta todas las lecturas en una sola consulta
    const valores = lecturas.map((l) => [
      l.dato,
      dispositivo_id,
      l.tipo_dato_id,
      new Date(),
    ]);
    await connection.query(
      "INSERT INTO lecturas (dato, dispositivo_id, tipo_dato_id, created_at) VALUES ?",
      [valores],
    );

    await connection.commit();
    res.status(201).json({
      message: `${lecturas.length} lecturas registradas correctamente`,
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
router.patch("/:id", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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
