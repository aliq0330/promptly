# 199 — Odak Akışı (dikey, görsel öncelikli akış — Ana Sayfa'nın üçüncü görünümü)

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e, gerçek telefona (özellikle iOS Safari) karşı denenmedi.

## Neden
Kullanıcı bir HTML prototipi (`promptly_immersive_feed_image_first_v3.html`: tek gönderi/ekran dikey kaydırma, scroll-snap, aktif görselden bulanık arka plan, sağda eylem rayı, prompt penceresi) verdi ve bunun mevcut yapıyı bozmadan, gerçek veriye ve mevcut işlevlere bağlı, kullanıcının seçebileceği bir görünüm olarak eklenmesini istedi. Prototipteki örnek kullanıcılar/görseller, React CDN/Babel ve sahte düğmeler (toast) KULLANILMADI.

## Karar
- **Yeni mekanizma yok:** mevcut Kart | Odak tercihi (`view-mode-store.ts`) üçüncü değerle genişletildi: `feed` ("Akış" / "Feed", başlık "Odak Akışı"). Saklama aynı: `?view=feed` → `localStorage promptly-view-mode` → `card`.
- **Yalnız Ana Sayfa** sunar (`FeedTabs layout="home"` → `ListToolbar allowFeedView`). Başka listeler tercih `feed` iken KARTLARINI gösterir (`displayViewMode`), seçicilerinde Akış yoktur; `mode === "focus"` denetimleri değişmedi.
- **Rota değil, katman:** `FocusFeed` `<body>`'ye portal ile, header (64px) ile alt menü (64px + güvenli alan) arasına, sidebar/ray sağına `fixed` oturur (z 29: kartların yükseltilmiş satırlarının üstünde, header'ın ve menülerinin altında). Kart ızgarası altta bağlı kalır (kaydırma konumu korunur); katman açıkken `<main>` `inert`, gövde kaydırması ortak sayaçlı kilitle (`lockBodyScroll`) durur.
- **Konum:** açılışta (liste kaydırılmışsa) görünen kartın gönderisinden, yoksa bu oturumda o akışta (sekme + filtre) son açık olan gönderiden başlar (`focusFeedStartIndex`); kartlara dönünce açık olan gönderinin kartı başa getirilir (`data-feed-key` çapası `FeedGrid`/`FocusGrid` öğelerinde).
- **Hata izolasyonu:** `FocusFeedBoundary` — katman çökerse kaldırılır (kartlar zaten altta), küçük bir bildirim + "Kart" düğmesi kalır.

## Yapılan
- `src/lib/focus-feed.ts` (+ `focus-feed.test.ts`, `npm test`'e eklendi): saf sunum adaptörü — kapak (`focusFeedCover`: prompt/workflow/istek `media[0]`, hazır ayar `coverUrl`), düzen (`visual` yalnız gerçek görsel varsa; yoksa `text` / `workflow` / `preset` / `request`), `+N` görsel, oynat işareti, başlangıç indeksi, yakınlık penceresi (±2), sonraki sayfa eşiği (sondan 3).
- `features/focus/focus-feed.tsx`: katman, `scroll-snap` (y mandatory, `snap-always`, gönderi başına bir durak; JS yalnız klavye/düğme adımında kaydırır), IntersectionObserver (≥ %60) ile etkin gönderi, iki katmanlı çapraz geçişli bulanık arka plan (yalnız etkin gönderi değişince; görselsiz gönderide düz token zemin), klavye (↑ ↓ PageUp/Down j k Home End, Esc → kartlar; diyalog açıkken ya da alanda yazarken devre dışı), üst çubuk (telefonda "kartlara dön", Ana Sayfa sekmeleri, `01 / 18+` sayacı, `md`+ Kart | Odak | Akış seçicisi), `lg`+ önceki/sonraki düğmeleri, yükleniyor/hata/boş durumları, son slayt (yükleniyor / tekrar dene / "Hepsini gördün").
- `features/focus/focus-feed-slide.tsx`: tür başına slayt — görsel prompt / kapaklı workflow·hazır ayar / referanslı istek: resim önde (yüklenirken shimmer, okunamazsa simge; yalnız yakın slaytlar resmi bağlar), üstünde tür hapı, araç, başlık, açıklama, yazar, "Promptu incele" + "Ayrıntıları aç"; metin promptu: `PromptPreviewBox` (mono blok + Kopyala + kullanım); workflow: gerçek adım zinciri (`useWorkflowFocusSteps`, yalnız yakınken; okunamazsa adım sayısı); hazır ayar: `presetParameterEntries`; istek: durum rozeti + yaratıcı yön. "Promptu incele" = ortak `Modal` içinde tam metin + `CopyPromptButton` (kullanım sayacı `record_prompt_copy`) + detay bağlantısı.
- `features/focus/focus-feed-rail.tsx`: yazar avatarı (profil) + MEVCUT `LikeButton` (iyimser + geri alma), `CommentCountLink` (`#comments`), `SaveButton` (koleksiyon penceresi), istekte Yanıtlar bağlantısı (istek kaydedilmez), `ShareTriggerButton` (`ShareModal`) — yalnız `className` ile sütun düzenine çevrildi; misafire her biri kendi giriş penceresini açar.
- `view-mode-switcher.tsx`: `allowFeed` (üçüncü segment; telefonda ayrı `MobileFeedButton`); `list-toolbar.tsx`: `allowFeedView`; `share-modal.tsx`: `ShareTriggerButton`'a isteğe bağlı `size`.
- Çeviri: `view.feed`, `view.feedTitle`, `view.switchToFeed`, `focusFeed.*` — TR + EN.

## Bilinçli sınırlar
- "Generator" türü projede artık yok (akış 4 tür taşır); prototipteki "Sana özel" sekmesi yok (Ana Sayfa'nın gerçek sekmeleri kullanılır).
- Tür filtresi çipleri katmanda gösterilmez (kartlardaki filtre katmanda da geçerlidir); ⋮ menüsü (raporla/sil) katmanda yok — detay sayfasında.
- Çok görselli gönderide yalnız kapak + `+N` (galeri detay sayfasında); video/ses oynatma detay sayfasında.
- Keşfet ve diğer listeler Odak Akışı sunmaz (bileşen genel; bağlamak yalnız `FocusFeed` + `allowFeedView` ister).

## Sınama
`tsc`, `lint` (0 hata), `npm test` (focus-feed 5 test dahil), `next build --webpack` (Turbopack bu sandbox'ta Google Fonts dosyasını çözemedi — kodla ilgisiz). Yeni `tests/messaging-ui/run-focus-feed.mjs` 16/16: varsayılan kart, geçiş + yerleşim + kilit/inert, klavye/tekerlek snap, tür başına slayt, beğeni + hata geri alma, kaydet/paylaş/yorum, prompt penceresi + kopyalama sayacı, sayfalama (keyset imleci), Esc → kart konumu, kart → akış konumu, tercih saklama + diğer listeler, misafir, 390px telefon, İngilizce, koyu tema + hareket azaltma, 820px tablet. Gerçek Supabase / gerçek iOS Safari / gerçek medya ile DENENMEDİ.
