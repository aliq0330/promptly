# 249 — Odak'a giriş gerçek bir sayfa yüklemesi (Safari araç çubuğu rengi)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 32/32: 2 ve 14 sayfanın GERÇEKTEN yüklendiğini `window` işaretiyle doğrular, 12 son açık gönderinin yüklemeler arasında hatırlandığını; `run-discover` 9/9, `run-home-motion` 10/10, `run-stories` 24/24). **Gerçek iPhone Safari'de DENENMEDİ.**

## Neden (kullanıcı gözlemi)
246–248 (belge `color-scheme`, geçici `.dark`, çubukları gizleme, çubukları hiç kurmama) iPhone'da alt çubuğun arkasını değiştirmedi. Kullanıcı kesin ipucunu verdi: **`/focus` sayfası yenilenince siyah; ana sayfadan Odak'a uygulama içinde geçince beyaz.** Yani Safari çubuk rengini sayfa YÜKLENİRKEN örnekliyor; Next'in uygulama içi (client-side) geçişinde yeniden örneklemiyor. Aynı kodla yenileme siyah, geçiş beyaz olduğuna göre sorun renk/DOM değil, geçişin türü.

## Yapılan
- `components/ui/full-load-link.tsx` `FullLoadLink`: düz `<a href="/promptly/focus/">` (Next `Link` değil) → tarayıcı sayfayı baştan yükler. `lib/utils.ts` `withBasePath()` (basePath + sondaki eğik çizgi).
- İki giriş noktası buna geçti: üst menüdeki "Odak" düğmesi (`header.tsx`, `md`+) ve mobil alt menünün Odak yuvası (`mobile-nav.tsx`, `FOCUS_HREF`). Başka giriş yok (kenar çubuğunda Odak yok).
- Son açık gönderi belleği (`lastOpen`) modül değişkeninden `sessionStorage`'a taşındı (anahtar `promptly-focus-last:<sekme:tür:medya>`; depolama kapalıysa sayfa içi yedek harita): sayfa her girişte yüklendiği için modül değişkeni her seferinde sıfırlanırdı. Kapat (X/Esc) davranışı değişmedi (`router.back()` → önceki sayfaya tarayıcı geri gider).
- 246–248'deki `holdDarkMode` ve `/focus`'ta çubuksuz `AppShell` yerinde kaldı (yeniden yükleme senaryosunda siyahı veren hâl).

## Bilinçli sınırlar
- Odak'tan Geri/kapat ile dönüş artık tarayıcı geri gezintisidir: önceki sayfa bfcache'ten anında ya da baştan yüklenerek gelir (ana sayfa akışı baştan yüklenebilir, kaydırma konumu tarayıcının geri yüklemesine kalır). Uygulama içi `useFeedPages` Geri belleği Odak'a giriş yüklemesinde sıfırlanır.
- Odak'a giriş her seferinde uygulamanın paketini ve oturumu yeniden yükler (önbellekli; oturum geri yüklenirken "Takip Ettiklerim" kısa süre bekler).
- `sessionStorage` hesap değişiminde sayfa yenilense de sekmede kalır: başka hesabın son açık gönderi ANAHTARI yalnız açılış konumu için okunur (listede yoksa en başa düşer), veri sızdırmaz.
- Hâlâ beyazsa sıradaki adım: yüklemeden ÖNCE (HTML'de) `/focus` için koyu zemin (`themeInitScript`) — `useFullScreenChrome`'un "eski değeri geri yaz" mantığıyla birlikte tasarlanmalı.
