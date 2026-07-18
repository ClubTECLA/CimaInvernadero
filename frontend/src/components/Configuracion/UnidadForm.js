import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";

function UnidadForm({ show, onHide, onGuardado, componente }) {
  const esEdicion = !!componente;
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    if (componente) {
      setNombre(componente.nombre || "");
      setUnidad(componente.unidad || "");
    }
  }, [show, componente]);

  async function handleGuardar() {
    if (!nombre || !unidad) {
      setError("El nombre y unidad son obligatorios");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await fetch(
        esEdicion
          ? `/api/catalogos/tipos-dato/${componente.id}`
          : "/api/catalogos/tipos-dato",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre,
            unidad,
          }),
        },
      );

      if (!res.ok) {
        const datos = await res.json();
        setError(datos.error);
        return;
      }

      limpiarForm();
      onGuardado(esEdicion ? componente.id : null);
      onHide();
    } catch (error) {
      setError("Error al guardar el tipo de dato");
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setNombre("");
    setUnidad("");
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion ? "Editar tipo de dato" : "Registrar nuevo tipo de dato"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Nombre *</label>
          <input
            type="text"
            className="form-control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Temperatura"
          />
        </div>
        <div className="form-group mb-3">
          <label className="form-label fw-bold">Unidad *</label>
          <input
            type="text"
            className="form-control"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="Ej: Cº"
          />
        </div>
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

export default UnidadForm;
