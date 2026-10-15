#!/usr/bin/env bash
# Temiz bir yerel PostgreSQL 16 veritabanına stub'ları + TÜM migration'ları sırayla oynatır,
# ardından (verilirse) test dosyalarını çalıştırır ve "FAIL" satırlarını sayar.
# Kullanım: PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/run-local.sh [test.sql …]
set -euo pipefail
TESTS=()
for t in "$@"; do TESTS+=("$(realpath "$t")"); done
cd "$(dirname "$0")/.."
DB=${DB:-promptly_test}
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/_local-stubs.sql >/dev/null
for f in migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>/tmp/migration-err.txt || { echo "MIGRATION FAILED: $f"; cat /tmp/migration-err.txt; exit 1; }
done
echo "migrations OK"
for t in "${TESTS[@]}"; do
  echo "== $t"
  psql -d "$DB" -f "$t" 2>&1 | grep -E "FAIL|ERROR" | head -60
done
