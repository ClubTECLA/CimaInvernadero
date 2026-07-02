import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lecturasRouter from './routes/lecturas.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Endpoint de salud, útil para verificar que el contenedor está vivo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'invernadero-uabc-backend' });
});

app.use('/api/lecturas', lecturasRouter);

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en el puerto ${PORT}`);
});
