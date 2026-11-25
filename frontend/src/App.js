import NavBar from "./components/Navbar";
import Preloader from "./components/Pre";
import Footer from "./components/Footer";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { lazy, Suspense } from "react";

import "./style.css";
import { AuthProvider } from "./context/AuthContext";
import { SiteDimensionsProvider } from "./context/SiteDimensionsContext";
import { LocationProvider } from "./context/LocationContext";
import AppErrorBoundary from "./components/AppErrorBoundary";

const Login = lazy(() => import("./components/Login/Login"));
const Home = lazy(() => import("./components/Inicio/Home"));
const Datos = lazy(() => import("./components/Datos/Datos"));
const Dispositivos = lazy(
  () => import("./components/Dispositivos/Dispositivos"),
);
const Configuracion = lazy(
  () => import("./components/Configuracion/Configuracion"),
);
const Control = lazy(() => import("./components/Control/Control"));

function App() {
  const [load, updateLoad] = useState(true);
  const modoDemoLocal = process.env.REACT_APP_LOCAL_TEST_MODE === "true";

  useEffect(() => {
    const timer = setTimeout(() => {
      updateLoad(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <LocationProvider>
       <SiteDimensionsProvider>
       <Router>
        <Preloader load={load} />
        <div className="App" id={load ? "no-scroll" : "scroll"}>
          <NavBar />
          {modoDemoLocal && (
            <div role="status" className="local-demo-banner">
              DEMO LOCAL: nodos, estados y lecturas usan datos sintéticos; no provienen de sensores conectados.
            </div>
          )}
          <div className="app-content">
            <AppErrorBoundary>
              <Suspense fallback={<div className="app-loading" role="status">Cargando pantalla…</div>}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/datos" element={<Datos />} />
                  <Route path="/dispositivos" element={<Dispositivos />} />
                  <Route path="/control" element={<Control />} />
                  <Route path="/configuracion" element={<Configuracion />} />
                </Routes>
              </Suspense>
            </AppErrorBoundary>
          </div>
          <Footer />
        </div>
       </Router>
       </SiteDimensionsProvider>
      </LocationProvider>
    </AuthProvider>
  );
}

export default App;
