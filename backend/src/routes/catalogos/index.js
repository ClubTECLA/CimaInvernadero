import { Router } from "express";
import zonasRouter from "./zona.js";
import tiposDispositivoRouter from "./tipo_dispositivo.js";
import tiposDatoRouter from "./tipo_dato.js";
import especificacionesRouter from "./especificaciones.js";

const router = Router();

router.use("/zonas", zonasRouter);
router.use("/tipos-dispositivo", tiposDispositivoRouter);
router.use("/tipos-dato", tiposDatoRouter);
router.use("/especificaciones", especificacionesRouter);

export default router;
