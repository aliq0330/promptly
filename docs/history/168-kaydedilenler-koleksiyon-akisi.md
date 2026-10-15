# 9.168 — Kaydedilenler = koleksiyonların birleşimi; kaydet penceresi tek değişiklik noktası

Durum: uygulandı (yalnız istemci kodu; **veritabanı/migration değişikliği yok**, `collection_items` ve RLS aynen). Arayüz `main`'e birleşince yayınlanır.

## Sorun

"Kaydedilenler" ile koleksiyonlar birbirine karışıyordu (kökü: 9.22 ve 9.38'in birleşimi):
- Kaydedildi = herhangi bir koleksiyonda olmak (9.38), ama "Kaydedilenler" ekranı yalnız "Genel"i gösteriyordu → ikon dolu, listede yok.
- Dolu ikona basmak içeriği **tüm** koleksiyonlardan çıkarıyordu (RPC `remove_*_from_saved_everywhere`), "Genel"in detay sayfasından çıkarmak da.

## Yeni kurallar

- **Kaydedildi** = içerik kullanıcının en az bir koleksiyonunda. İkon, `/saved` ve kaydet penceresi aynı `collection_items` satırlarını okur.
- **Kaydedilenler** (`/saved`, mevcut rota; yeni ekran/nav yok) = kullanıcının tüm koleksiyonlarındaki **benzersiz** içerikler, en yeni kayıt önce (`fetchSavedItems` + `dedupeSavedEntries`). Arama koleksiyon sayfasıyla aynı; `CollectionEntryList` ikisinin ortak listesi. Profil → Kaydedilenler'de ilk karo `/saved`'e gider, ardından koleksiyon kartları (Genel önce).
- **Bir koleksiyondan çıkarmak yalnız o koleksiyonu etkiler** — "Genel" dahil. Kart menüsü her yerde "Koleksiyondan kaldır" (`collectionRemoval.isDefault` kalktı). Sonrasında `refreshSaveState` gerçek üyeliği okuyup paylaşılan ikon durumunu düzeltir (başka koleksiyonda varsa dolu kalır).
- **Dolu ikon artık hiçbir şeyi silmez**: boş ikonla aynı `SaveToCollectionModal`'ı açar ("Kaydedildiği koleksiyonlar"). Pencere artık **taslak** çalışır: işaretler yerel; "Kaydet"e basılana dek yazma yok, Vazgeç/✕/Escape/arka plan hiçbir şey değiştirmez. Yalnız değişen satırlar yazılır (`diffMembership`).
- Kısmi hata: her yazma ayrı (`Promise.allSettled`); gerçekten olanlar `savedIds` olur (`applyMembershipResult`), pencere açık kalır, hata gösterilir, taslak korunur (yeniden denenebilir). İkon yalnız 0 ↔ 1+ geçişinde değişir (`savedTransition`); yazma sürerken pencere kapatılamaz.
- Eşzamanlılık: `addItemToCollection` `23505`'i başarı sayar (tekil indeks zaten çift satırı engeller); silme olmayan satırda no-op. Kaydet butonu çift tıklamaya karşı kilitli.
- `fetchCollectionIdsContaining` ve `fetchSavedItems` hatada **fırlatır** (hata "hiçbir koleksiyonda değil / hiç kaydı yok" gibi görünmez; pencere kaydı devre dışı bırakır, `/saved` hata mesajı gösterir).
- "Yeni koleksiyon oluştur" pencerede koleksiyonu gerçekten oluşturur (açık bir kullanıcı eylemi) ve taslakta işaretler; üyelik "Kaydet"te yazılır. Vazgeçilirse oluşturulmuş boş koleksiyon kalır.

## Kaldırılan / değişen kod

- Kaldırıldı: `removeFromSavedEverywhere` (istemci), `useSaveState().removeEverywhere/isToggling`, `fetchDefaultCollectionId` (yalnız eski `/saved` yönlendirmesi kullanıyordu), `common.removeFromSaved`, `prompt.removeFromSaved`, `collection.removedFromSavedToast`.
- **DB'de `remove_prompt_from_saved_everywhere`, `remove_workflow_from_saved_everywhere`, `remove_preset_from_saved_everywhere` RPC'leri duruyor** (artık çağrılmıyor; `drop` için onay gerekir, bilinçli olarak bırakıldı).
- "Genel"in verisine dokunulmadı; taşıma/silme yok.

## Testler

- `src/lib/saved-selection.test.ts` (`npm test`): fark, kısmi sonuç, ikon geçişi, 1→4 senaryosu, tekilleştirme.
- `supabase/tests/saved-collections.sql`: tüm migration'lar temiz PostgreSQL 16'ya oynatılıp (87 dosya) gerçek RLS ile: başkasının koleksiyonuna ekleme/silme/görme yok, çift ekleme `23505`, `save_count` sahip başına bir kez, prompt+workflow.
- Ağ taklitli Playwright (derlenmiş statik site + bellek içi sahte Supabase REST; depoda tutulmuyor, bkz. oturum raporu): kaydet/çık/iptal/hata/yenileme/workflow/İngilizce senaryoları.
- Denenmedi: gerçek Supabase'e karşı, gerçek cihazda; Hazır Ayar (preset) için tarayıcı testi yok (aynı bileşen/kod yolu, DB testi yok — presetin `save_count` tetikleyicisi ayrı).

## Bilinen sınırlar

- `fetchSavedItems` tek istekte en fazla 1000 üyelik satırı okur (PostgREST üst sınırı); çok büyük kitaplıkta en eski kayıtlar listede görünmeyebilir. Sayfalama yok.
- `/saved` başlığında sayı gösterilmez (kart bırakılınca sayı bayatlardı).
