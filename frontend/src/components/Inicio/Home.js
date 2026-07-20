import React, { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import invernadero from "../../Assets/invernadero.png";
import { WiHumidity, WiThermometer, WiSmog } from "react-icons/wi";

function Home() {
  const [lecturas, setLecturas] = useState(
    { temperatura: null, humedad: null, vpd: null },
    [],
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    function fetchLecturas() {
      fetch("/api/lecturas/ultimas?dispositivo_id=1")
        .then((res) => res.json())
        .then((respuesta) => {
          const datos = respuesta.datos;
          const temperatura = datos.find((l) => l.tipo_dato === "Temperatura");
          const humedad = datos.find((l) => l.tipo_dato === "Humedad");
          const vpd = datos.find((l) => l.tipo_dato === "VPD");
          setLecturas({ temperatura, humedad, vpd });
          setCargando(false);
        })
        .catch(() => {
          setError("Error al cargar las lecturas");
          setCargando(false);
        });
    }

    fetchLecturas();

    const intervalo = setInterval(fetchLecturas, 60000);

    return () => clearInterval(intervalo);
  }, []);

  return (
    <section>
      <Container className="home-section  card-component" id="home">
        <Container className="home-content">
          <Row>
            <Col md={7} className="home-header">
              <h1 className="heading">Monitoreo del invernadero</h1>
              <p>
                Consulta el estado ambiental actual del invernadero mediante las
                lecturas registradas por los dispositivos de monitoreo.
              </p>
            </Col>

            <Col md={5}>
              <img
                src={invernadero}
                alt="Foto del invernadero"
                className="img-fluid invernadero-img"
                loading="eager"
              />
            </Col>
          </Row>
        </Container>
      </Container>
      <Container className="home-section card-component">
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
      {cargando ? (
        <p>Cargando lecturas...</p>
      ) : error ? (
        <p>{error}</p>
      ) : (
        <Container className="home-section  card-component">
          <Container className="home-content data-section">
            <h1>Datos actuales</h1>
            <p>Lecturas más recientes registradas</p>
            <div className="lecturas-section">
              <div className="lectura-card temperatura">
                <span className="lectura-label">
                  <WiThermometer className="lectura-icon" />
                  <span className="d-none d-md-inline"> Temperatura </span>
                </span>
                <span
                  className="lectura-valor"
                  style={{
                    color: lecturas.temperatura
                      ? lecturas.temperatura.dato >= 15 &&
                        lecturas.temperatura.dato <= 30
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.temperatura
                    ? `${lecturas.temperatura.dato} ${lecturas.temperatura.unidad}`
                    : "Sin datos"}
                </span>
              </div>
              <div className="lectura-card humedad">
                <span className="lectura-label">
                  <WiHumidity className="lectura-icon" />
                  <span className="d-none d-md-inline"> Humedad </span>
                </span>
                <span
                  className="lectura-valor"
                  style={{
                    color: lecturas.humedad
                      ? lecturas.humedad.dato >= 50 &&
                        lecturas.humedad.dato <= 85
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.humedad
                    ? `${lecturas.humedad.dato} ${lecturas.humedad.unidad}`
                    : "Sin datos"}
                </span>
              </div>
              <div className="lectura-card vpd">
                <span className="lectura-label">
                  <WiSmog className="lectura-icon" />
                  <span className="d-none d-md-inline"> VPD </span>
                </span>
                <span
                  className="lectura-valor"
                  style={{
                    color: lecturas.vpd
                      ? lecturas.vpd.dato >= 0.5 && lecturas.vpd.dato <= 1.5
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.vpd
                    ? `${lecturas.vpd.dato} ${lecturas.vpd.unidad}`
                    : "Sin datos"}
                </span>
              </div>
            </div>
          </Container>
        </Container>
      )}
    </section>
  );
}

export default Home;
