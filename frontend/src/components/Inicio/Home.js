import React, { useState, useEffect } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL } from "../../utils/api";

import invernadero from "../../Assets/invernadero.png";
import { WiHumidity, WiThermometer, WiSmog } from "react-icons/wi";

function Home() {
  const [lecturas, setLecturas] = useState(
    { temperatura: null, humedad: null, vpd: null },
    [],
  );

  const [propositos, setPropositos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [propositoPromedio, setPropositoPromedio] = useState(
    localStorage.getItem("proposito_promedio") || "",
  );

  useEffect(() => {
    fetch(`${API_URL}/api/catalogos/propositos`)
      .then((res) => res.json())
      .then((datos) => setPropositos(datos));
  }, []);

  useEffect(() => {
    function fetchPromedio() {
      const params = new URLSearchParams();
      if (propositoPromedio) params.append("proposito_id", propositoPromedio);

      fetch(`${API_URL}/api/lecturas/promedio?${params.toString()}`)
        .then((res) => res.json())
        .then((datos) => {
          const temperatura = datos.datos.find(
            (l) => l.tipo_dato === "Temperatura",
          );
          const humedad = datos.datos.find((l) => l.tipo_dato === "Humedad");
          const vpd = datos.datos.find((l) => l.tipo_dato === "VPD");
          setLecturas({ temperatura, humedad, vpd });
          setCargando(false);
        })
        .catch(() => {
          setError("Error al cargar las lecturas");
          setCargando(false);
        });
    }

    fetchPromedio();
    const intervalo = setInterval(fetchPromedio, 120000);
    return () => clearInterval(intervalo);
  }, [propositoPromedio]);

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
            <div className="home-data-title">
              <div>
                <h1>Datos actuales</h1>
                <p>Lecturas más recientes registradas</p>
              </div>
              <div>
                <select
                  value={propositoPromedio}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setPropositoPromedio(valor);
                    localStorage.setItem("proposito_promedio", valor);
                  }}
                  className="select-dispositivo"
                >
                  <option value="">Todos los propositos</option>
                  {propositos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
                      ? lecturas.temperatura.promedio >= 15 &&
                        lecturas.temperatura.promedio <= 40
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.temperatura
                    ? `${lecturas.temperatura.promedio} ${lecturas.temperatura.unidad}`
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
                      ? lecturas.humedad.promedio >= 50 &&
                        lecturas.humedad.promedio <= 85
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.humedad
                    ? `${lecturas.humedad.promedio} ${lecturas.humedad.unidad}`
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
                      ? lecturas.vpd.promedio >= 0.5 &&
                        lecturas.vpd.promedio <= 1.5
                        ? "#2ecc71"
                        : "#e74c3c"
                      : "inherit",
                  }}
                >
                  {lecturas.vpd
                    ? `${lecturas.vpd.promedio} ${lecturas.vpd.unidad}`
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
