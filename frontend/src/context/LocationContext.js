import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { API_URL, fetchJson } from "../utils/api";

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionId, setUbicacionId] = useState(() => localStorage.getItem("invernadero-ubicacion-id") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargarUbicaciones = useCallback(async (signal) => {
    setLoading(true);
    try {
      const datos = await fetchJson(`${API_URL}/api/catalogos/ubicaciones`, { signal });
      setUbicaciones(datos);
      setUbicacionId((actual) => {
        const existe = datos.some((ubicacion) => String(ubicacion.id) === String(actual));
        const siguiente = existe ? String(actual) : String(datos[0]?.id || "");
        if (siguiente) localStorage.setItem("invernadero-ubicacion-id", siguiente);
        else localStorage.removeItem("invernadero-ubicacion-id");
        return siguiente;
      });
      setError(null);
      return datos;
    } catch (fetchError) {
      if (fetchError.name !== "AbortError") setError(fetchError.message || "No fue posible cargar las ubicaciones");
      return [];
    } finally {
      if (signal?.aborted !== true) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    cargarUbicaciones(controller.signal);
    return () => controller.abort();
  }, [cargarUbicaciones]);

  const seleccionarUbicacion = useCallback((id) => {
    const siguiente = String(id || "");
    setUbicacionId(siguiente);
    if (siguiente) localStorage.setItem("invernadero-ubicacion-id", siguiente);
    else localStorage.removeItem("invernadero-ubicacion-id");
  }, []);

  const ubicacionActual = useMemo(
    () => ubicaciones.find((ubicacion) => String(ubicacion.id) === String(ubicacionId)) || ubicaciones[0] || null,
    [ubicaciones, ubicacionId],
  );

  const value = useMemo(() => ({
    ubicaciones,
    ubicacionId: ubicacionActual?.id ? String(ubicacionActual.id) : "",
    ubicacionActual,
    loading,
    error,
    seleccionarUbicacion,
    recargarUbicaciones: cargarUbicaciones,
  }), [ubicaciones, ubicacionActual, loading, error, seleccionarUbicacion, cargarUbicaciones]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocation debe utilizarse dentro de LocationProvider");
  return context;
}
