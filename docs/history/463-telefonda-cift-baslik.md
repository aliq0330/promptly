# 463 — Telefonda çift başlık: üst çubuktaki ad varken sayfanın kendi başlığı gizli

462'de telefon üst çubuğu sayfanın adını yazmaya başladı (Bildirimler, Mesajlar…). Birçok sayfa kendi büyük başlığını da çiziyordu → aynı kelime iki kez görünüyordu ("Bildirimler" üst çubukta + sayfada büyük). Kullanıcı: "bazı sayfaların kendilerinde de başlık var, tespit et kaldır".

## Kural
Sayfanın başlığı üst çubuktaki adla **aynı metinse telefonda (`< md`) gizlenir**; masaüstü/tablette durur (orada üst çubuk sayfa adı yazmaz). Karar tek yerde:
- `lib/phone-chrome.ts` `duplicatesPhoneTitle(pathname, metin, t)` — saf: rotanın üst çubuk adı (`phoneTitleKey`) çevrilmiş metne eşitse doğru. Başka başlık (topluluk adı, kişi adı, "Tüm paylaşımlar", "Kaydedilenlerin tümü") ASLA etkilenmez.
- `components/layout/phone-title.ts` `usePhoneDuplicateClass(metin)` → `max-md:hidden` ya da `undefined`.

## Nerede uygulandı
Ortak başlık bileşenleri: `SadeTitle` (Bildirimler, Mesajlar, İçeriklerim, Yaratıcı paneli, tür listeleri), `PageHeader` (Etiketler vb.), `HubBand` (Topluluklar, Spaces, Ekipler — bandın simge/açıklama/«Oluştur» düğmesi kalır, yalnız h1 gizlenir). Tek tek yazılmış h1'ler: Keşfet (haftalık sayı satırı kalır), Takip ettiğim kişiler, Takipçiler, Ayarlar, Moderasyon, Profili düzenle, İlişki Haritası (h1 + eyebrow).

**Yeni bir sayfa başlığı yazarken** h1'e `cn(…, usePhoneDuplicateClass(metin))` ekle ya da `SadeTitle`/`PageHeader`/`HubBand` kullan; ayrı bir "telefonda gizle" mantığı yazma.

## Bilinçli
- Gizlenen h1 DOM'da durur (`display:none`): ekran okuyucu ve `<title>` etkilenmez (başlığı `PageTitle` yazar); testlerde `getByRole("heading")` gizli öğeyi bulmaz → `locator("h1", { hasText })` + `state: "attached"` kullan.
- `/saved`: üst çubukta «Kaydedilenler», bantta «Kaydedilenlerin tümü» — farklı metin, dokunulmadı.
- Yeni çeviri anahtarı yok (TR/EN karşılıkları zaten vardı).

## Testler
`src/lib/phone-chrome.test.ts` (karar), `run-nav-layout` 10d (16 rotada üst çubukla aynı görünür başlık yok) + 10e (masaüstünde başlık durur); `run-settings` ve `run-team-hub` telefon seçicileri güncellendi. `/notifications` sayfası bu ağ taklidinde çizilemediği için 10d'de yok (başlık `SadeTitle` olduğundan aynı yoldan geçer). Ağ taklitli; gerçek cihaz DENENMEDİ.
