import { useEffect, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";

import { API_URL, getAssetUrl } from "../../utils/api";
import { fetchAuth } from "../../utils/fetchAuth";

async function leerRespuesta(respuesta, mensaje) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || mensaje);
  return datos;
}

function medidaVisual(valor) {
  if (valor === "" || valor === null || valor === undefined) return "";
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : String(valor);
}

function medidaNormalizada(valor) {
  if (valor === "") return "";
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : valor;
}

function UbicacionesForm({ show, onHide, onGuardado, componente }) {
  const [formulario, setFormulario] = useState({ nombre: "", largo: "", ancho: "", altura: "", descripcion: "", image_path: "", map_image_path: "" });
  const [imagen, setImagen] = useState(null);
  const [imagenPlano, setImagenPlano] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [campoError, setCampoError] = useState("");
  const errorRef = useRef(null);

  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }, [error]);

  useEffect(() => {
    if (!show) return;
    setFormulario({
      nombre: componente?.nombre || "",
      largo: medidaVisual(componente?.largo),
      ancho: medidaVisual(componente?.ancho),
      altura: medidaVisual(componente?.altura),
      descripcion: componente?.descripcion || "",
      image_path: componente?.image_path || "",
      map_image_path: componente?.map_image_path || "",
    });
    setImagen(null);
    setImagenPlano(null);
    setError("");
    setCampoError("");
  }, [show, componente]);

  function cambiar(campo, valor) { setFormulario((actual) => ({ ...actual, [campo]: valor })); setError(""); setCampoError(""); }

  async function guardar() {
    setCampoError("");
    if (!formulario.nombre.trim()) { setCampoError("nombre"); return setError("El nombre es obligatorio"); }
    const medidaInvalida = ["largo", "ancho", "altura"].find((campo) => !formulario[campo] || Number(formulario[campo]) <= 0);
    if (medidaInvalida) { setCampoError(medidaInvalida); return setError("Indique largo, ancho y altura con valores mayores que cero"); }
    setGuardando(true);
    setError("");
    try {
      async function subirImagen(archivo) {
        const datosImagen = new FormData();
        datosImagen.append("imagen", archivo);
        const subida = await fetchAuth(`${API_URL}/api/uploads/catalogos`, { method: "POST", body: datosImagen });
        return (await leerRespuesta(subida, "No fue posible cargar la imagen")).image_path;
      }
      const imagePath = imagen ? await subirImagen(imagen) : formulario.image_path || null;
      const mapImagePath = imagenPlano ? await subirImagen(imagenPlano) : formulario.map_image_path || null;
      const respuesta = await fetchAuth(componente ? `${API_URL}/api/catalogos/ubicaciones/${componente.id}` : `${API_URL}/api/catalogos/ubicaciones`, {
        method: componente ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formulario, largo: Number(medidaNormalizada(formulario.largo)), ancho: Number(medidaNormalizada(formulario.ancho)), altura: Number(medidaNormalizada(formulario.altura)), image_path: imagePath, map_image_path: mapImagePath }),
      });
      await leerRespuesta(respuesta, "No fue posible guardar la ubicación");
      onGuardado();
      onHide();
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }

  return <Modal show={show} onHide={onHide} size="lg">
    <Modal.Header closeButton><Modal.Title>{componente ? "Editar ubicación" : "Registrar ubicación"}</Modal.Title></Modal.Header>
    <Modal.Body>
      {error && <div ref={errorRef} className="alert alert-danger form-validation-alert" role="alert" tabIndex={-1}>{error}</div>}
      <label className="form-label fw-bold">Nombre *</label>
      <input className={`form-control mb-3${campoError === "nombre" ? " is-invalid" : ""}`} aria-invalid={campoError === "nombre"} value={formulario.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Ej: Invernadero" />
      <div className="row g-3 mb-3">
        {[['largo', 'Largo (m)'], ['ancho', 'Ancho (m)'], ['altura', 'Altura (m)']].map(([campo, etiqueta]) => <div className="col-md-4" key={campo}>
          <label className="form-label">{etiqueta} *</label><input type="number" min="0.01" step="0.01" inputMode="decimal" className={`form-control${campoError === campo ? " is-invalid" : ""}`} aria-invalid={campoError === campo} value={formulario[campo]} onChange={(e) => cambiar(campo, e.target.value)} onBlur={(e) => cambiar(campo, medidaNormalizada(e.target.value))} />
        </div>)}
      </div>
      <label className="form-label">Descripción</label>
      <textarea className="form-control mb-3" rows="3" maxLength="500" value={formulario.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} />
      <label className="form-label">Imagen general de la ubicación (opcional)</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="form-control" onChange={(e) => setImagen(e.target.files?.[0] || null)} />
      <small className="text-muted d-block mt-1">Formatos permitidos: JPG, PNG o WebP. Tamaño máximo: 8 MB.</small>
      {componente?.image_path && !imagen ? <div className="mt-2"><small className="text-muted d-block">Imagen guardada: {componente.image_path.split("/").pop()}</small><img src={getAssetUrl(componente.image_path)} alt={`Imagen actual de ${componente.nombre}`} style={{ maxWidth: "180px", maxHeight: "100px", objectFit: "cover" }} /></div> : !imagen && <small className="text-muted d-block mt-2">No hay una imagen guardada para esta ubicación.</small>}
      <label className="form-label mt-3">Imagen del plano de distribución de zonas (opcional)</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="form-control" onChange={(e) => setImagenPlano(e.target.files?.[0] || null)} />
      <small className="text-muted d-block mt-1">Esta imagen se utiliza como fondo del mapa donde se muestran todas las zonas. Formatos permitidos: JPG, PNG o WebP. Tamaño máximo: 8 MB.</small>
      {componente?.map_image_path && !imagenPlano ? <div className="mt-2"><small className="text-muted d-block">Plano guardado: {componente.map_image_path.split("/").pop()}</small><img src={getAssetUrl(componente.map_image_path)} alt={`Plano de zonas de ${componente.nombre}`} style={{ maxWidth: "240px", maxHeight: "130px", objectFit: "cover" }} /></div> : !imagenPlano && <small className="text-muted d-block mt-2">Se utiliza el plano predeterminado si no se carga uno personalizado.</small>}
    </Modal.Body>
    <Modal.Footer><button className="btn btn-secondary" onClick={onHide} disabled={guardando}>Cancelar</button><button className="btn btn-success" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button></Modal.Footer>
  </Modal>;
}

export default UbicacionesForm;
