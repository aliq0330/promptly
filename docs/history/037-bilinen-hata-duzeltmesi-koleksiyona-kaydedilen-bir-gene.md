### 9.37 Bilinen hata düzeltmesi: koleksiyona kaydedilen bir generator kart olarak hiç görünmüyordu

Kullanıcının bildirdiği gerçek bir hata: bir generator gerçekten bir
koleksiyona kaydedildiğinde (Bölüm 9.36'nın widen ettiği çok-koleksiyonlu
kaydetme akışıyla) koleksiyonun kendi `item_count`'u doğru şekilde arttı
("1 çalışma" gösteriyordu), ama koleksiyon detay sayfasını açınca kartın
kendisi hiç görünmüyordu — alan tamamen boştu.

**Kök neden:** `src/lib/supabase/collections.ts`'teki `fetchCollectionItems`
(Bölüm 9.19'dan beri var olan, koleksiyonun içeriğini çeken fonksiyon)
Bölüm 9.36'nın `collection_items` tablosuna eklediği `generator_id`
sütunundan HİÇ haberdar değildi — sorgusu yalnızca
`prompts ( ${PROMPT_SELECT} )` embed'ini seçiyordu. `generator_id` dolu,
`prompt_id` boş bir satırda PostgREST bu embed'i `prompts: null` olarak
döndürüyor, ve fonksiyonun kendi filtresi (`.filter((row) =>
Boolean(row.prompts) && !row.prompts.deleted_at)`) bu satırı sessizce
elenmiş sayıyordu — sonuç: fonksiyon boş bir dizi döndürüyordu, ama
`item_count`'un kendisi ayrı bir denormalize sayaç kolonundan
(`handle_collection_item_change` trigger'ı, Bölüm 9.19) geldiğinden ve bu
trigger hedefin türünden bağımsız her satırı saydığından, sayaç doğru
kalmaya devam ediyordu — tam olarak kullanıcının tarif ettiği "1 item
diyor ama içi boş" çelişkisi. Bölüm 9.36'nın "Kaydedilen bir generator"a
(save/collection reuse) odaklanan geniş pass'i bu TEK okuma fonksiyonunu
widen etmeyi atlamıştı.

**İkinci, ilişkili bir gerçek hata — aynı denetimde bulundu:** `PostHeader`
(`src/features/prompts/post-header.tsx`), `collectionRemoval` prop'unu
yalnızca `prompt` dalında `PostMenu`'ye geçiriyordu; `generator` dalında bu
prop hiç iletilmiyordu. Bu yüzden bir generator kartı (fix'ten sonra bile)
koleksiyon içinde göründüğünde üç-nokta menüsünde "Koleksiyondan kaldır"/
"Kaydedilenlerden kaldır" seçeneği hiç görünmeyecekti — `GeneratorCard`'ın
kendisi de bu prop'u hiç almıyordu (yeni eklendi).

**Düzeltme (dört dosya, migration gerekmedi — `collection_items.generator_id`
zaten Bölüm 9.35'ten beri gerçek ve doğru):**
- `src/lib/supabase/collections.ts`:
  - Yeni `CollectionEntry = { type: "prompt"; data: Prompt } | { type:
    "generator"; data: Generator }` — mixed feed'in zaten kullandığı
    `FeedItem` (`src/features/feed/types.ts`) desenini birebir izliyor,
    yeni bir şekil icat edilmedi.
  - `fetchCollectionItems` artık `prompts ( ${PROMPT_SELECT} ), generators
    ( ${GENERATOR_SELECT} )` ikisini birden tek sorguda seçip
    `CollectionEntry[]` döndürüyor — hangi embed doluysa o türe map
    ediliyor (ikisi asla aynı anda dolu olamaz, `collection_items_exactly_
    one_target` CHECK kısıtı zaten bunu garanti ediyor, Bölüm 9.36).
  - `fetchCovers` de aynı sebeple genişletildi: bir koleksiyonun en son
    eklenen öğesi bir generatorsa artık onun kendi `cover_url`'i (Bölüm
    9.27'nin data-URL kapak alanı) kapak olarak kullanılıyor — önceden
    yalnızca `prompts.prompt_media` embed'ine bakıyordu, bir generator'ın
    hiç `prompt_media`'sı olmadığından bu durumda kapak her zaman boş
    kalıyordu (ayrıca kozmetik bir eksiklik, ana rapor edilen hatanın bir
    parçası değil ama aynı kök nedenin doğal bir uzantısı).
- `src/features/prompts/post-header.tsx`: `collectionRemoval` artık
  generator dalında da `PostMenu`'ye geçiriliyor.
- `src/features/generators/generator-card.tsx`: yeni, opsiyonel
  `collectionRemoval` prop'u eklendi, `PostHeader`'a iletiliyor —
  `PromptCard`'ın zaten kabul ettiği prop'un birebir generator karşılığı.
- `src/features/collections/collection-detail-view.tsx`: `items` state'i
  artık `CollectionEntry[]`; `handleRemoveItem` bir `contentType` parametresi
  alacak şekilde genişledi (`removeFromCollection`/`removeFromSavedEverywhere`
  zaten Bölüm 9.36'dan beri bu parametreyi kabul ediyordu, yalnızca burası
  hiç geçirmiyordu); grid render'ı artık her satırın `type`'ına göre
  `PromptCard` ya da `GeneratorCard`'ı seçiyor — `PromptGrid`'in kendisi
  (yalnızca TEK bir içerik türü kabul ediyor, Bölüm 9.36) burada
  KULLANILMADI, çünkü bir koleksiyon aynı anda hem prompt hem generator
  içerebiliyor; bunun yerine `PromptGrid`'in zaten kullandığı aynı masonry
  class'ları (`columns-1 gap-4 sm:columns-2 xl:columns-3` + her öğe
  `break-inside-avoid`) burada doğrudan, mixed-render map'inin içinde
  yeniden kullanıldı — masonry tekrarlanmadı, yalnızca dispatch mantığı
  eklendi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (25 rota, değişmedi — bu görev hiçbir yeni route/migration
içermiyor, tamamen mevcut fonksiyonların/bileşenlerin genişletilmesi) sıfır
hatayla geçti. Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
Playwright'ta (statik export `npx serve` ile, bu projenin standart
yöntemi) yeni, kullanıcının tam raporladığı senaryoyu birebir modelleyen
13 senaryolu bir pakette (hem bir prompt HEM bir generator içeren gerçek
bir koleksiyon) hepsi sıfır JS hatasıyla doğrulandı: koleksiyon başlığının
gerçek `item_count`'u (2 çalışma) gösterdiği; hem prompt kartının HEM
**generator kartının GERÇEKTEN render edildiği** (raporlanan hatanın
doğrudan kanıtı); generator kartının kendi gerçek "Generator" rozetini
gösterdiği (boş bir kart değil); her iki kartın da kendi çalışan 3-nokta
menüsüne sahip olduğu; generator kartının menüsünün "Koleksiyondan
kaldır"ı GERÇEKTEN gösterdiği (ikinci bulunan hatanın kanıtı —
`collectionRemoval`'ın artık generator dalına da ulaştığı); kaldırmanın
gerçek bir DELETE tetikleyip generator kartını anında kaldırdığı, prompt
kartına hiç dokunmadığı; sayfa yenilenince kaldırmanın kalıcı kaldığı
(gerçek backend silme, yalnızca yerel state değil). Ayrıca ilgili tüm
regresyon paketleri sıfır regresyonla yeniden çalıştırıldı:
`collections-e2e-test.mjs` (19/19 — varsayılan/özel koleksiyon kaldırma,
kaskad, yeniden adlandırma), `save-flow-e2e-test.mjs` (14/14 — bookmark
toggle, kaskad kaldırma), `generator-social-test.mjs` (25/25 — beğeni/
yorum/kaydetme/PostMenu), `generator-prompt-parity-test.mjs` (20/20 —
card shell/grid/local sayfa/remix haritası pariteleri),
`prompt-social-regression-test.mjs` (9/9 — düz bir promptun beğeni/yorum/
menü davranışının `contentType` genişlemesinden hiç etkilenmediği), ve
19 (burada 14) rotalık genel Supabase-tamamen-erişilemez dayanıklılık
taraması (sıfır JS hatası).

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(mevcut `20260919310000_generator_social_integration.sql`'in zaten
sağladığı `collection_items.generator_id` üzerine kurulu, tamamen
frontend katmanında), kullanıcının Dashboard'da yapması gereken ekstra
bir adım yok; yalnızca canlı sitede bir generatoru bir koleksiyona
kaydedip artık kart olarak göründüğünü bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`PromptGrid`'in kendisi mixed-content kabul edecek şekilde
  genişletilmedi** — bilinçli bir karar: `PromptGrid` bugün uygulamanın
  başka HİÇBİR yerinde (feed, keşif, profil, remix listesi) mixed bir
  prompt+generator listesi render etmiyor, yalnızca koleksiyon detayı bu
  ihtiyacı duyuyor; `PromptGrid`'in imzasını "ya biri ya diğeri" (Bölüm
  9.36) yerine union bir mixed dizi de kabul edecek şekilde genişletmek,
  bu TEK çağrı yerinin ihtiyacı için bileşenin genel sözleşmesini
  karmaşıklaştırırdı — bunun yerine masonry class'ları doğrudan
  `CollectionDetailView`'da (zaten kendi custom render'ını yapıyordu,
  `PromptGrid`'i hiç kullanmıyordu) yeniden kullanıldı.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **`fetchCovers`'ın generator-kapak fallback'i yalnızca en son eklenen
  öğe bir generatorSA devreye giriyor** (prompt'un kendi `prompt_media`
  önceliği hiç değişmedi) — bir koleksiyonun kapağı hâlâ "en son eklenen
  öğenin görseli" mantığından türüyor, yalnızca artık bu öğe bir generator
  da olabiliyor.
