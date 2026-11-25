# Interfaz web

La interfaz permite consultar el sitio, sus nodos y lecturas, además de administrar la configuración y las tareas automáticas. Incluye vistas para usuario y administración, tema claro y oscuro, y adaptación a pantallas pequeñas.

## Uso local

El proyecto se ejecuta junto con la API y la base de datos desde la raíz. Consulta el [README principal](../README.md) para iniciar el entorno.

Si solo se necesita generar la versión lista para publicar, desde esta carpeta:

```bash
pnpm run build
```

## Secciones principales

- **Inicio:** plano del sitio, nodos y lecturas recientes.
- **Historial:** filtros, gráficas, tabla y exportación de lecturas.
- **Nodos:** inventario e información de cada nodo.
- **Tareas:** estado y reglas de actuadores.
- **Configuración:** ubicaciones, zonas, dispositivos y tipos de datos.
- **Administración de gateways:** vinculación y seguimiento de sincronización cuando está disponible para el usuario.

La interfaz consume los servicios del backend; no almacena la base de datos por su cuenta.
