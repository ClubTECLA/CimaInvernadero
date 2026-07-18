import { useState, useEffect } from "react";
import Modal from "react-bootstrap/Modal";
import CreatableSelect from "react-select/creatable";

const estadoOpciones = [
  { value: "OPERATIVO", label: "Operativo" },
  { value: "INACTIVO", label: "Inactivo" },
  { value: "EN MANTENIMIENTO", label: "En mantenimiento" },
  { value: "FALLANDO", label: "Fallando" },
];

function DispositivosForm({ show, onHide, onGuardado, dispositivo }) {
  const esEdicion = !!dispositivo;
  const [nombre, setNombre] = useState("");
  const [zona, setZona] = useState(null);
  const [tipo, setTipo] = useState(null);
  const [estado, setEstado] = useState(null);
  const [largo, setLargo] = useState("");
  const [ancho, setAncho] = useState("");
  const [altura, setAltura] = useState("");
  const [zonasOpciones, setZonasOpciones] = useState([]);
  const [tiposOpciones, setTiposOpciones] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;

    fetch(`/api/catalogos/zonas?t=${Date.now()}`)
      .then((res) => res.json())
      .then((datos) => {
        const opciones = datos.map((z) => ({ value: z.id, label: z.zona }));
        setZonasOpciones(opciones);
        if (dispositivo) {
          setZona(opciones.find((z) => z.label === dispositivo.zona) || null);
        }
      });

    fetch("/api/catalogos/tipos-dispositivo")
      .then((res) => res.json())
      .then((datos) => {
        const opciones = datos.map((t) => ({ value: t.id, label: t.nombre }));
        setTiposOpciones(opciones);
        if (dispositivo) {
          setTipo(
            opciones.find((t) => t.label === dispositivo.tipo_dispositivo) ||
              null,
          );
        }
      });

    if (dispositivo) {
      setNombre(dispositivo.nombre || "");
      setEstado(
        estadoOpciones.find((e) => e.value === dispositivo.estado) || null,
      );
      setLargo(dispositivo.largo || "");
      setAncho(dispositivo.ancho || "");
      setAltura(dispositivo.altura || "");
    }
  }, [show, dispositivo]);

  async function crearZona(nombreZona) {
    const res = await fetch("/api/catalogos/zonas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zona: nombreZona }),
    });
    const datos = await res.json();
    const nueva = { value: datos.id, label: nombreZona };
    setZonasOpciones((prev) => [...prev, nueva]);
    setZona(nueva);
  }

  async function crearTipo(nombreTipo) {
    const res = await fetch("/api/catalogos/tipos-dispositivo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreTipo }),
    });
    const datos = await res.json();
    const nueva = { value: datos.id, label: nombreTipo };
    setTiposOpciones((prev) => [...prev, nueva]);
    setTipo(nueva);
  }

  async function handleGuardar() {
    if (!nombre || !zona || !tipo || !estado) {
      setError("Nombre, zona, tipo y estado son obligatorios");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      let specs_id = null;
      if (largo || ancho || altura) {
        const resSpecs = await fetch("/api/catalogos/especificaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            largo: largo || null,
            ancho: ancho || null,
            altura: altura || null,
          }),
        });
        const datosSpecs = await resSpecs.json();
        specs_id = datosSpecs.id;
      }

      const res = await fetch(
        esEdicion ? `/api/dispositivos/${dispositivo.id}` : "/api/dispositivos",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre,
            zona_id: zona.value,
            tipo_id: tipo.value,
            estado: estado.value,
            specs_id,
          }),
        },
      );

      if (!res.ok) {
        const datos = await res.json();
        setError(datos.error);
        return;
      }

      limpiarForm();
      onGuardado(esEdicion ? dispositivo.id : null);
      onHide();
    } catch (error) {
      setError("Error al guardar el dispositivo");
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setNombre("");
    setZona(null);
    setTipo(null);
    setEstado(null);
    setLargo("");
    setAltura("");
    setAncho("");
    setError(null);
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion ? "Editar dispositivo" : "Registrar dispositivo"}
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
            placeholder="Ej: DHT22-01"
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Zona *</label>
          <CreatableSelect
            options={zonasOpciones}
            value={zona}
            onChange={setZona}
            onCreateOption={crearZona}
            placeholder="Selecciona o escribe una zona nueva"
            formatCreateLabel={(input) => `Crear zona "${input}"`}
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Tipo de dispositivo *</label>
          <CreatableSelect
            options={tiposOpciones}
            value={tipo}
            onChange={setTipo}
            onCreateOption={crearTipo}
            placeholder="Selecciona o escribe un tipo nuevo"
            formatCreateLabel={(input) => `Crear tipo "${input}"`}
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Estado *</label>
          <CreatableSelect
            options={estadoOpciones}
            value={estado}
            onChange={setEstado}
            placeholder="Selecciona un estado"
            isValidNewOption={() => false}
          />
        </div>

        <hr />
        <p className="text-muted">Especificaciones (opcional)</p>

        <div className="row mb-3">
          <div className="col">
            <label className="form-label">Largo (m)</label>
            <input
              type="number"
              className="form-control"
              value={largo}
              onChange={(e) => setLargo(e.target.value)}
              placeholder="0.0"
              min="0"
              step="0.1"
            />
          </div>
          <div className="col">
            <label className="form-label">Ancho (m)</label>
            <input
              type="number"
              className="form-control"
              value={ancho}
              onChange={(e) => setAncho(e.target.value)}
              placeholder="0.0"
              min="0"
              step="0.1"
            />
          </div>
          <div className="col">
            <label className="form-label">Altura (m)</label>
            <input
              type="number"
              className="form-control"
              value={altura}
              onChange={(e) => setAltura(e.target.value)}
              placeholder="0.0"
              min="0"
              step="0.1"
            />
          </div>
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

export default DispositivosForm;
