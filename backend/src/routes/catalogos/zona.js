import { Router } from "express";
import { pool } from "../../db.js";

const router = Router();

// GET /api/zona -> todas las zonas
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM zona ORDER BY id ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar las zonas:", error.message);
    res.status(500).json({ error: "Error al consultar las zonas" });
  }
});

// GET /api/zona/:id -> una zona por id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query("SELECT * FROM zona WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar la zona:", error.message);
    res.status(500).json({ error: "Error al consultar la zona" });
  }
});

// POST /api/zona -> crear nueva zona
router.post("/", async (req, res) => {
  const { zona } = req.body;

  if (!zona) {
    return res.status(400).json({ error: "La zona es requeridos" });
  }

  try {
    const [result] = await pool.query("INSERT INTO zona (zona) VALUES (?)", [
      zona,
    ]);
    res.status(201).json({ id: result.insertId, zona });
  } catch (error) {
    console.error("Error al crear zona:", error.message);
    res.status(500).json({ error: "Error al crear la zona" });
  }
});

// PATCH /api/zona/:id -> actualizar una zona
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { zona } = req.body;

  if (!zona) {
    return res.status(400).json({ error: "La zona es requerida" });
  }

  try {
    const [result] = await pool.query("UPDATE zona SET zona = ? WHERE id = ?", [
      zona,
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    res.json({ id: Number(id), zona });
  } catch (error) {
    console.error("Error al actualizar zona:", error.message);
    res.status(500).json({ error: "Error al actualizar la zona" });
  }
});

// DELETE /api/zona/:id -> eliminar una zona
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algún dispositivo usa esta zona antes de borrar
    const [dispositivos] = await pool.query(
      "SELECT id FROM dispositivo WHERE zona_id = ?",
      [id],
    );
    if (dispositivos.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${dispositivos.length} dispositivo(s) usan esta zona`,
      });
    }

    const [result] = await pool.query("DELETE FROM zona WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Zona ${id} no encontrada` });
    }
    res.json({ message: `Zona ${id} eliminada correctamente` });
  } catch (error) {
    console.error("Error al eliminar zona:", error.message);
    res.status(500).json({ error: "Error al eliminar la zona" });
  }
});

export default router;
