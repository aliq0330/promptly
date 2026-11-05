-- ci:allow-destructive
-- Tek kimlik, Aşama 4 (contract) — docs/history/341-*, 342-*.
--
-- Site artık tek paletlidir (341): istemci `profiles.theme_palette`'i okumaz/yazmaz (`lib/supabase/profiles.ts`, `PreferencesSync`).
-- Bu migration sütunu ve onun CHECK kısıtını siler. Kullanıcı onayı: "kalan aşamaların hepsini … 4 aşamayı birden merge" (2026-11-06).
--
-- Kontrol edildi (repo taraması): hiçbir SQL fonksiyonu, politika, tetikleyici, görünüm, test (`supabase/tests`), Edge Function, betik
-- (`scripts/smoke-test.mjs` dahil) ya da istemci sorgusu bu sütuna başvurmuyor; sütun düzeyindeki SELECT yetkisi (302) sütunla birlikte gider.
-- Silinen veri yalnız eski palet tercihidir (meydan/mono/lavender/ocean/forest/sand); başka hiçbir şey ona bağlı değil.
--
-- Geçiş penceresi: deploy hattı bu migration'ı yeni site yayınlanmadan ÖNCE uygular. O birkaç dakikada (ve yenilenmemiş açık sekmelerde) ESKİ
-- istemcinin tercih okuması hata alır → `fetchOwnPreferences` null döner (mod/dil yerel değerde kalır); yazma `console.error` verir. Görünür
-- bir kırılma yok; sayfa yenilenince yeni istemci sütunu hiç istemez.

alter table public.profiles drop constraint if exists profiles_theme_palette_check;
alter table public.profiles drop column if exists theme_palette;
