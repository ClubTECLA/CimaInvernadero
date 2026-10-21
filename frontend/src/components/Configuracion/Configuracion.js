import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";

import { useAuth } from "../../context/AuthContext";
import { API_URL, fetchJson, getAssetUrl } from "../../utils/api";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import ZonasForm from "./ZonasForm";
import UbicacionesForm from "./UbicacionesForm";
import TiposForm from "./TiposForm";
import UnidadForm from "./UnidadForm";
import MapaZonas, { zonasConLimites } from "./MapaZonas";
import { fetchAuth } from "../../utils/fetchAuth";

function Configuracion() {
  const { isAuthenticated } = useAuth();

  const [zonas, setZonas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionSeleccionadaId, setUbicacionSeleccionadaId] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [dato, setDato] = useState([]);
  const [zonaSeleccionadaId, setZonaSeleccionadaId] = useState(null);

  const [mostrarZona, setMostrarZona] = useState(false);
  const [editarZona, setEditarZona] = useState(null);
  const [mostrarTipo, setMostrarTipo] = useState(false);
  const [editarTipo, setEditarTipo] = useState(null);
  const [mostrarUnidad, setMostrarUnidad] = useState(false);
  const [mostrarUbicacion, setMostrarUbicacion] = useState(false);
  const [editarUbicacion, setEditarUbicacion] = useState(null);
  const [editarUnidad, setEditarUnidad] = useState(null);
  const [error, setError] = useState(null);

  function alternarZona(id) {
    setZonaSeleccionadaId((actual) => Number(actual) === Number(id) ? null : id);
  }

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchJson(`${API_URL}/api/catalogos/ubicaciones`, { signal: controller.signal }),
      fetchJson(`${API_URL}/api/catalogos/zonas`, { signal: controller.signal }),
      fetchJson(`${API_URL}/api/catalogos/tipos-dispositivo`, { signal: controller.signal }),
      fetchJson(`${API_URL}/api/catalogos/tipos-dato`, { signal: controller.signal }),
    ])
      .then(([ubicacionesDatos, zonasDatos, tiposDatos, tiposDatoDatos]) => {
        setUbicaciones(ubicacionesDatos);
        if (ubicacionesDatos.length && !ubicacionesDatos.some((item) => Number(item.id) === Number(ubicacionSeleccionadaId))) setUbicacionSeleccionadaId(ubicacionesDatos[0].id);
        setZonas(zonasDatos);
        setTipos(tiposDatos);
        setDato(tiposDatoDatos);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "No fue posible cargar la configuración");
      });

    return () => controller.abort();
  }, [ubicacionSeleccionadaId]);

  function refresh(ruta) {
    fetchJson(`${API_URL}/api/catalogos/${ruta}`)
      .then((datos) => {
        setError(null);
        switch (ruta) {
          case "ubicaciones":
            setUbicaciones(datos);
            if (datos.length && !datos.some((item) => Number(item.id) === Number(ubicacionSeleccionadaId))) setUbicacionSeleccionadaId(datos[0].id);
            break;
          case "zonas":
            setZonas(datos);
            break;
          case "tipos-dispositivo":
            setTipos(datos);
            break;
          case "tipos-dato":
            setDato(datos);
            break;
          default:
            window.print(`No se encontró ${ruta}`);
            break;
        }
      })
      .catch((err) => setError(err.message || "No fue posible actualizar el catálogo"));
  }

  const ubicacionSeleccionada = ubicaciones.find((item) => Number(item.id) === Number(ubicacionSeleccionadaId)) || ubicaciones[0];
  const zonasVisibles = zonas.filter((item) => !ubicacionSeleccionada || Number(item.ubicacion_id) === Number(ubicacionSeleccionada.id));

  async function handleEliminar(id, nombre, ruta) {
    const mensaje = ruta === "zonas"
      ? `¿Desea eliminar la zona "${nombre}"? Los nodos asignados quedarán sin zona y conservarán sus coordenadas.`
      : `¿Desea eliminar "${nombre}"? Esta acción no se puede deshacer.`;
    const confirmado = window.confirm(mensaje);

    if (!confirmado) return;

    try {
      const res = await fetchAuth(`${API_URL}/api/catalogos/${ruta}/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const datos = await res.json();
        alert(datos.error);
        return;
      }

      refresh(ruta);
    } catch (error) {
      alert("Error al eliminar");
    }
  }

  return (
    <section>
      {error && (
        <div className="container mt-3">
          <div className="alert alert-warning" role="alert">{error}</div>
        </div>
      )}
      <Container className="catalogos-section">
        <Row>
          <Col className="catalogos-display">
            <Container className="single-display card-component" id="ubicaciones">
              <div className="single-display-title"><h2>Ubicaciones</h2>{isAuthenticated && <button className="single-display-add" onClick={() => setMostrarUbicacion(true)} aria-label="Agregar ubicación">+</button>}</div>
              <div className="catalogos-location-toolbar">
                <select className="form-select" value={ubicacionSeleccionada?.id || ""} onChange={(e) => setUbicacionSeleccionadaId(e.target.value)} aria-label="Ubicación seleccionada">
                  {ubicaciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
                {ubicacionSeleccionada && isAuthenticated && <div className="single-display-buttons"><button className="single-display-edit" aria-label={`Editar ${ubicacionSeleccionada.nombre}`} onClick={() => { setEditarUbicacion(ubicacionSeleccionada); setMostrarUbicacion(true); }}><AiFillEdit /></button><button className="single-display-delete" aria-label={`Eliminar ${ubicacionSeleccionada.nombre}`} onClick={() => handleEliminar(ubicacionSeleccionada.id, ubicacionSeleccionada.nombre, "ubicaciones")}><AiFillDelete /></button></div>}
              </div>
              {ubicacionSeleccionada && <div className="catalogos-location-content"><div className="catalogos-location-details"><span className="catalogos-location-id">ID {ubicacionSeleccionada.id}</span><p className="catalogos-location-description">{ubicacionSeleccionada.descripcion || "Sin descripción"}</p><div className="catalogos-location-measures"><span><strong>Largo</strong>{Number(ubicacionSeleccionada.largo).toFixed(2)} m</span><span><strong>Ancho</strong>{Number(ubicacionSeleccionada.ancho).toFixed(2)} m</span><span><strong>Altura</strong>{Number(ubicacionSeleccionada.altura).toFixed(2)} m</span></div></div><div className="catalogos-location-image-wrap">{ubicacionSeleccionada.image_path ? <img className="catalogos-location-image" src={getAssetUrl(ubicacionSeleccionada.image_path)} alt={`Imagen de ${ubicacionSeleccionada.nombre}`} /> : <div className="catalogos-location-image catalogos-location-image-placeholder" role="img" aria-label={`Sin imagen de ${ubicacionSeleccionada.nombre}`}><span>Sin imagen registrada</span></div>}{!ubicacionSeleccionada.image_path && <small>Agregue una imagen desde editar ubicación.</small>}</div></div>}
            </Container>
            <Container className="single-display card-component" id="zonas">
              <div className="single-display-title">
                <h2>Zonas</h2>
                {isAuthenticated && (
                  <button
                    className="single-display-add"
                    onClick={() => {
                      setMostrarZona(true);
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              <Row className="g-3 zone-configuration-layout">
                <Col lg={8}>
                  <MapaZonas zonas={zonasVisibles} seleccionadaId={zonaSeleccionadaId} onSeleccionar={alternarZona} imagenPlano={ubicacionSeleccionada?.map_image_path} dimensiones={ubicacionSeleccionada} />
                </Col>
                <Col lg={4}>
                  <div className="zone-list-card">
                    <div className="zone-list-heading"><h3>Zonas registradas</h3><span>{zonasVisibles.length}</span></div>
                    <div className="zone-list-items">
                      {zonasVisibles.map((z) => {
                        const mapIndex = zonasConLimites(zonasVisibles).findIndex((item) => Number(item.id) === Number(z.id));
                        const tieneLimites = mapIndex >= 0;
                        const esSinZona = String(z.zona).trim().toLowerCase() === "sin zona";
                        const seleccionada = Number(zonaSeleccionadaId) === Number(z.id);
                        return (
                          <div key={z.id} className={`zone-list-row${tieneLimites ? ` zone-list-color-${mapIndex % 5}` : ""}${seleccionada ? " selected" : ""}`}>
                            <button type="button" className="zone-list-select" onClick={() => tieneLimites && alternarZona(z.id)} disabled={!tieneLimites} aria-pressed={seleccionada}>
                              <span className={`zone-list-swatch${tieneLimites ? ` zone-color-${mapIndex % 5}` : " unbounded"}`} />
                              <span className="zone-list-copy"><strong>{z.zona}</strong>
                                {tieneLimites ? <small>{Number(z.largo_inicio).toFixed(2)}–{Number(z.largo_fin).toFixed(2)} × {Number(z.ancho_inicio).toFixed(2)}–{Number(z.ancho_fin).toFixed(2)} m</small> : <small>Sin límites configurados</small>}
                              </span>
                            </button>
                            {isAuthenticated && !esSinZona && <div className="single-display-buttons zone-list-actions">
                              <button className="single-display-edit" aria-label={`Editar ${z.zona}`} onClick={() => { setEditarZona(z); setMostrarZona(true); }}><AiFillEdit /></button>
                              <button className="single-display-delete" aria-label={`Eliminar ${z.zona}`} onClick={() => handleEliminar(z.id, z.zona, "zonas")}><AiFillDelete /></button>
                            </div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Col>
              </Row>
            </Container>
            <Container className="single-display card-component" id="dispositivos">
              <div className="single-display-title">
                <h2>Tipos de dispositivo</h2>
                {isAuthenticated && (
                  <button className="single-display-add" onClick={() => setMostrarTipo(true)} aria-label="Agregar tipo de dispositivo">
                    +
                  </button>
                )}
              </div>
              <div className="catalogos-table-section catalogos-dispositivos-section">
                <div className="catalogo-table-scroll">
                  <table className="catalogo-device-table">
                    <thead>
                      <tr>
                        {isAuthenticated && <th scope="col">ID</th>}
                        <th scope="col">Tipo de dispositivo</th>
                        <th scope="col">Categoría</th>
                        <th scope="col">Datos asociados</th>
                        {isAuthenticated && <th scope="col" className="catalogo-device-actions-heading">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tipos.map((t) => {
                        const categoria = t.categoria || "SENSOR";
                        const datosAsociados = categoria === "SENSOR"
                          ? (t.tipo_dato_ids || []).map((id) => dato.find((item) => Number(item.id) === Number(id))?.nombre).filter(Boolean)
                          : [];
                        return (
                          <tr key={t.id}>
                            {isAuthenticated && <td><span className="admin-record-id">{t.id}</span></td>}
                            <th scope="row" className="catalogo-device-name">{t.nombre}</th>
                            <td>
                              <span className={`catalogo-category catalogo-category-${String(categoria).toLowerCase()}`}>
                                {categoria === "NODO" ? "Nodo" : categoria === "ACTUADOR" ? "Actuador" : "Sensor"}
                              </span>
                            </td>
                            <td className="catalogo-device-data">
                              {categoria === "SENSOR"
                                ? datosAsociados.length ? datosAsociados.join(" · ") : "Sin datos asociados"
                                : "—"}
                            </td>
                            {isAuthenticated && <td>
                              <div className="single-display-buttons catalogo-device-actions">
                                <button className="single-display-edit" aria-label={`Editar ${t.nombre}`} onClick={() => { setMostrarTipo(true); setEditarTipo(t); }}>
                                  <AiFillEdit />
                                </button>
                                <button className="single-display-delete" aria-label={`Eliminar ${t.nombre}`} onClick={() => handleEliminar(t.id, t.nombre, "tipos-dispositivo")}>
                                  <AiFillDelete />
                                </button>
                              </div>
                            </td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Container>
            <Container className="single-display card-component" id="datos">
              <div className="single-display-title">
                <h2>Tipos de dato</h2>
                {isAuthenticated && (
                  <button
                    className="single-display-add"
                    onClick={() => setMostrarUnidad(true)}
                  >
                    +
                  </button>
                )}
              </div>
              <div className="catalogos-table-section catalogos-datos-section catalogo-datos-grid">
                {dato.map((d) => (
                  <div key={d.id} className="single-display-config catalogo-dato-row">
                    <span className="single-display-info catalogo-dato-info">
                      <span className="catalogo-dato-name">{d.nombre}</span>
                      {isAuthenticated && <small className="admin-record-id">ID {d.id}</small>}
                      <span className="catalogo-dato-unidad">{d.unidad || "Sin unidad"}</span>
                    </span>
                    <div className="single-display-buttons">
                      {isAuthenticated && (
                        <button
                          className="single-display-edit"
                          aria-label={`Editar ${d.nombre}`}
                          onClick={() => {
                            setMostrarUnidad(true);
                            setEditarUnidad(d);
                          }}
                        >
                          <AiFillEdit />
                        </button>
                      )}

                      {isAuthenticated && (
                        <button
                          className="single-display-delete"
                          aria-label={`Eliminar ${d.nombre}`}
                          onClick={() =>
                            handleEliminar(d.id, d.nombre, "tipos-dato")
                          }
                        >
                          <AiFillDelete />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Container>
          </Col>
        </Row>
      </Container>
      <ZonasForm
        show={mostrarZona}
        onHide={() => {
          setMostrarZona(false);
          setEditarZona(null);
        }}
        onGuardado={() => refresh("zonas")}
        componente={editarZona}
        zonas={zonasVisibles}
        ubicacion={ubicacionSeleccionada}
      />
      <UbicacionesForm show={mostrarUbicacion} onHide={() => { setMostrarUbicacion(false); setEditarUbicacion(null); }} onGuardado={() => refresh("ubicaciones")} componente={editarUbicacion} />
      <TiposForm
        show={mostrarTipo}
        onHide={() => {
          setMostrarTipo(false);
          setEditarTipo(null);
        }}
        onGuardado={() => refresh("tipos-dispositivo")}
        componente={editarTipo}
      />
      <UnidadForm
        show={mostrarUnidad}
        onHide={() => {
          setMostrarUnidad(false);
          setEditarUnidad(null);
        }}
        onGuardado={() => refresh("tipos-dato")}
        componente={editarUnidad}
      />
    </section>
  );
}

export default Configuracion;
