### 9.32 Generatorun seçimleri artık gerçek prompt metnine de yansıyor + `/generators/local` yeniden tasarımı

Kullanıcının iki ekran görüntüsüyle bildirdiği hata üzerine — bir video
generatoru üzerinde hem Prompt kutusuna kendi cümlesini yazmış hem de
"Video Türü"/"Süre"/"Kamera Hareketi" gibi alanlardan gerçek seçimler
yapmıştı, ama JSON çıktısındaki (`video.type`/`video.duration_seconds`/...)
bu seçimler Prompt sekmesinde HİÇ görünmüyordu — yalnızca kendi yazdığı
cümle görünüyordu. Kullanıcının kendi sözleriyle netleştirdiği kesin talep:
*"Jsonun prompta çevrilmiş halinu yapcan ya"* (JSON'un prompta çevrilmiş
hâlini yapacaksın) — yani Bölüm 9.29'da kaldırılan `{{variable}}` şablon
motorunu GERİ GETİRMEDEN (o, generatoru YAPAN kişinin elle yazdığı bir
şablondu; bu istek generatoru KULLANAN kişinin kendi seçimlerinin otomatik,
okunabilir bir açıklamaya çevrilip yazdığı metne EKLENMESİ), JSON çıktısının
kendisinden türeyen, tamamen jenerik bir "prompt birleştirme" katmanı.

**Kök neden:** `buildGeneratorOutput()` (Bölüm 9.28'in JSON Output Engine'i)
`output.prompt`'u her zaman yalnızca `promptText.trim()` (runtime
kullanıcının Prompt kutusuna yazdığı ham metin) olarak yazıyordu — alan
seçimlerinin kendi `jsonPath`'lerine (ör. `video.type`) yazılması ile
`prompt` anahtarının kendisi arasında hiçbir bağlantı yoktu. Bu, Bölüm
9.29'un bilinçli kararının (creator artık şablon yazmıyor, runtime
kullanıcı prompt'u kendi yazıyor) doğal ama eksik bir sonucuydu — "runtime
kullanıcı kendi prompt'unu yazsın" kuralı yanlışlıkla "ve seçtiği alanlar
hiçbir zaman prompt'a katkı sağlamasın" anlamına gelmişti; kullanıcı bunun
YANLIŞ olduğunu bildirdi.

**Düzeltme — `src/lib/generator-output.ts`'e yeni, tamamen jenerik bir
birleştirme katmanı eklendi (ikinci bir template motoru DEĞİL):**
- `describeFieldValue(field, values)` — TEK bir alanın o anki değerini,
  alanın KENDİ `label`'ını (`key`/`jsonPath` segmentini değil) ve seçim
  ailesi alanlarda seçilen seçeneğin KENDİ `label`'ını (ham `value`'sunu
  değil) kullanarak okunabilir bir `"Etiket: Değer"` (select/radio/text/
  number/url), `"Etiket: Değer1, Değer2"` (multi_select) ya da yalnızca
  `"Etiket"` (checkbox/toggle, yalnızca TRUE ise — false bir toggle metne
  HİÇ katkı sağlamıyor, kendi etiketi bile yazılmıyor) parçasına
  çeviriyor. Görünür olmayan (§34'ün koşullu görünürlüğüne göre gizli) ya
  da boş bırakılmış bir alan `null` döndürüp hiç katkı sağlamıyor.
- `composeFinalPromptText(schema, values, promptText)` — şemanın TÜM
  alanlarını `order`'a göre gezip her birinin `describeFieldValue()`
  sonucunu topluyor; runtime kullanıcının kendi yazdığı metin varsa
  ÖNCE o, ardından virgülle ayrılmış alan açıklamaları geliyor
  (`"<yazılan metin>, Etiket1: Değer1, Etiket2: Değer2"`); yazılan metin
  boşsa yalnızca alan açıklamaları (`"Etiket1: Değer1, ..."`); hiç dolu
  alan yoksa yalnızca yazılan metin — kullanıcının hem tek başına yazı
  hem tek başına seçim hem ikisi birden senaryosunun hepsi doğru çalışıyor.
- `buildGeneratorOutput()`'un `output.prompt = promptText.trim()` satırı
  `output.prompt = composeFinalPromptText(schema, values, promptText)`
  oldu — **`output.negative_prompt` bilinçli olarak DEĞİŞMEDİ** (hâlâ yalnızca
  `negativePromptText.trim()`): alan açıklamaları yalnızca pozitif prompt'a
  ekleniyor, negatif prompt'a hiç karışmıyor (kullanıcının şikâyeti/isteği
  yalnızca "Prompt çıktısı" içindi, negative prompt'un kendi anlamı zaten
  "olmasın" listesi, oraya otomatik alan açıklaması eklemek anlamsız
  olurdu). Şemadaki her alanın kendi `jsonPath`'ine yazılan yapılandırılmış
  JSON (`output.video.type` gibi) da hiç değişmedi — bu yalnızca AYRI,
  insan-okunur `prompt` anahtarına ek bir birleştirme adımı, iki görünüm
  (yapılandırılmış JSON ile okunabilir prompt metni) hâlâ AYNI
  `buildGeneratorOutput()` çağrısından, tek kaynaktan geliyor.
- **Gerçek bir yan etki, bilinçli olarak KABUL edildi:** "Prompt Olarak
  Aç" butonunun `disabled={!state.prompt.trim()}` koşulu artık yalnızca
  yazılan metne değil, BİRLEŞTİRİLMİŞ metne bakıyor — bu yüzden bir
  kullanıcı hiçbir şey YAZMADAN yalnızca alan seçimleri yaparsa buton artık
  aktifleşiyor (önceden yalnızca yazı yoksa pasif kalıyordu). Bu, "JSON'un
  prompta çevrilmiş hâli" talebinin doğal, doğru sonucu — gerçek, anlamlı
  bir prompt içeriği artık yalnızca yazıdan değil seçimden de gelebiliyor,
  buton mantığı bunu doğru yansıtıyor; bir hata olarak DÜZELTİLMEDİ, olduğu
  gibi bırakıldı ve testlerde açıkça bu şekilde doğrulandı.

**`/generators/local` (generator detay + runtime sayfası) yeniden
tasarımı — kullanıcının aynı mesajdaki ikinci talebi ("generators/local
sayfalarınıda az önceki tasarımlar gibi iyileştir"):** Bölüm 9.31'in
`/generators` ve `/generators/create`'e getirdiği kart temelli, marka
diline uygun tasarım `generator-detail-view.tsx`'e de uygulandı — yalnızca
CSS/JSX yeniden düzenlemesi, hiçbir veri/mantık değişikliği yok:
- Kapak görseli + başlık/açıklama/yazar/etiket/istatistik/aksiyon bloğu
  artık TEK bir `rounded-lg border border-border bg-surface` kartın
  içinde (önceden kapak görseli kendi başına, geri kalanı çıplak sayfa
  arka planındaydı).
- **Yeni: kapak görseli olmayan bir generator artık boş bir boşluk yerine
  gerçek bir yer tutucu gösteriyor** — `bg-accent-surface` üzerinde ortalanmış
  bir `Blocks` ikonu (`lucide-react`'ten, dosyada zaten import edilmişti,
  yeni bir bağımlılık gerekmedi). Önceden `generator.coverUrl` boşsa kapak
  bloğu hiç render edilmiyordu.
- Başlık `text-xl sm:text-2xl` (mobilde biraz daha küçük, `sm`'den sonra
  eskisi gibi büyük).
- Kullanım/kaydetme/remix istatistik satırı artık çıplak metin değil,
  `bg-accent-surface/50` üzerinde bir "pill" kutu (Bölüm 9.31'in
  `/generators/create`'te zaten kurduğu aynı vurgu dili).
- "Generatoru Kullan" bölümü artık kendi `rounded-lg border border-border
  bg-surface` kartı içinde, `/generators/create`'in Önizleme adımındaki
  kart stiliyle tutarlı — önceden yalnızca üstte bir `border-t` çizgisi
  vardı.
- Container padding `px-4 py-6 sm:px-6` (mobilde `sm`'e kadar biraz daha
  dar), boşluklar `space-y-5` olarak sadeleştirildi.
- `GeneratorPlayground`'ın kendisi (Form/JSON/Prompt sekmeleri, "Prompt
  Olarak Aç" akışı, `handleOpenInPrompt` mantığı) HİÇ değişmedi — yalnızca
  onu saran sayfa kabuğu.

**Nasıl doğrulandı:**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
  değişmedi — bu görev hiçbir yeni route/migration içermiyor) sıfır
  hatayla geçti.
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  `generator-output.ts`'e karşı, dosyanın Bölüm 9.28/9.29'dan beri
  kullanılan aynı scratchpad-kopya + import-uzantısı-düzeltme yöntemiyle):
  Bölüm 9.28'in 3 eski assertion'ı (worked-example testi, `jsonPath:
  "prompt"` çakışma testi, jenerik shape testi) yeni birleştirilmiş
  davranışa göre düzeltildi (ör. worked-example testinde 5 dolu alanın
  hepsinin gerçek seçenek etiketleriyle — ham `value` değil — metne
  eklendiği doğrulandı), artı kullanıcının kendi bildirdiği senaryoyu
  birebir modelleyen yeni bir test bloğu eklendi (video_type/duration/
  movement/hdr/slowmo alanları): birleştirilmiş metnin yazılan cümle +
  her dolu alanın `"Etiket: Değer"` açıklamasını doğru sırada içerdiği,
  TRUE bir toggle'ın yalnızca kendi etiketini eklediği, FALSE bir
  toggle'ın metne HİÇ katkı sağlamadığı (kendi etiketi bile yazılmadığı),
  JSON'un kendi `prompt` anahtarının Prompt sekmesiyle birebir aynı
  olduğu, ve yapılandırılmış `video` nesnesinin (false toggle'ın gerçek
  `false` değeri dahil) birleştirmeden hiç etkilenmediği — toplam **45/45
  geçti**.
- **Ağ seviyesinde taklit edilmiş Supabase REST/RPC yanıtlarıyla
  Playwright** (bu projenin standart yöntemi, statik export `npx serve`
  ile GitHub Pages basePath'ini taklit eden bir symlink düzeniyle yerel
  sunularak):
  - Bölüm 9.27/9.28'in mevcut iki paketi, birleştirilmiş prompt
    davranışına göre güncellenip yeniden çalıştırıldı: `generators-
    e2e-test.mjs` — Preview adımının JSON çıktısının artık yazılan metin +
    alan açıklamasını birlikte taşıdığı, "Prompt Olarak Aç"ın artık YALNIZCA
    bir alan seçiminden (hiç yazı olmadan) bile aktifleştiği, kaydedilen
    `generator_runs.generated_prompt`'un ve `CreatePromptForm`'a önceden
    dolan `Prompt Metni` alanının ikisinin de doğru birleştirilmiş metni
    taşıdığı — **45/45 geçti**; `generator-json-output-test.mjs` — 4
    farklı, tamamen creator-tanımlı gruba (`product`/`backdrop`/`priority`/
    `lighting`) yazan alanların hepsinin gerçek seçenek etiketleriyle
    prompt'a eklendiği, promptu yeniden yazmanın hâlâ dolu kalan alan
    değerleriyle birlikte doğru birleştiği, `negative_prompt`'un hiçbir
    zaman alan açıklamasıyla kirlenmediği — **18/18 geçti**.
  - Bölüm 9.30'un `generator-catalog-test.mjs`'i (hazır alan kütüphanesi
    seçicisi, bu görevden etkilenmiyordu) değişiklik gerekmeden yeniden
    çalıştırıldı — **26/26 geçti**.
  - **Yeni, kullanıcının tam raporladığı senaryoyu ve `/generators/local`
    redesign'ının ikisini birden doğrulayan bir paket:** kullanıcının
    ekran görüntüsündeki gibi bir video generatoru (select/number/
    multi_select/iki toggle) üzerinde gerçek seçimler + gerçek yazılmış
    bir cümle ("Bir köpekle seyahat") ile: JSON'un `prompt` anahtarının
    yazılan cümle + tüm dolu alanların okunabilir açıklamasını (seçenek
    etiketleriyle) doğru sırada taşıdığı; kapalı bırakılan bir toggle'ın
    metne hiç katkı sağlamadığı; yapılandırılmış `video` nesnesinin
    (true VE false toggle'lar dahil) etkilenmediği; Prompt sekmesinin
    JSON'un `prompt`'uyla BİREBİR aynı metni gösterdiği (tek kaynak, JSON/
    Prompt sekmesi uyuşmazlığı yok); 390px mobil genişlikte yatay taşma
    olmadığı; kapak görseli olmayan generatorun artık gerçek bir `Blocks`
    yer tutucu ikonu gösterdiği (üç ayrı `Blocks` ikonundan — sidebar nav,
    "Generator" rozeti, kapak yer tutucusu — doğru olanı, `bg-accent-
    surface` konteynerine göre scoped bir seçiciyle); başlığın gerçek bir
    `rounded-lg border-border bg-surface` kart içinde olduğu; istatistik
    satırının artık `bg-accent-surface` bir pill olduğu; "Generatoru
    Kullan"ın kendi kartı içinde olduğu; runtime alanlarının (Form
    sekmesine dönünce) yeni kart sarmalamasının içinde sorunsuz çalıştığı;
    masaüstü genişlikte de yatay taşma olmadığı ve yer tutucunun (artık
    sidebar'ın kendi Blocks ikonu da görünür hâle geldiği hâlde, doğru
    scoped seçiciyle) hâlâ doğru bulunduğu — **13/13 geçti**.
  - İlgisiz regresyon paketleri (`resilience-test.mjs` 14/14,
    `prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs`
    19/19, `save-flow-e2e-test.mjs` 14/14, `smart-tags-e2e-test.mjs`
    30/30) sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/TypeScript katmanında, `20260919300000_generators.sql`
şeması hiç değişmedi), kullanıcının Dashboard'da yapması gereken ekstra
bir adım yok; yalnızca canlı sitede gerçek bir generator üzerinde hem
yazıp hem seçim yaparak birleştirilmiş prompt'u ve yeni `/generators/
local` tasarımını bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Bölüm 9.29'da kaldırılan `{{variable}}` şablon motoru GERİ
  GETİRİLMEDİ** — kullanıcının kendi netleştirmesi ("JSON'un prompta
  çevrilmiş hâli") bunu açıkça bir "creator şablon yazsın" talebi değil,
  "runtime kullanıcının seçimleri otomatik, jenerik bir metne çevrilsin"
  talebi olarak tanımladı; `composeFinalPromptText` hiçbir creator
  tanımlı `{{token}}`'a bakmıyor, yalnızca şemanın kendi `label`/`option.
  label` alanlarını kullanıyor.
- **Alan açıklamalarının cümle içine (gramer olarak) doğal bir şekilde
  örülmesi eklenmedi** — çıktı bilinçli olarak `"<yazı>, Etiket: Değer,
  ..."` şeklinde düz, listeleme tarzı bir ekleme; gerçek bir doğal dil
  üretimi (ör. "gece vakti, HDR açık, kamera drone ile hareket ederek")
  ancak gerçek bir AI/LLM entegrasyonuyla mümkün olurdu ve bu projede
  öyle bir entegrasyon yok (Bölüm 9.23'ün §19 kararıyla aynı dürüstlük
  sınırı).
- **Negatif prompt'a alan açıklaması eklenmedi** (yukarıda açıklandı) —
  kullanıcının talebi yalnızca "Prompt çıktısı"nı hedefliyordu.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Çok sayıda dolu alanı olan bir generatorda birleştirilmiş prompt metni
  hızla uzayabilir** (her dolu alan kendi `"Etiket: Değer"` parçasını
  ekliyor) — bir uzunluk sınırı/kısaltma eklenmedi, şartname/kullanıcı
  isteği böyle bir sınır istemedi; bu, "hiçbir seçim sessizce kaybolmasın"
  önceliğinin doğal bir sonucu.
- **Gerçek bir mobil/tablet cihazda (fiziksel dokunma, gerçek viewport)
  `/generators/local`'ın yeni tasarımı hiç denenmedi** — yalnızca
  Playwright'ın simüle ettiği viewport genişlikleri doğrulandı (Bölüm
  9.11/9.13/9.31'in de belirttiği aynı donanım-erişimi sınırı).
