import NavBar from "./components/Navbar";
import Preloader from "./components/Pre";
import Footer from "./components/Footer";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { lazy, Suspense } from "react";

import "./style.css";
import { AuthProvider } from "./context/AuthContext";

const Login = lazy(() => import("./components/Login/Login"));
const Home = lazy(() => import("./components/Inicio/Home"));
const Datos = lazy(() => import("./components/Datos/Datos"));
const Dispositivos = lazy(
  () => import("./components/Dispositivos/Dispositivos"),
);
const Configuracion = lazy(
  () => import("./components/Configuracion/Configuracion"),
);

function App() {
  const [load, updateLoad] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateLoad(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Preloader load={load} />
        <div className="App" id={load ? "no-scroll" : "scroll"}>
          <NavBar />
          <div className="app-content">
            <Suspense fallback={<div>Cargando...</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Home />} />
                <Route path="/datos" element={<Datos />} />
                <Route path="/dispositivos" element={<Dispositivos />} />
                <Route path="/configuracion" element={<Configuracion />} />
              </Routes>
            </Suspense>
          </div>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
