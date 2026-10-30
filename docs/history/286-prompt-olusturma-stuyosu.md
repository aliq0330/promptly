# 286 — Prompt oluşturma: tam ekran stüdyo düzeni (B · Bölünmüş canlı)

**Durum:** kod yazıldı, **derlenmedi ve çalıştırılmadı** (bu oturumda `registry.npmjs.org` ağ politikasınca engelliydi: `npm ci` başarısız, `node_modules` yok → `tsc`/`lint`/`build`/birim ve Playwright testleri koşmadı). Yalnız istemci kodu, migration yok. Yalnızca global `tsc` ile sözdizimi ve "tanımsız ad / kullanılmayan içe aktarma" taraması yapıldı (React/Next tipleri olmadan tip denetimi anlamsız). Gerçek Supabase'e / telefona / iOS Safari klavyesine karşı denenmedi.

## Neden
Prompt yazma ekranı tek sütunlu uzun bir formdu; önizleme yalnız `lg`+ yan yuvada, değişken değerleri ise ayrı bir "Önizleme" sekmesindeydi. Kullanıcı üç yerleşim mockup'ı arasından **B · Bölünmüş canlı**'yı seçti ve "mockup'ın birebir aynısı"nı istedi: yazarken değişken doldurmak ile sonucu görmek aynı yerde olsun.

## Düzen (`ComposeShell studio`, `features/content/compose.tsx`)
- **Masaüstü (`lg`+):** `h-dvh` tam ekran; 52 px üst çubuk (✕ · "Yeni prompt" · Taslaklar · durum · Taslak · Paylaş), altında solda **kayan form** (`[data-compose-scroll]`, içerik en çok 712 px, ortalı), sağda **408 px sabit sütun** (`[data-compose-aside]`, `bg-surface-soft`, `border-l`). Sayfanın kendisi kaymaz.
- **Telefon (`lg` altı):** tek sütun, sayfa kayar; üst çubukta yalnız ✕ · başlık · Paylaş (Taslak/Taslaklar yalnız `lg`+). Sağ sütun yerine `bottom` yuvası (aşağıda).
- Diğer formlar (İstek, Workflow, Hazır ayar) `studio` vermediği için **değişmedi**.
- Form parçaları `ComposeStudioProvider` bağlamıyla stüdyoya uyar (`compose-form.tsx`: `useComposeStudio`): `ComposeSection` (17 px Bricolage başlık, çizgisiz), `FormField` (etiket + "Zorunlu" soluk + sağda sayaç `19/80`, hata ikonlu), `FormDisclosure` (kenarlıksız satır: ad solda, değer/ipucu sağda, `›`), `ContentTypePicker` (hap düğmeler, seçiliyken tür ikonu), `studioInputClassName`, `FormDisclosureGroup`.

## Sol sütun (sırası eskisiyle aynı, hiçbir alan çıkmadı)
Temel bilgiler (tür, başlık) → Prompt (editör + çipler, "Üretim ayarları" satırı, görseller [84 px küçük resim, "Kapak" rozeti, kesikli ekle kutusu], açıklama) → İsteğe bağlı ayrıntılar (Araç, Kategori, Etiketler, DNA, Referans + "Önerilen:" çipleri) → Kim görsün?.
- **Editör** (`PromptComposer studio` + `PromptDocEditor studio`): çip araç çubuğu `{ } Değişken ekle · Katalogdan · Görselden yardım` (Görselden yardım çipi `ImageHelpPanel bare`'i açar/kapar), 14 px mono, satır aralığı 1.85, `rounded-2xl`, altında `301 karakter · 4 değişken · Hepsi metinde kullanılıyor` (kullanılmayan varsa uyarı). Şablon/Önizleme sekmesi ve editör altındaki değişken listesi kalktı (liste "Tüm değişkenler" yan panelinde durur).
- **Kim görsün?** (`PublishPanel`, stüdyo kipi): seçenekler alt yazılı ve sağda ikonlu kartlar; "Topluluklarda da alıntıla" bir **onay kutusu** (işaretlenince topluluk seçici + not açılır, kaldırılınca seçim silinir); "ne olacak" cümlesi gri kutu; eksikler tek kırmızı kutuda "Düzelt" bağlantısıyla; altta (yalnız `lg`+) Taslak olarak kaydet + Paylaş. Telefonda bu düğmeler alt çubuktadır.

## Sağ sütun (`features/prompts/prompt-live-preview.tsx`)
1. **Canlı önizleme · Akışta böyle görünür** — gerçek `PromptCard` (görsel kart; `inert`, tıklanamaz/odaklanamaz); kapak kutusu CSS ile **210 px**'e sabit (`[data-live-card]`, `globals.css`), görsel kırpılır. Kart metni (görselsiz promptta) değişkenleri çözülmüş gösterir.
2. **Kopyalanacak metin** — ek ayarlar eklenmiş, değişkenleri çözülmüş metin; değerler turuncu işaretli (`segmentPromptText`).
3. **Değerler · + Yeni** — her değişken için kart: `{ad}` · "N yerde" · kalem (düzenle) · çöp kutusu (iki adımlı silme, eski `VariableList` mantığı) ve tipine uygun girdi (`VariableField hideLabel`: metin, seçim, çoklu seçim, sayı, kaydırıcı, aç/kapa). Koşullu değişkenler `effectiveVariableValues` ile canlı prompttaki gibi gizlenir. Geniş girdiler (çip seçenekleri, kaydırıcı) iki sütunu kaplar.
Değerler (`previewValues`) formda tutulur; `PromptTextEditor` artık `forwardRef` + `PromptTextEditorHandle` (`editVariable`, `deleteVariable`, `createVariable`, `insertVariable`) sunar: sağ sütunun düğmeleri editörün modallarını açar, iki yerde ayrı değişken mantığı yok.

## Telefon yuvası (`prompt-mobile-dock.tsx`)
- **Prompt metni yazılırken** (editör odakta): klavyenin hemen üstünde tek satır önizleme (dokununca **Önizleme sayfası**) + değişken çipleri (dokununca imlece `{ad}` ekler) + "+ Yeni". Düğmeler `mousedown/pointerdown`'ı yutar → klavye ve imleç kaybolmaz. Konum `useKeyboardViewport` ile görünür alanın altına oturur.
- **Aksi hâlde:** Taslak | Paylaş alt çubuğu (eksik varken Paylaş soluk ama basılır).
- **Önizleme sayfası:** `SpaceDialog` (başlık + ✕ sabit, gövde kayar, alt satır "Yeni değişken | Bitti"); içerik sağ sütunla aynı (`PromptLivePreview columns={1}`).

## Mockup'tan bilinçli sapmalar
- **Kalem ve çöp kutusu** değer kartlarında var (mockup'ta yoktu): değişken düzenleme/silme işlevi başka bir yerde kalmadığı için.
- **"Profilimde göster" anahtarı** yalnız istek yanıtında çizilir (normal prompt için böyle bir ayar yok; çalışmayan anahtar koyulmadı).
- **Etiket:** mockuptaki "Üretim ayarları" satırı mevcut "Hazır ayarlar ve ek alan önerileri" panelini açar (değer: "N ayar" / "Seçilmedi").
- Görsel kart altında gerçek `PromptCard` altbilgisi (ad, ♥ 💬 🔖 ⋮) çizilir; mockup'taki "@kullanıcı" yerine görünen ad.
- Telefonda mockup'taki 11–12 px yazı ölçeği yerine okunabilir ölçek (editör iOS yakınlaştırması için 16 px).

## i18n
Tüm yeni metinler `translations.ts`'te `studio.*` (+ `publish.publicHint/privateHint/communityHint`) için **TR + EN eklendi**. Eski kullanılmayan üç `publish.*Hint` anahtarı (farklı metinli, hiçbir yerde okunmuyordu) silindi.

## Testler
- Yeni: `tests/messaging-ui/run-prompt-studio.mjs` (7 senaryo: masaüstü düzen/ölçüler, canlı yansıma + "Yeni" penceresi, eksik alan, satır içi ayrıntılar + onay kutusu, telefon alt çubuğu, dock + önizleme sayfası, İngilizce). **Yazıldı, koşturulmadı.**
- Güncellendi: `run-create-destination.mjs` senaryo 15 ("Hazır Ayarlar…" düğme adı → "Üretim ayarları").
- Koşturulması gerekenler: `run-prompt-studio`, `run-create-destination`, `run-community-posts`, `run-preset-try` (Studio → `/create?fromGenerate=1`), `run-scale`.

## Bilinçli sınırlar / bilinenler
- Derleme/lint/test çalışmadı (yukarıya bak): ilk iş `npm ci && npx tsc --noEmit && npm run lint && npm test && npm run build`, sonra yukarıdaki Playwright paketleri.
- Telefonda `SelectionToolbar docked` (metin seçilince) ve yeni dock aynı alt kenarı paylaşır; üst üste binme gerçek cihazda denenmedi.
- Dock'un klavye üstü konumu `visualViewport`'a dayanır; iOS Safari/Android Chrome'da denenmedi.
- Görselsiz (metin) promptta kart kapağı prompt metnini gösterir; 210 px kırpma uzun metni keser (kartın kendi solma efekti yok).
