#!/usr/bin/env bash
# Load test of the entrance: athletes opening their tickets while organisers
# scan QR codes. It runs against a production build on its own port with its
# own database, so your development data and dev server are never touched.
#
#   tests/load/run.sh [gate|busy|heavy|extreme ...]
#
#   gate     a large event's gate rush (default): ~17 page loads/s and 4 scans/s for a minute
#   busy     ten times a realistic gate
#   heavy    150 athletes refreshing non-stop and 12 scanners with no pauses
#   extreme  400 athletes and 30 scanners, to see how it behaves when overloaded
#
# Needs the local Postgres container (docker compose up -d).
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${LOAD_PORT:-3220}"
export LOAD_DB="events_load"
export LOAD_DATA="${TMPDIR:-/tmp}/events-load-data.json"
set -a; source .env; set +a
export DATABASE_URL="${DATABASE_URL%/*}/$LOAD_DB"
export BASE_URL="http://localhost:$PORT" NEXT_PUBLIC_APP_URL="http://localhost:$PORT" BETTER_AUTH_URL="http://localhost:$PORT"
export NEXT_DIST_DIR=".next-load" ADMIN_EMAILS="" EMAIL_PROVIDER="console"

echo "› Preparing database $LOAD_DB (400 athletes with tickets, 6,000 tickets to scan)"
docker compose exec -T db psql -U events -d events -q \
  -c "DROP DATABASE IF EXISTS $LOAD_DB WITH (FORCE)" -c "CREATE DATABASE $LOAD_DB" >/dev/null 2>&1
pnpm --silent db:migrate >/dev/null
# Accounts are created through the app's own sign-up, which is only allowed outside production.
ALLOW_DEV_LOGIN=true OUT="$LOAD_DATA" node --conditions=react-server --import tsx tests/load/seed.ts

echo "› Building a production copy"
ALLOW_DEV_LOGIN=false pnpm exec next build >/dev/null
export SCAN_ACTION
SCAN_ACTION=$(node -e '
  const m = require("./.next-load/server/server-reference-manifest.json").node;
  console.log(Object.keys(m).find((id) => m[id].exportedName === "scanTicketAction"));')

echo "› Starting it on port $PORT"
NODE_ENV=production node node_modules/next/dist/bin/next start -p "$PORT" >"${TMPDIR:-/tmp}/events-load-server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE_URL" && break; sleep 0.5; done

for stage in "${@:-gate}"; do
  node tests/load/gate.mjs "$stage"
done
