# 9.336 — Kaydetmek ≠ koleksiyona eklemek (Instagram "Saved" mantığı)

Durum: kodlandı ve yerelde sınandı; **canlıya UYGULANMADI** (migration `20261105100000_saved_all_collection.sql` deploy hattıyla uygulanır — `schema_migrations`'a bak). Gerçek Supabase'e/cihaza karşı DENENMEDİ.

## İstenen davranış

- Kaydedilen her şey otomatik "Kaydedilenlerin tümü"ne girer; bu alan sistemindir (silinemez/düzenlenemez).
- Kullanıcı kendi koleksiyonlarını açar; bir içerik birden çok koleksiyonda olabilir.
- "Koleksiyona ekle" ekranı: koleksiyonlar + seçili/değil, aynı ekrandan yeni koleksiyon.
- Koleksiyondan çıkarmak yalnız o koleksiyondan çıkarır; "Kaydedilenlerden kaldır" her yerden çıkarır.
- Kaydetmek ve koleksiyona eklemek ayrı işlemler. Zorunlu "Genel" koleksiyonu kalkar.

## Karar: yeni tablo yok

168'de "kaydedildi = herhangi bir koleksiyonda" idi ve zorunlu "Genel" (`is_default`) vardı. `save_count`, istatistik, Sana özel, API, moderatör sayımları… hep `collection_items ⋈ collections.owner_id` okuyor. Yeni bir `saved_items` tablosu on kadar SQL fonksiyonunu (feed/istatistik kopyaları dahil) yeniden yazmayı gerektirirdi. Bunun yerine `is_default` koleksiyonu **gizli sistem koleksiyonuna** dönüştü: her kaydedilen içeriğin tam bir satırı orada, koleksiyon üyelikleri onun alt kümesi. Sayaçlar ("sahip başına bir kez") hiç değişmedi.

## Veritabanı (`20261105100000_saved_all_collection.sql`)

- `collections_before_update`: JWT'li çağrılar sistem koleksiyonunun adını/görünürlüğünü/`is_default`'unu değiştiremez (migration/sunucu işi `auth.uid() is null` serbest). `ensure_default_collection` adı "Kaydedilenler" (etiketi istemci çevirir).
- **Mevcut "Genel" koleksiyonlar** (kullanıcı seçimi: veri silinmez): içeriği ya da takipçisi olan → bayrağı kalkar, sıradan "Genel" koleksiyonu kalır (kimlik, görünürlük, takipçi aynen) ve yerine yeni sistem koleksiyonu açılır; boş ve takipçisiz → kendisi sistem koleksiyonuna döner. Ardından her kullanıcının tüm üyelikleri sisteme işlenir (idempotent). Yıkıcı ifade yok.
- `collection_items_saved_all_before_insert` (BEFORE, satır): koleksiyona eklenen içerik sistemde yoksa önce oraya girer. **BEFORE olmalı**: sayaç tetikleyicileri "toplam − eklenen ≤ 0 ise +1" sayar; AFTER olsaydı sistem satırı önce görünür ve `save_count` hiç artmazdı. Başkasının koleksiyonuna ekleme denemesinde (`auth.uid() <> sahip`) sisteme dokunmaz (RLS reddeder; `ON CONFLICT DO NOTHING` ile sızdırma yok, testli).
- `unsave_content(p_type, p_id)` (INVOKER, authenticated): çağıranın tüm koleksiyonlarından tek DELETE. Satır tetikleyicisiyle "sistemden silince diğerlerini sil" **denendi ve bırakıldı**: içerik CASCADE silinirken kardeş satırı silen tetikleyici `tuple to be updated was already modified` verir (`community-content`, `admin-bulk-delete-force` testleri yakaladı); ayrıca iç içe silme sayacı iki kez düşürürdü.
- `admin_bulk_delete_impact`: "saves" artık sistem koleksiyonu satırı sayar (kaydeden kişi sayısı).
- Bilinen: moderasyon panosunun toplam/kişi başı "kaydet" sayıları (`admin_*`, 20260919690000/740000) satır saydığı için koleksiyon üyelikleri kadar şişer (informatif; düzeltilmedi).

## İstemci

- `lib/supabase/collections.ts`: `fetchOwnCollections` yalnız `is_default=false` (self-heal ve "Genel önce" sıralaması kalktı); `saveWork`/`unsaveWork`/`fetchIsSaved`; `isPromptSaved`, `fetchSavedItemsPage`, `fetchSavedPresetsPage`, `fetchSavedPickableWindow` `collections.is_default=true` süzer (içerik başına tek satır, dedupe gerekmedi); `fetchCollectionIdsContaining` yalnız normal koleksiyonlar; `Collection.isDefault` ve tüm "Varsayılan" rozet/ipucu/silme engeli kalktı.
- `SaveButton` / `PresetSaveCta`: boş yer imi **bir dokunuşta kaydeder** (`useSaveState().quickSave`), `SaveFeedbackToast` "Kaydedildi · Koleksiyona ekle"; dolu yer imi `SaveToCollectionModal`'ı açar. Modal "Koleksiyona ekle": koleksiyonlar + onay kutuları (taslak, "Kaydet"), "Yeni koleksiyon oluştur", dolu içerikte altta "Kaydedilenlerden kaldır" (iki dokunuş onay). Kayıtsız içeriği koleksiyona eklemek kaydeder (`savedAfterCommit`). Koleksiyon sayfasından çıkarmak kaydı etkilemez (`refreshSaveState` kalktı); sahibinin koleksiyon sayfasında `dropWhenUnsaved`.
- `/saved` başlığı ve profil karosu "Kaydedilenlerin tümü". Çeviriler TR+EN eklendi (`prompt.savedToast`, `collection.addToTitle/removeFromSaved/removeFromSavedConfirm`, `saved.allTitle`; eskiler güncellendi, kullanılmayan "Varsayılan" anahtarları silindi).

## Testler

- `supabase/tests/saved-collections.sql` yeniden yazıldı (kaydet → koleksiyona ekle → çıkar → `unsave_content`, sayaç tek artış/azalış, sistem koleksiyonu değiştirilemez/silinemez, RLS/sızdırma yok, içerik CASCADE silme): FAILED=0; `community-post-save.sql` (24/25 yeni modele göre) ve diğer koleksiyona dokunan testler (`community-content`, `admin-bulk-delete-force`, `counter-protection`, `for-you`, `creator-insights*`, `api-me`, `anon-hardening`, `safety-hardening`) temiz.
- Dönüşüm: önceki migration'a kadar kurulmuş şemada eski tarz veriyle (içerikli/boş/takipçili Genel, özel koleksiyon) denendi: sayaçlar değişmedi, tekrar uygulama zararsız.
- Birim: `saved-selection.test.ts` (`savedAfterCommit`), `unbounded-queries.test.ts`.
- Ağ taklitli Playwright: yeni `run-save-collections.mjs` (7), güncellenen `run-profile-collections` (13), `run-community-posts` (36; 16a yeni akışa göre), `mock-communities.mjs` yeni modele göre. `run-pagination` #4 (profil araması `prompt_text` eklenmiş) ve `run-comment-extras` (GIPHY anahtarı) bu işten bağımsız önceden var olan uyuşmazlıklardır.
- CI UI listesine `run-save-collections` eklendi; `scripts/smoke-test.mjs`'e `unsave_content` (soft).

## Canlı veri (2026-11-05, salt-okunur sorgu)

20 "Genel" (18'i içerikli, 677 öğe, özel koleksiyon yok, 1 herkese açık + 1 takipçili). Migration sonrası beklenen: 20 kullanıcıda sistem koleksiyonu, içerikli/takipçili Genel'ler sıradan koleksiyon olarak kalır. Uygulandıktan sonra doğrula.

## Bilinen sınırlar

- Koleksiyon üyelikleri ≤ kayıt değişmezi yalnız `unsave_content` ve ekleme tetikleyicisiyle korunur; istemci REST ile yalnız sistem satırını silerse koleksiyonda kayıtsız öğe kalabilir (yalnız kendi verisini bozar, sayaç tutarlı).
- Eşleşen yeni kullanıcı davranışı (kayıtta sistem koleksiyonu) `handle_new_user` zaten `ensure_default_collection` çağırdığı için değişmeden sürer.
