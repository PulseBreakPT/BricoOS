#!/usr/bin/env bash
# =============================================================================
# Brico2 — Backup do MongoDB (stack Docker)
# =============================================================================
# - mongodump --archive --gzip dentro do container 'brico2-mongo'.
# - Guarda em /var/backups/brico2/mongo/YYYY-MM-DD_HHMM.archive.gz
# - Retenção: 14 dias.
#
# Uso manual:
#   sudo bash deploy/scripts/backup-mongo.sh
#
# Cron diário (03:30) — ver deploy/README.md secção "Backups".
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env.production"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/brico2/mongo}"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="${BACKUP_DIR}/${STAMP}.archive.gz"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE não existe."
  exit 1
fi

set -a; source "$ENV_FILE"; set +a

mkdir -p "$BACKUP_DIR"

echo "▶ Backup Mongo → $OUT"
docker exec brico2-mongo mongodump \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --archive --gzip > "$OUT"

chmod 0640 "$OUT"

find "$BACKUP_DIR" -name '*.archive.gz' -mtime +14 -delete

echo "✅ Backup OK: $(ls -lh "$OUT" | awk '{print $5, $9}')"
echo
echo "   Restaurar:"
echo "   docker exec -i brico2-mongo mongorestore --username \$MONGO_INITDB_ROOT_USERNAME \\"
echo "     --password \$MONGO_INITDB_ROOT_PASSWORD --authenticationDatabase admin \\"
echo "     --archive --gzip --drop < $OUT"
