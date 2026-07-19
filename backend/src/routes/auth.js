import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/login", (req, res) => {
  const { usuario, password } = req.body;

  if (
    usuario !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const token = jwt.sign({ usuario }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  res.json({ token });
});

export default router;
