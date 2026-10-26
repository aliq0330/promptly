# 247 — Odak açıkken TÜM site koyu moda geçer, kapanınca eski haline döner

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 32/32: 2, 11, 16, 31, 32). **Gerçek iPhone Safari'de DENENMEDİ.**

## Neden
`246-*` yalnız belge `color-scheme`'ini koyu yaptı; kullanıcı iPhone'da alt çubuğun hâlâ beyaz kaldığını bildirdi. Koyu temada çubuğun siyah olduğu biliniyordu, o hâlde Safari'nin beklediği durumun kendisi gerçek koyu moddur (`html.dark`). Ayrı ayrı özellikleri taklit etmek yerine aynı duruma geçiliyor.

## Yapılan
- `components/theme/theme-provider.tsx` `holdDarkMode()`: `html`'e `.dark` ekler (`withInstantSwitch` ile geçişsiz) ve geri alma işlevi döner. Zaten koyuysa hiçbir şey yapmaz (koyu ziyaretçi koyu kalır); yalnız kendi eklediğini kaldırır. Kayıtlı tercih (`promptly-theme`) ve React tema durumu DEĞİŞMEZ.
- `useFullScreenChrome` (Odak): açılışta `holdDarkMode()`, kapanışta (X, Esc, Geri, sayfadan ayrılma) geri alma. 246'daki `html[data-focus-open] { color-scheme: dark }` kuralı ve sahnedeki `[color-scheme:dark]` kaldırıldı (`.dark` zaten `color-scheme: dark` verir).
- Testler: 2 (açıkken `.dark` + tercih dokunulmadı), 11 (kapanınca açık), 16 (açık temada site açılışta koyu), 31 (koyu ziyaretçi koyu kalır), 32 (açık ziyaretçi X ve Esc sonrası açık, tercih `light`).

## Ek: uygulama çubukları `display: none` (aynı dal)
Odak ayrı bir ROTA (`/focus`) ama ekranı kendi sayfası değil: `(app)/layout.tsx` → `AppShell` (üst menü, yan menü, ALT MENÜ) yine kurulur, Odak `document.body`'ye portal ile `fixed inset-0 z-45` olarak bindirilir. Alt menü (`MobileNav`) `fixed bottom-0`, `bg-surface` ve ekran altına uzanan `after:` uzantısı olan bir öğedir (`193-*`); önceki denemelerde `visibility: hidden` kalıyordu. Safari araç çubuğunun arkasını kenardaki sabit öğeden örnekliyorsa (hem 198'deki üç hikâye denemesi hem açık=beyaz / koyu=siyah gözlemi bunu destekler) en güçlü aday bu gizli ama DOM'daki alt menüdür. `html[data-focus-open] [data-app-chrome] { display: none !important }` (yazma ekranıyla aynı yol); kapanınca geri gelir. Hikâye görüntüleyici `visibility: hidden`'da bırakıldı (`run-stories` o davranışı sınıyor). Testler: 2, 14, 11 `display` ölçer.

## Bilinçli sınırlar
- Hikâye görüntüleyiciye UYGULANMADI (metin hikâyeleri açık "kâğıt" zeminli olabilir).
- Odak açıkken arkadaki sayfa kısa süre koyu çizilir (sahne üstünü örter, geçişsiz); Geri'de sayfa açık haline anında döner.
- Hâlâ beyazsa sıradaki adım: ekran altına taşan ayrı `position: fixed` dolgu öğesi; kesin çözüm ana ekrana ekle (PWA).
