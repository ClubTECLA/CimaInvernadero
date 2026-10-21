import React from "react";
import { getAssetUrl } from "../../utils/api";

export function zonasConLimites(zonas) {
  return zonas
    .filter((zona) => {
      if ([zona.largo_inicio, zona.largo_fin, zona.ancho_inicio, zona.ancho_fin].some((value) => value === null || value === undefined || value === "")) return false;
      const x0 = Number(zona.largo_inicio);
      const x1 = Number(zona.largo_fin);
      const y0 = Number(zona.ancho_inicio);
      const y1 = Number(zona.ancho_fin);
      return [x0, x1, y0, y1].every(Number.isFinite) &&
        x0 >= 0 && x1 > x0 && y0 >= 0 && y1 > y0;
    })
    .slice()
    .sort((a, b) => Number(a.largo_inicio) - Number(b.largo_inicio));
}

function MapaZonas({ zonas, seleccionadaId, onSeleccionar, imagenPlano, dimensiones }) {
  const zonasMapeadas = zonasConLimites(zonas);
  const dimensions = dimensiones && [dimensiones.largo, dimensiones.ancho].every((valor) => Number.isFinite(Number(valor)))
    ? { largo: Number(dimensiones.largo), ancho: Number(dimensiones.ancho), altura: Number(dimensiones.altura) }
    : null;
  const largoSitio = dimensions?.largo;
  const anchoSitio = dimensions?.ancho;

  return (
    <div className="zone-map-card">
      <div className="zone-map-heading">
        <div>
          <h3>Distribución de zonas</h3>
        </div>
        <span className="zone-map-size">
          {dimensions
            ? `${largoSitio.toFixed(2)} × ${anchoSitio.toFixed(2)} m`
            : "Medidas no disponibles"}
        </span>
      </div>
      <div
        className="zone-map-canvas"
        style={{
          ...(largoSitio && anchoSitio ? { aspectRatio: `${largoSitio} / ${anchoSitio}` } : {}),
          backgroundImage: getAssetUrl(imagenPlano) ? `url(${getAssetUrl(imagenPlano)})` : "none",
        }}
      >
        <div className="zone-map-interior">
          {dimensions && zonasMapeadas.map((zona, index) => {
            const x0 = Number(zona.largo_inicio);
            const x1 = Number(zona.largo_fin);
            const y0 = Number(zona.ancho_inicio);
            const y1 = Number(zona.ancho_fin);
            const left = (x0 / largoSitio) * 100;
            const top = (y0 / anchoSitio) * 100;
            const width = ((x1 - x0) / largoSitio) * 100;
            const height = ((y1 - y0) / anchoSitio) * 100;
            const seleccionada = Number(seleccionadaId) === Number(zona.id);

            return (
              <button
                key={zona.id}
                type="button"
                className={`zone-map-segment zone-color-${index % 5}${seleccionada ? " selected" : ""}`}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                onClick={() => onSeleccionar(zona.id)}
                aria-pressed={seleccionada}
                aria-label={`${zona.zona}: largo ${x0} a ${x1} metros, ancho ${y0} a ${y1} metros`}
              >
                <span>{zona.zona}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="zone-map-caption">
        El plano muestra el sitio completo; cada rectángulo representa solo los límites registrados para una zona. Las ubicaciones fuera de las zonas quedan como “Sin zona asignada”. La imagen es de referencia; verifique las posiciones en el sitio.
      </p>
    </div>
  );
}

export default MapaZonas;
