# 460 — Telefon üst ve alt menü (mockup'a uygulama)

Kullanıcı mobil kabuk mockup'ını onayladı ("sadece üst menüyü ve alt menüyü siteye uygula"): Substack'in telefon kabuğundan esinli yerleşim, Promptly'nin kendi ikon/renk/yazı diliyle. **Kart tasarımı (Not kartı / Tarif kartı) uygulanmadı** — yalnız kabuk.

## Neyi değiştirdi (yalnız telefon, < md)
- **Üst çubuk** (`header.tsx`): solda logo + sayfanın adı (`phoneTitleKey`; `ROUTE_TITLES` tek tabloya, `lib/route-titles.ts`, taşındı — sekme başlığı ve üst çubuk aynı kaynaktan), sağda avatar (`PhoneAccountButton`, `account-menu.tsx`; basınca alttan «Sen» sayfası). Başlığı olmayan rotalarda (ayrıntı sayfaları) logo yazısı kalır; profil sayfasında «Profil». Arama ikonu, Odak, zil, mesaj ikonu telefonda üst çubuktan kalktı (md+ üst çubuk aynen duruyor).
- **Alt çubuk** (`mobile-nav.tsx`, `nav-items.ts` `mobileNavItems`): Ana Sayfa · Odak · Mesajlar · Bildirimler · Keşfet. Etkin = renk + kayan üst çizgi (5 eşit yuva). Mesajlar'da okunmamış noktası, Bildirimler'de sayı rozeti (`CountBadge`). Misafirde yuvalar aynı kalır (hiçbir şey yer değiştirmez); Mesajlar/Bildirimler giriş penceresini açar. Odak `FullLoadLink` (tam sayfa yüklemesi) — `/focus` hâlâ çubuksuz kendi sayfasıdır (`248-*`).
- **Mavi «+» hub'ı** (`CreateHub`, sağ altta): `CreateMenuSheet` açar. YALNIZ Ana Sayfa, Keşfet ve kendi profilinde (`showsCreateHub`, saf, birim testli): kendi profili = `/profile/real?username=` oturumdaki kullanıcı adına eşit. `useSearchParams` için Suspense içinde.
- **«Sen» sayfası**: Topluluklar alt çubuktan çıktığı için kısayol ızgarasına girdi (`ACCOUNT_SHORTCUT_HREFS`, 7 kutu; rayın «Sen» menüsü `rail` işaretiyle filtrelediği için değişmedi). Topluluklar'a artık yalnız «Sen» sayfasından ve Keşfet'in Topluluklar bölümünden gidilir.

## Bilinçli kararlar / dikkat
- **Keşfet ikonu Pusula kaldı** (mockup'taki büyüteç yerine): anlam başına tek ikon kuralı (`344-*`), kenar çubuğu/ray Pusula kullanıyor. Aramayı Keşfet'in kendi arama kutusu karşılıyor.
- **Odak'ta alt çubuk YOK** (mockup'ta vardı): `/focus` çubuksuz sayfa kuralı (`248-*`, iOS Safari alt şerit sorunu) korundu.
- 387'nin "Sen alt çubuğun son yuvası" ve "Oluştur gezinmenin ortasında" kararları SADECE telefonda tersine döndü; tablet/masaüstünde (ray, kenar çubuğu) aynen duruyor.
- Yeni çeviri anahtarı gerekmedi (`nav.focus`, `header.messagesAriaLabel`, `header.notificationsAriaLabel`, `nav.createShort`, `nav.youAria`, `nav.profile` var); İngilizce karşılıklar zaten vardı.

## Testler
`src/lib/phone-chrome.test.ts` (başlık + hub kararı), `tests/messaging-ui/run-nav-layout.mjs` (6–10c yeniden yazıldı), `run-motion`, `run-chat-load`, `run-create-destination`, `run-message-dock` telefon seçicileri güncellendi. Ağ taklitli; gerçek cihaz (iOS Safari) DENENMEDİ.
