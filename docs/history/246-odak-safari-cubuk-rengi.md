# 246 — Odak: iOS Safari alt araç çubuğunun arkası açık temada beyaz kalıyordu

**Durum:** uygulandı, ama iPhone'da yetmedi — yerini `247-*` aldı (tüm site koyu moda geçer).

(Eski durum:) uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 30/30: açıkken belge `color-scheme: dark`, kapanınca `light`). **Gerçek iPhone Safari'de DENENMEDİ** (sandbox yüzen araç çubuğunu çizemez) — kullanıcı cihazda doğrulayacak.

## Sorun
Kullanıcı ekran görüntüsü: Odak (hep koyu sahne) açıkken, sitenin teması AÇIK ise Safari'nin yüzen alt araç çubuğunun arkası ve çubuğun kendisi beyaz; tema KOYU ise siyah. Hikâye görüntüleyicide üç tur boyama (`198-*`) bunu çözmemişti.

## Neden (ölçüm)
Odak açıkken açık temada belge ölçüldü: `html`/`body` arka planı doğru biçimde `rgb(10,10,13)` (koyu sahne, satır içi), ama `getComputedStyle(html).colorScheme` **`light`**. Sahnenin `.dark` sınıfı yalnız kendi alt ağacını kapsar; belge düzeyindeki `color-scheme` yalnız `html.dark` iken `dark` olur. iOS Safari kendi çubuklarını (yüzen araç çubuğu ve arkasındaki şerit) belgenin `color-scheme`'ine göre açık/koyu çizer; renk boyaması (`html`/`body`/`theme-color`, 198) bunu etkilemez. Koyu temada site zaten `color-scheme: dark` olduğu için çubuk siyahtı.

## Yapılan
- `globals.css`: `html[data-focus-open] { color-scheme: dark; }` — Odak açıkken belge koyu şemada, kapanınca `data-focus-open` kalkar ve eski şemaya döner (`useFullScreenChrome` zaten özniteliği koyup kaldırıyordu).
- Odak sahnesine `[color-scheme:dark]` (yerel form öğeleri/kaydırma çubukları da koyu).
- Test: `run-focus-feed` senaryo 2 (açıkken `dark`) ve 11 (kapanınca `light`).

## Bilinçli sınırlar / olmazsa sıradaki adım
- Hikâye görüntüleyiciye UYGULANMADI: metin hikâyeleri açık "kâğıt" zeminli olabilir, koyu şema oraya uymaz (hikâye zemin rengine göre şema seçmek ayrı iş).
- iOS Safari alt şeridi hâlâ beyazsa sıradaki aday: sahnenin dışında, ekranın altına taşan ayrı `position: fixed` bir dolgu öğesi (`198-*` kenar uzantısı hilesi); Odak sahnesi `overflow-hidden` olduğundan uzantı sahnenin içine konamaz. Tam kapsamlı çözüm ana ekrana ekle (PWA, tarayıcı çubuğu yok).
