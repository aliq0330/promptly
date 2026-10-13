### 9.41 Gerçek yanıtı olan bir prompt isteğinin güvenli silinmesi

Kullanıcının bildirdiği, Bölüm 9.6/9.12'de daha önce tespit edilip
"kullanıcının karar vermesi gereken bir sonraki adım" diye bilinçli olarak
açık bırakılmış gerçek bir hata: bir `prompt_requests` satırının GERÇEK bir
yanıtı (bir `origin.type === "request-response"` promptu) varsa, o isteği
silmeye çalışmak veritabanı hatasıyla TAMAMEN reddediliyordu — kullanıcının
kendi sözleriyle "prompt isteğinde yanıt varsa silinmiyor". Kullanıcı ayrıca
bunun "yorumlardaki olay gibi" olup olmadığını sordu (Bölüm 9.5'in
`handle_comment_delete`'i — alt yanıtı olan bir yorumu silmenin, yorumu
gerçekten silmek yerine "Bu yorum silindi." yer tutucusuyla soft-delete
etmesi) — **cevap evet, birebir aynı mimari desen**, ve bu bölüm onu
`prompt_requests` için uyguluyor.

**Kök neden (önceden tespit edilmişti, şimdi düzeltildi):**
`prompts.request_id` (20260919120200) `on delete set null` ile tanımlı, ama
`prompts_origin_shape` CHECK kısıtı `origin_type = 'request_response'` olan
bir satırda `request_id`'nin ASLA null olmamasını şart koşuyor. Gerçek bir
yanıtı olan bir istek silinmeye çalışıldığında, FK cascade'i o yanıtın
`request_id`'sini null'a çekmeye çalışırken CHECK kısıtına çarpıp TÜM silme
işlemi reddediliyordu — Bölüm 9.40'ın `messages_has_content` hatasıyla
BİREBİR AYNI hata sınıfı (bir FK'nin `ON DELETE SET NULL` eylemi bağımlı bir
satırı kendi CHECK kısıtını ihlal edecek bir duruma düşürüyor), yalnızca
farklı bir tabloda.

**Yeni migration:** `supabase/migrations/20260919350000_request_safe_
delete.sql` — Bölüm 9.5'in `handle_comment_delete`'iyle (ve daha önce
Bölüm 9.7'nin, remix kaldırılırken silinmiş, `handle_prompt_delete`'iyle)
BİREBİR AYNI, kanıtlanmış desen:
- `prompt_requests.deleted_at timestamptz` (yeni kolon).
- `handle_prompt_request_delete()` (BEFORE DELETE trigger,
  `prompt_requests` üzerinde) — gerçek DELETE gerçekleşmeden ÖNCE bu
  isteğin gerçek bir yanıtı (`exists (select 1 from prompts where
  request_id = old.id and origin_type = 'request_response')`) olup
  olmadığına bakıyor: varsa DELETE'i iptalleyip yerine bir soft-delete
  UPDATE'i (`deleted_at` damgalama + `title`/`description`/`creative_
  direction`/`reference_image_url`/`width`/`height` boşaltma +
  `prompt_request_tags` temizleme) uyguluyor, `status`/`response_count`/
  `selected_response_prompt_id`'ye hiç dokunmadan (tıpkı eski `handle_
  prompt_delete`'in `like_count`/`comment_count`/`remix_count`'a hiç
  dokunmaması gibi — bu yüzden `prompt_requests_status_shape` CHECK kısıtı
  bu UPDATE'ten hiç etkilenmiyor); hiç yanıtı yoksa DELETE olduğu gibi
  geçip satırı gerçekten siliyor. Frontend HER ZAMAN aynı basit `DELETE
  FROM prompt_requests WHERE id = ...` çağrısını yapıyor
  (`deleteRealRequest`, `src/lib/supabase/requests.ts` — hiç değişmedi) —
  hangi davranışın uygulanacağına veritabanı, tek ve atomik bir işlemde
  karar veriyor. `security invoker` (varsayılan) yeterli — Bölüm 9.5/9.7'nin
  aynı gerekçesiyle: bir kullanıcı zaten kendi isteğini silme yetkisine
  sahipse ("Authors can delete their own requests"), aynı kullanıcının
  kendi isteğini güncelleme yetkisi de zaten var ("Authors can update their
  own requests") — cross-user sayaç/bildirim trigger'larının aksine burada
  `SECURITY DEFINER` gerekmiyor.
- **Gerçek bir eksiklik ayrıca kapatıldı:** `validate_prompt_response_
  target()` (Bölüm 9.2'nin BEFORE INSERT trigger'ı) yalnızca `status <>
  'open'` kontrolü yapıyordu — yeni `deleted_at`'ten hiç haberdar değildi.
  Soft-delete trigger'ı `status`'a hiç dokunmadığından, status hâlâ
  `'open'` kalan soft-deleted bir isteğe teorik olarak yeni bir yanıt
  eklenebilirdi. `create or replace` ile, davranış DEĞİŞTİRİLMEDEN (aynı
  iki hata mesajı, aynı sıralama) yalnızca bir `deleted_at` kontrolü
  eklenip genişletildi — soft-deleted bir isteğe yeni yanıt denemesi artık
  "Bu istek silindi, artık yeni yanıt kabul edilmiyor." ile reddediliyor.

**Nasıl doğrulandı — SQL (yerel PostgreSQL 16'da GERÇEKTEN çalıştırıldı,
taklit değil):** Migration, önceki 29 migration'ın (storage hariç)
uygulandığı temiz bir test veritabanına uygulandı ve iki gerçek kullanıcıyla
(Ali = istek sahibi, Ayşe = yanıtlayan) 11 senaryo çalıştırılıp doğrulandı:
gerçek bir yanıtı olan isteği silmenin (kullanıcının bildirdiği TAM senaryo)
artık hatasız çalıştığı; satırın hâlâ orada durduğu (soft-deleted, `deleted_
at` dolu, başlık/açıklama/yaratıcı yön/referans görseli boşalmış,
`status`/`response_count`/`selected_response_prompt_id` HİÇ değişmeden);
etiketlerinin temizlendiği; **yanıt promptunun kendisinin (içeriği, `request_
id`, `origin_type`, durumu) tamamen dokunulmadan kaldığı**; `prompts_origin_
shape` CHECK'inin hiç ihlal edilmediği; soft-deleted isteğe yeni bir yanıt
denemesinin yeni, doğru mesajla reddedildiği; yanıt promptuna eklenen bir
yorumun etkilenmediği; gerçek yanıtı OLMAYAN bir isteğin gerçekten,
kalıcı olarak silindiği; yalnızca bir YORUM alan (gerçek yanıt promptu
olmayan) bir isteğin de normal şekilde hard-delete olduğu (yalnızca gerçek
`origin_type='request_response'` promptları saymanın doğru olduğu); ve
sahibi olmayan birinin isteği silmeye çalışmasının RLS tarafından sessizce
0 satır etkileyerek engellendiği — hepsi gerçekten çalıştırılıp doğrulandı.
**Negatif kontrol de yapıldı:** migration UYGULANMADAN aynı senaryo tekrar
çalıştırılıp kullanıcının bildirdiği hata BİREBİR aynı metinle
(`ERROR: new row for relation "prompts" violates check constraint
"prompts_origin_shape"`) yeniden üretildi — bu, düzeltmenin varsayım değil
kanıtlanmış bir gerçek olduğunu gösteriyor. Test veritabanları işlem
bitince silindi.

**Frontend değişiklikleri (Bölüm 9.7'nin `Prompt.deletedAt`/
`local-prompt-view.tsx` desenini birebir izleyerek):**
- `PromptRequest.deletedAt: string | null` eklendi (`src/types/index.ts`).
- `src/lib/supabase/requests.ts`: `RequestRow`/`REQUEST_SELECT`/
  `mapRequestRow` yeni kolonu okuyor; yeni `filterNotDeleted()` yardımcısı
  `fetchRecentRequests`/`fetchRequestsByAuthor`'a uygulandı (soft-deleted
  bir istek artık feed/keşfet/profil listelerinde hiç görünmüyor) —
  **bilinçli olarak `fetchRequestById`'e UYGULANMADI** (doğrudan bir link
  hâlâ satırı bulup "Bu istek silindi" yer tutucusunu gösterebilmeli,
  `fetchPromptById`'in remix döneminden beri aynı ilkesi).
- `src/features/requests/local-request-view.tsx`
  (`/requests/local?id=…`): `local-prompt-view.tsx`'in "Bu paylaşım
  silindi" bloğuyla BİREBİR AYNI desende, yeni bir "Bu istek silindi"
  bloğu eklendi — ek olarak isteğe verilen gerçek yanıtların hâlâ
  görüntülenebilir olduğunu açıklıyor (isteğin kendisinin kaldırılmasının,
  yanıtlarını kaybettirmediğini netleştirmek için).
- `src/features/prompts/post-context.tsx`'in `RequestResponseContext`'i —
  eski, kaldırılmış `RemixContext`'in "kaynağı silinmişse 'Bu paylaşım
  silindi.' göster" dalıyla BİREBİR AYNI desende, `request?.deletedAt` set
  ise başlık/durum/rozet yerine "Bu istek silindi." gösteriyor. Bu, bir
  yanıt promptunun kendi kart/detay sayfasındaki bağlam kutusunun (üstteki
  "Bir isteğe yanıt" lavanta kutusu) artık silinmiş bir isteğe doğru,
  dürüst bir şekilde işaret etmesini sağlıyor — yanıt promptunun kendi
  başlığı/açıklaması/prompt metni/yorumları bundan HİÇ etkilenmiyor
  (yalnızca üstündeki bağlam kutusu değişiyor).
- `src/features/prompts/create-prompt-form.tsx`'e yeni `isRequestDeleted`
  kontrolü eklendi (`isRequestClosed`'dan ÖNCE kontrol ediliyor — bir
  soft-deleted isteğin `status`'u hâlâ `'open'` kalabildiğinden, deleted
  her zaman closed'dan önce gelmeli): `?answerRequest=<silinmişIstekId>`
  artık formu hiç göstermeden dürüst bir "Bu istek silindi" ekranı
  gösteriyor — kullanıcı tüm formu doldurup gönderdikten SONRA sunucudan
  gelen ham bir hata almak yerine, en baştan bilgilendiriliyor (backend'in
  `validate_prompt_response_target()`'ı hâlâ TEK gerçek, atlanamaz
  garanti — bu yalnızca daha erken, daha dostane bir UI kontrolü).

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, mutasyona uğrayan bir sunucu-taraf durum
nesnesiyle — Bölüm 9.22'den beri bu projenin standart yöntemi):** Yeni,
16 senaryolu bir pakette hepsi sıfır JS hatasıyla doğrulandı: kendi
isteğinde iki-tıklamalı silme akışının (İsteği sil → Emin misin? → Tekrar
tıkla) gerçek bir yanıtı olan bir istekte HATA FIRLATMADAN başarıyla
tamamlanıp `/requests`'e yönlendirdiği (mock DELETE, gerçek trigger'ı
taklit ederek satırı "hâlâ orada ama boşalmış" bırakıyor); o isteğe
doğrudan bir linkle tekrar gidildiğinde "Bu istek silindi" başlığının ve
yanıtların hâlâ görüntülenebilir olduğunu açıklayan metnin göründüğü;
**yanıt promptunun kendi sayfasında başlığının/prompt metninin tamamen
sağlam kaldığı, bağlam kutusunun "Bir isteğe yanıt" etiketini koruyup
artık "Bu istek silindi." gösterdiği ve isteğin (artık boşalmış) eski
başlığını HİÇ göstermediği**; soft-deleted bir isteği `?answerRequest=`
ile yanıtlamaya çalışmanın dürüst "Bu istek silindi" ekranını gösterip
formu hiç render etmediği (eski, genel "kapandı" mesajının HİÇ
görünmediği); gerçek yanıtı OLMAYAN bir isteğin gerçekten hard-delete
olduğu (`/requests/local`'a dönüldüğünde "Bu istek silindi" değil, dürüst
bir "İstek bulunamadı" gösterdiği — soft-delete ile gerçek delete'in
istemci tarafında da doğru ayrıldığının kanıtı). Ayrıca bu oturumun
ilgili regresyon paketleri (remix-removal-checklist-test.mjs 157/157,
generators-e2e-test.mjs 45/45, prompt-social-regression-test.mjs 9/9,
prompt-variables-e2e-test.mjs 48/48, resilience-test.mjs 14/14,
collections-e2e-test.mjs 19/19, save-flow-e2e-test.mjs 14/14) sıfır
regresyonla yeniden çalıştırıldı. `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (25 rota, değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının
`20260919350000_request_safe_delete.sql`'i Dashboard → SQL Editor'de
uygulayıp bizzat denemesi gerekiyor. Bu migration geri dönüşü olan bir
değişiklik DEĞİL (yalnızca bir kolon + iki `create or replace function`
ekliyor, hiçbir kolon/tablo düşürmüyor) — Bölüm 9.39'un migration'ının
aksine ekstra bir yedek alma uyarısı gerekmiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`RequestDetailView`'ın kendisi soft-deleted bir istek için ayrıca bir
  dal EKLENMEDİ** — `LocalRequestView` zaten `request.deletedAt` set
  olduğunda `RequestDetailView`'ı hiç render etmeden kendi placeholder'ını
  gösteriyor (Bölüm 9.7'nin `local-prompt-view.tsx`/`PromptDetailView`
  ayrımıyla birebir aynı desen) — bu yüzden `RequestDetailView`'ın kendisi
  hiç "deleted" durumunu bilmesi/işlemesi gerekmiyor.
- **`RealRequestsProvider`'ın `deleteRequest` aksiyonuna hiç dokunulmadı**
  — zaten (hem hard hem soft delete için) silinen id'yi yerel `realRequests`
  cache'inden filtreliyordu, bu davranış her iki durumda da doğru (istek
  artık normal listelerde görünmemeli) — ekstra bir "soft mu hard mı"
  ayrımına ihtiyaç yoktu.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Soft-deleted bir isteğin `response_count`/durumu sıfırlanmıyor
  (dokunulmadı) — zaten hiçbir yerde gösterilmiyor (yalnızca "silindi"
  placeholder'ı render ediliyor), pratik bir etkisi yok (Bölüm 9.7'nin
  aynı notuyla birebir aynı gerekçe).
