# Entornos Docker

El proyecto tiene tres configuraciones para tareas distintas:

- `../docker-compose.dev.yml`: trabajo diario con recarga automática.
- `../docker-compose.yml`: despliegue habitual con servicios internos.
- `local-test.compose.yml`: complemento aislado para revisión visual con datos sintéticos.

Los comandos de desarrollo y despliegue están disponibles como scripts de `pnpm` en el README principal. Para la revisión aislada, consulta [Revisión local](../docs/PRUEBAS_LOCALES.md).

Usa el archivo `.env` local para credenciales. No subas ese archivo ni copies valores reales en esta guía. Al apagar entornos de prueba, evita `down -v` si necesitas conservar sus datos.
