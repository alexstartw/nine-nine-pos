#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  echo "[frontend] Installing npm dependencies..."
  npm install
fi

export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}"
DEV_HOST="${DEV_HOST:-127.0.0.1}"
DEV_PORT="${DEV_PORT:-3100}"

echo "[frontend] Starting Next.js dev server on http://${DEV_HOST}:${DEV_PORT}"
npm run dev -- --hostname "$DEV_HOST" --port "$DEV_PORT"
