# Invernadero UABC

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io/)

## 1. Configura tus variables de entorno

Copia `.env.example` como `.env` en la raíz del proyecto y ajusta las contraseñas:

```bash
cp .env.example .env
```

## 2. Desarrollo

Levanta todos los servicios con hot reload:

```bash
pnpm run dev
```

| Servicio | URL                              |
| -------- | -------------------------------- |
| Frontend | http://localhost:3000            |
| Backend  | http://localhost:4000/api/health |
| MySQL    | localhost:3307                   |

### Comandos de desarrollo

| Acción                                                | Comando                         |
| ----------------------------------------------------- | ------------------------------- |
| Levantar (primera vez o tras cambiar dependencias)    | `pnpm run dev:build`            |
| Resetear todo (borra datos de MySQL y reconstruye)    | `pnpm run dev:fresh`            |
| Apagar todos los contenedores                         | `pnpm run dev:down`             |
| Ver logs de todos los servicios                       | `pnpm run dev:logs`             |
| Ver logs solo del frontend                            | `pnpm run dev:logs:frontend`    |
| Ver logs solo del backend                             | `pnpm run dev:logs:backend`     |
| Ver estado de los contenedores                        | `pnpm run dev:ps`               |
| Reiniciar el frontend                                 | `pnpm run dev:restart:frontend` |
| Reiniciar el backend                                  | `pnpm run dev:restart:backend`  |
| Reconstruir solo el frontend (tras instalar paquetes) | `pnpm run dev:rebuild:frontend` |
| Reconstruir solo el backend (tras instalar paquetes)  | `pnpm run dev:rebuild:backend`  |

### ¿Cuándo usar cada comando?

- **Día a día** → `pnpm run dev`
- **Instalaste un paquete con pnpm en frontend o backend** → `pnpm run dev:rebuild:frontend` o `pnpm run dev:rebuild:backend`
- **Algo está raro y quieres empezar de cero** → `pnpm run dev:fresh` (⚠️ borra los datos de MySQL)

## 3. Producción

```bash
pnpm run prod
```

| Acción                         | Comando                 |
| ------------------------------ | ----------------------- |
| Levantar en producción         | `pnpm run prod`         |
| Ver logs                       | `pnpm run prod:logs`    |
| Apagar                         | `pnpm run prod:down`    |
| Apagar y borrar datos de MySQL | `pnpm run prod:down -v` |

## 4. Comandos útiles de Docker

| Acción                               | Comando                                   |
| ------------------------------------ | ----------------------------------------- |
| Entrar a la terminal del backend     | `docker compose exec backend sh`          |
| Conectarse a MySQL desde la terminal | `docker compose exec db mysql -u root -p` |
| Borrar imágenes y caché de Docker    | `docker system prune -a`                  |
