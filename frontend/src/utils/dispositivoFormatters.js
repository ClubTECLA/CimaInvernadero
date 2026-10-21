export const estadoClases = {
  OPERATIVO: "estado-operativo",
  INACTIVO: "estado-inactivo",
  "EN MANTENIMIENTO": "estado-mantenimiento",
  FALLANDO: "estado-fallando",
};

export const estadoEtiquetas = {
  OPERATIVO: "Operativo",
  INACTIVO: "Inactivo",
  "EN MANTENIMIENTO": "Mantenimiento",
  FALLANDO: "Problemas o fallas",
};

export const propositoClases = {
  General: "estado-operativo",
  Mantenimiento: "estado-mantenimiento",
  Otro: "estado-inactivo",
};

export function mostrarPorcentajeBateria(valor) {
  if (valor === null || valor === undefined || valor === "") return "Porcentaje aún no recibido";
  const porcentaje = Number(valor);
  if (!Number.isFinite(porcentaje)) return "Porcentaje aún no recibido";
  return `${porcentaje.toFixed(1)}%`;
}

export function mostrarIntervaloLectura(segundos) {
  if (segundos === null || segundos === undefined || segundos === "") {
    return "Sin dato";
  }

  const valor = Number(segundos);
  if (!Number.isFinite(valor)) return "Sin dato";
  const minutos = Math.round((valor / 60) * 10) / 10;
  const minutosTexto = Number.isInteger(minutos)
    ? String(minutos)
    : minutos.toLocaleString("es-MX", { maximumFractionDigits: 1 });
  return `${minutosTexto} min`;
}

export function mostrarIntervaloConfigurado(dispositivo) {
  const intervaloObservado = dispositivo?.intervalo_calculado_segundos;
  return intervaloObservado === null || intervaloObservado === undefined || intervaloObservado === ""
    ? "Pendiente de primera lectura"
    : mostrarIntervaloLectura(intervaloObservado);
}

export function mostrarFecha(valor) {
  if (!valor) return "Sin comunicación";
  return new Date(valor).toLocaleString("es-MX");
}
