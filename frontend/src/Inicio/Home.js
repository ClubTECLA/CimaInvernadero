import React from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import invernadero from "../Assets/invernadero.png";

function Home() {
  return (
    <section>
      <Container className="home-section" id="home">
        <Container className="home-content">
          <Row>
            <Col md={7} className="home-header">
              <h1 className="heading">Monitoreo del invernadero</h1>
              <p>
                Consulta el estado ambiental actual del invernadero mediante las
                lecturas registradas por los dispositivos de monitoreo.
              </p>
              <div className="general-state">
                <span className="point-state"></span>Estado general:
              </div>
            </Col>

            <Col md={5}>
              <img
                src={invernadero}
                alt="Foto del invernadero"
                className="img-fluid invernadero-img"
              />
            </Col>
          </Row>
        </Container>
      </Container>
      <Container className="home-section">
        <Container className="home-content home-secundary">
          <h1 className="heading">Descripción</h1>
          <p>
            Este sistema permite consultar el estado general del invernadero
            mediante el registro de lecturas tomadas por dispositivos de
            monitoreo.
          </p>
          <p>
            En esta página se muestran las lecturas actuales de temperatura,
            humedad y VPD, con el objetivo de facilitar la supervisión del
            ambiente.
          </p>
        </Container>
      </Container>
    </section>
  );
}

export default Home;
