# Servicio de la aplicación

El backend conecta la interfaz con la base de datos. Atiende las consultas y cambios de ubicaciones, nodos, lecturas, tareas y gateways.

## Uso local

El backend se inicia junto con el resto del proyecto usando las instrucciones de la [raíz](../README.md). La dirección local de salud es `http://localhost:4000/api/health` en el entorno de desarrollo normal.

Las pruebas disponibles se ejecutan dentro de esta carpeta:

```bash
npm test
```

## Referencias

- [Contrato de comunicación con gateways](../docs/API_GATEWAY_V1.md)
- [Contexto y funciones de la aplicación](../docs/CONTEXTO_APLICACION.md)

Las claves de administrador y de gateway se configuran mediante variables de entorno. No se deben guardar credenciales reales en el repositorio.
