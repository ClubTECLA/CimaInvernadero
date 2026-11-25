import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, fetchJson } from "../../utils/api";
import { fetchAuth } from "../../utils/fetchAuth";
import { useLocation } from "../../context/LocationContext";
import "../../styles/gateway-admin.css";

const gatewayApi = `${API_URL}/api/gateway/v1`;

async function gatewayJson(url, options) {
  let response;
  try {
    response = await fetchAuth(url, options);
  } catch {
    throw new Error("No fue posible conectar con el servidor.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `La solicitud falló (${response.status}).`);
  return body;
}

function formatDate(value) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-MX", { hour12: false });
}

function capabilitiesText(value) {
  let capabilities = value;
  if (typeof capabilities === "string") {
    try { capabilities = JSON.parse(capabilities); } catch { return capabilities; }
  }
  return Array.isArray(capabilities) && capabilities.length ? capabilities.join(" · ") : "No reportadas";
}

export default function GatewayAdmin() {
  const { ubicaciones } = useLocation();
  const [gateways, setGateways] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [gatewayId, setGatewayId] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [sqlNodeId, setSqlNodeId] = useState("");
  const [pollSeconds, setPollSeconds] = useState("600");
  const [gatewayName, setGatewayName] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeGateways = useMemo(() => gateways.filter((item) => Number(item.activo)), [gateways]);
  const nodesWithLocation = useMemo(() => nodes.filter((node) => node.ubicacion_id), [nodes]);
  const selectedCandidate = candidates.find((item) => `${item.firmware_node_id}:${item.mac_address}` === selectedCandidateKey);

  const refreshInventory = useCallback(async (preferredGateway = "") => {
    setLoading(true);
    try {
      const [gatewayResponse, nodeResponse] = await Promise.all([
        gatewayJson(`${gatewayApi}/gateways`),
        fetchJson(`${API_URL}/api/dispositivos`),
      ]);
      const nextGateways = gatewayResponse.gateways || [];
      setGateways(nextGateways);
      setNodes(Array.isArray(nodeResponse) ? nodeResponse : []);
      const preferred = preferredGateway || gatewayId;
      const nextSelected = nextGateways.some((item) => String(item.gateway_id) === String(preferred) && Number(item.activo))
        ? String(preferred)
        : String(nextGateways.find((item) => Number(item.activo))?.gateway_id || "");
      setGatewayId(nextSelected);
      setError("");
      return nextSelected;
    } catch (err) {
      setError(err.message || "No fue posible cargar gateways y nodos.");
      return "";
    } finally {
      setLoading(false);
    }
  }, [gatewayId]);

  const refreshGateway = useCallback(async (id = gatewayId) => {
    if (!id) {
      setAssignments([]);
      setCandidates([]);
      return;
    }
    try {
      const [assignmentResponse, candidateResponse] = await Promise.all([
        gatewayJson(`${gatewayApi}/gateways/${id}/nodes`),
        gatewayJson(`${gatewayApi}/gateways/${id}/candidates`),
      ]);
      setAssignments(assignmentResponse.assignments || []);
      setCandidates(candidateResponse.candidates || []);
      setSelectedCandidateKey("");
      setError("");
    } catch (err) {
      setError(err.message || "No fue posible consultar asignaciones y observaciones.");
    }
  }, [gatewayId]);

  useEffect(() => { refreshInventory(); }, [refreshInventory]);
  useEffect(() => { refreshGateway(gatewayId); }, [gatewayId, refreshGateway]);
  async function createGateway(event) {
    event.preventDefault();
    if (!gatewayName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await gatewayJson(`${gatewayApi}/gateways`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: gatewayName.trim() }),
      });
      setOneTimeKey(created);
      setGatewayName("");
      const selected = await refreshInventory(String(created.gateway_id));
      await refreshGateway(selected || String(created.gateway_id));
      setNotice("Gateway registrado. Guarda la clave ahora: la API solo la entrega una vez.");
    } catch (err) {
      setError(err.message || "No fue posible registrar el gateway.");
    } finally {
      setBusy(false);
    }
  }

  async function assignCandidate(event) {
    event.preventDefault();
    if (!selectedCandidate || !sqlNodeId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await gatewayJson(`${gatewayApi}/gateways/${gatewayId}/nodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodo_id: Number(sqlNodeId),
          firmware_node_id: Number(selectedCandidate.firmware_node_id),
          mac_address: selectedCandidate.mac_address,
          management_poll_interval_seconds: Number(pollSeconds),
        }),
      });
      setNotice("Asignación guardada. La observación identificó un candidato; la selección SQL y el vínculo se confirmaron manualmente.");
      setSelectedCandidateKey("");
      setSqlNodeId("");
      await refreshGateway();
      await refreshInventory(gatewayId);
    } catch (err) {
      setError(err.message || "No fue posible asignar el nodo.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeAssignment(assignment) {
    const confirmed = window.confirm(`¿Revocar el vínculo de ${assignment.nombre} (nodo SQL ${assignment.nodo_id}) con este gateway? Se conservará el historial y se impedirán nuevos despachos por esta asignación.`);
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await gatewayJson(`${gatewayApi}/gateways/${gatewayId}/nodes/${assignment.nodo_id}`, { method: "DELETE" });
      setNotice("Vínculo revocado; el historial de asignación se conserva.");
      await refreshGateway();
      await refreshInventory(gatewayId);
    } catch (err) {
      setError(err.message || "No fue posible revocar el vínculo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gateway-admin" aria-labelledby="gateway-admin-title">
      <header className="gateway-admin-heading">
        <div>
          <p className="gateway-admin-eyebrow">INFRAESTRUCTURA</p>
          <h2 id="gateway-admin-title">Gateways</h2>
          <p>Vincule cada gateway con los nodos que comunica. La ubicación y la zona se configuran en cada nodo.</p>
        </div>
        <button type="button" className="gateway-refresh" onClick={() => refreshInventory()} disabled={loading || busy}>Actualizar</button>
      </header>

      <div className="gateway-flow" aria-label="Orden recomendado de configuración">
        <span><b>1</b> Configure la ubicación y sus zonas</span>
        <span aria-hidden="true">›</span>
        <span><b>2</b> Asigne el nodo a una ubicación y zona</span>
        <span aria-hidden="true">›</span>
        <span><b>3</b> Vincule el nodo con el gateway</span>
      </div>
      <p className="gateway-location-note">El vínculo gateway↔nodo no reemplaza su ubicación. La pantalla muestra el lugar de cada nodo para confirmar la asignación. El modelo actual no registra una ubicación física independiente del gateway.</p>

      {error && <p className="gateway-feedback gateway-feedback-error" role="alert">{error}</p>}
      {notice && <p className="gateway-feedback gateway-feedback-success" role="status">{notice}</p>}
      {oneTimeKey && <div className="gateway-secret" role="alert">
        <strong>Clave de provisionamiento, visible solo ahora</strong>
        <code>{oneTimeKey.api_key}</code>
        <span>Gateway #{oneTimeKey.gateway_id} · URL del servidor: {oneTimeKey.api_base_url || "pendiente de configurar"}</span>
        <span>{oneTimeKey.api_base_url
          ? "Guarde la clave y configure el gateway con esta URL y su clave. Esta pantalla no lo conecta automáticamente."
          : "Guarde la clave de forma segura. El gateway aún no puede conectarse: falta definir GATEWAY_API_BASE_URL en el servidor y provisionarlo con la URL y esta clave."}</span>
        <button type="button" onClick={() => setOneTimeKey(null)}>Ya guardé la clave</button>
      </div>}

      <div className="gateway-admin-grid">
        <section className="gateway-admin-card gateway-register-card">
          <h3>Registrar gateway</h3>
          <form onSubmit={createGateway} className="gateway-inline-form">
            <label htmlFor="gateway-new-name">Nombre descriptivo</label>
            <div><input id="gateway-new-name" value={gatewayName} maxLength={120} onChange={(event) => setGatewayName(event.target.value)} placeholder="Ej. Gateway norte" required /><button type="submit" disabled={busy || !gatewayName.trim()}>Registrar</button></div>
          </form>
          <p className="gateway-help">La clave se muestra una sola vez. Guárdela en el provisionamiento seguro del gateway; no se conserva en esta pantalla.</p>
        </section>

        <section className="gateway-admin-card gateway-select-card">
          <h3>Gateway seleccionado</h3>
          <label htmlFor="gateway-select">Elija explícitamente dónde revisar o asignar</label>
          <select id="gateway-select" value={gatewayId} onChange={(event) => setGatewayId(event.target.value)} disabled={loading || !activeGateways.length}>
            {!activeGateways.length && <option value="">No hay gateways activos</option>}
            {activeGateways.map((item) => <option key={item.gateway_id} value={item.gateway_id}>#{item.gateway_id} · {item.nombre} · {item.nodos_asignados || 0} nodos</option>)}
          </select>
          {gatewayId && <p className="gateway-help">Gateway SQL ID: <strong>{gatewayId}</strong></p>}
        </section>
      </div>

      <section className="gateway-admin-card gateway-assignment-card">
        <div className="gateway-card-heading"><div><h3>Asignaciones de este gateway</h3><p>El estado administrativo y la sincronización de manifiesto se muestran por separado.</p></div><span>{assignments.filter((item) => Number(item.activo)).length} activos</span></div>
        {!gatewayId ? <p className="gateway-empty">Seleccione un gateway activo para consultar sus vínculos.</p> : assignments.length ? <div className="gateway-assignment-list">
            {assignments.map((item) => <article className={`gateway-assignment-row${Number(item.activo) ? " is-active" : " is-revoked"}`} key={item.asignacion_id}>
            <div className="gateway-assignment-main"><strong>{item.nombre || `Nodo SQL ${item.nodo_id}`}</strong><span>Nodo SQL #{item.nodo_id} · Firmware ID {item.firmware_node_id}</span><span>{ubicaciones.find((location) => Number(location.id) === Number(nodes.find((node) => Number(node.id) === Number(item.nodo_id))?.ubicacion_id))?.nombre || "Ubicación pendiente"} · {nodes.find((node) => Number(node.id) === Number(item.nodo_id))?.zona || "Sin zona"}</span><code>{item.mac_address || "MAC no disponible"}</code></div>
            <div className="gateway-assignment-status"><span className="gateway-status-pill">{Number(item.activo) ? "Asignado" : "Revocado"}</span><span>Estado administrativo: {item.estado || "Sin dato"}</span><span>Sincronización de manifiesto: {item.manifest_sync_status || "Sin dato reportado"}</span>{item.manifest_revision_applied && <small>Revisión aplicada: {item.manifest_revision_applied}</small>}</div>
            {Number(item.activo) && <button type="button" className="gateway-revoke" disabled={busy} onClick={() => revokeAssignment(item)}>Revocar vínculo</button>}
            {Number(item.activo) && <GatewaySensorManager key={`${gatewayId}-${item.nodo_id}`} gatewayId={gatewayId} nodeId={item.nodo_id} onSaved={() => refreshGateway()} />}
          </article>)}
        </div> : <p className="gateway-empty">No hay asignaciones ni historial para este gateway.</p>}
      </section>

      <details className="gateway-admin-card gateway-candidates-card" open={Boolean(selectedCandidateKey)}>
        <summary className="gateway-details-summary"><span><strong>Candidatos observados</strong><small>{candidates.length} observaciones · requiere confirmación manual</small></span><span className="gateway-details-count">{candidates.length}</span></summary>
        <p className="gateway-help">Son observaciones sin autenticar. Una MAC o un firmware ID por sí solos no autorizan la asignación.</p>
        {!gatewayId ? <p className="gateway-empty">Seleccione un gateway para consultar observaciones.</p> : candidates.length ? <div className="gateway-candidate-list">
          {candidates.map((candidate) => {
            const key = `${candidate.firmware_node_id}:${candidate.mac_address}`;
            const selected = key === selectedCandidateKey;
            return <article className={`gateway-candidate${selected ? " selected" : ""}`} key={key}>
              <div className="gateway-candidate-details"><span className="gateway-observed-label">Observación sin autenticar</span><strong>Firmware ID {candidate.firmware_node_id}</strong><code>{candidate.mac_address}</code><span>Firmware: {candidate.firmware_version || "No reportado"} · Protocolo: {candidate.wire_version || "No reportado"}</span><span>Capacidades: {capabilitiesText(candidate.capabilities)}</span><span>Visto por última vez: {formatDate(candidate.last_seen_at)}</span></div>
              <button type="button" className="gateway-select-candidate" onClick={() => { setSelectedCandidateKey(selected ? "" : key); setSqlNodeId(""); }}> {selected ? "Cancelar selección" : "Seleccionar para vincular"}</button>
            </article>;
          })}
        </div> : <p className="gateway-empty">No hay candidatos observados para este gateway. La pantalla no envía consultas ni órdenes de descubrimiento a gateways.</p>}

        {selectedCandidate && <form className="gateway-assignment-form" onSubmit={assignCandidate}>
          <h4>Confirmar vínculo</h4>
          <p>Gateway #{gatewayId} · Firmware ID {selectedCandidate.firmware_node_id} · {selectedCandidate.mac_address}</p>
          <label htmlFor="gateway-sql-node">Seleccione el nodo de la base de datos</label>
          <select id="gateway-sql-node" value={sqlNodeId} onChange={(event) => setSqlNodeId(event.target.value)} required disabled={!nodesWithLocation.length}>
            <option value="">{nodesWithLocation.length ? "Seleccione un nodo SQL" : "No hay nodos con ubicación asignada"}</option>
            {nodesWithLocation.map((node) => {
              const locationName = ubicaciones.find((location) => Number(location.id) === Number(node.ubicacion_id))?.nombre;
              return <option key={node.id} value={node.id}>{`#${node.id} · ${node.nombre} · ${locationName || "Ubicación"} · ${node.zona || "Sin zona"}`}</option>;
            })}
          </select>
          <p className="gateway-assignment-location-help">Solo se pueden vincular nodos con ubicación asignada. Complete su ubicación y zona en la sección Nodos antes de continuar.</p>
          <label htmlFor="gateway-poll-interval">Intervalo de gestión esperado (segundos)</label>
          <input id="gateway-poll-interval" type="number" min="60" max="86400" value={pollSeconds} onChange={(event) => setPollSeconds(event.target.value)} required />
          <label className="gateway-confirm-check"><input type="checkbox" required /> Confirmo que seleccioné el nodo SQL correcto para este equipo observado.</label>
          <button type="submit" disabled={busy || !sqlNodeId || !Number.isInteger(Number(pollSeconds)) || Number(pollSeconds) < 60 || Number(pollSeconds) > 86400}>Confirmar asignación</button>
        </form>}
      </details>

    </section>
  );
}

function GatewaySensorManager({ gatewayId, nodeId, onSaved }) {
  const [sensors, setSensors] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [sensorId, setSensorId] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [firmwareSensorId, setFirmwareSensorId] = useState("");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const base = `${gatewayApi}/gateways/${gatewayId}/nodes/${nodeId}/sensors`;
  const existingMapping = mappings.find((mapping) => String(mapping.sensor_id) === String(sensorId));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [componentRows, mappingResponse] = await Promise.all([
        fetchJson(`${API_URL}/api/dispositivos/nodos/${nodeId}/componentes`),
        gatewayJson(base),
      ]);
      setSensors((Array.isArray(componentRows) ? componentRows : []).filter((item) => item.categoria === "SENSOR" && item.estado !== "RETIRADO"));
      setMappings(mappingResponse.sensores || []);
      setError("");
    } catch (err) {
      setError(err.message || "No fue posible cargar los mapeos de sensores.");
    } finally { setLoading(false); }
  }, [base, nodeId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function assignSensor(event) {
    event.preventDefault();
    if (!sensorId || !firmwareSensorId.trim() || !channel.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await gatewayJson(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensor_id: Number(sensorId), sensor_firmware_id: firmwareSensorId.trim(), canal: channel.trim() }),
      });
      setNotice("Mapeo guardado; queda sujeto a la sincronización del manifiesto del gateway.");
      setSensorId(""); setConfirmReplace(false); setFirmwareSensorId(""); setChannel("");
      await refresh();
      onSaved?.();
    } catch (err) { setError(err.message || "No fue posible guardar el mapeo."); }
    finally { setSaving(false); }
  }

  return <div className="gateway-sensor-manager">
    <div className="gateway-sensor-heading"><strong>Sensores del nodo</strong><span>{mappings.length} mapeados</span></div>
    {loading ? <p className="gateway-help">Cargando componentes y mapeos…</p> : <>
      {error && <p className="gateway-feedback gateway-feedback-error" role="alert">{error}</p>}
      {notice && <p className="gateway-feedback gateway-feedback-success" role="status">{notice}</p>}
      {mappings.length > 0 ? <ul className="gateway-sensor-list">{mappings.map((mapping) => <li key={mapping.asignacion_sensor_id}><strong>{mapping.nombre}</strong><span>{mapping.tipo_sensor} · Sensor SQL #{mapping.sensor_id}</span><code>ID firmware {mapping.sensor_firmware_id} · Canal {mapping.canal}</code></li>)}</ul> : <p className="gateway-help">No hay sensores mapeados actualmente.</p>}
      {sensors.length ? <form className="gateway-sensor-form" onSubmit={assignSensor}>
        <div className="gateway-sensor-field"><label htmlFor={`gateway-sensor-${gatewayId}-${nodeId}`}>Sensor instalado</label><select id={`gateway-sensor-${gatewayId}-${nodeId}`} value={sensorId} onChange={(event) => { setSensorId(event.target.value); setConfirmReplace(false); }} required><option value="">Seleccione un sensor</option>{sensors.map((sensor) => <option key={sensor.id} value={sensor.id}>#{sensor.id} · {sensor.nombre || sensor.tipo}</option>)}</select></div>
        <div className="gateway-sensor-field"><label htmlFor={`gateway-sensor-fw-${gatewayId}-${nodeId}`}>ID del sensor en firmware</label><input id={`gateway-sensor-fw-${gatewayId}-${nodeId}`} value={firmwareSensorId} onChange={(event) => setFirmwareSensorId(event.target.value)} maxLength={100} pattern="[A-Za-z0-9._:-]+" required /></div>
        <div className="gateway-sensor-field"><label htmlFor={`gateway-sensor-channel-${gatewayId}-${nodeId}`}>Canal reportado</label><input id={`gateway-sensor-channel-${gatewayId}-${nodeId}`} value={channel} onChange={(event) => setChannel(event.target.value)} maxLength={100} pattern="[A-Za-z0-9._:-]+" required /></div>
        {existingMapping && <label className="gateway-confirm-check"><input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} required /> Confirmo que deseo sustituir el mapeo actual.</label>}
        <button type="submit" disabled={saving || Boolean(existingMapping && !confirmReplace)}>{saving ? "Guardando…" : "Guardar mapeo"}</button>
      </form> : <p className="gateway-help">Este nodo no tiene sensores activos para mapear.</p>}
    </>}
  </div>;
}
