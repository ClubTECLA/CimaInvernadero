import React, { useEffect, useMemo, useState } from "react";
import { FiActivity, FiCloud, FiDroplet, FiSun, FiThermometer, FiWind } from "react-icons/fi";
import "../../styles/data-charts.css";

function fechaCorta(valor) {
  if (!valor) return "Sin fecha";
  return new Date(valor).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
}

function fechaDetallada(valor) {
  if (!valor) return "Fecha no disponible";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "Fecha no disponible";
  return fecha.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/\./g, "");
}
function iconoParaMetrica(nombre) {
  const clave = String(nombre || "").toLowerCase();
  if (clave.includes("temperatura")) return FiThermometer;
  if (clave.includes("sustrato") || clave.includes("humedad")) return FiDroplet;
  if (clave.includes("ilumin") || clave.includes("luz")) return FiSun;
  if (clave.includes("carbon")) return FiCloud;
  if (clave.includes("vpd")) return FiWind;
  return FiActivity;
}

export function GraficaLecturas({ lecturas }) {
  const [metricaSeleccionada, setMetricaSeleccionada] = useState(null);
  const [indiceMetricas, setIndiceMetricas] = useState(0);
  const [puntoActivo, setPuntoActivo] = useState(null);
  const [anchoVentana, setAnchoVentana] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const grupos = useMemo(() => {
    const resultado = new Map();
    lecturas.forEach((lectura) => {
      const valor = Number(lectura.dato);
      if (!Number.isFinite(valor)) return;
      const sensorClave = lectura.sensor_id == null ? "legacy" : String(lectura.sensor_id);
      const sensorNombre = lectura.sensor_nombre || (lectura.sensor_id == null ? null : `Sensor ${lectura.sensor_id}`);
      const nombre = sensorNombre ? `${sensorNombre} · ${lectura.tipo_dato}` : lectura.tipo_dato;
      const clave = `${sensorClave}|${lectura.tipo_dato}|${lectura.unidad || ""}`;
      if (!resultado.has(clave)) resultado.set(clave, { clave, nombre, unidad: lectura.unidad || "", puntos: [] });
      resultado.get(clave).puntos.push({ valor, fecha: lectura.created_at });
    });
    return [...resultado.values()].map((grupo) => ({
      ...grupo,
      puntos: grupo.puntos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).slice(-40),
    }));
  }, [lecturas]);

  useEffect(() => {
    if (metricaSeleccionada && !grupos.some((grupo) => grupo.clave === metricaSeleccionada)) {
      setMetricaSeleccionada(grupos[0]?.clave || null);
    }
  }, [grupos, metricaSeleccionada]);

  useEffect(() => {
    const actualizarAncho = () => setAnchoVentana(window.innerWidth);
    window.addEventListener("resize", actualizarAncho);
    return () => window.removeEventListener("resize", actualizarAncho);
  }, []);

  if (!grupos.length) {
    return (
      <section className="data-charts data-page-section" aria-labelledby="graficas-lecturas-title">
        <div className="data-charts-heading">
          <div>
            <span className="data-section-kicker">TENDENCIA EN EL PERIODO</span>
            <h2 id="graficas-lecturas-title">Gráficas por tipo de dato</h2>
          </div>
        </div>
        <p className="data-charts-empty" role="status">No hay lecturas suficientes en el período para mostrar tendencias.</p>
      </section>
    );
  }

  const metricasPorVista = anchoVentana >= 1100 ? 3 : anchoVentana >= 768 ? 2 : 1;
  const grupoSeleccionado = grupos.find((grupo) => grupo.clave === metricaSeleccionada) || grupos[0];
  const claveSeleccionada = grupoSeleccionado.clave;
  const metricasDisponibles = grupos.filter((grupo) => grupo.clave !== claveSeleccionada);
  const maximoIndiceMetricas = Math.max(0, metricasDisponibles.length - metricasPorVista);
  const indiceSeguro = Math.min(indiceMetricas, maximoIndiceMetricas);
  const gruposVisibles = metricasDisponibles.slice(indiceSeguro, indiceSeguro + metricasPorVista);

  const estadisticas = (grupo) => {
    const valores = grupo.puntos.map((punto) => punto.valor);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const promedio = valores.reduce((total, valor) => total + valor, 0) / valores.length;
    return { minimo, promedio, maximo };
  };

  const renderGrafica = (grupo) => {
    const valores = grupo.puntos.map((punto) => punto.valor);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const rango = maximo - minimo || 1;
    const anchoGrafica = anchoVentana < 768 ? 360 : 900;
    const inicioX = anchoVentana < 768 ? 42 : 56;
    const finX = anchoGrafica - (anchoVentana < 768 ? 12 : 10);
    const inicioY = 24;
    const finY = 152;
    const coordenadas = grupo.puntos.map((punto, indice) => ({
      ...punto,
      x: grupo.puntos.length === 1 ? (inicioX + finX) / 2 : inicioX + (indice / (grupo.puntos.length - 1)) * (finX - inicioX),
      y: finY - ((punto.valor - minimo) / rango) * (finY - inicioY),
    }));
    const trayectoria = coordenadas.map((punto) => `${punto.x.toFixed(1)},${punto.y.toFixed(1)}`).join(" ");
    const area = `M ${coordenadas[0].x},${finY} L ${coordenadas.map((punto) => `${punto.x.toFixed(1)},${punto.y.toFixed(1)}`).join(" L ")} L ${coordenadas[coordenadas.length - 1].x},${finY} Z`;
    const indiceActivo = puntoActivo === null ? null : Math.min(puntoActivo, coordenadas.length - 1);
    const punto = indiceActivo === null ? null : coordenadas[indiceActivo];
    const idsFechas = [...new Set([0, Math.floor((coordenadas.length - 1) / 2), coordenadas.length - 1])];
    const formatearValor = (valor) => valor.toLocaleString("es-MX", { maximumFractionDigits: 2 });
    const seleccionarPorPosicion = (evento) => {
      const svg = evento.currentTarget.querySelector("svg");
      const rect = svg?.getBoundingClientRect();
      if (!rect?.width) return;
      const x = ((evento.clientX - rect.left) / rect.width) * anchoGrafica;
      const indice = Math.round(Math.max(0, Math.min(1, (x - inicioX) / (finX - inicioX))) * (coordenadas.length - 1));
      setPuntoActivo(indice);
    };
    const recorrerLecturas = (evento) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
      evento.preventDefault();
      setPuntoActivo((actual) => {
        if (evento.key === "Home") return 0;
        if (evento.key === "End") return coordenadas.length - 1;
        if (actual === null) return evento.key === "ArrowRight" ? 0 : coordenadas.length - 1;
        return Math.max(0, Math.min(coordenadas.length - 1, actual + (evento.key === "ArrowRight" ? 1 : -1)));
      });
    };
    const gradienteId = `data-chart-gradient-${grupo.nombre.replace(/[^a-z0-9]/gi, "-")}`;
    return (
      <article className="data-chart-card data-chart-card--featured" key={grupo.clave}>
        <div className="data-chart-card-heading">
          <div className="data-chart-title-wrap">
            <h3>{grupo.nombre}</h3>
          </div>
          <strong>{grupo.puntos[grupo.puntos.length - 1].valor.toLocaleString("es-MX")} {grupo.unidad}</strong>
        </div>
        <div
          className="data-chart-plot"
          role="group"
          tabIndex={0}
          aria-label={`Gráfica interactiva de ${grupo.nombre}. Use las flechas izquierda y derecha para recorrer las lecturas.`}
          onPointerMove={seleccionarPorPosicion}
          onPointerDown={seleccionarPorPosicion}
          onPointerLeave={(evento) => { if (evento.pointerType !== "touch") setPuntoActivo(null); }}
          onKeyDown={recorrerLecturas}
          onFocus={() => setPuntoActivo((actual) => actual ?? coordenadas.length - 1)}
        >
          <svg className="data-chart" viewBox={`0 0 ${anchoGrafica} 180`} aria-hidden="true">
            <defs>
              <linearGradient id={gradienteId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.015" />
              </linearGradient>
            </defs>
            {[inicioY, (inicioY + finY) / 2, finY].map((y, indice) => (
              <g key={y}>
                <line x1={inicioX} y1={y} x2={finX} y2={y} className={indice === 2 ? "data-chart-axis" : "data-chart-grid-line"} />
                <text x="0" y={y + 4} className="data-chart-axis-label">{formatearValor(maximo - (rango * indice) / 2)}</text>
              </g>
            ))}
            {idsFechas.map((indice) => <line key={`tick-${indice}`} x1={coordenadas[indice].x} y1={finY} x2={coordenadas[indice].x} y2={finY + 5} className="data-chart-tick" />)}
            <path d={area} className="data-chart-area" fill={`url(#${gradienteId})`} />
            {punto && <line x1={punto.x} y1={inicioY} x2={punto.x} y2={finY} className="data-chart-crosshair" />}
            <polyline points={trayectoria} className="data-chart-line" />
            {coordenadas.map((coordenada, indice) => (
              <circle
                key={`${coordenada.fecha}-${indice}`}
                cx={coordenada.x}
                cy={coordenada.y}
                r={indiceActivo === indice ? 6 : 2.8}
                className={`data-chart-point${indiceActivo === indice ? " is-active" : ""}`}
                onPointerEnter={() => setPuntoActivo(indice)}
              />
            ))}
          </svg>
          {punto && <div className={`data-chart-tooltip${punto.y < 48 ? " is-below" : ""}`} style={{ left: `${Math.min(85, Math.max(15, (punto.x / anchoGrafica) * 100))}%`, top: `${Math.max(10, (punto.y / 180) * 100)}%` }} role="status" aria-live="polite">
            <strong>{formatearValor(punto.valor)} {grupo.unidad}</strong>
            <time dateTime={punto.fecha}>{fechaDetallada(punto.fecha)}</time>
          </div>}
        </div>
        <div className="data-chart-dates">{idsFechas.map((indice, posicion) => <span key={indice}><b>{idsFechas.length === 1 ? "Lectura" : posicion === 0 ? "Inicio" : posicion === idsFechas.length - 1 ? "Fin" : "Intermedio"}</b>{fechaCorta(coordenadas[indice].fecha)}</span>)}</div>
      </article>
    );
  };

  const renderTarjetaMetrica = (grupo) => {
    const claveGrupo = grupo.clave;
    const Icono = iconoParaMetrica(grupo.nombre);
    const { minimo, promedio, maximo } = estadisticas(grupo);
    return (
      <button
        type="button"
        className="data-metric-card"
        key={claveGrupo}
        aria-label={`Ver gráfica de ${grupo.nombre}`}
        onClick={() => { setMetricaSeleccionada(claveGrupo); setPuntoActivo(null); }}
      >
        <span className="data-metric-card-icon"><Icono aria-hidden="true" /></span>
        <span className="data-metric-card-content">
          <strong>{grupo.nombre}</strong>
          <span className="data-metric-card-stats">
            <span><b>Mín.</b>{minimo.toLocaleString("es-MX")} {grupo.unidad}</span>
            <span><b>Prom.</b>{promedio.toLocaleString("es-MX", { maximumFractionDigits: 2 })} {grupo.unidad}</span>
            <span><b>Máx.</b>{maximo.toLocaleString("es-MX")} {grupo.unidad}</span>
          </span>
        </span>
        <span className="data-metric-card-indicator" aria-hidden="true">Ver gráfica</span>
      </button>
    );
  };

  return (
    <section className="data-charts data-page-section" aria-labelledby="graficas-lecturas-title">
      <div className="data-charts-heading">
        <div>
          <span className="data-section-kicker">TENDENCIA EN EL PERIODO</span>
          <h2 id="graficas-lecturas-title">Gráficas por tipo de dato</h2>
        </div>
        <span className="data-charts-note">Pase el cursor, toque la gráfica o use las flechas del teclado para consultar cada lectura.</span>
      </div>
      <div className="data-chart-featured-layout">
        {renderGrafica(grupoSeleccionado)}
      </div>
      <div className="data-metrics-selector" aria-label="Métricas disponibles">
        <div className="data-metrics-selector-heading">
          <h3>Otras métricas</h3>
          <span>{metricasDisponibles.length} {metricasDisponibles.length === 1 ? "disponible" : "disponibles"}</span>
        </div>
        {metricasDisponibles.length ? <div className="data-metrics-carousel">
          {metricasDisponibles.length > metricasPorVista && <button type="button" className="data-metrics-carousel-button" aria-label="Métricas anteriores" onClick={() => setIndiceMetricas((actual) => Math.max(0, actual - 1))} disabled={indiceSeguro === 0}>←</button>}
          <div className="data-metrics-grid" style={{ "--metric-columns": gruposVisibles.length }}>{gruposVisibles.map(renderTarjetaMetrica)}</div>
          {metricasDisponibles.length > metricasPorVista && <button type="button" className="data-metrics-carousel-button" aria-label="Más métricas" onClick={() => setIndiceMetricas((actual) => Math.min(maximoIndiceMetricas, actual + 1))} disabled={indiceSeguro >= maximoIndiceMetricas}>→</button>}
        </div> : <p className="data-metrics-empty">No hay otras métricas con lecturas en este período.</p>}
      </div>
    </section>
  );
}
export default GraficaLecturas;
