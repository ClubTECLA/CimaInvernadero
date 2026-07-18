import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import ZonasForm from "./ZonasForm";
import TiposForm from "./TiposForm";

function Configuracion() {
  const [zonas, setZonas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [dato, setDato] = useState([]);

  const [mostrarZona, setMostrarZona] = useState(false);
  const [editarZona, setEditarZona] = useState(null);
  const [mostrarTipo, setMostrarTipo] = useState(false);
  const [editarTipo, setEditarTipo] = useState(null);

  useEffect(() => {
    fetch("/api/catalogos/zonas")
      .then((res) => res.json())
      .then((datos) => setZonas(datos));

    fetch("/api/catalogos/tipos-dispositivo")
      .then((res) => res.json())
      .then((datos) => setTipos(datos));

    fetch("/api/catalogos/tipos-dato")
      .then((res) => res.json())
      .then((datos) => setDato(datos));
  }, []);

  function refresh(ruta) {
    fetch(`/api/catalogos/${ruta}`)
      .then((res) => res.json())
      .then((datos) => {
        switch (ruta) {
          case "zonas":
            setZonas(datos);
            break;
          case "tipos-dispositivo":
            setTipos(datos);
            break;
          case "tipos-dato":
            setDato(datos);
            break;
          default:
            window.print(`No se encontró ${ruta}`);
            break;
        }
      });
  }

  async function handleEliminar(id, nombre, ruta) {
    const confirmado = window.confirm(
      `¿Estás seguro de que deseas eliminar "${nombre}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmado) return;

    try {
      const res = await fetch(`/api/catalogos/${ruta}/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const datos = await res.json();
        alert(datos.error);
        return;
      }

      refresh(ruta);
    } catch (error) {
      alert("Error al eliminar");
    }
  }

  return (
    <section>
      <Container className="catalogos-section">
        <Row>
          <Col lg={2} className="catalogos-navbar card-component">
            <ul>
              <li>
                <a href="#zonas">Zonas</a>
              </li>
              <li>
                <a href="#dispositivos">Tipos de dispositivo</a>
              </li>
              <li>
                <a href="#datos">Tipos de dato</a>
              </li>
            </ul>
          </Col>
          <Col className="catalogos-display">
            <Container className="single-display card-component" id="zonas">
              <div className="single-display-title">
                <h2>Zonas</h2>
                <button
                  className="single-display-add"
                  onClick={() => {
                    setMostrarZona(true);
                  }}
                >
                  +
                </button>
              </div>
              <div className="catalogos-table-section catalogos-zonas-section">
                {zonas.map((z) => (
                  <div className="single-display-config">
                    <span className="single-display-info">{z.zona}</span>
                    <div className="single-display-buttons">
                      <button
                        className="single-display-edit"
                        onClick={() => {
                          setEditarZona(z);
                          setMostrarZona(true);
                        }}
                      >
                        <AiFillEdit />
                      </button>
                      <button
                        className="single-display-delete"
                        onClick={() => handleEliminar(z.id, z.zona, "zonas")}
                      >
                        <AiFillDelete />
                      </button>
                    </div>
                    <hr />
                  </div>
                ))}
              </div>
            </Container>
            <Container
              className="single-display card-component"
              id="dispositivos"
            >
              <div className="single-display-title">
                <h2>Tipos de dispositivo</h2>
                <button
                  className="single-display-add"
                  onClick={() => setMostrarTipo(true)}
                >
                  +
                </button>
              </div>
              <div className="catalogos-table-section catalogos-dispositivos-section">
                {tipos.map((t) => (
                  <div className="single-display-config">
                    <span className="single-display-info">{t.nombre}</span>
                    <div className="single-display-buttons">
                      <button
                        className="single-display-edit"
                        onClick={() => {
                          setMostrarTipo(true);
                          setEditarTipo(t);
                        }}
                      >
                        <AiFillEdit />
                      </button>
                      <button
                        className="single-display-delete"
                        onClick={() =>
                          handleEliminar(t.id, t.nombre, "tipos-dispositivo")
                        }
                      >
                        <AiFillDelete />
                      </button>
                    </div>
                    <hr />
                  </div>
                ))}
              </div>
            </Container>
            <Container className="single-display card-component" id="datos">
              <div className="single-display-title">
                <h2>Tipos de dato</h2>
                <button className="single-display-add">+</button>
              </div>
              <div className="catalogos-table-section catalogos-datos-section">
                {dato.map((d) => (
                  <div className="single-display-config">
                    <span className="single-display-info">
                      {d.nombre} ({d.unidad})
                    </span>
                    <div className="single-display-buttons">
                      <button className="single-display-edit">
                        <AiFillEdit />
                      </button>
                      <button className="single-display-delete">
                        <AiFillDelete />
                      </button>
                    </div>
                    <hr />
                  </div>
                ))}
              </div>
            </Container>
          </Col>
        </Row>
      </Container>
      <ZonasForm
        show={mostrarZona}
        onHide={() => {
          setMostrarZona(false);
          setEditarZona(null);
        }}
        onGuardado={() => refresh("zonas")}
        componente={editarZona}
      />
      <TiposForm
        show={mostrarTipo}
        onHide={() => {
          setMostrarTipo(false);
          setEditarTipo(null);
        }}
        onGuardado={() => refresh("tipos-dispositivo")}
        componente={editarTipo}
      />
    </section>
  );
}

//TODO: Crear funciones de botonones

export default Configuracion;
