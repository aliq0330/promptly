# 209 — Canlı vitrin, kart geçişi, hız hissi, "Sana özel"

**Durum:** istemci kodu + migration repoda. `20260921100000_media_appearance_and_for_you.sql` **canlıya UYGULANMADI**. Sıra: ÖNCE migration, SONRA istemci. Yeni istemci `prompt_media.dominant_color/placeholder` sütunlarını seçer ve `for_you_page`'i çağırır; migration yoksa prompt okumaları hata verir. `drop` yok.

Kullanıcı, yol haritası önizlemesindeki (etkileşimli sayfa) dört fikri seçti: canlı vitrin, kart → detay geçişi, hız hissi, "Sana özel".

## 1. Hız hissi: baskın renk + bulanık önizleme

- `prompt_media`'ya iki sütun: `dominant_color` (`#rrggbb`, CHECK) ve `placeholder` (≈24px JPEG data URL, `data:image/jpeg;base64,` ile başlar, ≤ 3000 karakter, CHECK). Okunabilirlik değişmez, yeni politika yok.
- Yükleme anında istemci hesaplar (`src/lib/image-appearance.ts`: ortalama renk + küçük önizleme; başarısızsa `null`, yükleme sürer). Oluşturma ve düzenleme yolları (`createRealPrompt`/`updateRealPrompt`) yazar. Düzenlemede korunan görsel değerlerini taşır (`MediaInput.existing`).
- Çizim: `StorageAppearanceImage` (`components/ui/storage-media.tsx`). Çerçeve önce kayıtlı renkle boyanır, üstüne önizleme bulanık konur, gerçek görsel yüklenince 500ms'de belirir, önizleme kalkar. Görünümü olmayan eski satırda düz `StorageImage`.
- Kart bandı (`CardBandBackdrop tint`): renk varsa bant `color-mix(renk %34, sayfa rengi)` ile boyanır. Her kartın arkasında büyütülmüş ve bulanıklaştırılmış görsel kopyası çizilmez. Renk yoksa eski bulanık bant.
- Detay bandı (`DetailBand tint`): renk hemen gelir, bulanık arka plan üstüne biner.
- Kullanıldığı yerler: prompt kartı kapağı, video/ses kapağı, Izgara (`FocusVisualCard`), başvuru kartı bandı, prompt detay kapağı, vitrin.
- Eski görseller: Moderasyon → "Görsel renklerini doldur" (`MediaAppearanceCard`). Görsel tarayıcıda signed URL ile okunur ve `admin_set_media_appearance` ile yazılır. `admin_media_missing_appearance` / `admin_media_appearance_stats` yardımcıları da `_admin_guard()` arkasında. Okunamayan görsel o çalıştırmada atlanır.

## 2. Kart → detay geçişi (mevcut FLIP geliştirildi, View Transitions eklenmedi)

`lib/card-transition.ts` zaten kart kapağını detay kapağına büyütüyordu. Ama detay veriyi yeniden çektiği için büyüme ya iskeletten sonra geç oynuyor ya hiç oynamıyordu. Paralel bir sistem kurulmadı, bu geliştirildi:

- **Devir** (`lib/detail-handoff.ts`): kart tıklanınca gönderisini bırakır, `LocalPromptView` ilk karede çizer. İskelet yok, büyüme ilk kareden başlar. Sınırlı bellek (40); yenileme ya da kimlik değişimi boşaltır.
- **Geri dönüş**: detaydan çıkarken kapak yerini kaydeder. Aynı adresin kartı geri gelince kapak oradan kendi kartına küçülür (`useCardMediaReturn`, `ContentCard` içinde).
- **Akış belleği**: `useFeedPages` ve `useForYouPages` yalnız tarayıcının Geri/İleri'siyle gelindiğinde (`lib/history-navigation.ts`, `popstate`) son durumu (yüklenmiş tüm sayfalar) geri koyar. Kaydırma yerinin altında içerik olur, kart da hemen oradadır. Normal girişte her zaman taze yüklenir. Ana Sayfa'nın son sekmesi de Geri'de `sessionStorage`'dan döner.
- Hareket azaltma açıksa hiçbiri oynamaz.

## 3. Canlı vitrin (misafir Ana Sayfası)

- `GuestShowcase` (`features/feed/guest-showcase.tsx`): solda başlık, açıklama, "Ücretsiz katıl" ve "Giriş yap". Sağda (telefonda altta) en çok beğenilen görsel promptlar (`feed_page` popular + image) iki sütunda zıt yönlerde yavaşça akar. CSS `showcase-drift`; her sütunda liste iki kez, kopya `inert` ve `aria-hidden`.
- Görsele dokununca akış durur ve prompt metni (mono) yukarı kayar. Kopyala ve "Gönderiyi aç" (↗) görünür. Fare üstündeyken ya da odak içerideyken de durur.
- 4'ten az görsel ya da hata olursa eski kompakt tanıtım gösterilir; boş duvar asla gösterilmez. Üye eskisi gibi kompakt yazma satırını görür.
- Bu, `HomeIntro`'nun "asla büyük hero yok" kararını yalnız misafir için değiştirir (kullanıcı isteği).

## 4. "Sana özel"

- `public.for_you_page(p_as_of, p_kinds, p_content_type, p_category, p_subcategory, p_limit, p_after_rank, p_after_created_at, p_after_id)`: SECURITY INVOKER, yalnız `authenticated`. Kapsam `feed_page` ile aynı (yayında, herkese açık, `community_id is null`). Kendi içeriği ve zaten beğendikleri girmez.
- Puan:
  - takip edilen kişi 600
  - takip edilen etiket 250 × (en çok 3)
  - profil ilgi alanı eşleşmesi 220
  - son 300 beğeninin etiketleri 90 × (en çok 3)
  - beğeni 2 × (en çok 300)
  - yaş: −1 / 6 saat, en çok −500
- Sayfalama `p_as_of` ile oturum boyunca sabit, `(puan, created_at, id)` keyset.
- Her satır nedenini taşır: `creator > tag > interest > liked_tag > popular`. `reason_ref` etiket slug'ı ya da ilgi alanı değeri. Arayüz yalnız gösterir; uydurma neden yazılmaz.
- İlgi alanı → içerik eşlemesi SQL'de sabit (`INTEREST_OPTIONS` → tür/kategori). Örnek: Fotoğrafçılık → image/photography; Video Üretimi → tüm video; Müzik ve Ses → tüm audio + video/music_video.
- Arayüz:
  - Ana Sayfa'nın ilk balonu "Sana özel" (`UserStar`); oturumlu kullanıcının varsayılanı. Misafir "En yeni"de açılır, Sana özel'de giriş ister.
  - Üstte "İlgi alanların" çipleri: `profiles.interests`'in kendisi. Yalnız bu sütun yazılır (`updateOwnInterests`), profilde de görünür. Hata olursa eski seçim geri gelir.
  - Seçim değişince akış baştan yeniden sıralanır. Eski liste solukça ekranda kalır, gelen sırada kartlar yeni yerlerine kayar (`FeedGrid flip`, FLIP).
  - Her kartın üstünde tek satır neden (`ForYouReasonNote`): "Takip ettiğin X paylaştı", "Takip ettiğin #etiket etiketinden", "İlgi alanın: …", "Beğendiğin #… gönderilerine benziyor", "Şu an popüler".
  - Izgara görünümünde neden satırı yok.

## Doğrulama

- Yerel PostgreSQL: `supabase/tests/for-you.sql` 13 kontrol, `FAILED=0`. Kapsadığı: anon çağıramaz; kendi/beğenilmiş/gizli/taslak girmez; nedenler; sıra; keyset; `p_as_of`; tür süzgeci; moderatör RPC'leri ve CHECK'ler. Bütün 18 SQL test dosyası ayrı ayrı temiz veritabanında `FAILED=0`.
- `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` 369/369, `npm run build`.
- Ağ taklitli Playwright: `tests/messaging-ui/run-home-motion.mjs` 9/9.
  - vitrin akar/durur/açılır
  - az görselde kompakt tanıtım
  - Sana özel varsayılan, nedenler, çipler
  - ilgi alanı kaydı + yeniden dizilme animasyonu
  - İngilizce
  - kayıtlı renkle bant + önizlemenin kalkması + renksiz eski kart
  - kart → detay iskeletsiz + büyüme + geri dönüşte liste yerinde + küçülme
  - hareket azaltma
  - 1280px taşma yok
  - Diğer UI paketleri de çalıştırıldı (rapor).
- İngilizce karşılıkların hepsi eklendi (`showcase.*`, `forYou.*`, `home.tabForYou`, `feed.emptyForYou*`, `moderation.appearance*`).

## Denenmedi / bilinen sınırlar

- Gerçek Supabase'e, gerçek veriye (sıralama kalitesi), gerçek cihaza (iOS Safari: FLIP, `mask-image`, akan sütunlar) karşı denenmedi.
- `for_you_page` her sayfada tüm adayları puanlar. Bugünkü veri boyutunda (yüzlerce satır) sorun değil; on binlerce satırda ön filtre ya da materyalize puan gerekir.
- Görünüm yalnız prompt görsellerinde. İstek, workflow ve hazır ayar kapakları ile video/ses kapağı (sonuçtan gelen küçük resim) renksiz kalır, eski bant çizilir.
- Kart geçişi ve devir yalnız promptlarda (mevcut FLIP de öyleydi). Geri dönüş küçülmesi, kart geri dönen listede ilk karede varsa oynar (akış belleği). Kaydırma yeri tarayıcı/Next geri yüklemesine bağlıdır.
- Eski görseller için moderatörün doldurma aracını bir kez çalıştırması gerekir; o zamana kadar eski kartlar eski bulanık bantla çizilir.
