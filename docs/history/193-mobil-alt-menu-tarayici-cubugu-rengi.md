# 193 — Mobil alt menü: tarayıcı araç çubuğunun arkası menüyle aynı renk

**Durum:** istemci kodu `claude/mobile-nav-fill` dalında; **gerçek iPhone Safari'de DENENMEDİ** (sandbox yüzen araç çubuğunu taklit edemez). Veritabanı değişikliği yok.

## Sorun
Instagram'da (iOS Safari) alt sekme çubuğu ile Safari'nin yüzen araç çubuğunun arkası aynı beyazdır. Promptly'de alt menü yarı saydam yüzey rengiydi (`bg-surface/90` + bulanıklık); menünün bittiği yerin altında kalan, tarayıcı çubuğunun arkasındaki şerit ise sayfa zemininin (`bg-background`, bej/gri) rengiyle görünüyordu.

## Yapılan
- `components/layout/mobile-nav.tsx`: menü artık **opak** `bg-surface`; ayrıca `after:` ile aynı renk ekran kenarının altına doğru uzar (`top-full`, `h-[50vh]`, tıklamayı engellemez).
- `app/globals.css`: yalnız telefonda (< md) `html` arka planı `--color-surface` — sayfanın boyamadığı her yer (aşırı kaydırma, tarayıcı çubuğunun altındaki şerit) menüyle aynı renk. `body` hâlâ `--color-background`; kartlar/sayfa görünümü değişmedi.
- Renkler yalnız token'lardan gelir: her palet ve açık/koyu modda otomatik eşleşir (390px'te ölçüldü: Meydan açık, Meydan koyu, Kum — menü = `::after` = `html`).

## Sınama
`tsc`, `lint` (eski 4 uyarı), `next build` temiz; 390px'te hesaplanan renkler ve ekran görüntüsü; yatay taşma yok; menünün alt kenarı ekranın alt kenarında. Kullanıcı yeni sürümü iPhone'da kontrol edecek — olmazsa sıradaki ayar: `theme-color` meta'sını mobilde menü rengine çekmek.

## Çeviri
Yeni metin yok.
