#!/usr/bin/env bash
# Apply migrations to a throwaway database and run the SQL tests.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
exec "$here/with-temp-db.sh" bash -c 'psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$0"' "$here/tests/rls_test.sql"
