import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { API_URL } from "../../utils/api";
import { fetchAuth } from "../../utils/fetchAuth";

async function leerRespuesta(respuesta, mensaje) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || mensaje);
  return datos;
}

function decimalVisual(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : "0.00";
}

function fuentesParaDato(sensores, tiposDispositivo, tipoDatoId) {
  if (!tipoDatoId) return [];
  const sensoresFiltrados = sensores.filter((sensor) => {
    const tipoSensor = tiposDispositivo.find((tipo) => Number(tipo.id) === Number(sensor.tipo_id));
    return tipoSensor?.tipo_dato_ids?.some((id) => Number(id) === Number(tipoDatoId));
  });
  return sensoresFiltrados;
}

function crearReglaInicial(sensores, tiposDispositivo, tiposDato, reglasExistentes = []) {
  const usados = new Set(reglasExistentes.map((regla) => `${regla.sensor_id}:${regla.tipo_dato_id}`));
  const datosDisponibles = tiposDato.filter((dato) => fuentesParaDato(sensores, tiposDispositivo, dato.id)
    .some((sensor) => !usados.has(`${sensor.id}:${dato.id}`)));
  const dato = datosDisponibles[0];
  const fuentes = fuentesParaDato(sensores, tiposDispositivo, dato?.id)
    .filter((sensor) => !usados.has(`${sensor.id}:${dato?.id}`));
  return {
    sensor_id: fuentes.length ? String(fuentes[0].id) : "",
    tipo_dato_id: dato ? String(dato.id) : "",
    valor_minimo: "",
    valor_maximo: "",
    modo: "ACTIVAR_DEBAJO",
  };
}

function ReglasActuador({ nodo, actuador, sensores, tiposDispositivo, tiposDato, reglasIniciales = [], isAuthenticated, onSaved }) {
  const [editando, setEditando] = useState(false);
  const [reglas, setReglas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [campoError, setCampoError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const errorRef = useRef(null);

  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }, [error]);

  useEffect(() => {
    setReglas(reglasIniciales.map((regla) => ({
      ...regla,
      sensor_id: String(regla.sensor_id),
      tipo_dato_id: String(regla.tipo_dato_id),
      valor_minimo: decimalVisual(regla.valor_minimo),
      valor_maximo: decimalVisual(regla.valor_maximo),
    })));
  }, [reglasIniciales]);

  const datosDisponibles = tiposDato.filter((dato) => fuentesParaDato(sensores, tiposDispositivo, dato.id).length);
  const fuentesPorRegla = reglas.map((regla) => fuentesParaDato(sensores, tiposDispositivo, regla.tipo_dato_id));
  const estadosSensores = reglasIniciales.map((regla) =>
    sensores.find((sensor) => Number(sensor.id) === Number(regla.sensor_id))?.estado || regla.sensor_estado,
  );
  const sensoresNoOperativos = reglasIniciales.length > 0 && estadosSensores.some((estado) => estado !== "OPERATIVO");
  const nodoNoOperativo = nodo.estado !== "OPERATIVO";
  const bloqueoControl = nodoNoOperativo || actuador.estado !== "OPERATIVO" || sensoresNoOperativos;
  const motivoBloqueo = nodoNoOperativo
    ? "El nodo no está operativo."
    : actuador.estado !== "OPERATIVO"
      ? "El actuador no está operativo."
      : "No se pueden obtener uno o más datos de los sensores asociados.";
  function estadoSensor(regla) {
    if (!regla.sensor_estado || regla.sensor_estado === "OPERATIVO") return null;
    if (regla.sensor_estado === "EN MANTENIMIENTO") return { clase: "mantenimiento", texto: "Sensor en mantenimiento" };
    if (regla.sensor_estado === "FALLANDO") return { clase: "problemas", texto: "Sensor con problemas o fallas" };
    return { clase: "inactivo", texto: "Sensor inactivo" };
  }
  function cambiarRegla(indice, campo, valor) {
    setError("");
    setCampoError("");
    setReglas((actuales) => actuales.map((regla, posicion) => {
      if (posicion !== indice) return regla;
      if (campo === "tipo_dato_id") {
        const fuentes = fuentesParaDato(sensores, tiposDispositivo, valor);
        const fuenteActualDisponible = fuentes.some((sensor) => String(sensor.id) === String(regla.sensor_id));
        return {
          ...regla,
          tipo_dato_id: valor,
          sensor_id: fuentes.length === 1
            ? String(fuentes[0].id)
            : fuenteActualDisponible ? regla.sensor_id : "",
        };
      }
      return { ...regla, [campo]: valor };
    }));
  }

  async function guardarReglas() {
    setError("");
    setCampoError("");
    setMensaje("");
    if (!reglas.length) {
      setCampoError("dato");
      setError("Debe seleccionarse un dato y deben definirse sus límites.");
      return;
    }
    if (reglas.some((regla) => !regla.sensor_id || !regla.tipo_dato_id)) {
      setCampoError(reglas.find((regla) => !regla.tipo_dato_id) ? "dato" : "dispositivo");
      setError("Debe seleccionarse el dispositivo sensor y el tipo de dato correspondiente.");
      return;
    }
    if (reglas.some((regla) => regla.valor_minimo === "" || regla.valor_maximo === "" || !Number.isFinite(Number(regla.valor_minimo)) || !Number.isFinite(Number(regla.valor_maximo)) || Number(regla.valor_minimo) >= Number(regla.valor_maximo))) {
      const reglaInvalida = reglas.find((regla) => regla.valor_minimo === "" || regla.valor_maximo === "" || !Number.isFinite(Number(regla.valor_minimo)) || !Number.isFinite(Number(regla.valor_maximo)) || Number(regla.valor_minimo) >= Number(regla.valor_maximo));
      setCampoError(reglaInvalida?.valor_minimo === "" || !Number.isFinite(Number(reglaInvalida?.valor_minimo)) || Number(reglaInvalida?.valor_minimo) >= Number(reglaInvalida?.valor_maximo) ? "minimo" : "maximo");
      setError("Complete todos los límites y asegúrese de que el mínimo sea menor que el máximo.");
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodo.id}/actuadores/${actuador.id}/reglas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reglas: reglas.map((regla) => ({
          sensor_id: Number(regla.sensor_id),
          tipo_dato_id: Number(regla.tipo_dato_id),
          valor_minimo: Number(regla.valor_minimo),
          valor_maximo: Number(regla.valor_maximo),
          modo: regla.modo,
        })) }),
      });
      await leerRespuesta(respuesta, "No fue posible guardar las reglas");
      setEditando(false);
      setMensaje("Configuración guardada en el sistema. La comunicación con el ESP32 aún no está integrada, así que no hay confirmación de ejecución.");
      await onSaved();
    } catch (errorGuardar) {
      setError(errorGuardar.message);
    } finally {
      setGuardando(false);
    }
  }

  function agregarRegla() {
    const nueva = crearReglaInicial(sensores, tiposDispositivo, tiposDato, reglas);
    if (!nueva.tipo_dato_id) {
      setCampoError("dato");
      setError("No hay más datos disponibles para configurar.");
      return;
    }
    setReglas((actuales) => [...actuales, nueva]);
    setError("");
  }

  async function cambiarControlAutomatico(activo) {
    setError("");
    setMensaje("");
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodo.id}/componentes/actuador/${actuador.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ control_automatico_activo: activo }),
      });
      await leerRespuesta(respuesta, "No fue posible actualizar la tarea");
      setMensaje(activo
        ? "Activación guardada en el sistema. La comunicación con el ESP32 aún no está integrada, así que no hay confirmación de ejecución."
        : "Pausa guardada en el sistema. La comunicación con el ESP32 aún no está integrada, así que no hay confirmación de ejecución.");
      await onSaved();
    } catch (errorActualizar) {
      setError(errorActualizar.message);
    }
  }

  return (
    <section className="actuator-rules" aria-label={`Reglas de ${actuador.tipo || actuador.nombre}`}>
      <div className="actuator-rules-heading">
        <div><strong>Regla de tarea automática</strong><small>Dato y límites que controlan este actuador en {nodo.nombre}.</small></div>
        <div className="actuator-rules-controls">
          {isAuthenticated && reglasIniciales.length > 0 && <label className="actuator-task-control form-check form-switch"><span>{actuador.control_automatico_activo ? "Tarea activa" : "Tarea pausada"}</span><input type="checkbox" role="switch" className="form-check-input" aria-label={`${actuador.control_automatico_activo ? "Pausar" : "Activar"} tarea automática de ${actuador.tipo || actuador.nombre}`} checked={Boolean(actuador.control_automatico_activo)} disabled={guardando || (!actuador.control_automatico_activo && bloqueoControl)} title={bloqueoControl ? "El actuador y su sensor asociado deben estar operativos" : undefined} onChange={(event) => cambiarControlAutomatico(event.target.checked)} /></label>}
          {isAuthenticated && !editando && <button type="button" className="btn btn-outline-success btn-sm" onClick={() => { setReglas(reglasIniciales.length ? reglasIniciales.map((r) => ({ ...r, sensor_id: String(r.sensor_id), tipo_dato_id: String(r.tipo_dato_id), valor_minimo: decimalVisual(r.valor_minimo), valor_maximo: decimalVisual(r.valor_maximo) })) : [crearReglaInicial(sensores, tiposDispositivo, tiposDato)]); setError(""); setEditando(true); }}>{reglasIniciales.length ? "Editar reglas" : "Configurar reglas"}</button>}
        </div>
      </div>
      {bloqueoControl && reglasIniciales.length > 0 && <div className="actuator-rule-blocked" role="status"><FiAlertTriangle aria-hidden="true" /><div><strong>{actuador.estado !== "OPERATIVO" ? "Tarea pausada por estado del actuador" : nodoNoOperativo ? "Tarea pausada por estado del nodo" : "Tarea pausada por datos no disponibles"}</strong><span>{motivoBloqueo} La tarea podrá reactivarse cuando el estado operativo y los datos necesarios estén disponibles. Esta pausa es independiente de la conexión del nodo.</span></div></div>}

      {error && <div ref={errorRef} className="actuator-rule-error form-validation-alert" role="alert" tabIndex={-1}>{error}</div>}

      {editando ? <>
        {!sensores.length ? <>
          <p className="actuator-rule-empty">Este nodo aún no tiene sensores asignados. Debe agregarse uno al editar el nodo para configurar el actuador.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
        </> : <>
          {reglas.map((regla, indice) => <div className={`actuator-rule-form${(fuentesPorRegla[indice] || []).length > 1 ? " actuator-rule-form--multiple-sources" : ""}`} key={`${actuador.id}-rule-${indice}`}>
            <div className="actuator-rule-input">
              <label htmlFor={`rule-data-${actuador.id}-${indice}`}>Dato a monitorear</label>
              <select id={`rule-data-${actuador.id}-${indice}`} className={`form-select${campoError === "dato" ? " is-invalid" : ""}`} aria-invalid={campoError === "dato"} value={regla.tipo_dato_id} onChange={(event) => cambiarRegla(indice, "tipo_dato_id", event.target.value)} required disabled={!datosDisponibles.length}>
                <option value="" disabled>{datosDisponibles.length ? "Seleccionar dato" : "Sin datos disponibles"}</option>
                {datosDisponibles.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.nombre} ({tipo.unidad})</option>)}
              </select>
            </div>
            <div className="actuator-rule-input">
              <label htmlFor={`rule-source-${actuador.id}-${indice}`}>Dispositivo sensor</label>
              <select id={`rule-source-${actuador.id}-${indice}`} className={`form-select${campoError === "dispositivo" ? " is-invalid" : ""}`} aria-invalid={campoError === "dispositivo"} value={regla.sensor_id} onChange={(event) => cambiarRegla(indice, "sensor_id", event.target.value)} required disabled={!fuentesPorRegla[indice]?.length}>
                <option value="">Seleccionar dispositivo</option>
                {(fuentesPorRegla[indice] || []).map((sensor) => <option key={sensor.id} value={sensor.id}>{sensor.nombre || sensor.tipo} · ID {sensor.id}</option>)}
              </select>
            </div>
            <div className="actuator-rule-input">
              <label htmlFor={`rule-min-${actuador.id}-${indice}`}>Mínimo</label>
              <input id={`rule-min-${actuador.id}-${indice}`} className={`form-control${campoError === "minimo" ? " is-invalid" : ""}`} aria-invalid={campoError === "minimo"} type="number" step="0.01" value={regla.valor_minimo} onChange={(event) => cambiarRegla(indice, "valor_minimo", event.target.value)} onBlur={(event) => { const valor = event.target.value; if (valor !== "" && Number.isFinite(Number(valor))) cambiarRegla(indice, "valor_minimo", decimalVisual(valor)); }} required />
            </div>
            <div className="actuator-rule-input">
              <label htmlFor={`rule-max-${actuador.id}-${indice}`}>Máximo</label>
              <input id={`rule-max-${actuador.id}-${indice}`} className={`form-control${campoError === "maximo" ? " is-invalid" : ""}`} aria-invalid={campoError === "maximo"} type="number" step="0.01" value={regla.valor_maximo} onChange={(event) => cambiarRegla(indice, "valor_maximo", event.target.value)} onBlur={(event) => { const valor = event.target.value; if (valor !== "" && Number.isFinite(Number(valor))) cambiarRegla(indice, "valor_maximo", decimalVisual(valor)); }} required />
            </div>
            <div className="actuator-rule-input actuator-rule-mode">
              <label htmlFor={`rule-mode-${actuador.id}-${indice}`}>Activación</label>
              <select id={`rule-mode-${actuador.id}-${indice}`} className="form-select" value={regla.modo} onChange={(event) => cambiarRegla(indice, "modo", event.target.value)}>
                <option value="ACTIVAR_DEBAJO">Activar por debajo del mínimo</option>
                <option value="ACTIVAR_ENCIMA">Activar por encima del máximo</option>
              </select>
            </div>
            {reglas.length > 1 && <button type="button" className="btn btn-outline-danger btn-sm actuator-rule-remove" onClick={() => setReglas((actuales) => actuales.filter((_, posicion) => posicion !== indice))}>Quitar condición</button>}
          </div>)}
          <div className="actuator-rules-actions">
            <div><button type="button" className="btn btn-outline-success btn-sm" onClick={agregarRegla} disabled={guardando || !datosDisponibles.length}>+ Agregar condición</button> <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditando(false); setError(""); }}>Cancelar</button> <button type="button" className="btn btn-success btn-sm" onClick={guardarReglas} disabled={guardando || !sensores.length}>{guardando ? "Guardando…" : "Guardar reglas"}</button></div>
          </div>
          <small className="actuator-rule-guidance">Todos los parámetros configurados deben cumplirse para activar la tarea. Guardar estos cambios no activa la tarea. Si un sensor o el actuador no están operativos, la tarea permanecerá pausada.</small>
        </>}
      </> : reglasIniciales.length ? <>
        {reglasIniciales.length > 1 && <p className="actuator-rule-summary-guidance">Todos los parámetros configurados deben cumplirse para activar la tarea.</p>}
        <ul className="actuator-rule-summary">
          {reglasIniciales.map((regla) => <li key={regla.id}>
          <strong>{regla.tipo_dato}</strong>
          {estadoSensor(regla) && <small className={`actuator-rule-sensor-status actuator-rule-sensor-status--${estadoSensor(regla).clase}`}><FiAlertTriangle aria-hidden="true" /> {estadoSensor(regla).texto}; dato no disponible y tarea pausada</small>}
          <small>Dispositivo: {regla.sensor || "Sin dispositivo"} · ID {regla.sensor_id}</small>
          <span>{regla.modo === "ACTIVAR_ENCIMA" ? `Activar ≥ ${decimalVisual(regla.valor_maximo)} ${regla.unidad}; detener ≤ ${decimalVisual(regla.valor_minimo)} ${regla.unidad}` : `Activar ≤ ${decimalVisual(regla.valor_minimo)} ${regla.unidad}; detener ≥ ${decimalVisual(regla.valor_maximo)} ${regla.unidad}`}</span>
        </li>)}
        </ul>
      </> : <p className="actuator-rule-empty">Debe seleccionarse uno o más datos de este nodo y deben definirse sus límites mínimo y máximo.</p>}

      {mensaje && <p className="actuator-rule-success" role="status">{mensaje}</p>}
    </section>
  );
}

export default ReglasActuador;
