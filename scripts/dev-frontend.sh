#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ ! -d node_modules ]; then
  echo "[frontend] Installing npm dependencies..."
  npm install
fi

export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}"

echo "[frontend] Starting Next.js dev server on http://localhost:3000"
npm run dev -- --port 3000
