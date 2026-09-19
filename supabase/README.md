# Promptly — Supabase migrations

Bu klasördeki `migrations/*.sql` dosyaları, `src/types/index.ts`'teki mock
veri modelini birebir yansıtan gerçek Postgres şemasını (CLAUDE.md Bölüm
18), her tablonun gerçek erişim kurallarını (RLS politikaları, Bölüm 19)
ve görsel yükleme için Supabase Storage bucket'larını (Bölüm 20) oluşturur.
Dosyalar sırayla (dosya adındaki zaman damgasına göre) uygulanmalıdır.

**Durum:** İlk 10 dosya — Bölüm 18 şema + Bölüm 19 RLS + Bölüm 9.2'nin
`20260919150000_request_response_workflow.sql`'i + Bölüm 9.4'ün
`20260919160000_comment_likes_and_notifications.sql`'i — kullanıcı
tarafından gerçek Supabase projesine (Dashboard → SQL Editor) başarıyla
uygulandı ve doğrulandı. `20260919140000_storage.sql` (Bölüm 20, Storage
bucket'ları) ve yeni `20260919170000_comment_edit_delete.sql` (Bölüm 9.5,
yorum/yanıt düzenleme + güvenli silme) bu depodan otomatik olarak
uygulanmadı — Claude Code'un çalıştığı ortamın ağ politikası gerçek
Supabase projesinin veritabanına doğrudan erişimi engelliyor, bu yüzden
yalnızca yerel, geçici bir Postgres 16 örneğinde gerçek rol simülasyonuyla
test edildi (bkz. aşağıdaki "Nasıl doğrulandı" bölümü) — gerçek projenize
henüz uygulanmadı. **`20260919170000` uygulanmadan** yorum/yanıt düzenleme
ve silme frontend'de hata verir (`prompt_comments.edited_at`/`deleted_at`
kolonları henüz yok demektir) — bu migration'ı uygulamak bu özelliğin
çalışması için **zorunlu**.

## Nasıl uygularsınız

**Seçenek A — Supabase Dashboard (kod/CLI kurulumu gerektirmez):**

1. [Supabase Dashboard](https://supabase.com/dashboard) → projeniz → sol
   menüden **SQL Editor**'ü açın.
2. `migrations/` klasöründeki her dosyayı **dosya adındaki sıraya göre**
   (20260919120000, 20260919120100, ... 20260919120600, 20260919130000,
   20260919140000, 20260919150000, 20260919160000, 20260919170000) tek
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
