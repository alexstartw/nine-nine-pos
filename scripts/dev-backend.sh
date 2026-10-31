#!/usr/bin/env bash
# dev-backend.sh — 啟動本機 FastAPI 開發伺服器
#
# 預設連「本機 SQLite」，不會碰正式環境。要連正式 DB 必須明確加 -PROD。
#
# 用法：
#   ./scripts/dev-backend.sh              本機模式：使用 data/dev.db（不存在時自動從最新備份複製）
#   ./scripts/dev-backend.sh --reset      本機模式：先用最新備份 data/app_YYYY-MM-DD.db 覆蓋 data/dev.db
#   ./scripts/dev-backend.sh --db PATH    本機模式：直接使用指定的 SQLite 檔
#   ./scripts/dev-backend.sh -PROD        正式模式：使用 .env 的 DATABASE_URL（需輸入 PROD 確認）
#   ./scripts/dev-backend.sh -h           顯示說明
#
# 為什麼用 dev.db 而不是直接開備份檔：開發時的寫入（測試結帳、改資料）只會進 dev.db，
# 備份檔保持原樣，隨時可以 --reset 回到乾淨狀態。
#
# 注意：後端啟動時 init_db() 會對連線的 DB 執行 migration（_ensure_*），
# 所以 -PROD 不只是「讀」正式資料，啟動當下就可能改到正式 DB 的 schema。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
DEV_DB="$DATA_DIR/dev.db"
# 記錄 dev.db 是從哪個備份複製來的，用來判斷是否有更新的備份
DEV_DB_SOURCE="$DATA_DIR/dev.db.source"

MODE="local"
RESET=0
CUSTOM_DB=""

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    -PROD|--PROD|-prod|--prod)
      MODE="prod"
      ;;
    --reset)
      RESET=1
      ;;
    --db)
      if [ $# -lt 2 ]; then
        echo "[backend] --db 需要指定 SQLite 檔案路徑" >&2
        exit 1
      fi
      CUSTOM_DB="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[backend] 未知參數：$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$MODE" = "prod" ] && { [ "$RESET" = 1 ] || [ -n "$CUSTOM_DB" ]; }; then
  echo "[backend] -PROD 不能和 --reset / --db 一起使用" >&2
  exit 1
fi

# ── 決定 DATABASE_URL ─────────────────────────────────────────────────────────
latest_backup() {
  # 備份檔名為 app_YYYY-MM-DD.db，字典序即日期序
  ls -1 "$DATA_DIR"/app_????-??-??.db 2>/dev/null | sort | tail -n 1
}

if [ "$MODE" = "prod" ]; then
  # 不 export DATABASE_URL，讓 pydantic-settings 從 .env 讀取正式連線
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "[backend] 忽略 shell 中的 DATABASE_URL，-PROD 一律使用 .env 設定"
    unset DATABASE_URL
  fi
  echo ""
  echo "  ⚠️  正式環境模式：後端將連線 .env 的 DATABASE_URL（正式 DB）"
  echo "      啟動時會對正式 DB 執行 migration；所有操作都會寫入正式資料。"
  echo ""
  if [ "${PROD_CONFIRMED:-}" = "1" ]; then
    echo "  （已由 dev.sh 確認）"
  elif [ -t 0 ]; then
    read -r -p "  輸入 PROD 確認繼續：" answer
    if [ "$answer" != "PROD" ]; then
      echo "[backend] 已取消"
      exit 1
    fi
  else
    echo "[backend] 非互動環境無法確認 -PROD，已取消" >&2
    exit 1
  fi
else
  if [ -n "$CUSTOM_DB" ]; then
    DB_FILE="$CUSTOM_DB"
    if [ ! -f "$DB_FILE" ]; then
      echo "[backend] 找不到 SQLite 檔：$DB_FILE" >&2
      exit 1
    fi
  else
    DB_FILE="$DEV_DB"
    if [ "$RESET" = 1 ] || [ ! -f "$DB_FILE" ]; then
      BACKUP="$(latest_backup)"
      if [ -z "$BACKUP" ]; then
        echo "[backend] data/ 底下找不到備份檔 app_YYYY-MM-DD.db" >&2
        echo "          請先在系統側邊欄按「備份」，或用 --db 指定 SQLite 檔" >&2
        exit 1
      fi
      cp "$BACKUP" "$DB_FILE"
      basename "$BACKUP" > "$DEV_DB_SOURCE"
      echo "[backend] 已從 $(basename "$BACKUP") 建立 data/dev.db"
    fi
  fi

  # 轉成絕對路徑，避免 cd 之後相對路徑失效
  DB_FILE="$(cd "$(dirname "$DB_FILE")" && pwd)/$(basename "$DB_FILE")"

  # 一律覆蓋：即使 shell 或 .env 有正式 DATABASE_URL，本機模式也不會連過去
  export DATABASE_URL="sqlite:///$DB_FILE"
  echo "[backend] 本機模式：$DATABASE_URL"

  if [ -z "$CUSTOM_DB" ]; then
    NEWEST="$(latest_backup)"
    SOURCE="$(cat "$DEV_DB_SOURCE" 2>/dev/null || echo "未知")"
    echo "[backend] dev.db 來源：$SOURCE"
    if [ -n "$NEWEST" ] && [ "$(basename "$NEWEST")" != "$SOURCE" ]; then
      echo "[backend] 提示：有較新的備份 $(basename "$NEWEST")，可加 --reset 套用"
    fi
  fi
fi

# ── Python 環境 ───────────────────────────────────────────────────────────────
cd "$ROOT_DIR/backend"

CONDA_ENV_NAME="${CONDA_ENV_NAME:-about-nine}"

activate_conda() {
  if ! command -v conda >/dev/null 2>&1; then
    echo "[backend] conda command not found; please install Miniconda/Anaconda or set CONDA_ENV_NAME= to skip." >&2
    return 1
  fi

  # shellcheck disable=SC1091
  eval "$(conda shell.bash hook)"

  if ! conda env list | awk '{print $1}' | grep -Fxq "$CONDA_ENV_NAME"; then
    echo "[backend] Conda environment '$CONDA_ENV_NAME' not found. Set CONDA_ENV_NAME to an existing env." >&2
    return 1
  fi

  echo "[backend] Activating conda env '$CONDA_ENV_NAME'"
  conda activate "$CONDA_ENV_NAME"
}

if ! activate_conda; then
  echo "[backend] Falling back to local virtualenv '.venv'"
  if [ ! -d .venv ]; then
    python3 -m venv .venv
  fi
  if [ -d .venv/bin ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
  elif [ -d .venv/Scripts ]; then
    # shellcheck disable=SC1091
    source .venv/Scripts/activate
  else
    echo "[backend] Unable to locate virtualenv activation script" >&2
    exit 1
  fi
fi

pip install -r requirements.txt

export APP_NAME="${APP_NAME:-about-nine² POS API}"
export API_PREFIX="${API_PREFIX:-/api}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100}"

echo "[backend] Starting FastAPI on http://localhost:8000 (mode: $MODE)"
uvicorn app.main:app --reload --port 8000
