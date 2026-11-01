#!/usr/bin/env bash
# Promptly Edge Function'larını deploy eder (yalnızca elle / "Deploy Edge Functions"
# workflow'u çalıştırır; Pages deploy'una bağlı DEĞİL).
#
# Gerekli ortam değişkenleri (repoya yazılmaz):
#   SUPABASE_ACCESS_TOKEN  Supabase kişisel erişim token'ı
#   SUPABASE_PROJECT_REF   hedef proje referansı
# Eksikse hiçbir şey deploy edilmez ve betik hata ile çıkar.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is not set}"

cd "$(dirname "$0")/.."

# İsteğe bağlı tek hedef: `./scripts/deploy-functions.sh api` yalnız o fonksiyonu deploy eder (varsayılan: hepsi).
# Tek fonksiyon deploy'u canlıdaki diğer fonksiyonlara dokunmaz (kaynakları canlı sürümle karşılaştırılmadı — CLAUDE.md §9).
TARGET="${1:-all}"
case "$TARGET" in
  all|analyze-image|cleanup-orphan-storage|delete-account|username-login|api|mcp) ;;
  *) echo "Unknown function: $TARGET" >&2; exit 1 ;;
esac
want() { [ "$TARGET" = all ] || [ "$TARGET" = "$1" ]; }

# JWT doğrulaması AÇIK kalanlar (supabase/config.toml ile aynı).
want analyze-image && supabase functions deploy analyze-image --project-ref "$SUPABASE_PROJECT_REF"
want cleanup-orphan-storage && supabase functions deploy cleanup-orphan-storage --project-ref "$SUPABASE_PROJECT_REF"
want delete-account && supabase functions deploy delete-account --project-ref "$SUPABASE_PROJECT_REF"

# Giriş yapmamış kullanıcı çağırdığı için JWT doğrulaması yalnızca burada kapalı.
want username-login && supabase functions deploy username-login --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"

# Açık API: oturumsuz okuma, JWT doğrulaması kapalı. Önce çekirdeğin kopyası güncel mi bak (`_shared/promptly`).
if want api; then
  node scripts/sync-function-shared.mjs --check
  supabase functions deploy api --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
fi

# İnternet üzerinden çalışan MCP: oturumsuz okuma, JWT doğrulaması kapalı. Kopyaların (_shared/promptly + mcp/{server,remote}.ts) güncelliği yukarıdaki
# `--check` ile aynı betikten denetlenir; npm bağımlılıkları `supabase/functions/mcp/deno.json` import map'inden gelir.
if want mcp; then
  node scripts/sync-function-shared.mjs --check
  supabase functions deploy mcp --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
fi
