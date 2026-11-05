# 339 — Workflow ↔ Space: tek ekleme yolu, atomik aktarım, dayanıklı bağ

**Durum: kodlandı (repoda). Tek migration `20261105110000_workflow_space_links_and_atomic_import.sql` (yalnızca ekleyici: 2 yeni fonksiyon; tablo/sütun/politika değişmez, `drop` yok) — yerel PostgreSQL'de sınandı, `main`'e birleşince `deploy.yml` uygular; canlıya UYGULANMADI.**

## Şikâyet
Workflow Space'e bazen tek bir görsel (diyagram) olarak, bazen her adım/prompt/görsel ayrı nesne olarak geliyor; workflow sayfasındaki "Space panosu" önizlemesi bazen görünüyor, bazen görünmüyor.

## Bulunan nedenler (kod + canlı veri)
1. **İki ayrı ekleme yolu iki farklı sonuç üretiyordu.**
   - Pano → Ekle → "Workflow aktar" ve workflow formundaki "Space'te göster" → `importOrSyncDirect` (262): ayrı nesneler (adım kartı, prompt, görsel, oklar).
   - Kart ⋮ / Paylaş / Odak → "Space'e ekle" → `AddToSpaceModal.drafts()` her içerik türü için tek bir `kind='content'` öğesi yazıyordu: workflow için bu 261'in **tek parça çerçevesi** (diyagram). 262 eski çerçevenin yerini aldı ama bu yolu taşımadı.
   - Canlı veride (2026-11-05, salt-okunur sorgu): workflow-Space bağlarının 6'sı eski çerçeve, 2'si ayrı nesne.
2. **Bağ tek bir satır türüne bağlıydı ve hata "bağ yok" sayılıyordu.** `fetchWorkflowSpaceLinks` yalnız adım kartı (`source_role='step'`) ya da eski çerçeve satırı arıyordu; kullanıcı adım kartlarını silerse prompt/görseller kalsa da bağ kayboluyordu. İki ayrı istekti ve **her hatada `[]` döndürüyordu** (zaman aşımı, ağ, PostgREST hatası) → bölüm hiç çizilmiyordu; 261'deki PGRST201 olayı da aynı sessizlikle gizlenmişti. (Geçici hatanın sizin gördüğünüz kaybolmaların gerçek nedeni olduğu canlıda KANITLANMADI; yalnız kodda doğrulanmış zayıflık.)
3. **Aktarım üç ayrı istekti** (grup → nesneler → oklar): arada hata olursa grup var ama adım kartı yok, nesneler var ama oklar yok gibi yarım panolar ve — bağ adım kartına bağlı olduğundan — kayıp bağlar kalabiliyordu.
4. **Özel Space bilerek ziyaretçiye görünmez** (varlığı sızmasın); sahibi dışında kimse görmediği için "bazen yok" gibi okunuyordu. Canlıda bağlı Space'lerden biri özel.

## Yapılanlar
- **Tek yol:** "Space'e ekle" workflow için artık `importOrSyncDirect` çağırır (hepsi açık: adım kartı + girdi/çıktı + prompt + görsel + ilişki). Panoda varsa yalnız fark güncellenir; fark yoksa "zaten güncel" der; prompt kaynağı okunamazsa yalnız adım kartlarıyla yeniden dener ve bunu söyler. Aynı Space'te eski çerçeve duruyorsa nesneler eklendikten SONRA çerçeve kalkar. Yeni kod hiçbir yerde `kind='content'`/workflow çerçevesi YAZMAZ (`workflow-space-write-paths.test.ts` korur); eski çerçeve yalnız geriye uyum için okunup çizilir.
- **Mevcut eski çerçeveler:** panoda düzenleyiciye "Ayrı nesnelere çevir" şeridi (`data-workflow-legacy`, `WorkflowSyncBar` içinde): nesneler önce eklenir, çerçeve ancak sonra kalkar (çeviri başarısızsa eski görünüm yerinde kalır). Kendiliğinden çevrilmez; canlıdaki 6 çerçeve sahipleri açınca teklif görür. Panodan "Workflow aktar" da aynı workflow'un eski çerçevesini kaldırır.
- **Bağ tek RPC'den:** `workflow_space_links(p_workflow_id)` (SECURITY INVOKER, anon+authenticated; RLS çağıranın yetkisiyle). Workflow'dan aktarılan HERHANGİ bir nesneden (adım kartı, prompt, görsel) ya da eski çerçeveden Space başına bir satır; gizli not sayılmaz. Önizleme odağı: önce adım kartı, sonra başka nesne, en son çerçeve.
- **Hata ≠ boş:** `fetchWorkflowSpaceLinks` hatada fırlatır. `WorkflowSpacePreview` bir kez 1,2 sn sonra sessizce yeniden dener; yine olmazsa bölüm kaybolmaz: "Space önizlemesi yüklenemedi · Tekrar dene". Bağ gerçekten yoksa bölüm yine hiç çizilmez (özel Space'in varlığı sızmaz). Özel/arşivli Space önizlemesinde (yalnız üyeler görebildiği için) not: "Bu Space özel: yalnız üyeler bu önizlemeyi görür…".
- **Atomik aktarım:** `space_apply_workflow_plan(space, grup, öğeler, oklar)` (SECURITY INVOKER; `can_edit_space`, RLS, askı/hız sınırı ve öğe tetikleyicileri istemcinin doğrudan yazmasıyla aynı) çerçeve + nesneler + okları TEK işlemde yazar; biri reddedilirse hiçbiri kalmaz. `created_by`/`space_id` sunucuda `auth.uid()`/parametreden alınır (JSON'a güvenilmez). Space'te 50 grup doluysa aktarım çerçevesiz sürer (eski davranış), reddedilmez. İstemci: `applyWorkflowPlan` (spaces.ts), `PlanIO.applyImport` (pano sağlayıcısı `applyImport` + doğrudan `directIO`); `runImport` kaynak okunamazsa ilk deneme hiçbir şey bırakmadığı için aynı grup kimliğiyle yeniden dener. "Güncelle" (fark) yazımı hâlâ tek tek isteklerdir: kısmen uygulanırsa bir sonraki "Güncelle" kalan farkı yeniden bulur.
- `scripts/smoke-test.mjs`: `workflow_space_links` (ziyaretçiye açık) + `space_apply_workflow_plan` (ziyaretçiye KAPALI olmalı).
- **İngilizce karşılıklar eklendi** (`translations-workflow-space.ts`: `wfSpace.preview.linksFailed/retry/privateHint`, `wfSpace.legacy.*`, `wfSpace.add.*`).

## Doğrulama
- SQL `supabase/tests/workflow-space-links.sql` 20/20 (atomik aktarım, geçersiz ok → grup+öğe de geri alınır, yabancı/ziyaretçi aktaramaz, kaynak kuralı, 501 öğe, grup sınırı, bağ: nesneli/eski çerçeve/yalnız prompt nesnesi/özel Space/engel/ziyaretçi/olmayan workflow). Etkilenen SQL: `space-workflow-flow` 15, `space-connections` 27, `anon-hardening` 15, `spaces` 59 — hepsi `FAILED=0` (her test ayrı temiz veritabanında).
- Birim `workflow-space-write-paths.test.ts` (4) + `npm test` 935/935.
- Playwright (ağ taklitli) `run-workflow-space` 38/38 (28 eski + 10 yeni: Space'e ekle → nesneler, zaten var → güncel, eski çerçeve kalkar, "Ayrı nesnelere çevir", çevirme hatasında çerçeve yerinde, kaynak okunamayınca yeniden deneme, okuma hatası → yeniden deneme / Tekrar dene, adım kartı silinse de bağ, özel Space notu); etkilenen paketler: `run-spaces` 32, `run-space-board-tools` 15, `run-space-connectors` 15, `run-detail-pages` 47, `run-create-destination` 16, `run-space-posts` 8, `run-quotes` 12, `run-shared-cards` 11. `run-space-comments` 9/10: senaryo 4 **bu değişiklikten bağımsız** düşüyor — sabit tarihli fixture (2026-09-20) bugün "2 ay önce" yazıyor ve `getByText('Önce')` onu da yakalıyor (tarihe bağlı kırılganlık).
- `npx tsc --noEmit`, `npm run lint` (0 hata; var olan 15 uyarı, hiçbiri bu değişiklikten değil), `npm run build` temiz.

## Bilinçli sınırlar / denenmedi
- Gerçek Supabase'e, gerçek oturuma, gerçek cihaza karşı DENENMEDİ (arayüz ağ taklitli; sunucu kuralları yerel PostgreSQL'de). Migration canlıya inene kadar yeni istemci `workflow_space_links`/`space_apply_workflow_plan`'ı bulamaz — `deploy.yml` migration'ı derlemeden önce uyguladığı için sorun olmaz; smoke test canlıda varlığını denetler.
- Eski çerçeve ÖĞESİNİ yazan sürümlerin (önbellekteki eski istemciler) yazmasını sunucuda engelleyen bir kısıt YOK (expand → contract): istemciler yayılınca ayrı, kullanıcı onaylı bir contract adımı olabilir.
- "Space'e ekle" artık başkasının herkese açık workflow'unu da nesnelere açar (önceden çerçeve olarak ekleyebiliyordu; yetki aynı, kaynak okunabilirliği tetikleyicide).
- Eski çerçeve dönüştürmede çerçevenin katman bayrakları (`flow_show_*`) seçenek olarak taşınır; elle yapılmış konum/boyut korunmaz (nesneler boş bir yere yerleşir).
- Özel Space'in ziyaretçiye görünmemesi bilerek böyle (varlığı sızmasın); workflow sahibine bu durumda ayrıca bilgi verilmiyor.
