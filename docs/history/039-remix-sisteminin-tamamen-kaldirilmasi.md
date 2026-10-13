### 9.39 Remix sisteminin tamamen kaldırılması

Kullanıcının çok kapsamlı 20 bölümlük "Remix Sistemini Tamamen Kaldır"
şartnamesi üzerine — Bölüm 9.14'te kurulup 9.15-9.18/9.32-9.33'te
genişletilen/yeniden adlandırılan Remix Dallanma Haritası + Merge/
Karşılaştırma sistemi ve Bölüm 8/9/21'den beri var olan düz remix
(bir promptu/generatoru başka bir promptun/generatorun üzerine türetme)
özelliği, kullanıcının açık, tekrarlanan talimatı üzerine **frontend'den,
backend'den (Supabase şeması/RLS/trigger/RPC) ve state'ten uçtan uca
kaldırıldı**. Bu, yalnızca UI'ı gizleyen bir değişiklik DEĞİL — gerçek bir
yapısal kaldırma: silinen tablolar, düşürülen kolonlar, kaldırılmış
fonksiyon/trigger'lar, silinmiş bileşen dosyaları, ve TypeScript
tiplerinden tamamen çıkarılmış remix alanları (kalan tek referans imkânı
bir compile hatası olurdu — `npx tsc --noEmit` sıfır hatayla geçtiği için
bu, kodda unutulmuş bir remix referansı kalmadığının doğrudan kanıtı).

**AŞAMA 0 — belirsizlik netleştirmesi (kod yazılmadan önce yapıldı):**
Şartname "Prompt geçmişi"nin (Bölüm 9.17'de "Remix Dallanma Haritası"ndan
yeniden adlandırılan, ama fonksiyonel olarak hâlâ remix ağacı + merge
sistemi olan sekme) korunması gereken bir sistem mi (CLAUDE.md'nin zaten
"Prompt geçmişi / Generator geçmişi" diye andığı, dokunulmaması istenen
listedeki isimle örtüştüğü için) yoksa kaldırılması gereken remix
sisteminin kendisi mi olduğunu net bırakmıyordu — bu isim çakışması
`AskUserQuestion` ile çözüldü. Kullanıcı **"Yalnızca Düzenleme geçmişini
koru"**yu seçti: "Prompt geçmişi" SEKMESİ (remix ağacı/harita/merge)
TAMAMEN kaldırılacak, `EditHistoryPanel` ("Düzenleme geçmişi", Bölüm 9.25 —
tamamen ayrı, remix'le hiç ilgisi olmayan bir sistem: bir kullanıcının
kendi promptunu/generatorunu düzenleme kaydı) ise HİÇ dokunulmadan kalacak.
Bu kararın doğrudan sonucu: Merge Request/Prompt Version/Diff-Comparison
sisteminin (Bölüm 9.14/9.28-9.29) TAMAMEN kaldırılması gerektiği —
kullanıcının şartnamesi bunu ayrı ayrı adlandırmamıştı, ama bu sistemin
TEK var oluş amacı bir remix'in katkısını atasına geri sunmaktı; remix
kaldırılınca hedefsiz, işlevsiz kalıyordu. Bu, şartnamenin harfiyen
istediğinin ötesine geçen, şeffafça işaretlenmiş kendi mimari kararımdı
(CLAUDE.md'nin "gereksiz kod bırakma" ilkesine uyarak) — kullanıcıya
raporda ayrıca belirtildi.

**Yeni migration: `supabase/migrations/20260919330000_remove_remix_
system.sql`** (yerel PostgreSQL 16'da, gerçek test verisiyle GERÇEKTEN
uygulanıp doğrulandı — taklit değil):
- Var olan remix/merge bildirimleri (`type in ('remix', 'merge_request_
  received', '..._accepted', '..._rejected', '..._withdrawn',
  '..._cancelled')`) temizlendi.
- Merge/sürüm sistemi tamamen kaldırıldı: `handle_prompt_soft_delete_
  cancels_merges`/`withdraw_merge_request`/`reject_merge_request`/
  `accept_merge_request`/`create_merge_request`/`_perform_merge_
  acceptance`/`fetch_remix_graph`/`fetch_generator_remix_graph`
  fonksiyonları ve `merge_requests`/`prompt_versions`/`audit_log`
  tabloları `drop ... cascade` ile silindi.
- Remix bildirim üreticileri kaldırıldı: `notify_new_remix`/`notify_
  generator_remix` trigger+fonksiyonları.
- Bölüm 9.7'nin remixli bir promptu silmeye karşı koruyan `handle_prompt_
  delete` soft-delete trigger'ı kaldırıldı (yalnızca remix sistemi için
  vardı — remix olmayınca bu koruma da anlamsız).
- **Sayaç trigger'ı GENİŞLETİLMEDİ, yalnızca remix dalı çıkarıldı:**
  `handle_prompt_origin_change` (Bölüm 18/9.2) `create or replace` ile
  yeniden yazıldı — `request_response` dalı (Prompt İstekleri özelliğinin
  `response_count` sayacı) BİREBİR AYNI kaldı, yalnızca `remix` dalı
  (`remix_count` artırma/azaltma) çıkarıldı. `generators_after_insert_
  remix`/`handle_generator_remix_created` tamamen kaldırıldı (generatorun
  TEK origin varyantı remix'ti, bu yüzden generator tarafında "kalan bir
  dal" diye bir şey yoktu).
- **Var olan remix ilişkileri, gerçek içerik korunarak temizlendi:**
  `update prompts set origin_type='original', source_prompt_id=null,
  root_prompt_id=null where origin_type='remix'` ve generatorlar için
  aynısı — hiçbir prompt/generator satırı SİLİNMEDİ, yalnızca remix
  ilişkisi kaldırıldı (promptun kendi başlığı/açıklaması/prompt metni/
  beğenisi/yorumu hiç etkilenmedi).
- `prompts`: `prompts_origin_shape` CHECK'i remix'i çıkaracak şekilde
  yeniden yazıldı (`origin_type in ('original', 'request_response')`),
  `source_prompt_id`/`root_prompt_id`/`remix_count` kolonları düşürüldü.
  **Bilinçli olarak DOKUNULMAYAN kolonlar:** `prompts.generator_id`/
  `generator_version_id`/`generator_run_id` — bunlar remix DEĞİL, Bölüm
  9.27'nin "Open in Prompt" provenance köprüsü (bir promptun hangi
  generator çalıştırmasından geldiği), tamamen ayrı ve korunması gereken
  bir sistem; migration taslağının ilk sürümünde yanlışlıkla bu kolonları
  da düşüren bir satır vardı, çalıştırılmadan ÖNCE kendim fark edip
  kaldırdım.
- `generators`: `generators_origin_shape` CHECK'i, `origin_type`/
  `source_generator_id`/`root_generator_id`/`remix_count`/`allow_remix`
  kolonlarının TAMAMI düşürüldü (generatorun `origin` alanı artık hiç
  yok — remix zaten generatorun TEK origin varyantıydı).
- `notifications.type` CHECK'i `remix` ve 5 `merge_request_*` değerini
  kaybetti, kalan liste (`follow`/`like`/`comment`/`comment_reply`/
  `request_response`/`message`/`message_request`/`system`/`prompt_
  edited`/`request_edited`/`generator_edited`) hiç değişmedi.
- **Nasıl doğrulandı (gerçekten çalıştırıldı):** yerel bir PostgreSQL 16
  test veritabanına önceki 22 migration'la (storage hariç) birlikte
  uygulanıp gerçek test verisiyle (remixli promptlar/generatorlar, var
  olan merge talepleri, sürüm geçmişi dahil) doğrulandı: migration
  öncesi `information_schema.tables` sorgusuyla `merge_requests`/
  `prompt_versions`/`audit_log`'un var olduğu, sonrasında ÜÇÜNÜN DE
  gittiği; remixli bir promptun `origin_type`/`source_prompt_id`/`root_
  prompt_id`'sinin migration sonrası `'original'`/`null`/`null`'a
  döndüğü AMA `title`/`description`/`prompt_text`/`like_count`'unun hiç
  değişmediği (gerçek içerik korundu); yeni `prompts_origin_type_check`/
  `prompts_origin_shape` kısıtlarının `'remix'` değerini gerçekten
  reddettiği; `request_response` kökenli bir promptun (Prompt İstekleri
  özelliği) `response_count` sayacının migration'dan ETKİLENMEDEN doğru
  kaldığı (sayaç trigger'ının `request_response` dalına hiç dokunulmadığının
  kanıtı); `prompts.generator_id`/`generator_version_id`/`generator_run_
  id` kolonlarının (ilgisiz "Open in Prompt" sistemi) migration sonrası
  hâlâ var ve doğru olduğu.

**Kaldırılan dosyalar** (proje-geneli `grep` ile sıfır kalan referans
doğrulanarak silindi):
`remix-branch-map.tsx`, `remix-node-detail-panel.tsx`, `remix-map-node-
card.tsx`, `remix-tree-layout.ts`, `merge-request-modal.tsx`, `prompt-
diff-modal.tsx`, `version-diff-modal.tsx`, `prompt-diff.ts` (hepsi
`src/features/prompts/`), `remix-graph.ts`, `merge-requests.ts`, `prompt-
versions.ts` (`src/lib/supabase/`) — toplam 11 dosya.

**Değişen dosyalar (fonksiyonel, yalnızca yorum değil) — özet:**
- `prompt-detail-view.tsx`/`generator-detail-view.tsx`: eski Yorumlar/
  Remixler/Prompt geçmişi 3-sekme yapısı (`role="tablist"` switcher)
  tamamen kaldırıldı — geriye yalnızca YORUMLAR kaldığından bir sekme
  arayüzü artık anlamsızdı, ikisi de `CommentSection`'ı DOĞRUDAN, hiçbir
  sekme sarmalayıcısı olmadan render ediyor. `generator-detail-view.tsx`
  ayrıca `handleRemix`/`isRemixing`/remix rozeti/remix sayaç istatistiği/
  "Remixle" butonu/`fetchRemixesOfGenerator`/`remixGenerator`/
  `RemixBranchMap`'i tamamen kaldırdı; eylem satırı artık yalnızca sahibi
  içindir (ziyaretçinin "Remixle"/"Kaydet" ikilisinden yalnızca "Kaydet"
  kaldı, o da zaten kart footer'ında).
- `prompt-card-footer.tsx`: remix ikonu/sayacı kaldırıldı — footer artık
  4 öğe (beğeni/yorum/kaydet/paylaş), `justify-between` ile aynı yerleşim
  kuralıyla otomatik olarak dengelendi (Bölüm 16-17'nin "boşluk
  bırakmadan yeniden dengele" gereksinimi — flex `justify-between` zaten
  öğe sayısından bağımsız çalıştığından ekstra bir CSS düzeltmesi
  GEREKMEDİ, yalnızca fazla öğe kaldırıldı).
- `post-context.tsx`: `RemixContext` fonksiyonu (kaynağı silinmiş/normal
  iki dalıyla) tamamen silindi; `RequestResponseContext`/
  `GeneratorSourceContext` (ikisi de remix'ten bağımsız, ilgisiz sistemler
  — Prompt İstekleri ve Generator "Open in Prompt" köprüsü) hiç
  değişmeden korundu.
- `image-prompt-card.tsx`/`text-prompt-card.tsx`: `RemixContext`
  import'u ve koşullu render'ı kaldırıldı.
- `generator-card.tsx`: "Remix" rozeti (`generator.origin.type ===
  "remix"` kontrolü — `Generator.origin` tipi tamamen kaldırıldığından bu
  zaten bir compile hatası olurdu) kaldırıldı.
- `create-prompt-form.tsx`: `remixSourceId`/`isRemixMode`/`sourcePrompt`
  state+fetch'i, `origin`'in remix dalı, `addRealPrompt`'a geçirilen
  `remixOf` alanı, "Bu remix profilimde görünsün mü?" seçici bloğu
  (yalnızca `isAnswerMode` — istek yanıtı — için korundu), kaynak-prompt
  bilgi bandı, "Remix Oluştur" başlığı tamamen kaldırıldı.
- `create-gate.tsx`: `hasIntent` kontrolünden `searchParams.get("remix")`
  çıkarıldı — `/create?remix=<id>` artık özel bir deep-link intent
  SAYILMIYOR, düz "Ne oluşturmak istersin?" seçim ekranına düşüyor
  (gerçekten doğrulandı, aşağıya bakınız).
- `types/index.ts`: `PromptOrigin`'den `remix` varyantı çıkarıldı (yalnızca
  `original`/`request-response` kaldı); `Prompt.remixCount` kaldırıldı;
  `MergeRequestStatus`/`MergeRequest`/`PromptVersion`/`RemixGraphNode`
  arayüzleri TAMAMEN silindi; `NotificationType`'tan `remix` + 5 `merge_
  request_*` değeri çıkarıldı; `GeneratorOrigin` tipi TAMAMEN silindi ve
  `Generator`'dan `allowRemix`/`origin`/`remixCount` alanları kaldırıldı
  (bir generatorun artık hiç `origin` alanı yok).
- `lib/supabase/prompts.ts`: `PROMPT_SELECT`'ten `source_prompt_id`/
  `root_prompt_id`/`remix_count` çıkarıldı, `mapOrigin()` sadeleşti,
  **`fetchRemixesOf`/`fetchRemixChain` fonksiyonları TAMAMEN silindi**,
  `CreateRealPromptInput`'tan `remixOf` kaldırıldı.
- `lib/supabase/generators.ts`: `GENERATOR_SELECT`'ten tüm remix alanları
  çıkarıldı, **`mapOrigin()`/`fetchRemixesOfGenerator()`/
  `remixGenerator()` fonksiyonları TAMAMEN silindi**, `allowRemix`
  `GeneratorMetaInput`'tan kaldırıldı.
- `generator-details-form.tsx`: "Remixlemeye izin ver" toggle'ı kaldırıldı.
- Profil sistemi (`profile-view.tsx`/`profile-tabs.tsx`/`profile-
  toolbar.tsx`/`profile-badges.tsx`/`profile-stats.tsx`/`profile-
  header.tsx`): "Remixler" sekmesi, `remixPrompts` hesaplaması, "en çok
  remixlenen" sıralama seçeneği, "ilk remixini oluşturdu" rozeti,
  `remixCount`/`onSelectRemixes` prop zinciri TAMAMEN kaldırıldı — profil
  istatistikleri artık yalnızca gerçek kalan verilere (prompt sayısı,
  takipçi, takip edilen) göre.
- `lib/notification-utils.ts`: remix/merge bildirim ikonları
  (`GitBranch`/`GitMerge`/`Ban`/`XCircle`) ve `NOTIFICATION_CATEGORY`/
  `NOTIFICATION_ICONS`/`HIGHLIGHT_KINDS`'teki remix/merge girişleri
  kaldırıldı.
- `lib/tag-candidates.ts`: **bilinçli, tek tek karar verilen kısmi
  temizlik** — "Remix Flow"/"Remix Graph"/"Remix History"/"Remix Tree"
  (bu projenin kendi iç terminolojisiyle şüpheli biçimde örtüşen 4 giriş)
  kaldırıldı; "Remix"/"Music Remix"/"Prompt Remix"/"Song Remix" (gerçek,
  ilgisiz, müzik/yaratıcı-içerik bağlamında meşru etiketler) BİLİNÇLİ
  OLARAK KORUNDU — şartnamenin §18'inin "etiket sistemi: her etikete tek
  tek karar ver, normal etiket sistemi bozulmasın" talimatına harfiyen
  uyularak.
- `app/layout.tsx`: SEO açıklamasından "remixleyen" kelimesi çıkarıldı.
- Kalan tüm değişen dosyalar (`generator-builder.tsx`, `generator-create-
  gate.tsx`, `create-choice.tsx`, `real-prompts-provider.tsx`,
  `generators-discover-view.tsx`, `local-prompt-view.tsx`, `copy-prompt-
  button.tsx`, `prompt-preview-box.tsx`, `lib/supabase/notifications.ts`,
  `use-tag-picker.ts`, `lib/utils.ts`, `post-header.tsx`, `post-menu.tsx`,
  `prompt-grid.tsx`) yalnızca artık geçersiz/yanıltıcı hâle gelmiş JSDoc/
  yorum metinlerini güncelledi — davranış değişikliği yok.

**Toplam etki:** `git diff --stat` — 47 dosya değişti, +216/-2840 satır
(net ~2600 satırlık gerçek kod kaldırma).

**Nasıl doğrulandı — statik analiz:** `npx tsc --noEmit` sıfır hatayla
geçti (alanlar/tipler SİLİNDİĞİ için, bu tek başına projede unutulmuş
hiçbir remix referansı kalmadığının güçlü bir kanıtı — herhangi bir yerde
kalan bir kullanım derleme hatası olurdu). `npm run lint` sıfır hatayla
geçti. `npm run build` 25 rota ile (değişmedi — hiçbir zaman ayrı bir
remix rotası olmadığından kaldırılacak bir rota da yoktu) sıfır hatayla
tamamlandı. Proje geneli `grep -rniE "remix"` taraması: kalan TEK
eşleşmeler ya bu kaldırmayı açıklayan, kasıtlı, tarihsel doc-comment'ler
(`types/index.ts`, `create-prompt-form.tsx`, `post-context.tsx`, `prompt-
card-footer.tsx`, `lib/supabase/prompts.ts`) ya da yukarıda kasıtlı olarak
korunan 4 gerçek `tag-candidates.ts` girişi — hiçbir fonksiyonel/UI kodu
kalmadı. `grep -rn "MergeRequest\|merge_request\|prompt_versions\|
PromptVersion\|audit_log\|RemixGraphNode\|remixCount\|remixOf\|
isRemixMode\|allowRemix\|allow_remix\|source_prompt_id\|root_prompt_id\|
source_generator_id\|root_generator_id" src/` sıfır eşleşme verdi.

**Nasıl doğrulandı — Playwright (ağ seviyesinde taklit edilmiş Supabase
REST/RPC yanıtlarıyla, bu projenin standart yöntemi, statik export `npx
serve` ile GitHub Pages basePath'ini taklit eden bir symlink düzeniyle
yerel sunularak):** Remix'ten bahseden 13 mevcut scratchpad test dosyası
tek tek çalıştırıldı — 8'i (bookmark/kaydetme, koleksiyon, tag katalog/
JSON çıktı testleri) hiç değişiklik gerektirmeden değişmeden geçti (remix
sözü yalnızca tesadüfiydi, artık kaldırılmış UI'a dair bir iddiaları
yoktu); `generator-prompt-parity-test.mjs` BEKLENDİĞİ GİBİ eski 3-sekme
(role=tablist) yapısına dair asersiyonlarla başarısız oldu ve bu, bir
regresyon DEĞİL, doğru şekilde kaldırılmış UI'ın kanıtıydı — test dosyası
yeni, sekmesiz yapıyı doğrulayacak şekilde tamamen güncellendi (21/21);
`generator-prompt-compose-detail-redesign-test.mjs`'in "kaydetme/remix"
diye adlandırılmış (ama gerçekte hiç "remix" metnini kontrol etmeyen, bu
yüzden gerçekten geçen) eski asersiyonu netleştirilip GERÇEK bir "sayfada
hiçbir yerde remix metni yok" kontrolü eklendi (15/15); kalan 5 test
(`generator-social-test.mjs` 25/25, `generators-e2e-test.mjs` 45/45,
`prompt-social-regression-test.mjs` 9/9, `prompt-variables-e2e-test.mjs`
48/48, `save-flow-e2e-test.mjs` 14/14) hiç değişiklik gerektirmeden
geçti. Remix'ten hiç bahsetmeyen kalan 18 scratchpad test dosyasının
TAMAMI da (`bookmark-any-collection-generator-test.mjs` 7/7,
`bookmark-any-collection-test.mjs` 16/16, `candidate-tags-e2e-test.mjs`
8/9 — tek "başarısızlık" bu sandbox'ın Bölüm 21 Faz C'den beri bilinen,
`*.supabase.co` WebSocket erişimini engelleyen ağ politikasının konsol
gürültüsü, gerçek bir JS `pageerror` her zaman sıfır —,
`candidate-tags-logic-test.mjs`/`prompt-variables-test.mjs`/`tag-logic-
test.mjs` [saf mantık, ALL PASSED], `collection-generator-card-fix-
test.mjs` 13/13, `collections-e2e-test.mjs` 19/19, `generator-catalog-
test.mjs` 26/26, `generator-field-catalog-test.mjs`/`generator-output-
test.mjs` [saf mantık, 152/152 ve 45/45], `generator-json-output-test.
mjs` 18/18, `menu-test.mjs`/`stacking-test.mjs` [bağımsız bug-repro
script'leri, davranış değişmedi], `real-catalog-tag-test.mjs` 20/25 [aynı
bilinen WebSocket gürültüsü, 5 kez], `resilience-test.mjs` 14/14,
`smart-tags-e2e-test.mjs` 30/30 — sıfır regresyonla yeniden çalıştırıldı.

**Yeni, bu görev için yazılmış kapsamlı bir kontrol listesi testi —
`remix-removal-checklist-test.mjs` (157/157 geçti):** şartnamenin
Bölüm 20'sinin kendi MUST-WORK/MUST-NOT-EXIST listesini TEK bir testte
doğruluyor:
- **MUST NOT EXIST:** hem masaüstü (1280px) hem mobil (390px) viewport'ta,
  12 farklı sayfanın (Ana Sayfa, Keşfet, Arama, Etiketler, Etiket detay,
  Generatorlar, Generator detay, Prompt detay, Profil, Prompt Oluştur,
  Generator Oluştur, Kaydedilenler) HİÇBİRİNDE "remix" metninin (case-
  insensitive), "Prompt geçmişi"/"dallanma"/"merge talebi" metninin, veya
  `role="tablist"][aria-label="Gönderi bölümleri"]` sekme switcher'ının
  bulunmadığı, VE hiçbir sayfada yatay taşma olmadığı — 24 sayfa-viewport
  kombinasyonu × 6 kontrol = 144 asersiyon, hepsi geçti. Ayrıca
  `/create?remix=<id>`'nin artık düz "Ne oluşturmak istersin?" seçim
  ekranını gösterdiği (prompt formuna DOĞRUDAN atlamadığı) doğrulandı; ağ
  isteği yakalayıcısı `merge_requests`/`prompt_versions`/`audit_log`/
  `rpc/create_merge_request`/`rpc/fetch_remix_graph` gibi kaldırılmış
  endpoint'lere HİÇ istek gitmediğini de ayrıca doğruladı (hiçbiri
  tetiklenmedi).
- **MUST STILL WORK:** düz prompt oluşturma (form doldurup gerçek bir
  `POST /prompts` tetiklendiği), prompt düzenleme (`?edit=` ile gerçek
  veri önceden dolup gerçek bir `PATCH` tetiklendiği), generator oluşturma
  giriş noktası (Detaylar adımının remix'siz render edildiği), generator
  düzenleme giriş noktası (gerçek veri önceden dolduğu), beğeni (gerçek
  POST), yorum (gerçek POST), kaydetme + koleksiyon modalı (gerçek,
  çoklu-koleksiyonlu modal açıldığı), paylaşım (hem detay sayfasının
  PostMenu'sündeki "Bağlantıyı kopyala" hem kart footer'ındaki gerçek
  Share butonu), arama/etiketler/keşfet/profil/`/prompts/local`/
  `/generators/local` (MUST-NOT-EXIST sweep'inin parçası olarak zaten
  ziyaret edildi) — hepsi sıfır JS hatasıyla çalıştığı doğrulandı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919330000_remove_remix_
system.sql`'i Dashboard → SQL Editor'de uygulayıp bizzat denemesi
gerekiyor. **Önemli:** bu migration önceki `remix`/`merge_request*`
ilişkili satırları/kolonları GERÇEKTEN DÜŞÜRÜYOR (`drop column`/`drop
table`) — geri dönüşü olmayan bir şema değişikliği; kullanıcının
uygulamadan önce (isterse) `merge_requests`/`prompt_versions` tablolarının
bir yedeğini alması önerilir (bu proje şu ana kadar hiçbir migration'ı
gerçek projeye karşı canlı test edemediğinden, bu satırların gerçekte kaç
kullanıcıyı etkileyeceği bilinmiyor — dürüstçe belirtilmesi gereken bir
risk).

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Merge Request/Prompt Version/Diff-Comparison sisteminin tamamen
  kaldırılması** şartnamenin harfiyen yazdığı bir talep değildi — yukarıda
  "AŞAMA 0" bölümünde açıklandığı gibi, bu sistemin remix olmadan hiçbir
  işlevi kalmadığı için gereken, şeffafça işaretlenmiş bir mimari
  sonuçtu.
- **`prompt_saves`/`generator_saves` gibi Bölüm 9.22'den beri zaten atıl
  bırakılmış eski tablolara dokunulmadı** — bu görevin kapsamı yalnızca
  remix, ilgisiz atıl tabloları temizlemek ayrı bir görev.
- **`tag-candidates.ts`'teki 4 meşru "Remix" (müzik) etiketi kasıtlı
  olarak KORUNDU** (yukarıda açıklandı) — remix kelimesinin kendisi değil,
  remix ÖZELLİĞİNİN kod/UI izleri kaldırıldı.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor, ve bu
  migration geri dönüşü olmayan bir şema değişikliği içerdiğinden ekstra
  dikkat gerektiriyor (yukarıdaki yedek notu).
- Kalan 32/33 scratchpad test dosyasının tam listesi bu bölümde tek tek
  sayılmadı (kısaca özetlendi) — tümü bu oturumda gerçekten çalıştırılıp
  sonuçları doğrulandı, dosya adları/sonuçları yukarıdaki "Nasıl
  doğrulandı" bölümünde eksiksiz listelidir.

---
