# Ayar sayfaları mobil mockup uygulaması — ilerleme (devam için ilk okunacak dosya)

Kullanıcı kararları: (1) görünen metin **mockup'tan** alınır; (2) mockup'taki her satır **gerçek veriyle** bağlanır; (3) yeni telefon sayfaları mevcut `?id=&tab=&section=` yapısını `&sub=` ile genişletir;
telefonda (< md) ayar/yönetim yüzeyleri ve onlardaki modallar **tam ekran sayfa**, md+ ta aynı gövde mevcut çerçevede (modallar md+ ta modal kalır).
Sonunda **merge** (kullanıcı istedi). Saatlik limit dolarsa TSİ 05:52'de kaldığın yerden devam (send_later zamanlanmıştır; iş bitince `trig_01ABGnFRYEYmHnstqKib1knU` silinir).
Dal: `claude/lucid-einstein-jp5n1l`.

## Altyapı (yapıldı)
- Mockup kaynakları: `docs/mockups/ayar-sayfalari/*.dc.html` + `ayar.css` (tuval: https://claude.ai/artifact/S3w1sACrG5Y7wdg94tuZ4e).
- Stil: `src/app/ayar-kit.css` (`.sx` kökü, mockup'la AYNI sınıf adları, renkler site token'ına bağlı). Bileşenler: `src/features/settings/sx.tsx`
  (`SxPage` telefonda tam ekran kabuk / md+ okuma sütunu, `SxLabel`, `SxCard`, `SxRow`, `SxRowCol`, `SxBtn`, `SxSwitch`, `SxField`, `SxAvatar`, `SxCover`, `SxNote`…).
  `Switch variant="sx"`, `ChoiceGroup variant="sx-seg"|"sx-chips"`, `OptionGroup variant="sx"` mockup işaretlemesini çizer.
- Karşılaştırma: `tests/ayar/karsilastir.mjs` — mockup'ı bağımsız çizer, gerçek sayfayı ağ taklidiyle (dev sunucu `npx next dev -p 3100`, env `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy`)
  çizer; aynı sınıf adlı kutuların x/y/genişlik/yükseklik ve metin farkını raporlar, yan yana PNG üretir (`/tmp/ayar-out/`). Her sayfa **fark 0 olmadan** sıradakine geçilmez.

## Sayfa durumu (✔ mockup'la birebir doğrulandı · ◐ yapıldı, doğrulanıyor · ☐ bekliyor)
Topluluk: A1 ✔ A2 ✔ A3 ✔ A4 ✔ A5 ✔ A6 ✔ B1 ✔ B2 ✔ B3 ✔ B4 ✔ B5 ✔ B6 ✔
Ekip: C1 ✔ C2 ✔ C3 ✔ C4 ✔ C5 ✔ C6 ✔ D1 ☐ D2 ✔ D3 ✔ D4 ☐ D5 ☐ D6 ☐ E1 ☐ E2 ☐ E3 ✔
Space: F1 ☐ F2 ☐ F3 ☐ F4 ☐ F5 ☐ F6 ☐

## Notlar / sapmalar
- Renkler site token'ları (mockup'ın koyu paleti değil); ölçü, boşluk, tipografi, sıra, metin mockup'tan.
- Telefon yönlendirmesi: topluluk `tab=manage[&section=settings|permissions|chat|rooms|danger][&sub=…]`, `tab=members&section=invites`, `tab=about&section=prefs`. Duyurular/Moderasyon/Özet/İşlem geçmişi telefonda eski sayfa (mockup dışı).
- md+ : topluluk yönetiminde şimdilik eski bileşenler (SectionMenu + kartlar); yeni gövdeler (`SxPage` md+ kipi) md+ a uyarlama aşamasında bağlanacak (henüz yapılmadı).
- Odaların sıralanması/silinmesi telefonda B2'de yok (mockup'ta yok): silme = arşivdeki odalar sayfası (sahip); sıralama md+ ta.
- Bilinen test etkisi: eski `tests/messaging-ui/run-communities.mjs`, `run-groups.mjs`, `run-rooms.mjs` telefon genişliği senaryoları yeni sayfalara göre güncellenmeli.
