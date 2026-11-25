import { useEffect, useMemo, useState } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL, fetchJson, getAssetUrl } from "../../utils/api";

import DispositivosForm from "./DispositivoForm";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import defaultImg from "../../Assets/icono_nodo_default.png";

import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import LocationSelect from "../ui/LocationSelect";
import { fetchAuth } from "../../utils/fetchAuth";
import {
  estadoClases,
  mostrarPorcentajeBateria,
  mostrarIntervaloConfigurado,
  mostrarFecha,
  estadoEtiquetas,
} from "../../utils/dispositivoFormatters";

function Dispositivos() {
  const { isAuthenticated } = useAuth();
  const { ubicacionId } = useLocation();

  const [display, setDisplay] = useState();
  const [dispositivos, setDispositivos] = useState([]);
  const [editarDispositivo, setEditarDispositivo] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroUbicacion, setFiltroUbicacion] = useState(ubicacionId);
  const [paginaNodos, setPaginaNodos] = useState(1);
  const NODOS_POR_PAGINA = 5;

  const dispositivosFiltrados = useMemo(
    () =>
      dispositivos.filter((dispositivo) =>
        (!filtroEstado || dispositivo.estado === filtroEstado) &&
        (!filtroUbicacion || String(dispositivo.ubicacion_id) === String(filtroUbicacion))),
    [dispositivos, filtroEstado, filtroUbicacion],
  );
  const otrosNodos = dispositivosFiltrados;
  const totalPaginasNodos = Math.max(1, Math.ceil(otrosNodos.length / NODOS_POR_PAGINA));
  const nodosVisibles = otrosNodos.slice((paginaNodos - 1) * NODOS_POR_PAGINA, paginaNodos * NODOS_POR_PAGINA);

  useEffect(() => setPaginaNodos(1), [filtroEstado, filtroUbicacion]);
  useEffect(() => setPaginaNodos((pagina) => Math.min(pagina, totalPaginasNodos)), [totalPaginasNodos]);

  useEffect(() => {
    if (!dispositivosFiltrados.length) {
      setDisplay(null);
      return;
    }

    setDisplay((actual) =>
      dispositivosFiltrados.find((dispositivo) => dispositivo.id === actual?.id) ||
      dispositivosFiltrados[0],
    );
  }, [dispositivosFiltrados]);

  function handleGuardado(idEditado = null) {
    fetchJson(`${API_URL}/api/dispositivos`)
      .then((datos) => {
        setDispositivos(datos);
        setError(null);
        if (idEditado) {
          const editado = datos.find((d) => d.id === idEditado);
          setDisplay(editado || datos[0]);
        } else {
          setDisplay(datos[0]);
        }
      })
      .catch((err) => setError(err.message));
  }

  async function handleEliminar() {
    const confirmado = window.confirm(
      `¿Desea eliminar el nodo "${display.nombre}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmado) return;

    try {
      const res = await fetchAuth(`${API_URL}/api/dispositivos/${display.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const datos = await res.json();
        alert(datos.error);
        return;
      }

      handleGuardado(); // recarga la lista
    } catch (error) {
      alert("Error al eliminar el nodo");
    }
  }

  function renderUbicacion(dispositivo) {
    if (dispositivo.specs_id && dispositivo.specs_id !== 1) {
      return (
        <div title="Largo × ancho × altura">
          <strong>Ubicación: </strong>
          {dispositivo.largo} m × {dispositivo.ancho} m × {dispositivo.altura} m
        </div>
      );
    }

    return <span className="dispositivo-ubicacion-detalle">Posición pendiente de registrar</span>;
  }

  useEffect(() => {
    let activo = true;

    fetchJson(`${API_URL}/api/dispositivos`)
      .then((datos) => {
        if (!activo) return;
        setDispositivos(datos);
        setError(null);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (ubicacionId && String(filtroUbicacion) !== String(ubicacionId)) setFiltroUbicacion(ubicacionId);
  }, [ubicacionId, filtroUbicacion]);

  return (
    <section>
      <Container className="dispositivos-page">
        <Container className="dispositivos-title dispositivos-section">
          <Row className="align-items-center">
            <Col>
              <h1>Nodos del sitio</h1>
              <p>
                En esta sección se muestran los nodos registrados para el
                monitoreo y control del sitio
              </p>
              {isAuthenticated && (
                <div className="hardware-note" role="note">
                  <strong>Importante:</strong> Registrar un nodo aquí solo crea su ficha en la plataforma; no instala ni conecta el equipo.
                </div>
              )}
            </Col>
            <Col xs="auto" className="text-end">
              {isAuthenticated && (
                <button
                  className="add-button"
                  onClick={() => setMostrarForm(true)}
                >
                  + Registrar nodo
                </button>
              )}
            </Col>
          </Row>
        </Container>
        <section className="node-filters-panel" aria-label="Filtros de nodos">
            <h2>Filtrar nodos</h2>
            <div className="node-filter-field">
              <LocationSelect id="device-location-filter" value={filtroUbicacion} onChange={setFiltroUbicacion} label="Ubicación" className="device-location-select" />
            </div>
            <div className="node-filter-field">
              <label htmlFor="device-status-filter">Estado</label>
              <select
                id="device-status-filter"
                className="device-status-filter"
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="OPERATIVO">Operativos</option>
                <option value="INACTIVO">Inactivos</option>
                <option value="EN MANTENIMIENTO">En mantenimiento</option>
                <option value="FALLANDO">Problemas o fallas</option>
              </select>
            </div>
        </section>
        <div className="nodes-user-layout">
        <aside className="node-list-sidebar" aria-label="Lista de nodos">
        <Container className="dispositivos-list-section">
          <div className="nodo-list-heading">
            <div>
              <h2>Lista de nodos</h2>
              <span>{dispositivosFiltrados.length} registrados</span>
            </div>
            {totalPaginasNodos > 1 && <div className="node-list-pagination" aria-label="Paginación de nodos">
              <button type="button" className="node-carousel-button" disabled={paginaNodos === 1} onClick={() => setPaginaNodos((pagina) => pagina - 1)} aria-label="Página anterior de nodos">‹</button>
              <span>{paginaNodos} / {totalPaginasNodos}</span>
              <button type="button" className="node-carousel-button" disabled={paginaNodos === totalPaginasNodos} onClick={() => setPaginaNodos((pagina) => pagina + 1)} aria-label="Página siguiente de nodos">›</button>
            </div>}
          </div>
          {nodosVisibles.length > 0 ? <div className="node-list-track" role="region" aria-label="Nodos disponibles">
            {nodosVisibles.map((d) => (
              <div className="node-carousel-slide" key={d.id} role="group" aria-label={d.nombre}>
                <div
                  className={`dispositivo-card card-component${display?.id === d.id ? " selected" : ""}`}
                  onClick={() => setDisplay(d)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDisplay(d);
                    }
                  }}
                >
                  <img
                    src={getAssetUrl(d?.image_path) || defaultImg}
                    alt={d?.nombre}
                    className={`dispositivo-img-list${d?.image_path ? "" : " dispositivo-img--default"}`}
                    loading="lazy"
                  />
                  <span className="node-card-name">{d.nombre}</span>
                  {isAuthenticated && <small className="admin-record-id">ID del nodo: {d.id}</small>}
                  <span className={`estado-badge ${estadoClases[d?.estado]}`}>
                    {estadoEtiquetas[d.estado] || d.estado}
                  </span>
                  <small className="nodo-card-meta nodo-card-zone">Zona: {d.zona || "Sin zona asignada"}</small>
                  <small className="nodo-card-meta">Alimentación: {d?.tipo_alimentacion === "CORRIENTE_DIRECTA" ? "Corriente directa" : "Batería"}</small>
                  {d?.tipo_alimentacion !== "CORRIENTE_DIRECTA" && <small className="nodo-card-telemetria">Batería: {mostrarPorcentajeBateria(d?.bateria_porcentaje)}</small>}
                  <small className="nodo-card-meta">Intervalo entre lecturas: {mostrarIntervaloConfigurado(d)}</small>
                  <small className="nodo-card-meta">Última: {mostrarFecha(d?.ultima_comunicacion)}</small>
                </div>
              </div>
            ))}
          </div> : <p className="empty-filter-message">{dispositivosFiltrados.length ? "No hay otros nodos para mostrar." : "No hay nodos con el estado seleccionado."}</p>}
        </Container>
        </aside>
        <Container className="actual-display dispositivos-section card-component">
          {cargando ? (
            <p>Cargando nodos...</p>
          ) : error ? (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          ) : display ? (
            <div className="node-detail-layout">
              <div className="node-detail-photo">
                <img
                  src={getAssetUrl(display?.image_path) || defaultImg}
                  alt={display?.nombre}
                  className={`dispositivo-img${display?.image_path ? "" : " dispositivo-img--default"}`}
                  loading="lazy"
                />
              </div>
              <div className="actual-display-info">
                <div className="node-detail-heading">
                  <div className="node-detail-title">
                  <span
                    className={`estado-badge ${estadoClases[display?.estado]}`}
                  >
                    {estadoEtiquetas[display?.estado] || display?.estado}
                  </span>{" "}
                    <h2>{display?.nombre}</h2>
                    <h6 className="mb-0">Nodo de monitoreo</h6>
                    {isAuthenticated && <small className="admin-record-id">ID del nodo: {display?.id}</small>}
                  </div>
                  <div className="actual-display-config-buttons">
                    {isAuthenticated && (
                      <button
                        className="dispositivo-button editar-button"
                        onClick={() => {
                          setEditarDispositivo(display);
                          setMostrarForm(true);
                        }}
                      >
                        <AiFillEdit />
                        Editar
                      </button>
                    )}
                    {isAuthenticated && (
                      <button
                        className="dispositivo-button eliminar-button"
                        onClick={handleEliminar}
                      >
                        <AiFillDelete />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
                  {display?.descripcion_nodo && <p>{display.descripcion_nodo}</p>}
                  <div className="node-detail-location">
                    <span><strong>Zona:</strong> {display?.zona || "Sin zona asignada"}</span>
                    {renderUbicacion(display)}
                  </div>
                  <div className="nodo-telemetria mt-2">
                    <span><strong>Alimentación:</strong> {display?.tipo_alimentacion === "CORRIENTE_DIRECTA" ? "Corriente directa" : "Batería"}</span>
                    {display?.tipo_alimentacion !== "CORRIENTE_DIRECTA" && <span><strong>Batería:</strong> {mostrarPorcentajeBateria(display?.bateria_porcentaje)}</span>}
                    <span>
                      <strong>Intervalo entre lecturas:</strong>{" "}
                      {mostrarIntervaloConfigurado(display)}
                    </span>
                    <span>
                      <strong>Última comunicación:</strong>{" "}
                      {mostrarFecha(display?.ultima_comunicacion)}
                    </span>
                  </div>
              </div>
            </div>
          ) : (
            <p>No hay nodos registrados.</p>
          )}
        </Container>
        </div>
      </Container>
      <DispositivosForm
        show={mostrarForm}
        onHide={() => {
          setMostrarForm(false);
          setEditarDispositivo(null);
        }}
        onGuardado={handleGuardado}
        dispositivo={editarDispositivo}
      />
    </section>
  );
}

export default Dispositivos;
