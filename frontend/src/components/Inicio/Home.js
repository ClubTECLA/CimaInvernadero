import React, { useState, useEffect, useRef } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL, fetchJson, getAssetUrl } from "../../utils/api";
import { useSiteDimensions } from "../../context/SiteDimensionsContext";
import { useLocation } from "../../context/LocationContext";
import LocationSelect from "../ui/LocationSelect";

import { FiActivity, FiChevronLeft, FiChevronRight, FiCpu, FiMapPin } from "react-icons/fi";
import defaultNodeImage from "../../Assets/icono_nodo_default.png";
import {
  estadoClases,
  estadoEtiquetas,
  mostrarFecha,
  mostrarIntervaloConfigurado,
  mostrarPorcentajeBateria,
} from "../../utils/dispositivoFormatters";

function Home() {
  const { dimensions: dimensionesSitio } = useSiteDimensions();
  const {
    ubicacionActual,
    seleccionarUbicacion,
    loading: ubicacionesCargando,
    error: errorUbicaciones,
  } = useLocation();
  const [lecturas, setLecturas] = useState([]);
  const [indicePromedios, setIndicePromedios] = useState(0);

  const [nodos, setNodos] = useState([]);
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null);
  const solicitudLecturasId = useRef(0);
  const [lecturasNodo, setLecturasNodo] = useState([]);
  const [cargandoNodo, setCargandoNodo] = useState(false);
  const [errorNodo, setErrorNodo] = useState(null);
  const [error, setError] = useState(null);
  const dimensionesSeleccionadas = ubicacionActual
    ? { largo: Number(ubicacionActual.largo), ancho: Number(ubicacionActual.ancho), altura: Number(ubicacionActual.altura) }
    : dimensionesSitio;

  const nodosDeUbicacion = ubicacionActual
    ? nodos.filter((nodo) => String(nodo.ubicacion_id) === String(ubicacionActual.id))
    : [];
  const nodosConUbicacion = nodosDeUbicacion.filter((nodo) => {
    if (!dimensionesSeleccionadas) return false;
    const largo = Number(nodo.largo);
    const ancho = Number(nodo.ancho);
    const altura = Number(nodo.altura);
    return (
      nodo.largo !== null && nodo.largo !== undefined && nodo.largo !== "" &&
      nodo.ancho !== null && nodo.ancho !== undefined && nodo.ancho !== "" &&
      nodo.altura !== null && nodo.altura !== undefined && nodo.altura !== "" &&
      Number.isFinite(largo) && Number.isFinite(ancho) && Number.isFinite(altura) &&
      largo >= 0 && largo <= dimensionesSeleccionadas.largo &&
      ancho >= 0 && ancho <= dimensionesSeleccionadas.ancho && altura >= 0
    );
  });
  const nodosSinUbicacion = nodosDeUbicacion.filter((nodo) => !nodosConUbicacion.includes(nodo));
  const promediosVisibles = lecturas.length > 3
    ? Array.from({ length: 3 }, (_, indice) => lecturas[(indicePromedios + indice) % lecturas.length])
    : [];

  useEffect(() => setIndicePromedios(0), [ubicacionActual?.id]);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson(`${API_URL}/api/dispositivos`, { signal: controller.signal })
      .then((datos) => {
        setNodos(datos.slice().sort((a, b) => a.id - b.id));
      })
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

  function cambiarUbicacion(id) {
    seleccionarUbicacion(id);
    setLecturas([]);
    solicitudLecturasId.current += 1;
    setNodoSeleccionado(null);
    setLecturasNodo([]);
    setCargandoNodo(false);
    setErrorNodo(null);
  }

  useEffect(() => {
    if (!ubicacionActual?.id) {
      if (!ubicacionesCargando) {
        setLecturas([]);
      }
      return undefined;
    }
    let activo = true;

    async function fetchPromedio() {
      try {
        const filtroUbicacion = ubicacionActual?.id ? `?ubicacion_id=${encodeURIComponent(ubicacionActual.id)}` : "";
        const respuesta = await fetchJson(`${API_URL}/api/lecturas/promedio${filtroUbicacion}`);
        if (!activo) return;

        const promedios = Array.isArray(respuesta?.global?.datos)
          ? respuesta.global.datos
          : Array.isArray(respuesta?.datos) ? respuesta.datos : [];
        setLecturas(promedios);
        setError(null);
      } catch {
        if (activo) {
          setLecturas([]);
          setError("Error al cargar las lecturas");
        }
      } finally {
      }
    }

    fetchPromedio();
    const intervalo = setInterval(fetchPromedio, 30000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [ubicacionActual?.id, ubicacionesCargando]);

  return (
    <section>
      {(error || errorUbicaciones) && <p className="status-message alert alert-danger" role="alert">{error || errorUbicaciones}</p>}

      <Container className="home-section card-component home-plan-section">
        <Container className="home-content">
          <div className="home-plan-heading">
            <div>
              <h1 className="heading">Ubicación de nodos</h1>
              <p>Los nodos se colocan según las coordenadas registradas.</p>
            </div>
            <LocationSelect id="home-location" className="home-location-selector" value={ubicacionActual?.id || ""} onChange={cambiarUbicacion} label="Ubicación actual" />
          </div>
          <Row className="g-3 align-items-stretch home-plan-row">
            <Col xl={7}>
              <div className="home-plan-frame" style={{ backgroundImage: getAssetUrl(ubicacionActual?.map_image_path) ? `url(${getAssetUrl(ubicacionActual.map_image_path)})` : "none" }}>
          <div className="home-node-layer" aria-label="Nodos del sitio">
                  {nodosConUbicacion.map((nodo) => {
                    const seleccionado = nodoSeleccionado?.id === nodo.id;
                    const estadoNormalizado = nodo.estado?.toUpperCase();
                    const claseEstado = estadoClases[estadoNormalizado] || "estado-inactivo";
                    const rutaImagenNodo = nodo.image_path_nodo || nodo.image_path;
                    const imagenNodo = rutaImagenNodo ? getAssetUrl(rutaImagenNodo) : defaultNodeImage;
                    const left = Math.min(93, Math.max(7, (Number(nodo.largo) / dimensionesSeleccionadas.largo) * 100));
                    const top = Math.min(93, Math.max(7, (Number(nodo.ancho) / dimensionesSeleccionadas.ancho) * 100));
                    return (
                      <button
                        type="button"
                        key={nodo.id}
                        className={`home-node-marker ${left < 50 ? "home-node-marker-expand-right" : "home-node-marker-expand-left"} ${claseEstado}${seleccionado ? " selected" : ""}`}
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onClick={() => seleccionarNodo(nodo)}
                        aria-pressed={seleccionado}
                        aria-label={`${nodo.nombre}. ${estadoEtiquetas[estadoNormalizado] || nodo.estado || "Estado sin dato"}. Seleccionar para ver información.`}
                        title={`${nodo.nombre} · ${estadoEtiquetas[estadoNormalizado] || nodo.estado || "Estado sin dato"} · ${nodo.zona || "Zona sin asignar"}`}
                      >
                        <img src={imagenNodo} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = defaultNodeImage; }} />
                        <span className="home-node-marker-name">{nodo.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Col>
            <Col xl={5}>
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
                      <div><dt>Estado</dt><dd><span className={`estado-badge ${estadoClases[nodoSeleccionado.estado?.toUpperCase()] || "estado-inactivo"}`}>{estadoEtiquetas[nodoSeleccionado.estado?.toUpperCase()] || nodoSeleccionado.estado || "Sin dato"}</span></dd></div>
                      <div><dt>Estado administrativo</dt><dd>{estadoEtiquetas[nodoSeleccionado.estado_administrativo?.toUpperCase()] || nodoSeleccionado.estado_administrativo || "Sin dato"}</dd></div>
                      <div><dt>Comunicación</dt><dd>{({ SIN_COMUNICACION: "Sin contacto", RECIBIENDO: "Recibiendo", ATRASADO: "Atrasada" })[nodoSeleccionado.estado_comunicacion] || "Sin determinar"}{nodoSeleccionado.estado_comunicacion_fuente === "LEGACY_TELEMETRY_COMPAT" && <small className="d-block">Presencia inferida de datos heredados hasta recibir heartbeat.</small>}</dd></div>
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
                    <FiCpu aria-hidden="true" />
                    <h2>Información del nodo</h2>
                    <p>Seleccione un círculo del plano para consultar su estado, comunicación y lecturas.</p>
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
      {ubicacionActual && (
        <Container className="home-section card-component home-average-section" aria-label="Promedios de la ubicación">
          <div className="home-average-heading">
            <div>
              <span>PROMEDIOS DE LA UBICACIÓN</span>
              <h2>Últimas lecturas</h2>
            </div>
            <span className="home-average-count">Últimos 60 minutos · {lecturas.length} tipos</span>
          </div>
          {lecturas.length > 3 ? (
            <div className="home-average-carousel">
              <button type="button" className="home-average-arrow" onClick={() => setIndicePromedios((indice) => (indice - 1 + lecturas.length) % lecturas.length)} aria-label="Ver promedios anteriores">
                <FiChevronLeft aria-hidden="true" />
              </button>
              <div className="home-average-cards" aria-live="polite">
                {promediosVisibles.map((lectura) => (
                  <article className="home-average-card" key={lectura.tipo_dato_id || lectura.tipo_dato}>
                    <FiActivity aria-hidden="true" />
                    <div><h3>{lectura.tipo_dato}</h3><strong>{lectura.promedio} <small>{lectura.unidad}</small></strong></div>
                  </article>
                ))}
              </div>
              <button type="button" className="home-average-arrow" onClick={() => setIndicePromedios((indice) => (indice + 1) % lecturas.length)} aria-label="Ver siguientes promedios">
                <FiChevronRight aria-hidden="true" />
              </button>
            </div>
          ) : lecturas.length > 0 ? (
            <div className="home-average-static-cards" aria-live="polite">
              {lecturas.map((lectura) => (
                <article className="home-average-card" key={lectura.tipo_dato_id || lectura.tipo_dato}>
                  <FiActivity aria-hidden="true" />
                  <div><h3>{lectura.tipo_dato}</h3><strong>{lectura.promedio} <small>{lectura.unidad}</small></strong></div>
                </article>
              ))}
            </div>
          ) : (
            <p className="home-average-empty" role="status">No hay lecturas suficientes de esta ubicación durante los últimos 60 minutos para calcular promedios.</p>
          )}
        </Container>
      )}
      <Container className="home-section card-component home-description-section" id="home">
        <Container className="home-content">
          <Row className="align-items-center">
            <Col md={7} className="home-header">
              <h1 className="heading">Descripción del sitio</h1>
              <p>
                {ubicacionActual?.descripcion || "Sin descripción registrada para la ubicación seleccionada."}
              </p>
              <div className="home-dimension-card home-dimension-main">
                <span>Medidas del sitio</span>
                <strong>{ubicacionActual
                  ? `${Number(ubicacionActual.largo).toFixed(2)} × ${Number(ubicacionActual.ancho).toFixed(2)} × ${Number(ubicacionActual.altura).toFixed(2)} m`
                  : "Medidas no disponibles"}</strong>
                <small>Largo × ancho × altura</small>
              </div>
            </Col>
            <Col md={5}>
              {ubicacionActual?.image_path ? (
                <img
                  src={getAssetUrl(ubicacionActual.image_path)}
                  alt={`Imagen de ${ubicacionActual.nombre}`}
                  className="img-fluid invernadero-img"
                  loading="lazy"
                />
              ) : (
                <div className="invernadero-img home-location-image-placeholder" role="img" aria-label={`Sin imagen de ${ubicacionActual?.nombre || "la ubicación seleccionada"}`}>
                  <FiMapPin aria-hidden="true" />
                  <span>Sin imagen registrada</span>
                </div>
              )}
            </Col>
          </Row>
        </Container>
      </Container>
    </section>
  );
}

export default Home;
