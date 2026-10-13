### 9.54 Generator seçenek ikonları: soyut blob yerine kavramsal çizgi sanatı

Kullanıcının Bölüm 9.53'ü canlıda denedikten sonra iki referans görselle
bildirdiği geri bildirim üzerine: "Görseller 1.görseldeki şekilde
gözüküyor... o alanla alakalı 2.görseldeki gibi olsun istiyorum." — Bölüm
9.53'ün "varsayılan görsel" olarak kullandığı `placeholderArt()` (rastgele
renk gradyanlı, soyut "bokeh" blob'ları — mock prompt medyası için zaten var
olan, deterministik SVG üretici) hiçbir şekilde seçeneğin GERÇEK anlamıyla
ilişkili değildi: "Kıvırcık" saç şekli seçeneği de "Düz" seçeneği de aynı
rastgele mor/pembe lekeyi gösteriyordu, yalnızca renk tonu farklıydı — kaç
seçeneğe bakarsa baksın kullanıcı hangi görselin hangi saç şeklini temsil
ettiğini asla anlayamıyordu. Bu, Bölüm 9.53'ün kendi "mimari karar"ının
(gerçek fotoğraf kaynağı/üretimi bu sandbox'ta imkânsız, bu yüzden mevcut
soyut placeholder yeniden kullanıldı) kullanıcı tarafından reddedilmesiydi.

**Dürüstçe belirtilmesi gereken sınır, değişmedi:** bu sandbox'ta hâlâ ne
gerçek bir görsel üretim modeline (Gemini görsel üretimi vb.) ne güvenilir
bir stok fotoğraf servisine erişim var — kullanıcının ikinci referans
görselindeki gibi "yapay zekayla üretilmiş" gerçekçi bir fotoğraf bu ortamda
üretilemiyor/kaynaklanamıyor. Bu görev bu sınırı değiştirmedi; bunun yerine,
verilen sınırlar içinde dürüstçe en iyi çözüm olan bir yaklaşıma geçti:
soyut, rastgele renkli blob'lar yerine, HER seçeneğin kendi anlamını
gerçekten çizen, elle tasarlanmış, minimal çizgi sanatı (line-art) ikonlar.
Bu hâlâ bir fotoğraf değil — ama artık "Kıvırcık" seçeneği gerçekten kıvırcık
saçlı bir baş silueti, "Alttan Açı" seçeneği gerçekten kameranın alttan
çektiğini gösteren bir diyagram, "Ayakta" seçeneği gerçekten ayakta duran bir
figür çiziyor. Bu, gerçek bir sınırlamanın (görsel üretim erişimi yok)
dürüstçe belirtilmiş, en iyi ikinci çözümü — sahte bir "AI ile üretildi"
iddiası hiçbir yerde yapılmıyor.

**Yeni dosya — `src/lib/generator-option-art.ts`:** Bölüm 9.53'ün 8 görsel
destekli alanının (Yüz Şekli, Göz Şekli, Saç Uzunluğu, Saç Şekli, Üst Türü,
Temel Poz, Kamera Açısı, Fotoğraf Türü) TÜM seçenekleri (~63 ikon) için
kavramsal, birbirinden gerçekten farklı SVG ikonları — ortak bir `card()`
sarmalayıcısı (yumuşak lavanta arka plan + tutarlı mor çizgi rengi, sitenin
kendi Lavender Studio token ailesiyle uyumlu, Bölüm 4/9.50) ve her aile için
ayrı bir eşleme tablosu:
- **Yüz Şekli:** gerçek yüz kontur şekilleri (oval, yuvarlak, kare, kalp,
  elmas, uzun) — her biri farklı bir path/geometri.
- **Göz Şekli:** göz kapağı eğrisi + göz bebeği, badem/yuvarlak/çekik/büyük/
  küçük/derin-set arasında gerçekten farklı eğrilerle.
- **Saç Uzunluğu:** baş silueti + saçın gövdeye göre uzandığı gerçek y
  koordinatı (kel → hiç saç yok, çok uzun → omuzun çok altına) — `hairLengthIcon`
  fonksiyonu tek bir parametrik şekilden 6 uzunluğu türetiyor.
- **Saç Şekli:** aynı baş silueti + 10 GERÇEKTEN farklı doku deseni (düz =
  dikey çizgiler, dalgalı = dalgalı çizgiler, kıvırcık = küçük halka
  desenleri, afro = büyük çevresel daire, örgülü = zikzak örgü, at kuyruğu =
  yandan akan kıvrık kuyruk, topuz = tepede küçük daire, bob = çenede kesilen
  düz hat, pixie = tepede kısa sivri tutamlar, dağınık = düzensiz sivri
  uçlar).
- **Üst Türü (Kıyafet):** omuz+gövde silüeti, yaka/kol/kapanış tipine göre
  11 farklı giysi (tişört yuvarlak yaka, gömlek sivri yaka, kazak kaburgalı
  yaka, hoodie ip bağlı kapüşon halkası, deri ceket fermuar çizgisi, mont
  kürk yaka dairesi, kaban uzun boy + orta çizgi, zırh altıgen plaka + haç
  çizgileri, vb.).
- **Temel Poz:** çubuk figür (baş dairesi + gövde/kol/bacak çizgileri),
  8 pozun HER BİRİ gerçekten farklı açılarla (yürüyor = karşı kol-bacak
  sallanışı, koşuyor = öne eğik dinamik adım, zıplıyor = kollar yukarı +
  yerden kesikli çizgiyle ayrılmış, dans ediyor = bir kol yukarı bir bacak
  yana açık).
- **Kamera Açısı:** küçük bir kamera glifi + özne dairesi, ikisinin göreli
  konumu/aralarındaki kesikli çizginin yönü açıyı gösteriyor (alttan açı =
  kamera altta özne üstte yukarı çizgi, kuşbakışı = kamera doğrudan üstte
  büyük özne, omuz üzerinden = önde büyük bir silüet + arkada küçük özne).
- **Fotoğraf Türü:** türe özgü küçük piktogramlar (portre = çerçeve içinde
  baş+omuz silüeti, moda = ince uzun podyum figürü, sokak = bina şekilleri +
  yürüyen figür, manzara = dağ + güneş, ürün = highlight'lı şişe/kutu,
  mimari = pencereli bina cephesi, yemek = tabak + çatal/bıçak, otomotiv =
  araba silüeti + iki tekerlek, düğün = iç içe iki yüzük, belgesel = film
  kamerası + makara).
- Bilinmeyen bir alan id'si/etiketi için (gelecekte kataloğa yeni bir
  `imgOpts` alanı eklenip bu dosyaya karşılığı unutulursa) `fallbackGlyph()`
  — hash'ten türetilmiş, güvenli, deterministik bir çokgen — asla çökmüyor,
  asla boş bir görsel bırakmıyor.

**Değişen tek dosya (mimari):** `src/lib/generator-field-catalog.ts`'in
`imgOpts()` fonksiyonu artık `placeholderArt(...)` yerine
`conceptIcon(fieldSeed, label, 160, 160)` çağırıyor — imza/kullanım yeri
(8 çağrı, Bölüm 9.53'te tanımlanan aynı alanlar) hiç değişmedi, yalnızca
üretici fonksiyon değişti. `placeholderArt()`'ın kendisi (`src/lib/
placeholder-image.ts`) hiç dokunulmadı — mock prompt medyası (Bölüm 8/9.1)
için hâlâ kullanılıyor, bu görevin kapsamında değildi.

**`GeneratorFieldOption`/`CatalogOption` tipleri, `FieldEditorModal`/
`generator-runtime-field.tsx`/`field-catalog-picker.tsx`/`field-list.tsx`
hiç değişmedi** — Bölüm 9.53'ün kurduğu `image`/`color` alanları, kart
grid'i/swatch pilleri, alan editörünün görsel yükleme/kaldırma akışı, ve
en kritik olarak **JSON Output Engine'in (`generator-output.ts`) hâlâ
yalnızca `option.value`/`option.label` okuyup görsel/renk verisine hiç
bakmaması** kuralı — hepsi olduğu gibi kaldı, bu görev yalnızca "hangi
görsel üretiliyor" sorusunu değiştirdi, "görsel nasıl kullanılıyor/
gösteriliyor" sorusuna hiç dokunmadı.

**Nasıl doğrulandı:**
- Bölüm 9.53'ün pure-logic testi (`node --experimental-strip-types`, gerçek
  kaynak dosyalarına karşı) YENİ assertion'larla genişletilip yeniden
  çalıştırıldı — 1615 assertion, hepsi geçti: eski test setinin tüm
  değişmeyen invariant'ları (her görsel destekli alanın TÜM seçeneklerinin
  görsel taşıdığı, her renk destekli alanın TÜM seçeneklerinin renk
  taşıdığı, hiçbir seçeneğin ikisini birden taşımadığı, tekrarsız `value`,
  26 kategori/~196 alan) + YENİ kontroller: her görsel destekli seçeneğin
  ikonunun artık `linearGradient`/`radialGradient` (eski blob imzası) HİÇ
  İÇERMEDİĞİ, gerçek bir çizgi-sanatı ilkeli (`path`/`circle`/`rect`/
  `polygon`/`ellipse`) içerdiği; bir alan içindeki TÜM seçeneklerin
  (Yüz Şekli, Saç Şekli, Temel Poz, Kamera Açısı, Fotoğraf Türü'nde
  test edildi) GERÇEKTEN birbirinden farklı ikonlar ürettiği (aynı şeklin
  tekrarlanmadığı); bilinmeyen bir alan/etiket kombinasyonunun
  `fallbackGlyph`'e güvenle düştüğü, hiç çökmediği; determinizmin
  korunduğu.
- Statik export `npx serve` ile yerel sunulup (`/dev/generator-visual-
  options-test`, Bölüm 9.53'ün kendi test harness'i — yeni bir 8-alan/tüm-
  seçenek "galeri" bölümü eklendi, gerçek kataloğun kendi verisiyle)
  gerçek bir tarayıcıda ekran görüntüsü alınarak GÖRSEL OLARAK incelendi:
  63 ikonun TAMAMI gerçekten ayırt edilebilir ve kendi kavramına gerçekten
  benziyor (kıvırcık saç gerçekten kıvırcık desenli, kamera açıları
  gerçekten kamera+özne diyagramı, giysi ikonları gerçekten kendi
  siluetlerine sahip) — bu incelemede "Pixie" saç ikonunun "Düz" ile çok
  benzer/belirsiz göründüğü fark edilip (tepe kısmındaki kısa sivri
  tutamlar netleştirilerek) düzeltildi.
- Bölüm 9.53'ün kendi 23+7 senaryolu iki Playwright paketi
  (`generator-visual-options-test.mjs`/`generator-catalog-picker-visual-
  test.mjs`) test harness'inin yeni, kataloğun GERÇEK `char_hair_style`/
  `char_hair_color` seçeneklerini (Bölüm 9.53'ün eski, `placeholderArt`
  tabanlı sentetik fixture'ları yerine) kullanacak şekilde güncellenip
  yeniden çalıştırıldı — 23/23 ve 7/7 geçti (yalnızca üç assertion, eski
  sentetik `label.toLowerCase()` değerini ["düz"] değil kataloğun gerçek,
  `normalizeTagLabel` tabanlı slug'ını ["duz"] beklemek üzere güncellendi —
  bu bir davranış regresyonu değil, testin kendi fixture verisinin artık
  gerçek üretim verisiyle birebir aynı olmasının doğal sonucu).
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (28 rota,
  değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama bu sandbox'ın ağ kısıtı
yüzünden yine yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — ama bu görev **hiçbir migration içermiyor**
(yalnızca istemci tarafı bir SVG üretici fonksiyonunun değişimi,
`generator_versions.schema` JSONB'sinin şekli hiç değişmedi), kullanıcının
Dashboard'da yapması gereken ekstra bir adım yok; yalnızca canlı sitede
hazır bir alan (ör. Saç Şekli, Kamera Açısı) ekleyip yeni ikonların
gerçekten kendi kavramlarını yansıttığını bizzat görmesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Gerçek fotoğraf/AI-üretilmiş görsel hâlâ yok** (yukarıda "dürüstçe
  belirtilmesi gereken sınır" olarak açıklandı) — bu sandbox'ın gerçek bir
  kısıtı, icat edilmiş bir kısayol değil; kullanıcı her zaman kendi
  generatorunda gerçek bir fotoğraf yükleyerek bu ikonu değiştirebiliyor
  (Bölüm 9.53'ün `FieldEditorModal` akışı, hiç değişmedi).
- **~196 alanın yalnızca aynı 14'ü (8 görsel + 6 renk) kapsandı, kataloğun
  geri kalanı genişletilmedi** — bu, Bölüm 9.53'ün kendi kapsam kararının
  devamı, bu görev yeni alan eklemedi, yalnızca var olan 8 görsel alanın
  ÜRETİM YÖNTEMİNİ değiştirdi.
- **İkon stili tek, tutarlı bir "line-art" dili olarak bırakıldı** (renkli
  illüstrasyon, gölgeleme, doku dolgusu gibi daha "gerçekçi" bir çizim
  stiline geçilmedi) — sitenin Lavender Studio tasarım diliyle (Bölüm 4)
  tutarlı kalması ve 63 ikonun hepsinin tek bir oturumda, tutarlı bir
  kalitede üretilebilmesi için bilinçli bir sınırlama.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **İkonlar hâlâ birer fotoğraf değil, çizgi-sanatı ikon** — kullanıcının
  ikinci referans görselindeki "yapay zekayla üretilmiş" gerçekçi görünüm
  düzeyine bu sandbox'ın araçlarıyla ulaşılamıyor; bu, teknik bir eksiklik
  değil, ortamın gerçek bir kısıtı (dürüstçe, madem madem yukarıda
  belirtildi).
- Bazı ikonlar (ör. "Bob" saç şekli ile "Kısa" saç uzunluğu) birbirine
  görsel olarak yakın duruyor — ikisi de kavramsal olarak gerçekten benzer
  şeyler (çeneye kadar inen saç) temsil ettiğinden bu bir hata değil, ama
  ayırt edilebilirlik ileride daha da netleştirilebilir.
