# Promptly Akış 2.0 — UI mockup

Yalnız **görsel tasarım** önerisi: Ana Sayfa (Sana Özel), Takip Ettiklerin, Keşfet; masaüstü 1440, tablet 1024, telefon 390.
Sahte, sabit veri kullanır. Uygulama koduna, Supabase'e, migration'a, akış algoritmasına ya da API'ye dokunmaz;
derlemeye (`src/`, `public/`) girmez.

## Açmak

`index.html` dosyasını tarayıcıda aç (sunucu gerekmez). Üstteki düğmelerle ekran değişir; adres parçası da çalışır:
`#sana-ozel`, `#takip`, `#kesfet`, `#tablet`, `#mobil`. "Koyu mod" iki modu, "Ekrana sığdır / Gerçek boyut" ölçeği değiştirir.

## İçerik

- `index.html` — tek dosya; tasarım tokenları `src/app/globals.css`'ten (Meydan paleti, iki mod) kopyalandı.
- `icons.js` — Phosphor Bold ikonları, `src/components/icons/`'tan kopya (MIT).
- `img/` — `public/viral-seed`, `public/seed-media`, `public/onboarding` görsellerinin küçültülmüş kopyaları.
- `tools/` — `public/tools` araç logoları.

Yazı tipleri (DM Sans, Bricolage Grotesque, JetBrains Mono) mockup'ta Google Fonts'tan yüklenir; uygulamanın kendisi
kendi `.woff2` dosyalarını kullanır (CLAUDE.md §4).

## Mevcut kurallardan bilerek sapılan yerler (karar bekliyor)

Mockup isteğe göre çizildi; uygulamaya alınırsa aşağıdakiler CLAUDE.md'deki kayıtlı kararlarla çelişir:

- Ana Sayfa'da yazma alanı ("Ne oluşturmak istiyorsun?") — `docs/history/337-*` kaldırmıştı.
- Kartta "Paylaş" ve "Kullan" — `265-*`/`266-*` kartı Beğeni · Yorum · Kaydet · ⋮ ile sınırlar.
- Telefon alt menüsünde Spaces ve Profil — bugün Topluluklar ve «Sen» (`387-*`).
- Space kartında "üye / gündem" — Space bir topluluk değil, yaratıcı projedir (`213-*`); kartta üye + öğe + "bu hafta" gösterildi.
- Keşfet'te sıralama segmentli düğme; bugün "Tümü ▾" menüsü + Filtre (`227-*`, `233-*`).
