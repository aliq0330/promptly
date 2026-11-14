# 9.386 — Ortak koleksiyon

Durum: **kodlandı; canlıya birleşme + deploy hattıyla uygulanır** (migration `20261125100000_collaborative_collections.sql`, yalnız ekleyici — `schema_migrations`'a bak). Gerçek Supabase'e / cihaza karşı DENENMEDİ; yerel PostgreSQL + ağ taklitli Playwright ile sınandı.

## İstenen davranış (kullanıcı kararları)

- Bir koleksiyonu birden çok kişi birlikte doldurur. **Sahip + eşit ortaklar; "görüntüleyici" rolü YOK.**
- Koleksiyon **herkese açık** olabilir (herkes görür/takip eder, yalnız ortaklar ekler) ya da **özel** (yalnız sahip + ortaklar görür; başkası "bulunamadı" görür).
- İçeriği **yalnız onu ekleyen kaldırır** — sahip bile başkasının eklediğini kaldıramaz.
- Ortak koleksiyon **tüm ortakların profilinde** listelenir (özelse profilde yalnız ortaklar görür).
- Davet **yalnız kullanıcı adıyla**.

Benim eklediğim varsayımlar (kullanıcı onayladı): sahip rolü kalır (ad, görünürlük, davet, ortak çıkarma, silme yalnız onda); ortak çıkarılırken/ayrılırken içerikleri için seçim sorulur; davet yalnız sahipte; kaydet modeli A (aşağıda).

## Veritabanı

- `collections.is_shared`, `collections.member_count` (korumalı sayaç), `collection_items.added_by` (ekleyen; boş = eski satır ya da ayrılan/çıkarılan ortağın bıraktığı → sahibe ait).
- `collection_members(collection_id, user_id, added_by, created_at)` — sahip burada YOK; `collection_invitations` (bekleyen davet başına tek, `Space` davet kalıbı). İstemci bu tablolara YAZAMAZ; üyelik tablosunda yalnız kendi satırım okunur (collections ↔ üyelik politikası özyinelemesini önlemek için; başkalarının üyeliği yalnız RPC'den).
- RLS: `collections` ve `collection_items` SELECT'ine üye dalı (yeni, ayrı politikalar — eski politika adlarına bağımlılık yok); `collection_items` INSERT = sahip YA DA ortak koleksiyonda üye; **DELETE = `added_by = uid` YA DA (`added_by is null` ve koleksiyonun sahibi)**. `collection_members` SELECT'i anon'a da açık (collections politikasının alt sorgusu çağıranın yetkisiyle çalışır; anon'da hiç satır dönmez).
- Tetikleyiciler: `collection_items_a_shared_guard` (BEFORE INSERT; `added_by` sunucuda yazılır, istemci veremez; ortak koleksiyona yalnız herkese açık + yayında + topluluk/ekibe özgü olmayan içerik girer, topluluk başvuru gönderisi girmez — `quote_target_ok`), `collection_items_saved_all_before_insert` genişledi (ortak koleksiyonda **hem ekleyenin hem sahibin** sistem koleksiyonuna kayıt yazılır), `collection_items_notify_shared` (koleksiyon+kişi+gün başına tek bildirim), `collection_follows_no_member`, `collections_notify_members_on_delete`, `protect_collection_shared` (`is_shared` istemciden yazılamaz).
- RPC'ler (SECURITY DEFINER): `set_collection_shared`, `collection_unshareable_items`, `invite_collection_member`, `respond_collection_invitation`, `revoke_collection_invitation`, `my_collection_invitations`, `collection_members_list`, `remove_collection_member(…, p_remove_items)`, `profile_collections` (anon dahil; çağıranın okuyabildikleriyle sınırlı).
- Sınırlar: üye + bekleyen davet ≤ 9 (sahiple 10 kişi), kişi başına ≤ 50 ortak koleksiyon, günde ≤ 20 davet (`_rate_limit`).

### Kaydet modeli (336 değişmezi korunur)

336'dan beri her koleksiyon üyeliği sahibin "Kaydedilenlerin tümü"nün alt kümesidir; `save_count`/istatistik/Sana özel okumaları buna yaslanır. Ortak koleksiyonda bir ortak içerik eklediğinde tetikleyici içeriği **ekleyenin ve sahibin** sistem koleksiyonuna da yazar → hiçbir sayaç ve okuma sorgusu değişmedi (tek tetikleyici). Bedeli: sahibin Kaydedilenler'i ortakların eklediğiyle de büyür ve o içeriğin `save_count`'u ortak başına bir artar. Koleksiyondan çıkarmak kaydı etkilemez (aynı 336 kuralı). `unsave_content` (INVOKER) sahibin ortaklarca eklenen satırını RLS gereği silmez.

Alternatif (yapılmadı): ortak koleksiyon öğeleri ayrı tabloda; kayıtlar/sayaçlar hiç etkilenmez ama okuma yolu ikiye bölünür.

## İstemci

- `lib/collection-permissions.ts` (rol → izin aynası, birim testli; migration metnini okuyup SQL ↔ istemci ayrışmasını denetler), `lib/supabase/collection-members.ts` (RPC çağrıları), `collections.ts` (`fetchOwnCollections` ortak olunanları da getirir, `fetchCollectionMembership` kilitli satırları bildirir, `saveCollectionSettings`, `createCollection({shared})`).
- Koleksiyon sayfası: "Ortak" etiketi + avatar yığını (`CollectionBand`), rol bazlı eylem satırı, ≤3 bölüm olduğundan `Tabs` (İçerik · Ortaklar, `?tab=members`), her kartın altında "X ekledi" satırı (kart içine satır eklenmez), "Koleksiyondan kaldır" yalnız ekleyene.
- Yeni bileşenler: `collection-members-tab` (`PersonRow` listesi, davet/çıkarma/ayrılma), `collection-invite-modal` (`SpaceDialog`), `collection-remove-member-dialog` (`ConfirmDialog` + iki seçenek), `collection-add-content` ("İçerik ekle": ekip dosyasındaki `ContentPickerDialog` yeniden kullanılır), `collection-invites-strip` (`/saved` üstünde tek satırlık davet kartları).
- `CollectionForm` "Ortak çalışma" anahtarı (+ ortak olamayacak içerik uyarısı ve "Çıkar"); `SaveToCollectionModal` ortak etiketi ve kilitli satır; `CollectionCard`/`/saved` rafı "Ortak" etiketi; profil listesi `profile_collections`'tan (RPC yoksa eski sorguya düşer).
- Bildirimler yeni tür açmaz: `system` + adres (davet → `/saved?invites=1`); kalıplar `notification-message.ts` `COLLAB_TEMPLATES` + `notifMsg.collab*`. Metinler `translations-collab.ts` (TR+EN).
- Yeni sütunlar `OPTIONAL_COLUMNS`'a eklendi (migration gecikirse koleksiyonlar yine açılır).

## Testler

- `supabase/tests/collaborative-collections.sql` — 85 kontrol: açma (uygun olmayan içerik reddi, `is_shared`/`member_count` istemciden yazılamaz), davet (büyük/küçük harf, çift, kendine, engel, geri çekme, limit 9), kabul/ret, görünürlük (özel ortak koleksiyonu ortak olmayan/anon görmez), ekleme (ortak ekler, `added_by` sahtelenemez, özel içerik reddi), **çıkarma (sahip bile başkasınınkini silemez)**, kaydet modeli (`save_count` ekleyen + sahip), `unsave_content`, takip, profil görünürlüğü, ortak çıkarma/ayrılma iki seçenek, bildirimler, anon yetkileri. Tüm SQL paketi (96 dosya) yeşil.
- Birim: `collection-permissions.test.ts` (8), `unbounded-queries`; `npm test` 1086/1086.
- Ağ taklitli Playwright: `run-collab-collections.mjs`.

## Bilinçli sınırlar

- Sahip hesabı silinirse koleksiyon ortaklarıyla birlikte gider (silme penceresi bunu söyler); sahiplik devri yok.
- Davet bağlantısı yok (yalnız kullanıcı adı); davetin süresi yok.
- Ortakların eklediği içerikler için ayrı etkinlik günlüğü / içerik başına yorum yok.
- Gizlilik Politikası / Kullanım Koşulları güncellenmedi (ortakların profilde birbirinin koleksiyonunu görmesi hukuki bir karar).
- Koleksiyon için ayrı bir şikâyet yolu bu işte eklenmedi.
- Engelleme sonradan yapılırsa mevcut üyelik düşmez (davet/kabulde denetlenir).
- Kartta "ekleyen" bilgisi görselin üstünde değil, kartın altında küçük bir satırdır (kart kuralı: kartın iç yerleşimine satır eklenmez).
