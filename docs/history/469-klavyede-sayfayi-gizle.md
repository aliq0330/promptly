# 469 — Klavye açıkken pencerenin arkasındaki sayfa gizlenir (468'in devamı)

## Sorun

468 sonrası adres hapının çevresi pencere rengine boyandı, ama iOS 26 Safari'nin SAYDAM Otomatik Doldur çubuğunun (˄ ˅ ✓)
arkasında hâlâ sayfadan görseller/kartlar görünüyordu.

## Neden

O çubuk düzen görünümünün dışında durur. WebKit `fixed` katmanları (gölgesi dahil) düzen görünümüne kırpar, o şeritte belgenin
kendisini gösterir; 468'deki gölge yayılımı oraya ulaşmaz.

## Çözüm

Telefonda (`< sm`) bir `Modal` klavye açıkken görünür alanın tamamını kapladığı için (`cover`, 378-*) bu sürede arkadaki sayfa
gerekmez. `globals.css`, `:has()` ile, yalnız CSS:

- `<body>`'nin doğrudan çocuğu `[data-keyboard-fit]` (sohbet paneli `="background"` hariç) varken `html` ve `body` zemini
  `--color-surface` olur;
- `<body>`'de o katmandan ÖNCE gelen her şey (uygulama ağacı, daha önce açılmış portal katmanları) `visibility: hidden` olur;
  katmandan SONRA açılanlar (içindeki menü, üstüne açılan pencere, bildirim kartı) görünür kalır.

Klavye kapanınca `Modal` özniteliği kaldırır, sayfa geri gelir. JS durum/sayaç yok.

## Test

Chromium'da (derlenmiş CSS) dört durum: önce görünür; klavyeli pencerede sayfa gizli + sonraki katman görünür + zemin yüzey;
sohbet paneli kipinde değişmez; geniş ekranda değişmez. tsc/lint/test/build temiz. Gerçek iOS cihazında denenmedi.
