import React, { useState, useEffect } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import logo from "../Assets/logo_uabc.png";
import {
  WiLightning,
  WiThermometerExterior,
} from "react-icons/wi";
import { FiHome, FiSettings, FiSun, FiMoon, FiChevronLeft, FiChevronRight, FiSliders, FiLogIn, FiLogOut } from "react-icons/fi";

function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [expand, updateExpander] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navColour, updateNavbar] = useState(false);
  const [theme, setTheme] = useState(() => {
    const temaGuardado = localStorage.getItem("invernadero-theme") || "light";
    document.documentElement.dataset.theme = temaGuardado;
    return temaGuardado;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("invernadero-theme", theme);
  }, [theme]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 767.98px)");
    const resetCollapsedState = (event) => {
      if (event.matches) setCollapsed(false);
    };

    resetCollapsedState(mobileViewport);
    mobileViewport.addEventListener("change", resetCollapsedState);
    return () => mobileViewport.removeEventListener("change", resetCollapsedState);
  }, []);

  const navLink = (to, label, icon, end = false) => (
    <Nav.Link
      as={NavLink}
      to={to}
      end={end}
      onClick={() => updateExpander(false)}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      {icon}
      {label}
    </Nav.Link>
  );

  useEffect(() => {
    function scrollHandler() {
      if (window.scrollY >= 1) updateNavbar(true);
      else updateNavbar(false);
    }
    document.addEventListener("scroll", scrollHandler);
    return () => document.removeEventListener("scroll", scrollHandler);
  }, []);

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={`${navColour ? "sticky" : "navbar"}${collapsed ? " navbar-collapsed" : ""}`}
    >
      <Container>
        <Navbar.Brand as={Link} to="/" className="d-flex" onClick={() => updateExpander(false)}>
          <img src={logo} className="img-fluid logo" alt="brand" />
          <p className="d-none d-md-inline">Monitoreo del sitio</p>
        </Navbar.Brand>
        <button
          type="button"
          className="sidebar-collapse-button d-none d-md-grid"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}
          title={collapsed ? "Expandir menú" : "Minimizar menú"}
        >
          {collapsed ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
        </button>
        <Navbar.Toggle
          aria-controls="responsive-navbar-nav"
          aria-label={expand ? "Cerrar navegación" : "Abrir navegación"}
          onClick={() => {
            updateExpander(expand ? false : "expanded");
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </Navbar.Toggle>
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="nav-primary">
            <Nav.Item>
              {navLink("/", "Inicio", <FiHome className="nav-icon" />, true)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/datos", "Historial", <WiThermometerExterior className="nav-icon" />)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/dispositivos", "Nodos", <WiLightning className="nav-icon" />)}
            </Nav.Item>
            <Nav.Item>{navLink("/control", "Tareas", <FiSliders className="nav-icon" />)}</Nav.Item>
            {isAuthenticated && <Nav.Item>{navLink("/configuracion", "Configuración", <FiSettings className="nav-icon" />)}</Nav.Item>}
          </Nav>
          <Nav className="nav-secondary">
            <Nav.Item className="theme-nav-item">
              {collapsed ? (
                <button type="button" className="theme-switch theme-switch-compact" onClick={() => setTheme((actual) => actual === "dark" ? "light" : "dark")} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}>
                  {theme === "dark" ? <FiMoon aria-hidden="true" /> : <FiSun aria-hidden="true" />}
                </button>
              ) : (
                <div className="theme-switch" role="group" aria-label="Seleccionar tema">
                  <button type="button" className={`theme-switch-button${theme === "light" ? " active" : ""}`} onClick={() => setTheme("light")} aria-pressed={theme === "light"} aria-label="Usar modo claro" title="Usar modo claro"><FiSun aria-hidden="true" /></button>
                  <button type="button" className={`theme-switch-button${theme === "dark" ? " active" : ""}`} onClick={() => setTheme("dark")} aria-pressed={theme === "dark"} aria-label="Usar modo oscuro" title="Usar modo oscuro"><FiMoon aria-hidden="true" /></button>
                </div>
              )}
            </Nav.Item>

            <Nav.Item>
              {isAuthenticated ? (
                <Nav.Link
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                  aria-label="Cerrar sesión"
                  title={collapsed ? "Cerrar sesión" : undefined}
                >
                  <FiLogOut className="nav-icon" aria-hidden="true" />Cerrar sesión
                </Nav.Link>
              ) : (
                <Nav.Link as={Link} to="/login" aria-label="Iniciar sesión" title={collapsed ? "Iniciar sesión" : undefined}>
                  <FiLogIn className="nav-icon" aria-hidden="true" />Iniciar sesión
                </Nav.Link>
              )}
            </Nav.Item>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
