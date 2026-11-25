import { API_URL } from "./api";
import { fetchAuth } from "./fetchAuth";

let comandoEnCurso = false;
const commandStorageKey = "cima.gateway.command-history.v1";

function guardarEstadoComando(comando) {
  const commandId = comando?.command_id || comando?.id;
  if (!commandId || typeof localStorage === "undefined") return;
  try {
    const stored = JSON.parse(localStorage.getItem(commandStorageKey) || "[]");
    const history = Array.isArray(stored) ? stored.filter((item) => item.command_id !== commandId) : [];
    history.unshift({ command_id: commandId, estado: comando.estado || "DESCONOCIDO", updated_at: new Date().toISOString() });
    localStorage.setItem(commandStorageKey, JSON.stringify(history.slice(0, 10)));
    window.dispatchEvent(new CustomEvent("gateway-command-history-updated"));
  } catch { /* command status remains available from the API by ID */ }
}

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

/** Encola una orden y resuelve solo cuando el nodo confirma aplicación o rechazo. */
export async function enviarComandoAlGateway({ nodoId, tipo, payload, timeoutSeconds = 15, onPending }) {
  if (comandoEnCurso) throw new Error("Hay otro cambio esperando confirmación. Espere antes de enviar uno nuevo.");
  comandoEnCurso = true;
  try {
  const timeoutValido = Math.min(86400, Math.max(60, Number(timeoutSeconds) || 60));
  const idempotencyKey = uuid();
  const crear = await fetchAuth(`${API_URL}/api/gateway/v1/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodo_id: nodoId, tipo, payload, timeout_seconds: timeoutValido, idempotency_key: idempotencyKey }),
  });
  const comando = await leerJson(crear);
  guardarEstadoComando(comando);
  const expiraEn = new Date(comando.vence_at).getTime();
  const publicar = (estado) => {
    guardarEstadoComando(estado);
    onPending?.({
      ...estado,
      mensaje_estado: estado.estado === "EN_COLA" ? "Guardado; esperando la próxima ventana de comunicación del gateway/nodo." :
        estado.estado === "RECIBIDO_GATEWAY" ? "El gateway recibió el comando; espera confirmación de la aplicación del nodo." :
          estado.estado === "RECIBIDO_NODO" ? "El nodo recibió el comando; aún falta confirmar que lo aplicó." :
            estado.estado === "SIN_CONFIRMACION" ? "Venció sin confirmación; el resultado físico es desconocido." : "",
    });
  };
  publicar(comando);

  while (Date.now() < expiraEn) {
    const respuesta = await fetchAuth(`${API_URL}/api/gateway/v1/commands/${comando.id}`);
    const estado = await leerJson(respuesta);
    publicar(estado);
    if (estado.estado === "APLICADO_NODO") return estado;
    if (estado.estado === "RECHAZADO_NODO") throw new Error(estado.respuesta || "El nodo rechazó el comando.");
    if (["SIN_CONFIRMACION", "VENCIDO", "FALLIDO", "CONFIRMADO"].includes(estado.estado)) {
      throw new Error("El comando terminó con un estado sin semántica de aplicación verificable; consulta el registro histórico antes de inferir el resultado del nodo.");
    }
    await esperar(Math.min(2000, Math.max(100, expiraEn - Date.now())));
  }
  throw new Error("El comando sigue sin confirmación; vuelve a consultar el estado para reconciliar el resultado.");
  } finally {
    comandoEnCurso = false;
  }
}
