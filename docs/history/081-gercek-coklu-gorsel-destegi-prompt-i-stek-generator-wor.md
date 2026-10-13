### 9.81 Gerçek çoklu görsel desteği (Prompt/İstek/Generator/Workflow) + gönderenin local sayfasında tam ekran görüntüleyici (lightbox)

Kullanıcının üç parçalı isteği üzerine — (a) bir gönderinin `/…/local`
sayfasında görseline tıklayınca tam ekran, iyi tasarlanmış bir görüntüleyici
açılması, (b) Prompt/Prompt İsteği/Generator/Workflow oluştururken artık tek
değil, BİRDEN FAZLA görsel yüklenebilmesi, ve (c) birden fazla görseli olan
bir gönderi KARTININ ne göstereceğine dair farklı, gerçek seçeneklerin
açıklanıp görsel olarak sunulması (sessizce tek bir karara varılmadan).

**(a) Tam ekran görüntüleyici — `src/components/ui/image-lightbox.tsx`
(`ImageLightbox`):** `Modal`'ın (kart-şeklindeki panel için tasarlanmış)
yerine doğrudan `Portal` üzerine kurulu, kenardan kenara siyah arka planlı
(`bg-black/95`), `Modal`'ın KENDİ scroll kilidini (`lockBodyScroll`/
`unlockBodyScroll`, artık `export` edildi — ikinci bir kilit icat edilmedi)
yeniden kullanan bir bileşen. Escape/arka plana tıklama kapatıyor; birden
fazla görselde ok tuşlarıyla gezinme, ekran üstü ileri/geri okları, "N / M"
sayaç, ve alt kısımda herhangi bir görsele doğrudan atlayan bir küçük resim
şeridi var — tek görselde bu fazla chrome'un hiçbiri render edilmiyor.
Dört detay sayfasının (`prompt-detail-view.tsx`, `request-detail-view.tsx`,
`generator-detail-view.tsx`, `workflow-view.tsx`) hepsine aynı desenle
bağlandı: kapak görseli artık gerçek bir `<button onClick={() =>
setLightboxIndex(0)}>`, varsa bir küçük-resim şeridi (`media.slice(1)`,
her biri kendi index'iyle açıyor), ve koşullu `{lightboxIndex !== null &&
<ImageLightbox images={...media...} .../>}`.

**(b) Çoklu görsel yükleme — hem Prompt/İstek (gerçek Storage yüklemesi)
hem Generator/Workflow (yerel data URL) için, TEK bir paylaşılan arayüzle:**
- `src/lib/supabase/media-input.ts` — `MediaInput`
  (`{file?, existing?, alt?}`) ve `resolveMediaInputs(items, defaultAlt,
  uploadFile)` (Prompt/İstek'in ERTELENMİŞ dosya yükleme adımı için —
  seçilen her görsel gerçekten yüklenmeden önce yalnızca yerel bir önizleme
  olarak tutuluyor); `MultiImageItem` (`{key, url, width, height, file?,
  existingId?}`, UI'ın kendi sıralı listesi) + `multiImageItemFromMedia`/
  `toDeferredMediaInputs` dönüştürücüleri. Generator/Workflow için
  `resolveMediaInputs`'a HİÇ gerek yok — `MultiImagePicker`'ın seçtiği anda
  görsel zaten tam bir data URL'e çözülmüş oluyor (Bölüm 9.27'nin kararı),
  bu yüzden `GeneratorMetaInput.media`/`SaveWorkflowInput.media` doğrudan
  `MultiImageItem[]` tipinde — gereksiz bir async katmanı eklenmedi.
- `src/features/content/multi-image-picker.tsx` (`MultiImagePicker`) —
  paylaşılan seçici: küçük resim ızgarası (kaldır, sağa/sola taşı, ilk
  görselde "kapak" rozeti), gizli `<input type="file" multiple>`'lı bir
  "ekle" karosu.
- **Migration (GERÇEKTEN canlı Supabase projesine uygulandı, Supabase MCP
  `apply_migration` ile — `aliq0330's Project`, proje id
  `xqxybhjcyrvaroknucdq`):** `prompt_media`'nın (zaten çoklu görsele hazır
  — `prompt_id` üzerinde tekillik kısıtı yok, `position` kolonu zaten var)
  BİREBİR AYNI şeklini `prompt_request_media`/`generator_media`/
  `workflow_media` olarak üç yeni tabloya genişletti; RLS'leri kendi
  ebeveyn tablolarının (`prompt_requests`/`generators`/`workflows`)
  görünürlük/sahiplik politikalarını birebir yansıtıyor. Eski skaler
  kolonlar (`reference_image_url/width/height`, `cover_url`) SİLİNMEDİ
  (projenin "yıkıcı olmayan migration" konvansiyonu) — yalnızca artık
  kullanılmıyorlar. Backfill gerçekten çalıştırıldı ve doğrulandı:
  `prompt_request_media` 1 satır, `generator_media` 60 satır,
  `workflow_media` 1 satır — hepsi migration öncesi dolu skaler kolon
  sayısıyla birebir eşleşiyor.
- `src/types/index.ts`: `PromptRequest`/`Generator`/`Workflow`'a zorunlu
  `media: PromptMedia[]` eklendi; `referenceImage`/`coverUrl` artık
  `media[0]`'dan türeyen, geriye dönük uyumluluk için korunan alanlar.
- `src/lib/supabase/{prompts,requests,generators,workflows}.ts`: her birinin
  `fetch*`/`map*Row`'u yeni tabloyu (positiona göre sıralı) okuyup, boşsa
  eski skaler kolona düşüyor. Yazma tarafı: `createRealPrompt`/
  `updateRealPrompt` artık `images: MediaInput[]` alıp `resolveMediaInputs`
  ile GERÇEKTEN `prompt-media` bucket'ına (`{authorId}/{promptId}-{index}.
  ext`) yüklüyor, `prompt_media`'ya replace-all yazıyor.
  `createRealRequest`/`updateRealRequest` aynı deseni `request-references`
  bucket'ına uyguluyor — **`createRealRequest` artık gerçek `requestId`'yi
  `crypto.randomUUID()` ile ÖNCEDEN üretiyor** (Storage yolunun gerçek id'yi
  baştan referans verebilmesi için, `createPromptResult`/
  `getOrCreateDirectConversation`'ın zaten kullandığı aynı desen) ve
  **`updateRealRequest`'in imzası yeni bir zorunlu `authorId` parametresi
  aldı** (Storage yükleme yolu için) — `RealRequestsProvider`'ın
  `updateRequest` callback'i buna göre güncellendi. `createDraftGenerator`/
  `updateGeneratorMeta` ve `saveWorkflow` senkron olarak (zaten çözülmüş
  data URL'lerden) `generator_media`/`workflow_media`'ya replace-all
  yazıyor.
- `create-prompt-form.tsx`/`create-request-form.tsx`/`generator-details-
  form.tsx`/`workflow-meta-form.tsx` — hepsi tek-dosya `<input
  type="file">`'ı `<MultiImagePicker>`'a çevirdi; düzenleme modlarının seed
  efektleri `multiImageItemFromMedia(...)` ile var olan görselleri
  dolduruyor. İsteğin referans görseli artık **düzenlenebilir** (önceden
  yalnızca oluşturmada vardı — `updateRealRequest`'in yeni `images?`
  alanıyla gerçek oldu, `content_type`/`status`/seçim gibi dokunulmaması
  gereken alanlara hâlâ hiç dokunmuyor).

**(c) Kart tasarımı — sessizce tek bir karar verilmedi, dört gerçek
seçenek inşa edilip GÖRSEL OLARAK sunuldu:** `src/features/prompts/multi-
image-output-options.tsx` — `OutputBadgeOnly` (Rozet), `OutputThumbnailStrip`
(Önizleme şeridi), `OutputCollageGrid` (Kolaj/mozaik, 1/2/3/4+ görsele göre
farklı ızgara), `OutputDotIndicator` (Nokta göstergesi) — dördü de
`PromptCard`'ın GERÇEK kabuğu (başlık, prompt bloğu, etiketler, aksiyon
satırı) üzerinde, yalnızca "Çıktı" figürünü değiştiriyor; hiçbiri karta
kaydırma/sürükleme eklemiyor (kart zaten tek bir "stretched link",
`ContentCard`'ın kendi doküman yorumunun uyardığı stacking-context
çakışması riske girilmedi — tüm gezinme detay sayfasının yeni lightbox'ında).
Geçici `/dev/multi-image-card-options` sayfası (bu projenin `/dev/share-
modal-test`/`/dev/generator-visual-options-test` emsaliyle aynı, "gerçek
bileşenleri gerçekçi fixture'a karşı render et" ilkesi) dördünü de 5
görsellik gerçek bir prompt fixture'ıyla, offline `placeholderArt` ile
(network yok) yan yana gösterdi; statik export yerel olarak sunulup
(`npx serve` + GitHub Pages basePath'ini taklit eden symlink) ön yüklü
Chromium ile GERÇEKTEN ekran görüntüsü alınıp kullanıcıya gönderildi,
tradeoff'lar yazılı olarak açıklandı, ve `AskUserQuestion` ile seçim
sorulmadan hiçbir varsayılan uygulanmadı. **Kullanıcı Seçenek 2 — Önizleme
şeridi'ni seçti** (detay sayfasıyla aynı dili konuşuyor, varyete gerçekten
görülüyor, kart yalnızca biraz uzuyor) — `prompt-card.tsx`'e wired edildi
(`media.length > 0 && <OutputThumbnailStrip media={media} />`), diğer üçü
(ve karşılaştırma sayfası) canlı kod/doküman olarak kaldı — bu projenin
`/dev/*` harness'lerini "doğrulandıktan sonra silinebilir" yorumuyla
birlikte fiilen SAKLAMA pratiğiyle tutarlı.

**Gerçek bir hata, bu görevin KENDİ test sayfasında yakalanıp düzeltildi:**
`useEngagementEntry` (Bölüm 9.78'in paylaşılan beğeni/kaydet/takip store'u,
`src/features/content/engagement-store.ts`) `useSyncExternalStore`'u
`getServerSnapshot` olmadan çağırıyordu — bu, GERÇEK üretim sayfalarında
hiç ortaya çıkmıyordu (onlarda kart verisi her zaman bir `useEffect`
içinde, async gelir; statik export'un prerender adımı o kartları hiç
render etmez), ama bu görevin yeni `/dev/multi-image-card-options`
sayfası fixture verisini SENKRON render ettiğinden `next build`'in
statik prerender adımında gerçekten patladı ("Missing getServerSnapshot").
Düzeltme: üçüncü argüman olarak AYNI `getSnapshot(key)` fonksiyonu
eklendi (bu store'da client/server ayrımı yok — `ensureSeeded` zaten
render sırasında, senkron olarak doğru girdiyi yazıyor) — hem bu
sandbox'ta hem gelecekte benzer bir statik sayfa fixture verisi senkron
render ederse genel olarak düzeltildi.

**Nasıl doğrulandı:** Migration GERÇEKTEN canlı Supabase projesine
uygulandı (Supabase MCP, `apply_migration`/`execute_sql` ile — bu oturumda
İLK KEZ bir MCP sunucusu üzerinden doğrudan canlı şemaya erişildi;
sandbox'ın kendi `*.supabase.co`'ya doğrudan HTTPS erişimi hâlâ engelli,
`curl` ile tekrar doğrulandı — `403`), backfill satır sayıları eski skaler
kolonlarla karşılaştırılarak doğrulandı. `npx tsc --noEmit`, `npm run
lint`, placeholder Supabase env ile tam `npm run build` (38 rota — yeni
`/dev/multi-image-card-options` dahil) sıfır hatayla geçti. Dört seçeneğin
GERÇEK ekran görüntüleri (1500×1600, ön yüklü Chromium, yerel statik
sunucu) alınıp kullanıcıya gönderildi — sıfır konsol/sayfa hatasıyla.
Gerçek bir Supabase tarayıcı oturumunda (gerçek dosya seçip gerçek bir
Storage'a yükleme, gerçek bir lightbox'ı fiziksel olarak tıklama) hiç
test edilemedi — bu sandbox'ın tarayıcı/Playwright erişimi bu görev
SIRASINDA kuruldu (küresel kurulum, proje bağımlılığı değil) ve yalnızca
statik, taklit-verisiz bir `/dev/*` sayfasını render edebildi; gerçek,
canlı bir Supabase oturumuyla Playwright'ı birleştirmek (bu projenin
önceki onlarca bölümünün yaptığı "ağ seviyesinde taklit edilmiş REST
yanıtı" yöntemi) bu görevde hiç denenmedi.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`RequestCard`'a hiçbir görsel eklenmedi** — Bölüm 9.50'nin kararıyla
  bu kartın zaten hiç görsel hero'su yok (yalnızca metin), bir isteğin
  referans görseli yalnızca detay sayfasında (artık lightbox'lı) gösteriliyor.
- **`GeneratorCard`/`WorkflowCard`'ın 48px küçük kapak resmine yalnızca
  küçük bir "+N" rozeti eklendi**, dört seçenekten biri DEĞİL — bu
  kartlarda görsel zaten bir "hero" değil, kompakt bir ikon/önizleme
  (Bölüm 9.50'nin kendi kararı), bu yüzden dört seçeneğin tartışması
  yalnızca `PromptCard`'ın büyük "Çıktı" figürü için geçerliydi.
- **Diğer üç kart seçeneği (`OutputBadgeOnly`/`OutputCollageGrid`/
  `OutputDotIndicator`) ve karşılaştırma sayfası kasıtlı olarak SİLİNMEDİ**
  (yukarıda açıklandı) — bu projenin `/dev/*` harness'lerini fiilen
  saklama pratiğiyle tutarlı, canlı bir karar kaydı.

**Bilinen sınırlamalar:**
- **Gerçek bir tarayıcı oturumunda (gerçek Supabase, gerçek dosya
  yükleme, gerçek lightbox tıklaması) hiç uçtan uca test edilemedi**
  (yukarıda açıklandı) — kullanıcının canlı sitede dört oluşturma
  formunda birden fazla görsel yükleyip, bir gönderinin local sayfasında
  görsele tıklayıp lightbox'ın gerçekten açıldığını, ve kart üzerindeki
  yeni önizleme şeridini bizzat denemesi gerekiyor.
- **`updateRealRequest`'in yeni `authorId` parametresi** yalnızca
  `RealRequestsProvider`'ın kendi `updateRequest` çağrı yerinden
  geçiriliyor — bu fonksiyonu doğrudan (provider dışında) çağıran başka
  bir kod yolu yok, `grep` ile doğrulandı.
- **Eski skaler kolonlar (`reference_image_url/width/height`, `cover_url`)
  veritabanında hâlâ duruyor, hiç silinmedi** — yalnızca artık hiçbir kod
  yolu onlara yazmıyor/onlardan okumuyor (yeni tablo boşsa fallback olarak
  okunuyor); ileride ayrı bir temizlik görevinde kaldırılabilir.
