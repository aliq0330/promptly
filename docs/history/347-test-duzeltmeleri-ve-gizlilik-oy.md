# 347 — Test düzeltmeleri + Gizlilik'te "Çalıştı mı?" oyu (2026-11-06)

"Sence ek özellik eklemeli miyiz" sorusu üzerine açık işler taranıp önce küçük borçlar kapatıldı; yeni özellik eklenmedi.

## Yapılanlar
- **`run-feed-filters` senaryo 1:** regex'e `Ayar [Pp]aketleri` zaten eklenmişti (`b37b4f7`); yeniden çalıştırıldı, 18/18.
- **`run-space-comments` senaryo 4:** düşme nedeni sabit tarihli fixture DEĞİL, `rename.getByText("Önce")` alt dizi eşleşmesiydi. Etkinlikler
  2026-09-20 tarihli olduğundan ekranda "1 ay önce" gibi bir metin çıkıyor, `getByText` strict-mode ihlali veriyordu. `"Önce"` ve `"Sonra"`
  için `{ exact: true }` kullanıldı; 10/10. (Yeni testte göreli zaman metniyle çakışabilecek kısa etiketleri `exact` ile ara.)
- **Gizlilik Politikası:** 341'deki açık karar yazıya döküldü — "Profilin ve içeriklerin" maddesine "Çalıştı mı?" oyunun kendisinin gizli, ama
  o promptta yorum/sonuç bırakılmışsa rozet olarak herkese görünür olduğu cümlesi eklendi (TR+EN); `PRIVACY_UPDATED` 6 Kasım 2026.
  `TERMS_VERSION` DEĞİŞMEDİ (Koşullar değişmedi, "güncellendi" bandı çıkmaz). **Hukuki danışmandan geçmedi**; kararı sahibi onaylamalı.

## Doğrulama
`npx tsc --noEmit` temiz, `npm run lint` 0 hata (15 uyarı, önceden var), `npm test` 956/956, `run-space-comments` 10/10, `run-feed-filters` 18/18
(ağ taklitli Playwright; gerçek Supabase/cihaz DENENMEDİ). Çeviri: yeni arayüz metni yok, yalnız yasal metin (TR+EN birlikte).

## Bilerek yapılmayanlar
- **E-posta/push haftalık özet:** dış servis + gizli anahtar ister; sahibinin karar/kurulumu olmadan yapılmaz.
- **Gerçek ortam denemeleri** (iOS Safari Odak, Realtime private kanallar, claude.ai/ChatGPT bağlayıcıları, Telegram): sandbox `*.supabase.co`'ya
  ve gerçek cihaza erişemez.
