### 9.1 Mock verinin tamamen kaldırılması

Kullanıcının açık isteği üzerine ("Mocklari ve alakalı şeyleri tamamen
kaldır sitede sahte veri kalmasın") Bölüm 21'in kurduğu "mock/demo katmanı
+ gerçek katman yan yana, birbirini bozmadan" mimarisi sona erdi. Uygulama
artık **yalnızca** gerçek Supabase verisiyle çalışıyor — hiçbir sahte
kullanıcı, prompt, istek, yorum, konuşma veya bildirim yok, ve hiçbir
localStorage tabanlı "gerçekmiş gibi davranan" prototip kalmadı.

**Kaldırılanlar:**
- `src/mocks/` klasörünün tamamı (`users.ts`, `prompts.ts`, `tags.ts`,
  `requests.ts`, `request-responses.ts`, `comments.ts`, `notifications.ts`,
  `conversations.ts` — 9 sahte kullanıcı, 20+ mock prompt, mock istekler/
  yanıtlar/yorumlar/bildirimler/konuşmalar dahil hepsi).
- localStorage tabanlı 7 provider: `follow-provider.tsx`,
  `like-save-provider.tsx`, `comment-provider.tsx` (yerel yorum katmanı),
  `local-prompts-provider.tsx`, `requests-provider.tsx` (yerel istek
  katmanı — `real-requests-provider.tsx`'ten farklı, o duruyor),
  `profile-overrides-provider.tsx`, `hidden-prompts-provider.tsx`.
- `useFollowState`/`useLikeState`/`useSaveState` artık yalnızca gerçek
  Supabase durumunu okuyup yazıyor — mock/local hedefe düşen "else" dalları
  tamamen silindi (her hedef artık gerçek olduğundan zaten hiç
  tetiklenmiyorlardı).
- Statik, build-zamanlı mock rotaları: `/prompts/[id]`, `/requests/[id]`,
  `/profile/[username]` (+ `loading.tsx`'i), `/messages/[conversationId]`,
  `/tags/[tag]`. Bunların yerini alan `/prompts/local`, `/requests/local`,
  `/profile/real`, `/messages/local` (Bölüm 21'den beri zaten vardı) ve
  yeni `/tags/local` rotaları artık TEK rota — `promptHref()`/
  `requestHref()`/`profileHref()`/`messageHref()`/yeni `tagHref()`
  (`lib/utils.ts`) koşulsuz olarak hep bunlara yönleniyor, "bu id mock
  listesinde mi" kontrolü tamamen kalktı.
- `PromptRequestResponse` tipi, `ResponseCard`, `RequestResponseCount`
  (artık `request.responseCount` doğrudan gösteriliyor) — yalnızca mock
  "istek yanıtı" veri modeli için vardı, Bölüm 9'dan beri zaten gerçek
  yanıtlar sıradan bir `Prompt` (`origin.type === "request-response"`).
  `CommentCountLink` artık `CommentProvider` yerine doğrudan `baseCount`
  gösteriyor (gerçek `comment_count` kolonu). `resizeImageToDataUrl`
  (kare data-URL üreten mock-avatar yardımcı fonksiyonu) kullanılmayan
  kod olduğu için silindi.

**Yeni gerçek backend fonksiyonları** (`src/lib/supabase/`):
- `tags.ts` (YENİ): `fetchAllTags()`, `fetchPromptsByTag(slug)` — Keşfet'in
  "Popüler Etiketler"i ve yeni `/tags/local` sayfası artık gerçek, seed
  edilmiş `tags` tablosundan (Bölüm 18'in `20260919120600_seed_tags.sql`'i)
  okuyor.
- `prompts.ts`: `deleteRealPrompt(id)` (gerçek, kalıcı silme — RLS sahiplik
  kontrolü yapıyor), `searchPrompts(query)` (başlık/açıklama üzerinde
  `ilike`, `/search`'ü besliyor), `fetchPromptsByAuthors(authorIds)`
  ("Takip Ettiklerim" akışı için), `fetchRemixesOf(id)`/
  `fetchRemixChain(prompt)` (prompt detayının remix listesi/zinciri artık
  gerçek — sırayla `source_prompt_id` takip ederek). `CreateRealPromptInput`
  ve `createRealPrompt` artık opsiyonel bir `remixOf: {sourcePromptId,
  rootPromptId}` alıyor → **remix artık tamamen gerçek ve çalışıyor**
  (Bölüm 21 Faz 1'in "kaynağın gerçek bir veritabanı kaydı olması gerekir"
  kısıtı ortadan kalktı, çünkü artık remixlenebilecek HER prompt zaten
  gerçek bir satır).
- `profiles.ts`: `fetchTopCreators(limit)` (Keşfet'in "Öne Çıkan
  Yaratıcılar"ı), `searchProfiles(query)` (`/search`), `fetchFollowedProfiles
  (userId)` (gerçek `follows` tablosundan — "Takip Ettiklerim" artık
  localStorage değil, gerçek takip ilişkisini okuyor).
- `comments.ts`: `fetchCommentsForRequest(requestId)`/
  `postCommentOnRequest(...)` — istek yorumları artık prompt yorumlarıyla
  birebir aynı şekilde gerçek (`CommentSection` tek bir bileşende ikisini
  de `isPromptTarget` ayrımıyla ele alıyor, local dal tamamen kalktı).
- `notifications.ts` (YENİ): `fetchNotificationsForUser(userId)` — gerçek
  `notifications` tablosunu okuyor. **Bugün her zaman boş dönüyor** çünkü
  Bölüm 19 bilinçli olarak client'tan insert izni vermedi ve hiçbir
  sunucu tarafı trigger henüz bildirim üretmiyor — bu, mock verinin
  kaldırılmasıyla ortaya çıkan bir "eksik" değil, zaten var olan, belgelenmiş
  bir sınırlamanın (Bölüm 19/21 Faz 3-6) artık TEK davranış olması.
  `/notifications` bunu dürüstçe "Henüz bildirimin yok" ile gösteriyor.

**Davranış değişikliği — her yazma eylemi artık giriş gerektiriyor:**
Mock/localStorage'ın "giriş yapmadan da dene" güvenli ağı kalktığı için,
aşağıdakilerin hepsi artık gerçek bir Supabase hesabı istiyor (önceden bir
kısmı — istek oluşturma, mock içerikte beğeni/kaydetme/takip/yorum —
girişsiz de "çalışıyordu", bu localStorage'a yazdığı için):
- Prompt oluşturma/remix/kopyalama/isteğe yanıt verme (`/create`) — giriş
  yapılmamışsa form hiç render edilmiyor, "giriş yap / hesap oluştur"
  ekranı gösteriliyor.
- İstek oluşturma (`/requests/new`) — Bölüm 21 Faz 5'in bilinçli "giriş
  şart değil" kararı **tersine çevrildi**: mock/local istek kalmadığından
  bu artık korunacak "var olan bir özellik" değil, kaldırılan bir
  kategorinin doğal sonucu.
- Beğenme, kaydetme, takip etme, yorum yapma, mesaj gönderme, prompt silme
  — hepsi zaten `canLike`/`canSave`/`canFollow`/giriş kontrolleriyle
  gerçek hedefte girişe bağlıydı (Bölüm 21 Faz 3-6); artık İSTİSNASIZ her
  hedef gerçek olduğundan bu kural her yerde geçerli.
- **Okuma hâlâ herkese açık:** Ana Sayfa, Keşfet, prompt/istek/profil/
  etiket detay sayfaları, arama — hiçbiri girişe kilitlenmedi, RLS zaten
  bunları herkese açık okunur yapıyor (Bölüm 19).

**Profil içerik menüsü artık gerçekten siliyor, gizlemiyor:**
`ProfileContentMenu`/`ProfileContentGrid` "Profilimden gizle" yerine
"Sil" seçeneği sunuyor — `deleteRealPrompt` ile gerçek, kalıcı bir DELETE
tetikliyor (iki tıklamalı onay, RLS sahiplik kontrolü). Bölüm 12/14'ün
"mock veri silinemez, yalnızca gizlenebilir" kısıtı ortadan kalktı çünkü
artık her prompt gerçek ve silinebilir bir satır.

**Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ `*.supabase.co`'ya
erişimi engellediğinden gerçek bir uçtan uca kullanıcı testi burada
yapılamadı (önceki her fazda olduğu gibi). Bunun yerine: (1) `npx tsc
--noEmit`, `npm run lint` ve tam `npm run build` (statik export, artık
yalnızca 20 gerçek rota — mock'un ürettiği 90+ build-zamanı sayfa tamamen
kalktı) sıfır hatayla geçti; (2) yeni bir Playwright taraması, Supabase'e
hiç erişilemezken (her istek `ERR_TUNNEL_CONNECTION_FAILED` ile
başarısız oluyor) 19 farklı gerçek-veri rotasını (`/`, `/discover`,
`/search`, `/saved`, `/following`, `/notifications`, `/messages`,
`/create`, `/requests`, `/requests/new`, `/login`, `/signup`, `/settings`,
`/profile/edit`, `/prompts/local`, `/requests/local`, `/profile/real`,
`/messages/local`, `/tags/local`) ziyaret edip sıfır yakalanmamış JS
istisnası (`pageerror`) doğruladı — uygulama her yerde zarifçe boş/hata
durumuna düşüyor, hiçbir yerde çökmüyor. Gerçek bir Supabase projesine
karşı canlı doğrulama (arama gerçekten sonuç döndürüyor mu, remix zinciri
doğru çözülüyor mu, vb.) yine yalnızca kullanıcının kendi ortamında
yapılabilir — bu, Bölüm 21'in tamamında tekrarlanan, dürüstçe belirtilmiş
aynı sınırlama.

**Bilinen sorunlar / bilinçli basitleştirmeler:**
- **N+1 sorgu deseni hâlâ duruyor** (Bölüm 21 Faz 3'ten beri bilinen
  sınırlama) — her `LikeButton`/`SaveButton`/`FollowButton` kendi ayrı
  sorgusunu tetikliyor.
- **"Takip Ettiklerim" ve "Öne Çıkan Yaratıcılar"/Keşfet akışı, tam
  sayfalama olmadan yalnızca son ~60 promptun/isteğin önbelleğine
  dayanıyor** (`fetchRecentPublishedPrompts`/`fetchRecentRequests`'in
  limiti) — gerçek içerik hacmi arttıkça bu genişletilmesi gereken bir
  sınır.
- **Arama basit bir `ilike` alt-dize eşleşmesi**, sıralama/skorlama/typo
  toleransı yok — gerçek bir "relevance" araması Postgres full-text search
  veya harici bir arama servisi gerektirir.
- **Remix zinciri her seviye için ayrı bir fetch yapıyor**
  (`fetchRemixChain`) — sığ zincirlerde (pratikte hep öyle) sorun değil,
  çok derin bir zincirde yavaş olabilir.
- **Realtime hâlâ yok** (Bölüm 21 Faz 6'nın bilinen sınırlaması) — artık
  uygulamadaki TEK mesajlaşma yolu olduğundan bu sınırlama daha görünür:
  karşı tarafın mesajı sayfa yeniden ziyaret edilene kadar görünmüyor.
- **Bildirimler gerçekten üretilmiyor** (yukarıda açıklandı) — `/notifications`
  her zaman boş, bu davranış artık istisnasız her ziyaretçi için geçerli.
