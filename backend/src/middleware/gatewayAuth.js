import { timingSafeEqual } from "node:crypto";

export function verificarGateway(req, res, next) {
  const claveConfigurada = process.env.GATEWAY_API_KEY;
  if (!claveConfigurada) {
    return res.status(503).json({ error: "La autenticación del gateway aún no está configurada" });
  }

  const claveRecibida = req.get("x-gateway-key") || "";
  const recibida = Buffer.from(claveRecibida);
  const esperada = Buffer.from(claveConfigurada);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return res.status(401).json({ error: "Gateway no autorizado" });
  }
  next();
}
