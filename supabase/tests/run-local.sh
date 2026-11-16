#!/usr/bin/env bash
# Temiz bir yerel PostgreSQL 16 veritabanına stub'ları + TÜM migration'ları sırayla oynatır,
# ardından (verilirse) test dosyalarını çalıştırır ve "FAIL" satırlarını sayar.
# Kullanım: PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/run-local.sh [test.sql …]
set -euo pipefail
TESTS=()
for t in "$@"; do TESTS+=("$(realpath "$t")"); done
cd "$(dirname "$0")/.."
DB=${DB:-promptly_test}
# Şablon veritabanı (docs/history/411-*): stub'lar + tüm migration'lar YALNIZ BİR KEZ oynatılır; her test `createdb -T` ile (~0,1 sn) o şablondan
# klonlanır. Eskiden her test dosyası migration'ları baştan oynatıyordu (~10–16 sn × 112 dosya ≈ 30 dk). Şablon adı stub + migration
# içeriğinin özetini taşır → migration değişince eski şablon kendiliğinden kullanılmaz. PROMPTLY_NO_TEMPLATE=1 eski davranışı (her seferinde baştan) verir.
if [ "${PROMPTLY_NO_TEMPLATE:-}" = 1 ]; then
  TPL=""
else
  TPL="promptly_tpl_$(cat tests/_local-stubs.sql migrations/*.sql | sha1sum | cut -c1-12)"
fi
build_schema() {
  local target=$1
  psql -q -v ON_ERROR_STOP=1 -d "$target" -f tests/_local-stubs.sql >/dev/null
  for f in migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$target" -f "$f" >/dev/null 2>/tmp/migration-err-$$.txt || { echo "MIGRATION FAILED: $f"; cat /tmp/migration-err-$$.txt; return 1; }
  done
  # İstatistik toplanmadan klonlanan veritabanında planlayıcı kör kalır: storage.objects politikalı sorgular 5–10 sn, tek bir test dosyası 2–3 dk
  # sürüyordu. Şablonda bir kez ANALYZE, bütün klonlara geçer (pg_statistic kopyalanır).
  psql -q -v ON_ERROR_STOP=1 -d "$target" -c "analyze" >/dev/null
}
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
if [ -z "$TPL" ]; then
  createdb "$DB"
  build_schema "$DB" || exit 1
else
  if ! psql -d postgres -tAc "select 1 from pg_database where datname='$TPL'" | grep -q 1; then
    # Önce geçici adla kurulup bitince yeniden adlandırılır: yarım kalmış bir şablon asla kullanılmaz.
    tmp="${TPL}_build_$$"
    dropdb --if-exists "$tmp" >/dev/null 2>&1 || true
    createdb "$tmp"
    build_schema "$tmp" || { dropdb --if-exists "$tmp" >/dev/null 2>&1; exit 1; }
    psql -q -d postgres -c "alter database \"$tmp\" rename to \"$TPL\"" >/dev/null
  fi
  createdb -T "$TPL" "$DB"
fi
echo "migrations OK"
# Eski topluluk fixture'ları 'private' düzeyi kurar; canlıda bu düzey yeni girişe kapalıdır (20261112100000). Yalnız test veritabanında açılır.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "alter database \"$DB\" set promptly.allow_private_community = 'on'" >/dev/null
for t in "${TESTS[@]}"; do
  echo "== $t"
  psql -d "$DB" -f "$t" 2>&1 | grep -E "FAIL|ERROR" | head -60
done
