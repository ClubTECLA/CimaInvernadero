# Contrato API Gateway v1

Estado: contrato provisional implementado en web/API para revisión conjunta con firmware. La aplicación activa de nodo/gateway todavía no consume este contrato; esto no acredita integración física.

## Identidades y revisiones

- `gateway_id`: entero SQL. El gateway se autentica con su secreto individual, nunca con `nodo_id`.
- `nodo_id`: entero SQL de `dispositivo`. No viaja por radio ni se programa en firmware.
- `firmware_node_id`: entero `uint32` positivo (`1..4294967295`), estable y provisionado; columna SQL `INT UNSIGNED`. Es distinto de SQL ID, MAC y del `TECLA_ID_NODO` que hoy selecciona perfiles. No es secreto. No se deriva de MAC ni se reasigna por cambios de inventario.
- `mac_address`: dirección de transporte ESP-NOW asociada a una asignación vigente; puede cambiar sin cambiar `firmware_node_id`.
- `sensor_id`: entero SQL de la instancia física de sensor. El nodo no lo conoce.
- `sensor_firmware_id`: cadena ASCII estable de slot/capacidad (1–100 caracteres `[A-Za-z0-9._:-]`). `canal`: cadena ASCII de canal/entrada física con la misma longitud y charset. Gateway traduce la pareja, junto con la revisión del manifiesto, a `sensor_id`.
- `boot_id`: UUID aleatorio por arranque, nuevo tras reinicio. `seq`: entero `uint32` monotónico por nodo, boot y flujo de mensaje (`HEARTBEAT`, `TELEMETRY`, `COMMAND_ACK`); cada flujo tiene contador propio. Al aproximarse al wrap `0xffffffff`, el emisor debe abrir un boot nuevo; nunca envolver seq dentro del mismo boot. El replay guard central es por identidad completa: gateway, firmware node, boot, flujo/seq y clave específica. Hoy el backend rechaza heartbeat repetido/atrasado y deduplica cada item de telemetría, pero no mantiene high-water telemetry para permitir batches offline legítimos fuera de orden. Un reintento conserva boot, seq y mapping. El cliente no debe reintentar heartbeats viejos: en cada rendezvous crea un heartbeat fresco.
- `command_config_revision` (alias legado `config_revision`): entero JSON `uint32` por nodo (`0..4294967295`), contador deseado monotónico y sin wrap, reservado a cambios `COMMAND_CONFIG`. Instalaciones migradas parten en `1`; los valores históricos se conservan sin reinterpretarlos. `0` en applied significa que aún no se confirma configuración aplicada. Asignar/revocar gateway o nodo, mapear sensores y cambiar estado administrativo no incrementa este contador: esas mutaciones cambian las revisiones de asignación/manifiesto. Cada comando lleva `command_config_revision_expected` (última aplicada) y `command_config_revision_target` (nueva revisión); `config_revision_expected/target` son aliases legacy aceptados/devueltos. APPLIED solo se acepta con el target correspondiente. La creación devuelve `409` al agotar el contador.
- `assignment_revision`: SHA-256 del snapshot activo por gateway: `UTF-8(JSON.stringify(snapshot))`, JSON compacto; claves en orden `nodo_id, firmware_node_id, mac_address, sensores`; nodos por firmware ID; sensores por canal y sensor SQL ID; cada sensor contiene claves `sensor_id, sensor_firmware_id, canal`. `manifest_revision`/ETag aplica el mismo algoritmo al snapshot estático del manifiesto con nodos y sensores en ese orden; excluye `generated_at`, heartbeat, ventanas esperadas y la revisión de comandos. El snapshot incluye estado administrativo, intervalos, y sensores con mediciones, unidades, límites y calibración. Cambios de asignación cambian assignment hash; cambios administrativos/medición cambian manifest hash. Ninguna MANIFEST_ACK incrementa o confirma un comando. El scope de ambos SHA-256 opacos es un gateway.

## Estados

- Estado administrativo del nodo: `OPERATIVO`, `INACTIVO`, `EN MANTENIMIENTO`. Se guarda en `dispositivo.estado` y no lo reemplaza la conectividad.
- La API proyecta `FALLANDO` en `estado` solo si el estado administrativo es operativo y la presencia esperada está atrasada. También devuelve `estado_administrativo`, `estado_comunicacion` (`SIN_COMUNICACION`, `RECIBIENDO`, `ATRASADO`) y `estado_comunicacion_fuente`.
- El umbral de presencia es `management_poll_interval_seconds + HEARTBEAT_GRACE_SECONDS`; margen predeterminado 120 s, ajustable entre 30 y 3600 s. La cadencia de muestreo es distinta.
- Estado administrativo de sensor en este esquema: `OPERATIVO`, `INACTIVO`, `EN MANTENIMIENTO`, `RETIRADO`; `ACTIVO` solo se acepta como alias legado. Filas antiguas `FALLANDO` quedan preservadas como valor legacy sin interpretación de salud. El manifiesto devuelve `estado_administrativo` y mantiene `estado` como alias compatible. La salud (`FUNCIONANDO`, `SIN_LECTURA`, `LECTURA_INVALIDA`, `DESCONECTADO`, `ERROR`) es un dato diferente; el API/heartbeat actual todavía no recibe ni persiste ese enum, así que no lo inventa ni lo deriva de mantenimiento. Queda pendiente de contrato de estado por sensor desde gateway/firmware.

## Autenticación

Las rutas de gateway usan `X-Gateway-Id: <gateway_id>` y `X-Gateway-Key: <secreto>`. La API almacena SHA-256 del secreto y compara de forma constante. El aprovisionamiento y administración usan `Authorization: Bearer <token de usuario>`.

## Rutas

### Registrar gateway

`POST /api/gateway/v1/gateways` (Bearer usuario)

```json
{"nombre":"Gateway norte"}
```

`201`: `{ "schema_version": 1, "gateway_id": 12, "api_key": "<secreto de una sola lectura>", "api_base_url":"https://<host-configurado>/api" }`. La URL proviene de `GATEWAY_API_BASE_URL`; si no se define, devuelve `null` y debe configurarse durante provisioning. No hay URL de localhost/IP por defecto. `400` nombre inválido; `500` error de persistencia. El secreto debe guardarse en provisioning seguro del gateway.

Administración/listas: `GET /api/gateway/v1/gateways` (Bearer) devuelve inventario sin credenciales; `GET /api/gateway/v1/gateways/{gateway_id}/nodes` devuelve asignaciones vigentes e históricas, hashes `manifest_revision_applied`/`assignment_revision_applied` reportados y `manifest_sync_status` (`UNKNOWN`, `CURRENT`, `OUT_OF_DATE`, `REVOKED`). En la respuesta, `manifest_revision_desired` y `assignment_revision_desired` son hashes actuales del gateway y se comparan con la presencia por nodo. El modelo de autenticación actual usa un bearer global y no incorpora claims de propietario/tenant, por lo que estas rutas aún no aíslan administradores por propietario.

Descubrimiento no vinculante: `POST /api/gateway/v1/discovery/candidates` (auth gateway) recibe `{ "nodes":[{"firmware_node_id":70002,"mac_address":"24:6F:28:AA:BB:DD","boot_id":null,"wire_version":"v3","firmware_version":"0.4","capabilities":[]}] }`; responde `202` y persiste última observación. `GET /api/gateway/v1/gateways/{gateway_id}/candidates` (Bearer) lista candidatos observados aún no asignados. Los candidatos no son autenticación de nodo ni asignación; MAC no dispara vinculación. Un administrador debe elegir/crear el dispositivo SQL y llamar explícitamente al PUT de asignación. `400` formato/capacidad inválida; `401` auth inválida; `500` persistencia.

### Asignar nodo al gateway

`PUT /api/gateway/v1/gateways/{gateway_id}/nodes` (Bearer usuario)

```json
{"nodo_id":42,"firmware_node_id":70001,"mac_address":"24:6F:28:AA:BB:CC","management_poll_interval_seconds":600}
```

`201`: incluye `asignacion_id` y las identidades SQL/físicas separadas. La asignación anterior del mismo nodo se marca inactiva y conserva `vigente_hasta`. `firmware_node_id` es globalmente único entre asignaciones activas; MAC y dispositivo SQL también tienen unicidad activa. `400` esquema/rango inválido; `404` gateway o nodo SQL inexistente; `409` identidad ya vinculada a otro dispositivo. En instalaciones antiguas con firmware ID duplicados activos, la migración falla con diagnóstico antes de crear la unicidad; no reasigna ni borra datos automáticamente. Si el hardware/perfil ya se soporta, un alta puede cambiar el manifiesto sin recompilar firmware; el cliente embebido aún está pendiente.

Revocar una asignación: `DELETE /api/gateway/v1/gateways/{gateway_id}/nodes/{nodo_id}` (Bearer usuario). `200` devuelve `revoked:true`, `assignment_id` e `historical_assignment_preserved:true`; solo marca la fila vigente inactiva y establece `vigente_hasta`, no borra el historial. `404` no hay asignación vigente; `400` IDs inválidos; `500` fallo de transacción. Pending une la asignación activa exacta, así que no devuelve órdenes antiguas tras revocación; `/status` reporta `assignment_active:false`; lease/dispatch responden `409 assignment_revoked`. Comandos existentes conservan su gateway/nodo objetivo y quedan rastreables hasta ACK/expiry, sin posibilidad de nuevo despacho desde la asignación revocada.

### Asignar sensor instalado

`PUT /api/gateway/v1/gateways/{gateway_id}/nodes/{nodo_id}/sensors` (Bearer usuario)

```json
{"sensor_id":81,"sensor_firmware_id":"dht22-1","canal":"gpio4"}
```

`201`: asignación de `nodo_sensor` creada. Una asignación previa se cierra con `retirado_en`; `400` formato inválido; `404` relación gateway/nodo o sensor inexistente. `sensor_id` identifica la instancia SQL; slot y canal se envían por radio.

Consultar mapeos vigentes: `GET /api/gateway/v1/gateways/{gateway_id}/nodes/{nodo_id}/sensors` (Bearer usuario) devuelve `sensores[]` con `asignacion_sensor_id`, `sensor_id`, `nombre`, `tipo_sensor`, `sensor_firmware_id`, `canal`, `estado_administrativo`, `instalado_en` y `notas`. Solo incluye filas `nodo_sensor.activo=1`; `404` si el nodo no está actualmente asignado a ese gateway, `400` IDs inválidos y `500` fallo de consulta. Una respuesta vacía `200` significa que el nodo existe en la asignación activa pero no tiene sensores instalados vigentes.

### Leer manifiesto

`GET /api/gateway/v1/manifest` (auth gateway)

`200`:

```json
{
  "schema_version":1,"gateway_id":12,"generated_at":"2026-11-25T12:00:00.000Z",
  "assignment_revision":"<sha256>","manifest_revision":"<sha256>",
  "nodes":[{
    "nodo_id":42,"firmware_node_id":70001,"mac_address":"24:6F:28:AA:BB:CC",
    "estado_administrativo":"OPERATIVO","intervalo_lectura_segundos":600,
"management_poll_interval_seconds":600,"command_config_revision":1,"config_revision":1,
    "ultimo_heartbeat_at":null,"next_expected_management_window":null,
    "management_deadline_at":null,"management_poll_margin_seconds":180,
    "manifest_revision_applied":null,"assignment_revision_applied":null,"manifest_sync_status":"UNKNOWN",
    "sensores":[{"sensor_id":81,"sensor_firmware_id":"dht22-1","canal":"gpio4","estado_administrativo":"OPERATIVO","estado":"OPERATIVO","tipo_dato_ids":[1,2],"mediciones":[{"tipo_dato_id":1,"tipo_dato":"Temperatura","unidad":"°C","installation_limits":{"minimum":10,"maximum":35,"semantics":"configured installation acceptance range; nullable and not manufacturer spec"},"manufacturer_limits":{"minimum":null,"maximum":null,"reference":null,"semantics":"unconfigured; do not infer hardware limits"},"calibration_status":"UNCALIBRATED","calibration_reference":null,"calibrated_at":null}]}]
  }]
}
```

Incluye nodos y sensores asignados aunque estén inactivos o en mantenimiento para sincronizar su configuración. `sensor_id` es solo para el gateway. Cada elemento de `mediciones` contiene tipos permitidos, unidad canónica de catálogo, límites de instalación opcionales, límites de fabricante solo con referencia documental, y estado/referencia de calibración. No se aplica corrección de calibración a la muestra: son metadatos, no una transformación de datos. `ETag` repite `manifest_revision`; `assignment_revision` cambia si cambia el mapeo de identidades y se exige en cada lote. Los strings API de slot/canal no se deben repetir en wire v3 dentro de cada frame: el protocolo radio debe usar códigos compactos numéricos ligados a esa revisión o fijar explícitamente un límite/fragmentación con presupuesto máximo de 250 bytes por trama ESP-NOW. No asumir que un lote de ocho lecturas cabe en una trama. `401` credencial incorrecta; `500` lectura fallida. El gateway debe persistir de forma atómica el último manifiesto válido; esto no está implementado en el firmware activo.

`manifest_revision_applied` y `assignment_revision_applied` reflejan los últimos hashes que ese nodo confirmó por MANIFEST_ACK y luego reportó en heartbeat. `manifest_sync_status` se calcula al generar la respuesta: `UNKNOWN` si faltan hashes; `CURRENT` si ambos igualan las revisiones deseadas del gateway; `OUT_OF_DATE` si hay hashes reportados pero al menos uno difiere. Estos campos de presencia no forman parte del snapshot hasheado ni cambian el ETag. Son visibilidad central por nodo, no un ACK de comando.

### Configurar validación por sensor y tipo de dato

`GET /api/gateway/v1/sensors/{sensor_id}/measurements/{tipo_dato_id}/validation` y `PUT` sobre la misma ruta (Bearer usuario). Solo se aceptan pares sensor/tipo compatibles. PUT reemplaza completamente los límites y metadatos:

```json
{"unidad":"°C","installation_min":10,"installation_max":35,
 "manufacturer_min":null,"manufacturer_max":null,"manufacturer_reference":null,
 "calibration_status":"UNCALIBRATED","calibration_reference":null}
```

`unidad` debe coincidir exactamente con `tipo_dato.unidad`. Mínimo/máximo pueden ser nulos o unilaterales; si ambos existen, mínimo ≤ máximo. Los límites manufacturer requieren referencia verificable y quedan nulos hasta documentar modelo/fuente; los de instalación son umbrales de aceptación configurados, no especificaciones físicas. `CALIBRATED` requiere referencia; `NOT_RECORDED` y `UNCALIBRATED` no. `200` devuelve/guarda config; `400` unidad/formato/rango/calibración inválidos; `404` sensor/tipo compatible ausente; `409` unidad distinta a catálogo; `500` persistencia. Sin fila de configuración, la respuesta/manifiesto expone rangos null y `calibration_status:NOT_RECORDED`. La migración no inventa límites ni backfillea calibración.

### Heartbeat/presencia

`POST /api/gateway/v1/heartbeat` (auth gateway)

```json
{"nodes":[{
  "firmware_node_id":70001,"boot_id":"4d8b49e4-3fc4-423c-912a-58ac68219eaf","seq":18,
  "firmware_version":"0.3.0","command_config_revision_applied":1,
  "effective_mode":"OPERATIVO","last_applied_command_id":null,
  "manifest_revision_applied":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "assignment_revision_applied":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}]}
```

`effective_mode` acepta exactamente `OPERATIVO`, `INACTIVO` o `EN MANTENIMIENTO`: el nodo reporta el modo que cree tener aplicado; eso no actualiza el estado administrativo central ni prueba comunicación más allá de ese heartbeat. `command_config_revision_applied` es el nombre canónico del contador runtime aplicado; `config_revision_applied` se conserva como alias legacy. Si llegan ambos con valores distintos, se rechaza con `400`. Las dos revisiones hash aplicadas son opcionales y deben omitirse juntas (legacy: no cambiar el último valor conocido), enviarse como dos SHA-256 hex de 64 caracteres (normalizados a minúsculas al guardar), o enviarse ambas como `null` para declarar que el nodo no conserva snapshot aplicado. Un par parcial o un hash inválido da `400`. Un heartbeat de seq repetido/atrasado da `409` y no modifica presencia ni hashes; repetir la misma solicitud no refresca `last_seen`. El gateway solo reporta hashes después de MANIFEST_ACK de aplicación/persistencia del nodo. `command_config_revision_applied` solo cambia por el ciclo COMMAND_CONFIG; MANIFEST_ACK nunca completa ni cambia el estado de un comando HTTP.

`200`: `{ "schema_version":1, "accepted":true, "received_at":"..." }`. Solo heartbeat actualiza `ultimo_heartbeat_at`; también persiste la última presencia por gateway/nodo, boot, secuencia, firmware, modo efectivo y, cuando se informan, ambos hashes aplicados. GET manifest expone los hashes guardados y `manifest_sync_status` por nodo para comparar presencia con el snapshot deseado actual. Las migraciones dejan los campos nuevos `NULL`; no backfillean hashes inferidos ni convierten columnas históricas. No inserta lecturas ni cambia el estado administrativo. `400` payload inválido; `401` gateway inválido; `403` ID de firmware no asignado; `409` secuencia repetida/atrasada; `500` fallo de persistencia. `SIN_COMUNICACION` distingue falta de contacto de `INACTIVO`.

Hasta el primer heartbeat nuevo, se acepta `ultima_comunicacion` heredada como compatibilidad temporal y se identifica con fuente `LEGACY_TELEMETRY_COMPAT`. Ese campo histórico mezclaba presencia y lecturas, por lo que no es evidencia precisa; expira según el plazo configurado.

### Enviar telemetría central

`POST /api/lecturas` (auth gateway)

```json
{
  "dispositivo_id":42,"firmware_node_id":70001,
  "boot_id":"4d8b49e4-3fc4-423c-912a-58ac68219eaf","seq":19,
  "sample_uptime_ms":834500,"time_quality":"UNSYNCED",
  "intervalo_lectura_segundos":600,
  "lecturas":[{
    "sensor_id":81,"sensor_firmware_id":"dht22-1","canal":"gpio4",
    "tipo_dato_id":1,"dato":23.5,"unidad":"°C"
  }]
}
```

Para `SYNCED`, `captured_at` UTC es obligatorio y se conserva; para `UNSYNCED`, `captured_at` queda `NULL`. `sample_uptime_ms` es tiempo monotónico relativo a boot; `created_at` es recepción en backend (`gateway_received_at` se devuelve en la respuesta). Cada lote debe incluir `manifest_revision` y `assignment_revision`, ambas SHA-256 hex de 64 caracteres, ligadas al mapping usado cuando se capturó/encoló la muestra.

El nodo debe estar administrativamente `OPERATIVO`; el gateway/nodo deben estar asignados; `assignment_revision` debe corresponder al mapping activo; `sensor_id`, `sensor_firmware_id` y `canal` deben coincidir con el manifiesto usado; el sensor debe ser `OPERATIVO` (o `ACTIVO` legado) y soportar ese `tipo_dato_id`. Si cambia la asignación, el servidor rechaza el lote/item como mapping obsoleto, registra metadatos de cuarentena y solicita resync: nunca remapea una muestra antigua usando el manifiesto nuevo. La cola offline del gateway debe persistir `sensor_id`, ambas revisiones y la clave original por muestra. Sensor en mantenimiento nunca se envía aquí: se retiene en la vista/cache local del gateway, sin retry central. El web central no puede mostrar esas lecturas locales porque no las recibe. `INACTIVO`, `RETIRADO` tampoco se insertan como valor productivo.

`unidad` por muestra es opcional por compatibilidad; si se omite, backend interpreta el dato en la unidad canónica de catálogo y marca `unit_assumed:true`. Si se incluye, debe coincidir; si falta unidad de catálogo se rechaza con cuarentena. Límites de fabricante (si están respaldados por referencia) e instalación se validan separadamente. Un valor fuera de límite no entra a `lecturas`: se conserva en `gateway_telemetry_rejection` con valor/unidad recibidos, límites y calibración que causaron el rechazo. Lecturas aceptadas no se corrigen ni reemplazan; calibración es metadato.

`201` si insertó alguna muestra o `200` si todas eran duplicadas/rechazadas:

```json
{"schema_version":1,"accepted":true,"duplicate_count":0,"time_quality":"UNSYNCED",
 "gateway_received_at":"2026-11-25T12:00:00.000Z",
 "items":[{"sensor_id":81,"tipo_dato_id":1,"status":"accepted","unidad":"°C","unit_assumed":true,"calibration_status":"NOT_RECORDED"}]}
```

Cada item puede ser `accepted`, `duplicate` o `rejected`. Cada item aceptado se inserta como fila cruda individual en `lecturas`; promediar no reemplaza ni agrega filas. Dedupe: `(gateway_id, firmware_node_id, boot_id, seq, sensor_id, tipo_dato_id)`; reintentar la misma muestra devuelve `duplicate` y no inserta otra fila; el dedupe conserva también las revisiones declaradas. Rechazos de mapping/estado persisten metadatos y ambas revisiones en `gateway_telemetry_rejection` (no el valor); `action` puede indicar `keep_local_no_retry` o `quarantine_resync_manifest_no_retry`. `400` envelope/dato inválido; `401` auth; `403` asignación incorrecta; `404` nodo/tipo no encontrado; `409` nodo no operativo; `500` fallo transaccional. Lecturas históricas con `sensor_id NULL` permanecen sin backfill y revisiones históricas nuevas de tablas quedan `NULL` porque no se pueden reconstruir determinísticamente.

Un HTTP 2xx confirma commit central solamente. ACK local de gateway debe distinguir `LOCAL_VOLATILE_BUFFERED` de `CENTRAL_COMMITTED`; la caché, retención, overflow y comportamiento al reiniciar son responsabilidad embebida y están pendientes de definir/probar. La capacidad conocida del firmware actual es una cola volátil de ocho tramas, no una página local ni una garantía durable.

### Crear/consultar comando

`POST /api/gateway/v1/commands` (Bearer usuario)

```json
{"nodo_id":42,"tipo":"CONFIGURAR_NODO","payload":{"modo":"OPERATIVO"},"idempotency_key":"b77be448-c1f2-4b06-8585-cd5661a6e5cd","timeout_seconds":60}
```

`202` significa **solo encolado** (`EN_COLA`), no recibido por gateway/nodo. El backend fija gateway/firmware ID, `command_config_revision_expected` (última aplicada conocida; `0` si todavía no hay heartbeat de configuración) y `command_config_revision_target` (contador deseado incrementado y persistido en `dispositivo.config_revision`). Solo emitir un `COMMAND_CONFIG` incrementa el contador. Las asignaciones/revocaciones cambian `assignment_revision`; estado administrativo, cadencia y metadatos de sensor cambian `manifest_revision`; no alteran el contador de comandos. TTL es `max(timeout_seconds, management_poll_interval_seconds + COMMAND_DELIVERY_MARGIN_SECONDS)`; el margen configurado debe cubrir como mínimo arranque máximo + ventana de escucha + backoff/poll del gateway + retries de radio + margen de red/reloj. Configuración `COMMAND_DELIVERY_MARGIN_SECONDS` acepta 60–7200 s (predeterminado 180, aún no validado en campo); TTL máximo 86400 s. Si el rendezvous más margen supera el máximo, el API rechaza la orden, no reduce silenciosamente el TTL. `400` formato/rango/TTL; `409` asignación ausente, contador agotado u otro pending por gateway; `500` base de datos. Los aliases `config_revision_expected/target` siguen en respuesta para clientes v1 existentes.

`GET /api/gateway/v1/commands/{command_id}` (Bearer usuario) devuelve el estado durable luego de recargar/pollear:

```json
{"id":"<uuid>","command_id":"<uuid>","idempotency_key":"<uuid>","nodo_id":42,"gateway_id":12,
 "firmware_node_id":70001,"command_config_revision":2,"command_config_revision_expected":1,"command_config_revision_target":2,"tipo":"CONFIGURAR_NODO",
 "estado":"RECIBIDO_GATEWAY","ack_stage":"NONE","vence_at":"...",
 "gateway_received_at":"...","node_received_at":null,"node_completed_at":null,
 "attempts_gateway":1,"attempts_radio":0,"expired_at":null}
```

Estados: `EN_COLA` guardado; `RECIBIDO_GATEWAY` autenticado/polled (no terminal); `RECIBIDO_NODO` ACK de aplicación del nodo (no terminal); `APLICADO_NODO` terminal tras aplicar/persistir; `RECHAZADO_NODO` terminal; `SIN_CONFIRMACION` vencido sin resultado (desconocido, nunca inferir falla física). Valores legacy `ENTREGADO`, `CONFIRMADO`, `FALLIDO`, `VENCIDO` se conservan para filas antiguas y lectores anteriores. Cancelación no está expuesta.

### Entregar comando al gateway

`GET /api/gateway/v1/commands/pending?limit=10` (auth gateway) devuelve solo comandos de ese gateway y nodos asignados, con `command_id`, UUID idempotency key, nodo SQL, firmware ID, revisión esperada, payload, vencimiento y `ttl_remaining_seconds` calculado por servidor. El servidor es autoridad de expiración; comandos vencidos se marcan `SIN_CONFIRMACION` y quedan excluidos de pending. Gateway debe re-pollar antes de cada nueva ventana/retransmisión tras reboot y nunca repetir offline una orden con TTL vencido. El nodo dormido no requiere reloj UTC: gateway transmite solo una orden que el último poll central confirmó vigente y aplica TTL monotónico local si puede. Cada poll actualiza `RECIBIDO_GATEWAY`, `gateway_received_at`, `attempts_gateway` y `last_attempt_at`. Pending vuelve a aparecer hasta estado terminal o expiración; el gateway retransmite con el mismo command/idempotency ID. Si el servidor no es alcanzable, no se puede confirmar que la orden siga vigente; no retransmitir en ese caso.

`GET /api/gateway/v1/commands/{command_id}/status` (auth gateway) revalida una orden retenida después de reboot/retry y devuelve estado/TTL actual. `ttl_remaining_seconds` por sí solo no autoriza una transmisión. Para cada intento lógico, el gateway solicita `POST /api/gateway/v1/commands/{command_id}/lease`, que responde un `delivery_lease_id` UUID con expiración `min(30 s, ttl_remaining_seconds)`. Luego llama `POST /api/gateway/v1/commands/{command_id}/dispatch` con ese lease. HTTP 200 autoriza un solo intento lógico de despacho (`radio_send_budget:1`); el backend consume el lease antes de responder e incluye el mismo ID, `delivery_lease_expires_at` y `lease_seconds_remaining`. Esto no garantiza entrega física exactamente una vez: un lease nuevo puede retransmitir, así que el transporte radio es at-least-once y el nodo debe deduplicar/idempotentemente aplicar por `command_id` y correlacionar el ACK con ese ID. Gateway debe marcar/persistir ese ID como consumido antes de iniciar la transmisión y convertir `lease_seconds_remaining` a deadline monotónica local al recibir la respuesta. No reutilizar la autorización después de fallo, timeout o reboot; si pierde la respuesta de dispatch, debe revalidar y obtener un lease nuevo antes de cualquier envío. Se repite status→lease→dispatch para cada retransmisión. El token no reemplaza el ACK del nodo. `404` identifica comando fuera de ese gateway; `409` lease vencido/consumido o comando terminal/expirado. El backend persiste `delivery_lease_id`, expiración, consumo e intentos.

Ejemplos de lease/dispatch (auth gateway en todos):

```http
GET /api/gateway/v1/commands/7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01/status
```

```json
{"command_id":"7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01","estado":"RECIBIDO_GATEWAY","ttl_remaining_seconds":540,"delivery_authorized":null}
```

```http
POST /api/gateway/v1/commands/7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01/lease
Content-Type: application/json

{}
```

```json
{"command_id":"7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01","delivery_lease_id":"a8710a5c-e6d9-49f7-8d5f-3397e3260064","delivery_authorized":false,"lease_seconds_remaining":30,"ttl_remaining_seconds":540}
```

```http
POST /api/gateway/v1/commands/7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01/dispatch
Content-Type: application/json

{"delivery_lease_id":"a8710a5c-e6d9-49f7-8d5f-3397e3260064"}
```

```json
{"command_id":"7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01","delivery_lease_id":"a8710a5c-e6d9-49f7-8d5f-3397e3260064","delivery_lease_expires_at":"2026-11-25T12:00:30.000Z","lease_seconds_remaining":29,"delivery_authorized":true,"radio_send_budget":1,"delivery_attempts":1}
```

Status/lease/dispatch: `200` current status, lease, or consumed one-send authorization; `400` invalid lease envelope; `401` credential; `404` unknown command or wrong gateway; `409` command no longer active, lease expired/consumed, or command expired; `500` persistence/query failure. A lost dispatch response does not authorize reuse: revalidate status and request another lease.

### ACK de aplicación del nodo

`POST /api/gateway/v1/commands/{command_id}/ack` (auth gateway)

```json
{"firmware_node_id":70001,"command_config_revision_expected":1,
 "stage":"RECEIVED","boot_id":"4d8b49e4-3fc4-423c-912a-58ac68219eaf","seq":22}
```

`RECEIVED` solo acredita ACK de aplicación del nodo, no callback de radio; deja comando pending en `RECIBIDO_NODO`. Resultado terminal:

```json
{"firmware_node_id":70001,"command_config_revision_expected":1,"stage":"APPLIED",
 "command_config_revision_applied":2,"boot_id":"4d8b49e4-3fc4-423c-912a-58ac68219eaf","seq":23}
```

La ruta incluye `command_id`; `command_config_revision_expected` y `command_config_revision_applied` son enteros JSON uint32, no timestamps. `config_revision_expected/applied` se aceptan como aliases legacy solo si no contradicen los campos canónicos. APPLIED/REJECTED y RECEIVED correlacionan `firmware_node_id`, `command_config_revision_expected`, `boot_id` UUID y seq uint32 del flujo `COMMAND_ACK`; estos campos son obligatorios porque existe respuesta de aplicación del nodo. `REJECTED` incluye `message` de hasta 500 caracteres; `APPLIED` incluye `command_config_revision_applied`, que debe coincidir con `command_config_revision_target` de la orden. El cliente debe enviarlo después de persistir/aplicar en NVS. ACK repetido del mismo comando/etapa es idempotente; target/revisión distintos reciben `409`. Tras vencimiento, gateway consulta `/status` y POST con `stage:"NO_CONFIRMATION_UNKNOWN"`; `command_id` va en la ruta y `firmware_node_id`/`command_config_revision_expected` siguen siendo obligatorios. Como ningún ACK del nodo pudo recibirse, `boot_id` y `seq` se omiten o se envían explícitamente como `null`; no se inventan valores. El backend prueba elegibilidad usando su `vence_at` y solo confirma UNKNOWN una vez vencido en servidor; responde `estado:"SIN_CONFIRMACION", result_status:"UNKNOWN", ack_stage:"UNKNOWN_CONFIRMED", gateway_queue_terminal:true, remove_reported:true`. Si el gateway tuvo evidencia parcial de un intento/nodo, puede incluir el par boot_id+seq válido; nunca se acepta solo uno de los dos. UNKNOWN es resultado desconocido, nunca éxito/rechazo. La confirmación UNKNOWN permite retirar el comando de la FIFO activa, pero el gateway conserva un tombstone/deadletter para reconciliar ACK tardíos. El tombstone solo puede purgarse cuando el servidor autorice el cierre definitivo: `GET /status` devuelve `result_unknown_final:true` y `remove_reported:true`, o un POST ACK tardío obtiene HTTP `410 Gone` con `late_ack_window_expired:true`, `result_status:"UNKNOWN"` y `remove_reported:true`. HTTP 410 solo se emite después de consultar el estado persistido; la auditoría central permanece. La ventana tardía empieza en `vence_at`; por defecto dura 30 días y `COMMAND_LATE_ACK_WINDOW_SECONDS` permite configurarla entre 86400 y 31536000 segundos. Dentro de la ventana, APPLIED/REJECTED tardíos por el mismo command_id se aceptan idempotentemente si nodo/revisión coinciden y se conserva `expired_at`/`gateway_unknown_ack_at`. Tras la ventana, se conserva `SIN_CONFIRMACION` en auditoría; `GET /status` indica `result_unknown_final:true`, `gateway_queue_terminal:true` y `remove_reported:true`; un APPLIED/REJECTED tardío recibe HTTP `410 Gone` con `late_ack_window_expired:true`, resultado UNKNOWN y autorización para retirar el tombstone local. ACK de desconocido no cancela ni borra el comando. La respuesta HTTP se envía después de que la actualización durable del backend termina. `200` devuelve estado nuevo/idempotente; `400` envelope inválido; `401` credencial; `404` comando fuera del gateway; `409` expiry/revisión/etapa incorrecta o ACK RECEIVED tardío; `410` ACK terminal fuera de ventana. El heartbeat solo ofrece `last_applied_command_id` (un resultado reciente), no sustituye los POST ACK individuales: gateway debe retener/reintentar cada resultado no confirmado con el mismo command_id hasta confirmación central. Esa cola durable de ACKs aún no existe en firmware.

ACK de desconocido:

```json
{"firmware_node_id":70001,"command_config_revision_expected":1,"stage":"NO_CONFIRMATION_UNKNOWN","boot_id":null,"seq":null}
```

```json
{"command_id":"7d15fbb7-a6b3-4b1a-b45a-20c92cb3ef01","estado":"SIN_CONFIRMACION","result_status":"UNKNOWN","ack_stage":"UNKNOWN_CONFIRMED","gateway_queue_terminal":true,"remove_reported":true,"expired_at":"2026-11-25T12:11:00.000Z","gateway_unknown_ack_at":"2026-11-25T12:11:05.000Z"}
```

## ACK, sueño, privacidad y alcance

- El gateway separa recepción de radio, almacenamiento local y commit central. Una muestra de mantenimiento se muestra localmente y no se reenvía; la web central no puede mostrarla.
- Muestreo y `management_poll_interval_seconds` son relojes distintos. En cada ventana de gestión el nodo/gateway puede recibir config/comandos y enviar heartbeat, aun si el nodo no toma medidas productivas.
- La ingesta escribe `lecturas.created_at` como recepción del servidor y conserva `captured_at` como tiempo de captura solo si es confiable; no modifica `ultimo_heartbeat_at` ni `ultima_comunicacion`. El endpoint separado `/api/gateway/v1/heartbeat` es la fuente de presencia. Muestras atrasadas no prueban conectividad reciente.
- `GET /api/lecturas/ultimas?dispositivo_id=...` devuelve la última lectura por nodo + sensor + tipo, con `received_at` y `captured_at`; `sensor_id:null` identifica legado no asociable. `/api/lecturas/promedio` conserva `datos` como alias del promedio global por tipo que usa Inicio, y añade `global.scope` y `por_sensor` (nodo/sensor/tipo). Ambos son consultas derivadas: no se persisten promedios ni se reemplazan las filas crudas. `global.datos` mezcla nodos y sensores del filtro seleccionado, promediando todas las filas individuales por tipo; cada fila tiene el mismo peso, de modo que fuentes con más muestras en la ventana contribuyen más. `por_sensor.datos` permite comparar sin esa mezcla silenciosa. La ventana de 60 minutos usa tiempo de captura con recepción como fallback cuando `captured_at` es NULL. Las rutas administrativas PATCH/DELETE existentes pueden corregir o borrar filas crudas por separado; el cálculo de promedios no lo hace.
- Un nodo dormido no escucha comandos hasta el próximo rendezvous. UI debe mostrar “esperando próxima ventana” y expiración; HTTP 2xx de creación, poll del gateway y callback ESP-NOW no significan aplicación por el nodo.
- API schema v1, protocolo radio v3 y esquema NVS son versiones independientes y requieren upgrades compatibles; una actualización no debe borrar identidad, credenciales, manifiesto/configuración ni resultados de comando pendientes. Wire v3 debe partir de compatibilidad con ESP-NOW v1, con presupuesto app-frame de hasta 250 B para pares v1. Una trama mayor de ESP-NOW v2 requiere capability/version negotiation explícita; no asumir ese tamaño para pares v1 ni truncar silenciosamente. Presupuesto real, fragmentación, encoding compacto y ACK aún necesitan especificación/prueba en las versiones ESP-IDF objetivo. Cifrado/autenticación radio CCMP y OTA quedan fuera; no afirmar seguridad radio ni OTA disponible. Actuador virtual/control de iluminación quedan fuera y el nodo no depende de Internet de campo.

## Estado del código y límites de base de datos

- `backend/src/database/migrate.js` es la migración ejecutada por backend. Históricamente crea `sensor(dispositivo_id,tipo_dispositivo_id,estado)` y `lecturas` sin `sensor_id`; la migración nueva suma `nodo_sensor`, `sensor_id NULL`, `captured_at`, uptime, `sensor_measurement_config` por sensor+tipo de dato, y columnas de valor/unidad/JSON de validación para cuarentena; también suma gateway/asignaciones, candidatos de descubrimiento, hashes aplicados nullable en presencia, dedupe y una unicidad global activa de `firmware_node_id` de forma aditiva. Si preflight detecta firmware IDs duplicados activos detiene el cambio con mensaje; no reasigna ni borra historia. No hace backfill de `sensor_id`, hashes aplicados, límites ni calibración, ni borra/mapea `RETIRADO` o `ACTIVO`.
- `database/basededatos.sql` es una definición independiente que ya modelaba `sensor` físico, `nodo_sensor`, `lecturas.sensor_id NULL`; no equivale a la variante simplificada del migrador. Se amplió para reflejar campos/tablas nuevas; instalar solo este SQL no ejecuta la lógica retrocompatible. Las revisiones textuales antiguas de command/presence se conservan en sus columnas existentes; los campos nuevos `*_u32` son aditivos y no convierten fechas ni pierden historial. Para nodos existentes `dispositivo.config_revision` inicializa a 1; `config_revision_applied_u32` permanece NULL hasta el primer heartbeat numérico. Comandos legacy sin target uint32 quedan con sus valores históricos intactos y se marcan SIN_CONFIRMACION durante la transición, sin despacharse como órdenes v1. `gateway_command` conserva lease/attempts, timestamps y ACK de unknown; late result actualiza estado sin borrar el registro.
- ACK/estados de comando y heartbeat se almacenan; `gateway_node_presence` conserva último valor (no un log completo de heartbeats). `gateway_command` conserva tiempos/attempts terminales. Para telemetría, la lectura productiva se confirma una vez en transacción y el rechazo guarda metadatos; la caché local/mantenimiento no es visible central.
- La migración se ejecutó en un contenedor MySQL desechable sin volumen: pasó desde schema vacío, en segunda ejecución y sobre una BD creada desde el SQL independiente. No se ejecutó contra datos de usuario/BD persistente. El contenedor de validación es temporal y se elimina al detenerlo.
- La cola local actual confirmada en firmware es volátil (hasta ocho tramas); no existe página local ni garantía de persistencia/retención/overflow/reinicio. `LOCAL_VOLATILE_BUFFERED` no es un ACK central ni una garantía durable. Heartbeat fresco, dedupe, mapping retenido por muestra, retransmisión de comandos y contrato v1 aún requieren integración embebida; hoy el nodo activo no transmite este flujo y el gateway conserva validaciones estáticas. API/DB solas no prueban integración radio→backend.
- La revisión estática embebida reporta que el deadletter/tombstone local de comandos también tiene capacidad fija de ocho entradas; al llenarse aplica fail-safe y bloquea nuevas órdenes. Esto exige monitoreo y política operativa para el prototipo y no permite asumir uso sostenido. El gateway debe purgar cada tombstone solo tras la autorización final `GET /status` (`result_unknown_final:true` y `remove_reported:true`) o el HTTP `410` definitivo descrito arriba; mientras la ventana de ACK tardío esté abierta, conserva el tombstone y reintenta el ACK tardío si aparece. La capacidad y la política no se han validado en uso de campo.
