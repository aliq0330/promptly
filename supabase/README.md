# Promptly — Supabase migrations

Bu klasördeki `migrations/*.sql` dosyaları, `src/types/index.ts`'teki mock
veri modelini birebir yansıtan gerçek Postgres şemasını (CLAUDE.md Bölüm
18), her tablonun gerçek erişim kurallarını (RLS politikaları, Bölüm 19)
ve görsel yükleme için Supabase Storage bucket'larını (Bölüm 20) oluşturur.
Dosyalar sırayla (dosya adındaki zaman damgasına göre) uygulanmalıdır.

**Durum:** Bölüm 18 şema + Bölüm 19 RLS + Bölüm 20 Storage'dan başlayıp,
mesajlaşma genişletmesi Faz A/B/C (`20260919200000`–`20260919220000`,
Bölüm 9.8/9.9/9.10), bildirim hedefleme/önizleme (`20260919230000`, Bölüm
9.12), mesaj işlem menüsü + emoji tepkileri (`20260919240000`, Bölüm 9.13),
Remix Dallanma Haritası + Merge sistemi (`20260919250000`, Bölüm 9.14) ve
koleksiyon sistemi (`20260919260000`–`20260919270000`, Bölüm 9.19/9.22)
dahil, ve gelişmiş/canlı etiket sistemi (`20260919280000`, Bölüm 9.23) —
kullanıcı tarafından Dashboard → SQL Editor ile gerçek Supabase projesine
sırayla uygulandı ve hepsi hatasız çalıştı. **En son eklenen
`20260919290000_prompt_variables_and_edit_tracking.sql`
(prompt değişken sistemi + kopyalama + düzenleme geçmişi/bildirimi, Bölüm
9.25) henüz kullanıcı tarafından uygulanmadı** — yalnızca yerel bir
Postgres 16 örneğinde gerçekten test edildi (bkz. aşağıdaki "Nasıl
doğrulandı" bölümü ve CLAUDE.md Bölüm 9.25); kullanıcının Dashboard → SQL
Editor ile bu son dosyayı da sıraya eklemesi gerekiyor. Bu ortamın (Claude Code'un çalıştığı
sandbox) ağ politikası gerçek Supabase projesine doğrudan erişimi
engellediğinden, her migration önce yerel/geçici bir Postgres 16
örneğinde test edilip (bkz. aşağıdaki "Nasıl doğrulandı" bölümü) ancak
öyle teslim edildi — gerçek projeye fiilen uygulanması ve orada hatasız
çalışması kullanıcının kendi ortamında gerçekleşti. **Not:** "migration
hatasız çalıştı" ile "her yeni özellik gerçek kullanıcı hesaplarıyla
uçtan uca canlı denendi" ayrı şeyler — bu depodaki Playwright
testlerinin hiçbiri gerçek Supabase projesine karşı koşulmadı (yine aynı
ağ kısıtı yüzünden), yalnızca ağ seviyesinde taklit edilmiş yanıtlarla.
Şemanın/RPC'lerin gerçek projede var olduğu artık kesin; her akışın
(Realtime, merge, emoji tepkileri vb.) gerçek iki hesapla beklendiği gibi
davrandığı ancak kullanıcının kendi canlı denemesiyle doğrulanabilir.

## Nasıl uygularsınız

**Seçenek A — Supabase Dashboard (kod/CLI kurulumu gerektirmez):**

1. [Supabase Dashboard](https://supabase.com/dashboard) → projeniz → sol
   menüden **SQL Editor**'ü açın.
2. `migrations/` klasöründeki her dosyayı **dosya adındaki sıraya göre**
   (20260919120000, 20260919120100, ... 20260919120600, 20260919130000,
   20260919140000, 20260919150000, 20260919160000, 20260919170000,
   20260919180000, 20260919190000, 20260919200000, 20260919210000,
   20260919220000, 20260919230000, 20260919240000, 20260919250000,
   20260919260000, 20260919270000, 20260919280000, 20260919290000) tek
   tek açıp içeriğini SQL Editor'e yapıştırıp **Run**'a basın.
3. Her dosya başarıyla çalıştıktan sonra bir sonrakine geçin. Bir hata
   alırsanız durdurun ve hatayı paylaşın.

**Seçenek B — Supabase CLI (yerel kurulum varsa):**

```bash
supabase link --project-ref xqxybhjcyrvaroknucdq
supabase db push
```

## Bu migration'lar ne oluşturuyor

- `profiles` — her `auth.users` satırına 1:1 eşlenen genel profil bilgisi.
  Yeni bir kullanıcı kayıt olduğunda (`supabase.auth.signUp`, CLAUDE.md
  Bölüm 17) bir trigger otomatik olarak bir `profiles` satırı oluşturur;
  kullanıcı adı e-postanın `@` öncesindeki kısmından türetilir, çakışırsa
  rastgele bir sayı eklenir.
- `tags`, `prompt_requests`, `prompts`, `prompt_media`, `prompt_tags`,
  `prompt_request_tags` — içerik modeli. **Not:** ayrı bir
  `prompt_request_responses` tablosu YOK — CLAUDE.md'nin prompt-istek
  modülü (Bölüm 9/10) zaten bir isteğe verilen yanıtın gerçekte
  `origin_type = 'request_response'` olan bir `prompts` satırı olduğuna
  karar verdi; bu şema o kararı izliyor.
- `prompt_likes`, `prompt_saves`, `prompt_comments`, `follows` — sosyal
  etkileşimler, artı `profiles`/`prompts`/`prompt_requests` üzerindeki
  sayaçları (`like_count`, `follower_count`, `remix_count`,
  `response_count` vb.) güncel tutan trigger'lar.
- `conversations`, `conversation_members`, `messages`, `notifications` —
  mesajlaşma ve bildirimler.
- `reports`, `blocks` — CLAUDE.md §6'nın planladığı moderasyon tabloları
  (Bölüm 22'nin uygulama mantığı henüz yok, yalnızca şema hazır).

- `20260919130000_rls_policies.sql` (Bölüm 19) — her tabloya gerçek
  erişim politikaları ekliyor:
  - `profiles`, `tags`, `prompts` (yalnızca `status='published'`),
    `prompt_requests`, `prompt_media`, `prompt_tags`,
    `prompt_request_tags`, `prompt_likes`, `follows`,
    `prompt_request_tags` → **herkese açık okuma**, yazma yalnızca
    ilgili sahibine (author/user) özel.
  - `prompt_saves` → **yalnızca sahibine özel** (kaydedilenler kişisel,
    Pinterest/Twitter yer imleri gibi — başkası göremez).
  - `prompt_comments` → hedefi (prompt/istek) görülebilen herkes okuyabilir,
    yazma yalnızca kendi adına ve yalnızca görülebilen bir hedefe.
  - `conversations`/`conversation_members`/`messages` → yalnızca o
    konuşmanın üyeleri (üyelik kontrolü, RLS'in kendi kendine referans
    verme sorununu önlemek için `SECURITY DEFINER` bir yardımcı fonksiyon,
    `is_conversation_member()`, ile yapılıyor — Supabase'in resmi
    dokümantasyonunun önerdiği standart desen).
  - `notifications` → yalnızca alıcısı görebilir/okundu işaretleyebilir.
  - `reports`, `blocks` → yalnızca oluşturan kullanıcı görebilir (moderatör
    rolü/çapraz görünürlük Bölüm 22'nin işi).
  - **Önemli düzeltme:** Bölüm 18'in sayaç trigger'ları (`like_count`,
    `follower_count`, `remix_count`, `response_count`,
    `unread_count`/`last_message_at`) başka kullanıcıların satırlarını
    güncelliyor (ör. birinin promptunu beğenmek O KİŞİNİN `like_count`'unu
    artırır). RLS açılınca bu trigger fonksiyonları `SECURITY DEFINER`
    olmadan **sessizce başarısız olurdu** (UPDATE, RLS politikasını
    karşılamayan satırı basitçe etkilemez, hata bile vermez) — bu migration
    5 trigger fonksiyonunu da `SECURITY DEFINER` olarak yeniden tanımlayıp
    bu sorunu çözüyor (aşağıdaki doğrulama bölümünde bizzat kanıtlandı).

Her tabloda RLS **oluşturulduğu anda açık** olduğundan, `20260919130000`
uygulanana kadar tüm tablolar `anon`/`authenticated` anahtarlarıyla
tamamen kapalı kalır — güvenli tarafta kalan bilinçli bir ara durum.

- `20260919140000_storage.sql` (Bölüm 20) — üç **herkese açık okuma**
  bucket'ı oluşturuyor (uygulama bugün base64 data URL'e gömdüğü üç görsel
  türüne birebir karşılık geliyor): `avatars` (profil fotoğrafları, 2 MB
  sınır), `prompt-media` (`image` türü prompt görselleri, 10 MB sınır),
  `request-references` (isteklerdeki opsiyonel referans görseli, 5 MB
  sınır). Yazma her bucket'ta yalnızca kendi klasörüne (`{auth.uid()}/...`
  yol öneki, `storage.foldername(name)` ile kontrol ediliyor) izinli —
  başkasının klasörüne dosya yükleyemez/silemezsiniz. Yol kuralı (Bölüm
  21'in frontend uygulaması için): `avatars/{user_id}/avatar.<uzantı>`,
  `prompt-media/{user_id}/{prompt_id}-{n}.<uzantı>`,
  `request-references/{user_id}/{request_id}.<uzantı>`. Frontend bu
  bucket'lara henüz hiç yüklemiyor — hâlâ localStorage'daki base64 data
  URL'leri kullanıyor (`resizeImageToDataUrl`/`resizeImageToDataUrlFit`);
  gerçek bağlanma Bölüm 21'in işi.

- `20260919150000_request_response_workflow.sql` — prompt istekleri/yanıt
  sistemini sağlamlaştırıyor (Bölüm 9/10/21 Faz 5'in üzerine):
  - `prompts.show_on_profile` (varsayılan `true`) — bir yanıtın (`origin_
    type = 'request_response'` olan bir prompt) normal profil/akış/keşfet/
    arama sonuçlarında görünüp görünmeyeceği; isteğin kendi yanıt listesinde
    ve kendi detay sayfasında HER ZAMAN görünür kalır, bu yalnızca "normal
    gönderi" görünürlüğünü etkiler.
  - `prompt_requests.closed_by_owner` — isteğin "İsteği kapat" ile manuel
    mi kapatıldığı, yoksa bir yanıt seçildiği için mi kapandığı (`status =
    'answered'`) ayrımını tutar; bu ayrım olmadan bir isteği manuel
    kapatıp sonra bir yanıt seçip sonra o seçimi kaldırmak isteği
    yanlışlıkla tekrar "Açık" yapardı.
  - `prompt_requests_status_shape` CHECK kısıtı — bir yanıt seçiliyse durum
    yalnızca `'answered'`, seçili değilse yalnızca `'open'`/`'closed'`
    olabilir; veritabanı seviyesinde zorunlu.
  - `validate_prompt_response_target()` (BEFORE INSERT trigger, `prompts`)
    — kapalı/yanıtlanmış bir isteğe yeni yanıt eklenmesini **sunucu
    tarafında** reddeder (önceden yalnızca istemci butonu gizleniyordu).
  - `validate_selected_response()` (BEFORE UPDATE trigger, `prompt_
    requests`) — `selected_response_prompt_id`'nin gerçekten o isteğin bir
    yanıtı olduğunu zorlar; bu, RPC'yi atlayıp doğrudan bir UPDATE
    gönderen biri için bile geçerli.
  - `select_prompt_request_response(request_id, response_prompt_id)` RPC
    fonksiyonu — yanıt seçme/değiştirme/kaldırmayı tek, atomik bir işlemde
    yapar: sahiplik kontrolü (anlaşılır bir hatayla, RLS'in sessiz "0 satır
    etkilendi"si yerine), yanıtın bu isteğe ait olduğu kontrolü, ve
    seçimi kaldırırken `closed_by_owner`'a göre doğru duruma (`'open'` ya
    da `'closed'`) dönme mantığı.
  - `notify_new_request_response()`/`notify_selected_response()`
    (AFTER INSERT/UPDATE, `SECURITY DEFINER`) — bir isteğe yeni yanıt
    geldiğinde istek sahibine, bir yanıt seçildiğinde yanıt sahibine
    gerçek bir `notifications` satırı yazar (Bölüm 19'dan beri
    `notifications`'a client insert izni kasıtlı olarak yok — bu yüzden
    gerçek bildirim üretimi ancak böyle bir sunucu tarafı trigger'la
    mümkün, tıpkı sayaç trigger'ları gibi).

- `20260919160000_comment_likes_and_notifications.sql` — yorum sistemini
  güçlendiriyor (Bölüm 9.4): sınırsız derinlikte iç içe yanıt zaten
  `prompt_comments.parent_id`'nin kendine referans vermesiyle Bölüm 18'den
  beri destekleniyordu (yeni bir tablo/kolon gerekmedi), bu migration
  yalnızca beğeni + bildirim eksiğini kapatıyor:
  - `prompt_comments.like_count` — yeni sayaç kolonu.
  - `comment_likes` tablosu — `prompt_likes` ile birebir aynı desen
    (bileşik birincil anahtar, aynı kullanıcının aynı yorumu iki kez
    beğenmesini veritabanı seviyesinde imkansız kılıyor), kendi
    `SECURITY DEFINER` sayaç trigger'ı (`handle_comment_like_change`) ile
    — bir yanıtın beğenilmesi ana yorumun/gönderinin beğeni sayısını hiç
    etkilemiyor, tamamen bağımsız.
  - RLS: `prompt_likes` ile birebir aynı — herkese açık okuma, yalnızca
    kendi adına ekleme/silme.
  - `notify_comment_reply()` (AFTER INSERT, `SECURITY DEFINER`) — bir
    yoruma VEYA bir yanıta yeni bir yanıt geldiğinde üst mesajın sahibine
    bildirim yazar (`comment_reply` tipi, Bölüm 18'den beri CHECK
    kısıtında zaten vardı, ilk kez tetikleniyor).
  - `notify_comment_like()` (AFTER INSERT, `SECURITY DEFINER`) — bir
    yorum/yanıt beğenildiğinde sahibine bildirim yazar (`like` tipi).
    İkisi de kendi kendine bildirim üretmiyor.

- `20260919170000_comment_edit_delete.sql` — yorum/yanıt düzenleme ve
  güvenli silme (Bölüm 9.5). RLS zaten Bölüm 19'dan beri "yalnızca sahibi
  güncelleyebilir/silebilir" politikalarını taşıyordu, bu migration:
  - `prompt_comments.edited_at`/`deleted_at` — iki yeni sütun.
  - `handle_comment_body_edit()` (BEFORE UPDATE) — yalnızca `body`
    gerçekten değiştiğinde `edited_at`'i damgalıyor.
  - `handle_comment_delete()` (BEFORE DELETE) — kritik güvenlik davranışı:
    `prompt_comments.parent_id`'nin `on delete cascade` olması, bir yorumu
    doğrudan silmenin TÜM alt yanıt ağacını beraberinde sileceği anlamına
    geliyordu. Bu trigger, silinecek yorumun gerçek alt yanıtları varsa
    DELETE'i iptalleyip yerine bir soft-delete UPDATE'i (`deleted_at`
    damgalama + `body`'yi boşaltma) uyguluyor; alt yanıtı yoksa DELETE'e
    olduğu gibi izin veriyor. Frontend her zaman aynı basit `DELETE`
    çağrısını yapıyor — veritabanı, tek ve atomik bir işlemde, hiçbir
    yarış durumuna açık olmadan hangi davranışın uygulanacağına karar
    veriyor.

- `20260919180000_notification_system_completion.sql` — bildirim
  sisteminin tam bir denetimi + eksiklerin kapatılması (Bölüm 9.6).
  Önce mevcut 4 bildirim üreticisi (`notify_new_request_response`,
  `notify_selected_response`, `notify_comment_reply`, `notify_comment_
  like`) ve RLS politikaları denetlendi — hepsi doğru çalışıyordu ve
  DEĞİŞTİRİLMEDEN korundu, yalnızca gerçek eksikler kapatıldı:
  - `notifications.dedupe_key text` + kısmi tekil indeks — yalnızca
    beğeni/yorum-beğenisi gibi geri çekilebilir olaylarda, o olayın
    bildirimini atomik olarak bulup silebilmek için.
  - "Users can delete their own notifications" — eksik olan DELETE RLS
    politikası.
  - İçerik silme temizleyicileri (`prompts`/`prompt_requests` AFTER
    DELETE) — geçersiz bir hedefe işaret eden bildirimleri temizliyor.
  - Yeni üreticiler: `notify_prompt_like`, `notify_new_remix`,
    `notify_new_follow`, `notify_new_message`, ve `notify_comment_reply`'a
    eklenen yeni dal (bir gönderiye/isteğe DOĞRUDAN yorum — öncesinde
    yalnızca yanıt zinciri kapsanıyordu).
  - `notify_selected_response` yeniden yazıldı: artık seçim değişince HEM
    eski sahibine ("artık seçili değil") HEM yeni sahibine ("seçildi")
    ayrı ayrı, birbirine karışmadan bildirim üretiyor.
  - `notify_request_closed` (YENİ) — bir istek manuel kapatılınca (yalnızca
    manuel — otomatik "yanıtlandı" geçişinde değil) gerçek yanıt vermiş
    her kullanıcıya (istek sahibi hariç) bildirim üretiyor.
  - **Kasıtlı olarak eklenmedi:** "istek gönderisini beğenme" bildirimi
    (uygulamada böyle bir beğenme özelliği hiç yok) ve sistem duyurusu
    üretimi (bir duyuru yazma arayüzü hiç yok) — ikisi de var olmayan bir
    özelliğin bildirimini icat etmemek için kasıtlı olarak dışarıda
    bırakıldı.

- `20260919190000_prompt_safe_delete.sql` — remixlenmiş bir promptun
  güvenli silinmesi (Bölüm 9.7). Bölüm 9.6'nın test sırasında keşfettiği,
  bildirim sisteminden bağımsız bir şema boşluğunu kapatıyor:
  `prompts.source_prompt_id`'nin `on delete set null` olması ile
  `prompts_origin_shape` CHECK kısıtının (`origin_type='remix'` →
  `source_prompt_id` asla null olamaz) çakışması yüzünden, remixlenmiş
  herhangi bir orijinal prompt silinmeye çalışıldığında veritabanı
  hatasıyla reddediliyordu. Çözüm, Bölüm 9.5'in yorum/yanıt "güvenli
  silme" deseninin birebir aynısı:
  - `prompts.deleted_at` — yeni sütun.
  - `handle_prompt_delete()` (BEFORE DELETE) — bir promptun gerçek
    remixleri varsa, DELETE'i iptalleyip yerine bir soft-delete UPDATE'i
    (`deleted_at` damgalama + `title`/`description`/`prompt_text`'i
    boşaltma + `prompt_media`/`prompt_tags` satırlarını silme)
    uyguluyor; hiç remixi yoksa DELETE'e olduğu gibi izin veriyor.
    Frontend'in `deleteRealPrompt`'u hiç değişmedi — hâlâ aynı basit
    `DELETE`'i gönderiyor, veritabanı hangi sonucun uygulanacağına karar
    veriyor.
  - Soft-deleted bir satır hâlâ var olduğundan (yalnızca içeriği
    boşaltılmış), mevcut SELECT RLS politikası ve 20260919180000'in
    içerik-silme bildirim-temizleme trigger'ı hiç değiştirilmedi — RLS
    zaten satırı (published kaldığından) herkese açık okunur bırakıyor
    ("silindi" yer tutucusu için gerekli), ve bildirim temizleme
    trigger'ı yalnızca GERÇEK bir DELETE'te tetiklendiğinden soft-delete
    durumunda hiç çalışmıyor (doğru — bildirim hâlâ var olan, artık
    "silindi" gösteren bir sayfaya işaret etmeye devam ediyor).

- `20260919200000_messaging_content_and_edit.sql` — mesajlaşma
  genişletmesi Faz A (Bölüm 9.8): içerik paylaşımı, yanıtlama, düzenleme,
  "benden sil"/"herkesten sil". `messages` tablosunun önceden hiç UPDATE
  RLS politikası yoktu — bu yüzden ne düzenleme ne "herkesten sil" şu ana
  kadar hiç mümkün değildi.
  - `messages.body` artık nullable; yeni `shared_prompt_id`/
    `shared_request_id` (FK, `on delete set null`), `reply_to_message_id`
    (kendine referans), `edited_at`, `deleted_at`.
  - CHECK `messages_has_content` (`deleted_at` istisnasıyla — aşağıdaki
    hata düzeltmesine bakınız) ve `messages_shared_content_exclusive`.
  - Yeni `message_hidden_for` tablosu — "benden sil", yalnızca o
    kullanıcının kendi görünümünden gizler, mesaj satırını hiç etkilemez.
  - Yeni UPDATE RLS politikası — gönderiden sonraki **15 dakika** (ürün
    varsayılanı) içinde gönderen kendi mesajını düzenleyebiliyor/
    "herkesten silebiliyor" (ikincisi bir DELETE değil, içeriği boşaltan
    bir UPDATE). `handle_message_body_edit()` (Bölüm 9.5'in
    `handle_comment_body_edit`'iyle birebir aynı) `edited_at`'i damgalıyor.
  - **Gerçek hata düzeltmesi (yerel testte yakalandı):** ilk yazılan
    `messages_has_content` CHECK'i `deleted_at` istisnasını içermiyordu,
    bu yüzden "herkesten sil" (üç alanı BİRDEN boşaltan UPDATE) kendi
    CHECK'ine çarpıp hata veriyordu — düzeltildi.

- `20260919210000_messaging_requests_privacy_blocking.sql` — mesajlaşma
  genişletmesi Faz B (Bölüm 9.9): mesaj istekleri, gizlilik ayarı,
  engelleme. Bölüm 18'de zaten oluşturulmuş ama hiç kullanılmayan
  `reports`/`blocks` tablolarını ilk kez gerçekten kullanmaya başlıyor —
  bu migration'da **yeni tablo yok**, yalnızca iki sütun ekleniyor.
  - `profiles.message_privacy` (`'everyone'`/`'followers_only'`),
    `conversation_members.status` (`'accepted'`/`'pending'`, varsayılan
    `'accepted'` — geriye dönük hiçbir konuşmayı "istek" yapmıyor).
  - `is_blocked(a, b)` — `is_conversation_member()` ile aynı desende yeni
    bir SECURITY DEFINER yardımcı; `blocks`'un SELECT politikası yalnızca
    "kendi engellediklerini" gösterdiğinden, karşılıklı bir kontrol için
    bu şart.
  - `messages`/`conversation_members`'ın INSERT politikaları `is_blocked()`
    ile genişletildi — bir engelleme artık gerçekten hem yeni konuşma
    başlatmayı hem var olan bir konuşmada mesaj göndermeyi veritabanı
    seviyesinde reddediyor.
  - `handle_block_removes_follows()` — bir engelleme, iki taraf arasında
    varsa takip ilişkisini de kaldırıyor.
  - `start_direct_conversation(other_user_id)` RPC — konuşma başlatmanın
    TEK giriş noktası: var olan bir konuşmayı bulur, yoksa engelleme
    reddi + gizlilik kontrolü + alıcının doğru başlangıç durumunu
    (zaten göndereni takip ediyorsa `'accepted'`, değilse `'pending'`)
    hesaplayıp oluşturur. `select_prompt_request_response` (Bölüm 9.2)
    ile aynı gerekçeyle bu karar istemciye bırakılmadı.
  - `notifications.type` CHECK'ine `'message_request'` eklendi;
    `notify_new_message` artık alıcının o anki durumuna göre doğru tipi/
    metni seçiyor.

- `20260919220000_messaging_realtime.sql` — mesajlaşma genişletmesi Faz C
  (Bölüm 9.10): gerçek zamanlı senkronizasyon. **Yeni tablo/sütun/politika
  yok** — yalnızca iki `alter publication supabase_realtime add table`
  satırı (`messages`, `conversation_members`). Bir tablo bu publication'a
  eklenmeden istemcideki `postgres_changes` aboneliği hiçbir olay almıyor;
  RLS SELECT politikaları (Bölüm 19) hiç değişmeden Realtime yetkilendirmesi
  için de geçerli oluyor (Supabase'in belgelenmiş davranışı).

- `20260919250000_remix_merge_system.sql` — Remix Dallanma Haritası + Merge
  (birleştirme) sistemi (bkz. CLAUDE.md Bölüm 9.13). Remix ilişkisinin
  kendisi (`prompts.source_prompt_id`/`root_prompt_id`/`origin_type`) ve
  remix-silme güvenliği (Bölüm 9.7'nin `handle_prompt_delete` trigger'ı)
  zaten vardı — bu migration yalnızca gerçekten eksik olan iki şeyi
  ekliyor:
  - **`prompt_versions`** — bir promptun merge ile kabul edilmiş sürüm
    geçmişi (yalnızca aşağıdaki RPC'ler yazabiliyor, düz bir "düzenle"
    işlemi hiç yok bu uygulamada). Okuma, `prompts`'ın kendi görünürlük
    kuralıyla birebir aynı (yayınlanmış veya kendi promptun).
  - **`merge_requests`** — bir remixin katkısını bir atasına (doğrudan
    kaynak/kök orijinal/aradaki başka bir ata) geri sunma talebi.
    `merge_requests_no_self_target` (kaynak≠hedef) ve
    `merge_requests_one_pending_per_pair` (aynı çift için tek bekleyen
    talep, kısmi unique index) veritabanı seviyesinde zorlanıyor. Yazma
    politikası YOK — tüm durum geçişleri yalnızca RPC'ler üzerinden.
    Şartnamenin ayrı bir "merge_contributions" tablosu önerisi bilinçli
    olarak kurulmadı: `merge_requests` (source/target/requester) +
    `prompt_versions` (merge_request_id/created_by/content) birleşimi
    zaten aynı bilgiyi taşıyor.
  - **RPC'ler** (hepsi `security definer`, istemciden hiçbir raw
    INSERT/UPDATE izni yok): `create_merge_request` (tüm doğrulamalar
    dahil — kaynak gerçek bir remix mi, hedef kaynağın gerçek bir atası
    mı [20 adım guard'lı zincir yürüyüşü — bu hem "geçerli hedef" hem
    "döngü engelleme" kuralını AYNI ANDA sağlıyor, ayrı bir döngü tespiti
    gerekmiyor], hedef silinmemiş mi, mükerrer bekleyen talep var mı;
    talep sahibi zaten hedefin de sahibiyse `_perform_merge_acceptance`'ı
    çağırıp ANINDA kabul ediyor — CLAUDE.md'nin "kendi içeriğine merge'de
    gereksiz onay akışı kurma" kararı), `accept_merge_request` (hedefin
    canlı içeriğini —İLK merge'de— `version 1` olarak geriye dönük
    kaydedip yeni bir `version 2` yazıyor, kaynağı SİLMİYOR/kaynağın
    source/root ilişkisine DOKUNMUYOR, tek bir atomik transaction),
    `reject_merge_request`, `withdraw_merge_request`,
    `fetch_remix_graph` (tek bir recursive CTE ile TÜM ağacı getiriyor —
    haritanın N ayrı sorgu yerine tek bir gerçek sorguya dayanması için).
  - `handle_prompt_soft_delete_cancels_merges` — bir prompt (Bölüm 9.7'nin
    trigger'ıyla) soft-delete olduğunda, o promptu KAYNAK olarak kullanan
    her bekleyen merge talebini `cancelled` yapıp hedef sahibine bilgi
    veriyor (yeni `merge_request_cancelled` bildirim tipi).
  - `audit_log` — yalnızca merge eylemleri için minimal, salt-okunur bir
    denetim kaydı (istemciden hiç yazılamıyor, yalnızca yukarıdaki
    SECURITY DEFINER fonksiyonlar yazıyor).
  - `notifications.type` CHECK'i beş yeni değer aldı:
    `merge_request_received/accepted/rejected/withdrawn/cancelled` —
    hepsi Bölüm 9.6/9.12'nin zaten olgun bildirim altyapısıyla (aynı
    `SECURITY DEFINER` + `hl=` hedefleme deseni) üretiliyor.
  - RLS görünürlüğü, Bölüm 9.7'nin kurduğu ilkeyle birebir aynı:
    `deleted_at` HİÇ kontrol edilmiyor, yalnızca `status='published'` —
    soft-deleted bir promptun geçmiş bir merge talebi/sürümü, ilişki
    kaydı olarak görünmeye devam ediyor (şartnamenin "silinmiş kaynak:
    içerik kaldırılmış, ilişki kaydı korunuyor" lejant maddesi).

## Nasıl doğrulandı

**Bölüm 18 (şema):** Gerçek projeye erişim engellendiğinden, ilk 7 dosya
yerel, tek kullanımlık bir Postgres 16 örneğine (Supabase'in kullandığı
aynı major sürüm) `auth.users` için minimal bir taklit tabloyla uygulandı
ve şunlar gerçekten test edildi:

- Yeni `auth.users` satırı → `profiles` satırının otomatik oluşması ve
  kullanıcı adı çakışmasının doğru çözülmesi.
- Beğenme/beğenmekten vazgeçme → `prompts.like_count`'un artıp azalması.
- Yorum ekleme → `prompts.comment_count`'un artması.
- Takip etme → hem takip edilenin `follower_count`'unun hem takip edenin
  `following_count`'unun artması.
- Remix oluşturma → orijinal promptun `remix_count`'unun artması.
- Bir isteğe yanıt oluşturma → isteğin `response_count`'unun artması,
  yanıt seçme → `selected_response_prompt_id`'nin güncellenmesi.
- Geçersiz veriler (aynı yorumda hem `prompt_id` hem `request_id`, kendi
  kendini takip/engelleme, `source_prompt_id` olmadan remix, geçersiz
  `content_type`, yinelenen kullanıcı adı) beklendiği gibi reddedildi.
- Her tabloda RLS'nin gerçekten açık olduğu doğrulandı.

**Bölüm 19 (RLS politikaları):** Bu kez `postgres` süperkullanıcısıyla test
etmenin hiçbir anlamı yok, çünkü süperkullanıcı/tablo sahibi RLS'i zaten
tamamen atlar. Bunun yerine yerel test veritabanına gerçek Supabase
projesindeki gibi `anon` ve `authenticated` adında, tabloların sahibi
OLMAYAN iki rol eklendi, `auth.uid()`'nin gerçek Supabase davranışını
taklit eden bir stub (`request.jwt.claim.sub` oturum ayarını okuyan bir
fonksiyon) tanımlandı, ve üç farklı test kullanıcısı arasında `SET ROLE` +
`set_config(...)` ile geçiş yapılarak şunlar **gerçekten** (görsel inceleme
değil, çalıştırılıp doğrulanan SQL ile) test edildi:

- `anon` (giriş yapmamış ziyaretçi) yayındaki bir promptu görebiliyor,
  taslak bir promptu GÖREMİYOR, ve bir beğeni eklemeye çalıştığında RLS
  hatası alıyor.
- Giriş yapmış bir kullanıcı (Baran) başkasının (Ayşe'nin) yayındaki
  promptunu beğenebiliyor ama taslağını göremiyor, promptun içeriğini
  güncelleyemiyor (yazarı değil), ve `user_id` alanını sahteleyerek
  "Ayşe adına" beğeni ekleyemiyor (`WITH CHECK` bunu engelliyor).
- **Kritik test:** Baran, Ayşe'nin promptunu beğenince Ayşe'nin
  `like_count`'u gerçekten artıyor (cross-user counter, `SECURITY DEFINER`
  düzeltmesi sayesinde) — ve Baran, Ayşe'yi takip edince hem Ayşe'nin
  `follower_count`'u hem Baran'ın `following_count`'u doğru artıyor.
- `prompt_saves` tamamen özel: Cem, Baran'ın kayıtlarını sorgulayınca
  0 satır dönüyor.
- Mesajlaşma: konuşmaya üye OLMAYAN Cem, konuşmayı göremiyor ve mesaj
  göndermeye çalışınca RLS hatası alıyor; üye olan Ayşe mesaj gönderince
  hem `conversations.last_message_at` hem diğer üyenin (Baran'ın)
  `unread_count`'u doğru güncelleniyor (yine cross-user, `SECURITY
  DEFINER` sayesinde).
- Bildirimler: Baran, Ayşe'nin bildirimini ne görebiliyor ne de okundu
  işaretleyebiliyor; Ayşe kendi bildirimini hem görüp hem okundu
  işaretleyebiliyor.
- `blocks`/`reports`: Cem'in oluşturduğu engel/rapor kayıtları Baran'a
  tamamen görünmez kalıyor.
- Profiller herkese açık okunabiliyor ama yalnızca sahibi
  güncelleyebiliyor (Baran, Ayşe'nin görünen adını değiştiremiyor).
- **Negatif kontrol (iddiayı gerçekten kanıtlamak için):** `SECURITY
  DEFINER` düzeltmesi geçici olarak geri alınıp aynı beğeni senaryosu
  tekrar çalıştırıldı — bu kez `like_count` **gerçekten sessizce
  güncellenmeden kaldı** (hata da vermedi, sadece sayaç yanlış kaldı),
  düzeltme geri konulunca aynı senaryo tekrar doğru çalıştı. Bu, iddianın
  varsayım değil, kanıtlanmış bir gerçek olduğunu gösteriyor.

Test veritabanı her iki tur sonunda da silindi (`DROP DATABASE`) — depoda
kalıcı bir iz bırakmadı.

**Bölüm 20 (Storage):** Gerçek Supabase projelerinde zaten kurulu olan
`storage` şemasının (`storage.buckets`, `storage.objects`,
`storage.foldername()`) minimal, sadık bir taklidi yerel test
veritabanına eklendi, ve aynı `anon`/`authenticated` rol simülasyonuyla
şunlar test edildi:

- `anon` her üç bucket'tan da nesne listeleyebiliyor (herkese açık okuma) —
  boş bucket'ta hata değil, 0 satır dönüyor.
- Ayşe kendi `{user_id}/avatar.jpg` yoluna avatar yükleyebiliyor; Baran'ın
  klasörüne (`{başkasının_id}/avatar.jpg`) yüklemeye çalışınca RLS hatası
  alıyor.
- Yüklenen avatar `anon` dahil herkes tarafından okunabiliyor.
- Baran, Ayşe'nin avatarını silmeye çalışınca `DELETE 0` dönüyor (RLS
  satırı görünmez kılıyor, hata değil) — Ayşe kendi avatarını gerçekten
  silebiliyor.
- Aynı kural `prompt-media` ve `request-references` için de doğrulandı:
  sahibi yükleyebiliyor, başkası aynı klasöre yükleyemiyor, giriş yapmamış
  `anon` hiçbir bucket'a hiçbir şey yükleyemiyor.

Test veritabanı işlem bitince silindi.

Bu, SQL'in ve RLS/Storage politikalarının doğru ve tutarlı olduğunu
kanıtlar — ama **gerçek Supabase projenize karşı hiç çalıştırılmadı**, bu
adım yukarıdaki talimatlarla size kalıyor.

**Bölüm 21 (prompt istekleri/yanıt sistemi sağlamlaştırması,
`20260919150000`):** Aynı yöntemle (yerel Postgres 16, `anon`/
`authenticated` rol simülasyonu, üç test kullanıcısı — Ayşe = istek sahibi,
Baran/Cem = yanıtlayanlar) uçtan uca gerçekten test edildi:

- Baran açık bir isteğe yanıt verince `response_count` artıyor VE Ayşe'ye
  gerçek bir `request_response` bildirimi (doğru mesaj + `target_href`)
  oluşuyor.
- Ayşe, Baran'ın yanıtını seçince (`select_prompt_request_response` RPC)
  istek `status='answered'` oluyor VE Baran'a "yanıtın seçildi" bildirimi
  oluşuyor.
- Cem, artık `'answered'` olan isteğe yeni bir yanıt eklemeye çalışınca
  **veritabanı seviyesinde reddediliyor** ("Bu istek kapandı, artık yeni
  yanıt kabul edilmiyor.").
- Baran (istek sahibi değil) bir yanıt seçmeye çalışınca "Yalnızca isteğin
  sahibi bir yanıt seçebilir" hatasıyla reddediliyor.
- Var olmayan/bu isteğe ait olmayan bir yanıt id'si seçilmeye çalışılınca
  reddediliyor.
- Ayşe seçimi kaldırınca (hiç manuel kapatma yokken) istek doğru şekilde
  `'open'`a dönüyor.
- Ayşe isteği MANUEL kapatıyor (`closed_by_owner=true`) → Cem yine yeni
  yanıt ekleyemiyor → Ayşe (kapalıyken) bir yanıt seçebiliyor
  (`status='answered'`) → **kritik test:** Ayşe seçimi tekrar kaldırınca
  istek `'open'` yerine doğru şekilde `'closed'`a dönüyor (manuel kapatma
  korunuyor) — bu ayrımın tam olarak çözdüğü senaryo.
- Doğrudan (RPC'yi atlayan) bir UPDATE ile başka bir isteğin yanıtını
  seçmeye çalışmak `validate_selected_response` trigger'ı tarafından
  reddediliyor — RPC'yi atlayan bir istemci bile bu kuralı çiğneyemiyor.
- Bir seçimi hiç değiştirmeden (aynı yanıtı tekrar "seçerek") tekrarlamak
  mükerrer bir bildirim OLUŞTURMUYOR.
- `status='answered'` ama `selected_response_prompt_id` boş bırakmaya
  çalışmak (veya tam tersi) CHECK kısıtı tarafından reddediliyor.

Test veritabanı işlem bitince silindi. Bu senaryoların tamamı gerçekten
çalıştırılıp sonucu doğrulandı (görsel/statik kod incelemesi değil) — ama
yine **gerçek Supabase projenize karşı hiç çalıştırılmadı**.

**Bölüm 9.6 (bildirim sistemi tamamlaması, `20260919180000`):** Aynı
yöntemle (yerel Postgres 16, `anon`/`authenticated` rol simülasyonu, üç
test kullanıcısı) 10 test grubu halinde uçtan uca gerçekten test edildi —
tam liste ve sonuçlar CLAUDE.md Bölüm 9.6'da. Özet: beğeni/yorum/yanıt/
yorum-beğenisi/remix/istek-yanıtı-seçimi-değiştirme-kaldırma/istek-kapatma/
takip/mesaj için doğru kişiye, mükerrer olmadan, doğru geri-alma
davranışıyla bildirim üretimi; RLS'nin başkasının bildirimini okuma/
silmeyi engellemesi; kendi bildirimini silmenin altta yatan ilişkiye
dokunmaması; içerik silindiğinde bildirimin temizlenmesi — hepsi
doğrulandı. Test sırasında iki gerçek şey bulundu:
- **Migration'ın kendi hatası (test sırasında yakalanıp düzeltildi):**
  `on conflict (dedupe_key) do nothing` kısmi bir indeksle eşleşmiyordu
  (PostgreSQL, kısmi indeksleri "arbiter" olarak seçebilmek için `ON
  CONFLICT` hedefinde aynı `WHERE`'in tekrarını istiyor) — düzeltildi
  (`on conflict (dedupe_key) where dedupe_key is not null do nothing`)
  ve yeniden test edilip doğrulandı.
- **Bu göreve YABANCI, önceden var olan bir şema kısıtlaması (düzeltilmedi,
  kapsam dışı):** `prompts.source_prompt_id`'nin `on delete set null`
  olması ile `prompts_origin_shape` CHECK kısıtının (`origin_type='remix'`
  → `source_prompt_id` ASLA null olamaz) çakışması yüzünden, remixlenmiş
  herhangi bir orijinal prompt BUGÜN silinmeye çalışılırsa veritabanı
  hatasıyla reddediliyor. Bu, bildirim sistemiyle ilgisi olmayan, Bölüm
  18'den beri var olan bir tasarım boşluğu — bu migration'ın kapsamına
  alınmadı, düzeltme için ayrı bir mimari karar (remixleri cascade silmek
  mi, yoksa `origin_type`'ı farklı ele almak mı) gerekiyor.

Test veritabanı işlem bitince silindi. Bu, gerçek Supabase projenize karşı
hiç çalıştırılmadı — aynı, tekrarlanan sandbox ağ kısıtı.

**Bölüm 9.7 (remixlenmiş prompt güvenli silme, `20260919190000`):** Aynı
yerel test veritabanına (Bölüm 9.6'nın gerçek test verisiyle — Aylin'in
iki gerçek remixi olan `dddddddd…` prompt'u dahil) gerçekten uygulandı ve
3 senaryo çalıştırıldı: remixi olan bir promptu silmeye çalışmak artık
hata VERMEDEN `DELETE 0` dönüyor (soft-delete oldu), `title`/
`description`/`prompt_text` boşaldı, `deleted_at` damgalandı, VE
remixlerinin `source_prompt_id`/`origin_type`'ı hiç değişmeden kaldı
(CHECK ihlali artık hiç oluşmuyor), `prompt_media` temizlendi; remixi
olmayan bir prompt gerçekten (`DELETE 1`) silindi; başkasının promptunu
silme denemesi RLS tarafından sessizce 0 satır etkileyerek engellendi.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta: doğrudan bir linkle silinmiş bir
promptun "Bu paylaşım silindi" sayfasını gösterdiği, normal bir promptun
değişmeden render edildiği, silinmiş bir kaynağın remixinin kendi context
kutusunda "Bu paylaşım silindi." gösterdiği (remixin kendi içeriği hiç
etkilenmeden), ve feed'in silinmiş promptu kendi kartı olarak hiç
göstermediği doğrulandı — hepsi sıfır JS hatasıyla. Test veritabanı işlem
bitince silindi. Gerçek bir Supabase projesine karşı canlı doğrulama yine
bu sandbox'ın ağ kısıtı yüzünden yapılamadı.

**Bölüm 9.8 (mesajlaşma genişletmesi Faz A, `20260919200000`):** Aynı
yerel test veritabanına gerçekten uygulandı ve 12 senaryo çalıştırıldı:
boş mesaj reddi, hem-prompt-hem-istek reddi, yalnızca-paylaşılan-içerik
kabulü, yanıtlama, 15 dakika içinde düzenleme + `edited_at` damgalanması,
başkasının mesajını düzenleyememe (RLS), yalnızca beğeni/sayaç gibi
ilgisiz bir güncellemenin `edited_at`'i etkilememesi, 15 dakika DIŞINDA
düzenleme denemesinin reddi, "herkesten sil"in `body`'yi boşaltıp satırı
yaşatması, "benden sil"in yalnızca o kullanıcı için gizlemesi, başkası
adına "benden sil" kaydı oluşturulamaması, üye olmayan bir kullanıcının
mesaj gönderememesi — hepsi gerçekten çalıştırılıp doğrulandı. Ayrıca
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta 21 senaryo daha doğrulandı (düz mesaj,
yanıtlama, düzenleme, iki silme modu, "Mesajla gönder" ile paylaşım
akışının tamamı) — hepsi sıfır JS hatasıyla. Gerçek bir Supabase
projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı yüzünden
yapılamadı.

**Bölüm 9.9 (mesajlaşma genişletmesi Faz B, `20260919210000`):** Yerel
PostgreSQL 16'da sıfırdan kurulan bir test veritabanına gerçekten
uygulandı (storage'a hiç dokunmadığından storage stub'ı olmadan
uygulanabildi) ve 14 senaryo çalıştırıldı: varsayılan gizlilikte takip
etmeyen biri mesaj atınca `'pending'` + `'message_request'` bildirimi;
aynı çifte tekrar mesaj atılınca konuşmanın yeniden kullanılması; alıcı
kabul etmeden göndericinin mesaj göndermeye devam edebilmesi; alıcı
yanıt verince durumun `'accepted'`e dönmesi ve bildirim tipinin
`'message'`e dönmesi; `followers_only` gizlilikte takip etmeyenin isteği
bile başlatamaması; takip edilince aynı denemenin doğrudan `'accepted'`
geçmesi; `is_blocked()`'ın iki yönü de görmesi; engellenen tarafın ne var
olan bir thread'de ne yeni bir konuşmada mesaj gönderebilmesi;
engellemenin var olan takip ilişkisini kaldırması (ilgisiz bir ilişkinin
etkilenmemesiyle karşılaştırmalı); engel kaldırılınca mesajlaşmanın
gerçekten çalışması; rapor dosyalamanın değişmeden çalışması; kendine
mesaj göndermenin reddi; `anon`'un RPC'yi hiç çağıramaması — hepsi
gerçekten çalıştırılıp doğrulandı, test veritabanı işlem bitince silindi.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta 19 senaryo daha doğrulandı (mesaj isteği
gönderme/görünme, pending bandı + Kabul Et/Sil, yanıtlamanın otomatik
kabulü, ayarlardaki gizlilik radyoları, profil menüsünden engelleme +
Mesaj Gönder'in kaybolması, engellenmiş bir thread'de composer'ın devre
dışı kalıp engel kalkınca aktifleşmesi, kullanıcı/mesaj raporlama) —
hepsi sıfır JS hatasıyla, artı Supabase'e hiç erişilemezken 19 rotalık bir
dayanıklılık taraması. Gerçek bir Supabase projesine karşı canlı
doğrulama yine bu sandbox'ın ağ kısıtı yüzünden yapılamadı.

**Bölüm 9.10 (mesajlaşma genişletmesi Faz C, `20260919220000`):** Yerel
PostgreSQL 16'da, gerçek bir Supabase projesinde zaten hazır gelen
`supabase_realtime` publication'ı yerelde `create publication
supabase_realtime;` ile taklit edilip (bu yalnızca test altyapısının
kendi kurulumu, migration'ın bir parçası değil), önceki 16 migration'la
birlikte gerçekten uygulandı — iki `alter publication ... add table`
satırı da hatasız çalıştı ve `pg_publication_tables` sorgusu gerçekten
`messages`/`conversation_members`'ı listelediğini doğruladı.
`mergeIncomingMessage`/`applyMessageUpdate` (`src/features/messages/
realtime-helpers.ts`), bir kopyasına değil GERÇEK dosyanın kendisine
karşı (`node --experimental-strip-types` ile doğrudan import edilerek) 6
senaryoyla doğrulandı: boş listeye ekleme, farklı id ekleme, aynı id'nin
(kendi gönderiminin Realtime yankısı) sessizce yok sayılması (aynı
referans döndüğü de doğrulandı), bir güncellemenin doğru id'yi yerine
koyması, bilinmeyen bir id için no-op, ve bir "herkesten sil" soft-
update'inin içeriği doğru boşaltması. Ayrıca `npx tsc --noEmit`, `npm run
lint`, tam `npm run build` (20 rota, değişmedi) sıfır hatayla geçti.
Tarayıcı tarafı, Playwright'ın `page.routeWebSocket()`'iyle gerçek bir
WebSocket bağlantı denemesini (Phoenix protokolünü simüle etmeden,
yalnızca bağlantının denendiğini gözlemleyerek) yakalayan 7 senaryoyla
doğrulandı: hem `/messages/local?id=…` hem `/messages`'ın gerçekten
`realtime/v1/websocket`'e doğru `apikey` ile bağlanmayı DENEDİĞİ, konuşma
görünümünün takılı kalmadığı, ve hem REST hem WebSocket TAMAMEN
erişilemezken üç mesajlaşma rotasında sıfır JS hatası oluştuğu. Faz B'nin
19 senaryolu tam paketi (gerçek, engellenmiş bir WebSocket bağlantısıyla)
ve 19 rotalık genel dayanıklılık taraması yeniden çalıştırılıp bozulma
olmadığı doğrulandı. **Dürüstçe belirtilmeli:** bu sandbox'ın ağ politikası
`*.supabase.co`'ya WebSocket erişimini de engellediğinden, Supabase
Realtime'ın kendi Phoenix kanal protokolü hiç simüle edilmedi — "karşı
taraf mesaj gönderdiğinde ekranımda anında beliriyor" iddiasının tam,
uçtan uca kanıtı yalnızca kullanıcının migration'ı kendi Supabase
projesine uygulayıp iki gerçek hesapla bizzat denemesiyle mümkün.

**Bölüm 9.13 (Remix Dallanma Haritası + Merge sistemi, `20260919250000`):**
Yerel PostgreSQL 16'da sıfırdan kurulan bir test veritabanına, önceki
TÜM migration'larla (18 dosya, storage hariç) birlikte gerçekten
uygulandı ve şu senaryoların TAMAMI fiilen çalıştırılıp doğrulandı
(beş gerçek kullanıcı — Ayşe/Mehmet/Zeynep/Can/Elif — ve gerçek bir
A→B→C, A→D, B→E remix ağacıyla, şartnamenin kendi §20 örnek senaryosu):
- Kök/doğrudan kaynak ilişkisi zincirin her seviyesinde doğru
  (`root_prompt_id` ara adımlarda da doğru taşınıyor).
- **Döngü engeli:** D'nin (zaten A'nın remixi) C'ye (B'nin remixi, kökü
  yine A) bir merge talebiyle "bağlanmaya" çalışması reddedildi — hedef,
  kaynağın gerçek bir atası olmadığı için (D, C'nin ne doğrudan kaynağı
  ne bir üst atası).
- Zeynep (C'nin sahibi) C'den A'ya gerçek bir merge talebi gönderdi →
  `pending`, `target_owner=Ayşe`.
- **Mükerrer talep engeli:** aynı kaynak-hedef çifti için ikinci bir
  bekleyen talep reddedildi (kısmi unique index gerçekten çalışıyor).
- **Yetkisiz karar engeli:** Mehmet (ne kaynağın ne hedefin sahibi) A
  için karar veremedi.
- Ayşe talebi kabul etti → `version 1` = A'nın eski içeriği (geriye
  dönük backfill, Ayşe adına), `version 2` = C'nin içeriği (Zeynep
  adına, "mor tonlara geçiş" özetiyle) → A'nın CANLI içeriği gerçekten
  C'ninkiyle aynı oldu; **C'nin kendi source/root ilişkisi hiç
  değişmedi** (hâlâ B/A) — merge, remix ağacını asla geriye dönük
  değiştirmiyor.
- **Çifte kabul engeli:** aynı talep ikinci kez kabul edilmeye
  çalışıldığında reddedildi ("zaten karara bağlanmış").
- Reddetme akışı: yeni bir talep üzerinde `decision_reason` doluyla
  `rejected`.
- Geri çekme akışı: talep sahibi geri çekti → `withdrawn` +
  `withdrawn_at` damgalandı; **başka birinin** geri çekme denemesi
  reddedildi ("yalnızca talebi oluşturan kişi geri çekebilir").
- **Kendi kendine merge kısayolu:** kaynağın VE hedefin aynı sahibi
  olduğu bir talep hiç `pending` durumuna girmeden anında `accepted`
  döndü.
- **Senaryo 4 (B silinir):** B soft-delete oldu (gerçek remixleri —C, E—
  olduğundan içerik boşaldı, satır yaşadı); C ve E'nin İKİSİ de hayatta
  kaldı (2 satır); C'nin source/root ilişkisi hâlâ B/A (B silinmiş olsa
  da kırılmadı). B'ye kaynaklı bekleyen bir merge talebi denemesi
  reddedildi ("kaynak içerik artık mevcut değil").
- **Senaryo 5 (A silinir):** A soft-delete oldu (B, D gerçek remixleri
  olduğundan); B/C/D/E'nin TAMAMI (B zaten önceden silinmişti) hayatta
  kaldı.
- **Kritik RLS testi:** `anon` rolü, D→A gibi geçmiş merge talebini,
  status'u ne olursa olsun (kaynak/hedef soft-deleted bile olsa) hâlâ
  görebiliyor — soft-deleted bir promptun ilişki kaydı asla gizlenmiyor
  (Bölüm 9.7'nin aynı ilkesi).
- `fetch_remix_graph` RPC'si tek bir sorguda tüm ağacı (kök + gerçek
  remixler) doğru sayıda satırla getirdi.

Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti. Test veritabanı işlem bitince silindi.

Tarayıcı tarafı, ağ seviyesinde taklit edilmiş Supabase REST/RPC
yanıtlarıyla Playwright'ta 31 senaryo doğrulandı (masaüstü + mobil +
koyu tema): haritanın 8 düğümlü gerçek bir ağacı (dallanma + bir silinmiş
düğüm + onun hayatta kalan remixi dahil) doğru render etmesi; düğüm
seçiminin doğru kaynak/kök/remix-sayısı bilgisini göstermesi; ilk-nesil
bir remixte YALNIZCA tek bir karşılaştırma seçeneğinin (mükerrer değil)
görünmesi, derin bir remixte ikisinin de görünmesi; yalnızca gerçek
sahibine "Merge talebi oluştur" butonunun görünmesi; bir merge talebini
kabul etme/reddetme/geri çekme/yeni bir talep oluşturmanın HER BİRİNİN
gerçek bir RPC çağrısı tetikleyip arayüzü sayfa yenilenmeden
güncellemesi; fark karşılaştırma modalının doğru başlık/alan-bazlı diff
göstermesi; silinmiş bir düğümün "Silinmiş içerik" göstermesi VE onun
hayatta kalan remixinin kendi kaynağını hâlâ doğru şekilde "silinmiş"
olarak raporlaması; mobilde haritanın varsayılan olarak katlı başlayıp
toggle ile açılması ve yatay taşma olmaması (hem katlıyken hem açıkken);
koyu temada hatasız render — hepsi sıfır JS hatasıyla. Ayrıca bu
oturumun önceki bölümlerine ait regresyon paketleri (bildirim merkezi,
32 senaryo; genel 19 rotalık Supabase-tamamen-erişilemez dayanıklılık
taraması) yeniden çalıştırılıp bozulma olmadığı doğrulandı. **Gerçek bir
Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı
yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe belirtilen
aynı sınırlama) — kullanıcının `20260919250000_remix_merge_system.sql`'i
Dashboard'da uygulayıp bizzat denemesi gerekiyor.

## Demo hesaplar (seed)

`supabase/seed/demo-users.sql` — siteyi 18 gerçek kullanıcı kullanıyormuş gibi
dolduran, tekrar çalıştırılabilir bir seed (migration DEĞİL, şemayı değiştirmez).
18 hesap (`ali@msn.com`, `veli@msn.com`, … şifre `ac8d5c55`), 99 prompt (18'i
isteklere yanıt), 39 prompt isteği, 60 generator, beğeniler, iç içe yorumlar,
takipler ve koleksiyonlar oluşturur. Görseller picsum.photos (gerçek fotoğraflar,
seed ile sabit), avatarlar randomuser.me. Seed'i ilk (loremflickr'lı) sürümüyle
çalıştırdıysan yalnızca `demo-images-fix.sql`'i çalıştırman görselleri düzeltir.

1. Önce TÜM migration'ları uygula (`20260919360000_generator_comment_notification_fix.sql` dahil).
2. SQL Editor'e `demo-users.sql`'in tamamını yapıştırıp çalıştır.

Tekrar çalıştırmak güvenli: yalnızca `5eed…` id'li demo hesaplarını silip
baştan oluşturur. Demo e-postalarından biriyle (ör. `veli@msn.com`) daha önce
açılmış bir hesap varsa o hesap ve içerikleri de silinir; başka hesaplara dokunmaz. İçeriği değiştirmek için
`demo-content.mjs`'i düzenleyip `node supabase/seed/build-demo-seed.mjs` çalıştır.

## Edge Functions

`supabase/functions/analyze-image/index.ts` — AI Vision Generator sisteminin
kullandığı, görsel + MIME type alıp Gemini Vision'a gönderen, yapılandırılmış
JSON döndüren fonksiyon. Bu dosya, kullanıcının Supabase Dashboard'da zaten
çalışır durumda tuttuğu koda dayanıyor; bu repoya ilk kez bu commit'te
eklendi (öncesinde yalnızca Dashboard'da vardı, git'te izlenmiyordu).

**Deploy:** Bu sandbox'ın `*.supabase.co`'ya ağ erişimi yok (bu depodaki
diğer her modülle aynı, tekrarlanan sınırlama — bkz. yukarısı), bu yüzden bu
dosya buradan hiç deploy edilemedi/canlıya karşı test edilemedi. Kullanıcı
bunu ya doğrudan Dashboard → Edge Functions → `analyze-image` → Code'a
yapıştırıp Deploy ederek, ya da yerel makinesinde
`supabase functions deploy analyze-image --project-ref <proje-ref>` ile
uygulamalı. `GEMINI_API_KEY` zaten Dashboard'da bir Function Secret olarak
duruyor — bu dosyada literal bir key yok, değişmesi gerekmiyor.

**Model adı:** `GEMINI_MODEL` sabitinde (`index.ts`'in başında) — Google
modeli tekrar değiştirirse (bir "model artık kullanılamıyor" 404'ü gibi)
güncellenmesi gereken tek satır burası.
