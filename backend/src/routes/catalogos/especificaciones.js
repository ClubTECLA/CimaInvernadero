import { Router } from "express";
import { pool } from "../../db.js";

const router = Router();

// GET /api/especificaciones -> todas las especificaciones
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM especificaciones ORDER BY id ASC",
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar especificaciones:", error.message);
    res.status(500).json({ error: "Error al consultar las especificaciones" });
  }
});

// GET /api/especificaciones/:id -> una especificación por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM especificaciones WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: `Especificación ${id} no encontrada` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar especificación:", error.message);
    res.status(500).json({ error: "Error al consultar la especificación" });
  }
});

// POST /api/especificaciones -> crear nueva especificación
router.post("/", async (req, res) => {
  const { largo, ancho, altura } = req.body;

  if (largo === undefined || ancho === undefined || altura === undefined) {
    return res
      .status(400)
      .json({ error: "largo, ancho y altura son requeridos" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO especificaciones (largo, ancho, altura) VALUES (?, ?, ?)",
      [largo, ancho, altura],
    );
    res.status(201).json({ id: result.insertId, largo, ancho, altura });
  } catch (error) {
    console.error("Error al crear especificación:", error.message);
    res.status(500).json({ error: "Error al crear la especificación" });
  }
});

// PATCH /api/especificaciones/:id -> actualizar solo los campos enviados
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { largo, ancho, altura } = req.body;

  // Construye dinámicamente solo los campos que llegaron
  const campos = [];
  const valores = [];

  if (largo !== undefined) {
    campos.push("largo = ?");
    valores.push(largo);
  }
  if (ancho !== undefined) {
    campos.push("ancho = ?");
    valores.push(ancho);
  }
  if (altura !== undefined) {
    campos.push("altura = ?");
    valores.push(altura);
  }

  if (campos.length === 0) {
    return res
      .status(400)
      .json({ error: "Debes enviar al menos un campo para actualizar" });
  }

  valores.push(id); // el id va al final para el WHERE

  try {
    const [result] = await pool.query(
      `UPDATE especificaciones SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `Especificación ${id} no encontrada` });
    }
    res.json({ message: `Especificación ${id} actualizada correctamente` });
  } catch (error) {
    console.error("Error al actualizar especificación:", error.message);
    res.status(500).json({ error: "Error al actualizar la especificación" });
  }
});

// DELETE /api/especificaciones/:id -> eliminar una especificación
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algún dispositivo usa esta especificación antes de borrar
    const [dispositivos] = await pool.query(
      "SELECT id FROM dispositivo WHERE specs_id = ?",
      [id],
    );
    if (dispositivos.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${dispositivos.length} dispositivo(s) usan esta especificación`,
      });
    }

    const [result] = await pool.query(
      "DELETE FROM especificaciones WHERE id = ?",
      [id],
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: `Especificación ${id} no encontrada` });
    }
    res.json({ message: `Especificación ${id} eliminada correctamente` });
  } catch (error) {
    console.error("Error al eliminar especificación:", error.message);
    res.status(500).json({ error: "Error al eliminar la especificación" });
  }
});

export default router;
