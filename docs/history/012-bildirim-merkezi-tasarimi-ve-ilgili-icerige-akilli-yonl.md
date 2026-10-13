### 9.12 Bildirim Merkezi tasarımı ve ilgili içeriğe akıllı yönlendirme

Kullanıcının çok ayrıntılı "Bildirim Merkezi Tasarımı ve İlgili İçeriğe Akıllı
Yönlendirme" şartnamesi üzerine, önce mevcut bildirim altyapısı (Bölüm 9.6'nın
kurduğu, Bölüm 9.9'un genişlettiği sistem), veri modeli, yorum ağacının
genişletme/scroll mekanizması (Bölüm 9.4/9.5) ve ilgili sayfa rotaları
denetlendi. Kural aynen izlendi: **mevcut bildirim üretim kuralları
(kim-ne-zaman bildirim alır) hiç değiştirilmedi**, yalnızca (a) merkezin
arayüzü şartnameye göre yenilendi ve (b) her bildirimin GERÇEK hedefine
(genel sayfa değil, tam yorum/yanıt/mesaj) yönlendirme + otomatik
genişletme/scroll/vurgu eklendi.

**AŞAMA 1 denetim bulgusu — şema, önerilen sütunları hiç içermiyordu:**
`notifications` tablosu (Bölüm 18/19) yalnızca `recipient_id`, `actor_id`,
`type`, `message` (düz bir olay cümlesi) ve `target_href` (düz bir URL
metni) tutuyor — şartnamenin önerdiği `post_id`/`comment_id`/`reply_id`/
`request_id`/`message_id` gibi ayrı sütunlar hiç yok. Şartnamenin kendi
kuralına uyarak ("Bütün alanları körü körüne ekleme... eşdeğer mevcut
alanları değerlendir") yeni bir sütun seti YARATILMADI — bunun yerine, bu
projenin zaten Bölüm 21'den beri kullandığı "gerçek kimliği query
string'te taşı" deseni (`promptHref`/`requestHref`/`messageHref`) doğal
olarak genişletildi: `target_href`'e tek, genel bir `hl=<tür>:<id>` sorgu
parametresi eklendi (`supabase/migrations/20260919230000_notification_
targeting_and_previews.sql`). `hl` değerleri: `post:<promptId>` (beğenilen/
remixlenen gönderinin kendisi), `comment:<commentId>` (beğenilen/
yanıtlanan/yeni eklenen yorum ya da yanıt — hangisi olduğu zaten
`notifications.type`'tan belli), `response_new:<responseId>` /
`response_selected:<responseId>` / `response_unselected:<responseId>` (bir
istek yanıtı — üç alt durum farklı ikon/vurgu gerektirdiğinden ayrı ayrı
adlandırıldı), `message:<messageId>`. İstek KAPANMA bildiriminin `hl`'i
yok (tek bir yanıta değil isteğin kendisine işaret ediyor) — bu, istemci
tarafında "hl yoksa kapanma" ayrımını da kendiliğinden sağlıyor.

**AŞAMA 1 denetim bulgusu — içerik önizlemesi hiç yoktu:** `message` alanı
yalnızca "Yorumunu beğendi." gibi düz bir olay cümlesiydi; yalnızca istek
yanıtı bildirimleri zaten isteğin başlığını gömüyordu (var olan bir
konvansiyon). Aynı konvansiyon (dinamik metni doğrudan `message`'a
gömme — ayrı bir "preview" sütunu/sistemi YARATMADAN) beğeni/yorum/yanıt/
remix/mesaj bildirimlerine de genişletildi: yeni `public.truncate_
preview(text, n)` SQL yardımcı fonksiyonu (≈90 karakterde kırpma) ile her
üretici artık gerçek gönderi başlığını/yorum metnini/mesaj önizlemesini
kendi cümlesine gömüyor — ör. `'Yorumunu beğendi: "Renk paleti çok iyi
olmuş."'`. Mesaj önizlemesi, mesaj yalnızca paylaşılan içerikse (metin
yok) `previewTextFor()`'un (Bölüm 9.8) aynı düşen sırasını izliyor ("bir
prompt paylaştı" vb.).

**Değişen 7 bildirim üreticisi (hepsi `create or replace`, trigger'lar
DEĞİŞMEDİ):** `notify_prompt_like`, `notify_comment_like`, `notify_
comment_reply`, `notify_new_remix`, `notify_new_request_response`,
`notify_selected_response`, `notify_new_message`. **Değişmeyen 2 üretici**
(zaten doğru, kapsam dışı): `notify_new_follow`, `notify_request_closed`
(yalnızca `message`/`target_href`'i sabit kaldı, çünkü zaten tek bir
yanıta değil isteğin kendisine işaret ediyor).

**Gerçek regresyon riski bulundu ve düzeltildi — silme temizliği artık
önek eşleşmesi kullanıyor:** Bölüm 19'un `cleanup_notifications_for_
deleted_prompt`/`_request` fonksiyonları `target_href`'e TAM eşitlik
(`= '/prompts/local?id=' || old.id`) ile bakıyordu. `target_href` artık
bazı bildirimlerde `&hl=...` ile uzadığından bu tam eşleşme o satırları
ARTIK YAKALAMAZDI — bir gönderi silindiğinde ona işaret eden (ama `hl`
taşıyan) bildirimler kırık bir bağlantıya işaret etmeye devam ederdi. Her
ikisi de önek eşleşmesine (`like '/prompts/local?id=' || old.id || '%'`)
çevrildi; UUID'ler sabit uzunlukta olduğundan bir UUID başka bir UUID'nin
öneki asla olamaz, bu yüzden önek eşleşmesi yanlış bir satırı asla
yakalamaz — gerçekten test edildi (aşağıya bakınız).

**AŞAMA 1-3 — Bildirim merkezi UI (`src/app/(app)/notifications/page.tsx`
ve `src/features/notifications/`):**
- **Başlık satırı:** "Bildirimler" + "Tümünü okundu işaretle" aksiyonu
  aynı satırda (`flex-wrap` ile mobilde taşmadan alt satıra düşüyor).
  Yeni `markAllNotificationsRead(userId)` (`lib/supabase/notifications.ts`
  — tek bir toplu `UPDATE ... WHERE recipient_id=… AND is_read=false`,
  okunmamış sayısı kadar ayrı istek DEĞİL) + `NotificationsProvider`'a
  `markAllRead` aksiyonu eklendi. Hiçbir okunmamış yoksa buton devre dışı.
- **Kategori filtreleri** (`notification-category-filter.tsx`, YENİ):
  Tümü/Gönderiler/İstekler/Takip/Mesajlar/Sistem — yatay kaydırılabilir
  pilller (`overflow-x-auto`, `flex-nowrap` niyetinde `shrink-0`),
  mobilde sayfa genişliğini hiç bozmuyor. Yeni `src/lib/notification-
  utils.ts` → `NOTIFICATION_CATEGORY: Record<NotificationType,
  NotificationCategory>` (`like`/`comment`/`comment_reply`/`remix` →
  "posts", `request_response` → "requests", `follow` → "follow",
  `message`/`message_request` → "messages", `system` → "system").
  Filtreleme tamamen istemci tarafında (`/notifications/page.tsx`'in
  kendi `useState` + `useMemo`'su) — zaten yüklenmiş listeyi filtreliyor,
  hiçbir side-effect/fetch yok, bu yüzden kategori değiştirmek YAPISAL
  OLARAK hiçbir şeyi okundu işaretleyemez (şartnamenin özellikle istediği
  garanti).
- **İkonlar** (`notification-row.tsx` tamamen yeniden yazıldı):
  Eskiden `type` başına TEK bir ikon vardı (ör. `request_response` her
  zaman `Sparkles`) VE bir `actor` varsa ikon hiç gösterilmiyordu (avatar
  onun yerini alıyordu). Artık avatar + ikonun İKİSİ BİRDEN gösteriliyor
  — ikon, avatarın sağ-alt köşesine bindirilmiş küçük, dairesel bir rozet
  (Instagram'ın bildirim deseniyle aynı fikir); actor yoksa (yalnızca
  `system` bugün) tek başına bir ikon dairesi. `type` tek başına iki
  durumu ayırt edemediğinden (`like` hem gönderi hem yorum/yanıt
  beğenisi olabilir; `request_response` iş akışının dört farklı anını
  kapsıyor), bu ikisi ayrıca `hl`'in TÜRÜNE (`kind`) bakıyor — yeni
  `getNotificationIconKey()` + statik `NOTIFICATION_ICONS` nesnesi
  (`notification-utils.ts`): `like_post`→Heart, `like_comment`→
  MessageCircleHeart, `comment`→MessageCircle, `comment_reply`→
  MessageCircleReply, `remix`→Repeat2, `follow`→UserPlus, `request_
  response_new`→Code2, `_selected`→CheckCircle2, `_unselected`→RotateCcw,
  `_closed`(hl yok)→Lock, `message`/`message_request`→Mail, `system`→
  Bell. **Teknik not:** ikon seçimi bir FONKSİYON DEĞİL, bir string
  anahtarla düz bir nesneye (`NOTIFICATION_ICONS[key]`) bakan bir
  ifade olarak yazıldı — `eslint-plugin-react-hooks`'un "static
  components" kuralı, bir switch/if zinciriyle döndürülen bir bileşen
  referansını "render sırasında yeniden oluşturulabilir" diye
  reddediyor; düz nesne indexleme (bu projede zaten `ICONS[type]` olarak
  kullanılan eski desenle birebir aynı) buna takılmıyor. Test/hata
  ayıklama için rozet sarmalayıcısına `data-notification-icon={key}`
  eklendi (`data-message-id` ile aynı gerekçe, Bölüm 9.8).
- **Açıklama + önizleme:** yukarıda anlatıldığı gibi hepsi artık `message`
  alanına sunucu tarafında gömülü geliyor; `NotificationRow` yalnızca
  `{actor.displayName} {message}`'ı `line-clamp-2` ile gösteriyor (uzun
  bir önizleme kartı gereksiz yere büyütmesin diye — şartnamenin "kontrollü
  biçimde kısaltılsın" isteği).
- **Okunmamış görünümü:** var olan hafif arka plan tonu (`bg-accent-
  surface/30`) + nokta korundu, ek olarak ekran okuyucular için `sr-only`
  "Okunmadı" etiketi eklendi (Aşama 8'in "yalnızca renkle anlamlandırılmasın"
  ilkesi unread göstergesine de uygulandı).

**AŞAMA 4-6 — kesin hedefe yönlendirme + otomatik genişletme/scroll/vurgu:**
Var olan mekanizmalar yeniden kullanıldı, paralel bir sistem KURULMADI:
- **Yorum/yanıt** (`comment-section.tsx`/`comment-node.tsx`): Bölüm 9.4'ün
  zaten kurduğu `nodeRefs`/`pendingScrollToId`/`expandedIds` altyapısı
  (önceden yalnızca "yeni gönderilen kendi yanıtına kaydır" için
  kullanılıyordu) yeni bir `highlightCommentId` prop'una bağlandı: yorumlar
  yüklenince hedef yorumun TÜM ata zinciri (`parentId` takip edilerek)
  `expandedIds`'e ekleniyor (kapalı bir "N yanıtı göster" zincirini
  otomatik açıyor), `pendingScrollToId` hedefe ayarlanıyor (var olan
  scroll effect'i artık hem `comments` hem `expandedIds` değişiminde
  tetikleniyor — ata genişlemeden düğüm DOM'da yok), ve yeni bir
  `highlightedId` state'i `CommentTree`'ye eklenip `CommentNode`'da
  yumuşak mor bir `bg-primary/10 ring-1 ring-primary/40` flaşı olarak
  render ediliyor (2.5 saniye sonra `setTimeout` ile temizleniyor —
  "göz yoran yanıp sönme yok" kuralına uyarak tek, yumuşak bir geçiş).
  Hedef yorum hiç bulunamazsa (`Map`'te yoksa — gerçekten silinmiş ve
  hiç yanıtı olmadığından Bölüm 9.5'in soft-delete'i bile onu
  korumamış) dürüst bir "Bu yorum artık mevcut değil." satırı
  gösteriliyor, sayfa çökmüyor.
- **Gönderi/remix** (`prompt-detail-view.tsx`): `hl=post:<id>` — burada
  "kaydırma" gerekmiyor (gönderi zaten sayfanın tek içeriği), yalnızca
  kök konteynerin kendisi aynı yumuşak mor flaşla 2.5 saniyeliğine
  vurgulanıyor.
- **İstek yanıtı** (`request-detail-view.tsx`): `hl=response_new/
  selected/unselected:<id>` — yanıt listesi (`fetchPromptsForRequest`)
  yüklenince hedef id aranıyor; bulunursa o `PromptCard`'ı saran div
  (yeni bir `responseRefs` haritasıyla, yorum ağacıyla birebir aynı
  desen) hedefe kaydırılıp aynı flaşla vurgulanıyor; bulunamazsa "Bu
  yanıt artık mevcut değil." Birden fazla yanıt varken YANLIŞ yanıtın
  vurgulanmadığı özellikle test edildi (aşağıya bakınız) — şartnamenin
  vurguladığı tam senaryo.
- **Mesaj** (`local-conversation-view.tsx`/`message-bubble.tsx`):
  `hl=message:<id>` — mesaj dizisi zaten TAMAMEN (sayfalama olmadan)
  yüklendiğinden (Bölüm 21 Faz 6), ekstra bir "içerik henüz yüklenmedi"
  bekleme mekanizması gerekmedi: hedef id `messages` state'inde aranıyor,
  varsa `data-message-id` özniteliğiyle (Bölüm 9.8'den beri zaten var)
  DOM'da bulunup kaydırılıp `MessageBubble`'ın yeni `isHighlighted`
  prop'uyla aynı flaşla vurgulanıyor; yoksa (gerçekten silinmiş VEYA bu
  görüntüleyici tarafından "benden sil" ile gizlenmiş — `fetchMessages`
  ikisini de zaten filtreliyor) "Bu mesaj görüntülenemiyor." — şartnamenin
  istediği TAM metin, gizlenen bir mesajın içeriğini asla ifşa etmeden.
- **Takip:** zaten `profileHref()` ile doğru gerçek profile gidiyordu
  (Bölüm 21 Faz 6), bu görevde değişmedi.

**Ortak tasarım kararı — üç ayrı highlight mekanizması, tek bir paylaşılan
görsel dil:** Yorum/yanıt, istek yanıtı ve mesaj vurgusu üçü de AYNI CSS
kalıbını (`-m-1.5 bg-primary/10 p-1.5 ring-1 ring-primary/40 transition-
colors duration-700`, gönderi için kenar boşluğu farkı olmadan aynı ton)
ve aynı 2.5 saniyelik süreyi kullanıyor — üç yerde üç farklı "vurgu
sistemi" icat etmek yerine (şartnamenin "gereksiz yeni sistemler kurma"
ilkesine uygun) tek bir tutarlı his. `-m-1.5`/`p-1.5` çifti kasıtlı:
vurgulanmayan normal görünümde HİÇBİR boşluk/hizalama değişikliği
olmasın diye (negatif kenar boşluğu eklenen dolgunun yerini tam telafi
ediyor) — bu, vurgusuz binlerce yorumun/yanıtın/mesajın günlük
görünümünü bir piksel bile etkilemiyor.

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı, taklit
değil):** Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan geçici bir veritabanına, `auth.users`/`extensions` için
minimal bir taklit + gerçek Supabase projesindeki gibi `anon`/
`authenticated` rol simülasyonuyla (önceki fazlarla aynı yöntem) önceki
17 migration'la birlikte gerçekten uygulandı (storage migration'ı,
önceki fazlarda olduğu gibi bu testin kapsamı dışında bırakıldı — bu
görev storage'a hiç dokunmuyor) ve 9 grup senaryo gerçekten çalıştırılıp
doğrulandı: gönderi beğenisi → doğru önizleme + `hl=post:`; yorum/yanıt
beğenisi → beğenilen metnin önizlemesi + `hl=comment:`; doğrudan yorum
→ yeni yorumun kendi metni + `hl=comment:`; yoruma yanıt → yanıtın kendi
metni + `hl=comment:<yanıtın kendi id'si>`; remix → yeni remixin kendi
başlığı + `hl=post:<remixin id'si>`; istek yanıtı yaşam döngüsünün TAMAMI
(yeni yanıt → `hl=response_new:`, seçilme → `hl=response_selected:`,
seçim kaldırma → `hl=response_unselected:` — ÜÇÜ DE doğru response id'sini
taşıyor, birbirine karışmadan — ve manuel kapatma → HİÇ `hl` yok);
mesaj (gerçek metinli VE yalnızca paylaşılan-içerikli, önizleme metni
ikisinde de doğru); ve **kritik regresyon testi** — silme temizliğinin
artık `&hl=...` ile uzamış href'lere karşı da doğru çalıştığı (bir
gönderi/istek silinince ona işaret eden TÜM bildirimlerin, `hl`'li
olanlar dahil, gerçekten silindiği, ilgisiz bildirimlerin ETKİLENMEDİĞİ).
Ayrıca RLS ile `anon`/`authenticated` rolleri arasında bir kullanıcının
yalnızca KENDİ bildirimlerini okuyabildiği ayrıca doğrulandı. Test
veritabanı işlem bitince silindi.

**Test sırasında ayrıca keşfedilen, bu görevin KAPSAMI DIŞINDA, ÖNCEDEN
VAR OLAN bir şema kısıtlaması (Bölüm 9.6/9.7'nin remix-silme bulgusuyla
BİREBİR AYNI KATEGORİDEN, farklı bir FK üzerinde):** `prompts.request_id`
(Bölüm 18) `on delete set null` ile tanımlı, ama `prompts_origin_shape`
CHECK kısıtı `origin_type='request_response'` olan bir satırda `request_
id`'nin ASLA null olamayacağını şart koşuyor. Sonuç: gerçek bir yanıtı
OLAN bir prompt isteği BUGÜN DE (bu görevden önce de) silinmeye
çalışılırsa, silme veritabanı hatasıyla reddediliyor — `RequestDetailView`
"İsteği sil" butonu şu an bu durumda kullanıcıya bir hata gösterir
(uygulama çökmez, ama silme başarısız olur; bu buton bugün `hasSelection`
durumundan bağımsız her zaman gösteriliyor, yani bir kullanıcı gerçek bir
yanıtı olan isteğini silmeyi denerse bu hatayı alır). Bu, bildirim
sistemiyle hiç ilgisi olmayan, bu görevin test senaryosu hazırlanırken
(Test 9f, bilgi amaçlı) tesadüfen yeniden keşfedilip doğrulanmış (hipotez
değil, gerçekten üretilmiş) bir bulgu — **bu görevin kapsamına
alınmadı**, remix-silme bulgusuyla aynı gerekçeyle (düzeltmek, isteğin
silme davranışına dair ayrı bir mimari karar gerektiriyor: ya yanıtları
da cascade silmek ya da `origin_type`'ı "kaynağı silinmiş" durumuna
geçirecek bir soft-delete eklemek). Test senaryosu bu yüzden yanıtı
OLMAYAN, izole bir istek üzerinde çalışacak şekilde düzenlendi. **Kullanıcının
karar vermesi gereken bir sonraki adım.**

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi):**
Statik export `npx serve` ile yerel sunulup 32 senaryoluk yeni bir test
paketiyle doğrulandı — hepsi sıfır JS hatasıyla geçti: bildirim merkezinde
14 bildirimin tümü render ediliyor; her kategori filtresi doğru sayıda
satır gösteriyor (Gönderiler 6, İstekler 4, Mesajlar 2, Takip 1, Sistem
1); kategori değiştirmenin HİÇBİR PATCH tetiklemediği (okundu işaretlemediği);
**14 bildirim türü/alt-türünün HER BİRİNİN kendi, doğru, farklı ikonunu
gösterdiği** (like_post ≠ like_comment ≠ comment ≠ comment_reply ≠ remix
≠ follow ≠ request_response'un dört alt durumu ≠ message ≠ message_request
≠ system); "Tümünü okundu işaretle"nin TEK bir toplu PATCH'le (`is_read=
eq.false` filtresiyle, tek tek DEĞİL) tüm okunmamış noktalarını
kaldırdığı; 2 seviye iç içe bir yanıta (yorum → yanıt → yanıtın yanıtı)
tıklanan bir bildirimin İKİ ata seviyesini de otomatik açıp doğrudan o
düğüme kaydırdığı ve onu flaşladığı, flaşın ~2.5 saniye sonra kalktığı;
var olmayan bir yoruma giden bir bildirimin sayfayı çökertmeden "Bu yorum
artık mevcut değil." gösterdiği (gönderinin geri kalanı bozulmadan);
gönderi-beğenisi bildiriminin gönderinin tamamını flaşladığı; **iki
yanıtlı bir istekte, seçilen yanıtın DOĞRU kartının flaşlanıp diğerinin
HİÇ etkilenmediği**; mesaj bildiriminin doğru mesajı bulup flaşladığı;
erişilemeyen bir mesaj bildiriminin "Bu mesaj görüntülenemiyor." gösterip
konuşmanın geri kalanını bozmadığı; takip bildiriminin gerçek profile
gittiği VE tıklamanın gerçek bir tekil PATCH (yalnızca o bildirim için)
tetiklediği; ve son olarak Supabase'e (REST) hiç erişilemezken bildirim
bağlantılı 4 rotanın (`/notifications`, bir yorum/yanıt/mesaj hedefli
derin bağlantılar dahil) sıfır JS hatasıyla zarifçe davrandığı. Ayrıca bu
oturumun önceki fazlarına ait regresyon paketleri yeniden çalıştırıldı,
hiçbiri bozulmadı: Faz A (17/17), Faz B (19/19), Faz C (7/7), mobil
mesajlaşma/klavye/profil-linki/input-zoom paketi (15/15), yorum-profil-
linki paketi (5/5), yorum düzenleme/silme paketi (8/8), eski (kategori
filtresiz) bildirim listesi paketi (16/16), ve 19 rotalık genel
dayanıklılık taraması (sıfır JS hatası). **Tek istisna, bu görevden
bağımsız, önceden var olan bir yorum-ağacı regresyon paketindeki
(`comment-tree-test.mjs`) bir senaryo:** "sayfa yenilenince beğeni sayısı
kalıcı kalıyor mu" testi başarısız oldu — kök neden incelendi ve bunun bu
görevin hiç dokunmadığı bir dosyadan (test'in kendi mock GET `prompt_
comments` yanıtı, bir beğeni POST/DELETE'inden SONRA `like_count`'u hiç
güncellemiyor — gerçek bir Supabase projesinde bunu Bölüm 19'un `SECURITY
DEFINER` sayaç trigger'ı yapar, bu mock'ta hiç simüle edilmemiş)
kaynaklandığı doğrulandı — bu görevin comment-node.tsx/comment-section.tsx
değişiklikleriyle hiçbir ilgisi yok, bu testin KENDİSİ bu görevden önce de
aynı şekilde başarısız olurdu. `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919230000_notification_
targeting_and_previews.sql`'i Dashboard'da uygulayıp bizzat denemesi
gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- Yorum/yanıt bağlamı ("gerekiyorsa yanıt verilen yorumun kısa bağlamı
  gösterilsin") yalnızca yanıtın KENDİ metniyle sınırlı tutuldu, üst
  yorumun ayrıca gömülmesi eklenmedi — şartname de bunu zaten koşullu
  ("gerekiyorsa") bıraktı, ek bir DB join gerektirirdi.
- Toplu "tümünü sil" eklenmedi — şartname yalnızca "tümünü okundu
  işaretle"yi istedi.
- Sistem bildirimi üretimi hâlâ yok (Bölüm 9.6'dan beri bilinen sınırlama)
  — uygulamada bir duyuru yazma arayüzü hiç yok, icat edilmedi.

**Bilinen sınırlamalar:**
- **Eski (bu migration'dan önce oluşmuş) bildirim satırlarında `hl` yok:**
  `like` tipi için varsayılan olarak "gönderi beğenisi" ikonuna (Heart),
  `request_response` için "kapandı" ikonuna (Lock) düşerler — küçük,
  yalnızca geçmiş veri için geçerli bir kozmetik yaklaşıklık, dürüstçe
  belirtildi.
- **`prompts.request_id` üzerindeki önceden var olan şema kısıtlaması**
  (yukarıda ayrıntılı açıklandı) — kullanıcının karar vermesi gereken bir
  sonraki adım, bu görevin kapsamına alınmadı.
- Mesaj/yorum/yanıt önizlemeleri o olay anında `message` metnine gömüldüğü
  için, içerik SONRADAN düzenlenir/silinirse bildirimdeki önizleme
  DEĞİŞMEZ (bir "anlık görüntü" — tıpkı istek başlığı önizlemesinin Bölüm
  9.2'den beri zaten yaptığı gibi) — bilinçli, dokümante edilmiş bir
  davranış, yeni bir sorun değil.
- Bildirimlerde gerçek zamanlı (Realtime) güncelleme hâlâ yok (Bölüm 21
  Faz 6'dan beri bilinen sınırlama) — kategori filtresi/vurgu bu
  sınırlamayı değiştirmedi.
