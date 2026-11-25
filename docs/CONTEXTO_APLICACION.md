# Contexto de la aplicación: Monitoreo del sitio / Invernadero

## 1. Propósito

La aplicación permite monitorear y configurar un sitio de cultivo o invernadero de forma local. Su objetivo es consultar lecturas ambientales, visualizar nodos en el plano de una ubicación, administrar dispositivos y configurar actuadores con reglas automáticas.

La aplicación se encuentra en una etapa local de desarrollo. Todavía no se conectará a datos reales de producción, pero la estructura debe quedar preparada para recibir información de nodos y actuadores físicos posteriormente.

## 2. Funcionalidades principales

### Inicio

- Muestra la ubicación seleccionada.
- Presenta el plano de la ubicación.
- Coloca los nodos según sus coordenadas registradas.
- Permite seleccionar un nodo para consultar información y últimas lecturas.
- Muestra datos actuales asociados a la ubicación seleccionada.
- Muestra la descripción, medidas e imagen general de la ubicación.

### Historial de datos

- Consulta lecturas registradas.
- Filtra por ubicación, nodo, tipo de dato, zona y rango de fechas.
- Permite paginar los resultados.
- Permite exportar los resultados a Excel.
- La exportación debe mostrar la ubicación en la parte superior, la cantidad de dispositivos y los filtros utilizados.
- El archivo debe tener una presentación visual clara y una tabla de Excel válida, sin reparaciones al abrirse.
- El nombre del archivo debe incluir la fecha y hora de generación.

### Nodos

- Permite registrar nodos para la plataforma.
- Permite editar la información del nodo.
- Permite asignar el nodo a una ubicación y zona.
- Permite consultar sensores, datos, batería, comunicación y posición.
- La dirección MAC debe mostrarse solamente durante la edición o en una vista administrativa.
- La MAC debe validarse siempre para impedir que dos nodos utilicen la misma dirección.
- El nodo puede cambiar de ubicación o zona posteriormente.
- El estado `Problemas o fallas (automático)` no debe poder seleccionarse manualmente; se calcula a partir de la operación del nodo.
- Los estados manuales disponibles son, según corresponda, `Operativo`, `Inactivo` y `En mantenimiento`.

### Dispositivos y tipos de datos

- Los dispositivos y sus tipos de datos son catálogos globales.
- No se deben duplicar dispositivos ni tipos de datos por cada ubicación.
- Un dispositivo puede generar uno o varios tipos de datos.
- La interfaz debe permitir seleccionar claramente la categoría, el nombre y los datos que genera.
- Los identificadores internos son datos administrativos y no deben mostrarse innecesariamente al usuario final.

### Ubicaciones y zonas

- Una ubicación representa un sitio completo.
- Cada ubicación tiene:
  - nombre;
  - identificador interno;
  - largo, ancho y altura;
  - descripción;
  - imagen general opcional;
  - imagen del plano de distribución opcional.
- Las medidas se manejan con un máximo de dos decimales.
- La imagen general representa la ubicación completa, no una zona individual.
- La imagen del plano representa la distribución donde se muestran todas las zonas.
- Una ubicación puede contener varias zonas.
- Las zonas tienen nombre, descripción y límites dentro del plano.
- No se debe añadir una imagen independiente para cada zona.
- El identificador de zona es interno y no debe mostrarse como información principal al usuario.
- Al seleccionar otra ubicación, deben actualizarse el plano, las zonas, los nodos, los datos y la descripción visibles.

### Actuadores y automatización

- Un actuador debe seleccionar explícitamente el dispositivo y el dato relacionado.
- Esto evita mezclar sensores independientes que tengan nombres parecidos.
- Un actuador puede tener varias condiciones.
- Por ahora todas las condiciones deben cumplirse utilizando lógica AND.
- La interfaz debe indicar claramente que todos los parámetros configurados deben cumplirse.
- Si uno de los sensores requeridos está inactivo, en mantenimiento o con problemas, la tarea debe quedar pausada.
- La interfaz debe mostrar qué condición está bloqueada y por qué.
- El usuario puede quitar la condición problemática si desea que la tarea vuelva a operar.
- `Problemas o fallas (automático)` se reserva para estados calculados; no debe ser una opción manual.
- Antes de enviar una orden al gateway, la interfaz debe mostrar un estado como `Procesando`, `Enviando configuración` o `Esperando confirmación`.
- El usuario debe recibir una confirmación de configuración recibida cuando el gateway responda.
- Debe evitarse enviar órdenes repetidas para no saturar el gateway.

## 3. Decisiones de diseño

La aplicación debe tener un diseño sencillo, profesional y orientado a la lectura de datos. No se busca una interfaz decorativa ni saturada.

### Principios visuales

- La información debe ser más importante que los adornos.
- Deben evitarse brillos, degradados fuertes y sombras excesivas.
- Las tarjetas deben funcionar como módulos independientes.
- Los títulos, filtros y acciones deben tener una jerarquía clara.
- Los botones principales deben ser visibles, pero no dominar la pantalla.
- Los estados deben comunicar su significado mediante texto, icono y color.
- El rojo debe reservarse para errores y situaciones que requieren atención.
- La interfaz debe tener buen comportamiento en escritorio y móvil.
- Los formularios deben estar divididos por secciones comprensibles.
- Los mensajes de error deben aparecer arriba y dirigir la atención al campo incorrecto.
- Los campos inválidos deben marcarse visualmente.

### Flujo general

1. El usuario selecciona una ubicación.
2. La aplicación conserva la selección al cambiar de pantalla.
3. Inicio, Datos, Nodos, Actuadores y Configuración consultan información de esa ubicación.
4. Los catálogos globales se mantienen independientes de las ubicaciones.
5. Los nodos y actuadores se relacionan con la ubicación mediante sus relaciones correspondientes.
6. Los filtros y exportaciones utilizan la ubicación seleccionada.

## 4. Arquitectura actual

### Frontend

- React.
- React Bootstrap.
- React Router.
- React Icons.
- Contextos principales:
  - `AuthContext`: autenticación local.
  - `LocationContext`: ubicación global seleccionada.
  - `SiteDimensionsContext`: medidas derivadas de la ubicación seleccionada.
- Componente reutilizable:
  - `LocationSelect`: selector común de ubicación.
- `AppErrorBoundary`: recuperación visual ante errores inesperados.
- `ui-system.css`: tokens visuales, superficies, controles, estados y responsive.

### Backend

- Node.js.
- Express.
- MySQL.
- JWT para autenticación.
- Docker Compose para ejecutar frontend, backend y base de datos localmente.

### URLs locales

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:4000`
- Salud del backend: `http://localhost:4000/api/health`

## 5. Estado actual de la base de datos local

Durante la revisión se encontraron aproximadamente:

- 2 ubicaciones.
- 6 zonas.
- 5 dispositivos.
- 12 sensores.
- 1 actuador.
- 9,579 lecturas.
- 2 reglas de actuadores.

No se requiere una migración para la primera fase de rediseño visual.

## 6. Trabajo realizado recientemente

- Se centralizó la selección de ubicación.
- Se eliminaron valores fijos que iniciaban siempre en la ubicación `1`.
- Se reutilizó el selector de ubicación entre pantallas.
- Se mejoró la navegación y el estado activo del menú.
- Se añadió un estado general de carga.
- Se añadió una pantalla de recuperación ante errores.
- Se incorporó una capa visual común.
- Se redujeron brillos, degradados y sombras para obtener una apariencia más profesional.
- Se ajustaron las tarjetas, filtros, encabezados y botones.
- Se corrigió la prueba frontend obsoleta.

## 7. Validaciones realizadas

- Pruebas frontend: correctas.
- Build frontend de producción: correcto.
- Pruebas backend: 8 de 8 correctas.
- Docker: frontend, backend y base de datos activos.
- API de salud: funcionando.
- `git diff --check`: sin errores de formato relevantes.

## 8. Pendientes técnicos importantes

Estos puntos no deben confundirse con el rediseño visual y requieren una fase posterior:

1. Asociar cada lectura con su sensor específico. Actualmente existen lecturas con `sensor_id` nulo.
2. Definir si se conservará el contexto histórico de ubicación, zona y posición al mover un nodo.
3. Incorporar autenticación específica para la recepción de lecturas del gateway.
4. Implementar roles reales si se requiere separar usuarios normales y administradores.
5. Conectar el flujo de comandos del gateway con la interfaz de actuadores.
6. Revisar las solicitudes múltiples de algunas pantallas para reducir llamadas innecesarias.
7. Considerar historial de cambios de nodos, ubicaciones, zonas y reglas.
8. Definir una política para lecturas atrasadas cuando un nodo permanece inactivo durante varios minutos.

## 9. Criterios para futuras modificaciones

Antes de cambiar una pantalla se debe:

1. Revisar el flujo completo y las relaciones con la base de datos.
2. Confirmar si el cambio es visual, funcional o estructural.
3. Evitar valores fijos y datos duplicados.
4. Reutilizar componentes y estilos existentes.
5. Mantener los estados automáticos fuera de los controles manuales.
6. Validar formularios en el servidor y en el cliente.
7. Probar el flujo con más de una ubicación, nodo, sensor y actuador.
8. Ejecutar pruebas frontend, backend y build de producción.
9. Confirmar que no se alteren datos históricos.
10. Crear commits separados por funcionalidad cuando el cambio esté revisado.

## 10. Regla general del proyecto

La aplicación debe ser clara para una persona que solamente necesita consultar el estado del sitio, pero también suficientemente flexible para una persona administradora que registra ubicaciones, zonas, nodos, sensores, actuadores y reglas automáticas.

La información debe provenir de la base de datos y actualizarse según la ubicación seleccionada. No deben dejarse textos, cantidades, identificadores o relaciones importantes escritos de forma fija en la interfaz.
