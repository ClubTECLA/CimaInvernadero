import { createContext, useContext } from "react";
import SITE_DIMENSIONS from "../config/siteDimensions";

const SiteDimensionsContext = createContext({ dimensions: SITE_DIMENSIONS, loading: false, error: null });

export function SiteDimensionsProvider({ children }) {
  return (
    <SiteDimensionsContext.Provider value={{ dimensions: SITE_DIMENSIONS, loading: false, error: null }}>
      {children}
    </SiteDimensionsContext.Provider>
  );
}

export function useSiteDimensions() {
  return useContext(SiteDimensionsContext);
}
