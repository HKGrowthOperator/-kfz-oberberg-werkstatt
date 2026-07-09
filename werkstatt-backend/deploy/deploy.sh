#!/usr/bin/env bash
# ============================================================================
#  deploy.sh — auf dem VPS ausführen (manuell oder aus der CI/CD-Pipeline).
#  Holt den neuesten Stand aus git und startet den Stack neu.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/kfz-oberberg-werkstatt}"

cd "$REPO_DIR"
echo "→ git pull"
git pull --ff-only

cd werkstatt-backend/deploy
echo "→ docker compose up -d --build"
docker compose up -d --build

echo "→ alte Images aufräumen"
docker image prune -f

echo "✓ Deploy abgeschlossen: $(date)"
docker compose ps
