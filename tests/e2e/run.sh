#!/usr/bin/env bash
# Runs the browser tests against their own database and dev server, so they
# never touch the data in your development database or need your dev server
# stopped.
#
#   tests/e2e/run.sh [screenshot-dir]
#
# Needs the local Postgres container (docker compose up -d) and Chromium.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${E2E_PORT:-3210}"
OUT="${1:-tests/e2e/out}"
set -a; source .env; set +a

E2E_DB="events_e2e"
ADMIN_URL="$DATABASE_URL"
export DATABASE_URL="${DATABASE_URL%/*}/$E2E_DB"

echo "› Preparing database $E2E_DB"
docker compose exec -T db psql -U events -d events -q \
  -c "DROP DATABASE IF EXISTS $E2E_DB WITH (FORCE)" -c "CREATE DATABASE $E2E_DB" >/dev/null
pnpm --silent db:migrate >/dev/null
pnpm --silent db:seed >/dev/null

export NEXT_DIST_DIR=".next-e2e"
export NEXT_PUBLIC_APP_URL="http://localhost:$PORT" BETTER_AUTH_URL="http://localhost:$PORT"
export ALLOW_DEV_LOGIN="true" ADMIN_EMAILS="admin@example.com" EMAIL_PROVIDER="console"
# Force simulated payments and the dev login, whatever .env has configured.
export RAZORPAY_KEY_ID="" RAZORPAY_KEY_SECRET="" GOOGLE_CLIENT_ID="" GOOGLE_CLIENT_SECRET=""

echo "› Starting test server on port $PORT"
pnpm exec next dev -p "$PORT" >"${TMPDIR:-/tmp}/events-e2e-server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; DATABASE_URL="$ADMIN_URL" true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT" && break; sleep 1; done

export BASE_URL="http://localhost:$PORT"
node tests/e2e/smoke.mjs "$OUT"
node tests/e2e/admin.mjs "$OUT"
