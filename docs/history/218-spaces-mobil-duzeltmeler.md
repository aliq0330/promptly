# 218 — Spaces mobil düzeltmeleri (klavye + pano menüleri)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Gerçek iPhone Safari'de DENENMEDİ — kullanıcı ekran görüntüleriyle bildirdi, düzeltme ağ taklitli Playwright'ta (sahte `visualViewport`) sınandı.

## Sorunlar (iPhone Safari, ekran görüntüleri)
1. **Yeni Space penceresi bozuk açılıyor:** başlık kutusu `autoFocus` olduğundan pencere açılır açılmaz ekran klavyesi çıkıyor; iOS'ta klavye düzen görünümünü küçültmediği için alttan açılan pencere klavyenin üstüne oturup başlığı ekranın üstünden dışarı taşıyordu (Oluştur düğmesi ortada, başlık yok).
2. **Panoda "+" menüsü kendi araç çubuğunun içinde kalıyor:** araç çubuğu yatay kaydırmalı (`overflow-x-auto`), menü `absolute` olduğundan kırpılıyor, yalnız ilk öğe ("Not") görünüyordu. Aynı kusur seçim çubuğundaki "Hizala ve düzenle" menüsünde de vardı.
3. **Seçim çubuğundaki düğmelerin işlevi belli değil** (açıklama cevaplandı; metin etiketi yok, simgeler `title`/`aria-label` taşır).

## Çözüm
- `lib/use-keyboard-viewport.ts` (`useKeyboardViewport`): ekran klavyesi açıkken (`visualViewport` ≥120 px küçülmüş) görünür alanın üstü + yüksekliği, yoksa `null`.
- `components/ui/modal.tsx`: klavye açıkken katman (`dialog`/`sheet` varyantları) tam ekran değil görünür alana oturur (`top`/`height` satır içi) — alt sayfa klavyenin üstünde, başlığı ekranda kalır; klavye kapanınca tam ekrana döner. `SpaceDialog` paneli de `maxHeight`'i görünür alana göre sınırlar.
- `TitleField autoFocus`: dokunmatik cihazda (`(pointer: coarse)`) kendiliğinden odak yok; kullanıcı kutuya dokununca klavye açılır ve pencere yukarıdaki kuralla sığar.
- `SpaceMenu`: menü `body`'ye taşınır (`createPortal`) ve `position: fixed` ile düğmeye göre konur; alta sığmazsa düğmenin ÜSTÜNE açılır, kenarlara sıkıştırılır, kaydırma/boyut değişince yeniden konur. Kart, bant, pano araç çubuğu ve seçim çubuğundaki tüm `SpaceMenu`'ler yararlanır.

## Test
`run-spaces` 30/30: senaryo 29 (telefonda "+" menüsü görünür alanda ve kırpılmadan tıklanır; "Hizala" menüsü ekranın içinde), senaryo 30 (sahte `visualViewport` ile klavye açılınca pencere görünür alana sığar, başlık ve Oluştur klavyenin üstünde, klavye kapanınca tam ekran; dokunmatikte başlık kendiliğinden odaklanmaz).
İngilizce karşılık: yeni görünür metin yok.

## Açık
Gerçek iOS Safari'de klavye açıkken pencerenin davranışı (özellikle iOS 26'nın yüzen araç çubuğu) denenmedi; `visualViewport` olayları sahte nesneyle sınandı.
