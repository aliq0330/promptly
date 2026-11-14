# 387 — Gezinme yerleşimi: bir hedef, bir yer

Kullanıcı "masaüstü/tablet/telefondaki sol menü, alt menü, üst menü yerleşimi çok saçma" dedi; mockup tuvali hazırlandı, onaylanan düzen **mockup'a birebir** uygulandı. Tek fark: **sağ alttaki Mesajlar hapı masaüstünde KALDI** (önerilen "boşta hap yok" maddesi kullanıcı tarafından reddedildi).

## Eskiden (neden dağınıktı)
- Aynı hedef boyuta göre yer değiştiriyordu: Odak telefonda alt çubukta, tablet/masaüstünde üst çubukta; Spaces/Ekipler/Kaydedilenler telefonda avatar menüsünün içinde, masaüstünde kenar çubuğunda.
- İki girişli hedefler: Profil, Ayarlar ve Yasal bağlantılar hem kenar çubuğunda hem avatar menüsünde; Mesajlar masaüstünde hem üst ikon hem sağ alt hap.
- Tablet rayı 72px, etiketsiz 8 ikon; üst çubukta arama + Odak düğmesi + bildirim + mesaj + avatar.

## Şimdi (kural: Gezin solda/altta · Durum üstte · Oluştur tek eylem · «Sen» gezinmenin son yuvası)
- **Telefon (<md):** üst çubuk logo · Ara · Odak · Bildirim · Mesaj. Alt çubuk Ana Sayfa · Keşfet · **+** · Topluluklar · **Sen** (avatar + etiket). «Sen» alttan sayfa açar (`PhoneAccountTab` → `Modal variant="sheet"`): profil satırı, 3×2 Kısayollar ızgarası (Kaydedilenler · Spaces · Ekipler · Takip · Panel · Studio), İçeriklerim · Ayarlar · Görünüm (Açık/Koyu) · Dil (Türkçe/English) · çevrimiçi durumu · rol satırları · Çıkış, alt bağlantılar. Misafirde son yuva «Giriş Yap».
- **Tablet (md–lg):** `NavRail` 84px: marka · yuvarlak Oluştur · Ana Sayfa/Keşfet/Topluluklar │ Spaces/Ekipler/Kaydedilen · en altta «Sen» (menü rayın sağına açılır; rayda olmayan Takip/Panel/Studio menüde kısayol). Üst çubukta arama kutusu + Odak ikonu + bildirim + mesaj.
- **Masaüstü (lg+):** `Sidebar` 248px: marka · tam genişlik Oluştur · başlıksız grup (Ana Sayfa, Keşfet, Topluluklar) · «Çalışma» (Spaces, Ekipler, Studio) · «Kütüphane» (Kaydedilenler, Takip ettiğim kişiler, Yaratıcı paneli) · ekip listesi (`SidebarTeams`, veri varsa) · en altta «Sen» kartı (menü yukarı açılır). Üst çubukta Odak ikon + yazı. Ziyaretçide «Giriş Yap» + Geliştiriciler/Yasal bağlantıları kenar çubuğunun altında kalır (üye menüsü olmadığı için).
- Hedefler TEK listeden: `nav-items.ts` (`navGroups` + `rail` + `railLabelKey`/`tileLabelKey`, `accountShortcutItems`, `mobileNavItems`, `YOU_HREF`). `PROFILE_NAV_PLACEHOLDER`, `settingsNavItem`, `useProfileNavHref` silindi.
- Hesap menüsü `account-menu.tsx`'te üç görünüm: `PhoneAccountTab` (sayfa), `RailAccount` (yana), `SidebarAccount` (yukarı); satırlar ortak `AccountRows`, eylemler `useAccountActions` (hesap değiştirme penceresi menü kapanınca da yaşasın diye sahibi bileşendedir).

## Teknik notlar
- Çeviriler `translations.ts` (`nav.you`, `nav.youAria`, `nav.groupWork`, `nav.savedRail`, `nav.followingTile`, `nav.insightsTile`, `nav.accountHint`, `nav.shortcuts`, `account.appearance*`, `account.languageName`, `account.viewProfile`); TR + EN eklendi, `build-i18n` çalıştırıldı. `nav.groupLibrary` «Kütüphane»/«Library» oldu; `nav.tagline` kenar çubuğundan kalktı (başka yerler kullanıyor).
- Ray ve kenar çubuğu DOM'da birlikte durur (CSS ile biri gizli): testlerde `aside[aria-label]:visible` kullan; CSS seçicili `.first()` gizli olanı yakalar.
- «Sen» tetikleyicisinin erişilebilir adı «Sen · Hesap menüsü» (görünen metni içerir); menünün adı «Hesap menüsü» kalır.

## Doğrulama
`tsc`, `eslint`, `npm test`, `next build --webpack` temiz (bu sandbox'ta Turbopack Google yazı tipi çözümlemesinde takılıyor: `next build` yerine `--webpack` kullanıldı); ağ taklitli `run-nav-layout` 13/13 (yeni), `run-discover`, `run-legal-notice`, `run-developers`, `run-message-dock`, `run-focus-feed`, `run-line-art`, `run-community-home`, `run` yeşil. Gerçek Supabase/cihaz DENENMEDİ (iOS Safari'de «Sen» sayfası ve alt çubuk dahil).

## Yapılmadı / sınırlar
- Mesajlar hapı kaldırılmadı (kullanıcı kararı); tablette hap hiç yoktu (dock `lg+`), bu değişmedi.
- «İçeriklerim» (`/my-content`) mockup'ta yoktu; sayfa gezinmede yetim kalmasın diye «Sen» satırlarında durur.
- Görünüm/Dil satırları mockup'taki gibi değeri yazıyla gösterir; eski gece modu anahtarı ve `account.nightMode*` anahtarları artık kullanılmıyor.
