import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/lecturas -> devuelve las últimas lecturas registradas
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM lecturas_sensores ORDER BY fecha_registro DESC LIMIT 50'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al consultar lecturas:', error.message);
    res.status(500).json({ error: 'Error al consultar las lecturas' });
  }
});

// POST /api/lecturas -> registra una nueva lectura de temperatura/humedad
router.post('/', async (req, res) => {
  const { temperatura, humedad } = req.body;

  if (temperatura === undefined || humedad === undefined) {
    return res.status(400).json({ error: 'temperatura y humedad son requeridas' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO lecturas_sensores (temperatura, humedad) VALUES (?, ?)',
      [temperatura, humedad]
    );
    res.status(201).json({ id: result.insertId, temperatura, humedad });
  } catch (error) {
    console.error('Error al registrar lectura:', error.message);
    res.status(500).json({ error: 'Error al registrar la lectura' });
  }
});

export default router;
