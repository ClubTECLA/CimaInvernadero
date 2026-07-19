import React, { useState, useEffect } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import logo from "../Assets/logo_uabc.png";
import {
  WiLightning,
  WiThermometerExterior,
  WiSnowflakeCold,
  WiSmallCraftAdvisory,
} from "react-icons/wi";

function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [expand, updateExpander] = useState(false);
  const [navColour, updateNavbar] = useState(false);

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
          <p className="d-none d-md-inline">Monitoreo de invernadero</p>
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
              <Nav.Link as={Link} to="/" onClick={() => updateExpander(false)}>
                <WiSmallCraftAdvisory
                  style={{ marginBottom: "2px", fontSize: "1.5em" }}
                />
                Inicio
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/datos"
                onClick={() => updateExpander(false)}
              >
                <WiThermometerExterior
                  style={{ marginBottom: "2px", fontSize: "1.5em" }}
                />
                Datos
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/dispositivos"
                onClick={() => updateExpander(false)}
              >
                <WiLightning
                  style={{ marginBottom: "2px", fontSize: "1.5em" }}
                />
                Dispositivos
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/configuracion"
                onClick={() => updateExpander(false)}
              >
                <WiSnowflakeCold
                  style={{ marginBottom: "2px", fontSize: "1.5em" }}
                />
                Configuracion
              </Nav.Link>
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
