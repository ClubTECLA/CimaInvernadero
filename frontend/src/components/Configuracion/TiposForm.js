import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";

import { fetchAuth } from "../../utils/fetchAuth";
import { API_URL } from "../../utils/api";

function TiposForm({ show, onHide, onGuardado, componente }) {
  const esEdicion = !!componente;
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagen, setImagen] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    if (componente) {
      setNombre(componente.nombre || "");
      setDescripcion(componente.descripcion || "");
    }
  }, [show, componente]);

  async function handleGuardar() {
    if (!nombre) {
      setError("El nombre es obligatorio");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      let image_path = componente?.image_path ?? null; // mantiene la imagen actual por default
      if (imagen) {
        const formData = new FormData();
        formData.append("imagen", imagen);
        const resImg = await fetchAuth(`${API_URL}/api/uploads/dispositivos`, {
          method: "POST",
          body: formData,
        });
        console.log("Status upload:", resImg.status);
        const datosImg = await resImg.json();
        console.log("Respuesta upload:", datosImg);
        image_path = datosImg.image_path;
      }

      console.log("image_path a enviar:", image_path);
      const body = { nombre, descripcion, image_path };
      if (imagen) body.image_path = image_path;

      const res = await fetchAuth(
        esEdicion
          ? `${API_URL}/api/catalogos/tipos-dispositivo/${componente.id}`
          : `${API_URL}/api/catalogos/tipos-dispositivo`,
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      console.log("Status guardar:", res.status);
      if (!res.ok) {
        const datos = await res.json();
        console.log("Error del backend:", datos);
        setError(datos.error);
        return;
      }

      limpiarForm();
      onGuardado(esEdicion ? componente.id : null);
      onHide();
    } catch (error) {
      console.error("Error completo:", error);
      setError("Error al guardar el tipo de dispositivo");
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setNombre("");
    setDescripcion("");
    setImagen(null);
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion
            ? "Editar tipo de dispositivo"
            : "Registrar nuevo tipo de dispositivo"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Nombre de tipo*</label>
          <input
            type="text"
            className="form-control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: DHT22-01"
          />
        </div>
        <div className="form-group mb-3">
          <label className="form-label fw-bold">Descripcion </label>
          <input
            type="text"
            className="form-control"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Sensor de temperatura..."
          />
        </div>
        {esEdicion && componente?.image_path && (
          <div className="mb-2">
            <p className="text-muted mb-1">Imagen actual:</p>
            <img
              src={componente.image_path}
              alt="imagen actual"
              style={{
                height: "80px",
                borderRadius: "0.5rem",
                objectFit: "cover",
              }}
            />
          </div>
        )}
        <input
          type="file"
          className="form-control"
          accept="image/*"
          onChange={(e) => setImagen(e.target.files[0])}
        />
      </Modal.Body>

      <Modal.Footer>
        <button
          className="btn btn-secondary"
          onClick={() => {
            limpiarForm();
            onHide();
          }}
          disabled={guardando}
        >
          Cancelar
        </button>
        <button
          className="btn btn-success"
          onClick={handleGuardar}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export default TiposForm;
