import { Router } from "express";
import { pool } from "../../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { verificarToken } from "../../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

async function guardarTiposDato(connection, tipoId, tipoDatoIds) {
  if (!Array.isArray(tipoDatoIds)) return;
  const ids = [...new Set(tipoDatoIds.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new Error("La selección de tipos de datos no es válida");
  }
  if (ids.length) {
    const [validos] = await connection.query("SELECT id FROM tipo_dato WHERE id IN (?)", [ids]);
    if (validos.length !== ids.length) throw new Error("Uno o más tipos de datos no existen");
  }
  await connection.query("DELETE FROM tipo_dispositivo_tipo_dato WHERE tipo_dispositivo_id = ?", [tipoId]);
  if (ids.length) {
    await connection.query(
      "INSERT INTO tipo_dispositivo_tipo_dato (tipo_dispositivo_id, tipo_dato_id) VALUES ?",
      [ids.map((id) => [tipoId, id])],
    );
  }
}

// GET /api/tipo_dispositivo -> todos los tipos de datos
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, COALESCE(GROUP_CONCAT(m.tipo_dato_id ORDER BY m.tipo_dato_id), '') AS tipo_dato_ids
      FROM tipo_dispositivo t
      LEFT JOIN tipo_dispositivo_tipo_dato m ON m.tipo_dispositivo_id = t.id
      GROUP BY t.id ORDER BY t.id ASC
    `);
    res.json(rows.map((row) => ({ ...row, tipo_dato_ids: row.tipo_dato_ids ? row.tipo_dato_ids.split(",").map(Number) : [] })));
  } catch (error) {
    console.error("Error al consultar el tipo de dispositivo:", error.message);
    res
      .status(500)
      .json({ error: "Error al consultar los tipos de dispositivos" });
  }
});

// GET /api/tipo_dispositivo/:id -> un tipo de dispositivo por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM tipo_dispositivo WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: `tipo de dispositivo ${id} no encontrado` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar tipo de dispositivo:", error.message);
    res
      .status(500)
      .json({ error: "Error al consultar el tipo de dispositivo" });
  }
});

// POST /api/tipo_dispositivo -> crear nuevo tipo de dispositivo
router.post("/", verificarToken, async (req, res) => {
  const { nombre, categoria = "SENSOR", descripcion, image_path, tipo_dato_ids = [] } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "nombre es requerido" });
  }

  if (!["SENSOR", "ACTUADOR"].includes(categoria)) {
    return res.status(400).json({ error: "La categoría debe ser SENSOR o ACTUADOR" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      "INSERT INTO tipo_dispositivo (nombre, categoria, descripcion, image_path) VALUES (?, ?, ?, ?)",
      [nombre, categoria, descripcion ?? null, image_path ?? null],
    );
    if (categoria === "SENSOR") await guardarTiposDato(connection, result.insertId, tipo_dato_ids);
    await connection.commit();
    res.status(201).json({
      id: result.insertId,
      nombre,
      categoria,
      descripcion: descripcion ?? null,
      image_path: image_path ?? null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al crear tipo de dispositivo:", error.message);
    const validacion = error.message.startsWith("La selección") || error.message.includes("tipos de datos no existen");
    res.status(validacion ? 400 : 500).json({ error: error.message || "Error al crear el tipo de dispositivo" });
  } finally {
    connection.release();
  }
});

// PATCH /api/tipo_dispositivo/:id -> actualizar solo los campos enviados
router.patch("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, descripcion, image_path, tipo_dato_ids } = req.body;

  const campos = [];
  const valores = [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (image_path !== undefined) {
      const [actual] = await connection.query(
        "SELECT image_path FROM tipo_dispositivo WHERE id = ?",
        [id],
      );

      if (actual[0]?.image_path && actual[0].image_path !== image_path) {
        const rutaVieja = path.join(
          __dirname,
          "../../../uploads",
          actual[0].image_path.replace("/uploads/", ""),
        );
        fs.unlink(rutaVieja, (err) => {
          if (err)
            console.error("No se pudo borrar imagen vieja:", err.message);
        });
      }

      campos.push("image_path = ?");
      valores.push(image_path);
    }

    if (nombre !== undefined) {
      campos.push("nombre = ?");
      valores.push(nombre);
    }
    if (categoria !== undefined) {
      if (!["SENSOR", "ACTUADOR"].includes(categoria)) {
        await connection.rollback();
        return res.status(400).json({ error: "La categoría debe ser SENSOR o ACTUADOR" });
      }
      const [actual] = await connection.query("SELECT categoria FROM tipo_dispositivo WHERE id = ?", [id]);
      if (!actual.length) { await connection.rollback(); return res.status(404).json({ error: "Tipo de dispositivo no encontrado" }); }
      if (actual[0].categoria !== categoria) {
        const [usos] = await connection.query(
          "SELECT (SELECT COUNT(*) FROM sensor WHERE tipo_dispositivo_id = ?) + (SELECT COUNT(*) FROM actuador WHERE tipo_dispositivo_id = ?) AS total",
          [id, id],
        );
        if (Number(usos[0].total) > 0) {
          await connection.rollback();
          return res.status(409).json({ error: "No se puede cambiar la categoría mientras el tipo esté asignado a nodos" });
        }
      }
      campos.push("categoria = ?");
      valores.push(categoria);
    }
    if (descripcion !== undefined) {
      campos.push("descripcion = ?");
      valores.push(descripcion);
    }

    if (campos.length === 0 && tipo_dato_ids === undefined) {
      await connection.rollback();
      return res
        .status(400)
        .json({ error: "Debes enviar al menos un campo para actualizar" });
    }

    let affectedRows = 1;
    if (campos.length) {
      valores.push(id);
      const [result] = await connection.query(`UPDATE tipo_dispositivo SET ${campos.join(", ")} WHERE id = ?`, valores);
      affectedRows = result.affectedRows;
    }

    if (affectedRows === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Tipo de dispositivo ${id} no encontrado` });
    }

    if (tipo_dato_ids !== undefined || categoria === "ACTUADOR") {
      const [tipo] = await connection.query("SELECT categoria FROM tipo_dispositivo WHERE id = ?", [id]);
      if (!tipo.length) { await connection.rollback(); return res.status(404).json({ error: "Tipo de dispositivo no encontrado" }); }
      await guardarTiposDato(connection, id, tipo[0].categoria === "SENSOR" ? (tipo_dato_ids || []) : []);
    }

    await connection.commit();
    res.json({
      message: `Tipo de dispositivo ${id} actualizado correctamente`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar tipo de dispositivo:", error.message);
    const validacion = error.message.startsWith("La selección") || error.message.includes("tipos de datos no existen");
    res
      .status(validacion ? 400 : 500)
      .json({ error: error.message || "Error al actualizar el tipo de dispositivo" });
  } finally {
    connection.release();
  }
});

// DELETE /api/tipo_dispositivo/:id -> eliminar un tipo de dispositivo
router.delete("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    const [dispositivos] = await pool.query(
      "SELECT id FROM dispositivo WHERE tipo_id = ?",
      [id],
    );
    if (dispositivos.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${dispositivos.length} dispositivo(s) usan este tipo`,
      });
    }

    const [componentes] = await pool.query(
      "SELECT (SELECT COUNT(*) FROM sensor WHERE tipo_dispositivo_id = ?) + (SELECT COUNT(*) FROM actuador WHERE tipo_dispositivo_id = ?) AS total",
      [id, id],
    );
    if (Number(componentes[0].total) > 0) {
      return res.status(409).json({ error: "No se puede eliminar, el tipo está asignado a uno o más nodos" });
    }

    // Obtén la imagen antes de borrar
    const [tipo] = await pool.query(
      "SELECT image_path FROM tipo_dispositivo WHERE id = ?",
      [id],
    );

    const [result] = await pool.query(
      "DELETE FROM tipo_dispositivo WHERE id = ?",
      [id],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `Tipo de dispositivo ${id} no encontrado` });
    }

    // Borra la imagen si tenía una
    if (tipo[0]?.image_path) {
      const rutaArchivo = path.join(
        __dirname,
        "../../../uploads",
        tipo[0].image_path.replace("/uploads/", ""),
      );
      fs.unlink(rutaArchivo, (err) => {
        if (err) console.error("No se pudo borrar la imagen:", err.message);
      });
    }

    res.json({ message: `Tipo de dispositivo ${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error al eliminar tipo de dispositivo:", error.message);
    res.status(500).json({ error: "Error al eliminar el tipo de dispositivo" });
  }
});

export default router;
