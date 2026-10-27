# 262 — Workflow panoda AYRI nesneler + panoya ok/bağlantı çizme (Güncelle)

**Durum: uygulandı (repoda). Tek migration `20261002100000_space_connections.sql` (yalnızca ekleyici: `space_connections` tablosu + `space_items.source_*` 4 sütun; `drop` yok) — yerel PostgreSQL'de sınandı, `main`'e birleşince `deploy.yml` uygular; canlıya UYGULANMADI.** 261'deki tek parça "çerçeve" öğesinin yerini alır (eski öğeler geriye uyumla çalışmaya devam eder).

## İstek
Workflow panoya görsel gibi tek parça gelmesin: her adım için **adım kartı**, kullandığı **prompt** ve prompt'un **görselleri** panoda bağımsız nesneler olsun; aralarında **oklar** çizilsin. Panonun kendisi de gerçek **ok/bağlantı çizme** özelliği kazansın ("en gelişmiş panolardan biri"). Workflow değişince panoda **"Güncelle"** düğmesi çıksın; aktarıldığı hâliyle kalsın.

## Kararlar (kullanıcı onayladı)
1. Nesneler: adım kartı + prompt + prompt görselleri (+ girdi/çıktı adları kartın içinde, ilişkiler kesikli ok).
2. **Güncelleme politikası:** aktarılan nesneler olduğu gibi kalır; workflow değişirse panoda "Güncelle" şeridi çıkar, yalnız FARK uygulanır — taşıdığın/düzenlediğin nesneler ve elle çizdiğin oklar korunur. Hiçbir şey kendiliğinden değişmez.
3. Okların Space'e ait gerçek bir özelliği olması: elle ok çizme, düzenleme, geri al/yinele.

## Mimari
- **`space_connections`** (yeni tablo): iki öğe arası ok; geometri öğe kutularından HESAPLANIR (öğe taşınınca ok izler, konum saklanmaz). Etiket ≤80, `line_style` solid|dashed|dotted, `arrow` end|start|both|none, `route` curve|straight|elbow, renk, `source_workflow_id` + `source_role` (flow|link|relation; elle çizilen oklarda boş), (from,to) tekil, kendine ok yok, bir Space'te en çok 1000 ok, uçlar aynı Space'te. RLS: okuma `can_read_space` (+ gizli nota değen ok yalnız üyeye: `_space_connection_touches_private`), yazma `can_edit_space`; `enforce_can_post` bağlı. Uçlardan biri silinince ok cascade ile gider.
- **`space_items.source_workflow_id/source_step_id/source_role/source_step_no`**: workflow'dan gelen nesneyi işaretler (`step` | `prompt` | `image`); `space_items_source_guard` tetikleyicisi tutarlılığı korur. Adım kartı = `kind='note'`, `source_role='step'`; gövde satırları `>> girdi` / `<< çıktı` (`stepBody`/`parseStepBody`).
- **Saf planlayıcılar** (`src/lib/workflow-board-plan.ts`, birim testli): `planWorkflowImport` (adım kartları satırlara, altlarında prompt, onların altında görseller; akış okları adımlar arası, "link" çizgileri kart→prompt→görsel, "relation" kesikli oklar promptlar arası; panoda zaten olan prompt/görsel yeniden AÇILMAZ, mevcut olana ok bağlanır; panoya toplam 500 öğe sınırı) ve `planWorkflowSync` (yeni/kaldırılan/değişen adım farkı: yeni adım mevcut çerçevenin altına, kaldırılan adımın kartı + yalnız onun için açılmış nesneleri gider, başlık/girdi-çıktı değişen kart yamalanır, prompt değişen adımın eski bağı/nesneleri gidip yenisi gelir, akış okları yeniden kurulur). Elle eklenen nesne/ok planlayıcıya girmez, bu yüzden korunur.
- **Veri katmanı** `src/lib/supabase/workflow-board.ts`: `PlanIO` soyutlaması (pano sağlayıcıya, workflow formu doğrudan veri katmanına yazar), `loadPlanInput` (workflow + adımlar + prompt görselleri), `runImport`/`runSync`, `importOrSyncDirect`. `workflow-space.ts` yeniden yazıldı (Space'e bağ artık adım kartı satırından okunur; eski `content/workflow` çerçeve öğesi hâlâ okunur ve form kaydedilince nesnelere çevrilir).
- **Pano** (`board/`): `board-connectors.tsx` (SVG ok katmanı: eğri/düz/dirsek, kesikli/noktalı, ok başı, etiket, `lowDetail`), `connection-bar.tsx` (seçili okun etiket/çizgi/ok başı/yol/renk/yön çevir/sil düzenleyicisi), `workflow-sync-bar.tsx` ("Workflow değişti · Güncelle"), araç çubuğunda **Ok çiz** aracı (C kısayolu: önce başlangıç, sonra varış nesnesi; Esc vazgeç; çoklu seçimi ok ile bağla; telefonda dokunmayla), ok seçme/silme, taşınınca oklar izler, geri al/yinele oklara da uygulanır (aktarım ve güncelleme TEK adımda geri alınır). Workflow nesneleri ayrı çerçeve (grup) içinde gelir.
- **Aktarma penceresi** (`workflow-import-modal.tsx` + `workflow-plan-preview.tsx`): önizleme panoya yazılacak planın kendisidir (panonun kendi ok katmanıyla çizilir); seçenekler Promptlar / Prompt görselleri / Girdi ve çıktılar / İlişkiler; "Eklenecek: N adım, N prompt, N görsel, N ok" özeti; zaten panoda olan nesneler için not; 500 öğe sınırı uyarısı.
- **Workflow formu** ve **workflow sayfası önizlemesi** yeni modelle çalışır (`workflow-space-field.tsx`, `workflow-space-preview.tsx`): özellik kapatılınca/başka Space seçilince önceki Space'teki workflow nesneleri kaldırılır (notu formda yazar); önizleme okunabilir Space yoksa HİÇ çizilmez, gizli notlar girmez.
- **İstemci uyumu:** yeni sütunlar `OPTIONAL_COLUMNS`'a eklendi, `space_connection_limit` `server-errors.ts`'te çevrilir, `scripts/smoke-test.mjs` iki yeni denetim aldı. `space_items` yazımının geri-okuması yeni sütunları seçer: migration uygulanmadan öğe EKLEME/GÜNCELLEME 400 verir (okuma çalışır) — `deploy.yml` migration'ı önce uyguladığı için sorun olmaz.

## Bulunan/giderilen hata
"Güncelle" şeridi panonun tuvalinin İÇİNDE durduğu için `pointerdown` tuvale çıkıp `setPointerCapture` yapıyor, tıklama düğmeye ulaşmıyordu. Şerit artık `pointerdown`'ı durdurur (UI testi yakaladı). Tuvale gömülen yeni bir kaplama yazarken aynısını yap.

## Doğrulama
- SQL: `space-connections.sql` 27/27 (sütun/tablo kısıtları, RLS rolleri, gizli not oku, sınır, cascade, kaynak tetikleyicisi), `spaces` 59, `space-workflow-flow` 15, `space-comments-activity` 37, `space-posts` 27, `quotes` 50 — hepsi `FAILED=0`.
- Birim: `space-connectors.test.ts` (ok geometrisi/yönlendirme/uç noktaları), `workflow-board-plan.test.ts` (içe aktarma, yeniden kullanım, sınır, güncelleme farkı); `npm test` 529/529.
- Playwright (ağ taklitli): `run-space-connectors` 15/15 (çizme aracı, seçme/düzenleme/silme, taşınınca takip, geri al/yinele, İngilizce, telefon), `run-workflow-space` 28/28 (ayrı nesneler, eski çerçeve geriye uyum, aktarma + önizleme + seçenekler, mevcut nesne yeniden kullanımı, Güncelle: yeni/değişen/kaldırılan adım + elle nesne/ok korunur + izleyici şerit görmez, workflow sayfası önizlemesi, form, İngilizce, telefon). Etkilenen paketler geçti: `run-spaces` 32, `run-detail-pages` 45, `run-create-destination` 16, `run-community-posts` 36, `run-space-posts` 8, `run-space-comments` 10, `run-quotes` 12, `run-shared-cards` 11.
- `npx tsc --noEmit`, `npm run lint` (0 hata; var olan 10 uyarı), `npm run build` temiz.
- **İngilizce karşılıklar eklendi** (`translations-space-connections.ts`, `translations-workflow-space.ts`).

## Bilinçli sınırlar / denenmedi
- Gerçek Supabase'e, gerçek oturuma, iOS Safari'ye / gerçek dokunmatik cihaza karşı DENENMEDİ (arayüz ağ taklitli; sunucu kuralları yerel PostgreSQL'de).
- Kullanıcı bir adım kartını silerse "Güncelle" onu yeniden ekler (kart workflow'un bir parçasıdır); adım başlığını elle değiştirdiysen workflow'daki başlık değişince "Güncelle" onu ezer; workflow nesneleri kendiliğinden güncellenmez.
- Yalnız KENDİ yayınlanmış workflow'un aktarılır; adım başına en çok 4 görsel; ilişki okları yalnız aynı workflow'daki promptlar arasında.
- Ok yönlendirmesi öğe kutusundan hesaplanır (otomatik yol bulma yok: ok başka nesnenin üstünden geçebilir); serbest nokta/ara düğüm ve oka metin kutusu dışında şekil yok.
- Bir Space'te en çok 1000 ok ve 500 öğe.
