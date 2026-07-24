import { Router } from "express";
import { pool } from "../../db.js";

import { verificarToken } from "../../middleware/auth.js";

const router = Router();

// GET /api/proposito -> todas las propositos
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM proposito ORDER BY id ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar los propositos:", error.message);
    res.status(500).json({ error: "Error al consultar los propositos" });
  }
});

// GET /api/proposito/:id -> un proposito por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM proposito WHERE id = ?", [
      id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: `proposito ${id} no encontrado` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar el proposito:", error.message);
    res.status(500).json({ error: "Error al consultar el proposito" });
  }
});

// POST /api/proposito -> crear nuevo proposito
router.post("/", verificarToken, async (req, res) => {
  const { proposito } = req.body;

  if (!proposito) {
    return res.status(400).json({ error: "El proposito es requerido" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO proposito (nombre) VALUES (?)",
      [proposito],
    );
    res.status(201).json({ id: result.insertId, proposito });
  } catch (error) {
    console.error("Error al crear proposito:", error.message);
    res.status(500).json({ error: "Error al crear el proposito" });
  }
});

// PATCH /api/proposito/:id -> actualizar un proposito
router.patch("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { proposito } = req.body;

  if (!proposito) {
    return res.status(400).json({ error: "El proposito es requerido" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE proposito SET nombre = ? WHERE id = ?",
      [proposito, id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `proposito ${id} no encontrado` });
    }
    res.json({ id: Number(id), proposito });
  } catch (error) {
    console.error("Error al actualizar proposito:", error.message);
    res.status(500).json({ error: "Error al actualizar el proposito" });
  }
});

// DELETE /api/proposito/:id -> eliminar un proposito
router.delete("/:id", verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algún dispositivo usa este proposito antes de borrar
    const [dispositivos] = await pool.query(
      "SELECT id FROM dispositivo WHERE proposito_id = ?",
      [id],
    );
    if (dispositivos.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${dispositivos.length} dispositivo(s) usan este proposito`,
      });
    }

    const [result] = await pool.query("DELETE FROM proposito WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `proposito ${id} no encontrado` });
    }
    res.json({ message: `proposito ${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error al eliminar proposito:", error.message);
    res.status(500).json({ error: "Error al eliminar el proposito" });
  }
});

export default router;
