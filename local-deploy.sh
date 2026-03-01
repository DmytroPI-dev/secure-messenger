#!/bin/bash

set -euo pipefail

# Load secrets from .env (gitignored). Copy .env.example to .env and fill in values.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -o allexport
  # shellcheck source=.env
  source "$SCRIPT_DIR/.env"
  set +o allexport
else
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in your values." >&2
  exit 1
fi

# --- CONFIGURATION ---
REMOTE_HOST="${REMOTE_HOST}"
REMOTE_USER="${REMOTE_USER}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
REMOTE_TMP="${REMOTE_TMP:-/root/deploy-tmp}"
REMOTE_BACKEND_PATH="${REMOTE_BACKEND_PATH:-/usr/local/bin/messenger-backend}"
REMOTE_FRONTEND_PATH="${REMOTE_FRONTEND_PATH:-/var/www/weather}"

export VITE_TURN_SERVER="${VITE_TURN_SERVER}"
export VITE_TURN_USERNAME="${VITE_TURN_USERNAME}"
export VITE_TURN_PASSWORD="${VITE_TURN_PASSWORD}"
export CORS_ORIGIN="${CORS_ORIGIN}"

echo "Starting local build and deploy for black-sea.org..."

# --- 1. CLEANUP LOCAL ---
rm -rf ./dist-temp
mkdir -p ./dist-temp

# --- 2. BUILD BACKEND (Go) ---
echo "Building Go backend for Linux AMD64..."
pushd backend >/dev/null
GOOS=linux GOARCH=amd64 go build -o ../dist-temp/messenger-backend .
popd >/dev/null

# --- 3. BUILD FRONTEND (Node/Vite) ---
echo "Building frontend..."
pushd frontend >/dev/null
npm ci
npm run build
cp -r dist/. ../dist-temp/
popd >/dev/null

# --- 4. TRANSFER TO VPS ---
echo "Uploading build artifacts to VPS..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p '$REMOTE_TMP' '$REMOTE_FRONTEND_PATH'"
scp -i "$SSH_KEY" -r ./dist-temp/. "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP/"

# --- 5. REMOTE PRODUCTION SWAP ---
echo "Installing artifacts and restarting services..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
    "REMOTE_TMP='$REMOTE_TMP' REMOTE_BACKEND_PATH='$REMOTE_BACKEND_PATH' REMOTE_FRONTEND_PATH='$REMOTE_FRONTEND_PATH' CORS_ORIGIN='$CORS_ORIGIN' bash -s" <<'EOF'
set -euo pipefail

systemctl stop messenger-backend || true

mkdir -p /etc/systemd/system/messenger-backend.service.d
printf '[Service]\nEnvironment="CORS_ORIGIN=%s"\n' "$CORS_ORIGIN" \
  > /etc/systemd/system/messenger-backend.service.d/cors.conf
systemctl daemon-reload

install -m 0755 "$REMOTE_TMP/messenger-backend" "$REMOTE_BACKEND_PATH"

find "$REMOTE_FRONTEND_PATH" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -r "$REMOTE_TMP"/. "$REMOTE_FRONTEND_PATH"/
rm -f "$REMOTE_FRONTEND_PATH/messenger-backend"
rm -rf "$REMOTE_TMP"

systemctl start messenger-backend
systemctl reload nginx
curl --fail --silent http://127.0.0.1:8080/health >/dev/null

echo "Deployment successful."
EOF