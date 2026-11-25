import { FiMapPin } from "react-icons/fi";

import { useLocation } from "../../context/LocationContext";

export default function LocationSelect({ id, value, onChange, label = "Ubicación", className = "", labelClassName = "" }) {
  const { ubicaciones, ubicacionId, loading, error, seleccionarUbicacion, recargarUbicaciones } = useLocation();
  const selectedValue = value ?? ubicacionId;

  function handleChange(event) {
    const nextValue = event.target.value;
    seleccionarUbicacion(nextValue);
    onChange?.(nextValue);
  }

  return (
    <div className={`location-select-control ${className}`.trim()}>
      <label htmlFor={id} className={labelClassName}>
        <FiMapPin aria-hidden="true" /> {label}
      </label>
      <select id={id} className="form-select" value={selectedValue || ""} onChange={handleChange} disabled={loading || ubicaciones.length === 0}>
        {ubicaciones.length ? ubicaciones.map((ubicacion) => (
          <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>
        )) : <option value="">{loading ? "Cargando ubicaciones…" : error ? "Ubicaciones no disponibles" : "No hay ubicaciones registradas"}</option>}
      </select>
      {!loading && error && ubicaciones.length === 0 && (
        <div className="location-select-error" role="alert">
          <span>No fue posible cargar las ubicaciones.</span>
          <button type="button" className="btn btn-outline-success btn-sm" onClick={() => recargarUbicaciones()}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
