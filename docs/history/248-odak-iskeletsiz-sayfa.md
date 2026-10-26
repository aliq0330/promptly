# 248 — Odak: `/focus` rotasında uygulama iskeleti (üst/yan/alt menü) hiç kurulmaz

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 32/32: 2, 11, 14 DOM'da `[data-app-chrome]` yok / kapanınca geri; `run-discover` 9/9, `run-stories` 24/24). **Gerçek iPhone Safari'de DENENMEDİ.**

## Neden
`246-*` (`color-scheme`) ve `247-*` (site koyu moda geçer + çubuklar `display: none`) iPhone'da alt çubuğun arkasını açık temada koyulaştırmadı. Kök durum: Odak ayrı bir ROTA (`/focus`) ama `(app)/layout.tsx` → `AppShell` içinde; üst menü, yan menü ve `fixed bottom-0` + `bg-surface` + `after:` uzantılı ALT MENÜ yine kuruluyor ve Odak onların üstüne `document.body`'ye portal ile `fixed inset-0 z-45` bindiriliyordu. Gizlemek (`visibility`/`display`) yetmediyse, Safari'nin çubuk rengini bu DOM'daki öğelerden aldığı varsayımıyla en kesin yol onları hiç kurmamaktır.

## Yapılan
- `components/layout/app-shell.tsx`: yol `/focus` (`/^\/focus\/?$/`) ise `Sidebar`, `Header`, `MobileNav` ve "içeriğe geç" bağlantısı RENDER EDİLMEZ; yalnız `<main>`, `WelcomeTour`, `AnnounceReportNotice`, `NoticeHost` kalır (bildirimler/uyarılar Odak'ta da lazım). Sağlayıcılar (`AppProviders`) aynı yerleşimde kaldığı için oturum/durum yeniden kurulmaz; başka sayfadan Odak'a geçiş ve Geri aynı eskisi gibidir.
- `globals.css`: 247'deki `html[data-focus-open] [data-app-chrome] { display: none }` kuralı kaldırıldı (artık gizlenecek öğe yok). `data-focus-open` özniteliği ve `holdDarkMode` (247) yerinde.
- Testler: 2 (`[data-app-chrome]` ve atlama bağlantısı DOM'da yok), 14 (telefonda alt menü DOM'da yok), 11 (kapanınca üst menü geri).

## Bilinçli sınırlar
- Odak'ın sahnesi hâlâ `document.body`'ye portal ile bindirilmiş `fixed inset-0` bir katman (normal akışta bir sayfa değil); kabuk yok ama sahne kaydırılabilir bir belgenin parçası değildir. Sonraki adım gerekirse sahneyi `(focus)` ayrı rota grubuna + normal akışa taşımak (sağlayıcıların yeniden kurulması gerekir).
- Hikâye görüntüleyici aynı sorunu yaşıyorsa ayrı iş (`visibility: hidden`'da kaldı).
