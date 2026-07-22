import React, { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Table from "react-bootstrap/Table";

import { API_URL } from "../../utils/api";

import { CiExport } from "react-icons/ci";

//TODO: Arreglar filtro de fecha

function Datos() {
  const [lecturas, setLecturas] = useState([]);
  const [dispositivos, setDispositivos] = useState([]);
  const [tiposDato, setTiposDato] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [filtroDispositivo, setFiltroDispositivo] = useState("");
  const [filtroTipoDato, setFiltroTipoDato] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [filtroFechaInicio, setFiltroFechaInicio] = useState("");
  const [filtroFechaFin, setFiltroFechaFin] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/dispositivos`)
      .then((res) => res.json())
      .then((datos) => setDispositivos(datos));

    fetch(`${API_URL}/api/catalogos/tipos-dato`)
      .then((res) => res.json())
      .then((datos) => setTiposDato(datos));

    fetch(`${API_URL}/api/catalogos/zonas`)
      .then((res) => res.json())
      .then((datos) => setZonas(datos));
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [
    filtroDispositivo,
    filtroTipoDato,
    filtroZona,
    filtroFechaInicio,
    filtroFechaFin,
  ]);

  useEffect(() => {
    setCargando(true);

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (filtroDispositivo) params.append("dispositivo_id", filtroDispositivo);
      if (filtroTipoDato) params.append("tipo_dato_id", filtroTipoDato);
      if (filtroZona) params.append("zona_id", filtroZona);
      if (filtroFechaInicio) params.append("fecha_inicio", filtroFechaInicio);
      if (filtroFechaFin) params.append("fecha_fin", filtroFechaFin);
      params.append("page", pagina);
      params.append("limit", 10);

      fetch(`${API_URL}/api/lecturas?${params.toString()}`)
        .then((res) => res.json())
        .then((datos) => {
          setLecturas(datos.datos);
          setTotalPaginas(datos.total_paginas);
          setCargando(false);
        })
        .catch(() => setCargando(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [
    filtroDispositivo,
    filtroTipoDato,
    filtroZona,
    filtroFechaInicio,
    filtroFechaFin,
    pagina,
  ]);

  function generarBotonesPagina() {
    const botones = [];
    const rango = 2; // cuántas páginas mostrar a cada lado de la actual

    for (let i = 1; i <= totalPaginas; i++) {
      // Muestra siempre: primera, última, y las cercanas a la página actual
      if (
        i === 1 ||
        i === totalPaginas ||
        (i >= pagina - rango && i <= pagina + rango)
      ) {
        botones.push(i);
      } else if (i === pagina - rango - 1 || i === pagina + rango + 1) {
        botones.push("...");
      }
    }

    return [...new Set(botones)];
  }

  async function handleExportar() {
    const params = new URLSearchParams();
    if (filtroDispositivo) params.append("dispositivo_id", filtroDispositivo);
    if (filtroTipoDato) params.append("tipo_dato_id", filtroTipoDato);
    if (filtroZona) params.append("zona_id", filtroZona);
    if (filtroFechaInicio) params.append("fecha_inicio", filtroFechaInicio);
    if (filtroFechaFin) params.append("fecha_fin", filtroFechaFin);

    const res = await fetch(
      `${API_URL}/api/lecturas/exportar?${params.toString()}`,
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "lecturas.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <Container className="data-page">
        <Container className="data-section data-page-section">
          <Row>
            <Col>
              <h1>Historial de datos</h1>
              <p>
                En esta sección se muestran las lecturas registradas por los
                dispositivos del invernadero.
              </p>
            </Col>
            <Col className="text-end align-content-center">
              <button className="add-button" onClick={handleExportar}>
                <CiExport /> Exportar
              </button>
            </Col>
          </Row>
        </Container>

        <Container className="filter-section data-page-section card-component">
          <h2>Filtros de búsqueda</h2>
          <Row>
            <Col className="filter">
              <label htmlFor="dispositivo">Dispositivo</label>
              <select
                id="dispositivo"
                onChange={(e) => setFiltroDispositivo(e.target.value)}
                value={filtroDispositivo}
              >
                <option value="">Todos los dispositivos</option>
                {dispositivos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.tipo_dispositivo}
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
                {tiposDato.map((t) => (
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
                {zonas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.zona}
                  </option>
                ))}
              </select>
            </Col>
            <Col className="filter">
              <label htmlFor="fecha_inicio">Fecha inicial</label>
              <input
                type="date"
                id="fecha_inicio"
                onChange={(e) => setFiltroFechaInicio(e.target.value)}
                value={filtroFechaInicio}
              />
            </Col>
            <Col className="filter">
              <label htmlFor="fecha_fin">Fecha final</label>
              <input
                type="date"
                id="fecha_fin"
                onChange={(e) => setFiltroFechaFin(e.target.value)}
                value={filtroFechaFin}
              />
            </Col>
          </Row>
        </Container>

        {/* TABLA*/}
        <Container className="all-section data-page-section card-component">
          <div className="lecturas-title">
            <h2>Lecturas registradas</h2>
          </div>

          <div className="table-section">
            <Table>
              <thead className="table-head">
                <tr>
                  <th>Dispositivo</th>
                  <th className="d-none d-md-table-cell">Tipo de dato</th>
                  <th>Valor</th>
                  <th>Zona</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {cargando ? (
                  <tr>
                    <td colSpan={4} className="text-center">
                      Cargando...
                    </td>
                  </tr>
                ) : lecturas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center">
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
            <div className="pagination-section">
              <button
                className="pagination-btn"
                onClick={() => setPagina((p) => p - 1)}
                disabled={pagina === 1}
              >
                ←
              </button>

              {generarBotonesPagina().map((btn, i) =>
                btn === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="pagination-btn"
                    style={{ cursor: "default" }}
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={btn}
                    className={`pagination-btn ${pagina === btn ? "activo" : ""}`}
                    onClick={() => setPagina(btn)}
                  >
                    {btn}
                  </button>
                ),
              )}

              <button
                className="pagination-btn"
                onClick={() => setPagina((p) => p + 1)}
                disabled={pagina === totalPaginas}
              >
                →
              </button>
            </div>
          )}
        </Container>
      </Container>
    </section>
  );
}

export default Datos;
