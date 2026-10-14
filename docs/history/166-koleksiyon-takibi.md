# 9.166 — Herkese açık koleksiyonları takip etme

Durum: uygulandı. Migration `20260919900000_collection_follows.sql` **canlıda uygulandı** (kayıt dosya sürümüyle düşüldü); arayüz kodu `main`'e birleşince yayınlanır. **Sıra önemli:** yeni kod `collections.follower_count` sütununu seçer; sütun yokken koleksiyon listeleri hata verirdi (migration önce uygulandı).

## Ne

Başkasının **herkese açık** koleksiyonunu takip etmek: koleksiyon sayfasında **Takip Et** + takipçi sayısı; kendi profilinde Kaydedilenler'de **Takip ettiğin koleksiyonlar**; başkasının profilinde (yalnız herkese açık, boş olmayan koleksiyonu varsa) **Koleksiyonlar** sekmesi — bu olmadan başkasının koleksiyonuna bağlantı dışında ulaşmanın yolu yoktu. Sahibine bildirim gider.

## Veritabanı

- `collection_follows (user_id, collection_id)`: RLS yalnızca sahibi okur/siler; ekleme yalnızca **herkese açık**, **kendine ait olmayan**, engelleme ilişkisi olmayan koleksiyona; kullanıcı başına ≤200 (`collection_follow_limit`). Koleksiyon/profil silinince cascade.
- `collections.follower_count`: `SECURITY DEFINER` trigger'la tutulan denormalize sayaç + `protect_collection_follower_count` (sahip kendi koleksiyonunu güncelleyebildiği için `anon`/`authenticated` rolüyle gelen sayaç değişikliği yok sayılır — `copy_count` deseni; sahibin `follower_count = 999` yazma denemesi hem yerelde hem canlıda (geri alınan işlemle) yok sayıldı).
- Bildirim: sahibe `'follow'` türünde `Koleksiyonunu takip etmeye başladı: "ad"` (bağlantı koleksiyon); `dedupe_key` takibi bırakıp yeniden takip edince tekrarı önler. Koleksiyon silinince ona işaret eden bildirimler de silinir (`cleanup_notifications_for_deleted_collection`).
- Koleksiyon sonradan gizli yapılırsa takip satırları durur ama koleksiyon (RLS) kimseye görünmediği için listelerde de görünmez (takipçi sayacı gizli koleksiyonda zaten görünmez); tekrar açılınca geri gelir.
- `collection_items`, `prompt_saves` benzeri mevcut kayıt akışları ve Genel koleksiyon DEĞİŞMEDİ.

## Arayüz

- `lib/supabase/collections.ts`: `fetchPublicCollectionsByOwner`, `fetchFollowedCollections` (önce takip satırları, sonra koleksiyonlar — özel yapılan/silinen kart olarak görünmez), `isFollowingCollection`, `followCollection` (çift takip hata değil, sınır → `CollectionFollowLimitError`), `unfollowCollection`; `Collection.followerCount`.
- `CollectionFollowButton` (kişi takibinin `FollowButtonView`'ü yeniden kullanıldı; misafir ortak giriş istemini görür): iyimser, hatada sayı ve durum geri alınır, mesaj gösterilir. Koleksiyon sayfasında yalnız sahibi olmayan ve herkese açık koleksiyonda; sayı herkese açık koleksiyonda görünür (1 → "1 takipçi").
- `CollectionCard`'a `readOnly` (yönetim menüsü yok, görünürlük yerine "… tarafından"). Takip edilenler (Kaydedilenler) ve başkasının profil sekmesi bunu kullanır.
- Metinler TR+EN: `collection.followerCount/One`, `followFailed`, `followLimit`, `followedHeading`, `byOwner`, `profile.tabCollections`, `notifMsg.followedCollection`.

## Etki alanı taraması

Koleksiyon sayfası ✔, kendi profilin (Kaydedilenler) ✔, başkasının profili ✔, bildirim merkezi (metin TR/EN, simge `follow`) ✔. **Yapılmadı (bilinçli):** takip edilen koleksiyona yeni içerik eklenince bildirim/akış (ayrı bir tasarım: toplu bildirim), Ana sayfada koleksiyon sekmesi, kartta takip düğmesi, "Genel" koleksiyonun varsayılan görünürlüğüne dokunulmadı (özel kalır → takip edilemez).

## Doğrulama

Yerel PostgreSQL 16: bütün migration'lar baştan oynatıldı; açık takip, gizli/kendi/başkası adına/çift/engelli reddi, sayaç (artış/azalış/elle yazma yok sayıldı), sahibin başkasının takip satırlarını görememesi, bildirim + tekrar takipte tekrarsız, gizli yapınca takipçiden gizlenmesi, 200 sınırı, koleksiyon silinince takip+bildirim temizliği, yetkiler. Canlıda yapı/RLS/trigger/kayıt. Tarayıcı (Playwright, sahte Supabase, 12 senaryo): takip → doğru POST + sayı, bırakma → DELETE, mevcut takip durumu, hata ve sınır geri alma, sahip düğmesi yok, misafir giriş istemi (istek yok), Kaydedilenler'de takip edilenler (gizlenmiş görünmez), başkasının profilinde sekme (menüsüz kartlar), koleksiyonsuz profilde sekme yok, kendi profilinde yok, TR metinler. Gerçek Supabase'e gerçek oturumla uçtan uca DENENMEDİ.
