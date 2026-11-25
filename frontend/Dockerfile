# Etapa 1: construir la app de React
FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Variable de entorno usada por Create React App durante el build
# (CRA "hornea" las variables REACT_APP_* dentro del bundle final)
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ARG REACT_APP_LOCAL_TEST_MODE=false
ENV REACT_APP_LOCAL_TEST_MODE=$REACT_APP_LOCAL_TEST_MODE

RUN pnpm run build

# Etapa 2: servir los archivos estáticos con nginx
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
