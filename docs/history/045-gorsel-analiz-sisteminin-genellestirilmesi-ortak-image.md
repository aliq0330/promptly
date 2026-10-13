### 9.45 Görsel Analiz sisteminin genelleştirilmesi: ortak Image Analysis mimarisi (Generator/Prompt/Request)

Kullanıcının isteği üzerine — önce depoda hiç dokümante edilmemiş, ama
gerçekten var olan bir "AI Vision Generator" özelliği (`supabase/functions/
analyze-image`, `src/lib/vision-analysis.ts`, `src/lib/supabase/vision-
analysis.ts`, `src/features/generators/vision-analysis-panel.tsx`, `/dev/
image-analysis-test`) bulunup denetlendi. **Bu, CLAUDE.md'nin kendi kuralını
(her modül dokümante edilmeli) ihlal eden, önceki bir oturumda dosyaya hiç
işlenmemiş bir özellikti** — kod gerçekten deploy edilmiş, çalışan bir Gemini
Edge Function'ına dayanıyordu, ama bu dosyada hiç izi yoktu.

**Bulunan gerçek mimari sorun:** `VisionAnalysisPanel`, hem Builder'ın Live
Preview'ı hem Generator'ın GERÇEK, public runtime sayfası (`/generators/
local`) tarafından paylaşılan `GeneratorPlayground`'ın İÇİNE gömülüydü — bu
yüzden "Görselden Prompt Çıkar" yanlışlıkla runtime sayfasında da
görünüyordu. Ayrıca eski sistem yalnızca AI'nin ürettiği JSON'u kaba bir
dot-path flatten+fuzzy-match algoritmasıyla (`flattenVisionResult`/
`findBestMatch`) var olan alanlara eşliyordu; Generator'ın "Özel Alan Ekle"
sistemiyle entegre yeni alan ÖNERME/oluşturma yetisi hiç yoktu, ve Prompt/
Prompt İsteği oluşturma sayfalarında bu özellikten hiç iz yoktu.

**Kaldırılan dosyalar** (tamamen eski sisteme özgü, başka hiçbir yerden
kullanılmıyordu — proje geneli `grep` ile doğrulandı):
`supabase/functions/analyze-image/index.ts` (İÇERİĞİ değiştirildi, dosya
korundu — bkz. aşağı), `src/lib/vision-analysis.ts`, `src/lib/supabase/
vision-analysis.ts`, `src/features/generators/vision-analysis-panel.tsx`,
`src/app/dev/image-analysis-test/page.tsx` (+ boşalan `src/app/dev/`
klasörü).

**Korunan/genişletilen dosyalar:** `src/lib/utils.ts`'in `resizeImageToBlob`/
`readBlobAsBase64` yardımcıları (ortak, her üç mod tarafından da kullanılan
görsel-optimize-etme adımı) hiç değişmedi; `generator-builder.tsx`'in "Özel
Alan Ekle" inşa mantığı (`makeFieldKeyFromLabel`, sıra/order hesaplaması)
DEĞİŞTİRİLMEDİ — yalnızca `handleInsertCatalogFields`'in gövdesi, hem
kataloktan hem AI önerilerinden gelen alanları aynı yoldan geçiren ortak bir
`insertFieldDescriptors()`'a çıkarıldı (§Bölüm 9.30'un "bir `GeneratorField`
için TEK inşa yeri" kuralı bozulmadı, genişletildi).

**Yeni mimari — tek Edge Function, üç `mode`:**
```
                    ORTAK IMAGE ANALYSIS
                 (analyze-image Edge Function)
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
   generator_builder  prompt_builder  prompt_request
```
- `supabase/functions/analyze-image/index.ts` — production-hardening
  (CORS, `GEMINI_MODEL` sabiti, MIME/boyut doğrulaması, `AbortController`
  timeout, hata kategorileri) HİÇ değiştirilmedi; istek artık `{ mode,
  context, image, mimeType }` alıyor, `mode`'a göre ÜÇ AYRI sistem talimatı
  (`buildGeneratorBuilderPrompt`/`buildPromptBuilderPrompt`/
  `buildPromptRequestPrompt`) Gemini'ye gönderiliyor, yanıt `{ success,
  mode, model, data }`.
- `src/lib/image-analysis-types.ts` (YENİ) — üç modun context/result
  tipleri, tek doğruluk kaynağı.
- `src/lib/supabase/image-analysis.ts` (YENİ, eski `vision-analysis.ts`'in
  yerine) — tek bir `analyzeImage()` çekirdeği + üç ince, tipli sarmalayıcı
  (`analyzeImageForGenerator`/`analyzeImageForPrompt`/
  `analyzeImageForRequest`); hata kategorileri/friendly-message mantığı
  eskisiyle birebir aynı, yalnızca generic hale getirildi.
- `src/lib/generator-vision-mapping.ts` (YENİ, eski `vision-analysis.ts`'in
  fuzzy-matching kısmının yerine) — artık AI'nin KENDİSİ, Edge Function'a
  gönderilen GERÇEK `field.key` listesine göre eşleme yapıyor (fuzzy dot-
  path matching TAMAMEN kaldırıldı); bu dosya yalnızca dönen ham değeri
  alanın gerçek tipine göre güvenle coerce ediyor (`resolveGeneratorVisionMapping`)
  ve AI'nin önerdiği yeni alanları temizliyor/tekilleştiriyor
  (`sanitizeSuggestedFields` — yalnızca `text`/`select`/`multi_select`/
  `color`/`number`, en fazla 6, var olan bir alanla normalize-eşleşen asla).

**GENERATOR BUILDER akışı** (`src/features/generators/generator-vision-
assist.tsx`, YENİ) — YALNIZCA `generator-builder.tsx`'in "Alanlar" adımında
render ediliyor, `GeneratorPlayground`'a HİÇ dokunmuyor (o yüzden runtime
sayfasında asla görünmüyor): görsel yükle → analiz et → "Eşleşen Değerler"
(var olan alanlara, kullanıcı onaylarsa `defaultValue` olarak yazılır) ve
"Önerilen Yeni Alanlar" (kullanıcı onaylarsa `insertFieldDescriptors()` ile
— kataloktan eklemekle BİREBİR AYNI kod yolundan — gerçek `GeneratorField`
olarak eklenir) iki ayrı, işaretlenebilir liste; "Seçilenleri Uygula"ya
basılmadan hiçbir şey şemaya yazılmaz.

**PROMPT BUILDER akışı** (`src/features/prompts/prompt-vision-assist.tsx`,
YENİ) — `CreatePromptForm`'da yalnızca içerik türü "Görsel" iken, mevcut
görsel yükleme alanının hemen üstünde. Generator şeması/field mapping'iyle
hiç ilgisi yok: görsel → analiz → kısa okunabilir özet + üretilmiş prompt/
negatif prompt; "Prompt Alanına Yaz" (üzerine yazar) veya "Prompta Ekle"
(sonuna ekler) ile mevcut `promptText`'e aktarılır, negatif prompt (bu
formda ayrı bir persisted alan olmadığından, yeni bir alan İCAT EDİLMEDİ)
yalnızca kopyalanabilir bir referans olarak gösterilir.

**PROMPT REQUEST BUILDER akışı** (`src/features/requests/request-vision-
assist.tsx`, YENİ) — `CreateRequestForm`'da yalnızca düzenleme modu
DEĞİLKEN ve içerik türü "Görsel"ken. Amaç ne Generator ne nihai prompt —
kullanıcının başka birinden "nasıl bir prompt istediğini" tarif etmesine
yardımcı olmak: görsel → analiz → kısa özet + (stil/konu/renk paleti/
detaylar birleştirilmiş) "Önerilen Yön" → "Yaratıcı Yöne Ekle" (mevcut
`creativeDirection` alanına) + önerilen açıklama → "Açıklama Alanına Yaz"
(mevcut `description` alanına). Spec'in mockup'ındaki ayrı stil/konu/renk
paleti alanları bu uygulamada hiç yok — icat edilmedi, var olan iki gerçek
alana (Yaratıcı Yön, Açıklama) aktarılıyor.

**Nasıl doğrulandı:** `npm install` (bu oturumda `node_modules` hiç
kurulu değildi) + `npx tsc --noEmit` + `npm run lint` + tam `npm run build`
(placeholder Supabase env ile, 25 statik rota — `/dev/image-analysis-test`
artık yok) sıfır hatayla geçti. Proje geneli `grep` ile eski dosyalara/
export'lara hiçbir kalan referans olmadığı doğrulandı. **Gerçek bir
Gemini/Supabase Edge Function çağrısı bu sandbox'ta hiç test edilemedi**
(Bölüm 17'den beri tekrarlanan, bu projenin `*.supabase.co`'ya erişimi
engelleyen ağ kısıtı) — kullanıcının canlı sitede üç akışı da (Generator
Builder'da görsel yükleyip alan doldurma/öneri, Prompt oluştururken görsel
yükleyip prompt üretme, içerik türü Görsel bir istek oluştururken görsel
yükleyip açıklama/yön önerisi) bizzat denemesi gerekiyor. Bu görev hiçbir
migration içermiyor (Edge Function kodu `supabase functions deploy
analyze-image` ile yeniden deploy edilmeli, `GEMINI_API_KEY` secret'ı zaten
ayarlıysa değişmeden kalır) — yalnızca `supabase/functions/analyze-image/
index.ts` dosyası değişti, bunun kullanıcı tarafından yeniden deploy
edilmesi gerekiyor.

**Bilinen sınırlamalar:**
- Gerçek Gemini çağrısı hiç canlı test edilemedi (yukarıda açıklandı).
- Prompt Builder'da negatif prompt için ayrı bir persisted alan yok —
  yalnızca kopyalanabilir bir referans (bilinçli, "yeni alan icat etme"
  kuralına uygun).
- Prompt Request'in stil/konu/renk paleti önerileri tek bir "Yaratıcı Yön"
  metnine birleştiriliyor — ayrı, granüler alanlar bu formda hiç yok.
- Generator Builder'ın önerdiği yeni alan tipleri 5 ile sınırlı (`text`/
  `select`/`multi_select`/`color`/`number`) — `slider`/`checkbox`/`toggle`/
  `radio`/`url`/`textarea` AI tarafından hiç önerilmiyor (belirsizliğe en
  az açık, en güvenli alt küme; kullanıcı isterse manuel "Özel Alan
  Oluştur"la bu tiplerden herhangi birini hâlâ ekleyebiliyor).
