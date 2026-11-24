# 458 — Hub: düz başlık yüzeyi (Yön D "Merkez", hafif uygulama)

**Karar (kullanıcı):** mockup'ta seçilen "D · Merkez" (ağır/stabil) uygulanacak, ama **hafif** ve **etkisiz** (işlev/veri değişmeden). Yalnız istemci görünümü; migration YOK, yeni metin YOK (i18n değişmedi).

## Ne değişti
- `HubHeader` (yeni, `hub-kit.tsx`): `HubBand` + sekmeler tek düz beyaz yüzeyde, sayfa kenarına kadar uzanır, altında tek ince çizgi; sekmelerin kendi alt çizgisi şeffaflaşır. Spaces, Topluluklar ve Ekipler ana sayfaları bandı + sekmeleri bununla sarar.
- `HubBand` simge karosu üç alanda aynı nötr tonda (`tone` imzası korunur, renk taşımaz).
- `HubDetailBand`: renkli `primary-soft` zemin ve kapaktan bulanık arka plan kalktı → `card-flat` düz yüzey; `backdrop` prop'u eski çağıranlar için kabul edilir, yok sayılır. `TeamBand` `BAND_TONE` hepsi `bg-surface`.

## Bilerek yapılmadı (mockup'ta var, ayrı iş)
Özet şeridi (4 kutu), liste ekranlarının tabloya çevrilmesi, Topluluklar/Ekipler listelerinin tablo görünümü, ray/telefon menüsü değişikliği (mevcut kabuk korunur).

## Doğrulama
`npx tsc --noEmit`, `npx eslint` (hub/spaces/communities/teams), `npm test` (1542 geçti), `next build --webpack` temiz; ağ taklitli ekran görüntüsü (`tests/design/screens.mjs` kesiti) ile üç sayfa masaüstü/tablet/telefon gözle kontrol edildi. Playwright UI paketleri (`run-*.mjs`) ve gerçek Supabase/cihaz DENENMEDİ.
