import { useCallback, useEffect, useMemo, useState } from "react";
import Container from "react-bootstrap/Container";
import { FiToggleRight } from "react-icons/fi";
import ReglasActuador from "./ReglasActuador";

import { API_URL } from "../../utils/api";
import { fetchAuth } from "../../utils/fetchAuth";
import { mostrarIntervaloLectura } from "../../utils/dispositivoFormatters";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import LocationSelect from "../ui/LocationSelect";

const INTERVALOS_PARA_MARCAR_SIN_CONEXION = 1;

async function leerRespuesta(respuesta, mensaje) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || mensaje);
  return datos;
}

function tiempoDesdeReporte(segundos) {
  if (segundos < 60) return "hace menos de 1 min";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return minutosRestantes ? `hace ${horas} h ${minutosRestantes} min` : `hace ${horas} h`;
}

function obtenerEstadoComunicacion(nodo, ahora) {
  if (nodo.estado_comunicacion === "ATRASADO") {
    const fecha = nodo.ultima_comunicacion ? new Date(nodo.ultima_comunicacion).getTime() : NaN;
    const segundos = Number.isFinite(fecha) ? Math.max(0, (ahora - fecha) / 1000) : 0;
    const margen = Number(nodo.heartbeat_grace_seconds) || 120;
    const plazo = Number(nodo.management_poll_interval_seconds || 600) * INTERVALOS_PARA_MARCAR_SIN_CONEXION + margen;
    return { clase: "sin-conexion", etiqueta: "Nodo sin conexión", detalle: `No se reciben heartbeats desde ${tiempoDesdeReporte(segundos)}. El plazo es ${mostrarIntervaloLectura(plazo)}; esto no cambia el estado administrativo del nodo ni detiene su control autónomo.` };
  }
  if (!nodo.ultima_comunicacion) {
    return {
      clase: "sin-reporte",
      etiqueta: "Sin reporte inicial",
      detalle: "Aún no se recibe información del nodo; no es posible confirmar el estado actual del actuador.",
    };
  }

  const fechaReporte = new Date(nodo.ultima_comunicacion).getTime();
  if (!Number.isFinite(fechaReporte)) {
    return { clase: "indeterminado", etiqueta: "Conexión sin determinar", detalle: "No se pudo interpretar la fecha del último reporte." };
  }

  const intervalo = Number(nodo.management_poll_interval_seconds || nodo.intervalo_lectura_segundos || nodo.intervalo_calculado_segundos);
  if (!Number.isFinite(intervalo) || intervalo <= 0) {
    return {
      clase: "indeterminado",
      etiqueta: "Conexión sin determinar",
      detalle: `Último reporte ${tiempoDesdeReporte(Math.max(0, (ahora - fechaReporte) / 1000))}. Falta un intervalo de lectura para determinar si hay desconexión.`,
    };
  }

  const segundosSinReporte = Math.max(0, (ahora - fechaReporte) / 1000);
  const umbral = intervalo * INTERVALOS_PARA_MARCAR_SIN_CONEXION + (Number(nodo.heartbeat_grace_seconds) || 120);
  const sinConexion = segundosSinReporte >= umbral;
  const tiempo = tiempoDesdeReporte(segundosSinReporte);
  const plazo = mostrarIntervaloLectura(umbral);
  return sinConexion
    ? {
        clase: "sin-conexion",
        etiqueta: "Nodo sin conexión",
        detalle: `No se reciben reportes desde ${tiempo}. Se considera sin conexión después de ${plazo} sin datos. El actuador puede continuar de forma autónoma, pero no se puede confirmar su estado actual.`,
      }
    : {
        clase: "reciente",
        etiqueta: "Comunicación reciente",
        detalle: `Último reporte ${tiempo}. Si no llegan datos durante ${plazo}, se mostrará “Nodo sin conexión”.`,
      };
}

function Control() {
  const { isAuthenticated } = useAuth();
  const { ubicacionId } = useLocation();
  const [nodos, setNodos] = useState([]);
  const [filtroUbicacion, setFiltroUbicacion] = useState(ubicacionId);
  const [tiposDispositivo, setTiposDispositivo] = useState([]);
  const [tiposDato, setTiposDato] = useState([]);
  const [componentesPorNodo, setComponentesPorNodo] = useState({});
  const [reglasPorActuador, setReglasPorActuador] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), 15000);
    return () => window.clearInterval(reloj);
  }, []);

  const nodosFiltrados = useMemo(
    () => nodos.filter((nodo) => !filtroUbicacion || String(nodo.ubicacion_id) === String(filtroUbicacion)),
    [nodos, filtroUbicacion],
  );
  const actuadores = useMemo(
    () => nodosFiltrados.flatMap((nodo) => (componentesPorNodo[nodo.id] || []).filter((item) => item.categoria === "ACTUADOR")),
    [componentesPorNodo, nodosFiltrados],
  );
  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [nodosRespuesta, tiposRespuesta, tiposDatoRespuesta] = await Promise.all([
        fetch(`${API_URL}/api/dispositivos`),
        fetch(`${API_URL}/api/catalogos/tipos-dispositivo`),
        fetch(`${API_URL}/api/catalogos/tipos-dato`),
      ]);
      const listaNodos = await leerRespuesta(nodosRespuesta, "No fue posible cargar los nodos");
      const listaTipos = await leerRespuesta(tiposRespuesta, "No fue posible cargar los tipos");
      const listaTiposDato = await leerRespuesta(tiposDatoRespuesta, "No fue posible cargar los tipos de dato");
      const mapa = {};
      await Promise.all(listaNodos.map(async (nodo) => {
        const respuesta = await fetch(`${API_URL}/api/dispositivos/nodos/${nodo.id}/componentes`);
        mapa[nodo.id] = await leerRespuesta(respuesta, `No fue posible cargar los componentes de ${nodo.nombre}`);
      }));
      const reglas = {};
      const actuadoresNodo = listaNodos.flatMap((nodo) => (mapa[nodo.id] || [])
        .filter((item) => item.categoria === "ACTUADOR")
        .map((actuador) => ({ nodo, actuador })));
      await Promise.all(actuadoresNodo.map(async ({ nodo, actuador }) => {
        const respuesta = await fetch(`${API_URL}/api/dispositivos/nodos/${nodo.id}/actuadores/${actuador.id}/reglas`);
        reglas[actuador.id] = await leerRespuesta(respuesta, `No fue posible cargar las reglas de ${actuador.tipo || actuador.nombre}`);
      }));
      setNodos(listaNodos);
      setTiposDispositivo(listaTipos);
      setTiposDato(listaTiposDato);
      setComponentesPorNodo(mapa);
      setReglasPorActuador(reglas);
    } catch (err) {
      setError(err.message || "No fue posible cargar la configuración de actuadores");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (ubicacionId && String(filtroUbicacion) !== String(ubicacionId)) setFiltroUbicacion(ubicacionId);
  }, [ubicacionId, filtroUbicacion]);

  async function quitarActuador(actuador, nodo) {
    if (!window.confirm(`¿Quitar ${actuador.tipo || actuador.nombre} de ${nodo.nombre}?`)) return;
    setError("");
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodo.id}/componentes/actuador/${actuador.id}`, { method: "DELETE" });
      await leerRespuesta(respuesta, "No fue posible quitar el actuador");
      setMensaje("Actuador quitado del nodo.");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="control-page">
      <Container className="control-shell">
        <div className="control-header">
          <div>
            <h1>Control automático</h1>
            <p>Para que aparezca una tarea automática, primero registre el actuador en un nodo y después, configure aquí su regla.</p>
            <p className="control-connectivity-note"><strong>Importante:</strong> La conectividad se calcula con el último heartbeat y la cadencia de gestión del nodo. Si vence esa ventana, se mostrará «Nodo sin conexión»; esto no cambia el estado administrativo ni confirma que un actuador físico se haya detenido. La plataforma no podrá confirmar su estado hasta recibir otro heartbeat.</p>
          </div>
        </div>

        {error && <div className="control-inline-error" role="alert">{error}</div>}
        {mensaje && <div className="alert alert-success py-2">{mensaje}</div>}

        <div className="actuator-management-list">
          <div className="section-heading">
            <h2>Asignados a nodos</h2>
            <div className="d-flex align-items-center gap-2">
              <LocationSelect id="actuator-location-filter" value={filtroUbicacion} onChange={setFiltroUbicacion} label="Ubicación" labelClassName="visually-hidden" className="device-location-select" />
              <span className="sensor-count">{actuadores.length}</span>
            </div>
          </div>
          {cargando ? <p className="text-muted">Cargando…</p> : actuadores.length ? (
            nodosFiltrados.map((nodo) => {
              const delNodo = (componentesPorNodo[nodo.id] || []).filter((item) => item.categoria === "ACTUADOR");
              if (!delNodo.length) return null;
              return <section className="actuator-node-group" key={nodo.id}>
                <h3>{nodo.nombre}<small>{nodo.zona || "Sin zona asignada"}</small></h3>
                {delNodo.map((actuador) => {
                  const estadoComunicacion = obtenerEstadoComunicacion(nodo, ahora);
                  return <article className="actuator-management-row" key={actuador.id}>
                  <span className="actuator-management-icon"><FiToggleRight /></span>
                  <div className="actuator-management-info"><strong>{actuador.tipo || actuador.nombre}</strong></div>
                  <span className="actuator-management-data">{reglasPorActuador[actuador.id]?.length ? "Configurado" : "Configuración pendiente"}</span>
                  <div className="actuator-row-actions">
                    <span className={`node-communication-indicator is-${estadoComunicacion.clase}`} title={estadoComunicacion.detalle} aria-label={estadoComunicacion.detalle}>
                      {estadoComunicacion.etiqueta}
                    </span>
                    {isAuthenticated && <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => quitarActuador(actuador, nodo)}>Quitar</button>}
                  </div>
                  <span className={`actuator-output-indicator ${actuador.encendido ? "is-on" : ""}`} aria-label={`Último estado guardado de la salida: ${actuador.encendido ? "encendida" : "apagada"}`} title="Es el último estado guardado en la plataforma; no confirma la posición física de la salida.">
                    Estado guardado: salida {actuador.encendido ? "encendida" : "apagada"}
                  </span>
                  <ReglasActuador
                    nodo={nodo}
                    actuador={actuador}
                    sensores={(componentesPorNodo[nodo.id] || []).filter((item) => item.categoria === "SENSOR")}
                    tiposDispositivo={tiposDispositivo}
                    tiposDato={tiposDato}
                    reglasIniciales={reglasPorActuador[actuador.id] || []}
                    isAuthenticated={isAuthenticated}
                    onSaved={cargar}
                  />
                </article>;
                })}
              </section>;
            })
          ) : <div className="actuator-empty"><FiToggleRight /><h2>Aún no hay actuadores asignados</h2><p>Registre un actuador al crear o editar un nodo. Después, configure aquí su regla para crear una tarea automática.</p></div>}
        </div>

      </Container>
    </section>
  );
}

export default Control;
