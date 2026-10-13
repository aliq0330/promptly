### 9.2 Prompt İstekleri / Yanıt Sistemi sağlamlaştırması

Kullanıcının detaylı özellik isteği üzerine, Bölüm 9/10/21 Faz 5'in zaten
kurduğu istek/yanıt akışı (istek oluşturma, gerçek bir isteğe gerçek bir
prompt olarak yanıt verme, yanıt seçme) üç gerçek boşluk kapatılarak
sağlamlaştırıldı, artı iki tamamen yeni özellik eklendi: profildeki
"Prompt İstekleri" bölümü ve yanıtın profil görünürlüğü tercihi.

**Yeni migration:** `supabase/migrations/20260919150000_request_response_
workflow.sql` — ayrıntı ve yerel Postgres 16'da gerçekten çalıştırılıp
doğrulanan tam senaryo listesi `supabase/README.md`'de. Özet:
- `prompts.show_on_profile` (varsayılan `true`) — yeni kolon.
- `prompt_requests.closed_by_owner` — yeni kolon (manuel kapatma ile
  seçim sonucu otomatik kapanmayı ayırt etmek için).
- `prompt_requests_status_shape` CHECK kısıtı — durum/seçili yanıt
  ilişkisini veritabanı seviyesinde tutarlı tutar.
- `validate_prompt_response_target()` (BEFORE INSERT, `prompts`) — kapalı/
  yanıtlanmış bir isteğe yeni yanıt eklenmesini **sunucu tarafında**
  reddeder (önceden yalnızca "Yanıtla" butonu gizleniyordu, gerçek bir
  engel yoktu).
- `validate_selected_response()` (BEFORE UPDATE, `prompt_requests`) —
  seçilen yanıtın gerçekten o isteğe ait olduğunu zorlar; RPC'yi atlayan
  doğrudan bir UPDATE için bile geçerli.
- `select_prompt_request_response(request_id, response_prompt_id)` — yeni
  RPC fonksiyonu, yanıt seçme/değiştirme/kaldırmayı tek, atomik bir
  işlemde yapar (bkz. aşağıda).
- `notify_new_request_response()`/`notify_selected_response()` —
  `SECURITY DEFINER` trigger'lar, gerçek bildirim üretir (bkz. aşağıda).

**Kapalı/yanıtlanmış isteğe yeni yanıt engeli artık gerçek:**
`CreatePromptForm`'un `?answerRequest=` modu, hedef isteğin `status`'unu
kontrol edip kapalıysa formu hiç göstermeden "Bu istek kapandı, artık yeni
yanıt kabul edilmiyor." ekranını gösteriyor (istemci tarafı, hızlı geri
bildirim için) — ama asıl garanti `validate_prompt_response_target`
trigger'ından geliyor: bir yarış durumunda (sayfa açıkken istek kapanırsa)
veya doğrudan API çağrısıyla bu kontrolü atlamaya çalışan biri için bile
INSERT veritabanı seviyesinde reddediliyor, aynı Türkçe mesajla.

**Durum gösterimi sadeleştirildi — artık yalnızca iki görünür durum:**
`prompt_requests.status` hâlâ üç değerli (`open`/`answered`/`closed`,
şema değişmedi — "gereksiz ikinci bir durum sistemi kurma" talimatına
uyarak), ama arayüzde `answered` VE `closed` ikisi de aynı şekilde
**"Kapandı"** (kırmızı `Badge variant="danger"`) gösteriliyor, yalnızca
`open` **"Açık"** (yeşil `Badge variant="success"`) — `RequestCard`,
`RequestDetailView` ve yeni profil "Prompt İstekleri" sekmesi aynı
`STATUS_LABELS`/`STATUS_VARIANTS`'ı (`request-card.tsx`'ten export
edildi) paylaşıyor, tutarlılık garantili. Yeni `Badge` variant'ları
(`success`/`danger`) eklendi — bilinçli olarak Tailwind'in `dark:`
varyantını KULLANMIYOR, çünkü bu projenin koyu teması `prefers-color-
scheme` değil, manuel `.dark` class toggle'ı (`ThemeProvider`) — Tailwind
v4'te `dark:` varsayılan olarak yalnızca işletim sistemi tercihini eşler,
projeye özel `@custom-variant dark` tanımlanmadığı için `dark:` sınıfları
burada sessizce hiç uygulanmazdı. Bunun yerine, projenin hata metinlerinde
zaten kullandığı desenle aynı şekilde tek tonlu `text-red-600`/
`text-green-600` kullanıldı.

**Yanıt seçme/değiştirme/kaldırma artık atomik ve tam olarak doğrulanmış:**
`selectRealRequestResponse` artık doğrudan bir `.update()` değil,
`select_prompt_request_response` RPC'sini çağırıyor. Bu, hem daha güvenli
(sahiplik ve "yanıt bu isteğe mi ait" kontrolleri veritabanında,
istemciye güvenilmeden) hem de **manuel kapatma ile seçim sonucu otomatik
kapanmayı doğru ayırt ediyor**: bir isteği manuel kapattıktan SONRA bir
yanıt seçip sonra o seçimi kaldırırsanız, istek yanlışlıkla "Açık"a değil
doğru şekilde "Kapandı"ya (manuel durumuna) geri dönüyor — bu tam olarak
kullanıcının şartnamesinin vurguladığı ("seçimi kaldırmak manuel kapatma
durumunu yanlışlıkla açığa çevirmemeli") senaryo, ve yerel Postgres'te
gerçekten test edilip doğrulandı (bkz. `supabase/README.md`).
`RequestDetailView`'daki "İsteği kapat/aç" butonu artık yalnızca hiçbir
yanıt seçili değilken gösteriliyor (bir seçim varken durum yalnızca
seçimle yönetilir) — veritabanındaki CHECK kısıtı zaten bu kombinasyonu
reddediyor, buton gizleme yalnızca kullanıcı deneyimini netleştiriyor.

**Yanıt seçme/kaldırma artık gerçek bir onay adımı içeriyor:** Şartname
bir "onay penceresi" (modal) istiyordu; bu projede hiç modal/dialog
bileşeni yok, bu yüzden CLAUDE.md'nin "gereksiz yeni sistemler kurma"
ilkesine uyarak var olan "iki tıklamalı onay" deseni (zaten "İsteği sil"
ve prompt silme menüsünde kullanılıyor) yeniden kullanıldı: "Yanıtı seç"/
"Seçimi kaldır"a ilk tıklama şartnamenin istediği tam metni (ör. "Bu
yanıtı seçmek istediğine emin misin? Seçtiğinde istek kapatılacak ve yeni
yanıt kabul edilmeyecek.") + Vazgeç/onay butonlarını satır içinde
gösteriyor, ikinci tıklama işlemi gerçekleştiriyor. Fonksiyonel olarak
şartnamenin istediği "onay adımı"nı karşılıyor, yalnızca bir modal overlay
değil satır içi bir genişleme.

**Profildeki "Prompt İstekleri" bölümü — YENİ:** `ProfileView`'a yeni bir
"Prompt İstekleri" sekmesi eklendi (hem kendi hem başka bir kullanıcının
profilinde — istekler, promptların aksine hiç taslak/gizli kavramına sahip
değil, RLS zaten hepsini herkese açık okunur yapıyor, bu yüzden başka bir
kullanıcının profilinde de göstermek güvenli). Yeni
`fetchRequestsByAuthor(authorId)` (`lib/supabase/requests.ts`) — profil
sorgusu artık promptlar ve istekler için AYRI, veri katmanında gerçekten
ayrıştırılmış iki sorgu (`fetchPromptsByAuthor` + `fetchRequestsByAuthor`),
yalnızca CSS ile gizlenen tek bir liste değil — şartnamenin özellikle
vurguladığı nokta. Kartlar mevcut `RequestCard`/`RequestList` bileşenleri
yeniden kullanılarak render ediliyor (istek detayı, keşfet ve `/requests`
ile birebir aynı görünüm — tutarlılık). Boş durumda tam olarak şartnamenin
istediği metin gösteriliyor: "Henüz prompt isteği oluşturulmamış."

**Yanıtın profil görünürlüğü tercihi — YENİ:** `CreatePromptForm`'un
`?answerRequest=` modunda, yalnızca o modda, yeni bir "Bu yanıt profilimde
görünsün mü?" seçici var (iki radyo seçenek, şartnamenin tam metniyle).
"Profilimde paylaş" (varsayılan) → `show_on_profile = true`; "Profilimde
paylaşma" → `false`. Bu tercih `prompts.show_on_profile`'a kalıcı olarak
yazılıyor ve veri katmanında (`fetchRecentPublishedPrompts`,
`fetchPromptsByAuthor`, `fetchPromptsByAuthors`, `searchPrompts` —
`lib/supabase/prompts.ts`'teki yeni `filterProfileVisible()` yardımcı
fonksiyonu ile) uygulanıyor: `show_on_profile = false` olan bir yanıt
normal profil/akış/keşfet/arama sonuçlarından çıkarılıyor (kendi
profilinin sahibi için bile — "profilimi dağınıklaştırma" tercihinin tüm
amacı bu), ama isteğin kendi yanıt listesinde (`fetchPromptsForRequest`)
ve kendi detay sayfasında (`fetchPromptById`) HER ZAMAN görünmeye devam
ediyor — silme değil, yalnızca "normal gönderi" görünürlüğü. **Bilinçli
teknik karar:** bu filtre PostgREST sorgusuna ikinci bir `.or(...)` olarak
DEĞİL, sonuçlar map'lendikten SONRA istemci tarafında uygulanıyor —
PostgREST'in tek bir `.or()` grubunu düz kolon filtreleriyle AND'lediği
belgeli, ama iki bağımsız `.or()`'u art arda zincirlemenin net, doğrulanmış
bir birleştirme davranışı yok, ve bu sandbox'ta gerçek bir Supabase
projesine karşı test edilemediğinden riske girilmedi.

**Bildirimler artık gerçekten üretiliyor (bu iki olay için):** Bölüm
19'dan beri `notifications` tablosuna hiçbir client insert politikası
yoktu (kasıtlı güvenlik kararı) ve hiçbir sunucu tarafı üretici de yoktu —
bu yüzden `/notifications` her zaman boştu. Bu migration'daki iki
`SECURITY DEFINER` trigger artık gerçek satırlar yazıyor: bir isteğe yeni
bir yanıt geldiğinde istek sahibine, bir yanıt seçildiğinde (ya da
değiştirildiğinde) yeni seçilen yanıtın sahibine. `fetchNotificationsForUser`
zaten Bölüm 21'den beri doğru şekilde yazılmıştı (yalnızca yazacak veri
yoktu) — bu yüzden `/notifications` artık bu iki olay için gerçekten dolu
görünecek, kod tarafında ekstra bir değişiklik gerekmedi. Kendi isteğine
kendi yanıtını verme/seçme durumunda kendi kendine bildirim
OLUŞTURULMUYOR (trigger'larda açık kontrol var). Aynı seçimi tekrar
yapmak (no-op) mükerrer bildirim oluşturmuyor (`IS DISTINCT FROM`
koruması, gerçekten test edildi).

**Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ `*.supabase.co`'ya
erişimi engellediğinden gerçek projeye karşı test edilemedi. Bunun yerine:
(1) Yeni migration, yerel bir Postgres 16 örneğine önceki 9 migration'la
birlikte gerçekten uygulandı ve üç test kullanıcısıyla (istek sahibi +
iki yanıtlayan) tam senaryo — yeni yanıt → bildirim, yanıt seçme →
bildirim + durum değişimi, kapalı isteğe yanıt reddi, sahibi olmayanın
seçim denemesinin reddi, yanlış isteğe ait yanıtın reddi, seçim kaldırma
→ doğru duruma dönüş, **manuel kapatma + seçim + seçim kaldırma
etkileşiminin kritik testi**, RPC'yi atlayan doğrudan UPDATE'in yine de
reddedilmesi, mükerrer bildirim olmaması, CHECK kısıtı ihlallerinin
reddedilmesi — hepsi gerçekten çalıştırılıp doğrulandı (tam liste
`supabase/README.md`'de). (2) `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti. (3) Ağ
seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright: açık bir
isteğe yanıt formunda profil görünürlüğü seçicisinin göründüğü ve kapalı
banner'ının GÖRÜNMEDİĞİ; kapalı bir isteğe yanıt formunda tam tersi
(kapalı ekranı gösterip formu hiç göstermediği); gerçek bir profilde
"Prompt İstekleri" sekmesinin göründüğü, tıklanınca hem açık hem kapalı
isteğin doğru "Açık"/"Kapandı" rozetleriyle listelendiği — hepsi sıfır JS
hatasıyla doğrulandı. (4) Mock/mevcut sayfaların hâlâ Supabase'e hiç
erişilemezken çökmediği 19 sayfalık dayanıklılık taraması yeniden
çalıştırıldı, bozulma yok.

**Bilinen sorunlar / bilinçli basitleştirmeler:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** — yukarıda
  açıklanan sandbox ağ kısıtı yüzünden; kullanıcı `20260919150000_
  request_response_workflow.sql`'i Dashboard'da uygulayıp bizzat denemeli
  (bkz. `supabase/README.md`).
- **"Bu yanıt seçildi" etiketi PromptCard'ın kendisine değil, yalnızca
  istek detay sayfasındaki yanıt listesine eklendi** — kartın kendisi
  (profil grid'i, ana akış, keşfet gibi başka bağlamlarda göründüğünde)
  bu bilgiyi göstermiyor, çünkü bunu bilmek için kartın hangi isteğin
  hangi seçili yanıtı olduğunu ek bir sorguyla (ya da join'le) bilmesi
  gerekirdi — N+1 sorgu riskini artırmamak için bu kapsam dışı bırakıldı.
  İstek detay sayfası (asıl önemli olan yer) doğru gösteriyor.
- **Seçim kaldırma için bildirim yok** — şartname bunu zaten "gerekli
  görülüyorsa" diye koşullu bıraktı; yeni bir seçim/değişiklik zaten
  bildirim üretiyor, yalnızca "seçimin kaldırıldığı" ayrı bir bildirim
  eklenmedi (düşük değer, kimseye gerçek bir eylem çağrısı taşımıyor).
- **`show_on_profile` filtresi istemci tarafında uygulanıyor, sorguya
  değil** (yukarıda "bilinçli teknik karar" açıklandı) — bu, `limit`
  uygulanan sorgularda (`fetchRecentPublishedPrompts` vb.) teorik olarak
  sayfa başına dönen öğe sayısını `limit`'in altına düşürebilir (gizli
  yanıtlar filtrelendiği için) — Bölüm 21'in zaten bilinen "tam sayfalama
  yok" sınırlamasıyla aynı kategoriden, kasıtlı olarak bu görevin
  kapsamına alınmadı.
- **`fetchSavedPrompts`/`fetchLikedPrompts` bu görünürlük filtresini
  uygulamıyor** — bir kullanıcı gizlenmiş bir yanıtı beğenir/kaydederse
  kendi Kaydedilenler/Beğeniler sekmesinde yine de görünür. Bilinçli bir
  kapsam kararı: şartname yalnızca "normal profil gönderileri/akış/keşfet"
  diyor, beğeni/kaydetme ayrı bir özellik.
- **İstek düzenleme hâlâ yok** (Bölüm 21 Faz 5'ten beri bilinen, bu görevin
  kapsamı dışında bırakılan bir sınırlama) — yalnızca kapat/aç/sil.
- **Grup halinde/toplu yanıt seçme yok** — her seferinde tek bir yanıt
  seçilip/kaldırılıyor, şartname de zaten böyle istiyor (bir istekte
  yalnızca bir seçili yanıt).
