import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import lecturasRouter from "./routes/lecturas.js";
import catalogosRouter from "./routes/catalogos/index.js";
import dispositivosRouter from "./routes/dispositivos.js";
import uploadsRouter from "./routes/upload.js";
import { migrate } from "./database/migrate.js";
import { seed } from "./database/seed.js";
import { pool } from "./db.js";
import { fileURLToPath } from "url";
import path from "path";
import authRouter from "./routes/auth.js";
import gatewayCommandsRouter from "./routes/gatewayCommands.js";

dotenv.config();

const app = express();
app.set("etag", false);
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  cors({
    origin: [
      "https://cima-invernadero.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
      ...corsOrigins,
    ],
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", authRouter);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
});

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
app.use("/api/dispositivos", dispositivosRouter);
app.use("/api/gateway", gatewayCommandsRouter);
app.use("/api/catalogos", catalogosRouter);
app.use("/api/uploads", uploadsRouter);

app.use((error, req, res, next) => {
  if (error?.name === "MulterError") {
    return res.status(400).json({ error: error.message });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "El cuerpo JSON no es válido" });
  }

  if (error?.status === 400) {
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    console.error("Error no controlado:", error.message);
    return res.status(500).json({ error: "Error interno del servidor" });
  }

  next();
});

// Inicializa la base de datos y arranca el servidor
async function inicializar() {
  const MAX_INTENTOS = 5;
  const ESPERA = 3000; // 3 segundos entre intentos

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      await migrate();

      if (process.env.RUN_SEED === "true") {
        await seed();
      }

      return; // si llegó aquí, todo salió bien
    } catch (error) {
      console.error(
        `❌ Intento ${intento}/${MAX_INTENTOS} fallido:`,
        error.message,
      );
      if (intento === MAX_INTENTOS) {
        console.error("❌ No se pudo conectar a la base de datos");
        process.exit(1);
      }
      console.log(`⏳ Reintentando en ${ESPERA / 1000} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, ESPERA));
    }
  }
}

await inicializar();

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en el puerto ${PORT}`);
});
