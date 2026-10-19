# 199 — Odak: tam ekran, dikey, tek gönderi/ekran sayfası (`/focus`)

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e, gerçek telefona (özellikle iOS Safari), gerçek video/ses dosyasına karşı denenmedi.

## Neden
Kullanıcı bir HTML prototipi (`promptly_immersive_feed_image_first_v3.html`: tek gönderi/ekran dikey kaydırma, scroll-snap, aktif görselden bulanık arka plan, sağda eylem rayı, prompt penceresi) verdi. İlk sürüm bunu Ana Sayfa'nın üçüncü görünümü ("Kart | Odak | Akış", içerik alanını kaplayan katman) olarak ekledi. Kullanıcı ardından şunu istedi ve kararlar birlikte netleşti:
- Ana Sayfa'dan kalksın; **"Odak" adıyla ayrı, Reels tarzı tam ekran sayfa** olsun.
- Herkesin paylaşımları orada aksın; **video ve ses de oynasın**.
- Telefonda üst ve alt menü kalksın, ekranı komple kaplasın; masaüstünde de tam ekran (X ile çıkış).
- Telefonda alt menüde **Profil'in yerini Odak** alsın (profil üstteki avatar menüsünde, misafir girişi üstteki giriş menüsünde kalır); masaüstü yan menüde "Ana Sayfa"nın altında.
- Liste görünümlerindeki eski "Odak" (yoğun ızgara) **"Izgara"** adını aldı (iç değer `focus`, `?view=focus` ve `localStorage` uyumlu kaldı).
- Sahne açık temada da **hep koyu** (kullanıcının paletinde); sekmeler "En yeni" + "Takip ettiklerim"; üstte "Medya" süzgeci.
- Prototipteki örnek kullanıcılar/görseller, React CDN/Babel ve sahte (toast) düğmeler KULLANILMADI.

## Yapılan
- **Rota** `src/app/(app)/focus/page.tsx` → `FocusPage` (`features/focus/focus-feed.tsx`). Statik export ön-oluşturmada `document` olmadığı için yalnız istemcide bağlanır; `<body>`'ye portal, `fixed inset-0 z-[45]` (modallar z-50 üstte kalır). Açıkken `html[data-focus-open]` → üst menü, yan menü (artık `data-app-chrome`) ve alt menü `visibility: hidden` (hikâye görüntüleyicinin kuralı, `globals.css`); gövde kaydırması ortak kilitle durur; `html`/`body` zemini ve `theme-color` sahne rengine (`--color-story-stage`) çekilir, kapanınca geri döner. Koyu sahne: `.dark` + `data-palette={palette}` alt ağaçta bütün token'ları yeniden kapsar.
- **Veri:** Ana Sayfa'nın `useFeedPages` / `feed_page` (en yeni, dört tür; "Takip" = takip edilenler, misafire giriş ister) → yalnız yayında + herkese açık + topluluğa ait olmayan içerik. "Medya" süzgeci istemcide (`focusFeedHasMedia`: gerçek görsel ya da video/ses promptu); bir sayfa hiç slayt eklemese de sayfalama sürer.
- **Video / ses** (`PlayableMedia`, `focus-feed-slide.tsx`): oynatılan dosya, detay sayfasındaki kuralla **yazarın o prompta yüklediği kendi sonucu** — mantık `loadAuthorOutput` olarak `prompt-playable-output.tsx`'e çıkarıldı (detay sayfası da onu kullanır), Odak'ta `usePromptOutput` ile yalnız etkin gönderi ve komşusu için, oturum boyunca bir kez sorgulanır. Etkin video sessiz başlar (tarayıcıların otomatik oynatma kuralı); üst çubuktaki ses düğmesi bütün akış için açar. Ses gönderisi sessizken kendiliğinden çalmaz; oynat düğmesine dokunmak çalar ve sesi açar. Geçilen gönderi durur; dokunmak oynat/duraklat; altta ince ilerleme çizgisi. Çıktı yoksa kapak görseli, o da yoksa promptun metni. `StorageAudio`'ya `StorageVideo`'daki gibi isteğe bağlı dış `ref` eklendi.
- **Yerleşim:** telefonda her gönderi bütün ekran (medya kenardan kenara, görsel `contain` + arkada bulanık kopyası; yazılar altta; eylem rayı sağda üstte yüzer; güvenli alanlar), `md`+ kart + yanında ray. Üst çubuk: X (geri; doğrudan açıldıysa Ana Sayfa), "Odak", sekmeler, Medya, ses, `md`+ sayaç.
- **Kaydırma / performans / erişilebilirlik:** önceki sürümdeki gibi — `scroll-snap` (y mandatory, gönderi başına bir durak), IntersectionObserver (≥ %60) ile etkin gönderi, yalnız etkin ± 1 gönderi medya bağlar, çapraz geçişli bulanık arka plan yalnız etkin gönderi değişince, klavye (↑ ↓ PageUp/Down j k Home End, Esc = kapat; diyalog açıkken/alanda yazarken devre dışı), hareket azaltma, hata sınırı (tam ekran mesaj + tekrar dene + Ana Sayfa'ya dön), son slayt, oturum içinde son açık gönderiye dönüş.
- **Eylemler** (`focus-feed-rail.tsx`): MEVCUT `LikeButton` (iyimser + geri alma), `CommentCountLink` (`#comments`), `SaveButton`, istekte Yanıtlar, `ShareTriggerButton` (`size` eklendi); "Promptu incele" = `Modal` + `CopyPromptButton` (`record_prompt_copy`).
- **Menüler:** `nav-items.ts` — yan menü "Odak" (`GalleryVerticalEnd`), telefon alt menüsü 5. yuva Profil → Odak; `page-title.tsx` `/focus`.
- **Geri alınanlar (ilk sürüm):** `view-mode-store`'daki `feed` değeri, seçicideki üçüncü segment / `MobileFeedButton`, `ListToolbar allowFeedView`, `FeedTabs` katmanı, kart ızgarasındaki `data-feed-key` çapaları.
- Çeviri: `nav.focus`, `focusFeed.*` (kapat, Tümü/Medya, ses aç/kapat, oynat/duraklat, boş/hata metinleri…) ve "Izgara" adları — TR + EN.

## Bilinçli sınırlar
- Video/ses yalnız yazarın yüklediği çıktıyla oynar (detay sayfasıyla aynı kural); başka kullanıcıların sonuçları Odak'ta oynatılmaz.
- "Medya" süzgeci sunucuda değil istemcide; medyasız uzun bir seride birkaç sayfa arka arkaya istenebilir.
- Telefonda Profil artık alt menüde değil (üstteki avatar menüsünde). ⋮ menüsü (raporla/sil) Odak'ta yok — detay sayfasında. Çok görselli gönderide kapak + `+N`.
- "Kapat": `history.length > 1` ise geri, değilse Ana Sayfa (projedeki diğer geri düğmeleriyle aynı kural).

## Sınama
`tsc`, `lint` (0 hata), `npm test` (`focus-feed.test.ts` 5 test), `next build --webpack` (Turbopack bu sandbox'ta Google Fonts dosyasını çözemedi — kodla ilgisiz). `tests/messaging-ui/run-focus-feed.mjs` 17/17: Ana Sayfa'da Akış yok + Kart | Izgara + yan menüde Odak, tam ekran + menülerin gizlenmesi + koyu sahne + kilit + başlık, klavye/tekerlek snap, tür başına slayt, video (sessiz otomatik oynatma, ses aç, geçince dur, yalnız yakında sorgu), ses (sessizken çalmaz, oynat düğmesi), Medya süzgeci, beğeni + geri alma, kaydet/paylaş/yorum/prompt penceresi/kopyalama sayacı, sayfalama, kapat/Esc → geldiği sayfa, son gönderiye dönüş, misafir, 390px (alt menüde Odak, ekranı kaplama), İngilizce, açık temada koyu sahne + hareket azaltma, 820px. Medya oynatma `play/pause` taslağıyla sınandı (gerçek çözme yok). Gerçek Supabase / gerçek iOS Safari / gerçek medya ile DENENMEDİ.
