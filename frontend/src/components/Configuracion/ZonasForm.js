import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import { fetchAuth } from "../../utils/fetchAuth";
import { API_URL } from "../../utils/api";

function ZonasForm({ show, onHide, onGuardado, componente }) {
  const esEdicion = !!componente;
  const [zona, setZona] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    if (componente) {
      setZona(componente.zona || "");
    }
  }, [show, componente]);

  async function handleGuardar() {
    if (!zona) {
      setError("La zona es obligatoria");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await fetchAuth(
        esEdicion
          ? `${API_URL}/api/catalogos/zonas/${componente.id}`
          : `${API_URL}/api/catalogos/zonas`,
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zona,
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
      setError("Error al guardar la zona");
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setZona("");
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion ? "Editar zona" : "Registrar zona"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Nombre de zona*</label>
          <input
            type="text"
            className="form-control"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Ej: Norte"
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

export default ZonasForm;
