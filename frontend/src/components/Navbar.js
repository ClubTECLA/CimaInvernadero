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
import { FiHome, FiSettings, FiSliders, FiSun, FiMoon } from "react-icons/fi";

function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [expand, updateExpander] = useState(false);
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

  const navLink = (to, label, icon, end = false) => (
    <Nav.Link
      as={NavLink}
      to={to}
      end={end}
      onClick={() => updateExpander(false)}
      aria-label={label}
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
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        <Navbar.Brand href="/" className="d-flex">
          <img src={logo} className="img-fluid logo" alt="brand" />
          <p className="d-none d-md-inline">Monitoreo del sitio</p>
        </Navbar.Brand>
        <Navbar.Toggle
          aria-controls="responsive-navbar-nav"
          onClick={() => {
            updateExpander(expand ? false : "expanded");
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </Navbar.Toggle>
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto">
            <Nav.Item>
              {navLink("/", "Inicio", <FiHome className="nav-icon" />, true)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/datos", "Datos", <WiThermometerExterior className="nav-icon" />)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/dispositivos", "Nodos", <WiLightning className="nav-icon" />)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/configuracion", "Configuración", <FiSettings className="nav-icon" />)}
            </Nav.Item>
            <Nav.Item>
              {navLink("/control", "Actuadores", <FiSliders className="nav-icon nav-icon-small" />)}
            </Nav.Item>

            <Nav.Item className="theme-nav-item">
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                aria-label={"Cambiar a modo " + (theme === "light" ? "oscuro" : "claro")}
                title={`Cambiar a modo ${theme === "light" ? "oscuro" : "claro"}`}
              >
                {theme === "light"
                  ? <FiSun aria-hidden="true" />
                  : <FiMoon aria-hidden="true" />}
              </button>
            </Nav.Item>

            <Nav.Item>
              {isAuthenticated ? (
                <Nav.Link
                  onClick={() => {
                    logout();
                    navigate("/");
                  }}
                >
                  Cerrar sesión
                </Nav.Link>
              ) : (
                <Nav.Link as={Link} to="/login">
                  Iniciar sesión
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
