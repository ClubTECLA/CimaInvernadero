import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
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
              <button>+ Registrar dispositivo</button>
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
                {" "}
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
                <button className="dispositivo-button editar-button">
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
      </Container>
    </section>
  );
}

export default Dispositivos;
