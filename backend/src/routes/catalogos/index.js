import { Router } from "express";
import zonasRouter from "./zona.js";
import tiposDispositivoRouter from "./tipo_dispositivo.js";
import tiposDatoRouter from "./tipo_dato.js";
import especificacionesRouter from "./especificaciones.js";
import propositosRouter from "./propositos.js";
import ubicacionesRouter from "./ubicaciones.js";

const router = Router();

router.use("/zonas", zonasRouter);
router.use("/tipos-dispositivo", tiposDispositivoRouter);
router.use("/tipos-dato", tiposDatoRouter);
router.use("/especificaciones", especificacionesRouter);
router.use("/propositos", propositosRouter);
router.use("/ubicaciones", ubicacionesRouter);

export default router;
