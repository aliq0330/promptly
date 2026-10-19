# 198 — Hikâyeler (Stories)

**Durum:** uygulandı (istemci + migration). Migration'lar repoda, yerel PostgreSQL'de sınandı, **canlıya UYGULANMADI**. Arayüz ağ
taklitli Playwright'ta sınandı; gerçek Supabase'e / oturuma / telefona / gerçek video dosyalarına karşı **denenmedi**.

## Neden
Kullanıcı, Ana Sayfa'daki ve kendi profilindeki "topluluk halkaları"nın (hikâyeye benzeyen yuvarlak topluluk avatarları,
`community-rings.tsx`) kaldırılmasını ve yerine gerçek bir hikâye sistemi kurulmasını istedi: fotoğraf / kısa video / metin /
Promptly içeriği; tepki, özel yanıt, anket, soru; görüntüleyenler; herkese açık / takipçiler / topluluk hedef kitlesi; arşiv,
öne çıkanlar, taslaklar; bildirim ve moderasyon. Reels benzeri ayrı video akışı kapsam DIŞI.

## Mimari kararlar
- **Statik export korunur.** Sunucu çalışma zamanı yok; her yazma bir SECURITY DEFINER RPC (`auth.uid()`), her okuma RLS. Service
  role anahtarı tarayıcıya girmez. Yükleme ilerlemesi için Storage REST'e kullanıcının KENDİ oturum anahtarıyla XHR yapılır.
- **Görünürlük tek yerde:** `_story_visible(id, author, audience, community, expires_at, moderation_status)`. Okuma politikası,
  Storage politikası (`can_read_story_media`), şerit, etkileşim RPC'leri ve öne çıkan politikaları hepsi onu çağırır.
  - sahibi her zaman · site moderatörü her zaman · kaldırılan (`removed`) kimseye · engel (iki yön) görünmez ·
  - süresi dolan yalnız bir öne çıkandaysa ve ASIL hedef kitle izin veriyorsa · `public` herkes (ziyaretçi dahil) ·
  - `followers` yalnız takipçi (takipten çıkan/engellenen anında kaybeder) · `community` yalnız ÜYE (herkese açık toplulukta bile;
    ayrılan/çıkarılan anında kaybeder, topluluk silinirse hikâye de silinir).
- **Öne çıkan bir hikâyeyi AÇMAZ.** Öne çıkan, çağıranın görebildiği en az bir öğe varsa görünür; öğeler tek tek süzülür.
- **Süre sunucu saatidir:** `expires_at = now() + 24 saat` yalnız `create_story` yazar. Süresi dolan hikâye anında aktif listelerden,
  etkileşimden (yeni tepki/oy/yanıt `story_expired`) ve yetkisiz dosya erişiminden çıkar — temizlik işine bağlı değildir.
- **İdempotent yayımlama:** istemci oturum başına bir `client_token` üretir; `(author_id, client_token)` UNIQUE; aynı jetonla ikinci
  çağrı ilk hikâyenin kimliğini döner (çift dokunma / ağ yeniden denemesi). Yükleme yeniden denemesi AYNI nesne yoluna yazar
  ("zaten var" başarı sayılır) → çift dosya yok.
- **İçerik bağlantısı kopya değildir:** yalnız `linked_type` + `linked_id`; yalnız yayında + herkese açık + topluluğa ait olmayan içerik
  bağlanabilir (sunucu `_community_content_info`). Kart izleyicinin kendi RLS'iyle okunur; içerik gizlenir/silinirse kart
  "erişilemiyor" der (mesajlaşmadaki `Shared*Card` yeniden kullanıldı).
- **Özel yanıt = mevcut mesajlaşma.** `reply_to_story` → `start_direct_conversation` (gizlilik/engel kuralları aynen) + `messages`
  satırı (`story_id`, `is_story_reply`). İstemci `story_id`'li mesaj YAZAMAZ (INSERT politikası). Hikâye silinince `story_id → null`
  ama `is_story_reply` kalır; sohbet kartı hikâyeyi yeniden RLS'le okur, göremiyorsa "artık mevcut değil" der.
- **Anket:** `(story_id, voter_id)` PRIMARY KEY → kişi başına tek oy; politika: hikâye etkinken oy DEĞİŞTİRİLEBİLİR; sayılar oy
  satırlarından hesaplanır; sonuçlar sahibine ve oy vermiş olana açılır.
- **Soru:** yanıtlar yalnız yanıtlayan + sahip okur; kişi başına hikâye başına ≤5. Sahip bir yanıtı "Hikâyede paylaş" ile YENİ bir
  hikâyeye taşıyabilir (yanıtlayanın adı eklenmez; yanıtlayana bu, yanıt verirken açıkça yazılır). Otomatik yayım yok.
- **Görüntüleme:** `(story, viewer)` başına tek satır = benzersiz görüntüleyen (`viewer_count`); aynı kişinin ≥10 dk arayla yeniden
  izlemesi `view_count`'u artırır. Yalnız `mark_story_viewed`; görüntüleyen listesi yalnız sahibine (`story_viewers`).
- **Bildirim:** yeni türler `story_reaction`, `story_poll_vote`, `story_question_answer` (+ yanıt mesajı "Hikâyene yanıt verdi").
  (alıcı, aktör, tür, hedef) başına bir kez; kendine yok; engel varsa yok. Yeni hikâye için takipçilere bildirim GÖNDERİLMEZ
  (gürültü; şeritteki görülmemiş halka yeterli). Hedef `/stories?id=` — bağlantı tek başına erişim vermez.
- **Realtime:** yeni kanal açılmadı. Bildirimler mevcut bildirim aboneliğinden gelir; sahibin görüntüleyen listesi açıkken 20 sn'de bir
  tazelenir; şerit görünür hâle dönüşte (≥60 sn) ve ağ geri gelince tazelenir.
- **Saklama:** `profiles.story_archive_enabled` (varsayılan açık; Arşiv sayfasından değişir). Açıkken süresi dolanlar 365 gün, kapalıyken
  1 saat sonra silinir; öne çıkandakiler kaldırılana kadar kalır. Taslaklar 30 gün. `purge_expired_stories()` yalnız `service_role`'e
  açık; `20260920170100_stories_cron.sql` `pg_cron` varsa saatlik iş kurar (yoksa hiçbir şey yapmaz). Dosyalar satır silinince yetim
  kalır (kimse okuyamaz) ve mevcut `cleanup-orphan-storage` (Storage API) ile silinir; `orphan_storage_objects` hikâye/taslak
  medyasını "kullanımda" sayar. Hesap silmede kullanıcının yetim dosyaları zaten silinir.
- **Medya:** PRIVATE `story-media` bucket (40 MB, jpeg/png/webp/mp4/webm/mov), yol `{kullanıcı}/{uuid}.{jpg|mp4|webm|mov}` (Storage
  politikası adı da doğrular). Fotoğraf ortak `shrinkImage` ile küçültülür (≤1920px, ≤2 MB, metadata/GPS düşer). Video olduğu gibi
  yüklenir; tür ilk baytlardan (`ftyp` / EBML), süre tarayıcı metadata'sından (≤60 sn), boyut ≤40 MB. Video belleğe okunmaz (nesne
  URL'si + XHR). **Sunucu tarafı video dönüştürme/küçük resim YOK** (servis yok; çalışıyormuş gibi gösterilmedi).
- **Moderasyon:** `reports.target_type` + `story`; moderatör kuyruğunda bağlantıyla görünür, "kaldır" → `moderation_status='removed'`.
  Site moderatörü görüntüleyicide de kaldırır/geri alır (`moderate_story`). Topluluk hikâyesini `moderate_posts` yeteneği olan (ve
  rütbesi yazardan yüksek) kişi kaldırır (`remove_community_story`), yazara sistem bildirimi gider.
- **Hesap askısı / paylaşım engeli** `create_story`'de; mesaj yanıtı mevcut `enforce_can_post` tetikleyicisinden geçer.

## Veri modeli (`20260920170000_stories.sql`)
`stories` (tür, medya kimliği + boyut/süre, sürümlü `layout` JSON — `_story_layout_ok` CHECK, bağlantı, çıkartma, hedef kitle,
`client_token`, `expires_at`, moderasyon, korumalı sayaçlar) · `story_views` · `story_reactions` · `story_poll_votes` ·
`story_question_answers` · `story_highlights` + `story_highlight_items` · `story_drafts` · `messages.story_id/is_story_reply` ·
`profiles.story_archive_enabled`. RPC: `create_story`, `reshare_story`, `mark_story_viewed`, `set_story_reaction`, `vote_story_poll`,
`story_poll_results`, `answer_story_question`, `reply_to_story`, `story_viewers`, `story_tray`, `save_story_highlight`,
`add_story_to_highlight`, `reorder_story_highlights`, `moderate_story`, `remove_community_story`, `purge_expired_stories`.
Değiştirilen (`create or replace`, gövde aynı + hikâye dalı): `notify_new_message`, `moderate_report`, `moderation_report_queue`,
`orphan_storage_objects`; genişletilen CHECK'ler: `notifications_type_check`, `reports_target_type_check`; mesaj INSERT politikası.
**`drop` yok** (iki CHECK aynı adla yeniden kuruldu, mevcut satırlar geçerli kalır).

Düzen JSON'u: `{ v: 1, bg?, fit?, layers: [{ id, text ≤300, x, y ∈ [0,1], align, size s|m|l|xl, color (adlandırılmış), bg }] ≤ 8,
link?: {x,y}, sticker?: {x,y} }` — hex renk saklanmaz; istemcideki `parseStoryLayout` aynı kuralların aynasıdır.

## İstemci
- `features/stories/`: `story-tray` (Ana Sayfa + topluluk akışı), `story-viewer-provider` (her sayfanın üstünde katman; rota değişmez →
  kaydırma korunur; kod yalnız açılınca yüklenir), `story-viewer` (ilerleme, dokun/basılı tut/yatay kaydır/aşağı çek, ←/→/Boşluk/Esc,
  odak tuzağı, `visibilitychange`'te durma, medya hazır olmadan/menü-alt sayfa-yazma alanı açıkken süre işlemez, klavye açılınca
  `visualViewport`'a oturur), `story-viewer-sheets` (sahip etkinliği: görüntüleyenler + engelle, anket sonuçları + kim ne verdi,
  yanıtlar + hikâyede paylaş; şikâyet; silme onayı; yeniden paylaş; öne çıkana ekle), `story-stickers`, `story-canvas` (tek çizim:
  görüntüleyici/düzenleyici/küçük resim/mesaj kartı; `cqw` ile ölçeklenir), `story-creator` (tek düzenleyici: foto/video/metin/içerik,
  sürüklenebilir katmanlar + ok tuşlarıyla kaydırma, zemin, Sığdır/Doldur, anket/soru, hedef kitle, taslak, önizleme, ilerlemeli
  yükleme + tekrar dene, `beforeunload` uyarısı), `story-content-picker`, `story-audience-picker`, `story-highlights` (profil satırı,
  avatar halkası `useProfileStories`, düzenleyici), `story-archive-view`, `story-page` (`/stories?id=`), `story-reply-card`.
- Rotalar: `/stories?id=`, `/stories/create` (`?community=`, `?link=tür:id`, `?draft=`, `?story=&answer=`), `/stories/archive`.
- Entegrasyon: Ana Sayfa'da `CommunityRings` → `StoryTray`; profilde topluluk halkaları → öne çıkanlar; profil avatarının dekoratif
  turuncu halkası artık GERÇEK hikâye halkası (görülmemiş = turuncu, görülmüş = sakin, yok = ince); topluluk akışının üstünde
  topluluk şeridi (yalnız üyeye; paylaşma hakkı akış kuralıyla aynı); "Oluştur" seçicisinde Hikâye; Paylaş penceresinde "Hikâyende
  paylaş" (yalnız yayında + herkese açık içerik); mesaj balonunda hikâye yanıtı kartı; moderasyon kuyruğunda "Hikâye" türü.
- Renk: hikâye yazarın seçtiği renklerle her izleyicide AYNI görünmeli → `globals.css`'e sabit `--color-story-*` token'ları
  (palete bağlı değil). Bileşenlerde hex yok.
- `StorageVideo` artık dış `ref` alır (görüntüleyici oynatmayı yönetir); `PROTECTED_MEDIA_BUCKETS` + `story-media`.

## Çeviri
İngilizce karşılıklar EKLENDİ: `lib/i18n/translations-stories.ts` (tüm `stories.*`, `share.toStory*`, `create.story*`,
`moderation.type.story`, `notifMsg.story*`); SQL bildirim cümleleri Türkçe kalır ve `notification-message.ts` kalıplarıyla çevrilir.
Kullanılmayan `home.rings*` anahtarları silindi.

## Sınama
- `supabase/tests/stories.sql`: **65 kontrol, FAILED=0** (görünürlük matrisi: yazar/takipçi/yabancı/topluluk üyesi/engelli/ziyaretçi;
  idempotentlik; düzen/medya/bağlantı/çıkartma doğrulaması; şerit kapsamı; görüntüleme sayacı penceresi; tepki/oy/yanıt kuralları ve
  bildirim tekilliği; özel yanıt + istemcinin sahte yanıt yazamaması; Storage okuma/yazma ve yol doğrulaması; süre dolumu + öne çıkan
  + arşiv; topluluk yönetimi kaldırma + ayrılınca erişim kaybı; şikâyet → moderasyon; taslak gizliliği; yeniden paylaşım; temizlik ve
  yetim taraması). Önceki 16 SQL dosyası da `FAILED=0` (mesaj politikası, `notify_new_message`, moderasyon fonksiyonları değişti).
- `src/lib/stories.test.ts`: 10 birim testi (düzen doğrulaması, çıkartma, boş hikâye, süreler, süre dolumu, video türü tespiti, anket
  yüzdeleri, taslak doğrulaması); `npm test` toplamı raporda.
- `tests/messaging-ui/run-stories.mjs` (ağ taklidi `mock-stories.mjs`): şerit, görüntüleyici gezinmesi + başlangıç noktası,
  sahte saatle otomatik ilerleme/duraklatma, hareketler, tepki/yanıt, anket/soru, sahip paneli + silme, metin/fotoğraf oluşturma
  (yükleme hatası → aynı yola tekrar), içerik türü doğrulaması, taslak + bağlantı, `/stories?id=` gizliliği, profil halkası + öne
  çıkan, arşiv, mesaj kartı, İngilizce/390px/koyu tema, misafir, masaüstü — **21/21**. Senaryo 2b ilk koşuda gerçek bir hatayı
  yakaladı (tembel yüklenen grupta ilk görülmemişten başlanmıyor, 0. hikâye bir an gösterilip "görüldü" işaretleniyordu); konum artık
  grup anahtarıyla tutulur.
- Regresyon (aynı build): `run` 24/24, `run-chat` 38/38, `run-groups` 36/36, `run-community-posts` 36/36, `run-community-home` 38/38,
  `run-create-destination` 10/10, `run-detail-pages` 44/44, `run-shared-cards` 11/11, `run-profile-collections` 4/4,
  `run-communities` 64/65 → 23 (dokunma hedefi ≥36px) topluluk şeridindeki "+" rozeti ve "Tekrar dene" yüzünden kırılmıştı, düzeltildi;
  33b (topluluk kapağı imzalı URL) tam koşuda bir kez aralıklı başarısız oldu, tek başına 3/3 ve önceki tam koşuda geçti (hikâye
  koduyla ilgisi yok).

## Bilinen sınırlar / açık işler
- Canlıya uygulanmadı: sıra `20260920170000_stories.sql` → (isteğe bağlı) `20260920170100_stories_cron.sql` → istemci. Yeni istemci
  yeni RPC'leri/tabloları çağırır; migration olmadan şerit "yüklenemedi" der, mesajlar `story_id` sütununu bulamaz (MESSAGE_SELECT)
  → **önce migration**.
- `pg_cron` canlıda etkin mi bilinmiyor; değilse Dashboard → Integrations → Cron'dan `select public.purge_expired_stories()` saatlik
  kurulmalı. Yetim dosya silme moderatörün tetiklediği `cleanup-orphan-storage` ile (zamanlanmış değil).
- Video küçük resmi/sıkıştırma yok; iOS Safari'de video küçük resmi ilk kare yerine koyu zemin + simge olabilir.
- Gerçek cihazda (iOS klavye, aşağı çekme, sesli otomatik oynatma politikası) denenmedi. Sesli oynatma engellenirse sessize düşer.
- Kırpma = "Doldur (kırp)" / "Sığdır" seçimi; serbest yakınlaştırma/kaydırma yok.
- Hikâye susturma (bir kişinin hikâyelerini şeritten gizleme) ve "yakın arkadaşlar" listesi yok.

## Demo tohumu
`supabase/seed/stories-demo.sql` (elle çalıştırılır, tekrar çalıştırması güvenli): demo hesapların (5eed…) ve `aliq`'ın 20 hikâyesi — renkli metin
hikâyeleri, gerçek herkese açık prompt'lara bağlı kartlar, 3 anket, 2 soru, topluluk (yazarın üyesi olduğu `aliq` topluluğu; yoksa herkese
açığa düşer) ve 1 takipçiye özel hikâye, süresi dolmuş 2 hikâye + "Işık denemeleri" öne çıkanı; görüntüleme/tepki/oy/yanıt satırları ve
satırlardan hesaplanan sayaçlar. `aliq` demo yazarları takip eder (şerit için). Fotoğraf/video yok (private Storage dosyası gerekir).
Zamanlar çalıştırma anına göre ve hikâye 24 saatte dolar. Yerel PostgreSQL'de sınandı (20 hikâye, ikinci çalıştırma 0, takipçiye özel hikâye
yabancıya görünmedi); canlıya UYGULANMADI. Ekran görüntüleri için `tests/messaging-ui/shots-stories.mjs` (`SHOT_DIR`).

## Telefonda tam ekran düzeltmesi
iPhone Safari'de (kullanıcı ekran görüntüsü) görüntüleyici ekranı kaplamıyordu: tuval 9:16'ya kilitliydi ve tepki/yanıt çubuğu tuvalin ALTINDA ayrı şerit olduğundan yanlarda/altta siyah boşluk kalıyordu; üstte de Safari durum çubuğu sayfanın krem `theme-color`'ıyla görünüyordu. Şimdi: `< sm`'de tuval görünür alanı tamamen kaplar (katman konumları oran, yazı boyutları `cqw` olduğundan her en-boy oranında aynı yerleşim; medya `cover`/`contain` ayarına uyar), alt çubuk tuvalin ÜSTÜNE biner (koyu degrade); `sm+`'da eski 9:16 kart + altta çubuk. Görüntüleyici açıkken `theme-color` hikâye zeminine (siyah) çevrilir, kapanınca eski renge döner. Test: `run-stories` 18b (tuval = görünür alan, çubuk üstte, theme-color) — 22/22. Gerçek iPhone'da denenmedi; Safari sekmesinde tarayıcı çubukları (adres/alt araç çubuğu) uygulamanın dışındadır, gerçek tam ekran için ana ekrana ekle (PWA) gerekir.
