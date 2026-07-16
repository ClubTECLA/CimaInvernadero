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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

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
app.use("/api/catalogos", catalogosRouter);
app.use("/api/uploads", uploadsRouter);

// Inicializa la base de datos y arranca el servidor
async function inicializar() {
  const MAX_INTENTOS = 5;
  const ESPERA = 3000; // 3 segundos entre intentos

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      await migrate();
      await seed();
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
