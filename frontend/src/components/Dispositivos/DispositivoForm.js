import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "react-bootstrap/Modal";
import CreatableSelect from "react-select/creatable";

import { fetchAuth } from "../../utils/fetchAuth";
import { API_URL, getAssetUrl } from "../../utils/api";
import { mostrarPorcentajeBateria } from "../../utils/dispositivoFormatters";
import { useSiteDimensions } from "../../context/SiteDimensionsContext";

const estadoOpciones = [
  { value: "OPERATIVO", label: "Operativo" },
  { value: "INACTIVO", label: "Inactivo" },
  { value: "EN MANTENIMIENTO", label: "En mantenimiento" },
];

async function leerRespuesta(respuesta, mensajePredeterminado) {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error || mensajePredeterminado);
  return datos;
}

function DispositivosForm({ show, onHide, onGuardado, dispositivo }) {
  const { dimensions: dimensionesSitio, loading: cargandoDimensiones } = useSiteDimensions();
  const [nodoPersistidoId, setNodoPersistidoId] = useState(dispositivo?.id || null);
  const nodoActivoId = dispositivo?.id || nodoPersistidoId;
  const esEdicion = Boolean(nodoActivoId);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState(null);
  const [tipoAlimentacion, setTipoAlimentacion] = useState("BATERIA");
  const [largo, setLargo] = useState("0");
  const [ancho, setAncho] = useState("0");
  const [altura, setAltura] = useState("0");
  const [zonas, setZonas] = useState([]);
  const [tiposComponente, setTiposComponente] = useState([]);
  const [componentes, setComponentes] = useState([]);
  const [nuevoTipoComponente, setNuevoTipoComponente] = useState("");
  const [nuevoEstadoComponente, setNuevoEstadoComponente] = useState("OPERATIVO");
  const [guardandoComponente, setGuardandoComponente] = useState(false);
  const [imagenSeleccionada, setImagenSeleccionada] = useState(null);
  const imagenInputRef = useRef(null);
  const [imagePathNodo, setImagePathNodo] = useState(dispositivo?.image_path_nodo || null);
  const [imagenPrevia, setImagenPrevia] = useState(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [campoError, setCampoError] = useState(null);
  const nombreRef = useRef(null);
  const estadoRef = useRef(null);
  const largoRef = useRef(null);
  const anchoRef = useRef(null);
  const alturaRef = useRef(null);
  const errorRef = useRef(null);
  const opcionesEstadoNodo = estado?.value === "FALLANDO"
    ? [...estadoOpciones, { value: "FALLANDO", label: "Problemas o fallas (automático)", isDisabled: true }]
    : estadoOpciones;

  useEffect(() => {
    if (!imagenSeleccionada) {
      setImagenPrevia(null);
      return undefined;
    }
    const url = URL.createObjectURL(imagenSeleccionada);
    setImagenPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [imagenSeleccionada]);

  const zonaCalculada = (() => {
    const coordenadas = [largo, ancho, altura].map(Number);
    if ([largo, ancho, altura].some((valor) => valor === "") || coordenadas.some((valor) => !Number.isFinite(valor) || valor < 0)) {
      return null;
    }
    const [x, y] = coordenadas;
    return zonas
      .filter((zona) =>
        zona.largo_inicio !== null && zona.largo_inicio !== undefined &&
        zona.ancho_inicio !== null && zona.ancho_inicio !== undefined &&
        x >= Number(zona.largo_inicio) && x <= Number(zona.largo_fin) &&
        y >= Number(zona.ancho_inicio) && y <= Number(zona.ancho_fin),
      )
      .sort((a, b) => Number(b.largo_inicio) - Number(a.largo_inicio))[0] || null;
  })();
  const ubicacionValida = [largo, ancho, altura].every((valor) =>
    valor !== "" && Number.isFinite(Number(valor)) && Number(valor) >= 0,
  ) && dimensionesSitio && Number(largo) <= dimensionesSitio.largo && Number(ancho) <= dimensionesSitio.ancho && Number(altura) <= dimensionesSitio.altura;
  const tiposDisponibles = tiposComponente.filter((tipo) =>
    !componentes.some((componente) => Number(componente.tipo_id) === Number(tipo.id)),
  );

  const cargarComponentes = useCallback(async (id) => {
    if (!id) return;
    try {
      const respuesta = await fetch(`${API_URL}/api/dispositivos/nodos/${id}/componentes`);
      const datos = await leerRespuesta(respuesta, "No fue posible cargar los dispositivos del nodo");
      setComponentes(datos);
    } catch (errorCarga) {
      setError(errorCarga.message);
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    setNodoPersistidoId(dispositivo?.id || null);
    setImagenSeleccionada(null);
    setImagePathNodo(dispositivo?.image_path_nodo || null);
    setQuitarImagen(false);
    setError(null);
    setComponentes([]);
    setNuevoTipoComponente("");
    setNuevoEstadoComponente("OPERATIVO");
    if (!dispositivo) limpiarForm();

    fetch(`${API_URL}/api/catalogos/zonas?t=${Date.now()}`)
      .then((res) => res.json())
      .then(setZonas);

    fetch(`${API_URL}/api/catalogos/tipos-dispositivo`)
      .then((res) => res.json())
      .then((datos) => setTiposComponente(datos));

    if (dispositivo) {
      setNombre(dispositivo.nombre || "");
      setDescripcion(dispositivo.descripcion_nodo || "");
      setTipoAlimentacion(dispositivo.tipo_alimentacion || "BATERIA");
      setEstado(
        estadoOpciones.find((e) => e.value === dispositivo.estado) || null,
      );
      setLargo(String(dispositivo.largo ?? 0));
      setAncho(String(dispositivo.ancho ?? 0));
      setAltura(String(dispositivo.altura ?? 0));
      cargarComponentes(dispositivo.id);
    }
  }, [show, dispositivo, cargarComponentes]);

  async function agregarComponente() {
    if (!nuevoTipoComponente || !nodoActivoId) return;
    setGuardandoComponente(true);
    setError(null);
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodoActivoId}/componentes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_id: Number(nuevoTipoComponente), estado: nuevoEstadoComponente }),
      });
      await leerRespuesta(respuesta, "No fue posible agregar el componente");
      setNuevoTipoComponente("");
      setNuevoEstadoComponente("OPERATIVO");
      await cargarComponentes(nodoActivoId);
    } catch (errorComponente) {
      setError(errorComponente.message);
    } finally {
      setGuardandoComponente(false);
    }
  }

  async function actualizarComponente(componente, cambios) {
    const categoria = componente.categoria === "ACTUADOR" ? "actuador" : "sensor";
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodoActivoId}/componentes/${categoria}/${componente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      await leerRespuesta(respuesta, "No fue posible actualizar el componente");
      await cargarComponentes(nodoActivoId);
    } catch (errorComponente) {
      setError(errorComponente.message);
    }
  }

  async function eliminarComponente(componente) {
    if (!window.confirm(`¿Eliminar ${componente.tipo || "este componente"} del nodo?`)) return;
    const categoria = componente.categoria === "ACTUADOR" ? "actuador" : "sensor";
    try {
      const respuesta = await fetchAuth(`${API_URL}/api/dispositivos/nodos/${nodoActivoId}/componentes/${categoria}/${componente.id}`, { method: "DELETE" });
      await leerRespuesta(respuesta, "No fue posible eliminar el componente");
      await cargarComponentes(nodoActivoId);
    } catch (errorComponente) {
      setError(errorComponente.message);
    }
  }


  async function handleGuardar() {
    setCampoError(null);
    const enfocarCampo = (campo, ref) => {
      setCampoError(campo);
      requestAnimationFrame(() => {
        const elemento = ref.current;
        elemento?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        if (typeof elemento?.focus === "function") elemento.focus();
        else elemento?.querySelector?.("input")?.focus();
      });
    };

    if (!nombre.trim()) {
      setError("Escriba el nombre del nodo.");
      enfocarCampo("nombre", nombreRef);
      return;
    }
    if (!estado) {
      setError("Seleccione el estado del nodo.");
      enfocarCampo("estado", estadoRef);
      return;
    }

    if (!dimensionesSitio) {
      setError("No se pudieron cargar las medidas del sitio. Inténtalo de nuevo.");
      return;
    }

    const coordenadas = [largo, ancho, altura].map(Number);
    const campoUbicacionInvalido = [largo, ancho, altura].findIndex((valor, indice) =>
      valor === "" || !Number.isFinite(coordenadas[indice]) || coordenadas[indice] < 0 ||
      coordenadas[indice] > [dimensionesSitio.largo, dimensionesSitio.ancho, dimensionesSitio.altura][indice],
    );
    if (campoUbicacionInvalido !== -1) {
      setError("Revise la ubicación marcada. Ingrese un valor válido dentro de las medidas del sitio.");
      enfocarCampo(["largo", "ancho", "altura"][campoUbicacionInvalido], [largoRef, anchoRef, alturaRef][campoUbicacionInvalido]);
      return;
    }
    setGuardando(true);
    setError(null);
    let nuevaImagenSubida = null;

    try {
      let imagePath = imagePathNodo;
      if (imagenSeleccionada) {
        const formularioImagen = new FormData();
        formularioImagen.append("imagen", imagenSeleccionada);
        const respuestaImagen = await fetchAuth(`${API_URL}/api/uploads/dispositivos`, {
          method: "POST",
          body: formularioImagen,
        });
        const datosImagen = await leerRespuesta(respuestaImagen, "No fue posible cargar la imagen del nodo");
        imagePath = datosImagen.image_path;
        nuevaImagenSubida = imagePath;
      } else if (quitarImagen) {
        imagePath = null;
      }

      const res = await fetchAuth(
        esEdicion
          ? `${API_URL}/api/dispositivos/nodos/${nodoActivoId}`
          : `${API_URL}/api/dispositivos/nodos`,
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre,
            descripcion: descripcion.trim() || null,
            tipo_alimentacion: tipoAlimentacion,
            bateria_quimica: null,
            bateria_capacidad_mah: null,
            estado: estado.value === "FALLANDO" ? undefined : estado.value,
            ubicacion: {
              largo: coordenadas[0],
              ancho: coordenadas[1],
              altura: coordenadas[2],
            },
            image_path: imagePath,
          }),
        },
      );

      const guardado = await leerRespuesta(res, "No fue posible guardar el nodo");

      const imagenAnterior = imagePathNodo;
      setImagePathNodo(imagePath);
      if (imagenAnterior && imagenAnterior !== imagePath) {
        fetchAuth(`${API_URL}/api/uploads/dispositivos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_path: imagenAnterior }),
        }).catch(() => {});
      }

      const idNodoGuardado = nodoActivoId || guardado.id;
      setNodoPersistidoId(idNodoGuardado);
      onGuardado(idNodoGuardado);
      if (!esEdicion) {
        setError(null);
        setComponentes([]);
      } else {
        onHide();
      }
    } catch (error) {
      if (nuevaImagenSubida) {
        fetchAuth(`${API_URL}/api/uploads/dispositivos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_path: nuevaImagenSubida }),
        }).catch(() => {});
      }
      setError(error.message || "Error al guardar el dispositivo");
      requestAnimationFrame(() => {
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        errorRef.current?.focus();
      });
    } finally {
      setGuardando(false);
    }
  }

  function limpiarForm() {
    setNombre("");
    setDescripcion("");
    setTipoAlimentacion("BATERIA");
    setEstado(null);
    setLargo("0");
    setAltura("0");
    setAncho("0");
    setImagenSeleccionada(null);
    if (imagenInputRef.current) imagenInputRef.current.value = "";
    setQuitarImagen(false);
    setError(null);
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {esEdicion ? "Editar nodo" : "Registrar nodo"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div ref={errorRef} className="alert alert-danger" role="alert" tabIndex={-1}>{error}</div>}
        {nodoPersistidoId && !dispositivo && <div className="alert alert-success py-2">Nodo guardado. Ya puede agregar sus sensores y actuadores.</div>}
        <div className="form-group mb-3">
          <label className="form-label fw-bold">Nombre del nodo *</label>
          <input
            ref={nombreRef}
            type="text"
            className={`form-control${campoError === "nombre" ? " is-invalid" : ""}`}
            value={nombre}
            aria-invalid={campoError === "nombre"}
            onChange={(e) => { setNombre(e.target.value); if (campoError === "nombre") setCampoError(null); }}
            placeholder="Ej: Nodo 1"
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label" htmlFor="node-description">Descripción (opcional)</label>
          <textarea
            id="node-description"
            className="form-control"
            rows="2"
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Nota breve sobre el nodo o algún detalle importante"
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Estado *</label>
          <CreatableSelect
            ref={estadoRef}
            classNamePrefix="node-state"
            className={campoError === "estado" ? "is-invalid" : ""}
            options={opcionesEstadoNodo}
            value={estado}
            onChange={(value) => { setEstado(value); if (campoError === "estado") setCampoError(null); }}
            placeholder="Seleccione un estado"
            isValidNewOption={() => false}
          />
        </div>

        <div className="node-location-card">
          <div className="node-location-heading">
            <p className="text-muted fw-bold mb-0">Ubicación del nodo *</p>
            <span className="node-location-size" title="Largo × ancho × altura">
              {dimensionesSitio
                ? `${dimensionesSitio.largo.toFixed(2)} × ${dimensionesSitio.ancho.toFixed(2)} × ${dimensionesSitio.altura.toFixed(2)} m`
                : cargandoDimensiones ? "Cargando medidas…" : "Medidas no disponibles"}
            </span>
          </div>
          <div className="node-coordinate-grid">
            <div>
              <label className="form-label">Desde la entrada (m)</label>
              <input ref={largoRef} type="number" className={`form-control${campoError === "largo" ? " is-invalid" : ""}`} aria-invalid={campoError === "largo"} value={largo} onChange={(e) => { setLargo(e.target.value); setError(null); if (campoError === "largo") setCampoError(null); }} onWheel={(e) => e.target.blur()} placeholder={dimensionesSitio ? `0 a ${dimensionesSitio.largo}` : "Cargando…"} min="0" max={dimensionesSitio?.largo} step="0.1" disabled={!dimensionesSitio} />
            </div>
            <div>
              <label className="form-label">Desde el lado izquierdo (m)</label>
              <input ref={anchoRef} type="number" className={`form-control${campoError === "ancho" ? " is-invalid" : ""}`} aria-invalid={campoError === "ancho"} value={ancho} onChange={(e) => { setAncho(e.target.value); setError(null); if (campoError === "ancho") setCampoError(null); }} onWheel={(e) => e.target.blur()} placeholder={dimensionesSitio ? `0 a ${dimensionesSitio.ancho}` : "Cargando…"} min="0" max={dimensionesSitio?.ancho} step="0.1" disabled={!dimensionesSitio} />
            </div>
            <div>
              <label className="form-label">Desde el suelo (m)</label>
              <input ref={alturaRef} type="number" className={`form-control${campoError === "altura" ? " is-invalid" : ""}`} aria-invalid={campoError === "altura"} value={altura} onChange={(e) => { setAltura(e.target.value); setError(null); if (campoError === "altura") setCampoError(null); }} onWheel={(e) => e.target.blur()} placeholder={dimensionesSitio ? `0 a ${dimensionesSitio.altura}` : "Cargando…"} min="0" max={dimensionesSitio?.altura} step="0.1" disabled={!dimensionesSitio} />
            </div>
          </div>
          <div className="node-location-zone"><strong>Zona automática:</strong> {zonaCalculada?.zona || (ubicacionValida ? "Sin zona asignada" : "Complete una ubicación válida")}</div>
        </div>

        <div className="node-location-card node-power-card">
          <div>
            <label className="form-label fw-bold mb-1" htmlFor="node-power-source">Alimentación del nodo *</label>
            <select id="node-power-source" className="form-select" value={tipoAlimentacion} onChange={(event) => {
              setTipoAlimentacion(event.target.value);
            }}>
              <option value="BATERIA">Batería</option>
              <option value="CORRIENTE_DIRECTA">Corriente directa</option>
            </select>
          </div>
          <div className="node-power-summary">
            {tipoAlimentacion === "BATERIA" ? <><strong>Batería:</strong> {mostrarPorcentajeBateria(dispositivo?.bateria_porcentaje)} <small>· lectura automática del nodo</small></> : <><strong>Sin batería:</strong> alimentación por corriente directa</>}
            <span><strong>Intervalo:</strong> pendiente; se estimará con las lecturas recibidas.</span>
          </div>
        </div>

        {nodoActivoId && (
          <div className="node-components-card">
            <div className="node-components-heading">
              <div><h3>Dispositivos y actuadores</h3><small>Asigne aquí los sensores y actuadores instalados en este nodo.</small></div>
              <span>{componentes.length}</span>
            </div>
            <div className="hardware-note hardware-note--compact" role="note">
              <strong>Importante:</strong>  Agregarlos aquí solo registra la configuración no el dispositivo o actuador.
            </div>
            <div className="node-component-add">
              <select className="form-select" value={nuevoTipoComponente} onChange={(e) => setNuevoTipoComponente(e.target.value)} aria-label="Tipo de dispositivo o actuador" disabled={!tiposDisponibles.length || guardandoComponente}>
                <option value="" disabled>{tiposDisponibles.length ? "Seleccionar tipo" : "Sin tipos disponibles"}</option>
                {tiposDisponibles.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.categoria === "ACTUADOR" ? "Actuador" : "Sensor"}</option>)}
              </select>
              <select className="form-select" value={nuevoEstadoComponente} onChange={(e) => setNuevoEstadoComponente(e.target.value)} aria-label="Estado del componente">
                {estadoOpciones.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button type="button" className="btn btn-success" disabled={!nuevoTipoComponente || guardandoComponente} onClick={agregarComponente}>{guardandoComponente ? "Agregando…" : "Agregar"}</button>
            </div>
            {!tiposComponente.length ? <small className="text-muted">Primero registre tipos en Configuración.</small> : !tiposDisponibles.length && <small className="text-muted">Todos los tipos disponibles ya están asignados a este nodo.</small>}
            <div className="node-component-list">
              {componentes.map((item) => (
                <div className="node-component-item" key={`${item.categoria}-${item.id}`}>
                  <div className="node-component-info"><strong>{item.categoria === "ACTUADOR" ? "Actuador" : "Sensor"}</strong><small>{item.tipos_dato || item.tipo || item.nombre}</small><small className="admin-record-id">ID del dispositivo: {item.id}</small></div>
                  <select className="form-select" value={item.tipo_id || ""} onChange={(e) => actualizarComponente(item, { tipo_id: Number(e.target.value) })} aria-label={`Tipo de ${item.tipo || item.nombre}`}>
                    {tiposComponente.filter((opcion) => opcion.categoria === item.categoria && (
                      Number(opcion.id) === Number(item.tipo_id) ||
                      !componentes.some((otro) => otro.id !== item.id && Number(otro.tipo_id) === Number(opcion.id))
                    )).map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
                  </select>
                  <select className="form-select" value={item.estado} onChange={(e) => actualizarComponente(item, { estado: e.target.value })} aria-label={`Estado de ${item.tipo || item.nombre}`}>
                    {item.estado === "FALLANDO" && <option value="FALLANDO" disabled>Problemas o fallas (automático)</option>}
                    {estadoOpciones.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => eliminarComponente(item)} aria-label={`Quitar ${item.tipo || item.nombre}`}>Quitar</button>
                </div>
              ))}
              {!componentes.length && <small className="text-muted">Aún no hay componentes asignados.</small>}
            </div>
          </div>
        )}

        <hr />
        <div className="form-group mb-3">
          <label className="form-label fw-bold">Imagen del nodo (opcional)</label>
          <input
            ref={imagenInputRef}
            type="file"
            className="form-control"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const archivo = event.target.files?.[0] || null;
              const extensionesPermitidas = ["jpg", "jpeg", "png", "webp"];
              const extension = archivo?.name.split(".").pop()?.toLowerCase();
              const tiposMimePermitidos = ["image/jpeg", "image/png", "image/webp"];

              if (archivo && !(tiposMimePermitidos.includes(archivo.type) || (!archivo.type && extensionesPermitidas.includes(extension)))) {
                setImagenSeleccionada(null);
                setError("El formato no es válido. Seleccione una imagen JPG, PNG o WebP.");
                event.target.value = "";
                return;
              }
              if (archivo && archivo.size > 8 * 1024 * 1024) {
                setImagenSeleccionada(null);
                setError("El archivo supera el límite de 8 MB. Seleccione una imagen más pequeña.");
                event.target.value = "";
                return;
              }
              setImagenSeleccionada(archivo);
              setQuitarImagen(false);
              if (error?.startsWith("El formato no es válido") || error?.startsWith("El archivo supera el límite")) setError(null);
            }}
          />
          <small className="text-muted">JPG, PNG o WebP; máximo 8 MB.</small>
          <div className="d-flex align-items-center gap-3 mt-3">
            {imagenPrevia || (!quitarImagen && imagePathNodo) ? (
              <img
                src={imagenPrevia || getAssetUrl(imagePathNodo)}
                alt="Vista previa de la foto del nodo"
                className="node-image-preview"
              />
            ) : (
              <div className="node-image-empty" role="status">
                {quitarImagen ? "La foto se eliminará al guardar" : "Sin foto propia"}
              </div>
            )}
            {(imagenSeleccionada || imagePathNodo) && !quitarImagen && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() => {
                  setImagenSeleccionada(null);
                  if (imagenInputRef.current) imagenInputRef.current.value = "";
                  setQuitarImagen(true);
                }}
              >
                Eliminar foto
              </button>
            )}
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
          disabled={guardando || cargandoDimensiones || !dimensionesSitio}
        >
          Cancelar
        </button>
        <button
          className="btn btn-success"
          onClick={handleGuardar}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : nodoPersistidoId && !dispositivo ? "Guardar cambios" : "Guardar"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export default DispositivosForm;
