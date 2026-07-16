# =============================================================================
# Brico2 frontend — build React (CRA/Craco) e servir via Caddy
# =============================================================================
# Stage 1: compila o React para ficheiros estáticos.
# Stage 2: Caddy serve os estáticos + faz reverse-proxy de /api para o
#          backend, com HTTPS automático (Let's Encrypt, zero config).
#
# Nota: o package.json fixa "packageManager": "yarn@1.22.22" e usa o campo
# "resolutions" (só respeitado pelo Yarn, ignorado pelo npm) para forçar
# versões compatíveis de deps transitivas. O build tem de ser sempre com Yarn.
# frontend/src/lib/api.js lê REACT_APP_BACKEND_URL em build-time — por isso o
# SITE_DOMAIN tem de ser conhecido no momento do build.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — Build
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build

WORKDIR /app

ENV CI=false \
    GENERATE_SOURCEMAP=false \
    DISABLE_ESLINT_PLUGIN=true \
    NODE_OPTIONS=--max-old-space-size=2048

# Sem yarn.lock no repositório — instala a partir do package.json.
# (Se um dia adicionares yarn.lock, muda para: yarn install --frozen-lockfile)
COPY frontend/package.json ./
RUN yarn install --network-timeout 300000

COPY frontend/ ./

ARG SITE_DOMAIN=lusorae.pt
ENV REACT_APP_BACKEND_URL=https://${SITE_DOMAIN}

RUN yarn build

# -----------------------------------------------------------------------------
# Stage 2 — Runtime (Caddy)
# -----------------------------------------------------------------------------
FROM caddy:2-alpine

COPY --from=build /app/build /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
