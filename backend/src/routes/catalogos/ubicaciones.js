import { Router } from "express";

import { pool } from "../../db.js";
import { verificarToken } from "../../middleware/auth.js";

const router = Router();

function validarDatos(body) {
  const { nombre, largo, ancho, altura } = body;
  const medidas = [largo, ancho, altura].map(Number);
  if (!String(nombre || "").trim()) return { error: "El nombre de la ubicación es obligatorio" };
  if (medidas.some((valor) => !Number.isFinite(valor) || valor <= 0)) return { error: "Las medidas deben ser números mayores que cero" };
  return { nombre: String(nombre).trim(), largo: Math.round(medidas[0] * 100) / 100, ancho: Math.round(medidas[1] * 100) / 100, altura: Math.round(medidas[2] * 100) / 100 };
}

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM ubicacion ORDER BY id ASC");
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar las ubicaciones:", error.message);
    res.status(500).json({ error: "No fue posible consultar las ubicaciones" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM ubicacion WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Ubicación no encontrada" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No fue posible consultar la ubicación" });
  }
});

router.post("/", verificarToken, async (req, res) => {
  const datos = validarDatos(req.body);
  if (datos.error) return res.status(400).json({ error: datos.error });
  try {
    const [result] = await pool.query(
      "INSERT INTO ubicacion (nombre, largo, ancho, altura, descripcion, image_path, map_image_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [datos.nombre, datos.largo, datos.ancho, datos.altura, req.body.descripcion || null, req.body.image_path || null, req.body.map_image_path || null],
    );
    res.status(201).json({ id: result.insertId, ...datos });
  } catch (error) {
    console.error("Error al crear ubicación:", error.message);
    res.status(500).json({ error: "No fue posible crear la ubicación" });
  }
});

router.patch("/:id", verificarToken, async (req, res) => {
  const datos = validarDatos(req.body);
  if (datos.error) return res.status(400).json({ error: datos.error });
  try {
    const [result] = await pool.query(
      "UPDATE ubicacion SET nombre = ?, largo = ?, ancho = ?, altura = ?, descripcion = ?, image_path = ?, map_image_path = ? WHERE id = ?",
      [datos.nombre, datos.largo, datos.ancho, datos.altura, req.body.descripcion || null, req.body.image_path || null, req.body.map_image_path || null, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Ubicación no encontrada" });
    res.json({ id: Number(req.params.id), ...datos });
  } catch (error) {
    console.error("Error al actualizar ubicación:", error.message);
    res.status(500).json({ error: "No fue posible actualizar la ubicación" });
  }
});

router.delete("/:id", verificarToken, async (req, res) => {
  if (Number(req.params.id) === 1) return res.status(409).json({ error: "La ubicación principal no se puede eliminar" });
  try {
    const [[conteo]] = await pool.query(
      "SELECT (SELECT COUNT(*) FROM zona WHERE ubicacion_id = ?) AS zonas, (SELECT COUNT(*) FROM dispositivo d JOIN zona z ON z.id = d.zona_id WHERE z.ubicacion_id = ?) AS nodos, (SELECT COUNT(*) FROM lecturas l JOIN dispositivo d ON d.id = l.dispositivo_id JOIN zona z ON z.id = d.zona_id WHERE z.ubicacion_id = ?) AS lecturas",
      [req.params.id, req.params.id, req.params.id],
    );
    if (Number(conteo.zonas) > 0 || Number(conteo.nodos) > 0 || Number(conteo.lecturas) > 0) return res.status(409).json({ error: "No se puede eliminar una ubicación que tiene zonas, nodos o lecturas asociadas. El historial debe conservarse." });
    const [result] = await pool.query("DELETE FROM ubicacion WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Ubicación no encontrada" });
    res.json({ message: "Ubicación eliminada correctamente" });
  } catch (error) {
    console.error("Error al eliminar ubicación:", error.message);
    res.status(500).json({ error: "No fue posible eliminar la ubicación" });
  }
});

export default router;
