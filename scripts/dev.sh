#!/usr/bin/env bash
# dev.sh — 同時啟動前後端開發伺服器
# Ctrl+C 會同時終止兩個進程
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo ""
  echo "[dev] 停止所有開發伺服器..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "[dev] 結束"
}
trap cleanup INT TERM

echo "[dev] 啟動後端..."
"$ROOT_DIR/scripts/dev-backend.sh" &
BACKEND_PID=$!

# 等後端起來再啟動前端，避免前端啟動時 API 尚未就緒
sleep 2

echo "[dev] 啟動前端..."
"$ROOT_DIR/scripts/dev-frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "  後端 → http://localhost:8000/docs"
echo "  前端 → http://localhost:3100"
echo ""
echo "  Ctrl+C 同時停止兩個服務"
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
