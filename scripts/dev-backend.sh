#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
export DATABASE_URL="${DATABASE_URL:-}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"

echo "[backend] Starting FastAPI on http://localhost:8000"
uvicorn app.main:app --reload --port 8000
