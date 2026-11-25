# Revisión local

El archivo `docker/local-test.compose.yml` complementa el Compose principal y permite levantar una copia aislada para revisar cambios sin sustituir el entorno habitual del proyecto.

En la configuración actual, la interfaz se abre en `http://localhost:3012`, la API en `http://localhost:4012/api/health` y MySQL queda en el puerto local `3312`. Este entorno carga datos de demostración para que se puedan revisar distintos nodos, lecturas y estados.

Los datos son sintéticos: no representan sensores conectados ni deben usarse para tomar decisiones de cultivo. La copia usa contenedores y almacenamiento separados del entorno normal. Antes de cambiar sus puertos, datos o almacenamiento, revisa el archivo Compose y confirma qué instancia está activa.

Desde la raíz del proyecto, levanta la copia aislada con:

```bash
docker compose -p invernadero-cima-audit -f docker-compose.yml -f docker/local-test.compose.yml up --build -d
```

Para detenerla sin borrar sus datos:

```bash
docker compose -p invernadero-cima-audit -f docker-compose.yml -f docker/local-test.compose.yml down
```

No agregues `-v` al apagar si quieres conservar la base de datos de revisión. No guardes contraseñas ni claves reales en este documento.
