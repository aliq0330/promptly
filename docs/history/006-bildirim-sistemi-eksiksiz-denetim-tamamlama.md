### 9.6 Bildirim sistemi: eksiksiz denetim + tamamlama

Kullanıcının çok ayrıntılı "Bildirim Sistemi: Uygulama ve Test Promptu"
talebi üzerine, önce TÜM mevcut bildirim üretim/okuma/silme kodu, TÜM
beğeni/yorum/yanıt/remix/istek/takip/mesaj kodu ve ilgili migration'lar
uçtan uca denetlendi; yalnızca bu denetimden sonra eksikler kapatıldı.
Talebin kendi sözleriyle koyduğu kural aynen izlendi: **doğru çalışan
kurallar yeniden tanımlanmadı, yalnızca gerçek eksikler/hatalar
düzeltildi.**

**AŞAMA 1 — Denetim bulguları:**
- Bildirim tablosu (Bölüm 18) ve RLS'i (Bölüm 19) zaten doğruydu:
  SELECT/UPDATE politikaları `auth.uid() = recipient_id` ile doğru
  sahiplik kontrolü yapıyordu. **Eksik: hiç DELETE politikası yoktu** —
  kullanıcı kendi bildirimini bile silemiyordu.
- Yalnızca 4 gerçek bildirim üreticisi vardı: `notify_new_request_response`,
  `notify_selected_response` (yalnızca yeni seçileni bildiriyordu, eskiyi
  değil), `notify_comment_reply` (yalnızca `parent_id` dolu — doğrudan bir
  yoruma/yanıta yanıt — dalını kapsıyordu, bir gönderiye doğrudan yapılan
  İLK yorumu hiç kapsamıyordu), `notify_comment_like`. Hepsi doğru
  `SECURITY DEFINER` + self-skip deseniyle yazılmıştı — **bu dördü
  değiştirilmeden korundu**, yalnızca ikisine (`notify_comment_like`,
  `notify_selected_response`) eksik davranış eklendi (aşağıya bakınız).
- `notifications.type` CHECK kısıtı (Bölüm 18) `follow`/`remix`/`message`/
  `comment` değerlerini baştan beri tanımlıyordu ama HİÇBİRİ için üretici
  yoktu — bunlar gerçek, somut eksiklerdi.
- Beğeni geri çekildiğinde (unlike) veya yorum/yanıt beğenisi geri
  çekildiğinde bildirimi silen HİÇBİR mekanizma yoktu (mükerrer bildirim
  önleme de aynı şekilde eksikti — aynı olayın iki kez işlenmesini
  engelleyecek bir dedupe anahtarı yoktu).
- İçerik (prompt/istek) silindiğinde ona işaret eden bildirimlerin
  temizlenmesi için hiçbir mekanizma yoktu.
- `src/lib/supabase/notifications.ts`'te yalnızca `fetchNotificationsForUser`
  vardı — okundu işaretleme ve silme fonksiyonları hiç yoktu; `/notifications`
  sayfası hiçbir zaman hiçbir şeyi okundu işaretlemiyordu; header'daki zil
  ikonu hiçbir zaman okunmamış noktası göstermiyordu (mesaj ikonundaki
  `hasUnreadMessages` deseninin eşi hiç kurulmamıştı).
- **Mimari olarak bu uygulamada hiç var olmayan, bu yüzden uygulanamayan
  iki kural tespit edildi** (yeni bir paralel sistem kurmamak için
  KASITLI OLARAK dışarıda bırakıldı, bkz. "Kapsam dışı" altında):
  "prompt isteği gönderisini beğenme" (uygulamada hiçbir yerde bir
  isteğin kendisi beğenilemiyor — `LikeButton` yalnızca promptlara
  bağlı, `request_likes` diye bir tablo yok) ve "sistem duyuruları"
  (uygulamada bir duyuru yazma/yönetim ekranı hiç yok — Bölüm 22 henüz
  başlamadı).

**Yeni migration:** `supabase/migrations/20260919180000_notification_
system_completion.sql`:
- `notifications.dedupe_key text` + kısmi tekil indeks
  (`where dedupe_key is not null`) — yalnızca gerçekten "geri
  çekilebilir" iki olay tipinde (prompt beğenisi, yorum/yanıt beğenisi)
  kullanılıyor: bir beğeni geri çekildiğinde YALNIZCA o beğeninin
  bildirimini silmeyi atomik ve kesin hale getiriyor. Takip/mesaj/remix/
  seçim/kapanış gibi tek seferlik olaylara BİLİNÇLİ OLARAK dedupe anahtarı
  eklenmedi — kendi tablolarının PK'sı zaten mükerrer olayı engelliyor,
  ve bir dedupe anahtarı burada meşru bir "ikinci kez" olayı (ör. yeniden
  açıp tekrar kapatma) yanlışlıkla engellerdi.
- "Users can delete their own notifications" — eksik olan DELETE
  politikası eklendi.
- `cleanup_notifications_for_deleted_prompt`/`..._request` (AFTER DELETE,
  `prompts`/`prompt_requests`) — bir prompt/istek silinince ona işaret eden
  (`target_href` tam eşleşmesiyle) bildirimler temizleniyor. Yorum
  bildirimleri için ayrı bir temizleyici GEREKMEDİ — bir yoruma değil
  her zaman sabit gönderi/istek URL'sine işaret ediyorlar, o hiç
  geçersiz olmuyor.
- `notify_prompt_like` (YENİ) + `cleanup_prompt_like_notification` (YENİ,
  beğeni geri çekilince — okunmuş olsa bile siliyor) — prompt beğenisi
  artık gönderi sahibine bildirim üretiyor.
- `notify_comment_like`'a `dedupe_key` eklendi (`create or replace`,
  trigger'ı değişmedi) + `cleanup_comment_like_notification` (YENİ) —
  yorum/yanıt beğenisi geri çekilince artık bildirimi siliyor (öncesinde
  hiç silinmiyordu).
- `notify_comment_reply`'a (`create or replace`) yeni bir `else` dalı
  eklendi: `parent_id is null` olan (yani bir gönderiye/isteğe DOĞRUDAN
  yapılan ilk seviye yorum) durumda `type='comment'` bildirimi üretiyor
  (gönderi/istek sahibine); `parent_id is not null` dalı (yanıta yanıt →
  doğrudan üst sahibine, zincirdeki başka kimseye değil) DEĞİŞTİRİLMEDİ.
- `notify_new_remix` (YENİ) — bir prompt `origin_type='remix'` ile
  oluşturulunca kaynağın sahibine bildirim üretiyor.
- `notify_selected_response` (`create or replace`) — artık İKİ bağımsız
  dal: eski seçili yanıt sahibine "artık seçili değil", yeni seçili yanıt
  sahibine "seçildi" — ikisi ayrı ayrı kontrol edildiğinden seçim
  değiştirme/kaldırma/ilk seçim üç durumu da doğru, birbirine
  karışmadan kapsıyor.
- `notify_request_closed` (YENİ) — bir istek yalnızca MANUEL kapatılınca
  (`status → 'closed'`, otomatik `'answered'` geçişinde DEĞİL — o zaten
  kendi "seçildi" bildirimini alıyor) o isteğe gerçek yanıt vermiş HER
  farklı kullanıcıya (istek sahibi hariç) bir bildirim üretiyor.
- `notify_new_follow` (YENİ), `notify_new_message` (YENİ, konuşmadaki
  gönderen dışındaki her üyeye).

**Gerçek hata düzeltmesi (yerel test sırasında bulundu):** İlk yazılan
`notify_prompt_like`/`notify_comment_like`, `on conflict (dedupe_key) do
nothing` kullanıyordu — ama `dedupe_key` üzerindeki indeks KISMİ
(`where dedupe_key is not null`). PostgreSQL, `ON CONFLICT` hedefinin bir
kısmi indeksi "arbiter" olarak seçebilmesi için hedefte AYNI `WHERE`
koşulunun tekrar edilmesini şart koşuyor — tekrar edilmeyince "there is
no unique or exclusion constraint matching the ON CONFLICT specification"
hatası veriyor. Düzeltme: `on conflict (dedupe_key) where dedupe_key is
not null do nothing`. Bu, yerel Postgres testinde gerçekten yakalandı
(ilk çalıştırmada Grup 1/3 hata verdi), düzeltilip yeniden test edilerek
doğrulandı.

**İstemci tarafı (`src/lib/supabase/notifications.ts`, yeni fonksiyonlar):**
`markNotificationRead(id, userId)` ve `deleteNotification(id, userId)` —
ikisi de RLS'e güveniyor (`recipient_id` eşleşmesi sunucu tarafında
zorunlu, istemcinin verdiği `userId` tek başına hiçbir şeyi kanıtlamıyor).

**Yeni `features/notifications/notifications-provider.tsx`**
(`NotificationsProvider`/`useNotifications`, `RealMessagesProvider` ile
birebir aynı mimari) — bildirimleri, okunmamış sayısını, `markRead`/
`remove` aksiyonlarını tek bir paylaşılan fetch'ten sağlıyor (header ve
`/notifications` sayfası artık ayrı ayrı sorgu atmıyor); `AppProviders`'a
eklendi. `/notifications` sayfası ve `NotificationList`/`NotificationRow`
bunu kullanacak şekilde güncellendi: bir bildirime tıklamak (linke
gitmeden önce) `markRead`'i tetikliyor, her satırda gerçek bir "Bildirimi
sil" (X ikonlu) butonu var — tıklaması `stopPropagation`/`preventDefault`
ile kart linkiyle çakışmıyor (bu projede zaten yerleşik olan stretched-
link deseniyle aynı teknik). `Header`'daki zil ikonu artık mesaj
ikonundaki `hasUnreadMessages` ile birebir aynı desende gerçek bir
okunmamış noktası gösteriyor (`unreadCount > 0`).

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı):** Yeni
migration, `00_stub.sql` + önceki 12 migration'la birlikte temiz bir
yerel PostgreSQL 16 veritabanına gerçekten uygulandı (roller zaten
küme genelinde var olduğundan `00_stub.sql`'in rol oluşturma kısmı
`if not exists` ile güvenli hale getirildi — bu yalnızca test
altyapısının kendi düzeltmesi, migration'ın bir parçası değil). 10 test
grubu, 3 gerçek kullanıcıyla (`set role authenticated` + `request.jwt.
claim.sub` ile kimlik simülasyonu, önceki fazlarda kurulan aynı yöntem)
kapsamlı bir senaryo dosyasıyla (`/tmp/pgtest2/notification_test.sql`,
depoya dahil değil — yalnızca test amaçlı) çalıştırıldı ve TÜMÜ beklenen
sonucu verdi:
- Beğeni: oluşturma, kendi kendine beğenmede bildirim OLUŞMAMASI, geri
  çekmede YALNIZCA o bildirimin silinmesi, yeniden beğenmede yeni
  bildirim.
- Yorum: doğrudan yorum → gönderi sahibi; yanıt → doğrudan üst sahibi
  (zincirdeki başkasına DEĞİL); kendi yorumuna kendi yanıtı → bildirim
  yok.
- Yorum/yanıt beğenisi: oluşturma + geri çekmede silme + yorum silme
  sonrası ilgisiz `comment_reply` bildiriminin ETKİLENMEMESİ.
- Remix: kaynağa bildirim, kendi çalışmasını remixlemede bildirim yok.
- İstek yanıtı tam yaşam döngüsü: yayınlama (×2, farklı yanıtlayanlar),
  "yalnızca yorum yanıt sayılmaz" kontrolü, seçme, seçimi DEĞİŞTİRME
  (eski sahip "artık seçili değil" + yeni sahip "seçildi", birbirine
  KARIŞMADAN), seçimi TAMAMEN KALDIRMA (kalan sahibin "yayınlandı"
  bildirimi ETKİLENMEDEN kalıyor).
- İstek kapatma: yalnızca gerçek yanıt verenler bildirim alıyor, istek
  sahibi almıyor; yeniden aç + tekrar kapat → 2. bildirim doğru
  oluşuyor (aynı içerik "yeniden" değil, gerçek yeni bir olay).
- Takip: oluşturma, takipten çıkmada bildirim SİLİNMEMESİ (ve yeni
  bildirim de oluşmaması), yeniden takipte yeni bildirim.
- Mesaj: alıcı bildirim alıyor, gönderen almıyor.
- Okuma/silme/RLS: kendi bildirimini okundu işaretleme başarılı;
  başkasının bildirimini okundu işaretleme/silme denemesi RLS tarafından
  sessizce 0 satır etkileyerek engelleniyor; kendi bildirimini silme
  yalnızca bildirim satırını siliyor, altta yatan `follows` ilişkisine
  DOKUNMUYOR.
- İçerik silme: bir prompt silinince ona işaret eden bildirim
  temizleniyor.

**Test sırasında ayrıca keşfedilen, bu görevin KAPSAMI DIŞINDA, ÖNCEDEN
VAR OLAN bir şema kısıtlaması:** Bölüm 18'den beri `prompts.
source_prompt_id` `on delete set null` ile tanımlı, ama
`prompts_origin_shape` CHECK kısıtı `origin_type='remix'` olan bir
satırda `source_prompt_id`'nin ASLA null olmamasını şart koşuyor. Sonuç:
remixlenmiş herhangi bir orijinal prompt BUGÜN DE (bu görevden önce de)
silinmeye çalışılırsa, silme FK cascade'i `source_prompt_id`'yi null'a
çekmeye çalışırken CHECK kısıtına çarpıp veritabanı hatasıyla
reddediliyor — `deleteRealPrompt`/kart menüsündeki "Sil" bu durumda
kullanıcıya bir hata gösterir (uygulama çökmez, ama silme başarısız
olur). Bu, bildirim sistemiyle hiç ilgisi olmayan, bu denetim sırasında
tesadüfen ortaya çıkan gerçek bir mimari boşluk — **bu görevin kapsamına
alınmadı** (talimat: "gereksiz... kapsam dışı UI oluşturma, mevcut
sistemdeki başka özellikleri bozma" — bunu düzeltmek remix zincirinin
silme davranışına dair ayrı bir mimari karar gerektiriyor: ya remixleri
de cascade silmek ya da `origin_type`'ı bir şekilde "kaynağı silinmiş"
durumuna geçirmek). Test senaryosu bu yüzden İZOLE, remixlenmemiş ayrı
bir prompt üzerinde çalışacak şekilde düzenlendi; asıl remixlenmiş
promptu silme denemesi ayrı, bilgi amaçlı bir adımda BİLEREK
çalıştırılıp aynı hatayı üretmesi doğrulandı (yani hipotez değil,
gerçekten yeniden üretilmiş bir bulgu). **Kullanıcının karar vermesi
gereken bir sonraki adım** — düzeltme bu raporun kapsamında değil.

**Test senaryosunun kendi ölçüm hassasiyetiyle ilgili iki not (gerçek
bir hata DEĞİL):** (1) `expect_1_comment_on_request` sorgusu Aylin'in
TÜM `comment` tipi bildirimlerini sayıyor (yalnızca istek yorumunu
değil) — gerçek değer 2 (biri prompt yorumundan, biri istek
yorumundan), bu DOĞRU davranış, yalnızca test değişken adı yanıltıcı.
(2) 9d adımında "kendi bildirimini sil" testi `type='follow'` ile TÜM
takip bildirimlerini (o an 2 tane) tek seferde siliyor, "yalnızca 1
azalır" değil "2 azalır" sonucu veriyor — asıl doğrulanan kural
(başkasının bildirimini silemezsin, kendi bildirimini silmek `follows`
tablosuna dokunmaz) ayrı satırlarla zaten doğru şekilde kanıtlandı.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi):**
16 senaryo, hepsi sıfır JS hatasıyla geçti: 4 farklı bildirim tipinin
(beğeni/yorum/takip/istek yanıtı seçimi) doğru aktör/mesaj/simgeyle
render edilmesi; bir bildirime tıklamanın gerçek bir PATCH tetikleyip
doğru sayfaya yönlendirmesi; header zilinin 3 okunmamışken nokta
göstermesi, biri okunduktan sonra hâlâ göstermesi (2 kaldı), hepsi
okunduktan sonra KAYBOLMASI; silme butonunun sayfadan ÇIKMADAN gerçek
bir DELETE tetikleyip yalnızca o bildirimi kaldırması (diğerleri
sağlam kalıyor); giriş yapılmamışken dürüst boş durum; mobilde yatay
taşma yok. Ayrıca Supabase'e hiç erişilemezken (bu sandbox'ın standart
ağ kısıtı) 6 farklı sayfanın (`/`, `/discover`, `/notifications`,
`/messages`, `/saved`, `/following`) sıfır JS hatasıyla zarifçe
davrandığı ayrıca doğrulandı. `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti.

**Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** — bu
sandbox'ın ağ politikası `*.supabase.co`'ya erişimi engelliyor (Bölüm
17'den beri tekrarlanan, dürüstçe belirtilen aynı sınırlama). Yukarıdaki
SQL testleri GERÇEK bir Postgres/RLS motorunda çalıştı (taklit değil),
istemci testleri ise ağ seviyesinde taklit edilmiş yanıtlarla çalıştı —
ikisi birlikte mantığı yüksek güvenle doğruluyor ama kullanıcının
migration'ı kendi projesine uygulayıp bizzat denemesi hâlâ gerekli.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- "Prompt isteği gönderisini beğenme" bildirimi eklenmedi — böyle bir
  beğenme özelliği uygulamada hiç yok (`request_likes` tablosu yok,
  `RequestCard`'da beğeni ikonu yok); talimatın "gereksiz tablo/paralel
  sistem oluşturma" kuralına uyarak icat edilmedi.
  - Sistem duyurusu (`type='system'`) üretimi eklenmedi — bir duyuru
  yazma/yönetim arayüzü uygulamada hiç yok (Bölüm 22 henüz başlamadı);
  `ICONS` haritası zaten `system` tipini kapsıyor, yalnızca onu
  üretecek bir kaynak yok.
- Seçim kaldırma için ayrı bir bildirim tipi/mesajı icat edilmedi —
  Bölüm 9.2'nin zaten kurduğu "artık seçili değil" mesajı yeniden
  kullanıldı.
- Bildirimlerde sayfalama/"daha fazla yükle" eklenmedi — bu projenin
  genelinde zaten bilinen "tam sayfalama yok" sınırlamasıyla aynı
  kategoriden, kapsam dışı.

**Bilinen sınırlamalar:**
- **Remixlenmiş bir promptu silme, bu görevden bağımsız, önceden var
  olan bir sema kısıtlaması yüzünden başarısız oluyor** (yukarıda
  ayrıntılı açıklandı) — kullanıcının karar vermesi gereken bir sonraki
  adım.
- Bildirimlerde gerçek zamanlı (Realtime) güncelleme yok — Bölüm 21 Faz
  6'dan beri bilinen, mesajlaşmada da geçerli olan aynı sınırlama;
  bildirimler yalnızca sayfa yüklendiğinde/ziyaret edildiğinde çekiliyor.
- N+1 yok (bildirimler zaten tek bir toplu sorguyla çekiliyor), ama
  `NotificationsProvider` gerçek zamanlı abonelik olmadığından başka bir
  sekmede/cihazda oluşan yeni bir bildirim, bu sekme yeniden
  ziyaret/yenilenene kadar görünmüyor.
- Toplu "tümünü okundu işaretle" veya "tümünü sil" arayüzü eklenmedi —
  şartname tek tek okuma/silme istiyordu, toplu aksiyon kapsamda değildi.
