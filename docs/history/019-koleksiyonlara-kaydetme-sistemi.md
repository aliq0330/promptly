### 9.19 Koleksiyonlara kaydetme sistemi

Kullanıcının çok kapsamlı 14 bölümlük şartnamesi üzerine — bir çalışmayı
kaydederken doğrudan tek bir "Kaydedilenler" listesine değil, kullanıcının
kendi oluşturduğu adlı koleksiyonlara ekleyebilmesi.

**AŞAMA 1 denetim bulgusu — mimari karar:** Mevcut genel kaydetme sistemi
(`prompt_saves`, Bölüm 21 Faz 3) zaten ayrı, sağlam ve `useSaveState`/
`SaveButton` üzerinden çalışıyordu. Şartnamenin kendi §9'unun bıraktığı iki
seçenekten ("genel kaydetme ile koleksiyon üyeliği aynı şey olmak zorunda
değil") **ayrı ilişki** kararı verildi — `prompt_saves` hiç değiştirilmedi,
bozulmadı; yeni, bağımsız bir `collection_items` ilişkisi eklendi. Bir
çalışma aynı anda genel kaydedilenlerde VE birden fazla koleksiyonda
bulunabilir; bir koleksiyondan kaldırmak ne genel kaydı ne başka bir
koleksiyondaki üyeliği etkiler (Bölüm 9.7'nin "bir yerden silmek başka
hiçbir şeyi bozmaz" ilkesiyle aynı ruh).

**Yeni migration: `supabase/migrations/20260919260000_collections.sql`:**
- `collections` (id, owner_id, name — 1-80 karakter CHECK, visibility
  `public`/`private`, denormalize `item_count`, created_at/updated_at) —
  `set_updated_at()` trigger'ı (extensions_and_helpers.sql'den) yeniden
  kullanıldı, yeni bir fonksiyon yazılmadı.
- `collection_items` (collection_id, prompt_id, created_at; PK
  `(collection_id, prompt_id)` — aynı çalışma aynı koleksiyona veritabanı
  seviyesinde iki kez eklenemez, ekstra bir "zaten var mı" kontrolüne gerek
  yok).
- `handle_collection_item_change` trigger'ı — `prompt_likes`/`prompt_saves`
  ile birebir aynı desende `item_count`'u INSERT/DELETE'te günceller.
- **RLS:** `collections` — herkese açık koleksiyon herkese, özel koleksiyon
  yalnızca sahibine okunur (`prompts.status='draft'` deseniyle birebir
  aynı); insert/update/delete yalnızca `owner_id = auth.uid()`.
  `collection_items` — bir öğe, ebeveyn koleksiyon görülebiliyorsa
  okunabilir; yazma (ekleme/kaldırma) yalnızca çağıranın SAHİP OLDUĞU bir
  koleksiyona `exists (select 1 from collections c where c.id = ... and
  c.owner_id = auth.uid())` ile sınırlı — istemciden gelen hiçbir kimliğe
  güvenilmiyor, her zaman gerçek `owner_id`'ye geri bağlanıyor.

**Yeni `src/lib/supabase/collections.ts`:** `fetchOwnCollections`,
`fetchCollectionById`, `fetchCollectionItems` (soft-deleted promptları
`prompts.ts`'teki aynı filtreyle dışlıyor), `fetchCollectionIdsContaining`
(bir çalışmanın hangi koleksiyonlarda olduğu — modalın "+/kayıtlı" durumu
için), `createCollection`, `updateCollection`, `deleteCollection`,
`addItemToCollection`, `removeItemFromCollection`. Kapak görseli ayrı bir
yüklenen alan DEĞİL — `fetchCovers()` her koleksiyon için en son eklenen
öğenin ilk medyasını tek bir toplu sorguyla (`.in("collection_id", ids)`)
çekiyor, N+1 yok.

**Koleksiyona ekleme = genel kaydetme (bilinçli bağ):** Şartnamenin §4'ü
("Koleksiyonlar, kaydedilen içeriklerden bağımsız bir sistem gibi
davranmamalı") gereği `addItemToCollection`, `collection_items`'a INSERT
attıktan sonra mevcut `savePrompt()`'u (saves.ts, hiç değiştirilmedi) da
çağırıyor — bir koleksiyona eklemek artık bu uygulamanın birincil "kaydet"
eylemi, bu yüzden genel "Kaydedilenler > Tümü" listesi de otomatik
doluyor. Bir koleksiyondan kaldırmak ise genel kaydı GERİ ALMIYOR (yalnızca
o koleksiyondaki üyeliği siliyor) — kasıtlı, tek yönlü bir bağ.

**UI (`src/features/collections/`):**
- `save-to-collection-modal.tsx` (`SaveToCollectionModal`) — bookmark
  ikonuna basınca artık doğrudan toggle yerine bu modal açılıyor
  (`save-button.tsx` güncellendi, `useSaveState`'in kendisi hiç
  değişmedi — yalnızca `toggle()` çağrısı `setModalOpen(true)` oldu).
  Koleksiyonları listeler (kapak/ad/sayı/+ veya ✓), her satır bağımsız
  optimistic ekleme/kaldırma yapar (hata olursa geri alınır). **"+ Yeni
  koleksiyon oluştur" ikinci bir modal AÇMIYOR** — şartnamenin §2 kuralına
  uyarak aynı modal kabuğunun içeriği `view: "list" | "create"` state'iyle
  yerinde değişiyor (aynı dialog, X hep aynı yerde, akış kopmuyor). Yeni
  koleksiyon bu akıştan oluşturulunca mevcut çalışma otomatik ekleniyor
  (şartname §2'nin "kaydetme akışından oluşturulan koleksiyona otomatik
  ekle" kuralı); profil sayfasındaki "+ Koleksiyon oluştur" ise AYRI,
  bağımsız bir `CollectionFormModal` kullanıyor ve hiçbir çalışma
  eklemiyor — şartname §2'nin "hangi ekrandan açıldığına göre doğru
  davranmalı" ayrımı, iki farklı giriş noktasının iki farklı (ama aynı
  `CollectionForm`'u paylaşan) modal kullanmasıyla sağlandı.
- `collection-form.tsx` (`CollectionForm`) — ad + gizlilik radio-card'ları,
  hem create hem edit için paylaşılan tek form; boş/80 karakter üstü isim
  gönderilemez, çift gönderim `isSubmitting` ile engellenir.
- `collection-form-modal.tsx` — profil sayfasından bağımsız oluşturma VE
  düzenleme için ortak modal kabuğu (`collection` prop'u varsa düzenleme).
- `collections-panel.tsx` — profilin "Koleksiyonlar" alt sekmesi: grid,
  "+ Koleksiyon oluştur", boş durum.
- `collection-card.tsx` / `collection-more-menu.tsx` — kapak/ad/sayı/
  gizlilik rozeti + kebab menüden Düzenle/Sil (iki tıklamalı onay,
  `PostMenu`/`ProfileMoreMenu` ile aynı desen).
- `collection-detail-view.tsx` + yeni `/collections/local?id=` rotası
  (`promptHref`/`requestHref`/`tagHref` ile birebir aynı desen —
  koleksiyonlar da build-zamanında bilinmeyen gerçek Supabase satırları).
  RLS zaten "bulunamadı" ile "özel, erişimin yok" ayrımını yapmıyor —
  ikisi de aynı dürüst "Koleksiyon bulunamadı" ekranına düşüyor
  (`fetchConversationForUser`'ın kabul ettiği aynı belirsizlikle aynı
  karar). **Koleksiyondan kaldırma** ayrı bir buton olarak eklenmedi —
  detay sayfasındaki her kartın kendi bookmark ikonu zaten aynı
  `SaveToCollectionModal`'ı açıyor, kullanıcı oradan bu koleksiyonun
  işaretini kaldırabiliyor; paralel bir ikinci "kaldır" mekanizması kurmak
  yerine var olan akış yeniden kullanıldı.

**Profil entegrasyonu (`profile-view.tsx`):** Mevcut "Kaydedilenler" sekmesi
(yalnızca `isOwnProfile`) hiç değişmeden duruyor; sekmenin içine, yalnızca
o sekme aktifken görünen bir "Tümü / Koleksiyonlar" alt sekme satırı
eklendi. "Tümü" eski davranışın (mevcut `savedPrompts` + toolbar/grid)
birebir aynısı; "Koleksiyonlar" yeni `CollectionsPanel`'i render ediyor.

**Güvenlik:** İstemciden gelen hiçbir `user_id`/`owner_id`'ye güvenilmiyor
— her yazma RLS'te gerçek `auth.uid()`'ye karşı, `collections.owner_id`
üzerinden doğrulanıyor. Bir kullanıcı başka birinin koleksiyon id'sini
tahmin etse bile ne düzenleyebilir ne silebilir ne de ona öğe
ekleyebilir/kaldırabilir (üç ayrı policy, üçü de aynı `owner_id =
auth.uid()` sahiplik kontrolüne dayanıyor). Gizlilik değişikliği
(`herkese açık` ↔ `sadece ben`) RLS'in SELECT politikasındaki
`visibility` kolonuna doğrudan bağlı olduğundan, bir güncelleme anında
gerçek erişim kuralına yansıyor — ayrı bir "cache temizleme" adımı
gerekmiyor.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota — yeni `/collections/local` dahil) sıfır hatayla geçti.
**Dürüstçe belirtilmesi gereken sınırlama:** önceki modüllerin aksine, bu
görev için ne yerel bir PostgreSQL 16 örneğinde gerçek RLS/trigger testi
ne de ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla bir Playwright
uçtan uca testi çalıştırıldı — yalnızca statik analiz (tip kontrolü, lint,
build) ile doğrulandı. Migration dosyası önceki 20 migration'ın kurduğu
kalıpları (aynı trigger fonksiyonu adlandırma stili, aynı RLS ownership
deseni, aynı denormalize sayaç yaklaşımı) birebir izliyor ve bu kalıplar
daha önce gerçekten test edilmiş durumda, ama bu SPESİFİK migration'ın
kendisi hiç çalıştırılmadı. **Kullanıcının yapması gereken:**
`20260919260000_collections.sql`'i Dashboard → SQL Editor'de uygulamak, ve
kaydetme modalını, koleksiyon oluşturma/düzenleme/silme akışlarını
gerçek hesabıyla bizzat denemek.

**Bilinen sınırlamalar:**
- **Gerçek Supabase/RLS testi yapılmadı** (yukarıda açıklandı) — bu
  oturumun en dürüst eksiği, önceki modüllerin standardının altında.
- Koleksiyon adları için tekillik (aynı kullanıcıda aynı isim) kontrolü
  yok — prompt başlıkları gibi bu proje genelinde zaten tekil olması
  gerekmeyen bir alan, tutarlı bırakıldı.
- Koleksiyon kapak görseli her zaman "en son eklenen öğe" — kullanıcı
  belirli bir kapak seçemiyor; şartname böyle bir seçim istemedi.
- Koleksiyon detay sayfasında ayrı bir "koleksiyondan kaldır" butonu yok
  (yukarıda gerekçesiyle açıklandı) — var olan kaydet modalı üzerinden
  yapılıyor.
- Genel "Kaydedilenler" listesi bir koleksiyona eklenince otomatik
  büyüyor, ama bir koleksiyondan çıkarılınca KÜÇÜLMÜYOR (tek yönlü bağ,
  yukarıda "bilinçli bağ" olarak açıklandı) — kasıtlı bir ürün kararı,
  şartnamenin kendisi de aksini istemedi.

---
