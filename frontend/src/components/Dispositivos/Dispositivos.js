import { useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";

import { API_URL } from "../../utils/api";

import DispositivosForm from "./DispositivoForm";

import { AiFillEdit, AiFillDelete } from "react-icons/ai";

import defaultImg from "../../Assets/dispositivo-default.png";

import { useAuth } from "../../context/AuthContext";
import { fetchAuth } from "../../utils/fetchAuth";

const estadoClases = {
  OPERATIVO: "estado-operativo",
  INACTIVO: "estado-inactivo",
  "EN MANTENIMIENTO": "estado-mantenimiento",
  FALLANDO: "estado-fallando",
};

const propositoClases = {
  General: "estado-operativo",
  Mantenimiento: "estado-mantenimiento",
  Otro: "estado-inactivo",
};

function Dispositivos() {
  const { isAuthenticated } = useAuth();

  const [display, setDisplay] = useState();
  const [dispositivos, setDispositivos] = useState([]);
  const [editarDispositivo, setEditarDispositivo] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function handleGuardado(idEditado = null) {
    fetch(`${API_URL}/api/dispositivos`)
      .then((res) => res.json())
      .then((datos) => {
        setDispositivos(datos);
        if (idEditado) {
          const editado = datos.find((d) => d.id === idEditado);
          setDisplay(editado || datos[0]);
        } else {
          setDisplay(datos[0]);
        }
      });
  }

  async function handleEliminar() {
    const confirmado = window.confirm(
      `¿Estás seguro de que deseas eliminar "${display.nombre}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmado) return;

    try {
      const res = await fetchAuth(`${API_URL}/api/dispositivos/${display.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const datos = await res.json();
        alert(datos.error);
        return;
      }

      handleGuardado(); // recarga la lista
    } catch (error) {
      alert("Error al eliminar el dispositivo");
    }
  }

  function handlerSpecs(dispositivo) {
    if (dispositivo.specs_id !== 1) {
      return (
        <div>
          <strong>Largo: </strong> {display?.largo}
          {"m "}
          <strong>Ancho: </strong> {display?.ancho}
          {"m "}
          <strong>Altura: </strong> {display?.altura}
          {"m"}
        </div>
      );
    }

    return <p>No se añadieron especifiaciones de ubicacion</p>;
  }

  useEffect(() => {
    fetch(`${API_URL}/api/dispositivos`)
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
            <Col xs="auto" className="text-end">
              {isAuthenticated && (
                <button
                  className="add-button"
                  onClick={() => setMostrarForm(true)}
                >
                  + Registrar dispositivo
                </button>
              )}
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
                  loading="lazy"
                />
              </Col>
              <Col>
                <div className="actual-display-info">
                  <span
                    className={`estado-badge ${estadoClases[display?.estado]}`}
                  >
                    {display?.estado}
                  </span>{" "}
                  <span
                    className={`estado-badge ${propositoClases[display?.proposito]}`}
                  >
                    {display?.proposito}
                  </span>
                  <div>
                    <h2>{display?.nombre}</h2>
                    <h6 className="mb-0">{display?.tipo_dispositivo}</h6>
                    <span className="actual-display-id">
                      <strong>Id: </strong>
                      {display?.id}
                    </span>
                  </div>
                  <p>{display?.descripcion}</p>
                  <p className="mb-0">
                    <strong>Ubicacion: </strong> {display?.zona}
                    {handlerSpecs(display)}
                  </p>
                </div>
              </Col>
              <Col md="auto" className="actual-display-config-buttons">
                {isAuthenticated && (
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
                )}
                {isAuthenticated && (
                  <button
                    className="dispositivo-button eliminar-button"
                    onClick={handleEliminar}
                  >
                    <AiFillDelete />
                    Eliminar
                  </button>
                )}
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
                    loading="lazy"
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
