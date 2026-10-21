import React, { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Table from "react-bootstrap/Table";

import { API_URL, fetchJson } from "../../utils/api";

import { CiExport } from "react-icons/ci";

const comparadorEspanol = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function ordenarPorNombre(elementos, campo) {
  return [...elementos].sort((a, b) => comparadorEspanol.compare(a[campo] || "", b[campo] || ""));
}

function fechaHoraParaApi(valor, esFechaFinal = false) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (esFechaFinal) fecha.setSeconds(59, 999);
  return fecha.toISOString();
}

function Datos() {
  const [lecturas, setLecturas] = useState([]);
  const [dispositivos, setDispositivos] = useState([]);
  const [tiposDato, setTiposDato] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  const [filtroDispositivo, setFiltroDispositivo] = useState("");
  const [filtroTipoDato, setFiltroTipoDato] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [filtroUbicacion, setFiltroUbicacion] = useState("1");
  const [filtroFechaInicio, setFiltroFechaInicio] = useState("");
  const [filtroFechaFin, setFiltroFechaFin] = useState("");
  const hayFiltros = Boolean(
    filtroDispositivo ||
      filtroTipoDato ||
      filtroZona ||
      filtroFechaInicio ||
      filtroFechaFin,
  );
  const zonasDeUbicacion = zonas.filter((zona) => !filtroUbicacion || String(zona.ubicacion_id) === String(filtroUbicacion));
  const idsZonasDeUbicacion = new Set(zonasDeUbicacion.map((zona) => String(zona.id)));
  const dispositivosDeUbicacion = dispositivos.filter((dispositivo) => !filtroUbicacion || idsZonasDeUbicacion.has(String(dispositivo.zona_id)));

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchJson(`${API_URL}/api/dispositivos`, {
        signal: controller.signal,
      }),
      fetchJson(`${API_URL}/api/catalogos/tipos-dato`, {
        signal: controller.signal,
      }),
      fetchJson(`${API_URL}/api/catalogos/zonas`, {
        signal: controller.signal,
      }),
      fetchJson(`${API_URL}/api/catalogos/ubicaciones`, {
        signal: controller.signal,
      }),
    ])
      .then(([datosDispositivos, datosTipos, datosZonas, datosUbicaciones]) => {
        setDispositivos(datosDispositivos);
        setTiposDato(datosTipos);
        setZonas(datosZonas);
        setUbicaciones(datosUbicaciones);
        if (datosUbicaciones.length) setFiltroUbicacion((actual) => datosUbicaciones.some((item) => String(item.id) === String(actual)) ? actual : String(datosUbicaciones[0].id));
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("No fue posible cargar los filtros");
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    filtroDispositivo,
    filtroTipoDato,
    filtroZona,
    filtroFechaInicio,
    filtroFechaFin,
    filtroUbicacion,
  ]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (filtroDispositivo) params.append("dispositivo_id", filtroDispositivo);
      if (filtroTipoDato) params.append("tipo_dato_id", filtroTipoDato);
      if (filtroZona) params.append("zona_id", filtroZona);
      if (filtroUbicacion) params.append("ubicacion_id", filtroUbicacion);
      if (filtroFechaInicio) params.append("fecha_inicio", fechaHoraParaApi(filtroFechaInicio));
      if (filtroFechaFin) params.append("fecha_fin", fechaHoraParaApi(filtroFechaFin, true));
      params.append("page", pagina);
      params.append("limit", filasPorPagina);

      try {
        const datos = await fetchJson(
          `${API_URL}/api/lecturas?${params.toString()}`,
          { signal: controller.signal },
        );
        setLecturas(datos.datos);
        setTotalPaginas(datos.total_paginas);
        setTotalRegistros(Number(datos.total) || 0);
      } catch (err) {
        if (err.name !== "AbortError") {
          setLecturas([]);
          setError(err.message || "No fue posible cargar las lecturas");
        }
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    filtroDispositivo,
    filtroTipoDato,
    filtroZona,
    filtroFechaInicio,
    filtroFechaFin,
    filtroUbicacion,
    pagina,
    filasPorPagina,
  ]);

  function reiniciarFiltros() {
    setFiltroDispositivo("");
    setFiltroTipoDato("");
    setFiltroZona("");
    setFiltroFechaInicio("");
    setFiltroFechaFin("");
  }

  function generarBotonesPagina() {
    const paginas = new Set([1, totalPaginas]);
    for (
      let numero = Math.max(1, pagina - 1);
      numero <= Math.min(totalPaginas, pagina + 1);
      numero += 1
    ) {
      paginas.add(numero);
    }

    const ordenadas = [...paginas].sort((a, b) => a - b);
    return ordenadas.reduce((resultado, numero, indice) => {
      if (indice > 0 && numero - ordenadas[indice - 1] > 1) {
        resultado.push("...");
      }
      resultado.push(numero);
      return resultado;
    }, []);
  }

  function obtenerParametrosExportacion() {
    const params = new URLSearchParams();
    if (filtroDispositivo) params.append("dispositivo_id", filtroDispositivo);
    if (filtroTipoDato) params.append("tipo_dato_id", filtroTipoDato);
    if (filtroZona) params.append("zona_id", filtroZona);
    if (filtroUbicacion) params.append("ubicacion_id", filtroUbicacion);
    if (filtroFechaInicio) params.append("fecha_inicio", fechaHoraParaApi(filtroFechaInicio));
    if (filtroFechaFin) params.append("fecha_fin", fechaHoraParaApi(filtroFechaFin, true));
    return params;
  }

  async function handleExportar() {
    if (cargando || totalRegistros === 0) return;

    const params = obtenerParametrosExportacion();
    setExportando(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_URL}/api/lecturas/exportar?${params.toString()}`,
      );

      if (!res.ok) {
        const datos = await res.json().catch(() => null);
        throw new Error(datos?.error || "No fue posible exportar las lecturas");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const selloFecha = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
      a.download = `lecturas_invernadero_${selloFecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <section>
      <Container className="data-page">
        <Container className="data-section data-page-section">
          <Row>
            <Col>
                <h1>Historial de lecturas</h1>
                <p>
                En esta sección se muestran las mediciones registradas por los
                nodos registrados en el sitio.
              </p>
            </Col>
            <Col className="text-end align-content-center">
              <button
                className="add-button datos-export-button"
                onClick={handleExportar}
                disabled={cargando || exportando || totalRegistros === 0}
                title={
                  totalRegistros === 0
                    ? "No hay lecturas para exportar"
                    : "Descargue las lecturas con los filtros seleccionados"
                }
              >
                <CiExport /> {exportando ? "Preparando Excel…" : "Exportar Excel"}
              </button>
            </Col>
          </Row>
        </Container>

        <Container className="filter-section data-page-section card-component">
          <div className="filter-section-title">
            <h2>Filtros de búsqueda</h2>
            {hayFiltros && (
              <button className="filter-reset-button" onClick={reiniciarFiltros}>Limpiar filtros</button>
            )}
          </div>
          <Row className="filter-fields-row">
            <Col className="filter">
              <label htmlFor="ubicacion">Ubicación</label>
              <select id="ubicacion" onChange={(e) => { setFiltroUbicacion(e.target.value); setFiltroZona(""); }} value={filtroUbicacion}>
                {ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </Col>
            <Col className="filter">
              <label htmlFor="dispositivo">Nodo</label>
              <select
                id="dispositivo"
                onChange={(e) => setFiltroDispositivo(e.target.value)}
                value={filtroDispositivo}
              >
                <option value="">Todos los nodos</option>
                {ordenarPorNombre(dispositivosDeUbicacion, "nombre").map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Col>
            <Col className="filter">
              <label htmlFor="tipo_dato">Tipo de dato</label>
              <select
                id="tipo_dato"
                onChange={(e) => setFiltroTipoDato(e.target.value)}
                value={filtroTipoDato}
              >
                <option value="">Todos los tipos</option>
                {ordenarPorNombre(tiposDato, "nombre").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Col>
            <Col className="filter">
              <label htmlFor="tipo_zona">Zona</label>
              <select
                id="tipo_zona"
                onChange={(e) => setFiltroZona(e.target.value)}
                value={filtroZona}
              >
                <option value="">Todas las zonas</option>
                {ordenarPorNombre(zonasDeUbicacion, "zona").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.zona}
                  </option>
                ))}
              </select>
            </Col>
            <Col className="filter">
              <label htmlFor="fecha_inicio">Fecha y hora inicial</label>
              <input
                type="datetime-local"
                step="60"
                id="fecha_inicio"
                onChange={(e) => setFiltroFechaInicio(e.target.value)}
                value={filtroFechaInicio}
                max={filtroFechaFin || undefined}
              />
            </Col>
            <Col className="filter">
              <label htmlFor="fecha_fin">Fecha y hora final</label>
              <input
                type="datetime-local"
                step="60"
                id="fecha_fin"
                onChange={(e) => setFiltroFechaFin(e.target.value)}
                value={filtroFechaFin}
                min={filtroFechaInicio || undefined}
              />
            </Col>
          </Row>
        </Container>

        {/* TABLA*/}
        <Container className="all-section data-page-section card-component">
          <div className="lecturas-title">
            <div className="lecturas-title-copy">
              <h2>Lecturas registradas</h2>
              <span className="records-total">
                {totalRegistros.toLocaleString("es-MX")} registros encontrados
              </span>
            </div>
            <label className="page-size-control">
              <span>Mostrar</span>
              <select
                aria-label="Cantidad de lecturas por página"
                value={filasPorPagina}
                onChange={(event) => {
                  setFilasPorPagina(Number(event.target.value));
                  setPagina(1);
                }}
              >
                {[10, 25, 50, 100].map((cantidad) => (
                  <option key={cantidad} value={cantidad}>{cantidad}</option>
                ))}
              </select>
              <span>por página</span>
            </label>
          </div>

          <div className="table-section">
            <Table>
              <thead className="table-head">
                <tr>
                  <th>Nodo</th>
                  <th className="d-none d-md-table-cell">Tipo de dato</th>
                  <th>Valor</th>
                  <th>Zona</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="text-center text-danger">
                      {error}
                    </td>
                  </tr>
                ) : lecturas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      No hay lecturas
                    </td>
                  </tr>
                ) : (
                  lecturas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.dispositivo}</td>
                      <td className="d-none d-md-table-cell">{l.tipo_dato}</td>
                      <td>
                        {l.dato} {l.unidad}
                      </td>
                      <td>{l.zona}</td>
                      <td className="d-none d-md-table-cell">
                        {new Date(l.created_at).toLocaleString("es-MX")}
                      </td>
                      <td className="d-md-none">
                        {new Date(l.created_at).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>

          {totalPaginas > 1 && (
            <div className="pagination-footer">
              <div className="pagination-section" aria-label="Paginación de lecturas">
              <button
                className="pagination-btn"
                aria-label="Página anterior"
                onClick={() => setPagina((p) => p - 1)}
                disabled={pagina === 1}
              >
                ←
              </button>

              {generarBotonesPagina().map((btn, i) =>
                btn === "..." ? (
                  <span key={`ellipsis-${i}`} className="pagination-ellipsis" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={btn}
                    className={`pagination-btn ${pagina === btn ? "activo" : ""}`}
                    aria-label={`Página ${btn}`}
                    aria-current={pagina === btn ? "page" : undefined}
                    onClick={() => setPagina(btn)}
                  >
                    {btn}
                  </button>
                ),
              )}

              <button
                className="pagination-btn"
                aria-label="Página siguiente"
                onClick={() => setPagina((p) => p + 1)}
                disabled={pagina === totalPaginas}
              >
                →
              </button>
              </div>
            </div>
          )}
        </Container>
      </Container>
    </section>
  );
}

export default Datos;
