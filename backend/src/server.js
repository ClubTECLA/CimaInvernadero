import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import lecturasRouter from "./routes/lecturas.js";
import catalogosRouter from "./routes/catalogos/index.js";
import dispositivosRouter from "./routes/dispositivos.js";
import { migrate } from "./database/migrate.js";
import { seed } from "./database/seed.js";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    const [lecturas] = await pool.query(
      "SELECT COUNT(*) as total FROM lecturas",
    );
    const [dispositivos] = await pool.query(
      "SELECT COUNT(*) as total FROM dispositivo WHERE estado = 'OPERATIVO'",
    );
    const [ultimaLectura] = await pool.query(
      "SELECT created_at FROM lecturas ORDER BY created_at DESC LIMIT 1",
    );

    res.json({
      status: "ok",
      servicio: "invernadero-uabc-backend",
      total_lecturas: lecturas[0].total,
      dispositivos_operativos: dispositivos[0].total,
      ultima_lectura: ultimaLectura[0]?.created_at ?? null,
    });
  } catch (error) {
    res.status(500).json({ status: "error", mensaje: error.message });
  }
});

app.use("/api/lecturas", lecturasRouter);
app.use("api/dispositivos", dispositivosRouter);
app.use("/api/catalogos", catalogosRouter);

// Inicializa la base de datos y arranca el servidor
try {
  await migrate();
  await seed();
} catch (error) {
  console.error("❌ Error al inicializar la base de datos:", error.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en el puerto ${PORT}`);
});
