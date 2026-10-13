### 9.34 Prompt/Generator ortak sosyal mimari denetimi (AŞAMA 1 — AUDIT)

Kullanıcının çok kapsamlı 62 bölümlük "Generator sistemini mevcut Prompt
sistemiyle paralelleştirme" şartnamesi üzerine — şartnamenin kendi §43/§62
kuralına uyularak (**"Önce rapor ver, sonra kodla"**) bu görevde HİÇBİR
refactor kodu yazılmadı; yalnızca gerçek kaynak dosyaları/migration'lar
okunup A-J formatında bir audit raporu üretilip kullanıcıya sohbette
(literal metin olarak, yalnızca bu CLAUDE.md notu değil) teslim edildi.
Kullanıcının onayı bekleniyor — onaylanmadan hiçbir PHASE 1-10 adımı
başlamayacak.

**Gerçekten okunan dosyalar (tahmin edilmedi):**
`20260919300000_generators.sql`, `20260919120300_engagement.sql`
(`prompt_likes`/`prompt_saves`/`prompt_comments`/`follows`),
`20260919160000_comment_likes_and_notifications.sql` (`comment_likes`),
`20260919120400_messaging_and_notifications.sql` (`notifications.type`
CHECK listesi), `src/features/generators/*` (tüm dosya listesi),
`src/features/prompts/*` (tüm dosya listesi), `generator-card.tsx`,
`use-generator-save-state.ts`, `generator-detail-view.tsx`,
`post-menu.tsx`, `comment-section.tsx`'in `CommentTarget` tipi,
`src/lib/supabase/comments.ts`'in export listesi.

**Özet bulgu:** Mevcut Prompt sosyal altyapısı (`prompt_likes`,
`prompt_comments`/`comment_likes`, `collections`/`collection_items`,
remix — `source_prompt_id`/`root_prompt_id`, `merge_requests`/
`prompt_versions`, `notifications`) ve Generator'ın kendi sosyal altyapısı
(`generator_saves`, `generator_tags`, remix — `source_generator_id`/
`root_generator_id`) **şu an iki paralel, kısmen kopya sistem** —
Generator'ın like/comment/remix-tree/collection/notification entegrasyonu
Bölüm 9.27'de bilinçli olarak "kapsam dışı" bırakılmıştı (bkz. Bölüm
9.27'nin "Kapsam dışı bırakılan" listesi: "Generator koleksiyonlara değil
ayrı `generator_saves`'e kaydediliyor", "Generator'da yorum/beğeni/
bildirim yok"). Kullanıcının şimdiki isteği tam olarak bu boşluğu
kapatmayı ve iki sistemi ortak bir sosyal katmanda birleştirmeyi
hedefliyor — bu, gerçek, önceden bilinen ve dokümante edilmiş bir mimari
borç, yeni keşfedilen bir hata değil.

**Denetimin ikinci somut bulgusu — "ortak sosyal katman" bugün BİLE
tam anlamıyla generic/polimorfik değil, mevcut iki içerik türü (Prompt/
İstek) arasında bile ayrı, elle yazılmış fonksiyonlarla kuruluyor:**
`comment-section.tsx`'in `CommentTarget` tipi `{promptId} | {requestId}`
(üçüncü bir `{generatorId}` kolu yok), `src/lib/supabase/comments.ts`
`fetchCommentsForPrompt`/`fetchCommentsForRequest` ve
`postCommentOnPrompt`/`postCommentOnRequest`'i AYRI fonksiyonlar olarak
tutuyor (tek, polimorfik bir `content_type` sütunlu fonksiyon değil) —
`prompt_comments` tablosunun kendisi zaten `prompt_id`/`request_id` iki
nullable FK + "tam olarak biri dolu" CHECK deseniyle (Bölüm 9.2) kurulu.
`PostMenu` (`post-menu.tsx`) da benzer şekilde doğrudan `promptId`/
`authorId`/`deleteRealPrompt`'a sabitlenmiş, polimorfik değil. Bu, şartnamenin
önerdiği "içerik-tipi + id" polimorfik tablo deseninin (§ örnek şema)
projenin GERÇEK, mevcut konvansiyonundan FARKLI olduğu anlamına geliyor —
mevcut konvansiyon "her içerik türü kendi nullable FK'sini/kendi ince
sarmalayıcı fonksiyonunu alır" (aynı desen `prompt_likes`, `collection_
items`, `prompt_tags`/`prompt_request_tags`/`generator_tags` üçlüsünde
de tekrarlıyor). Refactor planı bu ikisinden BİRİNİ seçmeli — ya var olan
konvansiyona uyup `prompt_comments`'e üçüncü bir `generator_id` FK'si +
`CommentTarget`'a üçüncü bir kol eklemek (küçük, tutarlı, düşük risk), ya
da gerçekten polimorfik bir `content_id`+`content_type` şemasına GEÇİŞ
yapmak (büyük, riskli, `prompt_comments`/`prompt_likes`'in var olan
milyonlarca satırlık — bugün için küçük ama ilke olarak — verisini
taşımayı gerektirir). Kullanıcıya sunulan raporda ilk seçenek (mevcut
konvansiyona uymak) önerildi, ikincisi kullanıcının şartnamedeki örnek
şemasının literal okunmasına daha yakın — nihai karar kullanıcının onayına
bırakıldı.

**Generator'ın bugün SIFIR sosyal entegrasyonu olduğu doğrulandı (tahmin
değil, kod okunarak):** `GeneratorCard`'da `LikeButton`/`CommentCountLink`/
`SaveButton` yok (yalnızca `useCount` metni); `GeneratorDetailView`'da
`PostMenu`/`CommentSection`/`RemixBranchMap` hiç render edilmiyor (kendi
bespoke sil/düzenle/remix/kaydet butonları var); `useGeneratorSaveState`
`collection_items` değil ayrı, basit bir boolean `generator_saves`
kullanıyor; bir generator remixlendiğinde/kaydedildiğinde/kullanıldığında
hiçbir `notifications` satırı üretilmiyor (Prompt'un `notify_new_remix`/
`notify_prompt_like`'ıyla eşdeğer hiçbir trigger generator tarafında yok).

**Kullanıcının kararı:** yukarıdaki audit raporu kullanıcı tarafından
"Tamam onaylıyorum" ile onaylandı — Faz 1 (H planının Option 1'i: mevcut
"nullable hedef sütunu + tam-olarak-bir CHECK" konvansiyonunu genişletmek,
tam polimorfik `content_id`+`content_type` şemasına GEÇİŞ değil) aşağıda
Bölüm 9.35 olarak uygulandı.
