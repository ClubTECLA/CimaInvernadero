import { createContext, useContext, useEffect, useState } from "react";
import { API_URL } from "../utils/api";

const SiteDimensionsContext = createContext({ dimensions: null, loading: true, error: null });

export function SiteDimensionsProvider({ children }) {
  const [dimensions, setDimensions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/catalogos/ubicaciones`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("No fue posible cargar las medidas del sitio");
        return response.json();
      })
      .then((ubicaciones) => {
        const ubicacion = ubicaciones[0];
        setDimensions(ubicacion ? {
          largo: Number(ubicacion.largo),
          ancho: Number(ubicacion.ancho),
          altura: Number(ubicacion.altura),
        } : null);
        setError(null);
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  return <SiteDimensionsContext.Provider value={{ dimensions, loading, error }}>{children}</SiteDimensionsContext.Provider>;
}

export function useSiteDimensions() {
  return useContext(SiteDimensionsContext);
}
