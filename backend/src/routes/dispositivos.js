import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /api/dispositivos -> dispositivos con sus especificaciones, zona y tipo
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        d.id,
        d.estado,
        d.nombre,
        d.created_at,
        e.altura AS especificaciones,
        e.ancho,
        e.largo,
        z.zona AS zona,
        t.nombre AS tipo_dispositivo,
        t.descripcion,
        t.image_path
      FROM dispositivo d
      JOIN especificaciones e ON d.specs_id = e.id
      JOIN zona z ON d.zona_id = z.id
      JOIN tipo_dispositivo t ON d.tipo_id = t.id
      ORDER BY d.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al consultar dispositivos:", error.message);
    res.status(500).json({ error: "Error al consultar los dispositivos" });
  }
});

// GET /api/dispositivos/:id -> un dispositivo con sus especificaciones, zona y tipo
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        d.id,
        d.estado,
        d.nombre,
        d.created_at,
        e.altura AS especificaciones,
        e.ancho,
        e.largo,
        z.zona AS zona,
        t.nombre AS tipo_dispositivo,
        t.descripcion,
        t.image_path
      FROM dispositivo d
      JOIN especificaciones e ON d.specs_id = e.id
      JOIN zona z ON d.zona_id = z.id
      JOIN tipo_dispositivo t ON d.tipo_id = t.id
      WHERE d.id = ?
      ORDER BY d.created_at DESC
    `,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar el dispositivo:", error.message);
    res.status(500).json({ error: "Error al consultar el dispositivo" });
  }
});

// POST /api/dispositivos
router.post("/", async (req, res) => {
  const { specs_id, zona_id, tipo_id, estado, nombre } = req.body;

  if (!zona_id || !tipo_id || !estado || !nombre) {
    return res
      .status(400)
      .json({ error: "la zona, tipo, estado y el nombre son requeridos" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (specs_id !== undefined) {
      const [especificaciones] = await connection.query(
        "SELECT id FROM especificaciones WHERE id = ?",
        [specs_id],
      );

      if (especificaciones.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Especificaciones ${specs_id} no encontradas` });
      }
    }

    const [zona] = await connection.query("SELECT id FROM zona WHERE id = ?", [
      zona_id,
    ]);

    if (zona.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Zona ${zona_id} no encontrada` });
    }

    const [tipo] = await connection.query(
      "SELECT id FROM tipo_dispositivo WHERE id = ?",
      [tipo_id],
    );

    if (tipo.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ error: `Tipo de dispositivo ${tipo_id} no encontrado` });
    }

    const [result] = await connection.query(
      "INSERT INTO dispositivo (specs_id, zona_id, tipo_id, estado, nombre) VALUES (?, ?, ?, ?, ?)",
      [specs_id, zona_id, tipo_id, estado, nombre],
    );

    await connection.commit();
    res.status(201).json({
      message: `Dispositivo registrado correctamente`,
      id: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al registrar dispositivo:", error.message);
    res.status(500).json({ error: "Error al registrar el dispositivo" });
  } finally {
    connection.release();
  }
});

// PATCH /api/dispositivos/:id -> actualizar solo los campos enviados
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { specs_id, zona_id, tipo_id, estado, nombre } = req.body;

  // Construye dinámicamente solo los campos que llegaron
  const campos = [];
  const valores = [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Revisar que las especificaciones existan
    if (specs_id !== undefined) {
      const [specs] = await connection.query(
        "SELECT id FROM especificaciones WHERE id = ?",
        [specs_id],
      );

      if (specs.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Especificaciones ${specs_id} no encontradas` });
      }

      campos.push("specs_id = ?");
      valores.push(specs_id);
    }

    // Revisar que la zona exista
    if (zona_id !== undefined) {
      const [zona] = await connection.query(
        "SELECT id FROM zona WHERE id = ?",
        [zona_id],
      );

      if (zona.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: `Zona ${zona_id} no encontrada` });
      }

      campos.push("zona_id = ?");
      valores.push(zona_id);
    }

    // Revisar que el tipo de dispositivo exista
    if (tipo_id !== undefined) {
      const [tipo] = await connection.query(
        "SELECT id FROM tipo_dispositivo WHERE id = ?",
        [tipo_id],
      );

      if (tipo.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `Tipo de dispositivo ${tipo_id} no encontrado` });
      }

      campos.push("tipo_id = ?");
      valores.push(tipo_id);
    }

    if (estado !== undefined) {
      campos.push("estado = ?");
      valores.push(estado);
    }
    if (nombre !== undefined) {
      campos.push("nombre = ?");
      valores.push(nombre);
    }

    if (campos.length === 0) {
      return res
        .status(400)
        .json({ error: "Debes enviar al menos un campo para actualizar" });
    }

    valores.push(id); // el id va al final para el WHERE

    const [result] = await connection.query(
      `UPDATE dispositivo SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );
    await connection.commit();
    res.status(200).json({
      message: `Dispositivo actualizado correctamente`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar dispositivo:", error.message);
    res.status(500).json({ error: "Error al actualizar el dispositivo" });
  } finally {
    connection.release();
  }
});

// DELETE /api/dispositivos/:id -> eliminar un dispositivo
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Verifica si algúna lectura usa este dispositivo antes de borrar
    const [lecturas] = await pool.query(
      "SELECT id FROM lecturas WHERE dispositivo_id = ?",
      [id],
    );
    if (lecturas.length > 0) {
      return res.status(409).json({
        error: `No se puede eliminar, ${lecturas.length} lectura(s) usan este dispositivo`,
      });
    }

    const [result] = await pool.query("DELETE FROM dispositivo WHERE id = ?", [
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Dispositivo ${id} no encontrado` });
    }
    res.json({ message: `Dispositivo ${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error al eliminar dispositivo:", error.message);
    res.status(500).json({ error: "Error al eliminar el dispositivo" });
  }
});

export default router;
