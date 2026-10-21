import React, { useState, useEffect, useRef } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL, fetchJson } from "../../utils/api";
import { useSiteDimensions } from "../../context/SiteDimensionsContext";

import invernadero from "../../Assets/invernadero.png";
import { FiActivity, FiCpu, FiMapPin } from "react-icons/fi";
import {
  estadoClases,
  estadoEtiquetas,
  mostrarFecha,
  mostrarIntervaloConfigurado,
  mostrarPorcentajeBateria,
} from "../../utils/dispositivoFormatters";

const VENTANA_PROMEDIO_MINUTOS = 30;

function obtenerTonoTipoDato(nombre) {
  let hash = 0;
  for (const caracter of String(nombre || "Dato")) {
    hash = (hash * 31 + caracter.codePointAt(0)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function Home() {
  const { dimensions: dimensionesSitio } = useSiteDimensions();
  const [lecturas, setLecturas] = useState([]);

  const [nodos, setNodos] = useState([]);
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null);
  const solicitudLecturasId = useRef(0);
  const [lecturasNodo, setLecturasNodo] = useState([]);
  const [cargandoNodo, setCargandoNodo] = useState(false);
  const [errorNodo, setErrorNodo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const nodosConUbicacion = nodos.filter((nodo) => {
    if (!dimensionesSitio) return false;
    const largo = Number(nodo.largo);
    const ancho = Number(nodo.ancho);
    const altura = Number(nodo.altura);
    return (
      nodo.largo !== null && nodo.largo !== undefined && nodo.largo !== "" &&
      nodo.ancho !== null && nodo.ancho !== undefined && nodo.ancho !== "" &&
      nodo.altura !== null && nodo.altura !== undefined && nodo.altura !== "" &&
      Number.isFinite(largo) && Number.isFinite(ancho) && Number.isFinite(altura) &&
      largo >= 0 && largo <= dimensionesSitio.largo &&
      ancho >= 0 && ancho <= dimensionesSitio.ancho && altura >= 0
    );
  });
  const nodosSinUbicacion = nodos.filter((nodo) => !nodosConUbicacion.includes(nodo));

  useEffect(() => {
    const controller = new AbortController();
    fetchJson(`${API_URL}/api/dispositivos`, { signal: controller.signal })
      .then((datos) => setNodos(datos.slice().sort((a, b) => a.id - b.id)))
      .catch((err) => {
        if (err.name !== "AbortError") setError("No fue posible cargar los nodos");
      });

    return () => controller.abort();
  }, []);

  async function seleccionarNodo(nodo) {
    if (!nodo) {
      solicitudLecturasId.current += 1;
      setNodoSeleccionado(null);
      setLecturasNodo([]);
      setCargandoNodo(false);
      setErrorNodo(null);
      return;
    }
    if (String(nodoSeleccionado?.id) === String(nodo.id)) {
      solicitudLecturasId.current += 1;
      setNodoSeleccionado(null);
      setLecturasNodo([]);
      setCargandoNodo(false);
      setErrorNodo(null);
      return;
    }
    const solicitudId = ++solicitudLecturasId.current;
    setNodoSeleccionado(nodo);
    setLecturasNodo([]);
    setCargandoNodo(true);
    setErrorNodo(null);
    try {
      const respuesta = await fetchJson(
        `${API_URL}/api/lecturas/ultimas?dispositivo_id=${nodo.id}`,
      );
      if (solicitudId === solicitudLecturasId.current) setLecturasNodo(respuesta.datos || []);
    } catch (err) {
      if (solicitudId === solicitudLecturasId.current) {
        setLecturasNodo([]);
        setErrorNodo(err.message || "No fue posible cargar las lecturas del nodo");
      }
    } finally {
      if (solicitudId === solicitudLecturasId.current) setCargandoNodo(false);
    }
  }

  useEffect(() => {
    let activo = true;

    async function fetchPromedio() {
      try {
        const datos = await fetchJson(
          `${API_URL}/api/lecturas/promedio`,
        );
        if (!activo) return;

        setLecturas(datos.datos || []);
        setError(null);
      } catch {
        if (activo) setError("Error al cargar las lecturas");
      } finally {
        if (activo) setCargando(false);
      }
    }

    fetchPromedio();
    const intervalo = setInterval(fetchPromedio, 30000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  return (
    <section>
      <Container className="home-section card-component home-plan-section">
        <Container className="home-content">
          <div className="home-plan-heading">
            <div>
              <h1 className="heading">Ubicación de nodos</h1>
              <p>Los nodos se colocan según las coordenadas registradas.</p>
            </div>
            <div className="home-location-selector">
              <span id="home-location-label"><FiMapPin aria-hidden="true" /> Ubicación actual</span>
              <div className="home-location-select-row">
                <select className="form-select form-select-sm" value="sitio" disabled aria-labelledby="home-location-label" title="La selección de ubicaciones estará disponible próximamente.">
                  <option value="sitio">Sitio actual</option>
                </select>
              </div>
            </div>
          </div>
          <Row className="g-3 align-items-stretch home-plan-row">
            <Col lg={8}>
              <div className="home-plan-frame">
                <div className="home-node-layer" aria-label="Nodos del sitio">
                  {nodosConUbicacion.map((nodo) => {
                    const seleccionado = nodoSeleccionado?.id === nodo.id;
                    const estadoNormalizado = nodo.estado?.toUpperCase();
                    const claseEstado = estadoClases[estadoNormalizado] || "estado-inactivo";
                    const left = Math.min(93, Math.max(7, (Number(nodo.largo) / dimensionesSitio.largo) * 100));
                    const top = Math.min(93, Math.max(7, (Number(nodo.ancho) / dimensionesSitio.ancho) * 100));
                    return (
                      <button
                        type="button"
                        key={nodo.id}
                        className={`home-node-marker ${claseEstado}${seleccionado ? " selected" : ""}`}
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onClick={() => seleccionarNodo(nodo)}
                        aria-pressed={seleccionado}
                        title={`${nodo.nombre} · ${estadoEtiquetas[estadoNormalizado] || nodo.estado || "Estado sin dato"} · ${nodo.zona || "Zona sin asignar"}`}
                      >
                        <FiCpu /> {nodo.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Col>
            <Col lg={4}>
              <aside className="home-node-details" aria-live="polite">
                {nodoSeleccionado ? (
                  <>
                    <div className="home-node-details-heading">
                      <FiCpu aria-hidden="true" />
                      <div>
                        <h2>{nodoSeleccionado.nombre}</h2>
                        <p>{nodoSeleccionado.zona || "Zona sin asignar"}</p>
                      </div>
                    </div>
                    <dl className="home-node-details-list">
                      <div><dt>Estado</dt><dd><span className={`estado-badge ${estadoClases[nodoSeleccionado.estado?.toUpperCase()] || "estado-inactivo"}`}>{estadoEtiquetas[nodoSeleccionado.estado?.toUpperCase()] || nodoSeleccionado.estado || "Sin dato"}</span>{nodoSeleccionado.estado?.toUpperCase() === "FALLANDO" && <small className="d-block mt-1 text-danger">Sin comunicación por más de 1 hora.</small>}</dd></div>
                      <div><dt>Alimentación</dt><dd>{nodoSeleccionado.tipo_alimentacion === "CORRIENTE_DIRECTA" ? "Corriente directa" : "Batería"}</dd></div>
                      {nodoSeleccionado.tipo_alimentacion !== "CORRIENTE_DIRECTA" && <div><dt>Batería</dt><dd>{mostrarPorcentajeBateria(nodoSeleccionado.bateria_porcentaje)}</dd></div>}
                      <div><dt>Intervalo entre lecturas</dt><dd>{mostrarIntervaloConfigurado(nodoSeleccionado)}</dd></div>
                      <div><dt>Última comunicación</dt><dd>{mostrarFecha(nodoSeleccionado.ultima_comunicacion)}</dd></div>
                      <div><dt>Ubicación</dt><dd title="Largo × ancho × altura">{nodoSeleccionado.largo != null && nodoSeleccionado.ancho != null && nodoSeleccionado.altura != null
                        ? `${nodoSeleccionado.largo} m × ${nodoSeleccionado.ancho} m × ${nodoSeleccionado.altura} m`
                        : "Sin ubicación registrada"}</dd></div>
                    </dl>
                    {cargandoNodo ? (
                      <p className="home-node-readings-status">Cargando lecturas...</p>
                    ) : errorNodo ? (
                      <p className="home-node-readings-status error" role="alert">{errorNodo}</p>
                    ) : (
                      <div className="home-node-latest-readings">
                        <h3>Últimas lecturas</h3>
                        {lecturasNodo.length ? lecturasNodo.map((lectura) => (
                          <div key={`${lectura.tipo_dato}-${lectura.created_at}`}>
                            <span>{lectura.tipo_dato}</span>
                            <strong>{lectura.dato} {lectura.unidad}</strong>
                          </div>
                        )) : <p>Este nodo aún no tiene lecturas.</p>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="home-node-details-empty">
                    <FiMapPin aria-hidden="true" />
                    <h2>Información del nodo</h2>
                    <p>Seleccione un nodo en el plano para consultar su estado, ubicación y últimas lecturas.</p>
                  </div>
                )}
              </aside>
            </Col>
          </Row>
          <div className="home-status-legend" role="group" aria-label="Colores de estado de los nodos">
            <span className="home-status-legend__title">Estado:</span>
            <span className="home-status-legend__item"><i className="home-status-legend__swatch estado-operativo" aria-hidden="true" />Operativo</span>
            <span className="home-status-legend__item"><i className="home-status-legend__swatch estado-inactivo" aria-hidden="true" />Inactivo</span>
            <span className="home-status-legend__item"><i className="home-status-legend__swatch estado-mantenimiento" aria-hidden="true" />En mantenimiento</span>
            <span className="home-status-legend__item"><i className="home-status-legend__swatch estado-fallando" aria-hidden="true" />Problemas o fallas</span>
          </div>
          {nodosSinUbicacion.length > 0 && (
            <p className="home-unlocated-note" role="note">
              <strong>Pendientes de ubicación:</strong>{" "}
              {nodosSinUbicacion.map((nodo) => nodo.nombre).join(", ")}. No aparecen en el plano hasta registrar sus coordenadas.
            </p>
          )}
        </Container>
      </Container>
      {cargando ? (
        <p className="status-message">Cargando lecturas...</p>
      ) : error ? (
        <p className="status-message alert alert-danger" role="alert">
          {error}
        </p>
      ) : (
        <Container className="home-section card-component">
          <Container className="home-content data-section">
            <div className="home-data-title">
              <div>
                <h1>Datos actuales</h1>
                <p>Promedio de las lecturas recibidas por todos los nodos durante los últimos {VENTANA_PROMEDIO_MINUTOS} minutos</p>
              </div>
            </div>
            <div className="lecturas-section">
              {lecturas.length ? lecturas.map((lectura) => (
                <article
                  className="lectura-card"
                  key={lectura.tipo_dato_id || lectura.tipo_dato}
                  style={{ "--metric-hue": obtenerTonoTipoDato(lectura.tipo_dato) }}
                >
                  <span className="lectura-label"><FiActivity className="lectura-icon" /> {lectura.tipo_dato}</span>
                  <span className="lectura-valor">{lectura.promedio} {lectura.unidad}</span>
                  <small className="lectura-muestras">{lectura.cantidad_lecturas} lecturas recientes</small>
                </article>
              )) : (
                <p className="lecturas-sin-datos">No hay lecturas recibidas durante los últimos {VENTANA_PROMEDIO_MINUTOS} minutos.</p>
              )}
            </div>
          </Container>
        </Container>
      )}
      <Container className="home-section card-component home-description-section" id="home">
        <Container className="home-content">
          <Row className="align-items-center">
            <Col md={7} className="home-header">
              <h1 className="heading">Descripción del sitio</h1>
              <p>
                Invernadero detras del 6K de la FCQI, donde se inicio el proyecto.
              </p>
              <div className="home-dimension-card home-dimension-main">
                <span>Medidas del sitio</span>
                <strong>{dimensionesSitio
                  ? `${dimensionesSitio.largo.toFixed(2)} × ${dimensionesSitio.ancho.toFixed(2)} × ${dimensionesSitio.altura.toFixed(2)} m`
                  : "Medidas no disponibles"}</strong>
                <small>Largo × ancho × altura</small>
              </div>
            </Col>
            <Col md={5}>
              <img
                src={invernadero}
                alt="Vista de referencia del sitio"
                className="img-fluid invernadero-img"
                loading="lazy"
              />
            </Col>
          </Row>
        </Container>
      </Container>
    </section>
  );
}

export default Home;
