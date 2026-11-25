import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "../db.js";

export async function verificarGateway(req, res, next) {
  const gatewayId = Number(req.get("x-gateway-id"));
  const apiKey = req.get("x-gateway-key") || "";
  if (!Number.isInteger(gatewayId) || gatewayId < 1 || apiKey.length < 32 || apiKey.length > 256) {
    return res.status(401).json({ error: "Credenciales de gateway no válidas" });
  }
  try {
    const [rows] = await pool.query("SELECT id, credential_hash FROM gateway WHERE id=? AND activo=1", [gatewayId]);
    const suppliedHash = createHash("sha256").update(apiKey).digest();
    const storedHash = rows.length ? Buffer.from(rows[0].credential_hash, "hex") : Buffer.alloc(32);
    if (!rows.length || storedHash.length !== suppliedHash.length || !timingSafeEqual(suppliedHash, storedHash)) {
      return res.status(401).json({ error: "Gateway no autorizado" });
    }
    req.gateway = { id: gatewayId };
    return next();
  } catch (error) {
    console.error("No fue posible validar las credenciales del gateway:", error.message);
    return res.status(503).json({ error: "No fue posible validar el gateway" });
  }
}
