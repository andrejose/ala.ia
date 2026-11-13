# =============================================================================
# Ala.ia em um contêiner só: a API (Node + Express) entrega também as telas
# (React, já compiladas), no mesmo endereço. Usado pelo Coolify para publicar
# em https://ala.andrejose.com.br (ver docs/publicacao.md).
# O banco continua no Supabase: o contêiner só precisa das variáveis
# SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.
# =============================================================================

# 1. Telas: compila o frontend (frontend/dist)
FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. API: só as dependências de produção
FROM node:24-alpine AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3. Imagem final: Node, a API e as telas compiladas
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/frontend/dist
WORKDIR /app/backend
COPY --from=backend /app/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Sem root dentro do contêiner
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
