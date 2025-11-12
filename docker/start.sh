#!/usr/bin/env bash
set -euo pipefail

function cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${NGINX_PID:-}" ]]; then
    kill "${NGINX_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

mkdir -p /app/data

cd /app/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd /app/frontend
export PORT=${FRONTEND_PORT:-3000}
export HOSTNAME=0.0.0.0
node server.js &
FRONTEND_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

wait -n "${BACKEND_PID}" "${FRONTEND_PID}" "${NGINX_PID}"
