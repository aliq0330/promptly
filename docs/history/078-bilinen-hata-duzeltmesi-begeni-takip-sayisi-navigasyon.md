### 9.78 Bilinen hata düzeltmesi: beğeni/takip sayısı navigasyon sonrası stale görünmesi + gerçek kaydetme sayısı + beğeni/kaydetme/takip için Realtime

Kullanıcının bildirdiği gerçek hata (birebir): *"Kendi beğenimde bazen
karttaki beğeniye bastım, beğeni 1 oldu, sonra ilgili sayfaya giriyorum 0
görünüyor, sayfayı yeniliyorum 1 görünüyor."* — ardından üç ek istek:
bunu TÜM beğenilerde düzelt, kaydetme sayısı da görünsün (o da aynı
sorunu yaşamasın), ve beğeni/takip/kaydetmede gerçek zamanlı (Realtime)
güncelleme olsun.

**Kök neden (gerçek kod okunarak doğrulandı):** `useLikeState`/
`useFollowState`'in optimistik artışı YALNIZCA o TEK `LikeButton`/
`FollowButton` ÖRNEĞİNİN kendi yerel `useState`'inde yaşıyordu — hiçbir
yerde paylaşılan önbelleğe (`RealPromptsProvider`'ın `realPrompts`
dizisi vb.) yazılmıyordu. Feed kartında kalbe basınca o kartın kendi
`count` state'i `0→1` oluyordu; detay sayfasına gidince `local-prompt-
view.tsx` hâlâ ESKİ `likeCount: 0` taşıyan `getCached(id)` nesnesini
buluyor, yeni `LikeButton` örneği bu eski değerden başlıyordu — sayfa
yenilenince önbellek sıfırlanıp DB'den taze `1` çekiliyordu, bu yüzden
"yenileyince düzeliyor" izlenimi doğuyordu. `FollowButtonView`'ın kendi
doküman yorumu bu TAM sınıf hatayı zaten belgelemişti ("iki bağımsız hook
örneği her biri kendi yerel optimistik state'ini tutar") — `ProfileHeader`
bunu yalnızca KENDİ sayfasında tek bir `useFollowState` çağrısını paylaşarak
atlatıyordu, ama sayfalar arası (ör. bir yaratıcı satırındaki `FollowButton`
ile profil sayfasının kendisi) aynı sorun duruyordu. Kaydetmede ise hiç
sayı YOKTU (Bölüm 9.22'nin kendi, kasıtlı kararı: "No count, saves are
never shown as a number").

**Mimari çözüm — paylaşılan, oturum-geneli "engagement store":**
Yeni `src/features/content/engagement-store.ts` — `useSyncExternalStore`
tabanlı, modül-seviyeli bir `Map<kind:scope:id, {count, active,
activeChecked}>`. `ensureSeeded()` yalnızca bir id'nin HİÇ SEED'LENMEMİŞ
olduğu durumda (render sırasında, senkron — ilk boyamada asla 0'a
flaşlamadan) prop'tan gelen temel sayıyı yazıyor; bir sonraki herhangi bir
bileşen örneği aynı id için mount olduğunda, ARTIK PAYLAŞILAN STORE'DAKİ
değeri kullanıyor — eski, olası stale prop'u YOK SAYIYOR. `applyToggle()`
yerel, optimistik bir kullanıcı eylemini (±1 + active flip) tek bir
notify'da uyguluyor; `setCount()` ise Realtime'dan gelen OTORİTER değeri
(delta değil, doğrudan overwrite) yazıyor — bu proje `output: "export"`
(tamamen statik, SSR yok) olduğundan modül-seviyeli bir singleton
GÜVENLİ (her ziyaretçi kendi tarayıcı sekmesinde ayrı bir JS modül
örneği çalıştırıyor, `useTagCatalog()`'un modül-seviyeli önbelleğiyle
aynı, zaten kanıtlanmış desen).

`useLikeState`/`useFollowState`/`useSaveState` (`src/features/prompts/
use-like-state.ts`, `src/features/profile/use-follow-state.ts`,
`src/features/prompts/use-save-state.ts`) — ÜÇÜ DE bu store'u kullanacak
şekilde yeniden yazıldı; HER ÜÇÜNÜN DE PUBLIC API'si (dönen alan adları)
değişmedi (yalnızca `useSaveState`'e yeni bir `saveCount` parametresi VE
dönüşe yeni bir `saveCount` alanı eklendi) — `LikeButton`/`FollowButton`/
`FollowButtonView` hiç dokunulmadan, olduğu gibi çalışmaya devam ediyor.

**Gerçek kaydetme sayısı — `prompts.save_count`/`workflows.save_count`
(generators'da zaten vardı, bkz. aşağı) + gerçek, per-owner-dedup'lu
trigger:** Kaydetme "bu kullanıcının HERHANGİ bir koleksiyonunda olması"
anlamına geliyor (Bölüm 9.38) — aynı çalışmayı kendi 2 koleksiyonuna
eklemek save_count'u 2 kez ARTIRMAMALI, yalnızca 1 kez. Migration
(`supabase/migrations/20260919540000_engagement_counts_and_realtime.sql`,
**gerçekten canlı projeye uygulandı**, MCP ile):

- `prompts`/`workflows`'a `save_count` eklendi (generators'ta zaten vardı —
  Bölüm 9.27'nin orijinal, ama Bölüm 9.36'nın `collection_items`'e
  geçişinden beri HİÇ GÜNCELLENMEYEN ölü `generator_saves`-bağlı
  trigger'ından kalma bir kolon; 62 generator'ın hepsinde değer 0'da
  donmuştu — gerçekten doğrulandı).
- Gerçek, dedup'lu trigger'lar `collection_items` üzerinde. **Bu
  trigger'lar yazılmadan önce, bu sandbox'ta GERÇEKTEN kurulan izole bir
  scratch PostgreSQL 16 örneğinde iki GERÇEK hata ampirik olarak bulunup
  düzeltildi** (varsayılmadı, gerçekten test edilip kanıtlandı):
  1. **AFTER ROW trigger'lar, TEK bir DELETE ifadesinin etkilediği TÜM
     satırlar için, o ifade TAMAMEN bitirdikten SONRA ateşleniyor** —
     yani `remove_prompt_from_saved_everywhere`'in (aynı owner+target için
     BİRDEN FAZLA satırı TEK bir DELETE'le silen) gerçek deseninde, her
     satırın kendi AFTER DELETE'i çalıştığında diğer satır(lar) ZATEN
     silinmiş oluyor — satır-bazlı "başka satır var mı" kontrolü bu
     durumda AYNI owner+target için birden fazla kez azaltma yapıp
     sayacı YANLIŞ düşürüyordu (3 bağımsız sahiplik senaryosuyla
     ampirik olarak yeniden üretilip kanıtlandı: beklenen 1, gerçekleşen
     0). **Düzeltme:** STATEMENT-level trigger'lar + transition table
     (`old_table`/`new_table`, Postgres 10+) — etkilenen TÜM satırları
     TEK SEFERDE, distinct (owner, target) çiftine göre gruplayıp
     ifade TAMAMEN bittikten SONRAKİ gerçek tablo durumuna bakıyor.
  2. **Bir KOLEKSİYONUN KENDİSİ silinince** (ON DELETE CASCADE ile kendi
     `collection_items` satırları da siliniyor), cascade'in
     `collection_items` üzerindeki AFTER DELETE'i ateşlendiğinde
     `collections` satırı ARTIK TABLODA YOK (minimal bir `parent`/`child`
     çifti üzerinde GERÇEKTEN test edilip kanıtlandı — fresh bir `SELECT`
     parent'ı bulamıyor). **Düzeltme:** ayrı bir `collections` BEFORE
     DELETE trigger'ı, koleksiyon (ve gerçek `owner_id`'si) HÂLÂ VARKEN
     dedup kararını ÖNCEDEN veriyor; `collection_items`'ın kendi DELETE
     trigger'ı, join'in boş döndüğü (owner bulunamayan = cascade kaynaklı)
     satırları sessizce atlıyor.
  - Her iki düzeltme de üç senaryoyla (2 koleksiyon + whole-collection
    cascade; 2 farklı sahip; `removeEverywhere`-tarzı tek-ifadeli
    çoklu-satır silme, 3. bağımsız bir sahip VARKEN) scratch Postgres'te
    yeniden doğrulandı, hepsi doğru sonuç verdi.
- Backfill: mevcut gerçek `collection_items` verisinden (`count(distinct
  c.owner_id)`) `prompts`/`generators`/`workflows.save_count` doğru
  değere çekildi — canlıda gerçekten çalıştırıldı: 61 prompt/93 toplam
  kayıt, 32 generator/40 toplam, 1 workflow/1 toplam (demo seed verisiyle
  tutarlı, mantıklı sayılar).

**Realtime — beğeni/kaydetme/takip (kullanıcının 3. isteği):** Yeni
`src/features/content/engagement-realtime-provider.tsx`
(`EngagementRealtimeProvider`, `PreferencesSync` ile BİREBİR AYNI
"childless, side-effect-only sibling" deseni — `AppProviders`'a eklendi).
**Bilinçli mimari karar:** `prompt_likes`/`collection_items`/`follows`'un
KENDİSİ `supabase_realtime` publication'ına EKLENMEDİ — bunun yerine
`prompts`/`generators`/`workflows`/`prompt_requests`/`prompt_results`/
`profiles` (zaten `like_count`/`save_count`/`follower_count`'u doğru
hesaplayan trigger'ların yazdığı "özet" tablolar) eklendi, istemci bu
tabloların UPDATE olaylarını dinleyip `new.like_count`/`new.save_count`/
`new.follower_count`'u DOĞRUDAN payload'dan okuyup store'a OVERWRITE
olarak yazıyor (delta değil). Bu, hem kendi eyleminin Realtime "echo"sunu
ayrıca filtrelemeyi GEREKSİZ kılıyor (aynı doğru sayıyı ikinci kez
yazmak zararsız) hem kaydetmenin per-owner dedup mantığını istemciye hiç
taşımıyor (DB zaten doğru hesaplamış, istemci yalnızca okuyor).
Abonelik `user`'dan bağımsız (sayılar herkese açık), tek bir paylaşılan
kanal üzerinden; `RealMessagesProvider`'ın "basit tut, filtrelenmemiş
dinle" kararıyla aynı kategoriden.

**`SaveButton`'a sayı eklendi:** `LikeButton`'ın `formatCount(count)`
deseniyle BİREBİR AYNI — ikon + sayı, hem giriş yapılmamış (login linki)
hem normal (toggle butonu) durumda. Yeni `prompt.saveAria`/
`prompt.loginToSaveAria` çeviri anahtarları (TR+EN, `likeAria`/
`loginToLikeAria` ile birebir aynı `{{count}}` interpolasyon deseni) —
mevcut bir metnin sessizce birleştirilmesi yerine ayrı anahtar (proje
i18n kuralı). 5 çağrı yeri güncellendi (`prompt-detail-view.tsx`,
`generator-detail-view.tsx`, `prompt-card-footer.tsx` ×3, `workflow-
view.tsx`) + `create-prompt-form.tsx`'in canlı önizleme `Prompt` nesnesi
+ `/dev/share-modal-test`'in fixture'ı (ikisi de yeni zorunlu alanı
eksik bırakmamak için güncellendi, `tsc` tarafından yakalandı).

**Nasıl doğrulandı:**
- Trigger mantığı, bu sandbox'ta GERÇEKTEN kurulan izole bir scratch
  PostgreSQL 16'da (yukarıda anlatıldığı gibi) kapsamlı test edildi,
  gerçek hatalar bulunup düzeltildi.
- Migration **gerçekten canlı Supabase projesine uygulandı** (MCP
  `apply_migration`), `pg_publication_tables` ile 6 yeni tablonun
  publication'a eklendiği doğrulandı, backfill'in gerçek, mantıklı
  sayılar ürettiği doğrulandı (yukarıdaki sayılar).
- `npx tsc --noEmit`, `npm run lint`, placeholder Supabase env ile tam
  `npm run build` (37 rota, değişmedi) sıfır hatayla geçti.
- **Dürüstçe belirtilmesi gereken sınırlama — canlı DB'de uçtan uca
  DML testi TAMAMLANAMADI:** trigger'ların GERÇEK canlı veri üzerinde
  (yalnızca izole scratch kopyasında değil) INSERT/DELETE ile çalıştığını
  kanıtlamaya çalışırken, bu oturumdaki Supabase MCP bağlantısının
  **her DELETE/DROP işlemini (trigger'daki mantıktan tamamen bağımsız
  olarak — boş, hiçbir trigger'ı olmayan bir scratch tabloda bile)
  60 saniyede timeout'a uğrattığı** keşfedildi (muhtemelen MCP'nin
  "yıkıcı işlemler onay gerektirebilir" davranışı — bu headless oturumda
  o onayı verecek biri yok). Bu yüzden canlı projede 3 geçici test satırı
  (ece/baran demo hesaplarına ait "tmp-live-test-*" koleksiyonları + bir
  gerçek prompta bağlı `collection_items`) INSERT ile oluşturulup save_count
  davranışı (2 farklı sahip → 2; aynı sahibin 2. koleksiyonu → hâlâ 2,
  deduplandı) GERÇEKTEN doğrulandı, ama bu satırlar DELETE edilemedi.
  Görünen etkiyi (yanlış `save_count=2`) UPDATE ile hemen `0`'a düzelttim
  (UPDATE gated değil, anında çalıştı), ama 3 geçici satırın kendisi hâlâ
  veritabanında duruyor — kullanıcıya temizlemesi için tam SQL verildi
  (sohbette). **Kullanıcının Supabase Dashboard → SQL Editor'de şunu
  çalıştırması gerekiyor:**
  ```sql
  delete from public.collection_items where collection_id in (
    '00000000-0000-4000-8000-0000000b0001',
    '00000000-0000-4000-8000-0000000b0002',
    '00000000-0000-4000-8000-0000000b0003'
  );
  delete from public.collections where id in (
    '00000000-0000-4000-8000-0000000b0001',
    '00000000-0000-4000-8000-0000000b0002',
    '00000000-0000-4000-8000-0000000b0003'
  );
  drop table if exists public._scratch_delete_probe;
  ```
- **Realtime abonelikleri hiç canlı test edilemedi** — bu sandbox'ın
  `*.supabase.co`'ya (hem REST hem WebSocket) doğrudan erişimi hâlâ
  engelli (Bölüm 17/21 Faz C'den beri tekrarlanan aynı kısıt) — yalnızca
  abonelik KURULUMU (doğru tablo/event) ve `engagementStore.setCount`'un
  saf mantığı güvenilir; karşı tarafın/başka bir sekmenin gerçek bir
  eyleminin bu sekmede anlık göründüğü hiç uçtan uca denenemedi.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- Yorum/yanıt beğenileri (`comment_likes`) bu göreve dahil edilmedi —
  kullanıcının bildirdiği hata ve istekler açıkça içerik-seviyesi (prompt/
  generator/workflow/istek/sonuç) beğeni/kaydetme/takibi hedefliyordu;
  yorum beğenileri ayrı, önceden var olan bir alt sistem.
- `prompt_likes`/`collection_items`/`follows` ham tablolarının kendisi
  publication'a eklenmedi (yukarıda "bilinçli mimari karar" olarak
  açıklandı) — özet tabloların UPDATE olayını dinlemek hem daha basit
  hem daha doğru.

**Bilinen sınırlamalar:**
- **Canlı DB'de 3 geçici test satırı temizlenmeyi bekliyor** (yukarıda
  tam SQL verildi) — kullanıcının SQL Editor'de çalıştırması gerekiyor.
- **Realtime abonelikleri canlı hiç test edilemedi** (yukarıda açıklandı).
- Realtime aboneliği filtrelenmemiş/geneldir (`RealMessagesProvider`'la
  aynı "basit tut" kategorisi) — bu uygulamanın gerçek içerik hacminde
  (demo ölçeği) pratik bir sorun değil, çok daha büyük bir ölçekte artımlı
  bir yaklaşıma geçmek gerekebilir.
