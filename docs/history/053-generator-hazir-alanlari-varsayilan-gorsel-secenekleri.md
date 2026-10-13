### 9.53 Generator Hazır Alanları + Varsayılan Görsel Seçenekleri

Kullanıcının 18 bölümlük "PROMPTLY — GENERATOR HAZIR ALANLARI + VARSAYILAN
GÖRSEL SEÇENEKLERİ" şartnamesi üzerine — Generator Builder'ın "Hazır Alan
Kütüphanesi"nden (Bölüm 9.30) bir alan eklendiğinde, o alanın seçenekleri
artık gerçekten "hazır": görsel destekli alanlarda (Saç Şekli, Saç
Uzunluğu, Göz Şekli, Yüz Şekli, Kıyafet, Poz, Kamera Açısı, Fotoğraf Türü)
her seçenek kendi thumbnail'ıyla, renk destekli alanlarda (Saç Rengi, Göz
Rengi, Kaş Rengi, Dudak Rengi, Ten Rengi, Ayakkabı Rengi) her seçenek kendi
gerçek hex swatch'ıyla otomatik geliyor — kullanıcı hiçbir şey yüklemek
zorunda kalmadan. Kullanıcının kendi kesin kısıtlamasına harfiyen uyularak
**hiçbir yeni Generator sistemi/Builder mimarisi kurulmadı** — mevcut alan/
option/selection/prompt generation sistemi üzerine, minimum müdahaleyle
genişletildi.

**AŞAMA 0 — kodlamadan önce analiz (kullanıcının kendi §17 talimatı):**
Kod yazılmadan önce §17'nin istediği 9 maddenin tamamı gerçek dosyalar
okunarak bulundu: Generator Builder (`generator-builder.tsx`), hazır alan
sistemi (`generator-field-catalog.ts` — 26 kategori, ~196 alan, 29 paket),
`GeneratorField`/`GeneratorFieldOption` modeli (`types/index.ts`), option
selection component (`generator-runtime-field.tsx`), prompt generation
(`generator-output.ts`'in JSON Output Engine'i — `describeFieldValue`'nun
yalnızca `.value`/`.label` okuduğu, hiçbir görsel/renk veriye asla
bakmadığı doğrulandı), Supabase tabloları (`generators`/`generator_
versions` — şema tamamen JSONB, bu yüzden bu görev **hiçbir migration
gerektirmedi**: `GeneratorFieldOption`'a eklenen yeni alanlar `generator_
versions.schema` JSONB kolonunun İÇİNDEki bir TypeScript şeklinin
genişlemesi, ayrı bir sütun değil), Supabase Storage (Bölüm 9.27'nin
"kapak görseli için ayrı bir bucket yok, data URL gömülü" kararı — bu
görevin option görselleri için de AYNI, kanıtlanmış deseni izlemesi
gerektiğini gösterdi), Generator kullanım ekranı (`generator-playground.
tsx`/`generator-detail-view.tsx` — `GeneratorRuntimeField`'i zaten hem
Builder'ın Live Preview'ı hem gerçek public runtime'ın paylaştığı,
CLAUDE.md §12/§13 kuralına göre TEK yer olduğu doğrulandı).

**Mimari karar — gerçek fotoğraf yerine dürüst, offline üretilmiş
placeholder görsel:** Bu sandbox'ta gerçek, temsili stok fotoğraf
sağlamanın/üretmenin hiçbir yolu yok (görsel üretim aracı yok, güvenilir
bir harici görsel servisine erişim yok, ve böyle bir bağımlılık zaten
CLAUDE.md'nin başından beri (`src/mocks`, Bölüm 8) reddedilen bir desen).
Bunun yerine, mock prompt medyası için ZATEN var olan, offline, deterministik
`placeholderArt()` (`src/lib/placeholder-image.ts`) yeniden kullanıldı —
her seçeneğin etiketine göre seed'lenmiş, benzersiz, soyut bir "bokeh"
SVG data URI. Bu, dürüstçe belirtilen bir kapsam kararı: gerçek bir kürasyon
değil, ama gerçek, çalışan, ayırt edici bir "varsayılan görsel" — kullanıcı
her zaman kendi generatorunda gerçek bir fotoğrafla değiştirebiliyor (§10),
ki bu değişiklik yalnızca o generatorun kendi şema kopyasını etkiliyor
(kataloğun kendisi hiç değişmiyor — zaten JS nesne kopyalama mimarisinin
doğal sonucu, ekstra bir mekanizma gerekmedi).

**Değişen dosyalar:**
- `src/types/index.ts` — `GeneratorFieldOption`'a iki OPSİYONEL, katkısal
  alan eklendi: `image?: string` (data URL, UI-only) ve `color?: string`
  (hex, UI-only). İkisi de tamamen opsiyonel — bu görevden ÖNCE kaydedilmiş
  bir generator'ın hiçbir seçeneğinde bu alanlar hiç yok, bu yüzden eski
  generator'lar §13/§14'ün istediği gibi tam olarak eskisi gibi render
  edilmeye devam ediyor (aşağıya bakınız).
- `src/lib/generator-field-catalog.ts` — `CatalogOption`'a aynı iki alan
  eklendi; yeni `colorOpts(pairs)` (literal renk-adı alanları için gerçek
  hex çiftleri) ve `imgOpts(seed, labels)` (`placeholderArt` ile deterministik
  thumbnail üreten) yardımcı fonksiyonları eklendi. 14 alan güncellendi:
  8 tanesi `imgOpts` ile (Saç Uzunluğu, Saç Şekli, Göz Şekli, Yüz Şekli,
  Üst Türü/Kıyafet, Temel Poz, Kamera Açısı, Fotoğraf Türü — şartnamenin
  kendi isimlendirdiği örneklerin tamamı), 6 tanesi `colorOpts` ile (Saç
  Rengi — şartnamenin kendi örneği, Göz Rengi, Kaş Rengi, Dudak Rengi, Ten
  Rengi, Ayakkabı Rengi). Dosyanın başındaki mevcut "SCOPE DECISION"
  konvansiyonuna uyan yeni bir doküman bloğu eklendi — bu 14 alan
  ~196 alanlık kataloğun TAMAMI değil, şartnamenin kendi somut örneklerini
  gerçekten karşılayan, dürüstçe sınırlı bir başlangıç kümesi.
- `src/features/generators/generator-runtime-field.tsx` — `select`/
  `radio`/`multi_select` tipleri artık `allOptionsHaveImage()`/
  `allOptionsHaveColor()` kontrolüne göre dallanıyor: bir alanın TÜM
  seçenekleri görsel taşıyorsa yeni `OptionCardGrid` (responsive, `grid-
  cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6` —
  §15'in mobil 2/tablet 3-4/masaüstü 4-6 istediği tam karşılığı, görsel
  üstte + isim altta + seçili işaretleme), TÜMÜ renk taşıyorsa yeni
  `OptionColorSwatches` (● + isim pilleri) render ediliyor; **KISMEN**
  görsel/renkli bir alan (ör. bazı seçeneklerde var bazılarında yok) ya da
  HİÇ görsel/renk taşımayan bir alan (eski bir generator'ın HER alanı,
  veya yeni ama düz bir alan) **tam olarak eskisi gibi**, hiç değişmeden
  render ediliyor — native `<select>`/pill/button (§13/§14'ün "asla
  yarım/kısmen görsel gösterme, her zaman güvenli düşe" kuralı).
- `src/features/generators/field-editor-modal.tsx` — option editörü artık
  her satırda gerçek bir thumbnail (varsa) veya renk swatch'ı (varsa)
  gösteriyor; "Görsel ekle/değiştir" (dosya seçici, `resizeImageToDataUrlFit`
  ile — bu projenin zaten kurulu, kanıtlanmış görsel-yükleme deseni,
  yeni bir yükleme mekanizması icat edilmedi) ve thumbnail üzerine
  bindirilmiş küçük bir "Görseli kaldır" X rozeti (§8'in "[Varsayılan
  görsel]/[Görseli değiştir]/[Görseli kaldır]" üçlüsünün gerçek karşılığı);
  renkli bir seçenekte gerçek bir `<input type="color">` (değiştirmek
  için) + "Rengi kaldır" butonu. Yeni bir seçenek eklerken de (§9'un
  "Özel Seçenek Ekleme" — Ad/Prompt değeri/Görsel yükle) artık aynı dosya
  seçiciyle opsiyonel bir görsel eklenebiliyor. Bir seçeneğin görseli/rengi
  kaldırılınca (veya hiç eklenmeyince) o alan otomatik olarak
  `allOptionsHaveImage`/`allOptionsHaveColor` testinden düşüp normal
  UI'a dönüyor — ayrı bir "geri al" mekanizması gerekmedi, davranış zaten
  bu kuraldan doğal olarak geliyor.
- `src/features/generators/field-catalog-picker.tsx` — arama/gezinme
  satırlarına (`renderFieldRow`), o alanın ilk seçeneğinde görsel/renk
  varsa küçük bir önizleme (14–16px thumbnail veya renk noktası) eklendi —
  kullanıcı bir alanı eklemeden ÖNCE onun "hazır" geldiğini görebiliyor.
- `src/features/generators/field-list.tsx` — Alanlar listesindeki her
  satıra, en az bir seçeneği görsel/renk taşıyan alanlar için küçük bir
  "Görsel destekli" rozeti eklendi.

**§12'nin "görsel prompt değeri değil" kuralı — değiştirilmedi, doğrulandı:**
`generator-output.ts`'in `describeFieldValue()`/`buildGeneratorOutput()`'u
hiç değişmedi — ikisi de yalnızca `option.value`/`option.label` okumaya
devam ediyor, `image`/`color` alanlarının varlığından tamamen habersiz.
Bir seçeneğe tıklamak (kart ya da swatch fark etmeksizin) her zaman
`option.value`'yu (ör. `"curly hair"`/`"kıvırcık"`) runtime değeri olarak
yazıyor — hiçbir zaman bir görsel URL'i veya hex kod prompt/JSON çıktısına
sızmıyor.

**Nasıl doğrulandı:**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (28 rota — yeni
  `/dev/generator-visual-options-test` dahil, hiçbir migration yok) sıfır
  hatayla geçti.
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  `generator-field-catalog.ts`'e karşı, yalnızca extensionsız relative
  import'ları düzeltilmiş bir kopyasıyla — bu projenin standart yöntemi):
  1489 assertion — her görsel taşıyan alanın TÜM seçeneklerinin gerçekten
  görsel taşıdığı (asla kısmi), her görselin gerçek bir `data:image/svg+xml`
  URI olduğu, her renk taşıyan alanın TÜM seçeneklerinin gerçek bir `#hex`
  taşıdığı, hiçbir seçeneğin AYNI ANDA hem görsel hem renk taşımadığı,
  şartnamenin kendi 8 görsel + 2 renk örneğinin (Saç Şekli, Saç Rengi dahil)
  gerçekten karşılandığı, dokunulmamış bir alanın (Cinsiyet) hiç
  etkilenmediği, `placeholderArt`'ın deterministik olduğu, hiçbir alan
  içinde yinelenen `value` olmadığı, kataloğun hâlâ 26 kategori/~196 alan
  taşıdığı (regresyon yok) — hepsi geçti.
- **Ağ gerektirmeyen, gerçek bileşenlere karşı Playwright** (statik export
  `npx serve` ile GitHub Pages basePath'ini taklit eden bir symlink
  düzeniyle yerel sunularak — Supabase'e hiç ihtiyaç yok, çünkü bu
  görevin tamamı istemci tarafı/şema-içi): yeni, geçici bir `/dev/
  generator-visual-options-test` harness'i (Bölüm 9.45/9.47/9.52'nin aynı
  "gerçek, değiştirilmemiş bileşenleri gerçekçi fixture'lara karşı render
  et" ilkesiyle) `GeneratorRuntimeForm`/`GeneratorRuntimeField`/
  `FieldEditorModal`/`FieldCatalogPicker`/`buildGeneratorOutput`'un
  hepsini gerçek, değiştirilmemiş haliyle kullanıyor. 30 senaryo (23 + 7),
  hepsi sıfır JS hatasıyla geçti: görsel destekli bir `select` alanının
  gerçek bir thumbnail-kart grid'i (native `<select>` DEĞİL) render ettiği;
  bir karta tıklamanın onu seçip DİĞERİNİN seçimini kaldırdığı (single-
  select); çoklu-seçim görsel alanında iki kartın AYNI ANDA seçili
  kalabildiği; renkli bir alanın gerçek swatch pillerini render ettiği;
  **her iki durumda da JSON çıktısının yalnızca gerçek `value`'yu taşıdığı
  ve HİÇBİR YERDE bir görsel data URL'i ya da hex kodu SIZMADIĞI** (§12'nin
  doğrudan kanıtı); görselsiz/renksiz eski-tarz bir alanın hâlâ TAM OLARAK
  aynı native `<select>`'i render ettiği (geriye dönük uyumluluk kanıtı);
  Alan Editörü'nde her görsel seçeneğin gerçek bir thumbnail + renkli
  seçeneğin gerçek bir `<input type="color">` gösterdiği; "Görseli kaldır"/
  "Rengi kaldır"a basmanın yalnızca O TEK seçeneği etkileyip diğerlerine
  hiç dokunmadığı, ve etkilenen seçeneğin ardından doğru şekilde "Görsel
  ekle" durumuna döndüğü; kataloktan gerçek bir alan (Göz Şekli/Göz Rengi)
  eklendiğinde picker'ın arama satırında küçük bir önizleme gösterdiği,
  eklenen alanın kataloğun KENDİ (sentetik test verisi değil) gerçek
  görselleriyle/6 seçenekle tam bir kart grid'i olarak render edildiği —
  hepsi sıfır JS hatasıyla.
- Bölüm 9.52'nin mevcut 26 senaryolu `share-modal-test.mjs`'i (ilgisiz bir
  özellik, ama aynı `generator-card.tsx`/`post-menu.tsx` dosyalarına yakın
  kod barındırıyor) sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama bu sandbox'ın ağ kısıtı
yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe belirtilen
aynı sınırlama) — ama bu görev **hiçbir migration içermediğinden**
(mevcut `generator_versions.schema` JSONB kolonunun içindeki bir
TypeScript şeklinin genişlemesi, ayrı bir sütun değil), kullanıcının
Dashboard'da yapması gereken ekstra bir adım yok; yalnızca canlı sitede
gerçek bir generator'a hazır bir alan (ör. Saç Şekli) ekleyip görsellerin
gerçekten geldiğini, ve kendi generatorunda bir görseli değiştirip/
kaldırıp bunun yalnızca o generator'ı etkilediğini bizzat denemesi
gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **~196 alanın yalnızca 14'üne görsel/renk eklendi, tamamına değil**
  (yukarıda "mimari karar" altında açıklandı) — kataloğun kendi, önceden
  var olan "genuinely useful starting library, not exhaustive" kapsam
  kararıyla (Bölüm 9.30) aynı ilke; mimari (`imgOpts`/`colorOpts`) genişlemeye
  tamamen hazır, yeni bir satır eklemek yeterli.
- **Gerçek, kürasyonlu stok fotoğraf yerine offline üretilmiş soyut
  placeholder kullanıldı** (yukarıda gerekçesiyle açıklandı) — bu
  sandbox'ın gerçek bir kısıtı, icat edilmiş bir kısayol değil; kullanıcı
  her zaman kendi generatorunda gerçek bir fotoğrafla değiştirebiliyor.
- **Hazır alan kütüphanesinin (`FieldCatalogPicker`) kendisine yeni bir
  "önizleme büyüt" modalı eklenmedi** — yalnızca küçük, satır-içi bir
  önizleme (§8'in "otomatik geliyor, kullanıcı değiştirmeden önce
  görebiliyor" ihtiyacını zaten karşılıyor); ayrı bir büyük önizleme
  ekranı şartnamede istenmedi.
- **`GeneratorFieldOption`'a görsel/renk dışında üçüncü bir "promptValue"
  benzeri alan eklenmedi** — Bölüm 9.30'un zaten kararlaştırdığı "yalnızca
  JSON katalog" mimarisi (§12) burada da korundu, bu görev onu hiç
  genişletmedi/bozmadı.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Görseller offline üretilmiş, soyut placeholder'lar — gerçek, temsili
  fotoğraf değil** (yukarıda "mimari karar" altında dürüstçe açıklandı).
- **Yalnızca 14 alan görsel/renk taşıyor, kalan ~182 alan hâlâ düz metin/
  chip UI'ında** (yukarıda "kapsam dışı" altında açıklandı) — genişletmesi
  kolay (yeni `imgOpts`/`colorOpts` satırları), ama bu görevde tam kapsamlı
  yapılmadı.
- **Bir generator'ın kendi option görselini değiştirmesi, o generator'un
  kendi (o an içinde olduğu) düzenleme oturumunda `saveDraftVersionContent`/
  `publishGenerator` ile kalıcı hâle geliyor** — bu, Bölüm 9.27'nin zaten
  var olan, değişmeyen kaydetme/yayınlama akışının doğal bir sonucu, bu
  görev için özel bir yeni kalıcılık mekanizması gerekmedi.
