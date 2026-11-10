# syntax=docker/dockerfile:1

# Etapa 1: Node e ferramentas de desenvolvimento existem apenas durante o build.
FROM node:24-alpine AS build
WORKDIR /app

# Copiar os manifestos primeiro preserva esta camada quando só o código muda.
COPY frontend/package.json frontend/package-lock.json ./
# npm ci respeita o lockfile; o cache de downloads não entra na imagem final.
# As devDependencies são necessárias para executar o Vite nesta etapa.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY frontend/ ./
COPY shared/ /shared/
RUN npm run build
COPY backend/ /backend/

# Etapa 2: Alpine + Nginx sem privilégios de root para servir arquivos estáticos.
# Node, npm, node_modules e código-fonte ficam fora da imagem final.
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
USER nginx

# EXPOSE documenta a porta; a publicação é feita com docker run -p 8080:8080.
EXPOSE 8080

# wget já está presente na base Alpine, dispensando instalar curl.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

# O processo principal permanece em primeiro plano para o Docker gerenciá-lo.
CMD ["nginx", "-g", "daemon off;"]
