#!/usr/bin/env bash
# dev.sh — 同時啟動前後端開發伺服器
# Ctrl+C 會同時終止兩個進程
#
# 參數會原樣轉給 dev-backend.sh，例如：
#   ./scripts/dev.sh            後端連本機 data/dev.db
#   ./scripts/dev.sh --reset    先用最新備份重建 data/dev.db
#   ./scripts/dev.sh -PROD      後端連正式 DB（需輸入 PROD 確認）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 後端在背景執行時讀不到鍵盤輸入，-PROD 的確認改在這裡做
for arg in "$@"; do
  case "$arg" in
    -PROD|--PROD|-prod|--prod)
      echo ""
      echo "  ⚠️  正式環境模式：後端將連線 .env 的 DATABASE_URL（正式 DB）"
      echo "      啟動時會對正式 DB 執行 migration；所有操作都會寫入正式資料。"
      echo ""
      read -r -p "  輸入 PROD 確認繼續：" answer
      if [ "$answer" != "PROD" ]; then
        echo "[dev] 已取消"
        exit 1
      fi
      export PROD_CONFIRMED=1
      ;;
  esac
done

cleanup() {
  echo ""
  echo "[dev] 停止所有開發伺服器..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "[dev] 結束"
}
trap cleanup INT TERM

echo "[dev] 啟動後端..."
"$ROOT_DIR/scripts/dev-backend.sh" "$@" &
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
