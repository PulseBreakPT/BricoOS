#!/usr/bin/env bash
# =============================================================================
# Brico2 — Setup completo num único comando (Hostinger VPS / Ubuntu)
# =============================================================================
# O QUE FAZ:
#   1. Instala Docker Engine + Compose (se faltar).
#   2. Verifica se as portas 80/443 já estão ocupadas por outro stack Docker
#      (ex.: o projeto "lusoraecrime").
#   3. Gera deploy/.env.production com segredos seguros (se ainda não existir).
#   4. Faz build e arranca todo o stack: MongoDB + FastAPI + Caddy (HTTPS auto).
#   5. Espera o backend ficar saudável e instala o comando global `brico2`.
#
# PRÉ-REQUISITOS:
#   - Ubuntu 22.04/24.04, acesso root (ou sudo).
#   - Portas 80 e 443 livres (sem CloudPanel/Nginx/Apache do host).
#   - DNS do domínio a apontar para o IP deste VPS.
#
# USO:
#   sudo bash deploy/hostinger-setup.sh
#
#   # ou com domínio/email personalizados:
#   sudo SITE_DOMAIN=lusorae.pt ACME_EMAIL=eu@exemplo.pt bash deploy/hostinger-setup.sh
# =============================================================================

set -euo pipefail

SITE_DOMAIN="${SITE_DOMAIN:-lusorae.pt}"
ACME_EMAIL="${ACME_EMAIL:-dr.stormania@gmail.com}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
ENV_FILE="${DEPLOY_DIR}/.env.production"

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✅ %s\033[0m\n' "$*"; }
err()  { printf '\n\033[1;31m❌ %s\033[0m\n' "$*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  err "Corre como root:  sudo bash deploy/hostinger-setup.sh"
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. Docker
# -----------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker já instalado: $(docker --version)"
else
  log "A instalar Docker Engine + Compose…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker instalado: $(docker --version)"
fi

# -----------------------------------------------------------------------------
# 1b. Portas 80/443 já ocupadas por outro stack? (ex.: lusoraecrime)
# -----------------------------------------------------------------------------
BUSY_CONTAINERS="$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E ':80->|:443->' | grep -v '^brico2-' || true)"
if [[ -n "$BUSY_CONTAINERS" ]]; then
  err "As portas 80/443 já estão ocupadas por outro stack Docker:"
  echo "$BUSY_CONTAINERS"
  echo
  BUSY_PROJECTS="$(docker ps --format '{{.Names}}' --filter 'publish=80' --filter 'publish=443' 2>/dev/null \
    | xargs -r -I{} docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' {} 2>/dev/null \
    | sort -u | grep -v '^brico2$' || true)"
  if [[ -n "$BUSY_PROJECTS" ]]; then
    echo "   Pertencem ao(s) projeto(s) Docker Compose: ${BUSY_PROJECTS}"
    echo "   Pára-o(s) primeiro (não apaga volumes/dados) com:"
    while IFS= read -r p; do
      echo "     docker compose -p ${p} down"
    done <<< "$BUSY_PROJECTS"
  else
    echo "   Identifica o stack (docker ps -a) e pára-o com 'docker compose -p <nome> down'"
    echo "   ou 'docker stop <container>' antes de continuar."
  fi
  echo
  echo "   Depois volta a correr este script."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1c. Swap — evita OOM no build do React em VPS com pouca RAM (<3 GB).
# -----------------------------------------------------------------------------
TOTAL_RAM_MB="$(free -m | awk '/^Mem:/{print $2}')"
HAS_SWAP="$(free -m | awk '/^Swap:/{print $2}')"
if [[ "${TOTAL_RAM_MB:-0}" -lt 3000 && "${HAS_SWAP:-0}" -lt 1024 && ! -f /swapfile ]]; then
  log "RAM baixa (${TOTAL_RAM_MB} MB) e sem swap — a criar swapfile de 2 GB…"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap de 2 GB ativo."
fi

# -----------------------------------------------------------------------------
# 2. .env.production (gera segredos se faltar)
# -----------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  ok ".env.production já existe — a reutilizar (não sobrescrevo segredos)."
else
  log "A gerar .env.production com segredos seguros…"
  MONGO_PW="$(openssl rand -hex 24)"

  cat > "$ENV_FILE" <<EOF
APP_ENV=production
SITE_DOMAIN=${SITE_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

MONGO_INITDB_ROOT_USERNAME=brico2_admin
MONGO_INITDB_ROOT_PASSWORD=${MONGO_PW}
MONGO_URL=mongodb://brico2_admin:${MONGO_PW}@mongo:27017/?authSource=admin
DB_NAME=brico2
BACKEND_PORT=8001

CORS_ORIGINS=https://${SITE_DOMAIN}
PUBLIC_BASE_URL=https://${SITE_DOMAIN}

# --- Gmail por SMTP (recomendado): palavra-passe de aplicação ---------------
# Gera em https://myaccount.google.com/apppasswords (requer 2FA ativa).
GMAIL_SMTP_USER=
GMAIL_SMTP_APP_PASSWORD=

# --- Gmail por OAuth (alternativa): credenciais do Google Cloud Console -----
# Redirect URI a registar: https://${SITE_DOMAIN}/api/oauth/gmail/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# --- IA (opcional): chave OpenAI/Emergent -----------------------------------
OPENAI_API_KEY=
AI_MODEL=gpt-5.4

# Arquivar automaticamente pedidos inativos há mais de N meses.
AUTO_CLOSE_MONTHS=6
EOF
  chmod 600 "$ENV_FILE"
  ok ".env.production criado."
  echo
  echo "   Nota: para ativares o envio de emails pelo Gmail, edita"
  echo "   ${ENV_FILE} e preenche GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET,"
  echo "   depois corre:  brico2 backend"
fi

# -----------------------------------------------------------------------------
# 3. Build + arranque
# -----------------------------------------------------------------------------
log "A construir e arrancar o stack (pode demorar 5-8 min na 1.ª vez)…"
cd "$DEPLOY_DIR"
docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans mongo backend web autoheal

# -----------------------------------------------------------------------------
# 4. Health check do backend
# -----------------------------------------------------------------------------
log "A aguardar o backend ficar saudável…"
HEALTHY=0
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:8001/api/" >/dev/null 2>&1; then
    HEALTHY=1
    ok "Backend OK (tentativa $i)."
    break
  fi
  sleep 3
done

if [[ "$HEALTHY" -ne 1 ]]; then
  err "Backend não respondeu em ~3 min. Últimos logs:"
  docker compose --env-file "$ENV_FILE" logs --tail=60 backend
  exit 2
fi

# -----------------------------------------------------------------------------
# 5. Instala comando global `brico2`
# -----------------------------------------------------------------------------
APP_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
cat > /usr/local/bin/brico2 <<BRICO2
#!/usr/bin/env bash
# Atualiza o Brico2: git pull (PR merge mais recente em main) + rebuild.
# Por omissão só reconstrói o(s) serviço(s) cujos ficheiros mudaram desde
# a última vez (backend/ → API, frontend/ → site) — muito mais rápido
# quando um PR só mexe num dos dois lados.
# Uso:
#   sudo brico2          — atualiza e reconstrói só o que mudou
#   sudo brico2 backend  — força só a API
#   sudo brico2 web      — força só o frontend
#   sudo brico2 all      — força os dois, mesmo sem alterações relevantes
set -euo pipefail
APP_DIR="$APP_ROOT"
COMPOSE_FILE="\$APP_DIR/deploy/docker-compose.yml"
ENV_FILE="$ENV_FILE"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "\$*"; }
ok()  { printf '\033[1;32m✅ %s\033[0m\n' "\$*"; }
err() { printf '\n\033[1;31m❌ %s\033[0m\n' "\$*" >&2; exit 1; }

FORCE="\${*:-}"  # "backend", "web", "all", ou vazio = auto-deteta pelo git diff

cd "\$APP_DIR"

OLD_REV="\$(git rev-parse HEAD)"
log "A puxar código mais recente do GitHub..."
git fetch origin main
git reset --hard origin/main
NEW_REV="\$(git rev-parse HEAD)"
ok "Código: \$(git log -1 --pretty='%h — %s')"

if [[ "\$FORCE" == "all" ]]; then
  SERVICES="backend web"
elif [[ -n "\$FORCE" ]]; then
  SERVICES="\$FORCE"
elif [[ "\$OLD_REV" == "\$NEW_REV" ]]; then
  SERVICES=""
  ok "Já estava atualizado (\$(git log -1 --pretty='%h')) — nada para reconstruir."
else
  CHANGED="\$(git diff --name-only "\$OLD_REV" "\$NEW_REV")"
  NEED_BACKEND=0; NEED_WEB=0
  if echo "\$CHANGED" | grep -qE '^(backend/|deploy/backend/)'; then NEED_BACKEND=1; fi
  if echo "\$CHANGED" | grep -qE '^(frontend/|deploy/frontend/)'; then NEED_WEB=1; fi
  if echo "\$CHANGED" | grep -qE '^deploy/Caddyfile\$'; then NEED_WEB=1; fi
  # Ficheiros partilhados (compose, este script) — mais seguro reconstruir os dois.
  if echo "\$CHANGED" | grep -qE '^deploy/(docker-compose\.yml|hostinger-setup\.sh)\$'; then NEED_BACKEND=1; NEED_WEB=1; fi
  SERVICES=""
  [[ "\$NEED_BACKEND" == 1 ]] && SERVICES="\$SERVICES backend"
  [[ "\$NEED_WEB" == 1 ]] && SERVICES="\$SERVICES web"
  SERVICES="\$(echo \$SERVICES)"  # limpa espaços a mais
  if [[ -z "\$SERVICES" ]]; then
    ok "Só mudaram ficheiros fora de backend/ ou frontend/ — nada para reconstruir."
  fi
fi

if [[ -n "\$SERVICES" ]]; then
  log "A reconstruir: \$SERVICES..."
  docker compose -f "\$COMPOSE_FILE" --env-file "\$ENV_FILE" up -d --build --remove-orphans \$SERVICES

  if [[ "\$SERVICES" == *backend* ]]; then
    log "A aguardar backend ficar saudável (máx 3 min)..."
    for i in \$(seq 1 36); do
      if curl -fsS "http://127.0.0.1:8001/api/" >/dev/null 2>&1; then
        ok "Backend saudável (tentativa \$i)"
        break
      fi
      if [ "\$i" -eq 36 ]; then
        err "Backend não respondeu em 3 min. Últimos logs:\$(docker compose -f "\$COMPOSE_FILE" --env-file "\$ENV_FILE" logs --tail=50 backend)"
      fi
      sleep 5
    done
  fi

  echo ""
  docker compose -f "\$COMPOSE_FILE" --env-file "\$ENV_FILE" ps
fi

echo ""
ok "Deploy concluído em \$(date '+%H:%M:%S')."
BRICO2
chmod +x /usr/local/bin/brico2
ok "Comando 'brico2' instalado — corre a partir de qualquer diretória."

# -----------------------------------------------------------------------------
# 6. Estado final
# -----------------------------------------------------------------------------
echo
docker compose --env-file "$ENV_FILE" ps
echo
ok "Stack a correr."
echo
echo "   🌐 Site:  https://${SITE_DOMAIN}"
echo
echo "   O Caddy emite o certificado HTTPS no 1.º acesso (pode demorar ~30s)."
echo "   Se vires erro de certificado, confirma que ${SITE_DOMAIN} resolve"
echo "   para o IP deste VPS e que as portas 80/443 estão abertas."
echo
echo "   Ver logs:     docker compose --env-file ${ENV_FILE} logs -f"
echo "   Reiniciar:    docker compose --env-file ${ENV_FILE} restart"
echo "   Atualizar:    brico2"
