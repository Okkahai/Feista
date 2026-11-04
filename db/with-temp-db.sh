#!/usr/bin/env bash
# Run a command against a migrated throwaway database: `db/with-temp-db.sh <cmd...>`.
# Uses $DATABASE_URL if set (CI service; must be a superuser on a disposable DB), else starts a temporary local cluster.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  bin=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
  tmp=$(mktemp -d)
  trap '"$bin/pg_ctl" -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf -- "$tmp"' EXIT
  if [[ $(id -u) -eq 0 ]]; then chown postgres "$tmp"; fi
  run() { if [[ $(id -u) -eq 0 ]]; then su postgres -c "$*"; else bash -c "$*"; fi; }
  run "$bin/initdb -D $tmp/data -U postgres -A trust >/dev/null"
  run "$bin/pg_ctl -D $tmp/data -o '-k $tmp -p 54329 -c listen_addresses=' -l $tmp/log start >/dev/null"
  export DATABASE_URL="postgresql://postgres@/postgres?host=$tmp&port=54329"
fi
for f in "$here"/migrations/*.sql; do psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
"$@"
