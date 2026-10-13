### 9.29 Generator: şablon adımının kaldırılması — prompt artık kullanıcının kendi girdisi

Kullanıcının açık, mimari bir talebi üzerine: "Generator oluşturma/
düzenleme ekranında şablon seçeneğini kaldır — çünkü generatoru YAPAN değil
KULLANAN kişi bunu kullanacak." Bölüm 9.27/9.28'in kurduğu `{{variable}}`
Prompt Template Engine'i (generatoru oluşturan kişinin kendi elleriyle bir
prompt şablonu yazması) tamamen builder'dan kaldırıldı — bu sorumluluk artık
generatoru ÇALIŞTIRAN kişiye ait: runtime formunun en üstünde, tüm kategori/
alanlardan ÖNCE, gerçek, düz "Prompt" ve "Negative Prompt" metin kutuları
var; buraya yazılan metin JSON çıktısına **birebir, hiçbir render/
substitution olmadan** yazılıyor. Kullanıcının kendi verdiği örnek — Prompt
kutusuna "Güneşli bir günde kadın oturuyor" yazınca çıktıda `"prompt":
"Güneşli bir günde kadın oturuyor"`, Negative Prompt kutusuna "sandalye
yok" yazınca `"negative_prompt": "sandalye yok"` — tam olarak bu şekilde
çalışıyor (anahtar adı `negative_prompt`, mevcut alt çizgili konvansiyonla
tutarlı — kullanıcının örneğindeki tire yalnızca gündelik yazım, `prompt`
anahtarıyla tutarlılık için değiştirilmedi).

**Ne kaldırıldı, ne korundu:**
- Builder'ın adım sekmesi dörde indi: **Detaylar → Alanlar → Önizleme →
  Yayınla** — "Şablon" adımı ve onun `TemplateEditor` bileşeni tamamen
  kaldırıldı (`template-editor.tsx` dosyası silindi — hiçbir yerden
  çağrılmayan gerçek ölü kod hâline geldiğinden, CLAUDE.md'nin "kullanılmayan
  kodu tut" değil "eminsen tamamen sil" kuralına uyularak).
- `src/lib/generator-template.ts`'ten şablon motoruna özgü fonksiyonlar
  silindi: `renderTemplate`, `renderTemplateSection`, `isNegativeSection`,
  `extractTemplateVariables`, `extractVariablesFromText`,
  `countKeyUsageInTemplate`, artı yalnızca bunların kullandığı `joinList`/
  `stringifyValue`/`TOKEN_PATTERN` yardımcıları. `isFieldVisible`,
  `defaultValuesFromSchema`, `slugifyGeneratorTitle`,
  `makeFieldKeyFromLabel`, `isConditionSatisfiable`, `fieldsInCategory`
  (şemayla ilgili, şablonla hiç ilgisi olmayan fonksiyonlar) DEĞİŞMEDİ.
- **Kritik, gerçek bir hata önceden tespit edilip düzeltildi:**
  `validateGeneratorForPublish`'in "Prompt template boş olamaz — en az bir
  aktif bölüm dolu olmalı" bloke edici hatası, şablon düzenleme arayüzü
  kaldırıldıktan SONRA bile fonksiyonda kalsaydı, HER generator sonsuza
  dek yayınlanamaz hâle gelirdi (yeni oluşturulan her taslağın şablonu
  zaten hep boş kalacaktı, düzenleyecek arayüz yok). Bu kontrol (ve
  yanındaki artık anlamsız kalan "bilinmeyen `{{token}}`" hata kontrolü)
  tamamen kaldırıldı — kod hiç çalıştırılıp gerçek bir yayın denemesi
  yapılmadan, statik inceleme sırasında önceden fark edilip önlendi.
- `field-list.tsx`'in `template` prop'u ve buna bağlı "bu alan şablonda N
  yerde kullanılıyor, silersen yayınlama sırasında hata gösterilir" silme
  uyarısı kaldırıldı — artık her zaman yanlış/anlamsız olacaktı (kullanım
  her zaman 0, ve mesajın kendisi artık var olmayan bir yayın kuralına
  atıfta bulunuyordu).
- `src/lib/generator-output.ts`'in `buildGeneratorOutput()` imzası
  değişti: `(schema, template, values, enableNegativePrompt)` yerine
  `(schema, values, promptText, negativePromptText, enableNegativePrompt)`
  — `renderTemplate`/`isNegativeSection` çağrıları tamamen kaldırıldı,
  `output.prompt`/`output.negative_prompt` artık doğrudan (yalnızca
  `trim()`lenerek) `promptText`/`negativePromptText`'ten yazılıyor. Alan→
  jsonPath eşleme mantığı (Bölüm 9.28'in JSON Output Engine'i) hiç
  değişmedi — yalnızca `prompt`/`negative_prompt` iki anahtarının
  KAYNAĞI değişti, geri kalan yapılandırılmış JSON üretimi (nested
  objects/arrays, alan tipi coercion, çakışma tespiti) birebir aynı.
  Ayrılmış `prompt`/`negative_prompt` anahtarlarının bir alanın kendi
  jsonPath'iyle çakışsa bile HER ZAMAN kazanması kuralı (Bölüm 9.28)
  DEĞİŞMEDİ — artık "template render sonucu" yerine "runtime kullanıcının
  kendi yazdığı metin" kazanıyor, ama kazanma kuralının kendisi aynı.
- `GeneratorPlayground` (`generator-playground.tsx`, hem builder'ın Canlı
  Önizleme'si hem gerçek public runtime sayfası tarafından paylaşılan TEK
  bileşen, CLAUDE.md §12/§13) artık `template` prop'u almıyor; yeni
  `promptText`/`negativePromptText` state'i ve Form sekmesinin EN ÜSTÜNDE,
  şemanın kategorize edilmiş alanlarından ÖNCE render edilen bir "Prompt"
  kutulu bölüm (kullanıcının açık talebiyle birebir örtüşüyor: "seçim
  alanlarının en üstünde ... Prompt başlığı ... altında prompt alanı ve
  negative prompt alanı, daha sonra diğer kategori ve alanlar"). Negative
  Prompt kutusu yalnızca `enableNegativePrompt` açıksa render ediliyor —
  Bölüm 9.27'nin kurduğu, generatorun kendi ayarındaki mevcut toggle'la
  aynı kural. "Varsayılanlara dön" artık bu iki metin alanını da
  temizliyor (alan değerleriyle aynı reset akışının parçası).
- `generator-builder.tsx`: `template`/`setTemplate` state'i BİLİNÇLİ
  OLARAK korundu (UI'da hiç gösterilmiyor/düzenlenmiyor) — yalnızca
  `saveDraftVersionContent`/`publishGenerator`/`remixGenerator`'ın (DB
  katmanı, `src/lib/supabase/generators.ts`, bu görevde HİÇ değişmedi —
  yeni bir migration da gerekmedi) mevcut imzalarıyla round-trip uyumu
  için; yeni bir generator her zaman tek, boş, hiç render edilmeyen bir
  placeholder şablon (`defaultTemplate()`) taşıyor, önceden oluşturulmuş
  bir generatorun DB'de zaten var olan şablon içeriği de sessizce
  korunuyor (üzerine boş bir değerle yazılmıyor).
- `generator-detail-view.tsx`'in gerçek runtime sayfasındaki
  `<GeneratorPlayground>` çağrısından da `template={version.template}`
  prop'u kaldırıldı. "Prompt Olarak Aç" butonunun `disabled={isOpeningPrompt
  || !state.prompt.trim()}` koşulu (Bölüm 9.27'den beri zaten vardı,
  değişmedi) artık doğal olarak "kullanıcı gerçekten bir prompt yazana
  kadar buton pasif kalsın" kuralını da karşılıyor — ekstra bir kod
  eklenmedi, var olan koşul zaten yeterliydi.

**Nasıl doğrulandı:**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
  değişmedi) sıfır hatayla geçti.
- Saf mantık birim testi (`node --experimental-strip-types`, gerçek
  `generator-output.ts`'e karşı) — 38 assertion, yeni imzaya göre
  güncellenip yeniden çalıştırıldı: nested/flat/multi_select alan
  eşlemesi hiç bozulmadı; `prompt`/`negative_prompt`'un artık template
  render SONUCU değil, doğrudan geçirilen metnin `trim()`lenmiş hâli
  olduğu; kullanıcının kendi worked example'ı (`"Güneşli bir günde kadın
  oturuyor"`/`"sandalye yok"`) birebir doğrulandı; ayrılmış `prompt`
  anahtarının çakışan bir alan jsonPath'ine karşı hâlâ kazandığı; tamamen
  farklı, creator-tanımlı bir şekilin (product/brand) hâlâ sıfır kod
  değişikliğiyle çalıştığı.
- Ağ seviyesinde taklit edilmiş Supabase REST/RPC yanıtlarıyla
  Playwright'ta (statik export `npx serve` ile, bu projenin standart
  yöntemi) Bölüm 9.27/9.28'in İKİ mevcut test paketi (43 + 18 = 61
  senaryo) yeni akışa göre güncellenip YENİDEN çalıştırıldı, hepsi geçti:
  builder'ın hiçbir adımında artık "Şablon" sekmesinin bulunmadığı (hem
  `role=tab` sayımıyla hem doğrudan görünürlük kontrolüyle); Önizleme
  adımının Form sekmesinde gerçek `#gen-run-prompt`/`#gen-run-negative-
  prompt` alanlarının göründüğü ve bunlara yazılan metnin JSON/Prompt
  sekmelerine birebir, hiçbir dönüşüm olmadan yansıdığı; gerçek runtime
  sayfasında (`/generators/local`) "Prompt Olarak Aç" butonunun kullanıcı
  hiçbir şey yazmadan DEVRE DIŞI kaldığı, gerçek metin yazılınca aktifleşip
  gerçek bir `generator_runs` satırına o metni kaydettiği; `?generatorRun=`
  köprüsünün `CreatePromptForm`'u hâlâ doğru başlık/prompt metniyle
  doldurduğu; publish-time jsonPath çakışma uyarısının (Bölüm 9.28'in
  Output Mapping doğrulaması) hâlâ doğru çalıştığı, `{{cinsiyet}}` gibi
  bir değişken chip'inin ARTIK hiçbir yerde render edilmediği — hepsi
  sıfır JS hatasıyla (WebSocket bağlantı denemesi konsol hataları hariç,
  bu sandbox'ın standart, Bölüm 21 Faz C'den beri bilinen ağ kısıtı).
- Bu oturumun ilgisiz regresyon paketleri (`resilience-test.mjs` 14/14,
  `prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs`
  19/19, `save-flow-e2e-test.mjs` 14/14, `smart-tags-e2e-test.mjs`
  30/30) sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/TypeScript katmanında, `20260919300000_generators.sql`
şeması hiç değişmedi), kullanıcının Dashboard'da yapması gereken ekstra
bir adım yok; yalnızca canlı sitede gerçek bir generator oluşturup yeni
Prompt/Negative Prompt akışını bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Önceden (Bölüm 9.27/9.28 sırasında) yayınlanmış bir generatorun DB'de
  zaten var olan şablon içeriği silinmedi/temizlenmedi** — yalnızca artık
  hiçbir kod yolu onu okumuyor/render etmiyor (`prompt`/`negative_prompt`
  artık her zaman runtime kullanıcının girdisinden geliyor). Bu, veri
  kaybı riskini almamak için bilinçli bir seçim — `generator_versions.
  template` sütununun kendisi şemadan hiç kaldırılmadı, yalnızca frontend
  onu artık okumuyor.
- **Runtime kullanıcının yazdığı Prompt/Negative Prompt metni
  `generator_runs` dışında ayrıca kalıcı hale getirilmedi** (ör. "bu
  generator + bu prompt kombinasyonunu kaydet" gibi bir kısayol) —
  şartname böyle bir şey istemedi, mevcut "Prompt Olarak Aç" akışı zaten
  gerçek, kalıcı bir `generator_runs` satırı + oradan gerçek bir Prompt
  yayınlıyor (Bölüm 9.27).
- **Şablon motorunun kendisi silinirken `GeneratorTemplate`/
  `GeneratorTemplateSection` TypeScript tipleri KORUNDU** — `src/lib/
  supabase/generators.ts`'in DB katmanı (`saveDraftVersionContent`/
  `publishGenerator`/`remixGenerator`, hiçbiri bu görevde değişmedi) hâlâ
  bu tipleri kullanıyor; yalnızca onu ÜRETEN/OKUYAN UI katmanı
  (`TemplateEditor`, `renderTemplate` ailesi) kaldırıldı.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **`generator_runs.generated_prompt`/`generated_negative_prompt` artık
  her zaman runtime kullanıcının kendi serbest metni** — Bölüm 9.28'in
  "structured JSON tek kaynak" ilkesi hâlâ geçerli (Form/JSON/Prompt
  sekmelerinin üçü de aynı `buildGeneratorOutput()` çağrısından türüyor),
  ama artık `prompt`/`negative_prompt`'un KENDİSİ şemadaki hiçbir alana
  bağlı/türetilmiş değil — bu, kullanıcının açıkça istediği mimari
  değişimin doğal, kasıtlı sonucu, bir sınırlama değil.

---
