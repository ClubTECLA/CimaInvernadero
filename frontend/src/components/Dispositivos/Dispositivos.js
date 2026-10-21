import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL, fetchJson, getAssetUrl } from "../../utils/api";

import DispositivosForm from "./DispositivoForm";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import defaultImg from "../../Assets/icono_nodo_default.png";

import { useAuth } from "../../context/AuthContext";
import { fetchAuth } from "../../utils/fetchAuth";
import {
  estadoClases,
  mostrarPorcentajeBateria,
  mostrarIntervaloConfigurado,
  mostrarFecha,
  estadoEtiquetas,
} from "../../utils/dispositivoFormatters";

function obtenerEstadoCarrusel(carrusel) {
  const tarjetas = carrusel.querySelectorAll(":scope > .node-carousel-slide");
  const primera = tarjetas[0];
  const ultima = tarjetas[tarjetas.length - 1];
  if (!primera || !ultima) return { anterior: false, siguiente: false };

  const area = carrusel.getBoundingClientRect();
  const inicioVisible = area.left + carrusel.clientLeft;
  const finVisible = inicioVisible + carrusel.clientWidth;
  const primerLimite = primera.getBoundingClientRect();
  const ultimoLimite = ultima.getBoundingClientRect();
  return {
    anterior: primerLimite.left < inicioVisible - 1,
    siguiente: ultimoLimite.right > finVisible + 1,
  };
}

function Dispositivos() {
  const { isAuthenticated } = useAuth();

  const [display, setDisplay] = useState();
  const [dispositivos, setDispositivos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [editarDispositivo, setEditarDispositivo] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroUbicacion, setFiltroUbicacion] = useState("1");
  const carruselRef = useRef(null);
  const [carruselPuedeAnterior, setCarruselPuedeAnterior] = useState(false);
  const [carruselPuedeSiguiente, setCarruselPuedeSiguiente] = useState(false);

  const dispositivosFiltrados = useMemo(
    () =>
      dispositivos.filter((dispositivo) =>
        (!filtroEstado || dispositivo.estado === filtroEstado) &&
        (!filtroUbicacion || String(dispositivo.ubicacion_id) === String(filtroUbicacion))),
    [dispositivos, filtroEstado, filtroUbicacion],
  );
  const otrosNodos = useMemo(
    () => dispositivosFiltrados.filter((dispositivo) => dispositivo.id !== display?.id),
    [dispositivosFiltrados, display?.id],
  );
  const actualizarControlesCarrusel = useCallback(() => {
    const carrusel = carruselRef.current;
    if (!carrusel) return;
    const estado = obtenerEstadoCarrusel(carrusel);
    setCarruselPuedeAnterior(estado.anterior);
    setCarruselPuedeSiguiente(estado.siguiente);
  }, []);

  function desplazarCarrusel(direccion) {
    const carrusel = carruselRef.current;
    if (!carrusel) return;
    const estado = obtenerEstadoCarrusel(carrusel);
    setCarruselPuedeAnterior(estado.anterior);
    setCarruselPuedeSiguiente(estado.siguiente);
    if (direccion < 0 && !estado.anterior) return;
    if (direccion > 0 && !estado.siguiente) return;
    const limite = Math.max(0, carrusel.scrollWidth - carrusel.clientWidth);
    const destino = Math.min(limite, Math.max(0, carrusel.scrollLeft + direccion * carrusel.clientWidth));
    carrusel.scrollTo({ left: destino, behavior: "smooth" });
  }

  useEffect(() => {
    const carrusel = carruselRef.current;
    if (!carrusel) return undefined;
    carrusel.scrollLeft = 0;
    const frameId = window.requestAnimationFrame(actualizarControlesCarrusel);
    carrusel.addEventListener("scroll", actualizarControlesCarrusel, { passive: true });
    window.addEventListener("resize", actualizarControlesCarrusel);
    const observer = new ResizeObserver(actualizarControlesCarrusel);
    observer.observe(carrusel);
    return () => {
      carrusel.removeEventListener("scroll", actualizarControlesCarrusel);
      window.removeEventListener("resize", actualizarControlesCarrusel);
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [otrosNodos.length, filtroEstado, display?.id, actualizarControlesCarrusel]);

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

    Promise.all([
      fetchJson(`${API_URL}/api/dispositivos`),
      fetchJson(`${API_URL}/api/catalogos/ubicaciones`),
    ])
      .then(([datos, datosUbicaciones]) => {
        if (!activo) return;
        setDispositivos(datos);
        setUbicaciones(datosUbicaciones);
        setFiltroUbicacion((actual) => datosUbicaciones.some((ubicacion) => String(ubicacion.id) === String(actual))
          ? actual
          : String(datosUbicaciones[0]?.id || ""));
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
              <select
                className="device-status-filter"
                value={filtroUbicacion}
                onChange={(event) => setFiltroUbicacion(event.target.value)}
                aria-label="Filtrar nodos por ubicación"
              >
                {ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
              <select
                className="device-status-filter"
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                aria-label="Filtrar nodos por estado"
              >
                <option value="">Todos los estados</option>
                <option value="OPERATIVO">Operativos</option>
                <option value="INACTIVO">Inactivos</option>
                <option value="EN MANTENIMIENTO">En mantenimiento</option>
                <option value="FALLANDO">Problemas o fallas</option>
              </select>
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
        <Container className="actual-display dispositivos-section card-component">
          {cargando ? (
            <p>Cargando nodos...</p>
          ) : error ? (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          ) : display ? (
            <Row>
              <Col md={3} lg={3}>
                <img
                  src={getAssetUrl(display?.image_path) || defaultImg}
                  alt={display?.nombre}
                  className={`dispositivo-img${display?.image_path ? "" : " dispositivo-img--default"}`}
                  loading="lazy"
                />
              </Col>
              <Col>
                <div className="actual-display-info">
                  <span
                    className={`estado-badge ${estadoClases[display?.estado]}`}
                  >
                    {estadoEtiquetas[display?.estado] || display?.estado}
                  </span>{" "}
                  <div>
            <h2>{display?.nombre}</h2>
                    <h6 className="mb-0">Nodo de monitoreo</h6>
                    {isAuthenticated && <small className="admin-record-id">ID del nodo: {display?.id}</small>}
                  </div>
                  {display?.descripcion_nodo && <p>{display.descripcion_nodo}</p>}
                  <div className="mb-0">
                    <strong>Zona: </strong> {display?.zona || "Sin zona asignada"}
                    <br />
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
              </Col>
              <Col md="auto" className="actual-display-config-buttons">
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
              </Col>
            </Row>
          ) : (
            <p>No hay nodos registrados.</p>
          )}
        </Container>
        <Container className="dispositivos-list-section">
          <div className="nodo-list-heading">
            <div>
              <h2>Lista de nodos</h2>
              <span>{dispositivosFiltrados.length} registrados</span>
            </div>
            {otrosNodos.length > 1 && <div className="node-carousel-controls" aria-label="Controles del carrusel de nodos">
              <button type="button" className="node-carousel-button" disabled={!carruselPuedeAnterior} onClick={() => desplazarCarrusel(-1)} aria-label="Mostrar nodos anteriores">‹</button>
              <button type="button" className="node-carousel-button" disabled={!carruselPuedeSiguiente} onClick={() => desplazarCarrusel(1)} aria-label="Mostrar nodos siguientes">›</button>
            </div>}
          </div>
          {otrosNodos.length > 0 ? <div className="node-carousel-track" ref={carruselRef} role="region" aria-label="Nodos disponibles" aria-roledescription="carrusel">
            {otrosNodos.map((d) => (
              <div className="node-carousel-slide" key={d.id} role="group" aria-label={d.nombre}>
                <div
                  className="dispositivo-card card-component"
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
                  <small className="nodo-card-meta">Zona: {d.zona || "Sin zona asignada"}</small>
                  <small className="nodo-card-meta">Alimentación: {d?.tipo_alimentacion === "CORRIENTE_DIRECTA" ? "Corriente directa" : "Batería"}</small>
                  {d?.tipo_alimentacion !== "CORRIENTE_DIRECTA" && <small className="nodo-card-telemetria">Batería: {mostrarPorcentajeBateria(d?.bateria_porcentaje)}</small>}
                  <small className="nodo-card-meta">
                    Intervalo entre lecturas: {mostrarIntervaloConfigurado(d)}
                  </small>
                  <small className="nodo-card-meta">
                    Última: {mostrarFecha(d?.ultima_comunicacion)}
                  </small>
                </div>
              </div>
            ))}
          </div> : <p className="empty-filter-message">{dispositivosFiltrados.length ? "No hay otros nodos para mostrar." : "No hay nodos con el estado seleccionado."}</p>}
        </Container>
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
