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

# JWT doğrulaması AÇIK kalanlar (supabase/config.toml ile aynı).
supabase functions deploy analyze-image --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy cleanup-orphan-storage --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy delete-account --project-ref "$SUPABASE_PROJECT_REF"

# Giriş yapmamış kullanıcı çağırdığı için JWT doğrulaması yalnızca burada kapalı.
supabase functions deploy username-login --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
