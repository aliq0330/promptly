# Promptly — Supabase migrations

Bu klasördeki `migrations/*.sql` dosyaları, `src/types/index.ts`'teki mock
veri modelini birebir yansıtan gerçek Postgres şemasını (CLAUDE.md Bölüm
18), her tablonun gerçek erişim kurallarını (RLS politikaları, Bölüm 19)
ve görsel yükleme için Supabase Storage bucket'larını (Bölüm 20) oluşturur.
Dosyalar sırayla (dosya adındaki zaman damgasına göre) uygulanmalıdır.

**Durum:** İlk 8 dosya (Bölüm 18 şema + Bölüm 19 RLS) kullanıcı tarafından
gerçek Supabase projesine (Dashboard → SQL Editor) başarıyla uygulandı ve
doğrulandı. `20260919140000_storage.sql` (Bölüm 20, Storage bucket'ları)
bu depodan otomatik olarak uygulanmadı — Claude Code'un çalıştığı ortamın
ağ politikası gerçek Supabase projesinin veritabanına doğrudan erişimi
engelliyor, bu yüzden yalnızca yerel, geçici bir Postgres 16 örneğinde
gerçek rol simülasyonuyla test edildi (bkz. aşağıdaki "Nasıl doğrulandı"
bölümü) — gerçek projenize henüz uygulanmadı.

## Nasıl uygularsınız

**Seçenek A — Supabase Dashboard (kod/CLI kurulumu gerektirmez):**

1. [Supabase Dashboard](https://supabase.com/dashboard) → projeniz → sol
   menüden **SQL Editor**'ü açın.
2. `migrations/` klasöründeki her dosyayı **dosya adındaki sıraya göre**
   (20260919120000, 20260919120100, ... 20260919120600, 20260919130000,
   20260919140000) tek tek açıp içeriğini SQL Editor'e yapıştırıp
   **Run**'a basın.
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
