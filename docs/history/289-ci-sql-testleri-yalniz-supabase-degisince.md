# 289 — CI: SQL testleri yalnızca `supabase/` (ya da `ci.yml`) değişince koşar

**Durum:** uygulandı (yalnız `.github/workflows/ci.yml`). Karar adımının betiği gerçek bir birleşim commit'iyle yerelde sınandı (arayüz / SQL / ci.yml / belge / fark
okunamıyor / taban ilerlemiş). Gerçek GitHub Actions'ta bu PR'ın kendisi `ci.yml`'i değiştirdiği için SQL testleri KOŞAR; atlama yolunun ilk gerçek kanıtı bir sonraki
yalnız-arayüz PR'ıdır.

## Neden
Ölçüm (PR #382, 2026-10-31): `database` işi 9 dk 11 sn, bunun 8 dk 53 sn'si "Replay migrations and run SQL tests" adımı (`checks` 2 dk 22 sn, `ui` 5 dk 03 sn). `run-local.sh`
her test dosyası için (48 adet) temiz bir veritabanı açıp 155 migration'ı (1,8 MB SQL) baştan oynatıyor (~11 sn/test). Bir değişiklik için bekleme ≈ PR 9 dk + dağıtım 3–4,5 dk.
Yalnız arayüz değiştiren PR'lar da bu 9 dakikayı bekliyordu.

## Ne değişti
- `database` işi HER ZAMAN çalışır ve başarı bildirir (atlanmış/`skipped` sayılmaz → zorunlu kontrol tanımlansa bile birleştirmeyi kilitlemez); `fetch-depth: 2` ile checkout.
- Yeni adım "Decide whether SQL tests are needed": `git diff --name-only HEAD^1 HEAD` (pull_request çıkışı = taban + PR birleşimi; fark = yalnız bu PR) → dosyalardan biri `supabase/` ya da
  `.github/workflows/ci.yml` ise `run=true`, değilse `false`. **Fark okunamazsa güvenli yol: testler koşar** (uyarı yazar).
- "Replay migrations and run SQL tests" adımı `if: steps.changes.outputs.run == 'true'`.

## Kurallar / sınırlar
- SQL testlerinin bağlı olduğu yeni bir klasör/dosya (örn. `supabase/` dışında bir migration kaynağı) eklenirse regex'e eklenmeli.
- `deploy.yml` (main'e itme) DEĞİŞMEDİ: lint/tsc/test + canlı migration + smoke test + build orada aynen koşar; SQL testleri zaten yalnız PR'da vardı.
- Bu, tek başına süreyi ~9 dk kısaltır (yalnız-arayüz PR'ları için); SQL değişince süre aynı. Bunun için ayrı öneri: şablon veritabanı (`createdb -T`) ile migration'ları bir kez oynatmak (yapılmadı).
