import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import DispositivosForm from "./DispositivoForm";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import defaultImg from "../../Assets/dispositivo-default.png";

const estadoClases = {
  OPERATIVO: "estado-operativo",
  INACTIVO: "estado-inactivo",
  "EN MANTENIMIENTO": "estado-mantenimiento",
  FALLANDO: "estado-fallando",
};

function Dispositivos() {
  const [display, setDisplay] = useState();
  const [dispositivos, setDispositivos] = useState([]);
  const [editarDispositivo, setEditarDispositivo] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function handleGuardado() {
    fetch("/api/dispositivos")
      .then((res) => res.json())
      .then((datos) => {
        setDispositivos(datos);
        setDisplay(datos[0]);
      });
  }

  useEffect(() => {
    fetch("/api/dispositivos")
      .then((res) => res.json())
      .then((datos) => {
        setDispositivos(datos);
        setDisplay(datos[0]);
      });
  }, []);

  return (
    <section>
      <Container className="dispositivos-page">
        <Container className="dispositivos-title dispositivos-section">
          <Row className="align-items-center">
            <Col>
              <h1>Dispositivos del invernadero</h1>
              <p>
                En esta sección se muestran los dispositivos registrados para el
                monitoreo y control del invernadero
              </p>
            </Col>
            {/* TODO: Agregar funcionalidad de boton */}
            <Col xs="auto" className="text-end">
              <button onClick={() => setMostrarForm(true)}>
                + Registrar dispositivo
              </button>
            </Col>
          </Row>
        </Container>
        <Container className="actual-display dispositivos-section card-component">
          {display ? (
            <Row>
              <Col md={2}>
                <img
                  src={display?.image_path || defaultImg}
                  alt={display?.nombre}
                  className="dispositivo-img"
                />
              </Col>
              <Col>
                <div className="actual-display-info">
                  <span
                    className={`estado-badge ${estadoClases[display?.estado]}`}
                  >
                    {display?.estado}
                  </span>
                  <h2>{display?.nombre}</h2>
                  <p>{display?.descripcion}</p>
                  <p>
                    <strong>Ubicacion: </strong> {display?.zona}
                  </p>
                </div>
              </Col>
              <Col md="auto">
                {/* TODO: Agregar funcionalidad de boton */}
                <button
                  className="dispositivo-button editar-button"
                  onClick={() => {
                    setEditarDispositivo(display);
                    setMostrarForm(true);
                  }}
                >
                  <AiFillEdit />
                  Editar
                </button>
                {/* TODO: Agregar funcionalidad de boton */}
                <button className="dispositivo-button eliminar-button">
                  <AiFillDelete />
                  Eliminar
                </button>
              </Col>
            </Row>
          ) : (
            <p>Cargando dispositivo...</p>
          )}
        </Container>
        <Container className="dispositivos-list-section">
          <Row>
            <h2>Lista de dispositivos</h2>
          </Row>
          <Row xs={1} md={2} lg={5} className="g-3">
            {dispositivos.map((d) => (
              <Col key={d.id}>
                <div
                  className="dispositivo-card card-component"
                  onClick={() => setDisplay(d)}
                >
                  <img
                    src={d?.image_path || defaultImg}
                    alt={d?.nombre}
                    className="dispositivo-img-list"
                  />
                  <span style={{ fontWeight: "bold" }}>{d.nombre}</span>
                  <span className={`estado-badge ${estadoClases[d?.estado]}`}>
                    {d.estado}
                  </span>
                </div>
              </Col>
            ))}
          </Row>
        </Container>
      </Container>
      <DispositivosForm
        show={mostrarForm}
        onHide={() => {
          setMostrarForm(false);
          setEditarDispositivo(null);
        }}
        onGuardado={handleGuardado}
        dispositivo={editarDispositivo}
      />
    </section>
  );
}

export default Dispositivos;
