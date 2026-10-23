# 216 — Oluştur menüsü, yazma ekranı ve son kontrol penceresi (A+D)

**Durum:**
- Yalnız istemci kodu, migration yok.
- Arayüz ağ taklitli Playwright'ta sınandı (sonuçlar aşağıda).
- Gerçek Supabase'e, gerçek oturuma, cihaza, iOS Safari'ye karşı **denenmedi**. Özellikle klavye açıkken araç çubuğunun klavyenin üstüne çıkması (`visualViewport`) gerçek iPhone'da denenmeli.

Kullanıcının isteği: "Gönderi oluşturma ekranlarını standart paylaşım ekranları gibi yapabilir miyiz". Dört yön (A menü, B tek ekran, C iki adım, D son kontrol) görsellerle gösterildi. Kullanıcı **A+D**'yi seçti ve uygulanmasını istedi; mevcut özelliklerin bozulmaması şartıyla.

## A · "+" = Oluştur menüsü (`create-choice.tsx`)

- Alt menünün "+"sı ve kenar çubuğunun "Oluştur"u artık ayrı sayfaya gitmez; `CreateMenuSheet` açılır (telefonda alttan, masaüstünde ortada).
- Menünün içeriği:
  - Prompt / İstek / Hikâye büyük satır.
  - Workflow / Hazır ayar / Space küçük karo.
  - En altta "Var olan içeriği paylaş" (215'teki `ShareExistingModal`).
- Liste tek yerde (`CreateMenuList`). Doğrudan `/create` ziyareti aynı listeyi sayfa olarak gösterir; eski bağlantılar ve yer imleri çalışır, `?tag=` / `?community=` seçilen türe taşınır.

## Yazma ekranı (`content/compose.tsx`, `content/compose-fields.tsx`)

**`ComposeShell`:**
- Açıkken `html[data-compose-open]` → `[data-app-chrome]` (üst menü, kenar çubuğu, alt menü) `display: none`.
- Yerine yapışkan üst çubuk: ✕ · başlık + taslaklar (`KindDraftsButton compact`) · durum · "Paylaş".
- "Paylaş" yayınlamaz, son kontrol penceresini açar.
- `toolbar` telefonda ekranın altına yapışır, klavye açılınca `visualViewport` ile üstüne çıkar; `lg`+ yazının altında durur.
- `aside` (canlı önizleme) yalnız `lg`+ sağ sütundur.
- Çıkışta yayın adımının seçimleri (duyuru, seçilen topluluk) sıfırlanır.

**Prompt ve İstek gövdesi (kutusuz):**
- Tür çipleri (`ContentTypeChips`; düzenlemede kilitli).
- "aliq · Herkese açık" satırı (`ComposeAuthorLine`; ikinci kısım son kontrolü açar).
- Büyük başlık ve kısa açıklama.
- Prompt metin editörü: değişkenler ve "Görselden yardım" aynen.
- **Hazır ayarlar ve ek alan önerileri satırı yazma ekranında kalır** (`ExtraSettingsSection`). Kendi penceresini açar ve uygulananları çip olarak gösterir; kullanıcının "hazır öneriler bozulmasın" şartı.
- Görseller / video-ses çıktısı.
- Seçilenlerin özeti (`ComposeSummaryChips`: araç, kategori, etiketler; boşsa "+ Araç" vb.).
- **Etiket önerileri görünür kalır** (`SuggestedTagsRow`): dokununca eklenir, hiçbiri kendiliğinden eklenmez.
- İstekte açıklama, referans görseller (+ görselden yardım) ve "Yaratıcı yön" de yazma ekranında.

**Araç çubuğu → alt sayfa (`ComposeSheet`, başlık + "Bitti"):**
- Etiket (`TagPicker`; turuncu sayı = bekleyen öneri sayısı).
- Araç (`ToolPicker`).
- Kategori (`TaxonomyPicker`).
- Promptta "Gelişmiş": Prompt DNA (sayı = kabul edilen bölüm sayısı) ve referans gereksinimi.
- Bileşenler değişmedi, yalnız yerleri değişti.

## D · Son kontrol penceresi (`content/publish-sheet.tsx`; 215'teki `CreateFormActions`'ın yerine)

- **Eksikler** en üstte. Örnekler:
  - Prompt: başlık / kısa açıklama.
  - İstek: en kısa uzunluklar.
  - Workflow: `validateWorkflow`'un hataları.
  - Hazır ayar: ad, en az bir alan.
- Eksiğe dokununca pencere kapanır ve alana odaklanır ya da adımı seçer. Eksik varken "Paylaş" pasif: alt sayfaya taşınan alanın hatası saklı kalmaz.
- Kartın küçük önizlemesi (`PublishPreview`).
- **"Kim görsün?"** üçlü: Herkese açık / Sadece ben / Bir topluluk.
  - Topluluk seçimi aynı `DestinationPicker` ve aynı depo (`pickCreateDestination`); seçilen topluluk satırda görünür.
  - Yalnız yönetimin paylaşabildiği toplulukta "Paylaş" pasif, nedeni yazar (`useDestinationBlock`).
- **"Topluluklarda da duyur"** (yalnız yeni + herkese açık): çip satırı + not.
  - Seçim modül deposunda (`useAnnounceSelection`); pencere kapanıp açılsa da kalır.
  - "Paylaş" anında kurulur (`armPendingAnnounce`), içerik oluşunca `runPendingAnnounce` gönderir.
  - Sonuç kabukta `AnnounceReportNotice`'ta (215).
- "Ne olacak" cümlesi, formun bildirimleri, "Taslak" (varsa) ve "Paylaş" / "Kaydet".
- Yanıtın "profilimde göster" anahtarı bu pencerede (`extra`).

## ✕ ile çıkış (`useComposeLeave`, `useDirty`)

- Değişiklik yoksa doğrudan çıkılır (`router.back()`, geçmiş yoksa Ana Sayfa).
- Değişiklik varsa sorulur:
  - Taslak olabilen içerikte: "Taslak olarak kaydedilsin mi?" — Taslağa kaydet / Sil / Yazmaya devam et.
  - Olamayanda (yayındaki içeriği düzenleme, isteğe yanıt): "Değişiklikler kaydedilmedi" — Çık / Yazmaya devam et.
- "Taslağa kaydet" formun kendi taslak kaydını `leaving` ile çağırır: yeni taslağın düzenleme adresine gitmeden çıkılır.
- Değişmişken sekme kapatılırsa tarayıcı uyarır (`beforeunload`).
- "Değişti mi?" hazır anındaki imzayla karşılaştırılır; düzenlemede yüklenen içerik "değişmiş" sayılmaz.

## Workflow ve Hazır ayar

- Yalnız kabuk değişti: `ComposeShell` (Workflow `wide`, durum etiketi üst çubukta), aynı son kontrol penceresi ve ✕ davranışı.
- Adım editörü ve parametre kurucusu bugünkü gibi.
- Workflow'un kendi `dirty` durumu kullanılır.
- Hazır ayar ✕ → "Taslağa kaydet" taslak listesine gitmeden çıkar.

## Kaldırılanlar

- `content/create-form-actions.tsx` (yerine `publish-sheet.tsx`).
- `content/create-page-header.tsx` (yerine üst çubuk).
- `share-destination-field.tsx`'teki `AudienceField`. `DestinationPicker` ve `useDestinationBlock` kalır.

## Sınama

- `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` 400/400, `npm run build` temiz.
- Playwright:
  - `run-create-destination` yeniden yazıldı, 14/14: yazma ekranında menülerin kalkması, son kontrol, eksikler + odak, Sadece ben, topluluk seçici, topluluk / geri dönüş + seçimin korunması, yönetim kuralı, `?community=`, Prompt / Workflow / Hazır ayar'da aynı kabuk, duyuru + kısmi hata raporu, ✕ (doğrudan çıkış / devam / taslağa kaydet), "+" menüsü, boş topluluk, mobil, İngilizce.
  - `run-community-posts` 36/36 (13–13d yeni akışa göre).
  - `run-space-posts` 7/7.
  - Diğer bütün takımlar raporda.
- İngilizce karşılıklar eklendi (`createMenu.*`, `compose.*`).

## Düzeltme: örnek görsele uyum (kullanıcı: "Örnekteki resimle alakası yok")

İlk sürüm kabuğu kurmuş ama gövdede eski form parçalarını (çerçeveli prompt editörü + Şablon/Önizleme/"Değişken ekle" satırı, satır içi "Görselden yardım", büyük "Hazır Ayarlar ve Ek Alan Önerileri" kutusu, büyük görsel karosu) bırakmıştı. Örnekteki (B) yazma ekranına getirildi:

- **Düzen:** `ComposeBody` — solda avatar, sağda "Ad · Herkese açık", başlık, tek satır kısa açıklama, prompt metni, görseller, özet çipleri, önerilen etiketler (X / Threads).
- **Prompt metni:** `PromptTextEditor variant="compose"`. Kutusuz düz mono metin (`PromptComposer bare`, `PromptDocEditor bare`), üst satır yok; değişken jetonları, seçimden değişkene dönüştürme ve değişken listesi aynen. "Değişken ekle" yüzeyi araç çubuğundan açılır (`ComposerHandle.openInsert`).
- **Görseller:** `MultiImagePicker variant="strip"` (küçük kapaklar + "Görsel ekle"); araç çubuğundaki "Görsel" aynı dosya seçiciyi açar (`inputId`).
- **Gelişmiş alt sayfası:**
  - "Hazır Ayarlar ve Ek Alan Önerileri" satırı: aynı panel, `ExtraSettingsSection open/onOpenChange`; uygulananlar yazma ekranında çip olarak görünür (`compact`).
  - "Görselden yardım" satırı: `ImageHelpPanel bare` kendi alt sayfasında.
  - Prompt DNA ve referans gereksinimi.
- **Araç çubuğu:**
  - Prompt: Görsel · Etiket · Araç · Kategori · Değişken · Gelişmiş.
  - İstek: Referans · Yön · Etiket · Araç · Kategori · Yardım (isteğin "Referans görselden yardım"ı alt sayfada).
- Diğer ekranlar (Workflow meta, Hazır ayar, değişken düzenleyici) bileşenlerin varsayılan biçimini kullanır, değişmedi.
- **Sınama:** `run-create-destination` 15/15 (yeni 15. senaryo: düzen, araç sırası, Değişken ve Gelişmiş satırları), `run-community-posts` 36/36, `run-space-posts` 7/7, `run-detail-pages` 45/45, `npm test` 400/400; tsc / lint / build temiz. Gerçek cihazda denenmedi.

## Düzeltme 2: iPhone klavyesinde araç çubuğu (kullanıcının iPhone ekran görüntüleri)

**Sorun (gerçek iPhone'da görüldü):** Klavye açılınca üst çubuk (✕ · Paylaş) ekrandan kayıyor; `fixed` alt araç çubuğu ya ortada asılı kalıyor (klavye yokken bile) ya da yazının üstüne biniyordu. Sebep: iOS Safari klavye açılınca yerleşim alanını küçültmüyor, görünen alanı kaydırıyor; `visualViewport` ile elle hesaplanan kaydırma (`useKeyboardInset`) bu cihazda güvenilir çıkmadı.

**Çözüm:**
- Araç satırı artık `fixed` değil, sayfanın akışında yazının hemen altında (`ComposeToolbar`: sınırlı satır, dar ekranda yatay kayar). `ComposeShell`'den `toolbar` özelliği ve `useKeyboardInset` kaldırıldı; formlar satırı gövdeye kendisi koyar (Prompt: hazır ayar satırından sonra, görsel şeridinden önce; İstek: açıklamadan sonra).
- Klavye hesabı yok: sayfa kayarken satır yazıyla birlikte kaydığı için bozulacak bir şey kalmadı.
- Bilinçli bedel: uzun yazıda araçlar ekrandan çıkabilir (yukarı kaydırınca erişilir). "Sohbet gibi tam ekran kabuk" seçeneği de çizilmişti ama kullanıcı iPhone'da o yöntemde de (Mesajlar) sorun yaşadığını bildirdi, seçilmedi.
- Üst çubuk hâlâ `sticky`; iOS klavye açıkken görünen alanı kaydırırsa geçici olarak ekran dışında kalabilir, klavye kapanınca döner.
- Test: `run-create-destination` 13. senaryo artık araç satırının `position: static` olduğunu ve yazının hemen altında durduğunu doğrular (15/15), `run-community-posts` 36/36, `run-space-posts` 7/7. Gerçek iPhone'da yeniden denenmesi gerekir.

## Düzeltme 3: araç satırı yazının ÜSTÜNDE, yayın bilgileri "Paylaşmadan önce"de

**Neden:** Düzeltme 2'deki "yazının altında akışta" araç satırı kullanıcıya yetmedi (uzun yazıda ekrandan çıkıyor; Kategori/Etiket/Araç/Gelişmiş hazır ayarı sona itiyordu). Kullanıcı önce alternatif görseller istedi, referans olarak başka bir uygulamanın yazma ekranını (avatar + ad + hap + tek satır araç + geniş boş alan) gösterdi ve Kategori/DNA gibi yayın bilgilerinin "Paylaş"a basınca gelmesini istedi.

**Yazma ekranı (hiçbir öğe klavye geometrisine bağlı değil):**
- Üstte avatar + ad + **tür hapı** (`ContentTypePicker`: Görsel ⌄ → "Ne üretiyorsun?" alt sayfası, 4 tür; düzenlemede pasif). `ContentTypeChips` kaldırıldı. Yalnız topluluğa yazarken adın yanında hedef topluluk görünür (`data-compose-audience`).
- Hemen altında **araç satırı** (`ComposeToolbar`, sayfanın akışında, yazıdan ÖNCE): Prompt = Hazır ayar (vurgulu, seçili sayısı rozetli) · Görsel · Değişken · Görselden yardım (Görsel/Görselden yardım yalnız görsel türünde); İstek = Referans · Yön · Yardım. Hazır ayar satırdan doğrudan açılır (`ExtraSettingsSection` paneli); Gelişmiş sayfası kalktı.
- Altında tam genişlikte başlık, açıklama, mono prompt metni, seçili hazır ayar çipleri, görsel şeridi.

**"Paylaşmadan önce" penceresi** (`PublishSheet` `details` yuvası, `PublishDetailsSection`): "Kim görsün?"in altında **Gönderi bilgisi** (Kategori · Araç / Model · Etiketler + etiket önerileri çip olarak), **Gelişmiş** (Prompt DNA · Referans gereksinimi [metinde yok]); her satır ilgili alt sayfayı (`ComposeSheet`) pencerenin üstünde açar, "Bitti" ile dönülür. Sheet anahtarları: `tags | tool | category | dna | references`. Etiket önerileri artık yazarken değil yayından önce görünür; yine hiçbiri kendiliğinden eklenmez. Kategori zorunlu değildir (eksikler listesi değişmedi: başlık, açıklama).

**Çeviri:** yeni `compose.*` anahtarları (`whatMaking`, `toolPreset`, `toolVision`, `postInfo`, `suggestionCount`, `tagCount`, `notChosen`, `dnaHint`, `references`, `referencesHint`, `typeSub.*`) TR+EN eklendi.

**Test:** `run-create-destination` 13 (araç satırı `static` ve yazının üstünde) ve 15 (tür hapı, araç sırası, Paylaş → bilgi satırları → alt sayfa) güncellendi: 15/15; `run-community-posts` 36/36; `run-space-posts` 7/7; `npm test` 400/400. **Gerçek iPhone'da (klavye açıkken üst çubuğun ✕/Paylaş'ı görünür kalıp kalmadığı dahil) DENENMEDİ.** Üst çubuk hâlâ `sticky`; iOS klavye açıkken görünen alanı kaydırırsa geçici olarak ekran dışında kalabilir.
