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
    <Modal show={show} onHide={onHide} size="lg" dialogClassName="tipo-dispositivo-modal">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion
            ? "Editar tipo de dispositivo"
            : "Registrar nuevo tipo de dispositivo"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="tipo-dispositivo-form">
        {error && <div className="alert alert-danger form-validation-alert" role="alert">{error}</div>}

        <div className="form-group mb-3">
          <label className="form-label fw-bold" htmlFor="device-type-category">Categoría *</label>
          <select
            id="device-type-category"
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
          <small className="form-text">Define el papel que tendrá este dispositivo dentro del sistema.</small>
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold" htmlFor="device-type-name">Nombre del tipo *</label>
          <input
            id="device-type-name"
            type="text"
            className="form-control"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={categoria === "SENSOR" ? "Ej: DHT11" : categoria === "ACTUADOR" ? "Ej: Bomba de riego" : "Ej: Nodo ESP32"}
          />
          <small className="form-text">Use un nombre breve para identificarlo al asignarlo a un nodo.</small>
        </div>

        {categoria === "SENSOR" && (
          <fieldset className="form-group mb-3 tipo-dato-selector">
            <legend className="tipo-dato-selector-heading"><span>Variables que mide *</span><strong>{tiposDatoSeleccionados.length} seleccionadas</strong></legend>
            <p className="tipo-dato-selector-hint">Marque una o varias variables que este sensor puede entregar.</p>
            <div className="tipo-dato-options">
            {tiposDato.length ? tiposDato.map((tipoDato) => (
              <label className="tipo-dato-option" key={tipoDato.id}>
                <input
                  type="checkbox"
                  aria-label={`${tipoDato.nombre}${tipoDato.unidad ? ` (${tipoDato.unidad})` : ""}`}
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
