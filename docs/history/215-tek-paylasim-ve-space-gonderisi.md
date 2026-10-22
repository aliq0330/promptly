# 215 — Tek paylaşım ekranı, yayın adımı ve Space gönderisi

**Durum:**
- İstemci kodu ve `20260921150000_space_posts.sql` repoda.
- Migration yerel PostgreSQL'de sınandı: `supabase/tests/space-posts.sql` 39/39. Temiz veritabanında tüm migration'lar baştan oynatıldı, diğer 22 SQL test dosyası `FAILED=0`.
- Migration **canlıya UYGULANMADI**. Önce migration, sonra istemci uygulanmalı. Yeni istemci `space_feed_cards`, `set_space_shared` ve `community_posts.space_id`'yi kullanır; migration yoksa:
  - Ana Sayfa / Keşfet akışı Space satırı almaz (eski `feed_page` Space döndürmez, sorun yok).
  - Topluluk akışı `space_id` sütununu seçemediği için **hata verir**.
- Arayüz ağ taklitli Playwright'ta sınandı (ayrıntı aşağıda).
- Gerçek Supabase'e, gerçek oturuma, cihaza ya da iOS Safari'ye karşı **denenmedi**.

Kullanıcının isteği:
- Space yalnız toplulukta değil, gönderi olarak da paylaşılabilsin.
- Topluluktaki başvuru normal gönderiler gibi görünsün.
- Paylaşma tek ekrandan ayarlansın.

Kullanıcı altı fazlık planı (görsellerle) onayladı: "Önerilerinle devam hepsini tekte yap".

## Kavramlar

- **Paylaş** (zaten var olan bir şeyi başkalarına ulaştırmak) tek penceredir: `ShareModal`.
- **Yayın adımı** (yeni içeriğin kimin göreceği) her oluşturma formunun sonundaki tek alandır: `CreateFormActions`.
- **Duyurmak:** var olan herkese açık bir içeriği bir topluluğun akışına başvuru gönderisi olarak koymak (`share_to_community`). İçerik kopyalanmaz, otomatik herkese açılmaz.
- **Space gönderisi:** sahibi açıkça "Akışta gönderi olarak paylaş" derse (`shared_at`), herkese açık Space Ana Sayfa / Keşfet akışında bir gönderidir. Kendi beğenisi, yorumu, istatistiği ve bildirimi vardır.

## Faz 1 — Tek Paylaş penceresi (`share-modal.tsx`)

Sıra:
1. "Kim görsün?" — yalnız Space sahibine: `SpaceShareSettings`, eski `ShareSpaceModal` gövdesi + akış anahtarı.
2. **Topluluklarda duyur** (`AnnounceSection`): üye olunan topluluklar çoklu seçilir, not eklenir, "N toplulukta duyur".
   - Sonuç topluluk başına satırda yazılır (başarılı / nedeniyle başarısız).
   - Herkese açık olmayan içerikte satır nedenini söyler ve açılmaz.
3. Mesajla gönder, hikâyede paylaş, başka yerde paylaş (bağlantı).
4. **Kendin için:** Space'e ekle, Koleksiyona kaydet. Pencerenin yerine ilgili pencere açılır.

Space sayfası ve Space kartı da artık bu pencereyi açar. Önceki durum: sahibe ayrı pencere, ziyaretçiye `navigator.share`. Şimdi ziyaretçi de duyurabilir ya da bağlantı paylaşabilir.

## Faz 2 — Oluştur (`create-choice.tsx`, `share-existing-modal.tsx`)

- Altıncı karo **Space oluştur**: `/spaces?new=1` Spaces sayfasında oluşturma penceresini bir kez açar, parametre adresten silinir. Ziyaretçiye giriş diyaloğu açılır.
- Karoların altında **Var olan içeriği paylaş**:
  - Kendi yayındaki + herkese açık içeriklerin ve herkese açık Space'lerin listelenir (`fetchOwnShareableContent`, tür sekmeli).
  - Seçilen içerik aynı `AnnounceSection` ile duyurulur; "İçeriği aç" bağlantısı da var.

## Faz 3 — Yayın adımı (`CreateFormActions`, `AudienceField`)

Eski "Nerede paylaşmak istiyorsun?" seçicisi (`ShareDestinationField`, 197) ile Görünürlük anahtarı TEK alanda birleşti: **"Kim görsün?"**.

Seçenekler:
- **Herkese açık** (varsayılan).
- **Sadece ben** (görünürlük `private`).
- **Sadece bir topluluk**: aynı topluluk seçicisi (`DestinationPicker`) açılır; içerik topluluğa özgü olur, taslak olmaz.

Ayrıntılar:
- Seçenek satırı seçilen topluluğun adını ve logosunu gösterir.
- Seçilemeyen seçenek çizilmez. Yanıt modunda "Sadece ben" yok; düzenlemede "topluluk" yok.
- **Topluluklarda da duyur:** yalnız yeni + herkese açık içerikte (düzenlemede yok).
  - Seçim, içerik oluşunca gönderilir: formların zaten çağırdığı `useCommunityReturn` → `runPendingAnnounce`.
  - Sonuç sayfa değişse de kaybolmasın diye `sessionStorage`'a yazılır.
  - Uygulama kabuğunda `AnnounceReportNotice` gösterir: "Duyuruldu: A" + "Şu topluluklarda duyurulamadı: C — neden".
  - Kısmi başarısızlık dahil, sessiz başarı yok.
- **"Ne olacak" cümlesi** (`data-publish-summary`), seçime göre:
  - "Herkes görebilecek: Ana Sayfa'da, Keşfet'te ve profilinde…" / "… ve N toplulukta duyurulacak."
  - "Yalnızca sen göreceksin…"
  - "X topluluğuna ait olacak…"
- **Yapılmadı:** yayın adımında içeriğin kart önizlemesi. Form verisi `CreateFormActions`'a taşınmıyor; her formda ayrı önizleme gerekirdi.

## Faz 4 — Space = akışta gönderi

**Veritabanı** (`20260921150000_space_posts.sql`):
- `spaces.shared_at` / `like_count` / `comment_count`.
  - Sayaçlar `protect_counter_columns` ile korunur, SECURITY DEFINER tetikleyicilerle sayılır.
  - `shared_at`'i istemci yazamaz (`spaces_guard_shared`). Space herkese açıklıktan çıkınca ya da arşivlenince `shared_at` silinir.
- `set_space_shared(space, bool)`: yalnız sahip, herkese açık + arşivsiz.
  - Akışa girmek için en az 3 öğe ve 1 görsel gerekir (`space_too_empty`). Boş Space'ler akışı doldurmasın.
  - Yeniden paylaşımda ilk `shared_at` korunur; akışın başına zıplatma yok.
- Beğeni/yorum **yedinci hedef**: `prompt_likes.space_id`, `prompt_comments.space_id`.
  - "Tam biri dolu" CHECK'leri yeniden kuruldu: `drop constraint` + `add`. Plan onayıyla; veri silinmez, yalnız kısıt genişler.
  - `enforce_space_engagement`: herkese açık + arşivsiz + paylaşılmış + engelsiz; yanıt aynı Space'te.
  - Okuma politikaları hedefi izler (`can_read_space`).
- Bildirimler:
  - "Space'ini beğendi", "Space'ine yorum yaptı", yanıt / yorum beğenisi / anma için Space dalları.
  - Space silinince bildirimleri temizlenir.
- İstatistik (`content_engagers`, kaydedenler Space için boş) ve şikâyet (`reports.target_type = 'space'`, moderasyon kuyruğu, "kaldır" = özel + akıştan çıkar).
- `feed_page` aynı 13 argümanlı imzayla `create or replace` edildi (`drop` yok).
  - Space satırının zamanı `shared_at`, popülerlik `like_count`.
  - Tür/kategori/etiket/araç süzgecinde ve `tags` kapsamında Space yok; "Takip" = sahip.
- `space_feed_cards(ids)` (INVOKER): kart verisi + ilk paletin renkleri.

**Arayüz:**
- `SpaceFeedCardView`: diğer gönderilerle aynı Albüm kartı.
  - Kolaj, palet çizgisi, "Panoyu gez".
  - Beğeni · Yorum · İstatistik · Paylaş; Space kaydedilmez.
  - ⋮: bağlantı, sahibe "Akıştan kaldır".
- Space sayfası: akışta paylaşılmışsa eylem satırında Beğeni · Yorum · İstatistik.
  - Pano dışı sekmelerin altında yorumlar (`#comments`, `hl=comment:` vurgusu) ve sahip olmayana Şikâyet.
- Akış anahtarı `SpaceShareSettings`'te ("Akışta gönderi olarak paylaş", varsayılan KAPALI).
- **Keşfet → Spaces** bölümü (`feed_page p_kinds=['space']`; süzgeç çipleri o bölümde yok).
  - Izgara görünümü yalnız gönderi çıktısı çizer; listede yalnız Space varsa kart görünümü kalır.
- Odak, Sana özel ve Izgara Space satırını almaz: `PostEntry` / `PostFeedItem` / `isPostItem`.
- **Yapılmadı:** `/share/space/...` statik paylaşım sayfası. Space bağlantısı Space'in kendi adresidir; önizleme site kartıdır.

## Faz 5 — Space'i toplulukta duyurmak

- `community_posts.space_id`: altıncı başvuru hedefi, yalnız `application`.
- `share_to_community` Space dalı: yalnız sahibin herkese açık + arşivsiz Space'i.
- Topluluk akışında `ApplicationCard` Space kolajı + palet çizgisi çizer.
- Başvuru sayfası (`/communities/post/local`) Space için kapak kolajı + başlık + "Space'i aç" ve gönderinin kendi beğeni/yorumunu gösterir. Space'in detay sayfası yok; pano/vitrin kendi sayfasıdır.

## Faz 6 — Başvuru = normal gönderi, "Duyuruldu"

- Topluluk akışında başvuru zaten normal kart ailesindeydi (`ApplicationCard`). Rozeti "Başvuru" → **"Duyuruldu"** (en "Announced").
- Sayaçlar bağlama özgü kaldı (seçenek a, veri taşıma yok). Gerekçe: canlıda 55 başvurudan 11'i herkese açık olmayan toplulukta; o yorumları içeriğin genel sayacına katmak kapalı topluluğu sızdırırdı.
- **Genel akışta "duyuruldu" çipi** (`AnnouncedChip`): `FeedGrid`, görünen içeriklerin başvuru gönderilerini tek sorguda okur (`fetchAnnouncedIn`; `community_posts` RLS'i — okunamayan topluluk görünmez; adlar `community_cards`'tan).
  - Kart rozet satırında "X topluluğunda duyuruldu" / "N toplulukta duyuruldu".
  - Hata çipi gizler.

## Sınama

- SQL: `space-posts.sql` 39/39 (paylaşım kuralları, sayaçlar, istemci yazma korumaları, akış, bildirim, istatistik, şikâyet, topluluk duyurusu, ziyaretçi); diğer 22 dosya `FAILED=0`.
- `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` 400/400, `npm run build` temiz.
- Playwright:
  - `run-create-destination` yeniden yazıldı, 11/11: "Kim görsün?", Sadece ben, topluluk, duyuru + kısmi hata raporu, mobil, İngilizce.
  - `run-community-posts` "Duyuruldu" ve yeni alanla güncellendi.
  - `run-spaces` 25. senaryo yeni Paylaş penceresiyle güncellendi.
  - Yeni `run-space-posts` (Space akış kartı, Space sayfası etkileşimi, akış anahtarı, Keşfet Spaces, Oluştur karoları, duyuruldu çipi, topluluktaki Space başvurusu).
  - Bütün takımların sonuçları rapordadır.
- İngilizce karşılıklar eklendi (`translations.ts`, `translations-spaces.ts`, `translations-communities.ts`).
