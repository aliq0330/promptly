### 9.36 Prompt/Generator UI paritesi — Generator, Prompt sisteminin bir "content type"ı gibi davranıyor

Kullanıcının çok kapsamlı "GENERATOR SİSTEMİNİ MEVCUT PROMPT SİSTEMİYLE
BİREBİR PARALEL HALE GETİR" şartnamesi üzerine — Bölüm 9.34/9.35'in zaten
kurduğu, GERÇEKTEN ÇALIŞAN beğeni/yorum/remix/kaydetme backend'ine
KESİNLİKLE dokunulmadan (şartnamenin §37/§42/§43/§44'ün defalarca
tekrarladığı ana kural), Generator'ın GÖRÜNÜMÜ/LAYOUT'U/RESPONSIVE
DAVRANIŞI/MODALLARI Prompt sisteminin BİREBİR AYNI, gerçek
component'leriyle değiştirildi — Generator artık kendi ayrı bir "sosyal
medya tasarımı" değil, Prompt sisteminin card shell'ini/save modalını/
3-nokta menüsünü/remix haritasını/tab yapısını/grid'ini DOĞRUDAN REUSE
eden bir içerik türü.

**AŞAMA 1 — denetim (kod yazılmadan önce yapıldı):** Bir alt-agent'a Prompt
Card/Local sayfası/Save modal/Remix map/Merge/Comparison/PostMenu/Discover
akışının GERÇEK dosyalarını ve Generator'ın şu anki hâlini karşılaştırmalı
okutup tam bir bulgu raporu çıkarıldı. Özet bulgular:
- **Card shell zaten byte-identical'dı** (`"group relative flex flex-col
  gap-3 overflow-hidden rounded-lg border border-border bg-surface pt-4
  transition-shadow hover:shadow-md"` + aynı `absolute inset-0 z-0`
  stretched-link deseni) — dokunulmadı.
- **`PostHeader` en büyük gerçek duplikasyondu:** `GeneratorCard` kendi
  header JSX'ini elle kopyalamıştı, `PostHeader`'ı hiç çağırmıyordu.
- **`PromptCardFooter` prompt'a sabitlenmişti** (`prompt.id` doğrudan
  gömülü) — `GeneratorCard` bu yüzden kendi, FARKLI class'larla (`gap-4`,
  `justify-between` yok, 3 aksiyon değil 5) bir footer'ı elle yeniden
  yazmıştı.
- **`SaveButton`/`SaveToCollectionModal` prompt'a sabitlenmişti** —
  Generator, Bölüm 9.34'te bu yüzden AYRI, modal'sız, yalnızca-varsayılan-
  koleksiyon'a kaydeden basit bir `GeneratorSaveButton`/
  `useGeneratorSaveState` almıştı (kullanıcının §7'de tam olarak
  şikayet ettiği "ikinci bir save sistemi").
- **Üç ayrı, birbiriyle tutarsız grid class'ı** vardı: `/generators`
  (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`), arama sonucu
  (`grid grid-cols-1 gap-3 sm:grid-cols-2`), ve her yerdeki asıl referans
  `PromptGrid`'in CSS-columns masonry'si (`columns-1 gap-4 sm:columns-2
  xl:columns-3`) — üçü de farklı.
- **Remix Map/Merge/Comparison/Edit History Generator için hiç yoktu** —
  `RemixGraphNode`/`MergeRequest`/`PromptVersion`/`EditHistoryPanel`'in
  hepsi katı bir şekilde `Prompt`'a tipliydi; `generator_versions` tablosu
  var olmasına rağmen hiçbir diff/merge/graph mantığına bağlı değildi.
- **Generator'lar `/` (ana akış) ve `/discover`'da hiç görünmüyordu** —
  `FeedItem` union'ı yalnızca `"prompt" | "request"` idi.
- **Generator Card zaten hiç kullanım sayısı göstermiyordu** (Bölüm 9.27'de
  zaten kaldırılmıştı), ama Generator DETAY sayfası hâlâ
  `{formatCount(generator.useCount)} kullanım` gösteriyordu (§22/§23'ün
  istediği kaldırma).

**Kritik, dürüstçe belirlenmiş kapsam kararı — Merge/Comparison Generator'a
GENİŞLETİLMEDİ:** Bir promptun mergelenebilir "içeriği" düz metin
alanlarıdır (`title`/`description`/`prompt_text`/`tool` —
`PromptDiffModal`/`VersionDiffModal`/`_perform_merge_acceptance` bunu
karşılaştırıp birleştiriyor). Bir generatorun "içeriği" ise yapılandırılmış
bir JSON şema+şablondur (`generator_versions.schema`/`template`). Mevcut
diff/merge UI'ını buraya olduğu gibi bağlamak ya YANLIŞ ÇALIŞACAKTI (alan
uyumsuzluğu — 4 sabit metin alanı bekleyen bir modal'a bir JSON şema
vermek) ya da TAMAMEN YENİ bir JSON-diff arayüzü icat etmeyi
gerektirecekti — ikisi de şartnamenin §37/§42'sinin "yeni sistem yazma,
mevcut olanı reuse et" kuralını ihlal ederdi (yeni bir sistem olmadan
gerçek reuse mümkün değildi). Bu yüzden **Remix Map generator için TAM
olarak reuse edildi** (görsel ağaç/tree, gerçek veri, gerçek node
seçimi — tractable ve gerçek), ama **Merge talebi oluşturma/Farkları
karşılaştır butonları yalnızca prompt düğümlerinde gösteriliyor**,
generator düğümlerinde hiç render edilmiyor — bu, icat edilmiş bir
kısıtlama değil, iki içerik türünün gerçek veri şekli arasındaki gerçek
bir uyumsuzluğun dürüst bir yansıması.

**Migration: `supabase/migrations/20260919320000_generator_parity.sql`**
(kullanıcının §37/§42 kuralına uyularak: yeni tablo YOK, yalnızca üç dar
kapsamlı eklenti):
1. `content_edits.content_type` CHECK'i üçüncü bir değer aldı:
   `'generator'`. Yeni `record_generator_edit()` trigger'ı (Bölüm
   9.25'in `record_prompt_edit()`'iyle birebir aynı desen, `SECURITY
   DEFINER`) `generators` tablosunda title/description/category/
   subcategory/cover_url/visibility değişikliklerini izliyor, sahibi
   dışındaki bir düzenlemede (bugünkü RLS altında hiç mümkün değil, ama
   ileriye dönük hazır) `generator_edited` bildirimi üretiyor.
   `notifications.type` CHECK'i de bu yeni değeri aldı.
2. `remove_generator_from_saved_everywhere(p_generator_id)` — `remove_
   prompt_from_saved_everywhere`'in birebir generator karşılığı: artık
   bir generator da (widened `SaveToCollectionModal` sayesinde) birden
   fazla koleksiyona eklenebildiğinden, "genel kaydı kaldır" de aynı
   şekilde HEPSİNDEN birden, tek atomik işlemde çıkarabilmeli.
3. `fetch_generator_remix_graph(p_root_id)` — `fetch_remix_graph`'ın
   birebir aynı tek-sorgu recursive CTE deseni, `generators`/
   `source_generator_id`/`root_generator_id` üzerinde; `slug` de
   döndürüyor (generator route'u slug-bazlı, prompt'un id-bazlı
   `promptHref`'inden farklı olarak `generatorHref` slug istiyor). Bir
   generator asla soft-delete olmadığından (`deleteGenerator` gerçek bir
   DELETE, Bölüm 9.7'nin prompt'a özel yumuşak silme mekanizmasının
   karşılığı yok) `isDeleted` her zaman `false` — gerçekten silinmiş bir
   ata zaten sonuç kümesinde hiç görünmüyor, mevcut "kaynağa erişilemiyor"
   dalı (haritanın zaten sahip olduğu) bunu doğru ele alıyor, ayrı bir
   "silinmiş içerik" kavramı icat edilmedi.

**Nasıl doğrulandı — SQL (yerel PostgreSQL 16'da GERÇEKTEN çalıştırıldı):**
Önceki 25 migration'la (storage hariç) birlikte sıfırdan uygulanıp iki
gerçek kullanıcıyla (Ali, Ayşe) 7 senaryo çalıştırıldı: remix graph'ın
yayınlanan 2 düğümü döndürüp taslağı hariç tuttuğu; `anon`'un grafı
okuyabildiği ama `remove_generator_from_saved_everywhere`'i
çağıramadığı (execute grant yok); Ali'nin kendi generatorunu düzenlemesinin
`content_edits` satırı üretip kendine bildirim ÜRETMEDİĞİ; yalnızca
sayaç güncelleyen bir UPDATE'in `content_edits`'e hiç dokunmadığı;
Ayşe'nin Ali'nin generatorunu HEM kendi Genel'ine HEM özel bir
koleksiyona kaydedip "genel kaydı kaldır"ın ikisinden BİRDEN, tek
çağrıda temizlediği; ve çapraz-kullanıcı izolasyonu (Ayşe'nin kaldırma
işlemi Ali'nin KENDİ, ilgisiz kaydına hiç dokunmadı) — hepsi gerçekten
doğrulandı.

**Frontend — Card shell (§3-6, §24, §30, §34):**
- `PostHeader` widened: `{prompt} | {generator}` discriminated union
  kabul ediyor, `PostMenu`'yü doğru parametrelerle çağırıyor.
- `PromptCardFooter` widened: aynı `{prompt} | {generator}` union, TEK
  bileşen — like/comment/remix-count/save/share, AYNI sıra, AYNI class
  (`justify-between`, 5 ikon). Bir generator'ın remix-count ikonu, gerçek
  remix eyleminin (async `remixGenerator()` çağrısı, immediate — bir
  promptun `?remix=` prefill linkinden FARKLI bir akış) zaten çalıştığı
  generator detay sayfasına yönlendiriyor — dürüstçe açıklanmış, kasıtlı
  bir istisna (aynı asenkron eylemi her kart örneğinde tekrarlamak yerine).
- `GeneratorCard` tamamen yeniden yazıldı: artık `PostHeader`+
  `PromptCardFooter`'ı DOĞRUDAN çağırıyor, kendi header/footer JSX'ini
  elle kopyalamıyor. Title/description artık Prompt Card'ın BİREBİR AYNI
  tipografisini kullanıyor (`text-base font-semibold` / `line-clamp-3
  text-sm`). Generator-özel içerik (kapak görseli, Generator/kategori/
  Remix rozetleri) — §5'in açıkça izin verdiği "yalnızca içerik alanı
  farklı olabilir" kuralına uygun.

**Frontend — Save/Collection (§7-8):** `collections.ts`'in `addItemTo
Collection`/`removeFromCollection`/`fetchCollectionIdsContaining`/
`removeFromSavedEverywhere` fonksiyonları, `likes.ts`'in zaten kurduğu
AYNI `contentType` (varsayılan `"prompt"`) deseniyle widened —
`isGeneratorSaved`/`saveGeneratorToDefault`/`unsaveGeneratorFromDefault`
tamamen SİLİNDİ. `useSaveState` artık `useLikeState`'in birebir aynı
şekliyle bir `contentType` parametresi alıyor — `useGeneratorSaveState.ts`
SİLİNDİ. `SaveButton` `promptId?/generatorId?` (PostMenu'nün zaten
kullandığı desen) alacak şekilde widened. `SaveToCollectionModal` da aynı
şekilde widened. `GeneratorSaveButton` (Bölüm 9.34'ün geçici, modal'sız
stopgap'i) tamamen SİLİNDİ — artık her yerde (kart footer'ı, detay
sayfası) doğrudan gerçek `<SaveButton generatorId={...}>` kullanılıyor.
**Sonuç:** "Film fikirleri" koleksiyonuna bir prompt VE bir generator
aynı anda eklenebiliyor — koleksiyonlar hiçbir zaman content-type'a özel
olmadı (DB zaten Bölüm 9.34'ten beri hazırdı, yalnızca TS katmanı
prompt'a sabitliydi).

**Frontend — Grid parity (§4, §10):** `PromptGrid` widened —
`{prompts: Prompt[]} | {generators: Generator[]}`. `/generators`
(`GeneratorsDiscoverView`) ve `/search`'ün "Generatorlar" bölümü artık
kendi bespoke grid'lerini ATIP bu TEK, paylaşılan masonry'yi kullanıyor.
`/generators`'ın dış container'ı da `max-w-6xl`'den (kendine özgü,
tahmin edilmiş bir değer) `/discover`'ın GERÇEK, mevcut container'ıyla
(`px-4 py-6 lg:px-6`, max-width yok) eşitlendi — `/generators`,
`/discover`'ın generator karşılığı olarak ele alındı (bir liste/keşif
sayfası, bir detay sayfası değil).

**Frontend — `/generators/local` = `/prompts/local`'ın generator versiyonu
(§9-10, §26-29):** `GeneratorDetailView`'ın dış container'ı
`PromptDetailView`'la BİREBİR aynı class'lara getirildi (`mx-auto
max-w-3xl space-y-6 px-4 py-6 lg:px-6`). Sayfaya, `PromptDetailView`'ın
BİREBİR AYNI 3-tab yapısı eklendi — **Yorumlar** (varsayılan aktif) /
**Remixler (N)** / **Prompt geçmişi**, aynı `role="tablist"`/`role="tab"`
class'ları. Yeni `fetchRemixesOfGenerator()` (`fetchRemixesOf`'un
birebir aynı deseni) "Remixler" sekmesini besliyor, widened `PromptGrid`
ile render ediliyor. Like/comment/save satırına gerçek `SaveButton`
eklendi (önceden save yalnızca ayrı bir "Kaydet" metin butonuydu, artık
Prompt'la aynı yerde, aynı ikon). `EditHistoryPanel` de (aşağıya bakınız)
bu sayfaya eklendi. **Usage count (`{formatCount(generator.useCount)}
kullanım`) tamamen kaldırıldı** (§22/§23) — istatistik kutusu artık
yalnızca kaydetme/remix gösteriyor.

**Frontend — Remix Map (§16-18, tractable kısım):** `RemixGraphNode`'a
opsiyonel `contentType?: "prompt" | "generator"` ve `slug?: string`
eklendi (varsayılan davranış değişmedi — mevcut her prompt call site'ı
etkilenmeden çalışmaya devam ediyor). Yeni `fetchGeneratorRemixGraph()`/
`resolveGeneratorGraphRootId()` (`remix-graph.ts`) aynı `RemixGraphNode`
şeklini üretiyor. `RemixBranchMap` ve `RemixNodeDetailPanel` widened —
`{prompt} | {generator}` hedefi kabul ediyorlar, hangi fetch/href
fonksiyonunun kullanılacağına `contentType`'a göre karar veriyorlar.
**`RemixMapNodeCard`/`remix-tree-layout.ts`'e HİÇ DOKUNULMADI** — zaten
tamamen `RemixGraphNode`'un generic alanlarına (`id`/`title`/`author`/
`originType`/`sourcePromptId`) dayandıklarından, prompt/generator ayrımını
hiç bilmeden ikisi için de doğru çalışıyorlar (gerçek reuse, sıfır
değişiklik). Bir generator düğümünde: "Farkları karşılaştır" bölümü ve
"Merge talebi oluştur" butonu HİÇ render edilmiyor (yukarıdaki kapsam
kararı); "Remixle"/"İçeriği Aç"/"Kaynağı Aç" ise gerçek `generatorHref`
linkleriyle çalışıyor. Harita lejantı ve "Merge ilişkilerini göster/gizle"
araç çubuğu butonu generator modunda gizleniyor (asla veri taşımayan bir
kontrolü göstermemek için).

**Frontend — Edit History (§17, tractable kısım):** `EditHistoryPanel`'in
`contentType` union'ı `"prompt" | "prompt_request" | "generator"`e
genişletildi; `fetchEditHistory`/`ContentEditEvent` aynı şekilde. `Field
Labels` haritasına Kategori/Alt Kategori/Kapak Görseli/Görünürlük eklendi.
`GeneratorDetailView`'a `<EditHistoryPanel contentType="generator" .../>`
eklendi (yalnızca sahibine).

**Frontend — Discover/Feed entegrasyonu (§11-12, §32):** `FeedItem`
union'ı üçüncü bir üye aldı: `{kind: "generator"; data: Generator}` —
`feedItemKey`/`feedItemCreatedAt`/`feedItemPopularity`/`feedItemAuthorId`
hepsi genişletildi (generator popülerliği `likeCount`'a dayanıyor,
`useCount`'a DEĞİL — usage count'un hiçbir UI'da hiç görünmemesi
kuralıyla tutarlı). `FeedGrid` üçüncü bir render dalı aldı
(`<GeneratorCard>`). Yeni `RealGeneratorsProvider`/`useRealGenerators()`
— `RealRequestsProvider`'ın BİREBİR AYNI şekli (paylaşılan, app-geneli
cache; `GeneratorsDiscoverView`'ın kendi AYRI fetch'i bu cache'e taşındı,
üçüncü bir kopya kalmadı), `AppProviders`'a eklendi. `FeedTabs`/
`DiscoverFeed` artık `useRealGenerators()`'ı da diğer iki kaynakla
birleştiriyor; `DiscoverFeed`'e yeni bir "Generatorlar" filtre çipi
eklendi. `GeneratorDetailView`'ın silme akışı artık `removeFromCache`'i
de çağırıyor (silinen bir generator `/generators`'a dönüldüğünde hâlâ
listede görünmesin diye).

**PostMenu (§13-14) — zaten Bölüm 9.35'te polimorfikti, bu görevde yalnızca
doğrulandı/gerçek kullanıma taşındı:** Prompt Card'daki BİREBİR AYNI
component, aynı konum/boyut/dropdown/animasyon; generator hedefinde
"Kopyasını oluştur"/"Mesajla gönder" hiç görünmüyor (bu iki eylem
generator için hiç yok), "Düzenle"/"Sil" aynı yerde, aynı iki-tıklamalı
onay deseniyle çalışıyor.

**Kesinlikle YAPILMAYANLAR (§42'nin kontrol listesi, doğrulandı):** Yeni
like/comment/remix/save/collection/share/3-dot menu sistemi YAZILMADI —
hepsi mevcut, Bölüm 9.34/9.35'te zaten çalışan backend'e bağlandı. Yeni
bir "Generator local" feed tasarımı yapılmadı — `/prompts/local`'ın
KENDİ container/tab/grid/component'leri reuse edildi. Card genişlik/
responsive değerleri TAHMİN EDİLMEDİ — gerçek `ImagePromptCard`/
`TextPromptCard` dosyalarından okundu (`pt-4`, `columns-1 sm:columns-2
xl:columns-3`, vb.). Koleksiyonlar generator'a özel hale getirilmedi —
tam tersi, prompt'la AYNI, tek koleksiyon sistemi içine alındı.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST/RPC yanıtlarıyla Playwright, statik export `npx serve` ile
GitHub Pages basePath'ini taklit eden bir symlink düzeniyle yerel
sunularak — bu projenin standart yöntemi):** Yeni, 20 senaryolu bir
pakette (`generator-prompt-parity-test.mjs`) hepsi sıfır JS hatasıyla
doğrulandı: `/generators`'taki bir generator kartının gerçek `PostHeader`
profil linki + `PostMenu` 3-nokta + 5 footer ikonu (usage count hiç yok)
gösterdiği; Kaydet'e basmanın GERÇEK çoklu-koleksiyon modalını açtığı ve
"Genel"i seçmenin gerçek bir `generator_id`'li `collection_items` POST'u
tetiklediği; `/generators`'ın `PromptGrid`'in masonry class'larını
kullandığı; generator detay sayfasının tam 3 sekme (Yorumlar varsayılan
aktif, Remixler (1), Prompt geçmişi) gösterdiği ve kullanım sayısının
HİÇ görünmediği; "Remixler" sekmesinin gerçek remix'i `PromptGrid` ile
listelediği; "Prompt geçmişi" sekmesinin `fetch_generator_remix_graph`'tan
gelen gerçek 2 düğümü haritada gösterdiği VE merge-toggle'ın hiç
görünmediği; bir düğüm seçildiğinde "İçeriği Aç"/"Remixle" görünüp
"Merge talebi oluştur"un hiç görünmediği; Discover'ın "Generatorlar"
filtre çipiyle gerçek generator kartını gösterdiği; ve düz bir promptun
beğenme/PostMenu davranışının (contentType/generatorId hiç geçirilmeden)
hiç bozulmadığı. Ayrıca bu oturumun ve önceki oturumların TÜM ilgili
regresyon paketleri (`generators-e2e-test.mjs` 45/45,
`generator-social-test.mjs` 25/25 — save akışı yeni modal'e göre
güncellenerek, `prompt-social-regression-test.mjs` 9/9,
`collections-e2e-test.mjs` 19/19, `save-flow-e2e-test.mjs` 14/14,
`resilience-test.mjs` 14/14, `prompt-variables-e2e-test.mjs` 48/48,
`generator-json-output-test.mjs` 18/18, `generator-catalog-test.mjs`
26/26, `generator-field-catalog-test.mjs` 152/152, `smart-tags-e2e-test.
mjs` 30/30, `generator-prompt-compose-detail-redesign-test.mjs` 14/14 —
iki eski assertion, "Prompt" sekme locator'ının artık yeni "Prompt
geçmişi" sekmesiyle de eşleştiği ve usage count'un artık hiç
görünmediği için, yeni ama kasıtlı davranışa göre güncellenerek)
sıfır regresyonla yeniden çalıştırıldı. `npx tsc --noEmit`, `npm run
lint`, tam `npm run build` (25 rota, değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının
`20260919320000_generator_parity.sql`'i Dashboard → SQL Editor'de
uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Merge/Comparison (Farkları Karşılaştır) generator'a genişletilmedi**
  (yukarıda ayrıntılı gerekçesiyle açıklandı) — iki içerik türünün
  mergelenebilir birimi yapısal olarak uyumsuz (düz metin vs. JSON şema).
- **`RemixMapNodeCard`/`remix-tree-layout.ts` hiç değiştirilmedi** — zaten
  tam generic oldukları için değiştirilmesi GEREKMEDİ, bu bir eksiklik
  değil.
- **Generator'ın kendi remix eylemi (kart footer'ındaki ikon) bir
  `?remix=` prefill linkine DÖNÜŞTÜRÜLMEDİ** — mevcut, çalışan
  `remixGenerator()` RPC akışı (immediate, async) korunuyor; footer
  ikonu bu akışın zaten yaşadığı detay sayfasına yönlendiriyor.
- **`/generators`'ın kendi arama/kategori filtre satırı Discover'ın
  filtre çipleriyle birleştirilmedi** — bunlar iki farklı, meşru filtre
  ekseni (generator kategorisi vs. genel içerik türü), şartname de bunları
  birleştirmeyi istemedi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Merge/Comparison generator için hâlâ yok** (yukarıda kapsam kararı
  olarak açıklandı) — gerçek bir JSON-şema diff/merge sistemi ayrı,
  büyük bir görev olur (Bölüm 9.14'ün prompt için yaptığının generator
  karşılığı), bu görevin kapsamına alınmadı.
- **N+1 sorgu deseni burada da geçerli** (Bölüm 21 Faz 3'ten beri bilinen
  sınırlama) — her `GeneratorCard`/`RemixBranchMap` örneği kendi ayrı
  sorgularını tetikliyor.
- **Generator remix haritası Realtime ile canlı güncellenmiyor** aslında
  GÜNCELLENİYOR (prompt'takiyle aynı `postgres_changes` deseni,
  `generators`/`root_generator_id` filtresiyle) — ama generator'a hiç
  merge talebi eklenemediğinden bu abonelik pratikte yalnızca yeni bir
  remix eklendiğinde tetikleniyor.

---
