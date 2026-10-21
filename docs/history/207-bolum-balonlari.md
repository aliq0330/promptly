# 207 — Bölüm balonları: Ana Sayfa ve Keşfet bölüm değiştirici

**Durum:** uygulandı (yalnız istemci; migration yok). Kullanıcı, görsel örneklerden (iki ince satır / tek satır / başlık menüsü / bölüm balonları / yüzen hap / daralan şerit) "bölüm balonları"nı seçti. 206'daki sabit sekme satırının yerini alır.

## Ne değişti

- **`SectionNav`** (`features/content/section-nav.tsx`): Ana Sayfa (En yeni · Popüler · Takip · Etiketlerim) ve Keşfet (Tümü · Promptlar · Workflow · Hazır ayar · İstekler · Yaratıcılar) için tek bileşen.
  - **Tepede:** yuvarlatılmış kare balonlar (simge + ad; seçili olan koyu dolgulu). Hikâye halkalarıyla karışmasın diye yuvarlak değil kare. Altında tek ince kontrol satırı: sıralama (yalın metin seçici, yalnız Keşfet), tür çipleri (Ana Sayfa'da her genişlikte; Keşfet'te `md`+, telefonda Filtre penceresinde), Filtre simgesi (aktif filtre sayısı rozetli), Kart | Izgara.
  - **Kaydırınca:** balonlar sayfadan çıkınca TEK 52px şeride daralır: seçili bölüm etiketli koyu hap, diğerleri yalnız simge (yatay kayar), sağda Filtre + görünüm. Şerit üst menünün altına sabitlenir; `lg` altında üst menü kayıp gidince onun yerine (`top: 0`) çıkar (`data-sticky-under-header`, `globals.css`, 206'dan).
  - Şerit sıfır yükseklikli `sticky` bir çapadır (`h-0`, içindeki çubuk `absolute`) — akışa yer tutmaz, görünür/gizli geçişi yerleşimi kaydırmaz. Bu yüzden `SectionNav` sayfanın / akışın **uzun kapsayıcısının doğrudan çocuğu** olmalı (sticky'nin kapsayıcısı listenin sonuna kadar uzanmalı); çapa `margin: 0` satır içidir ki `space-y-*` ebeveyni boşluk eklemesin.
  - Görünürlük `IntersectionObserver` ile (`useScrolledPast`): kaydırma sırasında React render'ı yok. Gizliyken şerit `inert` (odak/ekran okuyucu dışı).
- **`ListFilterSheet`** `ListToolbar`'dan çıkarıldı (aynı pencere; `ListToolbar` ve `SectionNav` ortak kullanır). `ListToolbar`'ın yalnızca Ana Sayfa'nın kullandığı `stream` kipi kaldırıldı.
- `SortSelect`'e `quiet` (kenarlıksız metin seçici) eklendi.
- Keşfet'te Yaratıcılar bölümü `hideControls` ile yalnız balonları gösterir (filtrelenebilir bir akış değil).
- `FeedTabs`'in `layout="grid"` kolu (segmentli sekmeler + `ListToolbar`) olduğu gibi duruyor.

## Notlar

- Yeni metin yok: balon adları / erişilebilir adlar mevcut anahtarlardır (`home.tab*`, `nav.following`, `common.all`, `nav.*`, `toolbar.*`); **İngilizce karşılıklar zaten var, yeni anahtar eklenmedi.**
- Doğrulama: `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` (369/369), `npm run build`; ağ taklitli Playwright ile 390px ve 1280px'te Ana Sayfa + Keşfet: tepede şerit gizli (`inert`), kaydırınca görünür (telefonda `top: 0`, üst menü dönünce 64), şeritten bölüm seçimi ve Filtre penceresi çalışır, sayfa hatası yok; `run-search-notifications` 8/8, `run-focus-feed` 23/23, `run-shared-cards` 11/11.
- **Denenmedi:** gerçek Supabase / gerçek besleme verisiyle (taklitte besleme boş, kaydırma için sahte yükseklik eklendi), gerçek cihaz / iOS Safari. Simge-only balonların anlamı yalnız `title`/`aria-label` ile veriliyor.
