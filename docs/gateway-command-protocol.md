# Protocolo de comandos del gateway

La plataforma ya cuenta con una cola inicial para preparar el envío de cambios al gateway. La cola no simula entregas: mientras no exista un gateway que consulte los comandos y responda, estos vencerán y la interfaz de integración informará que no hubo confirmación.

## Ciclo previsto

1. El panel solicita un comando autenticado y proporciona un `idempotency_key` UUID.
2. La API lo registra como `EN_COLA` con fecha límite y devuelve HTTP `202` con su `id`.
3. El panel mantiene la acción pendiente y consulta su estado. La API serializa la cola para permitir solo un comando pendiente a la vez, incluso si se abren varias pestañas; la utilidad del frontend también bloquea envíos simultáneos en la misma pestaña.
4. El gateway consulta `GET /api/gateway/queue/pending` usando `x-gateway-key`. Cada comando tiene un ID único que debe conservarse al reenviarlo al ESP32.
5. Cuando el ESP32 confirma la aplicación, el gateway responde a `POST /api/gateway/queue/:id/ack` con `{ "success": true }`. Si no pudo aplicarlo, debe enviar `success: false` y un mensaje breve.
6. El panel finaliza solo con `CONFIRMADO`, `FALLIDO` o `VENCIDO`. Guardar un comando en SQL no equivale a aplicarlo en el equipo.

Estados: `EN_COLA` → `ENTREGADO` → `CONFIRMADO` o `FALLIDO`; `EN_COLA` y `ENTREGADO` vencen automáticamente según su plazo. Los ACK repetidos de comandos terminados son idempotentes.

## Endpoints

- Panel (JWT de administración): `POST /api/gateway/commands`, `GET /api/gateway/commands/:id`.
- Gateway (secreto separado): `GET /api/gateway/queue/pending?limit=10`, `POST /api/gateway/queue/:id/ack`.
- El timeout aceptado es de 5 a 120 segundos; el valor inicial es 15.
- Tipos aceptados: `CONFIGURAR_NODO`, `CONFIGURAR_REGLA_ACTUADOR`, `CAMBIAR_ESTADO_TAREA`, `REGISTRAR_COMPONENTE`, `ACTUALIZAR_COMPONENTE`, `ELIMINAR_COMPONENTE`.

Configure `GATEWAY_API_KEY` como secreto largo e independiente en el entorno del backend y del gateway. Los endpoints del gateway responden `503` si la clave no está configurada. No incluya el secreto en el frontend.

## Pendiente para integrar firmware

La ruta que guarda o edita reglas y componentes todavía no encola comandos automáticamente. Al conectar el gateway, cada flujo que deba cambiar el equipo tendrá que encolar primero, esperar el ACK y solo después actualizar el estado aplicado en la plataforma. Un registro descriptivo local (por ejemplo, crear la ficha de un nodo) no debe presentarse como instalación física ni como confirmación de hardware.
