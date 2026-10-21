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
  const minutosTotales = Math.max(1, Math.round(valor / 60));
  if (minutosTotales < 60) {
    return `${minutosTotales} ${minutosTotales === 1 ? "minuto" : "minutos"}`;
  }

  const horas = Math.floor(minutosTotales / 60);
  const minutosRestantes = minutosTotales % 60;
  const textoHoras = `${horas} ${horas === 1 ? "hora" : "horas"}`;
  return minutosRestantes
    ? `${textoHoras} ${minutosRestantes} ${minutosRestantes === 1 ? "minuto" : "minutos"}`
    : textoHoras;
}

export function mostrarIntervaloConfigurado(dispositivo) {
  const intervaloObservado = dispositivo?.intervalo_calculado_segundos;
  return intervaloObservado === null || intervaloObservado === undefined || intervaloObservado === ""
    ? "Pendiente de lectura válida"
    : mostrarIntervaloLectura(intervaloObservado);
}

export function mostrarFecha(valor) {
  if (!valor) return "Sin comunicación";
  return new Date(valor).toLocaleString("es-MX");
}
