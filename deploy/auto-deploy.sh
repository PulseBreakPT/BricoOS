#!/usr/bin/env bash
# =============================================================================
# Brico2 — Deploy manual (alternativa ao comando `brico2`)
# =============================================================================
# Corre este script no VPS para puxar o código mais recente (o PR merge mais
# recente em main) e fazer rebuild.
#
# Uso:
#   bash deploy/auto-deploy.sh
#   bash deploy/auto-deploy.sh --branch main
# =============================================================================

set -euo pipefail

BRANCH="${1:---branch}"
if [[ "$BRANCH" == "--branch" ]]; then
    BRANCH="${2:-main}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"

log()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✅ %s\033[0m\n' "$*"; }
err()  { printf '\n\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
    err "Ficheiro $ENV_FILE não encontrado. Corre primeiro: sudo bash deploy/hostinger-setup.sh"
fi

cd "$APP_DIR"

log "A puxar branch '$BRANCH'..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
ok "Código atualizado: $(git log -1 --pretty='%h %s')"

log "A fazer build e restart dos containers..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --build --remove-orphans
ok "Containers reconstruídos"

log "A aguardar backend ficar saudável (máx 2 min)..."
for i in $(seq 1 24); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' brico2-backend 2>/dev/null || echo "unknown")
    if [[ "$STATUS" == "healthy" ]]; then
        ok "Backend saudável"
        break
    fi
    if [[ "$i" -eq 24 ]]; then
        err "Backend não ficou saudável. Logs:\n$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" logs --tail=50 backend)"
    fi
    sleep 5
done

log "Estado atual:"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$ENV_FILE" ps

echo ""
ok "Deploy concluído. Versão: $(git log -1 --pretty='%h — %s (%ci)')"
