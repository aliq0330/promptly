### 9.46 Bölüm 9.45'in canlıda çalışmaması — response-şekli doğrulaması eklendi

Kullanıcının canlı sitede test ettikten sonra bildirdiği hata (birebir):
*"Generatorda analiz ediyor ama alan eklemiyor prompt ve prompt istegi
oluşturmada da ilgili alana çıkan promptu girmiyor."*

**Kök neden — Edge Function henüz yeniden deploy edilmemiş olması, EN
OLASI açıklama:** Bölüm 9.45'in `supabase/functions/analyze-image/index.
ts`'i yalnızca depoya yazıldı — Supabase Edge Function'ları git push ile
OTOMATİK deploy olmuyor (`.github/workflows/deploy.yml` incelendi: yalnızca
statik Next.js export'unu GitHub Pages'e yayınlıyor, hiçbir `supabase
functions deploy` adımı yok, hiçbir CI/CD adımı Supabase'e dokunmuyor).
Kullanıcı `supabase functions deploy analyze-image`'ı henüz çalıştırmadıysa,
canlı projede hâlâ ESKİ (mode'suz, düz şemalı — `mappedValues`/
`suggestedFields`/`analysis`/`suggestedDescription` gibi yeni anahtarları
hiç içermeyen) Edge Function kodu çalışıyor olurdu. Bu, TAM OLARAK
kullanıcının gördüğü davranışı üretir:
- **Generator:** `resolveGeneratorVisionMapping` `result.mappedValues ??
  {}`'i okur — eski şemada bu anahtar hiç yok, boş nesneye düşer, hiçbir
  değer eşleşmez. `sanitizeSuggestedFields(result.suggestedFields, ...)`
  `Array.isArray(suggested)` kontrolüyle `undefined`'ı sessizce boş diziye
  çevirir. Sonuç: `matchedRows.length === 0 && suggestedFields.length ===
  0` → ekranda tam olarak "Analiz tamamlandı — görselden bu generatorla
  eşleşen bir değer veya yeni alan önerisi çıkarılamadı." (ekran
  görüntüsündeki mesajla birebir).
- **Prompt/İstek:** `result.analysis`/`result.prompt`/`result.
  suggestedFields`/`result.suggestedDescription` eski şemada hiç yok —
  `Object.entries(result.analysis)` gibi korumasız erişimler
  YAKALANMAMIŞ bir `TypeError` fırlatabilirdi (kullanıcı ekran
  görüntüsünde ayrıca bir "Bu sayfa yüklenemedi" tarayıcı hatası da
  gösterdi — bu, bağımsız bir ağ/tablet sorunu olabilir ama JS
  hatasıyla da tutarlı).

**İkinci, gerçek bir kod eksikliği (Edge Function deploy'undan bağımsız,
her hâlükârda düzeltilmesi gereken):** `src/lib/supabase/image-analysis.
ts`'in `analyzeImage()`'ı `payload.data`'nın `mode`'a göre GERÇEKTEN doğru
şekilde olup olmadığını hiç kontrol etmiyordu — yalnızca `payload.success
=== true && payload.data && typeof payload.data === "object"` bakıyordu.
Bu, eski/uyumsuz bir şeklin sessizce "başarılı" sayılıp devam etmesine
izin veriyordu; kullanıcıya hiçbir açık hata gösterilmiyordu (Generator'da
"hiçbir şey bulunamadı" gibi yanlış bir "normal" sonuç, Prompt/İstek'te
ise yakalanmamış bir crash riski).

**Düzeltme — `src/lib/supabase/image-analysis.ts`'e yeni
`validateModeShape(mode, value)`:** `payload.success`/`payload.data`
kontrolünden HEMEN SONRA, her `mode` için gerçekten beklenen anahtarların
var olup olmadığını doğruluyor (`generator_builder` → `mappedValues`
nesnesi + `suggestedFields` dizisi; `prompt_builder` → `analysis` nesnesi
+ `prompt` string'i; `prompt_request` → `analysis` nesnesi +
`suggestedFields` nesnesi + `suggestedDescription` string'i). Şekil
uymuyorsa artık sessizce devam ETMİYOR — `{ok: false, error: {kind:
"malformed_response", message: "Analiz sonucu okunamadı. Lütfen tekrar
dene."}}` dönüyor, VE `console.error` ile geliştiriciye özel, Edge
Function'ın yeniden deploy edilmesi gerekebileceğini açıkça söyleyen bir
tanı mesajı yazıyor (`'"${mode}" modu için beklenmeyen response şekli —
Edge Function henüz yeniden deploy edilmemiş (eski, mode'suz sürüm)
olabilir. Bkz. "supabase functions deploy analyze-image".'`). Kullanıcıya
gösterilen mesaj kasıtlı olarak genel/Türkçe kaldı (dahili deploy
detaylarını son kullanıcıya sızdırmamak için) — ama artık en azından
DÜRÜST bir hata, yanlış bir "hiçbir şey bulunamadı" değil.

**Savunma derinliği — üç assist panelinin kendisi de sertleştirildi**
(şekil doğrulaması bir şekilde atlanırsa/gelecekte bir üçüncü mod eklenip
unutulursa bile hiçbir zaman çökmesin diye): `prompt-vision-assist.tsx` ve
`request-vision-assist.tsx`'teki `Object.entries(result.analysis)`
çağrıları `Object.entries(result.analysis ?? {})` oldu;
`request-vision-assist.tsx`'in `suggestedFieldsLine()`'ı artık `fields`
parametresini `fields ?? {}` ile güvenli hale getirip `undefined` bir
nesneye erişmeye çalışmıyor. `generator-vision-mapping.ts`'in
`resolveGeneratorVisionMapping`/`sanitizeSuggestedFields`'ı zaten
(`?? {}` / `Array.isArray` korumalarıyla) baştan güvenliydi — DEĞİŞMEDİ.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (placeholder Supabase env ile, 25 statik rota, değişmedi) sıfır
hatayla geçti. `.github/workflows/deploy.yml` gerçekten okunup Edge
Function deploy'unun CI'da hiç yer almadığı doğrulandı (kök neden
hipotezinin varsayım değil, gerçek bir doğrulama olduğunu göstermek için).
**Gerçek bir canlı Supabase/Gemini çağrısı bu sandbox'ta yine hiç test
edilemedi** (Bölüm 17'den beri tekrarlanan aynı ağ kısıtı) — bu düzeltme
yalnızca statik olarak doğrulanabildi; kullanıcının önce **`supabase
functions deploy analyze-image`**'ı çalıştırıp SONRA üç akışı da (Generator
Builder alan doldurma/öneri, Prompt oluşturma, içerik türü Görsel bir
istek oluşturma) yeniden denemesi gerekiyor. Eğer deploy'dan SONRA bile
sorun sürerse, artık en azından ekranda "Analiz sonucu okunamadı" gibi
net bir hata görünecek (sessizce "bulunamadı" değil) ve tarayıcı konsolundaki
`[image-analysis] "..." modu için beklenmeyen response şekli` logu gerçek
şekli gösterecek — bu, bir sonraki tanı adımını çok daha hızlı hale
getiriyor.

**Bilinen sınırlamalar:**
- Kök nedenin GERÇEKTEN "Edge Function henüz deploy edilmedi" mi yoksa
  başka bir uyumsuzluk mu olduğu bu sandboxta kesin olarak
  doğrulanamadı — yalnızca CI/CD'nin bunu hiç yapmadığı (dolayısıyla
  manuel adımın atlanmış olması yüksek ihtimal olduğu) doğrulandı.
- İkinci ekran görüntüsündeki "Bu sayfa yüklenemedi" tarayıcı hatası
  (`/create/?mode=prompt`) ayrıca teşhis edilmedi — kullanıcının
  tabletindeki geçici bir bağlantı sorunu mu yoksa uygulamadan kaynaklı
  bir JS hatası mı olduğu belirsiz; yukarıdaki düzeltme sonrası bu
  hâlâ oluyorsa ayrıca bildirilmesi gerekiyor.
