# Revisión local

El archivo `docker-compose.local-test.yml` permite levantar una copia aislada para revisar cambios sin sustituir el entorno habitual del proyecto.

En la configuración actual, la interfaz se abre en `http://localhost:3012`, la API en `http://localhost:4012/api/health` y MySQL queda en el puerto local `3312`. Este entorno carga datos de demostración para que se puedan revisar distintos nodos, lecturas y estados.

Los datos son sintéticos: no representan sensores conectados ni deben usarse para tomar decisiones de cultivo. La copia usa contenedores y almacenamiento separados del entorno normal. Antes de cambiar sus puertos, datos o almacenamiento, revisa el archivo Compose y confirma qué instancia está activa.

Para levantar el entorno, usa Docker Compose desde la raíz con `docker-compose.yml` y `docker-compose.local-test.yml`. No guardes contraseñas ni claves reales en este documento.
