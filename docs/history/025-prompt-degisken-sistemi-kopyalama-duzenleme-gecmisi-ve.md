### 9.25 Prompt Değişken Sistemi, Kopyalama, Düzenleme Geçmişi ve Bildirim Altyapısı

Kullanıcının çok kapsamlı "PROMPTLY — GELİŞMİŞ PROMPT DEĞİŞKEN SİSTEMİ,
KOPYALAMA, DÜZENLEME GEÇMİŞİ VE BİLDİRİM ALTYAPISI" şartnamesi üzerine —
prompt metninde `{değişken}` token'ları tanımlayabilme + görüntüleyenin
kendi değerleriyle "kişiselleştirebilmesi", dört gönderi türünün (prompt/
remix/istek yanıtı/prompt isteği) hepsinde gerçek prompt metninin hemen
üstünde bir "Kopyala" butonu, ve gerçek bir "kendi içeriğini düzenleme"
akışı + buna bağlı (bugün için çoğunlukla durgun) bir düzenleme bildirimi
altyapısı.

**AŞAMA 1 denetim bulguları (kod yazılmadan önce yapıldı):**
- Şartnamenin "dört gönderi türü" varsayımı bu uygulamanın gerçek şemasında
  yalnızca İKİ tabloya karşılık geliyor: Prompt/Remix/İstek Yanıtı üçü de
  aynı `public.prompts` satırı (`origin_type` ile ayrışıyor, Bölüm 18),
  Prompt İsteği ise ayrı `public.prompt_requests`. Dört ayrı paralel sistem
  KURULMADI — değişken sistemi yalnızca `prompts.prompt_text`'e bağlı
  (istekte ayrı bir "prompt metni" alanı hiç yok, yalnızca `description`);
  bu bilinçli bir kapsam kararı.
- **KRİTİK BULGU:** bu uygulamada hiçbir "prompt/istek düzenleme" özelliği
  YOKTU (`src/types/index.ts`'in `PromptVersion` yorumunun kendi ifadesiyle
  "this app has no 'edit prompt' feature at all") — `grep` ile doğrulandı.
  RLS (Bölüm 19) `prompts`/`prompt_requests` UPDATE'ini kesin olarak
  yalnızca `auth.uid() = author_id`'ye bağlıyor
  (`"Authors can update their own prompts/requests"` politikaları) — yani
  "başka bir YETKİLİ kullanıcı düzenledi" senaryosu bu mimaride YAPISAL
  OLARAK MÜMKÜN DEĞİL (ortak düzenleme/moderatör sistemi hiç yok, Bölüm 22
  henüz başlamadı). Şartname açıkça "ortak düzenleme sistemi yoksa sırf
  bildirim özelliği için herkese açık düzenleme yetkisi oluşturma" diye
  uyarıyordu — bu yüzden burada YENİ bir "herkes düzenleyebilir" yetkisi
  İCAT EDİLMEDİ. Bunun yerine: (1) gerçek bir "kendi içeriğini düzenleme"
  akışı bu görevle birlikte İLK KEZ kuruldu, (2) düzenleme kaydı/bildirim
  üretimi genel ve doğru şekilde `editor_id <> owner_id` koşuluna
  bağlandı — bugünkü tek-sahip modelinde bu koşul kendi kendine
  düzenlemede hiç sağlanamıyor (doğru davranış: kendine bildirim
  gitmemeli), ama altyapı gerçek ve test edilmiş; ileride bir ortak-
  düzenleme özelliği eklenirse hiçbir değişiklik gerekmeden doğru çalışır.
- Var olan kopyalama deseni (`ShareButton`, `absoluteUrl`) incelendi ama bu
  URL kopyalıyor, prompt METNİ kopyalamıyor — bu yüzden gerçekten yeni bir
  `copyTextToClipboard()` yardımcı fonksiyonu (`lib/utils.ts`) eklendi
  (Clipboard API + `execCommand` geri düşüşüyle), var olanı GENİŞLETEREK,
  paralel bir sistem kurmadan.
- Bildirim altyapısı (Bölüm 9.6/9.12'nin `SECURITY DEFINER` trigger +
  `hl=<tür>:<id>` hedefleme deseni) zaten olgun ve genişletilebilirdi — yeni
  `prompt_edited`/`request_edited` bildirim tipleri BUNU birebir aynı
  şekilde kullanıyor, paralel bir sistem kurulmadı.

**Yeni migration:** `supabase/migrations/20260919290000_prompt_variables_
and_edit_tracking.sql`:
- **`prompt_variables`** (id, prompt_id → `prompts.id` cascade, `name`
  CHECK'i 1-40 karakter + süslü parantez/boşluk YASAK — `{isim}` söz
  dizimini asla bozmasın diye; Türkçe harfler serbest, `default_value`,
  `description`, `sort_order`, `created_at`/`updated_at` — var olan
  `set_updated_at()` trigger'ı yeniden kullanıldı, yeni bir fonksiyon
  yazılmadı), `unique (prompt_id, name)` — aynı promptta aynı isimde iki
  değişken veritabanı seviyesinde imkânsız. RLS `prompt_media`/
  `prompt_tags` ile BİREBİR AYNI desen: herkese açık okuma (promptun kendi
  görünürlüğüne bağlı), yazma yalnızca `prompts.author_id = auth.uid()`.
  `prompt_requests` için AYRI bir değişken tablosu YOK (yukarıdaki kapsam
  kararı — istekte "prompt metni" hiç yok).
- **`content_edits`** — salt-okunur bir denetim tablosu (Bölüm 9.14'ün
  `audit_log`'uyla aynı ilke): istemciden HİÇBİR yazma politikası yok,
  yalnızca aşağıdaki trigger'lar dolduruyor; okuma yalnızca `owner_id`/
  `editor_id = auth.uid()` olanlara açık — tam önceki metni (`previous_
  values`) herkese açık etmemek için.
- **`notifications.type` CHECK'i** iki yeni değer aldı: `prompt_edited`,
  `request_edited`.
- **`record_prompt_edit()`** (AFTER UPDATE, `prompts`, `SECURITY DEFINER`)
  — OLD/NEW'i `title`/`description`/`prompt_text`/`tool` için karşılaştırıp
  yalnızca GERÇEKTEN değişen alanlar varsa `content_edits` satırı yazıyor
  VE `editor_id <> author_id` ise `prompt_edited` bildirimi üretiyor
  (`truncate_preview()` ile başlığı gömerek, `hl=post:<id>` hedefleyerek —
  Bölüm 9.12'nin aynı deseni). Beğeni/yorum/remix sayaçlarının veya
  `status`/`show_on_profile`'ın güncellenmesi (aynı satırda ayrı UPDATE'ler
  olarak oluşuyorlar) BU TRIGGER'I hiç tetiklemiyor bile OLSA (aynı satırda
  bu kolonlar da UPDATE'e dahil olduğunda), `array_length(v_changed, 1) is
  null` kontrolü sayesinde hiçbir kayıt/bildirim ÜRETMİYOR — "yalnızca
  kaydet butonuna basılmış olması yetmemeli" kuralı istemciye değil,
  veritabanına bağlı, istemci tarafı bir bayrağa güvenilmiyor.
- **`record_request_edit()`** aynı desenin `prompt_requests` karşılığı
  (title/description/creative_direction/preferred_tool) — `status`/
  `response_count`/`selected_response_prompt_id`/`closed_by_owner`
  değişiklikleri BİLİNÇLİ OLARAK dışarıda (zaten kendi bildirimleri var,
  Bölüm 9.2/9.6, "içerik düzenlemesi" değil, durum değişikliği).

**Yeni/güncellenen dosyalar — veri katmanı:**
- `src/lib/prompt-variables.ts` (YENİ, saf/DOM'suz fonksiyonlar —
  `tag-catalog-matcher.ts`/`prompt-diff.ts` ile aynı test edilebilirlik
  ilkesi): `normalizeVariableName`, `isValidVariableName`,
  `extractVariableTokenNames`, `countVariableUsages`,
  `renameVariableTokenInText` (yalnızca TAM token eşleşmesi — "ortam"ı
  yeniden adlandırmak "ortam2"ye asla dokunmuyor),
  `removeVariableTokenFromText`, `insertTextAtRange` (imleç/seçim
  pozisyonunda gerçek ekleme, seçiliyse seçimi değiştiriyor),
  `resolvePromptText` (tanımsız bir token'ı ASLA "undefined"a çevirmiyor,
  literal metin olarak bırakıyor).
- `src/lib/supabase/prompt-variables.ts` (YENİ) —
  `fetchVariablesForPrompt`, `replaceVariablesForPrompt` (sil-hepsini-
  sonra-yeniden-ekle, `prompt_tags`'in var olan desenle birebir aynı —
  RLS'in bir promptu yalnızca TEK sahibinin düzenleyebilmesi bunu güvenli
  kılıyor, eşzamanlı çoklu-editör yarış durumu bugün mümkün değil).
- `src/lib/supabase/content-edits.ts` (YENİ) — `fetchEditHistory`.
- `src/lib/supabase/prompts.ts` — `UpdateRealPromptInput`/
  `updateRealPrompt(promptId, authorId, input)`: sahiplik `.update().
  select().maybeSingle()` ile doğrulanıyor (RLS'in "0 satır sessizce
  etkilendi" riskine, Bölüm 9.0'ın kendi dokümante ettiği sınıfa,
  güvenilmiyor) — `content_type`/`origin` asla değişmiyor, görsel yalnızca
  gerçekten yeni bir dosya verilirse değişiyor.
- `src/lib/supabase/requests.ts` — aynı desenin `UpdateRealRequestInput`/
  `updateRealRequest` karşılığı — `content_type`/`status`/`selected_
  response_prompt_id`/`reference_image_*`'e KESİNLİKLE dokunmuyor (bunların
  zaten kendi çalışan akışları var, Bölüm 9.2).
- `real-prompts-provider.tsx`/`real-requests-provider.tsx` —
  `updatePrompt`/`updateRequest` context aksiyonları eklendi.

**Değişken sistemi UI'ı (`src/features/prompts/`):**
- `prompt-text-editor.tsx` (YENİ, `PromptTextEditor` + `DraftVariable`
  tipi) — prompt metni `<textarea>`'sını sarmalıyor: gerçek imleç/seçim
  konumunu (`selectionStart`/`selectionEnd`) izleyip "Değişken Ekle"
  butonuna basıldığında YENİ token'ı TAM O KONUMA ekliyor (metnin sonuna
  değil), "Değişkenler" panelini (`variable-list.tsx`) ve bir Şablon/
  Önizleme sekme çiftini (§3 — önizleme asla gerçek şablonu mutasyona
  uğratmıyor, yalnızca `resolvePromptText` ile ayrı bir görüntü
  hesaplıyor) render ediyor. Metinde tanımsız bir `{token}` varsa (§ orphan
  reference) dürüst bir uyarı satırı gösteriyor.
- `variable-editor-modal.tsx` (YENİ, `VariableEditorModal`) — hem "Değişken
  Ekle" hem "Değişkeni Düzenle" için tek, paylaşılan form (isim/varsayılan
  değer/açıklama + canlı `{token}` önizlemesi + tekillik/geçerlilik
  doğrulaması).
- `variable-list.tsx` (YENİ, `VariableList`) — her değişkenin GERÇEK,
  o anki metne göre yeniden hesaplanan kullanım sayısını (`countVariable
  Usages`, hiç önbelleğe alınmış bayat bir sayı değil) gösteriyor; silme
  şartnamenin tam istediği "Bu değişken prompt metninde N yerde
  kullanılıyor. Silersen bu alanlar da kaldırılacak." uyarısıyla iki
  tıklamalı onaya bağlı; yeniden adlandırma metindeki TÜM `{eskiİsim}`
  referanslarını `renameVariableTokenInText` ile günceller.
- `personalize-modal.tsx` (YENİ, `PersonalizeModal`) — herkese açık
  "Promptu kişiselleştir" akışı: her değişken için varsayılandan başlayan
  bir giriş alanı, canlı çözümlenmiş önizleme, "Varsayılanlara dön", ve —
  şartnamenin en çok vurguladığı ayrım — İKİ AYRI, asla karıştırılmayan
  kopyalama eylemi: **"Promptu Kopyala"** (görüntüleyenin kendi
  değerleriyle çözümlenmiş metin) ve **"Şablonu Kopyala"** (ham şablon,
  `{token}`'lar bozulmadan) — Playwright ile ikisinin de GERÇEKTEN farklı
  metin panoya kopyaladığı doğrulandı (aşağıya bakınız).
- `copy-prompt-button.tsx` (YENİ, `CopyPromptButton`) — dört yüzeyde de
  (bkz. aşağı) TEK, paylaşılan bileşen: her zaman ikon+görünür "Kopyala"
  etiketi BİRLİKTE (asla yalnızca ikon), gerçek bir `<button>` (klavye/
  focus erişilebilir, görünür `focus-visible` halkası eklendi), mobilde
  yeterli dokunma hedefi (`min-h-[28px]`), hızlı çift tıklamaya karşı
  `isBusyRef` koruması, başarısızlıkta gerçek bir "Kopyalanamadı" hata
  durumu (sahte bir "başarılı" göstermiyor). `lib/utils.ts`'e eklenen
  `copyTextToClipboard()`'u kullanıyor.

**"Kopyala" butonunun dört yüzeydeki gerçek yeri (şartname §10 — asla
ikinci bir menüde/kartın altında/yalnızca ikon değil):**
- **Prompt gönderisi / Türetilen (remix) gönderisi / Prompt yanıtı** — üçü
  de AYNI `prompts` satırı olduğundan, TEK bir paylaşılan bileşene
  (`PromptPreviewBox`, her kartta zaten var olan "Kullanılan prompt"
  kutusu) eklenen buton üçünü de kapsıyor — kart görünümünde VE
  `PromptDetailView`'ın kendi "Prompt Metni" bloğunda, metnin TAM üstünde.
  İkisi de yalnızca `prompt.promptText`'i kopyalıyor — başlık/yazar/etiket/
  yorum asla karışmıyor.
- **Prompt isteği** — `RequestCard` ve `RequestDetailView`'da isteğin
  gerçek talimat metninin (`description`) TAM üstüne eklendi. İsteğin
  `description`'ı zaten (form doğrulaması, min 20 karakter) her zaman
  gerçek, boş-olmayan bir metin olduğundan, "gerçek talimat metni yoksa
  buton gösterme" koşulu ayrıca kodlanmadı — yapısal olarak zaten hep var.

**Düzenleme akışı — bu uygulamanın İLK "kendi içeriğini düzenle"
özelliği:**
- `create-prompt-form.tsx`'e yeni bir `?edit=<promptId>` modu eklendi
  (`create-gate.tsx`'in `hasIntent` kontrolüne `edit` parametresi
  eklendi). Gerçek promptu (önbellek → canlı sorgu) çekip GERÇEK sahiplik
  kontrolü yapıyor (`found.author.id === user.id`) — sahibi değilse formu
  HİÇ göstermeden dürüst bir "Bu promptu düzenleme yetkin yok" ekranı
  gösteriyor (RLS zaten reddedecekti, ama kullanıcıyı tüm formu
  doldurttuktan SONRA reddetmek yerine baştan söylüyor). İçerik türü
  düzenlemede kilitli (yalnızca etiket olarak gösteriliyor, tıklanabilir
  değil); görsel opsiyonel (yeni dosya seçilmezse mevcut görsel
  değişmiyor); değişkenler `fetchVariablesForPrompt` ile önceden
  dolduruluyor. Kaydet, `updatePrompt(...)` + `replaceVariablesForPrompt(
  ...)`'i çağırıp promptun kendi detay sayfasına yönlendiriyor.
- `create-request-form.tsx`'e aynı ilkeyle `?edit=<requestId>` eklendi —
  yalnızca başlık/açıklama/yaratıcı yön/tercih edilen araç/etiketler
  düzenlenebiliyor; içerik türü kilitli, referans görsel alanı düzenleme
  modunda HİÇ gösterilmiyor (o hiç değişmiyor), durum/seçim zaten ayrı,
  kendi çalışan akışlarında kalıyor.
- `post-menu.tsx`'e (her gönderi kartının üç-nokta menüsü) yalnızca gerçek
  sahibine görünen bir "Düzenle" (Pencil ikonu) girişi eklendi;
  `request-detail-view.tsx`'e de aynı şekilde bir düzenle ikonu eklendi.
- `PromptDetailView`'a: prompt metninin üstüne `CopyPromptButton`,
  değişkeni varsa "Promptu kişiselleştir" eylemi (`PersonalizeModal`), ve
  yalnızca gerçek sahibine görünen `EditHistoryPanel` eklendi.
  `RequestDetailView`'a da aynı üçlü (kopyala zaten vardı, düzenle-linki +
  `EditHistoryPanel` eklendi).
- `edit-history-panel.tsx` (YENİ, `EditHistoryPanel`) — yalnızca sahibi
  için (RLS zaten başkasına boş döner, ama bu boş bir sorguyu baştan
  önlüyor) "Son düzenleme: … · Düzenleme geçmişi" — genişleyince hangi
  ALANLARIN (asla önceki METNİN kendisi değil, yalnızca "Başlık",
  "Prompt Metni" gibi Türkçe alan adları) ne zaman değiştiğini listeliyor.

**Gerçek, testler sırasında bulunup düzeltilen bir üretim hatası —
modalin submit'i React portal'ı üzerinden dış "yayınla" formuna
sızıyordu:** `VariableEditorModal`'ın kendi `<form onSubmit={handleSubmit}
>`ı `Modal`/`Portal` aracılığıyla `document.body`'ye taşınıyor, ama React
sentetik olay balonlanmasını GERÇEK DOM ağacına değil REACT AĞACINA göre
yapıyor (React'ın kendi resmi, dokümante edilmiş portal davranışı) — bu
yüzden modalin kendi `event.preventDefault()`'u yalnızca KENDİ hedefinin
varsayılan eylemini durduruyordu, olayın React ağacındaki gerçek atası
olan DIŞ prompt-yayınlama `<form>`'una balonlanmasını DURDURMUYORDU.
Sonuç: bir kullanıcı "Değişken Ekle"deki "Ekle"ye her bastığında, DIŞ
formun kendi `onSubmit`'i de (aynı sentetik "submit" olayıyla) tetikleniyor
ve prompt YARIM/erken bir durumda GERÇEKTEN yayınlanıyordu — bu, bu
görevin kendi yazdığı Playwright testinde (aşağıya bakınız) YAKALANDI:
"Değişken Ekle" sonrası testin sonraki adımı beklenmedik şekilde
`/prompts/local?id=...`'e yönlendirilmiş buldu kendini. Düzeltme: `Variable
EditorModal`'ın `handleSubmit`'ine `event.stopPropagation()` eklendi —
React'ın sentetik `stopPropagation()`'ı portal sınırından bağımsız olarak
REACT ağacındaki balonlanmayı doğru şekilde durduruyor. Bu, bu projenin
DAHA ÖNCE hiçbir modalinin (hiçbiri gerçek bir `<form>`'un içine
YERLEŞTİRİLMEMİŞTİ) hiç karşılaşmadığı, tamamen bu özelliğin kendi yeni
mimarisinin (bir modalin bir `<form>`'un içinde açılması) ortaya çıkardığı
gerçek bir hataydı — icat edilmiş bir senaryo değil, gerçek Playwright
testinde gerçekten yeniden üretilip düzeltildi.

**Nasıl doğrulandı:**
- **SQL/RLS (yerel PostgreSQL 16, bu oturumun bu bölümünü yazarken
  gerçekten çalıştırıldı — `/tmp/pgtest/test_edit_tracking.sql`, 11
  senaryo):** kendi promptunu düzenlemenin `content_edits` satırı
  ürettiği; kendi kendine düzenlemede (bugünkü tek-sahip modelinin TEK
  mümkün durumu) bildirim ÜRETİLMEDİĞİ; yalnızca beğeni sayacını
  güncelleyen bir UPDATE'in `content_edits`'e HİÇ dokunmadığı; başka bir
  kullanıcının (RLS altında zaten imkânsız olan) bir promptu güncelleme
  denemesinin sessizce 0 satır etkilediği; aynı desenin `prompt_requests`
  için de doğru çalıştığı; `prompt_variables`'ın tekillik/geçerlilik CHECK
  kısıtlarının (aynı isim, süslü parantez/boşluk) doğru reddettiği; RLS'in
  yalnızca gerçek sahibin değişken ekleyip/silebilmesine izin verdiği —
  hepsi gerçekten çalıştırılıp doğrulandı (bu migration DEĞİŞMEDİĞİNDEN bu
  sonuçlar hâlâ geçerli; bu oturumun bu devamında yerel Postgres cluster'ı
  kapalı olduğundan yeniden koşulmadı, yalnızca migration dosyasının
  KENDİSİNİN değişmediği doğrulandı).
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  `src/lib/prompt-variables.ts`'e karşı, kopyasına değil) — 18 assertion,
  BU OTURUMDA yeniden çalıştırılıp hepsi doğrulandı: normalize/geçerlilik/
  token çıkarma/kullanım sayma/yeniden adlandırma (yalnızca TAM token
  eşleşmesi)/kaldırma/imleç konumunda ekleme (seçili metni değiştirme
  dahil)/çözümleme (tanımsız bir token'ın literal kaldığı, boş bir
  değerin "undefined" değil GERÇEK boş bir değer sayıldığı dahil).
- **Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright**
  (statik export `npx serve` ile GitHub Pages basePath'ini taklit eden bir
  symlink düzeniyle yerel sunularak — bu projenin standart yöntemi), YENİ
  32 senaryoluk bir pakette (BU OTURUMDA yazılıp çalıştırıldı) hepsi sıfır
  JS hatasıyla doğrulandı: `{ortam}` token'ının GERÇEK imleç konumuna
  eklendiği (metnin sonuna değil); Değişkenler panelinin doğru kullanım
  sayısını gösterdiği; Önizleme sekmesinin varsayılan değeri doğru
  çözümlediği; yayınlama isteğinin ham şablonu (`{token}` bozulmadan)
  gönderdiği; değişkenlerin gerçek bir sil-hepsini-sonra-ekle çağrısıyla
  kaydedildiği; düzenleme modunun gerçek verilerle dolduğu, içerik
  türünün kilitli göründüğü, var olan değişkenin listelendiği, Kaydet'in
  GERÇEK bir PATCH gönderip `content_type` alanına HİÇ dokunmadığı;
  sahibi OLMAYAN birinin `?edit=`'e gittiğinde formun HİÇ render
  edilmeyip dürüst bir yetkisizlik ekranı gösterdiği; prompt detayındaki
  düz "Kopyala"nın TAM OLARAK ham şablonu kopyaladığı; sahibinin
  düzenleme geçmişi panelini gördüğü, sahibi OLMAYANIN GÖRMEDİĞİ;
  "Promptu kişiselleştir"in varsayılan değerle açıldığı, canlı önizlemenin
  özelleştirmeyi yansıttığı, VE en kritik olarak — "Promptu Kopyala"nın
  ÇÖZÜMLENMİŞ (kullanıcının kendi değeriyle) metni, "Şablonu Kopyala"nın
  ise HAM şablonu (özelleştirmeden ETKİLENMEDEN) panoya kopyaladığı;
  değişkeni olmayan bir promptta "Promptu kişiselleştir" butonunun hiç
  görünmediği; istek detayının kendi Kopyala'sının isteğin gerçek
  `description`'ını kopyaladığı; istek düzenleme modunun referans görsel
  alanını hiç göstermediği ve PATCH'in `content_type`/`status`/`reference_
  image_url`'e hiç dokunmadığı. Bu paket ayrıca yukarıdaki gerçek
  React-portal/form-bubbling hatasını YAKALAYIP raporladı, düzeltme
  sonrası yeniden çalıştırılıp 32/32 geçti.
- Bu oturumda ayrıca önceki bölümlerin regresyon paketleri (`smart-tags-
  e2e-test.mjs` 30/30, `collections-e2e-test.mjs` 19/19, `save-flow-e2e-
  test.mjs` 14/14, `resilience-test.mjs` 14/14) sıfır regresyonla yeniden
  çalıştırıldı — bu görevin `create-prompt-form.tsx`/`create-request-
  form.tsx`/`post-menu.tsx` değişikliklerinin var olan hiçbir akışı
  bozmadığı doğrulandı.
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (22 rota — yeni
  bir route eklenmedi, yalnızca `/create`/`/requests/new` yeni query
  parametreleri kabul ediyor) sıfır hatayla geçti. **Gerçek hata
  düzeltmesi (build sırasında bulundu):** `/requests/new` sayfası
  `useSearchParams()` kullanan `CreateRequestForm`'u hiç `<Suspense>` ile
  sarmıyordu (yalnızca `/create` sayfası, Bölüm 9'dan beri, sarılıydı) —
  bu görev `CreateRequestForm`'a İLK KEZ `useSearchParams()` eklediğinden
  (edit modu için) bu eksiklik ilk kez gerçek bir build hatası olarak
  ortaya çıktı ("useSearchParams() should be wrapped in a suspense
  boundary"); `src/app/(app)/requests/new/page.tsx`'e `/create`'inkiyle
  BİREBİR AYNI `<Suspense fallback={null}>` sarmalayıcısı eklenerek
  düzeltildi.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919290000_prompt_
variables_and_edit_tracking.sql`'i Dashboard → SQL Editor'de uygulayıp
bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`prompt_requests` için ayrı bir değişken tablosu/sistemi kurulmadı**
  (yukarıda açıklandı) — isteğin "prompt metni" hiç yok, yalnızca
  `description`; şartname de zaten değişken sistemini "prompt metni"
  etrafında çerçeveliyordu.
- **Düzenleme bildirimi bugün için çoğunlukla durgun** — RLS yalnızca
  gerçek sahibinin düzenlemesine izin verdiğinden, `editor_id <> owner_id`
  koşulu bugünkü tek-kullanıcı-model altında pratik olarak hiç
  sağlanamıyor; bu İCAT EDİLMİŞ bir "ortak düzenleme" değil, dürüstçe
  "bugün tetiklenmeyen ama doğru ve test edilmiş, ileride bir ortak-
  düzenleme özelliği eklenirse hazır" bir altyapı.
- **Değişken isimlerinde Türkçe harfler serbest bırakıldı** (yalnızca
  süslü parantez/boşluk yasak) — şartnamenin kendi örnekleri ("ışık_
  stili" gibi) zaten Türkçe karakter içeriyordu, ASCII'ye kısıtlamak bu
  örnekleri kırardı.
- **Değişken değerleri yalnızca düz metin (`<input type="text">`)** —
  çok satırlı/zengin metin değer girişi eklenmedi, şartname de böyle bir
  şey istemedi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Yerel Postgres SQL testleri bu oturumun bu devamında yeniden
  çalıştırılamadı** (Postgres cluster'ı bu sandbox'ta şu an kapalı) —
  migration dosyasının kendisi bu devamda hiç değişmediğinden, önceki
  gerçek çalıştırmanın sonuçları hâlâ geçerli, ama dürüstçe belirtilmesi
  gereken bir ayrım: bu son doğrulama turu SQL katmanını değil yalnızca
  saf mantık + istemci/tarayıcı katmanını yeniden koştu.
- **`content_edits` yalnızca dört alanı (title/description/prompt_text/
  tool ya da istek eşdeğerleri) izliyor** — görsel/medya değişikliği ayrı
  bir "düzenleme" olarak İZLENMİYOR (yalnızca metin alanları); şartname de
  zaten metin odaklı bir "meaningful edit" tanımı istiyordu.
- **Değişken sırası (`sort_order`) yalnızca ekleme sırasını yansıtıyor** —
  sürükle-bırak ile yeniden sıralama arayüzü eklenmedi, şartname de böyle
  bir şey istemedi.

---
