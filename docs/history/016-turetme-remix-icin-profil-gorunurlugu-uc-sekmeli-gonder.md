### 9.16 Türetme (remix) için profil görünürlüğü + üç sekmeli gönderi bölümü + "Türet" terminolojisi

Kullanıcının üç parçalı isteği üzerine: (1) bir remix oluştururken de,
tıpkı bir isteğe yanıt verirken olduğu gibi, "profilimde görünsün mü?"
seçeneği eklendi; (2) prompt detay sayfasındaki sekme grubu Yorumlar/
Remixler/Remix Dallanma Haritası olarak üçe çıkarıldı, varsayılan sekme
Yorumlar oldu; (3) "Remix"/"Remixler" kelimelerinin göründüğü UI
etiketleri/butonları "Türet"/"Türetilen promptlar" olarak yeniden
adlandırıldı, ve "Remix zinciri" (bu projede "Remix geçmişi" ile eşdeğer
tek etiket) "Türetme geçmişi" oldu.

**1. Türetme için profil görünürlüğü — hem UI hem alttaki filtre gerçekten
çalışıyor:**
- **Gerçek eksik neredeydi:** `createRealPrompt` (`lib/supabase/prompts.ts`)
  zaten `input.showOnProfile`'ı `remixOf` set olsa da olmasa da koşulsuz
  `prompts.show_on_profile`'a yazıyordu — veritabanı yazma yolu baştan beri
  hazırdı. Gerçek eksik iki yerdeydi: (a) `CreatePromptForm` yalnızca
  `isAnswerMode`'da `showOnProfile` state'ini kullanıyordu, remix modunda
  her zaman `true` gönderiyordu — arayüzde seçici de yoktu; (b)
  `filterProfileVisible()` yalnızca `origin.type === "request-response"`
  için `showOnProfile`'a bakıyordu, `"remix"` için asla — yani bir remix'i
  gizlemeyi seçmiş olsan bile `false` yazılan değer hiçbir listede
  gerçekte hiçbir şeyi gizlemiyordu (yazma çalışıyordu, okuma/filtre
  yoksayıyordu).
- **Düzeltme:** `filterProfileVisible` artık `prompt.origin.type ===
  "original" || prompt.showOnProfile` — hem `request-response` hem
  `remix` kökenli bir gönderi artık aynı kuralla filtreleniyor. Bu
  filtrenin BİLİNÇLİ OLARAK uygulanmadığı yerler (Bölüm 21 Faz 5'ten beri
  aynı ilke) değişmedi: `fetchRemixesOf`/`fetchRemixChain` (bir remix'in
  kendi kaynağa/köke/alt-remixlere ilişkisi ve harita/zincir görünümü, bu
  tercihe bakmaksızın her zaman doğru çözülmeli) ve `fetchPromptById`
  (doğrudan bir link). Yani "profilimde paylaşma" seçilen bir remix,
  yazarın normal profil/akış/keşfet/arama sonuçlarından çıkıyor AMA
  kaynağının kendi "Türetilen promptlar" listesinde/haritasında
  görünmeye devam ediyor — request-response yanıtlarının isteğin kendi
  yanıt listesinde her zaman görünmeye devam etmesiyle birebir aynı
  mantık.
- **`CreatePromptForm`:** "Bu yanıt profilimde görünsün mü?" bloğu artık
  `isAnswerMode || isRemixMode` koşuluna genişletildi, aynı iki radyo
  seçeneği (varsayılan "Profilimde paylaş") ile — yalnızca başlık ve
  açıklama metinleri moda göre değişiyor ("Bu türetme profilimde
  görünsün mü?", ve "Profilimde paylaşma" açıklaması remix bağlamında
  "kaynağının remix listesinde/haritasında görünmeye devam eder" diye
  netleştiriyor, çünkü bu, isteğe yanıt modundan farklı bir görünürlük
  yüzeyi). `showOnProfile` hem gerçek gönderim (`handleSubmit`) hem canlı
  önizleme (`previewPrompt`) için `isAnswerMode || isRemixMode ?
  showOnProfile : true` olarak güncellendi — düz "Prompt Oluştur" ve
  "Kopyasını Oluştur" modları (ikisi de zaten her zaman görünür olmalı,
  gizleyecek bir "kaynak" kavramları yok) değişmeden `true` kalıyor.
- **Nasıl doğrulandı (ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla,
  Playwright):** `/create?remix=<id>` sayfasında "Bu türetme profilimde
  görünsün mü?" seçicisinin göründüğü, "Profilimde paylaşma"nın
  seçilebildiği, ve gerçek gönderimde INSERT gövdesinin gerçekten
  `show_on_profile: false` taşıdığı (network isteği doğrudan yakalanarak)
  doğrulandı — arayüz seçimi ile veritabanına yazılan değer arasında hiç
  kopukluk yok.

**2. Üç sekmeli gönderi bölümü, varsayılan "Yorumlar":** `prompt-detail-
view.tsx`'teki sekme state'i `"remixes" | "map"`'ten `"comments" |
"remixes" | "map"`'e genişledi, varsayılan değer `"comments"` oldu.
`CommentSection` artık ayrı, sekmelerin DIŞINDA duran bir blok değil —
üçüncü, ilk sıradaki "Yorumlar" sekmesinin içeriği. Sekme sırası:
**Yorumlar → Türetilen promptlar (N) → Remix Dallanma Haritası**.
`CommentSection`'ın kendi "Yorumlar (N)" başlığı (canlı sayaç) değişmeden
korunduğundan, "Yorumlar" sekme butonunun kendisi bir sayı taşımıyor —
tıpkı "Remix Dallanma Haritası" sekmesinin de kendi "N içerik" rozetini
zaten kendi araç çubuğunda gösterip sekme butonunda tekrarlamaması gibi
(Bölüm 9.15'te kurulan aynı "sayaç iki kez gösterilmesin" ilkesi).
Bildirimden gelen bir yorum/yanıt derin bağlantısı (`?hl=comment:<id>`)
ekstra bir sekme-değiştirme mantığına ihtiyaç duymuyor — Yorumlar zaten
varsayılan sekme olduğundan otomatik olarak doğru yerde açılıyor.
`aria-label="Remix görünümü"` artık artık üç bölümü de kapsadığından
`aria-label="Gönderi bölümleri"` olarak güncellendi.

**3. "Remix"/"Remixler" → "Türet"/"Türetilen promptlar" yeniden
adlandırması:** Yalnızca gerçek UI etiketleri/buton metinleri/rozet
metinleri değiştirildi — kod içi tip adları (`RemixGraphNode`,
`isRemixMode`, `origin.type === "remix"` gibi), dosya adları ve düz-yazı
açıklama cümleleri (ör. "remixi olarak dolduruldu" bilgi bandı, `Remix
Dallanma Haritası` sekme adının kendisi) kasıtlı olarak DOKUNULMADI —
şartname yalnızca üç kesin eşleme verdi (Remix→Türet, Remixler→Türetilen
promptlar, Remix geçmişi→Türetme geçmişi) ve bunu "butonlarda görünen
isim" diye çerçeveledi; bu üçünün doğal karşılıkları/tekrarları olan
yerler (tab/sekme etiketleri, rozetler, sayaç etiketleri) de aynı
mantıkla güncellendi, ama "Remix Dallanma Haritası" gibi listede açıkça
YER ALMAYAN özel isimler değiştirilmedi. Değiştirilen tam liste:
- `prompt-detail-view.tsx`: origin rozeti "Remix"→"Türet"; "Remix
  zinciri:" breadcrumb etiketi→"Türetme geçmişi:" (bu projede ayrı bir
  "Remix geçmişi" string'i hiç yoktu — zincir breadcrumb'ı bunun tek,
  en yakın karşılığı); "Remixle" eylem butonu→"Türet"; sekme etiketi
  "Remixler (N)"→"Türetilen promptlar (N)".
- `create-prompt-form.tsx`: remix modu başlığı "Remix Oluştur"→"Türet";
  remix ön-doldurmasının başlığa eklediği "(remix)" son eki→"(türetme)".
- `remix-map-node-card.tsx`: harita düğümü rozeti/aria-label'ı (Orijinal/
  Remix)→(Orijinal/Türet).
- `remix-node-detail-panel.tsx`: düğüm detay panelindeki rozet
  (Orijinal/Remix)→(Orijinal/Türet); "Remix sayısı:"→"Türetme sayısı:";
  "Remix Oluştur" butonu→"Türet".
- `remix-branch-map.tsx`: harita lejantındaki "Remix" swatch
  etiketi→"Türet".
- `profile-view.tsx`: profil sekmesi `label: "Remixler"`→`"Türetilen
  promptlar"`; boş-durum başlığı "İlk remixini oluştur"→"İlk türettiğin
  promptu oluştur".
- `profile-badges.tsx`: rozet etiketi "İlk remixini oluşturdu"→"İlk
  türettiği promptu oluşturdu".
- `profile-stats.tsx`: profil istatistik butonunun etiketi
  (`label="remix"`)→(`label="türetme"`) — bu, sayaca tıklanınca profilin
  "Türetilen promptlar" sekmesine geçen GERÇEK bir `<button>`, bu yüzden
  literal olarak "butonda görünen isim" kapsamına giriyor.
- `profile-toolbar.tsx`: sıralama seçeneği "En çok remixlenen"→"En çok
  türetilen".

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST yanıtlarıyla Playwright'ta iki yeni test dosyasıyla
27 senaryo (24 + 3) sıfır JS hatasıyla doğrulandı: prompt detay
sayfasında tam olarak 3 sekmenin doğru sırada (Yorumlar, Türetilen
promptlar, Remix Dallanma Haritası) göründüğü; "Yorumlar"ın varsayılan
seçili sekme olduğu VE yorum içeriğinin sayfa açılır açılmaz (tıklama
gerekmeden) göründüğü; sayfanın hiçbir yerinde "Remixler" metninin
kalmadığı; origin rozetinin "Türet" gösterdiği; "Türetme geçmişi:"
breadcrumb'ının gerçek bir >1 zincirde doğru göründüğü; sekmeler arası
geçişin doğru içerik gösterip/gizlediği; harita lejantının "Türet"
kullandığı; `/create?remix=<id>`'de başlığın "Türet" olduğu, görünürlük
seçicisinin göründüğü, başlığın "(türetme)" son ekiyle dolduğu, ve
seçilen radyonun gerçekten işaretlenebildiği; gerçek bir profilde
"Türetilen promptlar" sekmesinin ve "türetme" istatistik butonunun
göründüğü; ayrı bir testte remix gönderiminin gerçek INSERT gövdesinin
`show_on_profile: false`'u doğru taşıdığı. Ayrıca Bölüm 9.14/9.15'in
42 senaryolu tam merge/harita regresyon paketi (sekme metni/varsayılanı
güncellenerek — davranış değil, yalnızca isimler değişti), 32 senaryolu
bildirim merkezi paketi, 19 senaryolu yorum ağacı paketi, 5 senaryolu
yorum-profil-linki paketi ve 19 rotalık genel dayanıklılık taraması
sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen mevcut şema/RPC'ler üzerinde, yalnızca frontend'de çalıştı), bu
yüzden kullanıcının Dashboard'da yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:**
- **Düz-yazı cümlelerdeki "remix" kelimesi değiştirilmedi** (ör.
  `post-context.tsx`'teki "Remixlenen çalışma" kutu başlığı,
  `create-prompt-form.tsx`'teki "...içeriğinin remixi olarak dolduruldu"
  bilgi bandı, kod içi Türkçe yorumlar) — şartname yalnızca üç kesin
  buton/etiket eşlemesi verdi, düz-yazı açıklama cümlelerini kapsamıyordu;
  bunları da değiştirmek, istenmeyen bir kapsam genişlemesi ve tutarsız
  yarı-çeviri riski olurdu.
  **Güncelleme — bkz. Bölüm 9.17 ve 9.18:** kullanıcı daha sonra hem
  "Remixlenen çalışma" kutu başlığını (Bölüm 9.17'de "Türetilen çalışma"
  oldu) hem "...içeriğinin remixi olarak dolduruldu" bilgi bandını
  (Bölüm 9.18'de "...içeriğin türetilen promptu olarak dolduruldu" oldu)
  değiştirmeyi istedi — her ikisi de bu sonraki bölümlerde tersine
  çevrildi. Kod içi Türkçe yorumlar (kullanıcıya hiç görünmeyen) hâlâ
  dokunulmadı.
- **"Remix Dallanma Haritası" adı değişmedi** — bu, üç kesin eşlemeden
  hiçbirine birebir uymuyor (ne yalın "Remix" ne "Remixler" ne "Remix
  geçmişi"), kendi özel bileşik adı; kasıtlı olarak dokunulmadı.
  **Güncelleme — bkz. Bölüm 9.17:** kullanıcı bu ismi de değiştirmeyi
  istedi, bu karar Bölüm 9.17'de tersine çevrildi.

---
