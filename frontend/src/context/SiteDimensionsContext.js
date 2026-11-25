import { createContext, useContext } from "react";
import { useLocation } from "./LocationContext";

const SiteDimensionsContext = createContext({ dimensions: null, loading: true, error: null });

export function SiteDimensionsProvider({ children }) {
  const { ubicacionActual, loading, error } = useLocation();
  const dimensions = ubicacionActual ? {
    largo: Number(ubicacionActual.largo),
    ancho: Number(ubicacionActual.ancho),
    altura: Number(ubicacionActual.altura),
  } : null;

  return <SiteDimensionsContext.Provider value={{ dimensions, loading, error }}>{children}</SiteDimensionsContext.Provider>;
}

export function useSiteDimensions() {
  return useContext(SiteDimensionsContext);
}
