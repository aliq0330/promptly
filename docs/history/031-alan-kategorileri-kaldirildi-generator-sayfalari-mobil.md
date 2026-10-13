### 9.31 Alan kategorileri kaldırıldı + Generator sayfaları mobil/tablet/PC yeniden tasarım

Kullanıcının, `/generators/create`'in "Alanlar" adımındaki "KATEGORİLER"
bölümünü (sol sütun — "Genel (0)"/"Diğer (1)" gibi kategori düğmeleri +
"+ Kategori ekle") işaretli bir ekran görüntüsüyle gönderdiği açık isteği
üzerine — kullanıcının kendi sözleriyle "şuan işe yaramıyor manasız"
(şu an çalışmıyor, anlamsız) — bu bölüm ve ilgili her şey kaldırıldı, artı
`/generators` ve `/generators/create` sayfaları mobil/tablet/masaüstü için
daha anlaşılır, sitenin Lavender Studio renk diline daha uygun bir
düzenle yeniden tasarlandı.

**Önce üç ayrı "kategori" kavramı birbirinden ayrıldı (kod yazılmadan
önce, karışıklığı önlemek için):**
1. **Kaldırılan gerçek hedef — alan-organizasyonu kategorileri**
   (`GeneratorCategory`/`schema.categories`/`GeneratorField.categoryId`,
   `category-manager.tsx`, `UNCATEGORIZED_CATEGORY_ID`) — kullanıcının
   işaretlediği tam olarak buydu.
2. **Dokunulmayan, ilgisiz — generatorun kendi keşif konusu**
   (`GeneratorCategoryTopic`: görsel/metin/video/ses/kod/tasarım/
   pazarlama/yazarlık/diğer — Detaylar adımında `generator-details-
   form.tsx`'te seçiliyor, `/generators`'ın filtre çiplerini ve
   `create-prompt-form.tsx`'in `contentTypeFromGeneratorCategory`'sini
   besliyor). Kullanıcının şikayeti bu değildi, hiç değiştirilmedi.
3. **Dokunulmayan, ilgisiz — hazır alan kütüphanesinin kendi gezinme
   taksonomisi** (Bölüm 9.30'un `CATALOG_CATEGORIES`/`CatalogField.
   categoryId`, `generator-field-catalog.ts`/`field-catalog-picker.tsx`)
   — bir generatorun ŞEMASINDAKİ kategorilerden yapısal olarak tamamen
   ayrı, statik bir kütüphane gezinme aracı. Hiç değiştirilmedi.

**Kaldırılanlar (Bölüm 1 — kategori sistemi):**
- `src/features/generators/category-manager.tsx` dosyası tamamen silindi.
- `src/types/index.ts`: `GeneratorCategory` arayüzü tamamen kaldırıldı;
  `GeneratorField.categoryId` kaldırıldı; `GeneratorSchema` artık yalnızca
  `{ fields: GeneratorField[] }` (`categories` alanı kaldırıldı). Hiçbir DB
  migration'ı gerekmedi — Bölüm 9.28/9.29'da olduğu gibi, şema şekli
  yalnızca `generator_versions.schema` JSONB kolonunda yaşıyor; eski bir
  generator satırının JSONB'sinde kalmış olabilecek `categories`/
  `categoryId` anahtarları zararsız (JS fazladan nesne alanlarını
  yoksayar, hiçbir kod artık onları okumuyor).
- `src/lib/generator-template.ts`: `fieldsInCategory()` kaldırıldı (dosyanın
  geri kalanı — `isFieldVisible`, `defaultValuesFromSchema`,
  `validateGeneratorForPublish`, `slugifyGeneratorTitle`,
  `makeFieldKeyFromLabel`, `isConditionSatisfiable` — hiç değişmedi,
  kategoriyle hiç ilgileri yoktu).
- `src/lib/supabase/generators.ts`: `emptyGeneratorSchema()` artık
  `{ fields: [] }` döndürüyor.
- `field-editor-modal.tsx`: `categories`/`activeCategoryId` prop'ları ve
  "Kategori" `<select>`'i tamamen kaldırıldı; `emptyField()` artık
  `categoryId` parametresi almıyor/yazmıyor; "Field Type" seçici artık tek
  başına tam genişlikte (eskiden "Kategori" ile aynı `grid-cols-2`
  satırındaydı).
- `generator-runtime-form.tsx`: kategoriye göre gruplanmış render
  (`sortedCategories`/`uncategorized` iki ayrı blok + başlıklar) yerine
  artık düz, `order`'a göre sıralanmış, tek bir alan listesi — hem
  builder'ın Canlı Önizleme'sinde hem gerçek public runtime sayfasında
  (ikisi de bu tek bileşeni paylaşıyor, CLAUDE.md §12/§13) aynı.
- `generator-builder.tsx`: `CategoryManager`/`UNCATEGORIZED_CATEGORY_ID`
  import'u ve TÜM kategori state/handler'ları
  (`activeCategoryId`, `handleAddCategory`, `handleRenameCategory`,
  `handleDeleteCategory`, `handleReorderCategories`) tamamen kaldırıldı;
  `defaultSchema()` artık `{ fields: [] }`; mevcut-generator-yükleme
  efektinin seed mantığı, `handleSaveField`/`handleDuplicateField`/
  `handleInsertCatalogFields`'ın sıra (order) hesaplaması artık
  kategori-başına değil, şema-geneli (global); `visibleFields` artık
  basitçe `schema.fields`'in `order`'a göre sıralanmış hâli (hiçbir
  filtre yok); Yayınla adımının özet metni artık yalnızca "N alan"
  gösteriyor ("N kategori · N alan" değil); `<FieldEditorModal>`
  çağrısından `categories`/`activeCategoryId` prop'ları kaldırıldı.

**Yeniden tasarım (Bölüm 2 — mobil/tablet/PC, marka diline uygun):**
- **"Alanlar" adımı artık 3 sütun değil, 2 sütun** (`grid-cols-[200px_
  1fr_360px]` → `lg:grid-cols-[1fr_360px]`) — sol kategori sütunu
  kalktığından doğal olarak sadeleşti; `lg` altında (mobil/tablet) tek
  sütun olarak dikey akıyor (alan listesi üstte, Canlı Önizleme altta),
  `lg`'de sağda `sticky` bir önizleme paneli. Hem alan listesi hem
  önizleme artık kendi `rounded-lg border border-border bg-surface`
  kartlarının içinde (bu projenin `CreatePromptForm`/`generator-details-
  form.tsx`'in "Ayarlar" kutusu gibi zaten kurulu kart dilini
  paylaşıyor) — önceden çıplak sütunlardı, artık görsel olarak net
  şekilde ayrılmış, kartlı bölümler.
- **Adım sekmeleri (Detaylar/Alanlar/Önizleme/Yayınla) artık numaralı,
  dairesel rozetli** (`1`/`2`/`3`/`4`, aktifken `bg-primary`, pasifken
  `bg-accent-surface`) — "daha anlaşılır" isteğinin doğrudan karşılığı:
  kullanıcı hangi adımda olduğunu ve kaç adım kaldığını tek bakışta
  görüyor. Sekme satırı `overflow-x-auto` ile mobilde yatay kaydırmaya
  açık (dar ekranlarda taşma yerine kaydırma).
- **Üst başlık satırı artık kendi kartında** (`rounded-lg border
  border-border bg-surface`) — önceden sayfanın çıplak arka planına
  oturuyordu, artık diğer sayfalardaki (istek/profil) başlık kartlarıyla
  tutarlı bir çerçevesi var.
- **Detaylar ve Önizleme adımları da artık kart içinde** (`rounded-lg
  border border-border bg-surface p-4 sm:p-5`) — üç adımın da (Detaylar/
  Alanlar/Önizleme) aynı kart dili, tutarlı bir görsel ritim.
- **`generator-details-form.tsx`'teki Kategori/Alt kategori satırı**
  artık `grid-cols-2` yerine `grid-cols-1 sm:grid-cols-2` — dar
  telefonlarda iki dar sütun yerine tek, okunaklı sütun, `sm`'den
  itibaren yan yana.
- **`/generators` (keşif sayfası):** başlık artık `bg-accent-surface`
  (CLAUDE.md §4'ün "gereksiz gradient kullanılmaz" kuralına bilinçli
  olarak uyarak DÜZ bir lavanta ton — ilk denemede gradient denendi,
  tasarım kuralına aykırı olduğu fark edilip düzeltildi), kendi kartı
  içinde; kategori filtre çipleri artık mobilde `overflow-x-auto` ile
  yatay kaydırılabilir (önceden yalnızca `flex-wrap` — dar ekranda çok
  satıra yayılıyordu); sonuç grid'i `sm:grid-cols-2 xl:grid-cols-3`
  yerine `sm:grid-cols-2 lg:grid-cols-3` oldu — önceden bir tabletin/orta
  boy masaüstünün (1024–1279px) yalnızca 2 sütun görmesine neden olan
  `xl` eşiği `lg`'ye çekilerek tablet/PC'de daha dolu, daha iyi
  kullanılan bir düzen sağlandı (bu, kullanıcının özellikle istediği
  "tablet için daha iyi bir düzen" kısmının somut karşılığı); boş sonuç
  mesajı artık `rounded-lg border-dashed` bir kutu içinde (çıplak bir
  paragraf yerine, sitenin diğer boş-durum kutularıyla tutarlı).
  `GeneratorCard` zaten sitenin kart diliyle (rounded-lg + hover:shadow-
  md, `RequestCard`'ın kullandığı BİREBİR AYNI desen) tutarlıydı,
  değiştirilmedi.
- `field-list.tsx`: doküman yorumu ve boş-durum metni artık "kategori"ye
  referans vermiyor ("Bu kategoride henüz hiç alan yok" → "Bu
  generatorda henüz hiç alan yok"), boş durumun görsel çerçevesi
  `bg-accent-surface/40` ile hafif vurgulandı.
- `generator-details-form.tsx`/`generator-playground.tsx`'teki iki doküman
  yorumu, artık var olmayan "adım 2'nin kategorileri"ne/"kategorize
  edilmiş alanlar"a referans vermeyecek şekilde güncellendi (davranış
  değişikliği değil, yalnızca kod içi Türkçe/İngilizce açıklama metni).
- **Bilinçli olarak dokunulmayan sayfa:** `/generators/local` (generator
  detay + runtime sayfası, `generator-detail-view.tsx`) — kullanıcının
  isteği yalnızca `/generators` ve `/generators/create`'i adlandırdı; bu
  sayfa zaten `max-w-3xl` + `flex-wrap` ile responsive ve kategori
  sistemine hiç bağlı değildi, kapsam dışı bırakıldı.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (25 rota, değişmedi) sıfır hatayla geçti. Statik export `npx
serve` ile (GitHub Pages basePath'ini taklit eden `serve-root/promptly
→ out/` symlink düzeniyle) yerel olarak sunulup, ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta (bu projenin
standart yöntemi) doğrulandı:
- Bölüm 9.27'nin mevcut 44 senaryolu `generators-e2e-test.mjs`'i,
  kaldırılan kategori adımı yerine "Fields step'te artık hiçbir 'Kategori
  ekle' kontrolü yok" (gerçek bir yokluk kontrolü) doğrulayacak şekilde
  güncellenip yeniden çalıştırıldı — 44/44 geçti (uçtan uca akışın tamamı:
  taslak oluşturma, alan ekleme, canlı önizleme, yayınlama, "Prompt
  Olarak Aç" köprüsü, keşif/arama/profil entegrasyonu — hiçbiri
  bozulmadı).
- Bölüm 9.28'in 18 senaryolu `generator-json-output-test.mjs`'i (JSON
  Output Engine — kategori sisteminden hiç etkilenmiyordu) sıfır
  değişiklikle yeniden çalıştırıldı — 18/18 geçti.
- Bölüm 9.30'un 26 senaryolu `generator-catalog-test.mjs`'i (hazır alan
  kütüphanesi seçicisi) çalıştırıldı; tek bir test asersiyonu güncellendi
  — "boş alan listesi" metnini artık hem `FieldList`'in KENDİ boş
  durumunun hem `GeneratorRuntimeForm`'un (canlı önizleme, alan yokken
  aynı metni gösteriyor) paylaştığını yansıtacak şekilde (tam bir eşleşme
  yerine "en az bir eşleşme" kontrolüne çevrildi — bu bir davranış
  regresyonu değil, iki bağımsız bileşenin artık gerçekten aynı, doğru
  metni paylaşmasının doğal sonucu) — 26/26 geçti.
- İlgisiz regresyon paketleri (`resilience-test.mjs` 14/14,
  `prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs`
  19/19, `save-flow-e2e-test.mjs` 14/14, `smart-tags-e2e-test.mjs`
  30/30) sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/TypeScript katmanında), kullanıcının Dashboard'da
yapması gereken ekstra bir adım yok; yalnızca canlı sitede yeni "Alanlar"
adımını ve `/generators` sayfasının yeni düzenini bizzat denemesi
gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`GeneratorCategoryTopic` (generatorun kendi keşif konusu) ve hazır
  alan kütüphanesinin kendi gezinme kategorileri hiç değiştirilmedi**
  (yukarıda "üç ayrı kategori kavramı" altında açıklandı) — kullanıcının
  işaretlediği ekran görüntüsü yalnızca alan-organizasyonu kategorilerini
  gösteriyordu.
- **Alanların artık bir "grup/bölüm" altında gösterilmesi için yeni bir
  sistem İCAT EDİLMEDİ** — kullanıcı kategorileri "kaldır" dedi, yerine
  başka bir gruplama mekanizması istemedi; alan listesi artık bilinçli
  olarak düz.
- **`/generators/local` (runtime/detay sayfası) redesign kapsamına
  alınmadı** (yukarıda açıklandı) — kullanıcının isteği yalnızca iki
  sayfayı adlandırdı, bu sayfa zaten kategori sisteminden bağımsızdı ve
  zaten responsive'di.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Gerçek bir mobil/tablet cihazda (fiziksel dokunma, gerçek viewport)
  hiç denenmedi** — yalnızca Playwright'ın simüle ettiği viewport
  genişlikleri ve DOM/CSS sınıfları doğrulandı (Bölüm 9.11/9.13'ün de
  belirttiği aynı donanım-erişimi sınırı).
- **Önceden oluşturulmuş, kategori içeren bir generator taslağının**
  (bu değişiklikten ÖNCE kaydedilmiş, `schema.categories` dolu bir
  `generator_versions` satırı) düzenleme ekranına yüklendiğinde, artık
  hiçbir kod bu `categories` alanını okumadığından alanlar sorunsuz, düz
  bir liste olarak görünmeye devam edecek — veri kaybı yok, yalnızca
  artık kullanılmayan bir alan JSONB'de sessizce kalıyor (aynı Bölüm
  9.29'un şablon içeriği için yaptığı seçim).
