### 9.14 Remix Dallanma Haritası ve Merge (birleştirme) sistemi

Kullanıcının çok kapsamlı, 34 bölümlük "PROMPTLY — REMIX GRAPH, BRANCHING &
MERGE SYSTEM" şartnamesi üzerine — bir remixin gerçek bir dallanma
grafiği/ağacı olarak görselleştirilmesi, bir remixin katkısını bir atasına
gerçek bir "merge talebi" akışıyla geri sunabilmesi, ve bir remixi
doğrudan kaynağıyla/kök orijinaliyle karşılaştırabilen bir fark
(diff) ekranı. Şartnamenin kendi kuralına uyularak önce mevcut mimari
uçtan uca denetlendi; yalnızca gerçekten eksik olan kısımlar inşa edildi.

**AŞAMA 1 denetim bulguları:**
- Remix ilişkisinin kendisi (`prompts.source_prompt_id`/`root_prompt_id`/
  `origin_type`, `prompts_origin_shape` CHECK kısıtı) Bölüm 18'den beri
  ZATEN şartnamenin 1. bölümünün istediği şekilde modellenmiş —
  `fetchRemixesOf`/`fetchRemixChain` (`src/lib/supabase/prompts.ts`) bu
  ilişkiyi zaten gerçek sorgularla okuyor. Yeni bir alan/tablo GEREKMEDİ.
- Remix silme güvenliği (şartnamenin §11/§12'sinin "alt remixler otomatik
  silinmez, kaynak yalnızca 'silinmiş' olarak işaretlenir, hangi
  derinlikte olursa olsun" kuralı) Bölüm 9.7'nin `handle_prompt_delete`
  trigger'ıyla ZATEN, HERHANGİ bir zincir derinliğinde, tam olarak bu
  şekilde çalışıyor — buraya hiç dokunulmadı.
- Bildirim altyapısı (`SECURITY DEFINER` trigger'lar, `hl=<tür>:<id>`
  hedefleme deseni, `NOTIFICATION_ICONS`/`NOTIFICATION_CATEGORY`) Bölüm
  9.6/9.12'den beri olgun ve genişletilebilir — yeni merge bildirimleri
  bununla BİREBİR AYNI deseni kullanıyor, paralel bir sistem kurulmadı.
- `notify_new_remix` zaten "remix oluşturuldu → kaynak sahibine bildirim,
  kendine bildirim yok" kuralını uyguluyor (şartnamenin §14 "remix_
  created" isteği) — YENİDEN YAZILMADI.
- Bu denetimin sonucu: gerçekten yeni inşa edilmesi gereken tek şey
  **sürüm geçmişi** (`prompt_versions`) ve **merge talepleri**
  (`merge_requests`) + bunların üzerine kurulu harita/karşılaştırma
  arayüzleriydi.

**Yeni migration: `supabase/migrations/20260919250000_remix_merge_
system.sql`** (tam doğrulama listesi `supabase/README.md`'de):
- **`prompt_versions`** — bir promptun merge ile kabul edilmiş sürüm
  geçmişi. Yalnızca aşağıdaki RPC'ler tarafından yazılıyor (bu uygulamada
  düz bir "düzenle" işlemi hiç yok, bu yüzden version yalnızca merge
  bağlamında anlamlı). Okuma politikası `prompts`'ın kendi görünürlük
  kuralıyla birebir aynı (yayınlanmış veya kendi promptun); `deleted_at`
  BİLİNÇLİ OLARAK kontrol edilmiyor (Bölüm 9.7'nin ilkesiyle aynı —
  soft-deleted bir promptun geçmiş sürüm kaydı, o merge'ün gerçekten
  olduğunun kanıtı olarak görünmeye devam ediyor).
- **`merge_requests`** — bir remixin katkısını bir atasına (doğrudan
  kaynak/kök orijinal/aradaki başka bir ata) sunma talebi.
  `merge_requests_no_self_target` (kaynak≠hedef CHECK) ve
  `merge_requests_one_pending_per_pair` (aynı çift için tek bekleyen
  talep — kısmi unique index, yarış durumuna kapalı) veritabanı
  seviyesinde zorlanıyor. Yazma politikası YOK — tüm durum geçişleri
  yalnızca RPC'ler üzerinden. **Mimari karar:** şartnamenin önerdiği
  ayrı bir "merge_contributions" tablosu BİLİNÇLİ OLARAK kurulmadı —
  `merge_requests` (source/target/requester) + `prompt_versions`
  (merge_request_id/created_by/content) birleşimi zaten aynı bilgiyi
  taşıyor, üçüncü bir yinelenen tabloya gerek yoktu.
- **RPC'ler** (hepsi `security definer`, istemciden hiçbir raw INSERT/
  UPDATE izni yok — bir merge talebinin durumunu doğrudan bir `.update()`
  ile değiştirmek yapısal olarak imkansız):
  - `create_merge_request(source, target, summary, description?)` — tüm
    ön-koşul doğrulamaları burada: kaynak gerçek bir remix mi ve
    isteyenin mi, hedef silinmemiş mi, mükerrer bekleyen talep var mı,
    VE **hedefin kaynağın gerçek bir atası olup olmadığı** — kaynağın
    `source_prompt_id` zincirini köke kadar (20 adım guard'lı, tıpkı
    `fetchRemixChain` gibi) yürüyerek. **Bu tek kontrol hem "yalnızca
    geçerli hedeflere merge edilebilir" HEM "döngü oluşturulamaz"
    kuralını aynı anda sağlıyor** — ayrı bir graf-döngü-tespiti
    algoritması yazmaya hiç gerek kalmadı. İsteyen zaten hedefin de
    sahibiyse (`requester_id = target_owner_id`), talep hiç `pending`
    durumuna girmeden `_perform_merge_acceptance`'ı çağırıp ANINDA kabul
    ediyor — CLAUDE.md'nin "kendine gereksiz bir onay akışı kurma"
    ilkesine uygun, dokümante edilmiş bir ürün kararı.
  - `_perform_merge_acceptance` (dahili, hem normal kabul akışı hem
    kendi-kendine-merge kısayolu tarafından çağrılan TEK yer) — hedefin
    daha önce HİÇ sürümü yoksa, mevcut canlı içeriğini geriye dönük
    `version 1` olarak kaydedip, kaynağın içeriğini `version 2` olarak
    yazıyor VE hedefin canlı `title`/`description`/`prompt_text`'ini
    gerçekten güncelliyor — tek, atomik bir transaction. Kaynağın kendi
    satırına, source/root ilişkisine HİÇ dokunulmuyor (silinmiyor,
    değiştirilmiyor) — "merge, üzerine yazma değil, katkıyı hedefe
    kopyalamaktır" ilkesi (şartname §5) böyle sağlanıyor.
  - `accept_merge_request`/`reject_merge_request`/`withdraw_merge_
    request` — sırasıyla yalnızca hedef sahibi/yalnızca hedef sahibi/
    yalnızca talep sahibi çağırabiliyor; zaten karara bağlanmış bir
    talebi tekrar karara bağlamaya çalışmak reddediliyor (çifte-kabul
    engeli, şartname §20'nin "iki kullanıcı aynı anda kabul ederse
    yalnızca biri başarılı olmalı" senaryosunu tam olarak karşılıyor).
  - `fetch_remix_graph(root_id)` — TEK bir recursive CTE ile bir remix
    ağacının TÜM düğümlerini getiriyor (N ayrı sorgu yerine) — haritanın
    "performanslı çizim, gereksiz sorgu yığmama" gereksinimi veri
    katmanında başlıyor. RLS zaten (`security invoker`) gizli/yayınsız
    bir düğümü hiç döndürmüyor — "erişilemiyor" ile "silinmiş" arayüzde
    aynı dürüst muameleyi görüyor (ikisi de içerik sızdırmıyor).
  - `handle_prompt_soft_delete_cancels_merges` (trigger, `prompts`
    üzerinde) — bir prompt (Bölüm 9.7'nin trigger'ıyla) soft-delete
    olduğunda, onu KAYNAK olarak kullanan her bekleyen merge talebini
    `cancelled` yapıp hedef sahibine bilgi veriyor (yeni `merge_request_
    cancelled` bildirimi — şartname §7'nin "cancelled" durumu tam olarak
    bu senaryo için var).
  - `audit_log` — yalnızca merge eylemleri için minimal, salt-okunur bir
    denetim tablosu (istemciden hiç yazılamıyor).
  - `notifications.type` CHECK'i beş yeni değer aldı:
    `merge_request_received/accepted/rejected/withdrawn/cancelled` —
    hepsi Bölüm 9.6/9.12'nin zaten olgun, aynı `SECURITY DEFINER` +
    `hl=` hedefleme desenini kullanıyor.

**Gerçek hata düzeltmeleri (yerel test sırasında bulundu, önceden
varsayılmadı):**
1. `create_merge_request`'in `returns table (request_id uuid, status
   text)` imzasındaki `status` OUT parametresi, fonksiyon içindeki
   mükerrer-talep kontrolü sorgusundaki `merge_requests.status`
   sütununu GÖLGELİYORDU — `column reference "status" is ambiguous`
   hatasına yol açıyordu. Yalnızca ilgili sorguyu `mr.status` diye
   nitelemek yerine, OUT parametrenin kendisi `request_status` olarak
   yeniden adlandırıldı (gölgeleme riskini kökten kaldırmak için) —
   istemci tarafı (`src/lib/supabase/merge-requests.ts`) da buna göre
   `row.request_status` okuyor.
2. `merge_requests`/`prompt_versions`'ın ilk yazılan RLS SELECT
   politikaları, ilgili iki promptun `deleted_at is null` olmasını da
   şart koşuyordu — bu, Bölüm 9.7'nin "soft-deleted bir promptun satırı
   hâlâ herkese açık" ilkesiyle ÇELİŞİYORDU: bir kaynak/hedef soft-delete
   olur olmaz, ona bağlı geçmiş bir merge talebi `anon` için aniden
   görünmez oluyordu (şartnamenin §10'unun "silinmiş kaynak: içerik
   kaldırılmış, ilişki kaydı korunuyor" lejant maddesini ihlal ederek).
   Düzeltme: her iki politikadan da `deleted_at is null` koşulu
   kaldırıldı, yalnızca `status='published'` kaldı. Her iki hata da
   gerçek bir yerel Postgres test döngüsüyle yakalanıp düzeltildi ve
   tüm senaryo paketi baştan çalıştırılarak doğrulandı (aşağıya bakınız).

**Yeni frontend dosyaları:**
- `src/types/index.ts` — `MergeRequestStatus`, `MergeRequest`,
  `PromptVersion`, `RemixGraphNode` tipleri + `NotificationType`'a 5 yeni
  değer eklendi.
- `src/lib/notification-utils.ts` — merge bildirimleri için ikon/kategori/
  `hl` türü eşlemeleri eklendi (`GitMerge`/`CheckCircle2`/`XCircle`/
  `RotateCcw`/`Ban`, hepsi "posts" kategorisinde, yeni `"merge"` highlight
  türü).
- `src/lib/supabase/merge-requests.ts` — `fetchMergeRequestsForPrompt`/
  `fetchMergeRequestsForPrompts` (haritanın N+1 yapmaması için toplu
  sorgu), `createMergeRequest`/`acceptMergeRequest`/`rejectMergeRequest`/
  `withdrawMergeRequest` (hepsi ince RPC sarmalayıcılar).
- `src/lib/supabase/prompt-versions.ts` — `fetchVersionsForPrompt`.
- `src/lib/supabase/remix-graph.ts` — `fetchRemixGraph` (RPC + yazar
  profillerinin toplu `.in()` sorgusu — yine N+1'den kaçınmak için),
  `resolveGraphRootId` (bir promptun kendisinden gerçek kök id'sini
  bulan yardımcı).
- `src/features/prompts/remix-tree-layout.ts` — `layoutRemixTree`/
  `computeTreeBounds`: basitleştirilmiş bir Reingold-Tilford ağaç
  yerleşimi (harici bir grafik/graf kütüphanesi eklenmeden, CLAUDE.md
  §2'ye uygun) — yaprak düğümler sırayla x-slot'lara yerleştiriliyor,
  ebeveynler çocuklarının x-aralığının ortasına konumlanıyor, döngü
  koruması ve yetim düğüm fallback'i dahil. Saf bir fonksiyon olarak
  yazıldı, birim testiyle (`tree-layout-test.mjs`, şartnamenin kendi
  A→B→C, A→D, B→E örnek ağacına karşı 11 assertion) UI'a hiç bağlanmadan
  doğrulandı.
- `src/features/prompts/prompt-diff.ts` — `diffWords` (klasik LCS/en
  uzun ortak alt dizi tablosuyla kelime-seviyeli diff, harici bağımlılık
  yok), `diffPromptContent`/`ComparableField`/`FieldDiff` (yapılandırılmış
  alan-bazlı karşılaştırma — başlık/açıklama/prompt metni/araç ayrı ayrı,
  tek bir blob değil), `promptToComparable`/`versionToComparable`. Saf
  fonksiyonlar, birim testiyle (`diff-test.mjs`, şartnamenin kendi "mavi
  tonlarda" → "mor tonlarda, modern" örneğine karşı 9 assertion,
  kayıpsız yeniden birleştirme dahil) doğrulandı.
- `src/features/prompts/remix-map-node-card.tsx` — `RemixMapNodeCard`:
  haritadaki tek bir düğüm, gerçek bir `<button>` (native Tab sırası ve
  Enter/Space aktivasyonu bedava geliyor — şartnamenin "erişilebilir
  klavye etkileşimleri" gereksinimi), `aria-label`/`aria-pressed`,
  orijinal/remix rozeti, bekleyen-merge göstergesi, silinmiş içerik
  durumu (`AlertTriangle` + metin — yalnızca renkle değil).
- `src/features/prompts/remix-branch-map.tsx` — `RemixBranchMap`: ana
  harita kabuğu. Gerçek veri akışı (`fetchRemixGraph` + `fetchMergeRequestsForPrompts`),
  Realtime abonelik (`merge_requests` tablosundaki HER olay + `prompts`
  tablosunda bu ağacın kökü — `root_prompt_id=eq.<id>` filtresiyle —
  değişince haritayı sayfa yenilenmeden tazeliyor, Bölüm 21'in "tam
  yeniden çekme, artımlı patch değil" kararıyla aynı kategoriden),
  el yapımı pan/zoom (pointer event'ler + CSS `transform`, harici
  kütüphane yok), araç çubuğu (içerik sayısı, yakınlaştır/uzaklaştır,
  görünüme sığdır, merkez içeriğe dön, merge ilişkilerini göster/gizle,
  genişlet/daralt), `MapLegend` (renk + ikon + metin — asla yalnızca
  renkle anlamlandırma), ve mobilde varsayılan olarak katlı başlayıp
  `ChevronsUpDown` toggle'ıyla açılan bir görünüm. SVG kenarları: remix
  bağlantıları düz çizgi + ok ucu, merge bağlantıları KESİKLİ çizgi +
  duruma göre renk (bekleyen=amber, kabul edilmiş=primary, diğer=muted) —
  şartnamenin "remix ve merge bağlantıları görsel olarak ayrı olmalı"
  kuralı (§4).
- `src/features/prompts/remix-node-detail-panel.tsx` — `RemixNodeDetailPanel`:
  seçili düğümün tüm detayı — başlık/yazar/zaman, doğrudan kaynak/kök
  orijinal (silinmişse "Silinmiş içerik", erişilemezse "Kaynağa
  erişilemiyor" — ikisi ayrı, dürüst mesajlar), remix sayısı, "İçeriği
  Aç"/"Remix Oluştur"/"Kaynağı Aç" eylemleri, fark karşılaştırma
  butonları (aşağıya bakınız), yalnızca gerçek sahibine ve yalnızca
  gerçek bir ata zinciri varsa görünen "Merge talebi oluştur", o düğümü
  ilgilendiren TÜM merge taleplerinin listesi (durum rozetiyle — bekliyor/
  kabul edildi/reddedildi/geri çekildi/iptal edildi, hedef sahibine
  Kabul et/Reddet, talep sahibine Geri çek — rol bazlı, sahte bir buton
  hiç gösterilmiyor), ve **sürüm geçmişi** (aşağıya bakınız). Merge
  aksiyonları sonrası yerel state'i hand-crafted bir optimistic obje ile
  DEĞİL, `fetchMergeRequestsForPrompt`'un gerçek sonucuyla güncelliyor
  (bilinçli karar — bir merge talebinin gerçek şekli, requester/
  target_owner profilleri dahil, elle doğru kurmaktan daha ucuz ve daha
  güvenilir bir gerçek yeniden-sorgu).
- `src/features/prompts/merge-request-modal.tsx` — `MergeRequestModal`:
  gerçek, kalıcı bir gönderim — sahte bir taslak değil. Sabit katkı
  kaynağı, seçilebilir hedef (yalnızca `candidates` — gerçek ata
  zincirinden gelen node'lar, asla rastgele bir prompt), zorunlu özet,
  opsiyonel açıklama. Tüm "gönderim öncesi" kontroller (kaynak/hedef hâlâ
  var mı, isteyen yetkili mi, mükerrer talep var mı) RPC içinde — bu form
  yalnızca RPC'nin reddini olduğu gibi, dürüstçe gösteriyor.
- `src/features/prompts/prompt-diff-modal.tsx` — `PromptDiffModal`
  ("Farkları Karşılaştır", **remix karşılaştırması** — iki FARKLI içerik
  id'si arasında): üç görünüm modu (yan yana/birleşik/yalnızca
  değişiklikler), görsel içerik türü için dürüst bir "desteklenmiyor"
  mesajı (yalnızca metin/kod alanları diff'leniyor, üretilen görselin
  kendisi hiç karşılaştırılmıyor — şartname §31), ve yalnızca yetkili
  kullanıcıya görünen "Bu katkıyı merge talebi olarak gönder →" bağlantısı
  — **asla doğrudan merge YAPMIYOR**, yalnızca `MergeRequestModal`'ı
  açıyor (şartname §32'nin "karşılaştırma asla otomatik merge yapmaz"
  kuralı). Açılması/görünüm modu değişimi HİÇBİR bildirim/durum
  değişikliği üretmiyor — salt okunur bir inceleme.
- `src/features/prompts/version-diff-modal.tsx` — `VersionDiffModal`
  ("Sürüm Karşılaştırması", **remix karşılaştırmasından kasıtlı olarak
  ayrı ve ayrı etiketlenmiş** — şartname §30: her zaman AYNI içerik
  id'sinin iki sürümünü karşılaştırır). Zaten yüklenmiş iki
  `PromptVersion` nesnesini alıyor (ekstra bir ağ isteği gerekmiyor),
  `PromptDiffModal`'ın `FieldDiffBlock`'unu (export edildi) yeniden
  kullanıyor — iki ayrı diff render mantığı yok.

**Sürüm geçmişi (şartname §9/§30/§34) — gerçekten inşa edildi, yalnızca
veri katmanında bırakılmadı:** `RemixNodeDetailPanel`, seçili düğüm için
`fetchVersionsForPrompt`'u çağırıp (yalnızca gerçekten bir merge kabul
edilmişse dolu döner — bu uygulamada düz bir "düzenle" özelliği hiç
olmadığından, hiç merge almamış bir promptun sürüm geçmişi boş, ve boşsa
bölüm hiç render edilmiyor, sahte bir "henüz sürüm yok" mesajı da
eklenmedi) sürüm numarası/oluşturan/tarih/değişiklik özeti sırasıyla
listeliyor; her sürümün (ilki hariç) yanında "Önceki sürümle karşılaştır"
butonu `VersionDiffModal`'ı açıyor. Bu, "kabul edilen merge'ün ürettiği
yeni sürüm, kendi önceki sürümüyle karşılaştırılabilir olmalı, hangi
merge talebinin bunu ürettiğini göstermeli" (şartname §29) gereksinimini
gerçekten karşılıyor — yalnızca RPC'nin `version_number`/`change_summary`
yazması yetmiyordu, arayüzde de gösterilmesi gerekiyordu.

**Sayfaya entegrasyon (`prompt-detail-view.tsx`):** Harita, "Remixler"
bölümüyle aynı yatay hizada başlayan bir sağ panel olarak eklendi — TÜM
sayfa değil, yalnızca "Remixler + yorumlar" bloğu `lg:grid-cols-
[1fr_360px]` grid'ine geçti (bu projenin `CreatePromptForm`/
`CreateRequestForm`'da zaten kullandığı desen). Üst kısım (görsel/başlık/
açıklama/prompt metni) hiç sıkışmadı — kendi `lg:max-w-3xl` genişliğinde
kaldı, yalnızca dış konteyner `lg:max-w-5xl`'e genişledi (haritaya yer
açmak için). Mobilde/tabletde (`lg` altı) grid tamamen devre dışı —
düz, dikey `space-y-6` akışı (harita `RemixBranchMap`'in kendi katlanabilir
toggle'ıyla Remixler'in altında görünüyor). **Gerçek bir hata bulunup
düzeltildi (test sırasında):** ilk yazılan grid `grid gap-6 lg:grid-
cols-[1fr_360px]` idi — `grid` sınıfı `lg:` ön eki OLMADAN her genişlikte
uygulandığından, mobilde CSS Grid'in "grid item'ların varsayılan
`min-width: auto`'su" davranışı (yorum composer'ının flex satırı
küçülemeyip grid track'ini genişletmesi) sayfayı 10px yatay taşırıyordu
— Playwright'ın mobil taşma testi bunu gerçekten yakaladı. Düzeltme:
`grid` yalnızca `lg:grid` oldu (mobilde düz `space-y-6`), artı ilgili
grid item'lara `min-w-0` eklendi (standart CSS Grid "blowout" düzeltmesi).

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı, taklit
değil):** Migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan, önceki TÜM migration'ların (storage hariç — bu görev
storage'a hiç dokunmuyor) gerçekten uygulandığı temiz bir veritabanına
uygulandı ve şartnamenin kendi §20 örnek senaryosu (5 gerçek kullanıcı —
Ayşe/Mehmet/Zeynep/Can/Elif — ve gerçek bir A→B→C, A→D, B→E remix ağacı)
üzerinden şu senaryoların TAMAMI fiilen çalıştırılıp doğrulandı: kök/
doğrudan kaynak ilişkisi her seviyede doğru; **döngü engeli** (D'nin C'ye
geçersiz bir merge'le "bağlanma" denemesi reddedildi); Zeynep'in C'den
A'ya gerçek bir merge talebi göndermesi (`pending`); **mükerrer talep
engeli**; **yetkisiz karar engeli** (Mehmet A için karar veremedi); Ayşe'nin
kabulü → `version 1` (A'nın eski içeriği, geriye dönük) + `version 2`
(C'nin içeriği) + A'nın canlı içeriğinin gerçekten güncellenmesi + **C'nin
source/root ilişkisinin hiç değişmemesi**; **çifte kabul engeli**; reddetme
akışı (`decision_reason` dolu); geri çekme akışı + **başkasının geri
çekememesi**; **kendi kendine merge kısayolu** (anında `accepted`);
**B silinince C/E'nin İKİSİNİN de hayatta kalması**, C'nin source/root
ilişkisinin kırılmaması, B'ye yeni bir merge talebi denemesinin reddi;
**A silinince B/C/D/E'nin TAMAMININ hayatta kalması**; **kritik RLS
testi** — `anon`'un geçmiş bir merge talebini (kaynak/hedef soft-deleted
olsa bile) hâlâ görebilmesi; `fetch_remix_graph`'ın tek sorguda doğru
ağacı getirmesi. Test veritabanı işlem bitince silindi (tam liste,
`supabase/README.md`'de).

**Nasıl doğrulandı — saf mantık (birim testi, tarayıcısız):**
`layoutRemixTree` (11 assertion) ve `diffWords`/`diffPromptContent` (9
assertion), gerçek kaynak dosyalarına karşı (kopyalarına değil)
doğrudan çalıştırıldı — ikisi de UI'a hiç bağlanmadan, şartnamenin kendi
örnekleriyle doğrulandı.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST/RPC yanıtlarıyla, Playwright, bu projenin standart
yöntemi):** Statik export yerel olarak sunulup 35 senaryoluk bir paketle
(masaüstü + mobil + koyu tema) doğrulandı — hepsi sıfır JS hatasıyla:
8 düğümlü gerçek bir ağacın (dallanma + bir silinmiş düğüm + onun hayatta
kalan remixi dahil) doğru render edilmesi; düğüm seçiminin doğru kaynak/
kök/remix-sayısı göstermesi; **ilk-nesil bir remixte YALNIZCA tek bir
karşılaştırma seçeneğinin (mükerrer değil) görünmesi**, derin bir remixte
ikisinin de görünmesi; yalnızca gerçek sahibine "Merge talebi oluştur"
görünmesi; merge kabul/red/geri çekme/yeni talep oluşturmanın HER
BİRİNİN gerçek bir RPC tetikleyip arayüzü sayfa yenilenmeden
güncellemesi; sürüm geçmişinin doğru listelenip "Önceki sürümle
karşılaştır"ın doğru v1→v2 etiketiyle gerçek bir fark göstermesi; fark
karşılaştırma modalının doğru başlık/alan-bazlı diff göstermesi;
silinmiş bir düğümün "Silinmiş içerik" göstermesi VE onun hayatta kalan
remixinin kendi kaynağını hâlâ doğru "silinmiş" olarak raporlaması;
mobilde haritanın varsayılan olarak katlı başlayıp toggle ile açılması
ve HİÇBİR genişlikte yatay taşma olmaması; koyu temada hatasız render.
Ayrıca bu oturumun önceki bölümlerine ait regresyon paketleri (bildirim
merkezi, 32 senaryo; 19 rotalık genel Supabase-tamamen-erişilemez
dayanıklılık taraması) yeniden çalıştırılıp bozulma olmadığı doğrulandı.
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın
ağ kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919250000_remix_merge_
system.sql`'i Dashboard'da uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Manuel düğüm yeniden konumlandırma kalıcı değil** — harita her
  yüklemede `layoutRemixTree`'nin hesapladığı düzeni kullanıyor (pan/zoom
  kalıcı değil, yalnızca o oturumdaki görünüm). Şartname bunu açıkça
  "karar verilsin ve dokümante edilsin" diye bıraktı — bilinçli karar:
  otomatik, deterministik bir düzen (aynı ağaç her zaman aynı şekilde
  çizilir) kullanıcı-özel bir konum kalıcılığından daha güvenilir ve
  basit; ayrı bir `node_positions` tablosu/sütunu bu görevin kapsamına
  alınmadı.
- **Değişikliği "hangi ara remixin yaptığı" bilgisi (şartname §26/§33'ün
  "eğer gerçek/güvenilir bir değişiklik geçmişi VARSA ek olarak
  gösterilebilir" diye koşullu bıraktığı özellik) eklenmedi** — bu, yalnızca
  DOĞRUDAN kaynakla ya da kökle iki-nokta karşılaştırma yapıyor,
  zincirdeki HER ara adımın kendi payını ayrıştırmıyor (şartname bunu
  yalnızca güvenilir bir değişiklik geçmişi zaten varsa istedi; icat
  edilmiş/tahmin edilmiş bir ayrıştırma göstermek şartnamenin kendi
  "asla tahmin etme" kuralını ihlal ederdi).
- **Toplu/coklu merge onaylama arayüzü yok** — her seferinde tek bir
  talep kabul/red/geri çekiliyor (şartname de zaten böyle istiyor).
- **`audit_log` genel bir moderasyon denetim sistemine dönüştürülmedi**
  — yalnızca merge eylemlerini kaydediyor; genel bir audit sistemi
  (her tabloyu kapsayan) bu görevin kapsamı dışında.
- **Mesaj üzerinden "içeriği paylaş" akışına (Bölüm 9.8) bir merge
  talebi paylaşma seçeneği eklenmedi** — şartname bunu hiç istemedi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Realtime abonelik, `merge_requests`'teki HER olayda haritanın TÜM
  merge listesini yeniden çekiyor** (artımlı patch değil) — Bölüm 21'in
  zaten bilinen "N+1/tam sayfalama yok" kategorisiyle aynı, bu ölçekte
  (bir ağaçtaki merge talebi sayısı küçük) pratik bir sorun değil.
  Realtime'ın kendi Phoenix protokolü bu sandbox'ta hiç simüle edilemedi
  (WebSocket erişimi de engelli, Bölüm 21 Faz C'den beri bilinen aynı
  sınırlama) — yalnızca abonelik KURULUMU (doğru tablo/filtre) ve
  yeniden-çekme mantığı doğrulandı, karşı tarafın gerçek bir eylemine
  anlık tepki hiç canlı test edilemedi.
- **`fetch_remix_graph` yalnızca yayınlanmış/kendi promptları döndürüyor**
  (RLS `security invoker`) — büyük bir ağaçta (yüzlerce düğüm) tek
  sorgunun performansı bu sandbox'ta gerçek ölçekte test edilemedi
  (yalnızca küçük örnek ağaçlarla doğrulandı).
- **Sürüm geçmişi yalnızca merge kabul edildiğinde üretiliyor** — bu
  uygulamada hâlâ bir "prompt düzenle" özelliği yok, bu yüzden bir
  promptun v1'i her zaman ya "hiç yok" ya da "ilk merge'den geriye dönük
  backfill edilmiş" oluyor; ayrı, merge'den bağımsız bir "düzenleme
  geçmişi" bu görevin kapsamında değildi.

---

**Sonraki adım:** Remix Dallanma Haritası + Merge sistemi (Bölüm 9.14)
TAMAMLANDI. **Güncelleme — kullanıcı bunu doğruladı:** `20260919220000`
(Bölüm 9.10), `20260919230000` (Bölüm 9.12), `20260919240000` (Bölüm
9.13) ve `20260919250000` (Bölüm 9.14) migration'larının DÖRDÜ DE
Dashboard → SQL Editor ile gerçek Supabase projesine sırayla uygulandı
ve hatasız çalıştı — bekleyen manuel migration adımı kalmadı, şema/RPC'ler
artık canlı projede gerçekten var (bkz. `supabase/README.md`'nin
güncellenmiş "Durum" notu). Bunun ile "her akışın gerçek iki hesapla
uçtan uca canlı denendiği" ayrı şeyler — bu depodaki Playwright testleri
hâlâ yalnızca ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla
çalıştı (Claude Code'un sandbox'ı gerçek projeye hâlâ erişemiyor); yeni
özelliklerin (Realtime senkronizasyonu, emoji tepkileri, merge akışı vb.)
gerçek kullanıcı hesaplarıyla beklendiği gibi davrandığı kullanıcının
kendi canlı denemesiyle doğrulanmalı. Bir sonraki modül için bu dosyanın
başındaki kurala uyarak önce mevcut mimari denetlenmeli, yalnızca gerçek
eksikler kapatılmalı.

---
