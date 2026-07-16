import { Router } from "express";
import multer from "multer";
import path from "path";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/dispositivos/");
  },
  filename: (req, file, cb) => {
    // Nombre único para evitar sobreescribir archivos
    const nombre = `${Date.now()}-${file.originalname}`;
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
      cb(new Error("Solo se permiten imágenes JPG, PNG o WebP"));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // máximo 2MB
});

// POST /api/uploads/dispositivos
router.post("/dispositivos", upload.single("imagen"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen" });
  }

  // Devuelve la ruta pública donde quedó guardada la imagen
  const ruta = `/uploads/dispositivos/${req.file.filename}`;
  res.status(201).json({ image_path: ruta });
});

export default router;
