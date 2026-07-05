import { Router } from "express";
import { pool } from "../../db.js";

const router = Router();

// GET /api/tipo_dispositivo -> todos los tipos de datos
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM tipo_dispositivo ORDER BY id ASC",
    );
    res.json(rows);
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
router.post("/", async (req, res) => {
  const { nombre, descripcion, image_path } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "nombre es requerido" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO tipo_dispositivo (nombre, descripcion, image_path) VALUES (?, ?, ?)",
      [nombre, descripcion ?? null, image_path ?? null],
    );
    res.status(201).json({
      id: result.insertId,
      nombre,
      descripcion: descripcion ?? null,
      image_path: image_path ?? null,
    });
  } catch (error) {
    console.error("Error al crear tipo de dispositivo:", error.message);
    res.status(500).json({ error: "Error al crear el tipo de dispositivo" });
  }
});

// PATCH /api/tipo_dispositivo/:id -> actualizar solo los campos enviados
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, image_path } = req.body;

  const campos = [];
  const valores = [];

  if (nombre !== undefined) {
    campos.push("nombre = ?");
    valores.push(nombre);
  }
  if (descripcion !== undefined) {
    campos.push("descripcion = ?");
    valores.push(descripcion);
  }
  if (image_path !== undefined) {
    campos.push("image_path = ?");
    valores.push(image_path);
  }

  if (campos.length === 0) {
    return res
      .status(400)
      .json({ error: "Debes enviar al menos un campo para actualizar" });
  }

  valores.push(id);

  try {
    const [result] = await pool.query(
      `UPDATE tipo_dispositivo SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `tipo de dispositivo ${id} no encontrado` });
    }
    res.json({
      message: `tipo de dispositivo ${id} actualizado correctamente`,
    });
  } catch (error) {
    console.error("Error al actualizar tipo de dispositivo:", error.message);
    res
      .status(500)
      .json({ error: "Error al actualizar el tipo de dispositivo" });
  }
});

// DELETE /api/tipo_dispositivo/:id -> eliminar un tipo de dispositivo
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algún dispositivo usa este tipo de dispositivo antes de borrar
    const [dispositivos] = await pool.query(
      "SELECT id FROM dispositivo WHERE tipo_id = ?",
      [id],
    );
    if (dispositivos.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${dispositivos.length} dispositivo(s) usan este tipo de dispositivo`,
      });
    }

    const [result] = await pool.query(
      "DELETE FROM tipo_dispositivo WHERE id = ?",
      [id],
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `tipo de dispositivo ${id} no encontrado` });
    }
    res.json({ message: `tipo de dispositivo ${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error al eliminar tipo de dispositivo:", error.message);
    res.status(500).json({ error: "Error al eliminar el tipo de dispositivo" });
  }
});

export default router;
