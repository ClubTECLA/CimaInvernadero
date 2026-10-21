import { API_URL } from "./api";
import { fetchAuth } from "./fetchAuth";

let comandoEnCurso = false;

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (caracter) => {
    const aleatorio = Math.floor(Math.random() * 16);
    return (caracter === "x" ? aleatorio : (aleatorio & 0x3) | 0x8).toString(16);
  });
}

async function leerJson(respuesta) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || `La solicitud falló (${respuesta.status})`);
  return datos;
}

const esperar = (milisegundos) => new Promise((resolver) => window.setTimeout(resolver, milisegundos));

/** Encola una orden y resuelve solo cuando el gateway la confirma, falla o vence. */
export async function enviarComandoAlGateway({ nodoId, tipo, payload, timeoutSeconds = 15, onPending }) {
  if (comandoEnCurso) throw new Error("Hay otro cambio esperando confirmación. Espere antes de enviar uno nuevo.");
  comandoEnCurso = true;
  try {
  const timeoutValido = Math.min(120, Math.max(5, Number(timeoutSeconds) || 15));
  const idempotencyKey = uuid();
  const inicio = Date.now();
  const crear = await fetchAuth(`${API_URL}/api/gateway/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodo_id: nodoId, tipo, payload, timeout_seconds: timeoutValido, idempotency_key: idempotencyKey }),
  });
  const comando = await leerJson(crear);
  onPending?.(comando);

  while (Date.now() - inicio < timeoutValido * 1000) {
    const respuesta = await fetchAuth(`${API_URL}/api/gateway/commands/${comando.id}`);
    const estado = await leerJson(respuesta);
    if (estado.estado === "CONFIRMADO") return estado;
    if (estado.estado === "FALLIDO") throw new Error(estado.respuesta || "El gateway informó que no pudo aplicar el cambio.");
    if (estado.estado === "VENCIDO") throw new Error("El gateway no respondió dentro del tiempo esperado.");
    await esperar(Math.min(750, Math.max(100, timeoutValido * 1000 - (Date.now() - inicio))));
  }
  throw new Error("Se agotó el tiempo de espera de la confirmación del gateway.");
  } finally {
    comandoEnCurso = false;
  }
}
