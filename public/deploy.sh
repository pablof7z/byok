#!/usr/bin/env sh
set -eu

MODE="${1:-home}"
REPO_URL="${BYOK_REPO_URL:-https://github.com/pablof7z/byok.git}"
TARGET_DIR="${BYOK_DIR:-$HOME/byok}"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

say() {
  printf '%s\n' "$*"
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "Missing required command: $1"
    exit 1
  fi
}

secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"
  fi
}

ensure_env_line() {
  file="$1"
  name="$2"
  value="$3"
  if [ -z "$value" ]; then
    return
  fi
  if [ -f "$file" ] && grep -q "^$name=" "$file"; then
    return
  fi
  umask 077
  printf '%s=%s\n' "$name" "$value" >> "$file"
}

prompt_optional() {
  name="$1"
  label="$2"
  eval "current=\${$name:-}"
  if [ -n "$current" ]; then
    printf '%s' "$current"
    return
  fi
  if [ -r /dev/tty ]; then
    printf '%s (optional, press return to skip): ' "$label" > /dev/tty
    IFS= read -r answer < /dev/tty || answer=""
    printf '%s' "$answer"
    return
  fi
  printf ''
}

run_vercel() {
  if command -v vercel >/dev/null 2>&1; then
    vercel "$@"
  else
    npx --yes vercel "$@"
  fi
}

add_vercel_env() {
  name="$1"
  value="$2"
  if [ -z "$value" ]; then
    return
  fi
  if printf '%s\n' "$value" | run_vercel env add "$name" production >/dev/null 2>&1; then
    say "Added Vercel production env $name"
  else
    say "Skipped Vercel env $name; it may already exist."
  fi
}

if [ "$MODE" = "local" ]; then
  MODE="home"
fi

if [ "$MODE" != "home" ] && [ "$MODE" != "vercel" ]; then
  say "Usage:"
  say "  curl -fsSL https://byok.f7z.io/deploy.sh | sh"
  say "  curl -fsSL https://byok.f7z.io/deploy.sh | sh -s -- vercel"
  exit 1
fi

need git
need node
need npm

if [ -d "$TARGET_DIR/.git" ]; then
  say "Updating BYOK in $TARGET_DIR"
  git -C "$TARGET_DIR" pull --ff-only
else
  if [ -e "$TARGET_DIR" ] && [ "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')" != "0" ]; then
    say "$TARGET_DIR already exists and is not an empty git checkout."
    say "Set BYOK_DIR to another path or move the existing directory."
    exit 1
  fi
  say "Cloning BYOK into $TARGET_DIR"
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"
npm install --omit=dev

token_secret="${BYOK_TOKEN_SECRET:-$(secret)}"
ensure_env_line ".env.local" "BYOK_TOKEN_SECRET" "$token_secret"

if [ "$MODE" = "home" ]; then
  ensure_env_line ".env.local" "BYOK_PUBLIC_ORIGIN" "http://localhost:$PORT"
  say "Starting BYOK at http://localhost:$PORT"
  exec npm run start -- --host "$HOST" --port "$PORT"
fi

blob_token="$(prompt_optional BLOB_READ_WRITE_TOKEN "Vercel Blob read/write token")"
blob_access="$(prompt_optional BYOK_BLOB_ACCESS "Vercel Blob access mode: private or public")"
github_client_id="$(prompt_optional GITHUB_CLIENT_ID "GitHub OAuth client ID")"
github_client_secret="$(prompt_optional GITHUB_CLIENT_SECRET "GitHub OAuth client secret")"

run_vercel link
add_vercel_env "BYOK_TOKEN_SECRET" "$token_secret"
add_vercel_env "BLOB_READ_WRITE_TOKEN" "$blob_token"
add_vercel_env "BYOK_BLOB_ACCESS" "$blob_access"
add_vercel_env "GITHUB_CLIENT_ID" "$github_client_id"
add_vercel_env "GITHUB_CLIENT_SECRET" "$github_client_secret"

say "Deploying BYOK to Vercel production"
run_vercel deploy --prod --yes
