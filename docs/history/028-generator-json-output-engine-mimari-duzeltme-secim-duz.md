### 9.28 Generator JSON Output Engine — mimari düzeltme: "seçim → düz prompt string" yerine "seçim → yapılandırılmış JSON"

Kullanıcının Bölüm 9.27'nin hemen ardından gelen, ayrıntılı bir mimari
düzeltme talebi üzerine: bir generatorun gerçek çıktısı artık tek bir düz
prompt string'i DEĞİL, `prompt`'un yalnızca bir özelliği olduğu,
tamamen creator-tanımlı, keyfi derinlikte iç içe bir JSON nesnesi.
Kullanıcının kendi sözleriyle: "Hard-coded: subject / environment /
style_preset — yapma. Bunlar sadece örnektir. Her creator kendi JSON
output yapısını oluşturabilmeli." — bu kural harfiyen uygulandı: motorun
veya arayüzün hiçbir yerinde `subject`/`environment`/`style_preset` gibi
sabit bir üst seviye anahtar YOK, her şey alanların kendi `jsonPath`'inden
türüyor.

**AŞAMA 0 denetimi — Bölüm 9.27'nin kodu neyi yanlış yapıyordu:**
`GeneratorPlayground` (`generator-playground.tsx`) doğrudan
`renderTemplate(positiveTemplate, values, schema)` ve
`renderTemplate(negativeTemplate, values, schema)` çağırıp sonucu TEK,
düz bir string olarak `GeneratedPromptPanel`'e veriyordu — kullanıcının
işaret ettiği tam olarak "seçim → template string → tek prompt" kalıbıydı.
`GeneratorField`'ın kendi şemasında (Bölüm 9.27) bir alanın seçilen
değerinin çıktıda NEREDE duracağına dair hiçbir bilgi yoktu (`options:
string[]` — yalnızca düz bir seçenek listesi, görünen etiket ile gerçek
makine değeri arasında hiç ayrım yoktu). Bu iki gerçek eksiklik
düzeltildi; `renderTemplate`/`renderTemplateSection` (Prompt Template
Engine, `generator-template.ts`) kullanıcının açıkça "SİLME" dediği kod —
hiç silinmedi, yalnızca artık tek başına çağrılmıyor, yeni JSON Output
Engine'in İÇİNDEN çağrılıyor (§20'nin "iki ayrı engine" mimarisi).

**Yeni tipler (`src/types/index.ts`):**
- `GeneratorFieldOption { label: string; value: string }` — `GeneratorField.
  options` artık `string[]` değil `GeneratorFieldOption[]`. Görünen etiket
  ("Yeşil") ile çıktıya yazılan gerçek, kanonik değer ("green") artık
  bilinçli olarak ayrı — runtime `GeneratorValues` ve JSON çıktısı HER
  ZAMAN `value`'yu taşıyor, `label` yalnızca arayüzde gösteriliyor.
- `GeneratorField.jsonPath: string` — bu alanın gerçek değerinin
  generatorun yapılandırılmış JSON çıktısında (nokta-gösterimli, ör.
  `subject.eye_color`) nereye yazılacağı. Boşsa alanın kendi `key`'ine
  (düz, üst seviye bir özellik) düşüyor.
- `GeneratorOutput = Record<string, unknown>` — bir generatorun gerçek,
  birincil çıktısı; `prompt`/`negative_prompt` dışında hiçbir anahtar
  varsayılmıyor.

**Yeni dosya — `src/lib/generator-output.ts` (JSON Output Engine, Prompt
Template Engine'den BİLİNÇLİ OLARAK ayrı bir dosya/katman):**
```
USER INPUT → RUNTIME STATE
  → [JSON OUTPUT ENGINE: jsonPath → value]   (generator-output.ts)
  → STRUCTURED JSON
  → [PROMPT TEMPLATE ENGINE: {{variables}}]  (generator-template.ts)
  → JSON.prompt / JSON.negative_prompt
```
- `parseJsonPath`/`isValidJsonPath` — nokta-gösterimli yolu segmentlere
  ayırıyor, her segmentin gerçek bir identifier (harf/rakam/alt çizgi)
  olmasını zorluyor.
- `assignAtPath(root, segments, value)` — bir değeri, gerektiği kadar iç
  içe nesne OTOMATİK OLUŞTURARAK doğru konuma yazan tek, saf yardımcı
  fonksiyon; §5/§6'nın "aynı üst segmenti paylaşan alanlar otomatik tek
  nesnede birleşmeli" ve "array destekli olmalı" kurallarının ikisi de bu
  tek fonksiyondan geliyor. Bir yol çakışmasında (bir alanın skaler değeri
  başka bir alanın iç içe yoluna denk gelirse) deterministik olarak
  nesneyle EZİYOR — hangi alanın "kazanması gerektiğini" motor bilemez
  (§22'nin genericlik kuralı), bu yüzden çakışma `validateGeneratorOutputMapping`
  ile gerçek, görünür bir uyarı olarak yüzeyde tutuluyor.
- `buildGeneratorOutput(schema, template, values, enableNegativePrompt)` —
  §18'in istediği "Central Output Engine": her görünür alanın (§34'ün
  koşullu görünürlüğüne uyarak) gerçek değerini tipine göre gerçek bir
  JSON tipine çeviriyor (number/slider → gerçek sayı, checkbox/toggle →
  gerçek boolean, multi_select → gerçek string dizisi, boş bir alan
  tamamen atlanıyor — çıktıyı boş string/boş dizilerle kirletmemek için),
  kendi `jsonPath`'ine yazıyor; SONRA aynı schema/template/values'u Prompt
  Template Engine'e (`renderTemplate`) verip `prompt`/`negative_prompt`'u
  hesaplıyor ve bunları EN SON, ayrılmış anahtarlar olarak yazıyor —
  bu yüzden bir alanın `jsonPath`'i yanlışlıkla `prompt`'a çakışsa bile
  gerçek üretilen prompt metni HER ZAMAN kazanıyor (sessizce değil,
  `validateGeneratorOutputMapping` bunu da uyarı olarak gösteriyor).
- `previewValueForField`/`buildFieldOutputPreview` — alan editörünün canlı
  "Çıktı Önizlemesi" mini-JSON'u (§10) için, gerçek varsayılan değer ya da
  (yoksa) temsili bir yer tutucu (ör. select/radio'nun ilk seçeneğinin
  değeri) kullanıyor.
- `collectJsonPathGroups`/`collectUsedJsonPaths` — alan editörünün "Çıktı
  Grubu" ve otomatik tamamlama önerileri için (§11/§12), şemadaki TÜM
  alanların zaten kullandığı gerçek yolları/üst segmentleri döndürüyor.
- `validateGeneratorOutputMapping(schema)` — yayın doğrulamasının Output
  Mapping yarısı; `generator-template.ts`'in `validateGeneratorForPublish`'inden
  BİLİNÇLİ OLARAK ayrı bir fonksiyon/dosyada tutuldu (iki motor, birbirinin
  içine bakmadan, `generator-builder.tsx`'in ikisini BİRLEŞTİRMESİ) — boş/
  geçersiz bir yol hata, iki alanın aynı yola yazması ya da ayrılmış
  `prompt`/`negative_prompt` anahtarlarıyla çakışma ise uyarı (yine de
  yayınlanabilir, ama creator bilsin).

**Alan editörü (`field-editor-modal.tsx`) — gerçek "Çıktı Eşleme (Output
Mapping)" bölümü eklendi (§10/§11/§12):**
- Options listesi artık iki gerçek alan (Etiket + Değer) — değer, etiketten
  otomatik türetiliyor (Türkçe transliterasyon, `slugifyGeneratorTitle`'ın
  aynısı, alt çizgili) ama elle de değiştirilebiliyor; her ikisi de satırda
  ayrı ayrı gösteriliyor.
- **Çıktı Grubu** + **Özellik Adı** — iki gerçek `<input list="...">`
  (native HTML5 datalist ile otomatik tamamlama, harici bir dropdown
  kütüphanesi eklemeden — CLAUDE.md §2'ye uygun): "Çıktı Grubu"na "subject"
  yazıp "Özellik Adı"na "eye_color" yazmak canlı olarak `subject.eye_color`
  JSON Path'ini oluşturuyor; her ikisinin datalist önerileri şemadaki
  DİĞER alanların zaten kullandığı gerçek gruplardan/özelliklerden geliyor
  (§11'in "subject." → subject.type, subject.gender, …" kuralı).
- **JSON Path** — elle de doğrudan düzenlenebilen, gerçek kaynak-of-truth
  metin alanı (§12'nin "gelişmiş kullanıcılar için özel yol" fallback'i);
  grup/özellik kontrolleri yalnızca bunu YAZAN, kolaylık sağlayan bir
  kompozisyon katmanı.
- **Çıktı Önizlemesi** — o TEK alanın, o anki `jsonPath`'ine göre nasıl
  yerleşeceğini gösteren canlı, gerçek bir mini-JSON (`buildFieldOutputPreview`).
- Koşullu görünürlük (`condition.equals`) artık seçeneğin `value`'suna
  bağlanıyor, `label`'ına değil — `isConditionSatisfiable`
  (`generator-template.ts`) de buna göre güncellendi.
- `field-list.tsx`'e her alanın satırının altına gerçek `→ subject.eye_color`
  gibi bir jsonPath rozeti eklendi — creator, hangi alanın çıktıda nereye
  yazdığını listeyi tararken görebiliyor.

**`GeneratorPlayground` artık üç sekme — FORM / JSON / PROMPT (§14),
ikisi de AYNI `buildGeneratorOutput()` çağrısından türüyor, iki ayrı kaynak
yok:**
- **JSON** sekmesi (yeni `generator-json-panel.tsx`) — generatorun gerçek,
  birincil çıktısı: tam, canlı güncellenen, girintili `JSON.stringify(output,
  null, 2)` + gerçek bir **"JSON'u Kopyala"** butonu (§19, var olan
  `copyTextToClipboard()` yeniden kullanıldı — yeni bir panoya kopyalama
  mekanizması icat edilmedi).
- **Prompt** sekmesi artık JSON'un KENDİ `prompt`/`negative_prompt`
  özelliklerinin salt insan-okunur bir görünümü — `GeneratedPromptPanel`
  hiç değişmedi, yalnızca artık girdisini `buildGeneratorOutput()`'un
  sonucundan alıyor (önceden doğrudan `renderTemplate()`'ten alıyordu).
- Builder'ın Alanlar/Şablon/Önizleme adımlarındaki Canlı Önizleme paneli
  ve gerçek generator runtime sayfası (`generator-detail-view.tsx`) BU
  AYNI, tek `GeneratorPlayground`'ı paylaşmaya devam ediyor (CLAUDE.md
  §12/§13) — üç sekmeli tasarım her ikisinde de otomatik olarak geçerli.
- "Prompt Olarak Aç" köprüsü (`generator-detail-view.tsx` →
  `CreatePromptForm`'un `?generatorRun=` modu) hiç değişmedi — hâlâ yalnızca
  `prompt`/`negative_prompt` string'lerini (artık JSON'dan türetilmiş)
  gerçek bir `generator_runs` satırına kaydedip oradan bir Prompt
  yayınlıyor; tam yapılandırılmış JSON'un kendisi `generator_runs`'a HİÇ
  yazılmıyor (kapsam dışı — Prompt sistemi hâlâ düz metin bir `prompt_text`
  bekliyor, bu köprünün işi zaten yalnızca o).

**`generator-builder.tsx`:** yayın doğrulaması artık
`validateGeneratorForPublish(...)` VE `validateGeneratorOutputMapping(schema)`'nın
birleşimi — iki motorun sorunları aynı Hata/Uyarı listesinde, aynı
"Yayınlamaya hazır." / kırmızı-hata / turuncu-uyarı UI'ında gösteriliyor.

**Migration gerekmedi:** `generator_versions.schema`/`template` zaten
JSONB (Bölüm 9.27) — `jsonPath`/`GeneratorFieldOption` yalnızca o JSON'un
TypeScript tarafındaki şeklini genişletiyor, veritabanı tarafında hiçbir
şema değişikliği yok.

**Nasıl doğrulandı:**
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  `generator-output.ts`'e karşı — yalnızca `generator-template.ts`'e olan
  tek yönlü, extensionsız relative import'u node'un ESM çözümleyicisi
  atlayamadığından, bu projenin `tag-catalog-matcher.ts` testinde zaten
  kullandığı yöntemle, her iki dosyanın scratchpad'e kopyalanıp yalnızca
  KOPYADAKİ import'un `.ts` uzantısıyla düzeltilmesiyle — gerçek `src/`
  dosyaları hiç değiştirilmedi): 36 assertion — şartnamenin kendi §21
  worked example'ı (Eye Color/Outfit/Pose/Background/Accessories → doğru
  iç içe `subject`/`environment` nesneleri, doğru `prompt`); alan tipi
  dönüşümleri (number→gerçek sayı, toggle→gerçek boolean, boş metin
  alanının tamamen atlanması); koşullu görünürlüğün JSON çıktısını da
  gizlemesi; ayrılmış `prompt` anahtarının HER ZAMAN kazanması; tamamen
  farklı, creator-tanımlı bir şekil (`product`/`brand`) ile SIFIR kod
  değişikliğiyle çalışması (§22'nin genericlik kanıtı); önizleme/grup/yol
  toplama/doğrulama fonksiyonlarının hepsi — hepsi geçti.
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
  değişmedi) sıfır hatayla geçti.
- **Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright**
  (bu projenin standart yöntemi): (1) Bölüm 9.27'nin kendi 43 senaryolu
  `generators-e2e-test.mjs`'i, yeni Etiket/Değer seçenek girişine ve
  `selectOption({label:…})`'a (artık `value` sanitize edilmiş kanonik bir
  değer olduğundan) göre güncellenip yeniden çalıştırıldı — YENİ, bu
  görevin eklediği senaryolar dahil (Output Mapping grup/özellik
  kompozisyonunun gerçek `subject.gender` yolunu yazdığı, alan editörünün
  canlı Çıktı Önizlemesinin doğru göründüğü, field-list'in gerçek jsonPath
  rozetini gösterdiği, playground'ın JSON sekmesinin düz bir prompt
  yerine gerçekten iç içe bir nesne gösterdiği) — 43/43 geçti. (2) Yeni,
  14 senaryolu `generator-json-output-test.mjs`: dört alanın (select →
  `product.color`, text → `backdrop.type`, number → düz üst seviye
  `priority`, multi_select → `lighting.tags`) HİÇBİRİ şartnamenin kendi
  `subject`/`environment`/`style_preset` örneğiyle BİREBİR EŞLEŞMEYEN,
  bilinçli olarak FARKLI bir grup isimlendirmesiyle test edildi (genericlik
  iddiasının gerçek kanıtı); multi_select'in gerçek bir JSON DİZİSİ
  ürettiği (birleştirilmiş bir string değil); `negative_prompt`
  desteği açıkken anahtarın (boş olsa bile) gerçekten var olduğu;
  çıktının şartnamenin örneğine hiç benzemeyen, yalnızca bu creator'ın
  kendi alanlarının tanımladığı anahtarlardan oluştuğu; **"JSON'u
  Kopyala"nın panoya GERÇEKTEN aynı JSON'u yazdığı** (gerçek clipboard
  API, `permissions: ["clipboard-read","clipboard-write"]` ile); iki
  alanın aynı yola yazacak şekilde düzenlenmesinin gerçek, görünür bir
  yayın uyarısı ürettiği, düzeltilince kaybolup yayının başarıyla
  tamamlandığı — hepsi sıfır JS hatasıyla (yalnızca bu sandbox'ın
  standart, WebSocket/Realtime'a erişimi engelleyen ağ politikasından
  kaynaklanan, beklenen konsol hataları). (3) Bu oturumun ilgisiz
  regresyon paketleri (`resilience-test.mjs` 14/14, `smart-tags-e2e-test.mjs`
  30/30, `prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs`
  19/19, `save-flow-e2e-test.mjs` 14/14) sıfır regresyonla yeniden
  çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/TypeScript katmanında), kullanıcının Dashboard'da
yapması gereken ekstra bir adım yok; yalnızca canlı sitede gerçek bir
generator oluşturup JSON sekmesini bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **§15'in "opsiyonel Output Schema skeleton'ı" ayrı bir state/alan olarak
  eklenmedi** — şartname bunu zaten koşullu ("opsiyonel olarak
  önceden tanımlayabilir") bıraktı; bu motor onun yerine şemadaki
  alanların jsonPath'lerinin BİRLEŞİMİNDEN çıktı şeklini türetiyor, ki bu
  zaten "önceden tanımlanmış bir iskelete gerek kalmadan" aynı sonucu
  veriyor — ayrı bir iskelet state'i (CLAUDE.md'nin "spec'in yalnızca
  isteğe bağlı bıraktığı alanı/tabloyu ekleme" ilkesine uyarak) icat
  edilmedi.
- **§12'nin "iki gerçek dropdown" önerisi yerine iki `<input list>`
  (datalist) kullanıldı** — aynı UX'i (öner + serbest yaz) tek bir kontrol
  tipiyle, harici bağımlılık eklemeden sağlıyor; bilinçli, daha basit bir
  uygulama kararı.
- **Yol çakışması/geçersizlik kontrolü yalnızca yayın doğrulamasında
  (Yayınla adımı) gösteriliyor, alan editörü İÇİNDE canlı bir "bu yol
  başka bir alanla çakışıyor" uyarısı eklenmedi** — alan editörünün kendi
  Çıktı Önizlemesi zaten o TEK alanın nereye yazacağını gösteriyor, tüm
  şemaya karşı çapraz kontrol Yayınla adımının işi olarak bırakıldı
  (CLAUDE.md'nin "gereksiz UI'ı bölme" ilkesine uygun).

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **`generator_runs.input_values`/`generated_prompt` hâlâ yalnızca düz
  değerleri/metni saklıyor, tam yapılandırılmış JSON'u DEĞİL** — "Prompt
  Olarak Aç" köprüsü kapsamı dışında (yukarıda açıklandı); tam JSON'u
  ayrıca saklamak isteyen bir gelecek özellik (ör. "JSON'u da kaydet")
  `generator_runs`'a yeni bir sütun eklemeyi gerektirir, bu görevde
  yapılmadı.
- **Yol çakışması motor seviyesinde "son yazan kazanır" ile çözülüyor,
  motor hangi alanın öncelikli olması gerektiğini asla tahmin etmiyor**
  (yukarıda "assignAtPath" notunda açıklandı) — bu, genericlik
  gereksiniminin (§22) kaçınılmaz bir sonucu, bir hata değil.

---
