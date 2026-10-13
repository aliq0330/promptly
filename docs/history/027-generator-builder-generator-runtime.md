### 9.27 Generator Builder + Generator Runtime

Kullanıcının 78 bölümlük "PROMPTLY — GENERATOR BUILDER + GENERATOR RUNTIME
— UÇTAN UCA GELİŞTİRME GÖREVİ" şartnamesi üzerine — Promptly'a tamamen yeni,
üçüncü bir birinci sınıf içerik türü eklendi: **Generator**. Kullanıcılar
kod yazmadan kendi parametrik prompt generatorlarını (özel kategoriler,
birçok tipte özel alanlar, `{{değişken}}` şablon motoru) oluşturup
yayınlayabiliyor; başka bir kullanıcı bu generatoru gerçekten çalıştırıp
kendi seçimleriyle bir prompt üretebiliyor ve bunu "Prompt Olarak Aç" ile
uygulamanın mevcut Prompt sistemine (gerçek, kalıcı yayın) aktarabiliyor.

**AŞAMA 0 — analiz (kod yazılmadan önce yapıldı, şartnamenin §76'sı
gereği):** Mevcut mimari incelendi — bu projede "çok adımlı form + adım
başına otomatik kayıt" deseni hiç yoktu, ama her küçük yapı taşı zaten
vardı ve yeniden kullanıldı: `TagPicker`/`useTagPicker` (zaten tamamen
generic, generator için hiç değiştirilmeden kullanıldı), `Modal`/`Portal` +
iki-tıklamalı-silme konvansiyonu, `resizeImageToDataUrlFit` görsel yükleme
deseni, `?edit=`/`?duplicate=` query-param konvansiyonu
(`CreatePromptForm`'un zaten kullandığı), ve `xHref()`
(`promptHref`/`requestHref`/`tagHref`) statik-route + query-param arama
deseni (yeni `generatorHref()` bunun birebir aynısı). Hiçbir yeni npm
bağımlılığı eklenmedi — sürükle-bırak kategori/alan sıralaması native
HTML5 drag-and-drop ile, elle yapıldı (bu projenin `remix-branch-map.tsx`'in
elle yapılmış pan/zoom'uyla aynı "harici kütüphane yok" ilkesi).

**Mimari karar — JSONB tabanlı şema depolama:** Şartnamenin kendi §39/§61
esnekliğine dayanarak, generatorun kategorileri/alanları/şablon bölümleri
~5 ayrı normalize tabloya (categories, fields, field_options, template_
sections, vb.) bölünmedi — tek bir `generator_versions.schema`/`template`
JSONB kolonunda, `GeneratorSchema`/`GeneratorTemplate` TypeScript
tipleriyle birebir eşleşen bir şekilde tutuluyor. Bu, hem sürüm geçmişini
(her yayın gerçek, bütün bir JSONB snapshot'u) hem "hiçbir alan tipi
frontend'de sabit kodlanmamalı, şema tamamen kullanıcı tanımlı olmalı"
gereksinimini (şartname §76) doğal olarak karşılıyor, ve gerçek bir alan
CRUD'unu ayrı network round-trip'leri yerine tek bir sayfa içi state
mutasyonuna indiriyor.

**Yeni migration:** `supabase/migrations/20260919300000_generators.sql`:
- `generators` (creator_id, title, slug — gerçek, benzersiz, `generateUniqueSlug`
  ile çakışmada `-2`/`-3` ekleyerek çözülüyor; description, cover_url,
  category — sabit `GeneratorCategoryTopic` enum'u [image/text/video/
  audio/code/design/marketing/writing/other], subcategory — serbest metin,
  visibility [public/unlisted/private, varsayılan private], status
  [draft/published/archived], allow_remix/allow_prompt_editing/
  allow_saving_generated_prompts/enable_negative_prompt, origin_type +
  source_generator_id/root_generator_id [remix ilişkisi, `prompts`'un
  kendi remix desenini birebir taklit ediyor], current_version_id,
  use_count/save_count/remix_count [denormalize sayaçlar]).
- `generator_versions` (generator_id, version_number, schema jsonb,
  template jsonb, created_by, created_at) — gerçek, immutable (yayın
  sonrası) sürüm geçmişi.
- `generator_tags` — `prompt_tags` ile birebir aynı join-tablosu deseni
  (mevcut, olgun etiket sistemi — Bölüm 9.23/9.24 — hiç değiştirilmeden
  yeniden kullanıldı).
- `generator_runs` — bir kullanıcının bir generatoru gerçekten çalıştırdığı
  her kayıt (input_values jsonb, generated_prompt, generated_negative_
  prompt) — **yalnızca kendi sahibine görünür** (RLS: "bir generatorun
  sahibi bile başkasının çalıştırma kaydını okuyamaz", şartnamenin §40'ının
  gizlilik ilkesi); generatorun kendi `use_count`'u (herkese açık,
  `handle_generator_run_created` trigger'ıyla artıyor) bunun tek genel
  görünürlüğü.
- `generator_saves` — `prompt_saves`/`collection_items` ile aynı basit
  bileşik-PK deseni (bir generatorun "koleksiyon" kavramı yok, kasıtlı
  olarak basit tutuldu — bkz. "Kapsam dışı" altında).
- `prompts`'a üç yeni, nullable kolon: `generator_id`/`generator_version_id`/
  `generator_run_id` — bir promptun "hangi generatordan, hangi
  çalıştırmadan açıldığı" bilgisini taşıyan, tamamen bilgilendirici
  provenance alanları (§21-24'ün "Open in Prompt" köprüsü); bir generator
  çıktısının kendisi normalde `origin: "original"` kalıyor (remix/istek-
  yanıtı ile ORTOGONAL bir alan, birbirine karıştırılmadı).
- `SECURITY DEFINER` trigger'lar: `handle_generator_save_change`
  (save_count), `handle_generator_run_created` (use_count),
  `handle_generator_remix_created` (remix_count) — bu projenin
  beğeni/takip/yorum sayaçlarında zaten kanıtlanmış aynı desen.
- **RLS:** `generators` — herkese açık okuma yalnızca `status='published'
  AND visibility IN ('public','unlisted')`, sahibi HER zaman kendi
  taslağını/gizli generatorunu da görebiliyor (prompts.status='draft'
  desenin birebir aynısı); yazma yalnızca sahibi. `generator_runs` —
  yukarıda açıklandığı gibi tamamen sahibine özel SELECT, INSERT yalnızca
  erişilebilir bir generatora karşı. Migration bu oturumda GERÇEKTEN yerel
  bir PostgreSQL 16 örneğinde (bu projenin standart yöntemi — `anon`/
  `authenticated` rol simülasyonu) uygulanıp 11 senaryoyla doğrulandı:
  taslak bir generatorun yalnızca sahibine göründüğü, başka bir
  kullanıcının bir generatoru gerçekten çalıştırabildiği ama bu çalıştırma
  kaydını generatorun SAHİBİNİN bile okuyamadığı, `use_count`'un çapraz
  kullanıcı senaryosunda gerçekten arttığı, remix'in kaynağı hiç
  değiştirmediği (yeni bir generator satırı) — dahil.

**Yeni pure/framework-free dosya — `src/lib/generator-template.ts`:**
`extractTemplateVariables`/`extractVariablesFromText` (bir `{{key}}`
token'ı), `isFieldVisible`/`renderTemplateSection`/`renderTemplate`
(§34'ün tek-koşullu, `equals`-only koşullu alan sistemi dahil — bir alanın
koşulu sağlanmıyorsa hem formda gizleniyor hem şablonda o token'a
referans varsa literal `{{key}}` olarak kalıyor, asla sessizce
"undefined" olmuyor — `prompt-variables.ts`'in `{name}` sistemiyle
BİREBİR aynı "bilinmeyen/gizli token asla sessizce kaybolmaz" ilkesi),
`defaultValuesFromSchema`, `validateGeneratorForPublish` (§28'in yayın
doğrulaması — başlık/açıklama boş olamaz, en az bir alan, tekil değişken
adları, şablonun referans verdiği her `{{token}}` gerçek bir alana karşılık
gelmeli, seçim ailesi alanların en az bir seçeneği olmalı, zorunlu ama
varsayılanı olmayan bir alan yalnızca UYARI — hata değil, "kullanıcı
doldurmalı" anlamına geliyor), `slugifyGeneratorTitle`/
`makeFieldKeyFromLabel` (Türkçe transliterasyon, `normalizeTagLabel` ile
aynı kurallar), `isConditionSatisfiable`, `fieldsInCategory`,
`countKeyUsageInTemplate`, `isNegativeSection` (bir bölümün "Negative
Prompt" yarısı sayılması PURE OLARAK BAŞLIĞINA bakılarak belirleniyor —
şemaya ayrı bir boolean eklemek yerine, "Negative Prompt" adında bir
bölüm açmak yeterli).

**Yeni veri katmanı — `src/lib/supabase/generators.ts`:** bu projenin
`prompts.ts`/`requests.ts` ile birebir aynı konvansiyonu (hand-written
`Row` arayüzü + `_SELECT` sabiti + `map*Row` + `fetch*`/`create*`/
`update*`, hepsi try/catch'li okuma, throw eden yazma) izleyen ~500
satırlık tam katman: `fetchGeneratorVersion` (generator'ın kendi
current_version_id'siyle AYRI bir sorgu — `generators`/`generator_versions`
arasında İKİ FK yolu olduğundan [current_version_id → id, VE generator_id
→ generators.id], bir embedded PostgREST select'i bunu ayırt edemezdi;
bu, kod yazılmadan ÖNCE, AŞAMA 0'da fark edilip kaçınıldı, çalışma
zamanında keşfedilen bir hata değil), `createDraftGenerator` (gerçek,
kalıcı bir taslak + boş v1 sürümü — iki sıralı insert), `updateGeneratorMeta`,
`saveDraftVersionContent` (yalnızca yayından ÖNCE otomatik kaydedilen taslak
içeriği), `publishGenerator` (ilk yayın v1'i olduğu gibi bitiriyor;
SONRAKİ her yayın GERÇEKTEN yeni bir sürüm satırı oluşturup
`current_version_id`'yi kaydırıyor — §26'nın gerçek sürüm geçmişi),
`deleteGenerator`, `remixGenerator` (kaynağın current schema/template'ini
GERÇEKTEN kopyalayan yeni bir taslak — orijinal asla değişmiyor),
`recordGeneratorRun`/`fetchGeneratorRun`, `fetchIsGeneratorSaved`/
`saveGenerator`/`unsaveGenerator`.

**Builder UI (`src/features/generators/`):**
- `generator-builder.tsx` — üst orkestratör, `/generators/create` (yeni)
  ve `/generators/create?edit=<id>` (mevcut bir taslağı/yayınlanmış
  generatoru düzenleme) ikisini de tek bileşende karşılıyor.
  **5 sekme** (şartnamenin ayrı "Details/Fields/Builder/LivePreview/
  Template/Preview/Settings/Publish" adımları, tekrarı önlemek için
  bilinçli olarak konsolide edildi): Detaylar, Alanlar, Şablon, Önizleme,
  Yayınla. **Draft satırı yalnızca Detaylar'dan gerçekten ilerlenince
  oluşturuluyor** (başlık+açıklama zorunlu doğrulamasından geçince) —
  `/generators/create`'e bakıp hemen ayrılan bir ziyaretçi veritabanını
  boş bir taslakla kirletmiyor. **Otomatik kayıt** (`saveDraftVersionContent`,
  900ms debounce'lu) yalnızca generator hâlâ `status='draft'` iken
  çalışıyor — yayından SONRAKİ düzenlemeler yeniden yayınlanana kadar
  yalnızca yerel state'te kalıyor (§26'nın sürüm geçmişini otomatik
  kayıtla "sessizce ezme" riskine karşı bilinçli bir mimari sınır — ayrı
  bir "taslak sürüm" alanı şemada hiç yok). Meta (başlık/açıklama/kapak/
  kategori/etiket/görünürlük/ayarlar) HER ZAMAN anında kalıcı
  (`updateGeneratorMeta`) — hiç versiyonlanmıyor, `generators` satırının
  kendi doğrudan kolonları.
- `category-manager.tsx`/`field-list.tsx` — kategori/alan ekle/yeniden
  adlandır/sil/**native HTML5 drag-and-drop ile yeniden sırala**. Bir
  kategoriyi silmek İÇİNDEKİ ALANLARI SİLMİYOR — `field.categoryId`
  artık var olmayan bir kategoriye işaret ettiğinde alan otomatik olarak
  "Diğer" (uncategorized) grubuna düşüyor (`UNCATEGORIZED_CATEGORY_ID`
  sentinel'i) — kasıtlı, dokümante edilmiş, geri dönüşü olan bir davranış.
- `field-editor-modal.tsx` — Alan Ekle/Düzenle tek paylaşılan modal: 11
  gerçek alan tipi (text/textarea/select/multi_select/number/slider/
  color/checkbox/toggle/radio/url — şartnamenin 14 tipinden IMAGE/DATE/
  RANGE bilinçli olarak çıkarıldı, bkz. "Kapsam dışı"), etiketten otomatik
  türetilen ama düzenlenebilir değişken adı (canlı format/tekillik
  doğrulamalı), seçenek listesi editörü, tip-koşullu varsayılan değer
  alanı, ve bir "Advanced" bölümü (zorunlu/placeholder/min-max-step/§34'ün
  tek-koşullu görünürlük seçici).
- `generator-details-form.tsx` — başlık/açıklama/kategori/alt kategori/
  `TagPicker`/kapak görseli/görünürlük/ayarlar. Kapak görseli için ayrı
  bir Storage bucket bu migration'a EKLENMEDİ (kasıtlı kapsam kararı) —
  bu projenin localStorage-öncesi çağının aynı çözümü: `resizeImageToDataUrlFit`
  ile küçültülmüş gerçek bir data URL, doğrudan `generators.cover_url`
  (gerçek bir Postgres `text` kolonu, localStorage'ın boyut tavanı yok)
  kolonuna yazılıyor.
- `template-editor.tsx` — birden fazla, bağımsız etkinleştirilebilir
  şablon bölümü (§30'un pozitif/negatif prompt fikri, ayrı bir alan yerine
  "Negative Prompt" adında ikinci bir bölüm açmakla genelleştirildi),
  her bölümde gerçek imleç konumuna `{{key}}` ekleyen tıklanabilir
  değişken çipleri (`insertTextAtRange` — Prompt Değişken Sistemi'nden
  AYNEN yeniden kullanıldı, zaten `{name}`'e özgü değildi, saf bir metin-
  aralığı işlemiydi), ve her bölüm için canlı "bilinmeyen değişken"
  uyarısı (§28'in yayın-engelleyici kuralının aynısı, burada erken
  gösteriliyor).
- `generator-playground.tsx` (`GeneratorPlayground`) — **hem builder'ın
  kendi Live Preview'ı HEM gerçek public runtime sayfası TARAFINDAN
  DEĞİŞTİRİLMEDEN paylaşılan** tek bileşen (CLAUDE.md §12/§13'ün "generator
  creator ile generator user aynı runtime componentleri paylaşmalı"
  kuralı — kelimenin tam anlamıyla aynı kod, iki paralel implementasyon
  yok). Form/Prompt iki sekmeli; kendi `values` state'ini tutuyor, şema
  değiştikçe yeni alanların varsayılanlarını SESSİZCE EKLİYOR (asla
  kullanıcının zaten girdiği değerleri silmeden), "Varsayılanlara dön" tam
  sıfırlama yapıyor. Gerçek runtime sayfası bir `renderActions` prop'uyla
  "Prompt Olarak Aç" gibi eylemleri enjekte edebiliyor — builder'ın kendi
  önizlemesi hiçbir eylem geçirmiyor (salt izleme/test).
- `generator-runtime-field.tsx`/`generator-runtime-form.tsx` — tek bir
  alanın/tüm şemanın gerçek input kontrolü — yukarıdaki paylaşım
  ilkesinin GERÇEK temeli, `GeneratorPlayground`'ın kendisi bile bunları
  wrap ediyor.

**Generator detay + runtime sayfası (`/generators/local?slug=`):** statik
export + runtime-oluşturulan-satır çelişkisi bu projenin standart
`xHref()`/`/x/local?…` desenle çözüldü (`generatorHref()`, `tagHref()`'in
birebir aynısı). Kapak/istatistik/yazar/etiketler, sahibine "Düzenle"/"Sil",
başkasına (izin varsa) "Remixle"/"Kaydet", ve GERÇEK "Generatoru Kullan"
bölümü (`GeneratorPlayground` + `renderActions` ile "Prompt Olarak Aç").

**"Open in Prompt" köprüsü — §21-24, TEK gerçek yol olarak inşa edildi,
iki paralel yol değil:** Şartname "Open in Prompt" ve "Save" diye iki ayrı
eylem tarif ediyordu, ama bir Prompt'un (başlık, yazar-görünür açıklama,
içerik türü, etiketler) hiçbiri bir generator çalıştırmasında yok — bu
yüzden "Kaydet" ayrı, doğrudan bir "anlık kaydet" eylemi olarak İNŞA
EDİLMEDİ (bu, aynı sonucu üreten iki farklı kod yolu, iki farklı doğrulama
mantığı anlamına gelirdi). Tek gerçek köprü: "Prompt Olarak Aç" her zaman
gerçek bir `generator_runs` satırı kaydedip (`recordGeneratorRun`)
`CreatePromptForm`'un YENİ `?generatorRun=<runId>` moduna yönlendiriyor —
kullanıcı başlık/açıklamayı ekleyip "Paylaş"a bastığında bu GERÇEK,
kalıcı yayın (bu "Save"in kendisi, ayrı bir eylem değil). `CreatePromptForm`
bu modda: RLS zaten `generator_runs`'ı yalnızca kendi sahibine gösterdiği
için (başkasının runId'siyle URL'i tahmin etmek "bulunamadı"ya düşüyor,
ekstra bir sahiplik kontrolü gerekmiyor), generatorun `GeneratorCategoryTopic`'ini
en yakın gerçek `PromptContentType`'a eşleyip (`contentTypeFromGeneratorCategory`),
başlığı generatorun adından, prompt metnini gerçek üretilen metinden
dolduruyor; yayınlanan promptun `generator_id`/`generator_version_id`/
`generator_run_id` kolonları gerçekten yazılıyor (`createRealPrompt`'un
zaten Bölüm 9.25'ten sonra genişletilmiş `generatedFrom` girdisi). Yeni,
paylaşılan `GeneratorSourceContext` (`post-context.tsx`) her kart tipinde
ve detay sayfasında "Generator ile oluşturuldu — [Başlık]" bağlam kutusunu
gösteriyor — `RemixContext`'in aksine hiçbir ek fetch gerekmiyor,
`generatedFrom` zaten generator başlığı/slug'ını satırın kendisinde
taşıyor. **Negatif prompt için `prompts` tablosunda ayrı bir kolon yok**
(bu migration eklemedi) — bir generatorun negatif prompt çıktısı asla
sessizce atılmıyor ya da tahmin edilerek prompt metnine eklenmiyor,
`NegativePromptReference` bileşeniyle dürüst, salt-okunur, "Kopyala"
butonlu bir referans olarak gösteriliyor, yazar isterse elle kendi prompt
metnine ekliyor.

**Gerçek bir hata, bu görevin kendi testinde yakalanıp düzeltildi —
`?generatorRun=` derin bağlantısı seçim ekranını hiç atlamıyordu:**
`create-gate.tsx`'in `hasIntent` kontrolü yalnızca `remix`/`duplicate`/
`answerRequest`/`edit`/`mode=prompt` biliyordu — yeni `generatorRun`
parametresini HİÇ tanımıyordu, bu yüzden "Prompt Olarak Aç"a tıklayan bir
kullanıcı doğrudan forma değil, boş "Ne oluşturmak istersin?" seçim
ekranına düşüyordu. Düzeltme: `generatorRun` kontrolü eklendi.

**İkinci gerçek hata, aynı testte yakalanıp düzeltildi — başlık bazen
sessizce boş kalıyordu (yarış durumu):** Generator run modunda kaynak
generator (`sourceGenerator`) ve çalıştırma kaydı (`generatorRun`) AYRI
iki `setState` çağrısıyla, aralarında bir `await` ile geliyor —
React'in bu ikisini ayrı render'larda commit etmesi mümkün. Seed-eden
efekt `generatorRun` tek başına set olur olmaz `fieldsSeeded=true`
işaretliyordu (henüz `sourceGenerator` gelmeden) — bu, `sourceGenerator`
bir an sonra GERÇEKTEN gelse bile, efekt "zaten seed edildi" diye bir
daha hiç çalışmadığından başlık alanının SESSİZCE boş kalmasına yol
açıyordu (form yine de submit edilebiliyordu, gerçek bir yarım/eksik
prompt üretebilirdi). Düzeltme: seed koşulu `generatorRun && sourceChecked`
oldu — `sourceChecked`, DİĞER efektin `load()`'ı hem run'ı hem generator'ı
BEKLEDİKTEN sonra true olan tek güvenilir sinyal.

**Discovery + arama + profil entegrasyonu:** `/generators` (yeni keşif
sayfası — arama, kategori filtre çipleri, `fetchTopGenerators`+
`fetchRecentPublishedGenerators` birleşimi — yeni bir generatorun sıfır
kullanımla bile hemen görünür olması için), `search-view.tsx`'e gerçek,
ayrı bir "Generatorlar" sonuç bölümü, `ProfileView`'a gerçek bir
"Generatorlar" sekmesi (RLS zaten sahibine taslakları da, ziyaretçiye
yalnızca yayınlananları veriyor — istemci tarafında ekstra bir filtre
gerekmedi, "Prompt İstekleri" sekmesiyle birebir aynı ilke). Masaüstü
sidebar'a "Generatorlar" linki eklendi (mobil alt navigasyona
EKLENMEDİ — sabit 5 öğe kuralı, CLAUDE.md §5).

**Nasıl doğrulandı:**
- **SQL/RLS** — yukarıda "Yeni migration" altında açıklandı: gerçek yerel
  PostgreSQL 16, 11 senaryo, GERÇEKTEN çalıştırıldı.
- **Saf mantık** — `generator-template.ts`'in tüm fonksiyonları (renderTemplate,
  validateGeneratorForPublish, koşullu görünürlük, vb.) 29 birim testiyle
  (`node --experimental-strip-types`, gerçek kaynak dosyasına karşı)
  doğrulandı.
- **Ağ seviyesinde taklit edilmiş Supabase REST/RPC yanıtlarıyla
  Playwright (bu projenin standart yöntemi), 34 senaryolu tam uçtan uca
  bir akış:** `/generators/create`'de gerçek Detaylar→Alanlar→Şablon→
  Önizleme→Yayınla akışının HER adımı — Detaylar'dan ilerlemenin gerçek
  bir taslak generator + v1 sürümü oluşturduğu; yeni bir kategori/alan
  eklemenin gerçek şemaya yansıdığı; alan etiketinden değişken adının
  doğru türetildiği; şablon bölümüne değişken çipiyle eklenen
  `{{cinsiyet}}` token'ının "bilinmeyen değişken" uyarısı ÜRETMEDİĞİ;
  Önizleme adımında seçilen değerin gerçek üretilmiş prompt metnine
  DOĞRU şekilde yansıdığı; Yayınla'nın gerçek bir yayın tetiklediği ve
  generatorun durumunun gerçekten "published" olduğu; yayın sonrası
  `/generators/local?slug=…`'a yönlendiği; detay sayfasının gerçek
  başlık/açıklama/alanı gösterdiği; SAHİBİNİN kendi generatorunda
  Remixle/Kaydet YERİNE gerçek Düzenle/Sil gördüğü (kendi generatorunu
  kaydetme/remixleme arayüzden yapısal olarak mümkün değil); "Prompt
  Olarak Aç"ın gerçek bir `generator_runs` satırı kaydettiği (seçilen
  değer ve gerçek üretilmiş metinle); `/create?generatorRun=…`'ın doğru
  başlık/prompt metniyle önceden dolduğu; yayınlamanın gerçek `generator_
  id`/`generator_run_id` kolonlarını taşıyan bir INSERT gönderdiği;
  `/generators` keşif sayfasının, aramanın ve profildeki "Generatorlar"
  sekmesinin gerçek generatoru gösterdiği — hepsi sıfır JS hatasıyla,
  YUKARIDAKİ İKİ GERÇEK HATA bu test tarafından yakalanıp düzeltildikten
  SONRA. Ayrıca Supabase'e hiç erişilemezken `/generators`, `/generators/
  create`, `/generators/local?slug=yok` sayfalarının sıfır JS hatasıyla
  zarifçe davrandığı ayrı bir dayanıklılık taramasıyla doğrulandı, ve bu
  oturumun Prompt Değişken Sistemi regresyon paketi (48 senaryo,
  `create-prompt-form.tsx`'e bu görevde eklenen değişikliklerin var olan
  remix/duplicate/answerRequest/edit modlarını bozmadığını kanıtlamak
  için) sıfır regresyonla yeniden çalıştırıldı.
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota — yeni
  `/generators`, `/generators/create`, `/generators/local`) sıfır hatayla
  geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919300000_generators.sql`'i
Dashboard → SQL Editor'de uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **14 alan tipinden 11'i uygulandı** — IMAGE/DATE/RANGE (çift uçlu
  aralık) tipleri eklenmedi; mevcut 11 tip (text/textarea/select/
  multi_select/number/slider/color/checkbox/toggle/radio/url) şartnamenin
  verdiği örnek generatorların (Cinematic Character Generator dahil)
  tamamını zaten karşılıyor.
- **§35 "dependent options" (bir alanın seçenekleri başka bir alanın
  seçimine göre değişmesi) uygulanmadı** — şartname bunu yalnızca
  "şemanın ileride buna izin verecek şekilde tasarlanması" diye koşullu
  istemişti; `GeneratorField`'ın kendi genel, key-bazlı yapısı buna zaten
  açık (yeni bir alan tipi/kolon gerektirmeden bir koşul zinciriyle
  eklenebilir), ama gerçek UI/mantık bu görevde inşa edilmedi.
- **Koşullu alanlar §34 kasıtlı olarak minimal tutuldu:** alan başına TEK
  koşul, yalnızca `equals` — AND/OR zincirleri yok. Genel (herhangi bir
  alan herhangi bir alanı key ile koşullayabiliyor) ama basit.
- **Generator "koleksiyonlar"a değil, ayrı basit `generator_saves`'e
  kaydediliyor** — Bölüm 9.19-9.22'nin prompt koleksiyon sistemine entegre
  edilmedi; bir generator kaydetmenin "hangi koleksiyona" gibi bir
  kavramı yok, şartname de bunu istemedi.
- **Kapak görseli için ayrı bir Storage bucket'ı yok** (yukarıda
  açıklandı) — data URL olarak `cover_url`'e gömülüyor.
- **"Kaydet" (anlık, formsuz publish) ayrı bir eylem olarak yok** —
  yukarıda "Open in Prompt köprüsü" bölümünde gerekçesiyle açıklandı, tek
  gerçek yol "Prompt Olarak Aç" + gerçek CreatePromptForm submit'i.
- **Version geçmişi görüntüleme arayüzü (eski sürümleri listeleme/
  karşılaştırma) bu görevde eklenmedi** — şema (`generator_versions`)
  zaten tam, gerçek geçmiş DB'de duruyor, yalnızca bir "sürüm geçmişi"
  sekmesi/ekranı inşa edilmedi (Bölüm 9.14'ün Prompt Değişken Geçmişi/
  Remix Merge sisteminin generator karşılığı, ayrı bir görev olabilir).
- **Bildirimler yok** — bir generator remixlendiğinde/kaydedildiğinde
  sahibine gerçek bir bildirim üretilmiyor (Bölüm 19'un `notifications`'a
  client insert izni vermeme kararıyla aynı kategoriden — sunucu tarafı
  `SECURITY DEFINER` trigger'lar ayrı bir görev olarak eklenebilir).

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Realtime yok** — bir generatorun `use_count`/`save_count`/`remix_count`'u
  başka bir sekmede/cihazda canlı güncellenmiyor, yalnızca sayfa yeniden
  ziyaret edildiğinde doğru (bu projenin genelinde bilinen "Realtime yok"
  kategorisiyle aynı).
- **N+1 yok ama toplu/sayfalanmış generator listeleme yok** — `/generators`
  ve profildeki "Generatorlar" sekmesi son ~60 kayıtla sınırlı (bu
  projenin zaten bilinen "tam sayfalama yok" sınırlamasıyla aynı
  kategoriden).
- **Arama basit bir `ilike` alt-dize eşleşmesi** — `searchPrompts`/
  `searchGenerators` aynı, sınırlı yaklaşımı paylaşıyor.

---
