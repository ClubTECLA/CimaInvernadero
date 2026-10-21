import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";

import { fetchAuth } from "../../utils/fetchAuth";
import { API_URL, fetchJson } from "../../utils/api";

function TiposForm({ show, onHide, onGuardado, componente }) {
  const esEdicion = !!componente;
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("SENSOR");
  const [tiposDato, setTiposDato] = useState([]);
  const [tiposDatoSeleccionados, setTiposDatoSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    fetchJson(`${API_URL}/api/catalogos/tipos-dato`)
      .then(setTiposDato)
      .catch((fetchError) => setError(fetchError.message || "No fue posible cargar los tipos de dato"));

    if (componente) {
      setNombre(componente.nombre || "");
      setCategoria(componente.categoria || "SENSOR");
      setTiposDatoSeleccionados((componente.tipo_dato_ids || []).map(Number));
    } else {
      limpiarForm();
    }
  }, [show, componente]);

  async function handleGuardar() {
    if (!nombre) {
      setError("El nombre es obligatorio");
      return;
    }
    if (categoria === "SENSOR" && tiposDatoSeleccionados.length === 0) {
      setError("Seleccione al menos un tipo de dato para este sensor");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const body = { nombre, categoria, tipo_dato_ids: categoria === "SENSOR" ? tiposDatoSeleccionados : [] };

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

      if (!res.ok) {
        const datos = await res.json();
        setError(datos.error);
        return;
      }

      limpiarForm();
      onGuardado(esEdicion ? componente.id : null);
      onHide();
    } catch (error) {
      setError(error.message || "Error al guardar el tipo de dispositivo");
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setNombre("");
    setCategoria("SENSOR");
    setTiposDatoSeleccionados([]);
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
          <label className="form-label fw-bold">Categoría *</label>
          <select
            className="form-select"
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              if (e.target.value !== "SENSOR") setTiposDatoSeleccionados([]);
            }}
          >
            <option value="NODO">Nodo de comunicación</option>
            <option value="SENSOR">Sensor</option>
            <option value="ACTUADOR">Actuador</option>
          </select>
          <small className="text-muted">
            Los sensores pueden generar uno o varios tipos de dato.
          </small>
        </div>

        {categoria === "SENSOR" && (
          <fieldset className="form-group mb-3 tipo-dato-selector">
            <legend className="form-label fw-bold">Datos que genera *</legend>
            <p className="tipo-dato-selector-hint">Seleccione las variables que mide este tipo de sensor.</p>
            <div className="tipo-dato-options">
            {tiposDato.length ? tiposDato.map((tipoDato) => (
              <label className="tipo-dato-option" key={tipoDato.id}>
                <input
                  type="checkbox"
                  checked={tiposDatoSeleccionados.includes(Number(tipoDato.id))}
                  onChange={(event) => setTiposDatoSeleccionados((actuales) => event.target.checked
                    ? [...new Set([...actuales, Number(tipoDato.id)])]
                    : actuales.filter((id) => id !== Number(tipoDato.id)))}
                />
                <span className="tipo-dato-option-copy">
                  <strong>{tipoDato.nombre}</strong>
                  <small>{tipoDato.unidad || "Sin unidad"}</small>
                </span>
              </label>
            )) : <small className="text-muted">No hay tipos de dato configurados.</small>}
            </div>
          </fieldset>
        )}

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Nombre del tipo *</label>
          <input
            type="text"
            className="form-control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: DHT22-01"
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

export default TiposForm;
