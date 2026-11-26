# 468 — Klavye açıkken pencerenin arkasında sayfa görünmesi

## Sorun

Telefonda (iOS 26 Safari) bir pencerede (`Modal`: "Öğeleri kopyala", yorum düzenleme, ad/etiket alanları…) yazmaya başlayınca
klavye açılıyor, pencere görünür alana oturuyor ama pencerenin ALTINDA — yüzen adres hapının ve "Otomatik Doldur" çubuğunun
şeridinde — arkadaki sayfa görünüyordu. Neredeyse bütün pencerelerde aynıydı.

## Neden

`Modal` (ve telefondaki tam ekran sohbet paneli) klavye açıkken `visualViewport`'a oturtuluyor (`top = offsetTop`,
`height = visualViewport.height`, docs/history/332-*, 378-*). iOS 26 Safari görünür alanı yüzen adres hapı / Otomatik Doldur
şeridini DIŞARIDA bırakarak bildiriyor (klavye kayarken de adım adım). Katmanın altında kalan düzen alanı boş kaldığı için sayfa
oradan görünüyordu; `cover` (opak zemin) yalnız katmanın kendi kutusunu boyuyordu.

## Çözüm (kökten, tek yerde)

- `globals.css` `[data-keyboard-fit]`: katmanın zemini gölge yayılımıyla (`box-shadow: 0 0 0 100vh …`) her yöne taşırılır — düzeni
  değiştirmez, tıklama almaz, kırpılmaz. Telefonda opak yüzey (`--color-surface`), daha geniş ekranda pencere karartısı
  (`--color-scrim`); sohbet paneli `data-keyboard-fit="background"` ile kendi zemin rengini (`--color-background`) taşır.
- `Modal` klavye açıkken (her varyant, `side` hariç) katmana `data-keyboard-fit` koyar; `useFitPanelToKeyboard` panel oturtulunca
  koyar, klavye kapanınca kaldırır.
- Ölçüm yanlış/eski kalsa bile artık arkadaki sayfa görünmez; başlık üstte, düğmeler görünür alanın altında kalır.
  Arama katmanı (`SearchOverlay`) zaten tüm ekranı kaplayan opak katmandı, değişmedi.

Kural: klavye açıkken görünür alana oturan yeni bir katman/panel yazarsan `data-keyboard-fit` ver (ya da `Modal` kullan).

## Test

Gerçek iOS klavyesi bu ortamda açılamaz; tsc/lint/test/build temiz. Fiziksel cihazda denenmedi.
