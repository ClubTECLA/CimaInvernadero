import { Router } from "express";
import { pool } from "../../db.js";

const router = Router();

// GET /api/tipo_dato -> todos los tipos de datos
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM tipo_dato ORDER BY id ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar el tipo de dato:", error.message);
    res.status(500).json({ error: "Error al consultar los tipos de datos" });
  }
});

// GET /api/tipo_dato/:id -> un tipo de dato por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM tipo_dato WHERE id = ?", [
      id,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: `Tipo de dato ${id} no encontrado` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar tipo de dato:", error.message);
    res.status(500).json({ error: "Error al consultar el tipo de dato" });
  }
});

// POST /api/tipo_dato -> crear nuevo tipo de dato
router.post("/", async (req, res) => {
  const { nombre, unidad } = req.body;

  if (!nombre || !unidad) {
    return res.status(400).json({ error: "nombre y unidad son requeridos" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO tipo_dato (nombre, unidad) VALUES (?, ?)",
      [nombre, unidad],
    );
    res.status(201).json({ id: result.insertId, nombre, unidad });
  } catch (error) {
    console.error("Error al crear tipo de dato:", error.message);
    res.status(500).json({ error: "Error al crear el tipo de dato" });
  }
});

// PATCH /api/tipo_dato/:id -> actualizar solo los campos enviados
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, unidad } = req.body;

  const campos = [];
  const valores = [];

  if (nombre !== undefined) {
    campos.push("nombre = ?");
    valores.push(nombre);
  }
  if (unidad !== undefined) {
    campos.push("unidad = ?");
    valores.push(unidad);
  }

  if (campos.length === 0) {
    return res
      .status(400)
      .json({ error: "Debes enviar al menos un campo para actualizar" });
  }

  valores.push(id);

  try {
    const [result] = await pool.query(
      `UPDATE tipo_dato SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `Tipo de dato ${id} no encontrado` });
    }
    res.json({ message: `Tipo de dato ${id} actualizado correctamente` });
  } catch (error) {
    console.error("Error al actualizar tipo de dato:", error.message);
    res.status(500).json({ error: "Error al actualizar el tipo de dato" });
  }
});

// DELETE /api/tipo_dato/:id -> eliminar un tipo de dato
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algúna lectura usa este tipo de dato antes de borrar
    const [lecturas] = await pool.query(
      "SELECT id FROM lecturas WHERE tipo_dato_id = ?",
      [id],
    );
    if (lecturas.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${lecturas.length} lectura(s) usan este tipo de dato`,
      });
    }

    const [result] = await pool.query("DELETE FROM tipo_dato WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `Tipo de dato ${id} no encontrado` });
    }
    res.json({ message: `Tipo de dato ${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error al eliminar tipo de dato:", error.message);
    res.status(500).json({ error: "Error al eliminar el tipo de dato" });
  }
});

export default router;
