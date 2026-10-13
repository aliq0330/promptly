### 9.52 Birleşik Paylaşım Sistemi (Unified Share System) — Prompt/Generator/Prompt İsteği için tek ShareModal

Kullanıcının 22 bölümlük "PROMPTLY — UNIFIED SHARE SYSTEM REDESIGN"
şartnamesi üzerine — "Paylaş" ikonuna basmak artık doğrudan native paylaşım
ekranını açmıyor; önce, üç içerik türünün (Prompt, Generator, Prompt
İsteği) TAMAMINDA aynı olan bir `ShareModal` açılıyor, içinde iki büyük
seçim kartı var: **"Promptly'de mesaj olarak gönder"** ve **"Diğer
uygulamalarla paylaş"**. Şartnamenin kendi, defalarca tekrarlanan kesin
kuralı harfiyen izlendi: **hiçbir yeni mesajlaşma tablosu/kolonu/API'si/
mimarisi yazılmadı** — var olan mesajlaşma sistemi (Bölüm 21 Faz 6/9.8) ve
var olan native paylaşım mantığı (`ShareButton`) SADECE bu yeni modale
bağlandı, ikisi de kendi içeriğinde yeniden yazılmadı.

**AŞAMA 0 — kodlamaya başlamadan önce mevcut mimari incelendi (kullanıcının
kendi talimatı gereği):**
- **"Mesajla gönder" akışı** (`post-menu.tsx`) — yalnızca giriş yapılmışsa
  VE hedef bir prompt ise (`user && !isGenerator`) görünen bir `<Link
  href="/messages?sharePromptId=<id>">`. `/messages` sayfası bu query
  param'ı okuyup "Kime göndermek istersin?" banner'ı gösteriyor,
  `ConversationRow`'a `shareQuery` iletiyor; bir konuşma seçilince
  `messageHref(conversation)&sharePromptId=<id>`'e gidiliyor.
  `LocalConversationView` bu id'yi `pendingShare` state'ine çeviriyor
  (cache/fetch ile başlık çözümlüyor), banner gösteriyor, GERÇEK gönderim
  anında `sendMessage(conversationId, userId, {body, sharedPromptId,
  sharedRequestId, replyToMessageId})`'i çağırıyor — `messages` tablosunun
  zaten var olan `shared_prompt_id`/`shared_request_id` nullable
  kolonlarına yazıyor (Bölüm 9.8).
- **Native paylaşım** (`share-button.tsx`) — `navigator.share()` varsa onu,
  yoksa `navigator.clipboard.writeText()`'i çağıran, `absoluteUrl()`
  kullanan basit bir bileşen; profil sayfası (`profile-actions.tsx`)
  DIŞINDA prompt/generator/request'in HER kart footer'ında ve detay
  sayfasının hero aksiyon satırında kullanılıyordu.
- **Generator'ın mesajla paylaşımı hiç yoktu** — `PostMenu`'nün kendi
  yorumu bile bunu açıkça belirtiyordu ("Mesajla gönder" ... yalnızca
  prompt/istek destekliyor). `messages` şemasında bir generator'a işaret
  eden hiçbir kolon yok.

**Karar — generator'ın "mesajla gönder"i, YENİ bir şema kolonu OLMADAN
nasıl çalışıyor:** `messages` tablosuna üçüncü bir `shared_generator_id`
kolonu eklemek teknik olarak mümkündü, ama kullanıcının "yeni mesajlaşma
kolonu/mimarisi yok" kuralına en güvenli, en dar yorumla uymak için hiç
eklenmedi. Bunun yerine, generator paylaşımı TAMAMEN istemci tarafında
kalan, yeni bir `shareGeneratorId` query param'ıyla AYNI konuşma-seçme
ekranını (`/messages?shareGeneratorId=<id>`) kullanıyor, ve gönderim
anında zaten var olan, düz metin `body` gönderme yoluna (`sendMessage({body:
...})`, hiçbir yeni parametre eklenmeden) düşüyor — `LocalConversationView`
generator'ı (cache/`fetchGeneratorById` ile) çözüp başlık+gerçek link'i
(`generatorHref`) tek bir metin satırına (`"${title}\n${link}"`) birleştirip
kullanıcının kendi yazdığı notun altına ekliyor. Slug henüz çözülmeden
(nadir bir yarış durumu) Gönder butonu `isGeneratorShareUnresolved` ile
devre dışı bırakılıyor — kırık bir link asla gönderilemiyor.

**Yeni dosyalar/değişiklikler:**
- `src/features/prompts/share-button.tsx` — native-share/clipboard
  mekaniği `shareOrCopyLink(url, title)` adında saf, dışa açık bir
  fonksiyona ÇIKARILDI (yeniden YAZILMADI); `ShareButton`'ın kendisi
  davranışsal olarak birebir aynı kalıp SADECE profil paylaşımı için
  kullanılmaya devam ediyor (`profile-actions.tsx`, kapsam dışı — bir
  profili paylaşmak bu görevin konusu değil).
- Yeni `src/features/prompts/share-modal.tsx`:
  - `ShareModal` — `SaveToCollectionModal`'ın (Bölüm 9.19-9.22) `Modal`
    tabanlı kabuğunu (başlık + kapat X + `rounded-lg border bg-surface p-5
    shadow-lg`) temel alıyor, renkleri DEĞİL yalnızca yapı mantığını —
    Promptly'nin kendi token'ları (Bölüm 4/9.50) kullanılıyor. Üstte gerçek
    içerik önizlemesi (thumbnail/placeholder + rozet + başlık + açıklama),
    altında iki seçim kartı. `ShareModalTarget` discriminated union'ı
    (`{contentType:"prompt"|"generator"|"request", ...}`) üç içerik türünü
    TEK bileşende parametreliyor — üç ayrı modal yazılmadı.
  - `ShareTriggerButton` — eski `ShareButton`'la BİREBİR AYNI görünümde
    (aynı ikon/boyut/dokunma hedefi) "Paylaş" ikonu; tıklandığında artık
    doğrudan paylaşmak yerine `ShareModal`'ı açıyor.
- `post-menu.tsx` — "Mesajla gönder" `<Link>` bloğu TAMAMEN kaldırıldı
  (artık ShareModal'ın kendi seçeneği bu işi görüyor, iki yerde aynı eylem
  ASLA yok); `Send` ikonunun kullanılmayan import'u temizlendi.
- `prompt-card-footer.tsx`, `request-card.tsx`, `prompt-detail-view.tsx`,
  `request-detail-view.tsx`, `generator-detail-view.tsx` — hepsindeki
  `<ShareButton url=... title=... />` çağrıları `<ShareTriggerButton
  target={{contentType:..., ...}} />`'a çevrildi; artık kullanılmayan
  `promptHref`/`requestHref`/`generatorHref` import'ları (yalnızca eski
  `ShareButton` çağrısı için tutuluyorlardı) temizlendi.
- `src/app/(app)/messages/page.tsx` — `shareGeneratorId` query param'ı
  üçüncü bir dal olarak eklendi (`isSharing`/`shareQuery` hesaplaması
  genişledi, `ConversationRow`'un kendisi zaten generic pass-through
  olduğundan hiç değişmedi).
- `local-conversation-view.tsx` — `shareParamGeneratorId` okunuyor,
  `fetchedShareGenerator`/`shareGenerator` ile (cache miss'te
  `fetchGeneratorById`) gerçek generator çözülüyor, `pendingShare`
  üçüncü bir `"generator"` koluna genişledi (id/title/slug taşıyor),
  `handleSubmit` generator paylaşımını yukarıda açıklanan düz-metin
  satırına çeviriyor, submit butonu slug çözülene kadar devre dışı.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (26 rota, değişmedi) sıfır hatayla geçti. Gerçek Supabase'e karşı
canlı bir sayfa testi bu sandbox'ın ağ kısıtı yüzünden yine yapılamadı
(Bölüm 17'den beri tekrarlanan aynı sınırlama) — bunun yerine Bölüm
9.45/9.47'nin `/dev/image-analysis-test` emsaliyle AYNI mantıkla, geçici
bir `/dev/share-modal-test` test sayfası eklendi: gerçek, DEĞİŞTİRİLMEMİŞ
`PostMenu`/`ShareTriggerButton`/`ShareModal` bileşenlerini gerçekçi, elle
kurulmuş `Prompt`/`Generator`/`PromptRequest` fixture'larına karşı render
ediyor (statik export + Playwright, `sb-placeholder-auth-token` formatında
gerçek supabase-js oturum şekliyle localStorage'a enjekte edilen, ağ
isteği gerektirmeyen — `@supabase/auth-js`'in `__loadSession()`'ının
kendi kaynağından doğrulanan — sahte bir oturumla). 21 senaryonun
TAMAMI geçti: her iki menüde de (prompt VE generator) "Mesajla gönder"in
HİÇ kalmadığı, sayfa genelinde bu metnin hiç bulunmadığı; üç içerik
türünün de "Paylaş"a basınca ShareModal'ı açtığı, önizlemenin gerçek
başlık+rozeti (Görsel/Generator · kategori/Açık) gösterdiği; "Promptly'de
mesaj olarak gönder" linkinin prompt/istek için VAR OLAN
`/messages?sharePromptId=`/`shareRequestId=` yoluna, generator için YENİ
ama tamamen istemci-taraflı `/messages?shareGeneratorId=` yoluna doğru
gittiği; "Diğer uygulamalarla paylaş"a basmanın (headless Chromium'da
`navigator.share` yok, bu yüzden gerçekten clipboard'a düşüyor) HER ÜÇ
içerik türü için de doğru, gerçek mutlak URL'yi panoya kopyaladığı
(`/prompts/local?id=`, `/generators/local?slug=`, `/requests/local?id=`);
Escape'in modalı kapattığı; sıfır JS hatası olduğu.

Gerçek bir Supabase projesine karşı canlı doğrulama (gerçek bir konuşmaya
gerçekten generator paylaşılıp gönderilmesi dahil) yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan aynı sınırlama)
— bu görev hiçbir migration içermediğinden (mevcut `messages` şemasına hiç
dokunulmadı), kullanıcının Dashboard'da yapması gereken ekstra bir adım
yok; yalnızca canlı sitede üç içerik türünü de bizzat paylaşmayı denemesi
gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`messages` şemasına `shared_generator_id` gibi yeni bir kolon
  eklenmedi** (yukarıda "Karar" başlığı altında gerekçesiyle açıklandı) —
  kullanıcının "yeni mesajlaşma mimarisi yok" kuralının en dar, en güvenli
  yorumu.
- **Profil paylaşımı (`profile-actions.tsx`'in iki `ShareButton`'ı)
  ShareModal'a taşınmadı** — şartname yalnızca Prompt/Generator/Prompt
  İsteği'ni adlandırdı, bir profili paylaşmak bu üç içerik türünden biri
  değil.
- **`/dev/share-modal-test` gerçek uygulamanın hiçbir yerinden
  bağlanmıyor** (Bölüm 9.47'nin aynı ilkesi) — yalnızca bu görevin
  doğrulaması için var, istenirse güvenle silinebilir.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.

**Düzeltme — paylaşılan generator mesajda düz metin/ham link olarak
görünüyordu (kullanıcı ekran görüntüsüyle bildirdi):** İlk sürümde
generator paylaşımı, `messages` tablosunda ona işaret eden bir kolon hiç
olmadığından, tamamen düz metin (`"${title}\n${link}"`) olarak
gönderiliyordu — bu, `MessageBubble`'ın `sharedPromptId`/`sharedRequestId`
doluysa render ettiği gerçek "Paylaşılan Prompt"/"Paylaşılan İstek"
kartlarının aksine, alıcıya çıplak bir URL satırı olarak görünüyordu
(kullanıcının ekran görüntüsündeki tam olarak bu: `"Moda Editoryal Çekim
https://.../generators/local?slug=..."` düz metin balonu). Kullanıcının
"diğerleri gibi yap" talebi üzerine, **`messages` şemasına HÂLÂ hiçbir yeni
kolon eklenmeden** (Bölüm 9.52'nin kendi "yeni mesajlaşma mimarisi yok"
kuralı bozulmadan) düzeltildi: `body` metni artık RENDER ANINDA, kendi
tanıdık formatına göre taranıp gerçek bir karta çevriliyor.
- Yeni `src/features/messages/generator-share-format.ts` — TEK, paylaşılan
  bir format tanımı: `composeGeneratorShareBody(note, title, slug)` (gönderim
  anında, `local-conversation-view.tsx`'in `handleSubmit`'i artık bunu
  çağırıyor, eskiden orada elle kurulan satır ifadesinin yerine) ve
  `parseGeneratorShareBody(body)` (render anında, `message-bubble.tsx`) —
  aynı formatı iki ayrı yerde elle tekrar tanımlamak yerine tek kaynaktan.
  Parse fonksiyonu, formatın kendi düzenine göre (satır sırasına bakarak,
  yalnızca regex ile "içinde geçiyor mu" değil) hem kullanıcının eklediği
  isteğe bağlı notu hem gerçek slug'ı ayıklıyor.
- Yeni `SharedGeneratorCard` (`shared-content-card.tsx`) —
  `SharedPromptCard`/`SharedRequestCard`'ın BİREBİR AYNI görsel/davranış
  deseni (aynı `CARD_CLASS`, "Yükleniyor…" durumu, gerçek `generatorHref`
  linki), yalnızca id yerine SLUG ile arıyor: önce `useRealGenerators()`'ın
  zaten var olan cache'inde slug'a göre tarıyor (yeni bir provider/context
  icat edilmedi), yoksa gerçek bir `fetchGeneratorBySlug` çağrısına
  düşüyor.
- `message-bubble.tsx`: bir mesajın `sharedPromptId`/`sharedRequestId`'si
  yoksa `body`'si `parseGeneratorShareBody` ile taranıyor; eşleşirse
  `<SharedGeneratorCard slug=.../>` render edilip yalnızca kullanıcının
  eklediği NOT (varsa) ayrı bir düz metin balonu olarak kalıyor — ham
  başlık+link satırı ARTIK HİÇBİR ZAMAN görünür metin olarak render
  edilmiyor. Yanıtlanan bir mesajın önizleme satırı (`replyPreviewText`)
  de aynı ayrımı yapıyor ("Bir prompt"/"Bir istek" ile birebir aynı
  düzeyde, artık "Bir generator" da var) — var olan "gerçek bir not varsa
  onu, yoksa jenerik etiketi göster" önceliği (prompt/istek için zaten
  var olan davranış) hiç bozulmadan korundu.
- **Nasıl doğrulandı:** `npx tsc --noEmit`/`npm run lint`/tam `npm run
  build` sıfır hatayla geçti. `/dev/share-modal-test`'e (Bölüm 9.52'nin
  kendi test sayfası) gerçek `composeGeneratorShareBody`'den üretilmiş bir
  fixture mesajla render edilen gerçek bir `MessageBubble` eklenip 26
  senaryolu Playwright paketi (önceki 21 + bu düzeltmenin 5 yeni senaryosu)
  yeniden çalıştırıldı — hepsi geçti: paylaşılan generator'ın gerçekten
  "Paylaşılan Generator" kartı + gerçek `generatorHref` linki render ettiği,
  gönderenin kendi notunun ("Bak bunu dene") ayrı, düz bir balon olarak
  kaldığı, ham `generators/local?slug=...` metninin sayfanın hiçbir
  yerinde görünür metin olarak bulunmadığı — hepsi sıfır (gerçek) JS
  hatasıyla (yalnızca bu sandbox'ın `*.supabase.co`'ya erişimi engelleyen,
  Bölüm 17'den beri bilinen ağ kısıtının ürettiği beklenen `ERR_TUNNEL_
  CONNECTION_FAILED` konsol gürültüsü hariç).
- **Bilinen sınırlama (yeni):** bu, yalnızca `SharedGeneratorCard`'ın
  KENDİ render'ı için geçerli — mesajın ham `body` metninde hâlâ tam
  URL var (veritabanında öyle saklanıyor), yalnızca `MessageBubble`
  bunu render ANINDA gizleyip kartla değiştiriyor. Bu formatı üretmeyen
  (elle, "Bak: <link>" gibi serbestçe yazılmış) bir mesaj ASLA bir karta
  dönüşmüyor — yalnızca `composeGeneratorShareBody`'nin ürettiği TAM
  formatı (bir önceki satırda başlık, hemen ardından `/generators/local?
  slug=` içeren bir satır) tanıyor, bu da beklenen/istenen bir sınır
  (rastgele bir mesajı yanlışlıkla bir generator kartına çevirmemeli).

---
