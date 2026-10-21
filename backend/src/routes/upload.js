import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

import { verificarToken } from "../middleware/auth.js";
import { pool } from "../db.js";

const router = Router();
const uploadDirectory = path.resolve("uploads/dispositivos");

fs.mkdirSync(uploadDirectory, { recursive: true });

const extensionsByMimeType = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    // Nombre único para evitar sobreescribir archivos
    const extension = extensionsByMimeType[file.mimetype];
    const nombre = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    cb(null, nombre);
  },
});

// Solo acepta imágenes
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error("Solo se permiten imágenes JPG, PNG o WebP");
      error.status = 400;
      cb(error);
    }
  },
  limits: { fileSize: 8 * 1024 * 1024 }, // máximo 8 MB
});

// POST /api/uploads/dispositivos
router.post(
  "/dispositivos",
  verificarToken,
  upload.single("imagen"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ninguna imagen" });
    }

    // Devuelve la ruta pública donde quedó guardada la imagen
    const ruta = `/uploads/dispositivos/${req.file.filename}`;
    res.status(201).json({ image_path: ruta });
  },
);

// DELETE /api/uploads/dispositivos: elimina un archivo cuando ya no tiene referencias.
router.delete("/dispositivos", verificarToken, async (req, res) => {
  const { image_path } = req.body;
  const prefijo = "/uploads/dispositivos/";
  if (
    typeof image_path !== "string" ||
    !image_path.startsWith(prefijo) ||
    path.basename(image_path) !== image_path.slice(prefijo.length) ||
    !/^[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(path.basename(image_path))
  ) {
    return res.status(400).json({ error: "La ruta de imagen no es válida" });
  }

  try {
    const [referencias] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM dispositivo WHERE image_path = ?) +
        (SELECT COUNT(*) FROM tipo_dispositivo WHERE image_path = ?) AS total`,
      [image_path, image_path],
    );
    if (Number(referencias[0].total) > 0) {
      return res.status(409).json({ error: "La imagen todavía está asignada" });
    }

    const rutaArchivo = path.resolve(uploadDirectory, path.basename(image_path));
    if (path.dirname(rutaArchivo) !== uploadDirectory) {
      return res.status(400).json({ error: "La ruta de imagen no es válida" });
    }
    await fs.promises.unlink(rutaArchivo).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    res.json({ message: "Imagen eliminada correctamente" });
  } catch (error) {
    console.error("Error al eliminar la imagen:", error.message);
    res.status(500).json({ error: "No fue posible eliminar la imagen" });
  }
});

export default router;
