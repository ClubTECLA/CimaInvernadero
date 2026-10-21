import { useState, useEffect, useRef } from "react";
import Modal from "react-bootstrap/Modal";
import { fetchAuth } from "../../utils/fetchAuth";
import { API_URL } from "../../utils/api";

const gruposLimites = [
  {
    titulo: "Largo desde la entrada",
    eje: "largo",
    inicio: { campo: "largo_inicio", etiqueta: "Comienza en" },
    fin: { campo: "largo_fin", etiqueta: "Termina en" },
  },
  {
    titulo: "Ancho desde el lado izquierdo",
    eje: "ancho",
    inicio: { campo: "ancho_inicio", etiqueta: "Comienza en" },
    fin: { campo: "ancho_fin", etiqueta: "Termina en" },
  },
];
const camposLimite = gruposLimites.flatMap(({ eje, inicio, fin }) => [
  { ...inicio, eje },
  { ...fin, eje },
]);

function ZonasForm({ show, onHide, onGuardado, componente, zonas = [], ubicacion }) {
  const dimensionesSitio = ubicacion && [ubicacion.largo, ubicacion.ancho, ubicacion.altura].every((valor) => Number.isFinite(Number(valor)))
    ? { largo: Number(ubicacion.largo), ancho: Number(ubicacion.ancho), altura: Number(ubicacion.altura) }
    : null;
  const esEdicion = !!componente;
  const [zona, setZona] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [dimensiones, setDimensiones] = useState({
    largo_inicio: "", largo_fin: "", ancho_inicio: "", ancho_fin: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [campoError, setCampoError] = useState("");
  const errorRef = useRef(null);

  const limitesCompletos = Object.values(dimensiones).every((valor) => valor !== "" && Number.isFinite(Number(valor)));
  const zonaTraslapada = limitesCompletos && zonas.find((zonaExistente) => {
    if (Number(zonaExistente.id) === Number(componente?.id)) return false;
    const limitesExistentes = [
      zonaExistente.largo_inicio, zonaExistente.largo_fin,
      zonaExistente.ancho_inicio, zonaExistente.ancho_fin,
    ];
    if (limitesExistentes.some((valor) => valor === null || valor === undefined || valor === "")) return false;

    return [
      ["largo_inicio", "largo_fin"],
      ["ancho_inicio", "ancho_fin"],
    ].every(([inicio, fin]) =>
      Number(dimensiones[inicio]) < Number(zonaExistente[fin]) &&
      Number(dimensiones[fin]) > Number(zonaExistente[inicio]),
    );
  });

  useEffect(() => {
    if (!error && !zonaTraslapada) return;
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }, [error, zonaTraslapada]);

  useEffect(() => {
    if (!show) return;

    if (componente) {
      setZona(componente.zona || "");
      setDescripcion(componente.descripcion || "");
      setDimensiones({
        largo_inicio: componente.largo_inicio == null ? "" : Number(componente.largo_inicio).toFixed(2),
        largo_fin: componente.largo_fin == null ? "" : Number(componente.largo_fin).toFixed(2),
        ancho_inicio: componente.ancho_inicio == null ? "" : Number(componente.ancho_inicio).toFixed(2),
        ancho_fin: componente.ancho_fin == null ? "" : Number(componente.ancho_fin).toFixed(2),
      });
    } else {
      limpiarForm();
    }
  }, [show, componente]);

  async function handleGuardar() {
    setCampoError("");
    if (!zona.trim()) {
      setCampoError("zona");
      setError("La zona es obligatoria");
      return;
    }
    if (zona.trim().toLocaleLowerCase("es-MX") === "sin zona") {
      setError("“Sin zona” es un estado automático para ubicaciones fuera de las zonas; no se registra desde este formulario.");
      return;
    }
    if (!dimensionesSitio) {
      setError("No se pudieron cargar las medidas de la ubicación seleccionada.");
      return;
    }

    const valoresLimite = Object.values(dimensiones);
    const valoresIngresados = valoresLimite.filter((valor) => valor !== "");
    if (valoresIngresados.length > 0 && valoresIngresados.length < valoresLimite.length) {
      setCampoError("dimensiones");
      setError("Complete los cuatro límites de largo y ancho para registrar la zona.");
      return;
    }
    if (valoresIngresados.length === valoresLimite.length) {
      const fueraDelSitio = camposLimite.find(({ campo, eje }) => Number(dimensiones[campo]) > dimensionesSitio[eje]);
      if (fueraDelSitio) {
        setCampoError(fueraDelSitio.campo);
        setError(`El límite “${fueraDelSitio.etiqueta}” no puede superar ${dimensionesSitio[fueraDelSitio.eje].toFixed(2)} m, que es la medida de referencia del sitio.`);
        return;
      }
      const ejes = [["largo_inicio", "largo_fin"], ["ancho_inicio", "ancho_fin"]];
      if (ejes.some(([inicio, fin]) => Number(dimensiones[inicio]) >= Number(dimensiones[fin]))) {
        setCampoError("dimensiones");
        setError("En cada dimensión, el límite “desde” debe ser menor que el límite “hasta”.");
        return;
      }
    }

    setGuardando(true);
    setError(null);
    setCampoError("");

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
            ubicacion_id: ubicacion?.id,
            descripcion: descripcion.trim() || null,
            ...Object.fromEntries(
              Object.entries(dimensiones).map(([campo, valor]) => [
                campo,
                valor === "" ? null : Number(valor),
              ]),
            ),
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
    setDescripcion("");
    setDimensiones({ largo_inicio: "", largo_fin: "", ancho_inicio: "", ancho_fin: "" });
  }

  function cambiarDimension(campo, valor) {
    setDimensiones((actuales) => ({ ...actuales, [campo]: valor }));
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion ? "Editar zona" : "Registrar zona"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {(zonaTraslapada || error) && (
          <div ref={errorRef} className="alert alert-danger form-validation-alert" role="alert" tabIndex={-1}>
            {zonaTraslapada
              ? `Estos límites se traslapan con "${zonaTraslapada.zona}". Ajuste las medidas para que las zonas no ocupen el mismo espacio.`
              : error}
          </div>
        )}

        <div className="form-group mb-3">
          <label className="form-label fw-bold" htmlFor="zone-name">Nombre de zona *</label>
          <input
            id="zone-name"
            type="text"
            className={`form-control${campoError === "zona" ? " is-invalid" : ""}`}
            aria-invalid={campoError === "zona"}
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Ej: Norte"
            required
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label" htmlFor="zone-description">Descripción (opcional)</label>
          <textarea id="zone-description" className="form-control" rows="2" maxLength="500" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción breve de la zona" />
        </div>

        <div className="zone-form-dimensions-heading">
          <h3>Ubicación de la zona</h3>
          <span className="zone-form-dimensions-size">
            {dimensionesSitio
              ? `${dimensionesSitio.largo.toFixed(2)} × ${dimensionesSitio.ancho.toFixed(2)} m`
              : "Medidas no disponibles"}
          </span>
        </div>
        <div className="zone-form-axis-grid mb-3">
          {gruposLimites.map(({ titulo, eje, inicio, fin }) => (
            <fieldset className="zone-form-axis" key={eje}>
              <legend>{titulo}</legend>
              {[inicio, fin].map(({ campo, etiqueta }) => (
                <div key={campo}>
                  <label className="form-label" htmlFor={`zone-${campo}`}>{etiqueta} (m) *</label>
                  <input
                    id={`zone-${campo}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max={dimensionesSitio?.[eje]}
                    placeholder={dimensionesSitio ? `0.00–${dimensionesSitio[eje].toFixed(2)}` : ""}
              className={`form-control${campoError === campo ? " is-invalid" : ""}`}
              aria-invalid={campoError === campo}
                    value={dimensiones[campo]}
                    onChange={(e) => cambiarDimension(campo, e.target.value)}
                    required
                    disabled={!dimensionesSitio}
                  />
                </div>
              ))}
            </fieldset>
          ))}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <button
          className="btn btn-secondary"
          onClick={() => {
            limpiarForm();
            onHide();
          }}
          disabled={guardando || !!zonaTraslapada}
        >
          Cancelar
        </button>
        <button
          className="btn btn-success"
          onClick={handleGuardar}
          disabled={guardando || !dimensionesSitio}
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export default ZonasForm;
