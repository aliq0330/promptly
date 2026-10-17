# 9.184 — Topluluk gönderisi = normal içerikle birebir aynı (sayfa, kaydet, istatistik, mesajla paylaşım)

Durum: kod + 1 migration (`20260920120000_community_post_save.sql`) + testler + belgeler repoda; **migration canlıya UYGULANDI** (kullanıcı "sql varsa uygula" dedi). Gerçek oturumla / Realtime'la / cihazla denenmedi; doğrulama yerel PostgreSQL 16 ve ağ taklitli Playwright'tadır. Tam anlatım: [`docs/community-system.md`](../community-system.md) → "Gönderi eşitliği".

## Karar (kullanıcıyla netleştirildi)

Topluluktaki iki gönderi tipi (yeni içerik / başvurulan içerik) sitedeki normal içerikle **birebir aynı** davranır: beğeni, yorum, kaydet, istatistik, paylaşım (bağlantı + site içi mesaj). Kararlar: (1) başvuruyu kaydedince **gönderinin kendisi** kaydedilir; (2) yerel içerik kaydedilince içerik koleksiyonda yaşar, topluluğa erişim biterse kayıt görünmez olur; (3) mesajla paylaşılan gönderiyi okuyamayan alıcı "erişimin yok" görür, içerik sızmaz; (4) başvuru sayfasında Studio/kopyala/ilişki haritası/sürüm geçmişi gibi tüm eylemler orijinal sayfadaki gibi çalışır.

## Öncesi

| | Yerel içerik | Başvuru |
|---|---|---|
| Sayfa | içeriğin kendi detay sayfası | `application-detail.tsx` ile yazılmış sadeleştirilmiş salt-okunur görünüm |
| Kaydet | sunucu + arayüz engelli | yok |
| Mesajla paylaşım | var | yok |

## Veritabanı (`20260920120000_community_post_save.sql`)

- `community_posts.save_count` (korumalı sayaç: `protect_counter_columns('save_count')`, CHECK ≥ 0).
- `collection_items.community_post_id` (FK `community_posts` ON DELETE CASCADE); `collection_items_exactly_one_target` dört hedefli yeniden yazıldı (**tek `drop`: CHECK'in genişletilmesi**, satırlara dokunmaz); (koleksiyon, gönderi) benzersiz + kısmi dizin.
- Sayaç tetikleyicileri prompt/hazır ayar ile aynı kural (kaydeden TEK kullanıcı): `handle_post_collection_items_insert/delete` (deyim düzeyi) + `handle_post_collections_before_delete` (koleksiyon silinince).
- `block_community_content_save` (179'un "kaydedilemez" engeli) → "yalnız topluluğu okuyabilen kaydeder" (`community_content_not_readable`); gönderi için: yerel gönderi ve istek başvurusu `community_post_not_savable`, olmayan gönderi `community_post_not_found`.
- `content_engagers`: `community_post` için "Kaydedenler" (yalnız istek boş).
- Yalnızca ekleyici + `create or replace`; mevcut 296 `collection_items` satırı korundu.

## İstemci

- `post-page.tsx`: başvurulan içeriğin NORMAL detay sayfasını çizer (`PromptDetailView` / `RequestDetailView` / `WorkflowDetailView({workflowId})` / `PresetDetailView({presetId})`) + üstte başvuru bandı (başvuran, not, "Orijinal içeriği aç", geri bağlantısı). `application-detail.tsx` silindi.
- `PostScope` bağlamı + `content/scoped-engagement.tsx` (`EngageLike/CommentCount/Save/Statistics/Share/Comments`): dört detay sayfası etkileşimlerini buradan çizer; bağlam varsa GÖNDERİNİN bileşenleri. `PostMenu` bağlamda içeriğin kendi yönetimini gizler, gönderi işlerini (extras) taşır.
- Kaydet: `SaveButton`/`SaveToCollectionModal`/`useSaveState`/`collections.ts` dördüncü hedef `community_post`; `CollectionEntry` + `fetchSavedItems`/`fetchCollectionItems` gönderileri tek ek okumayla çözer (okunamayan atlanır); `SavedPostCard` (Kaydedilenler ve koleksiyonlarda akıştaki kartın aynısı); Realtime `community_posts.save_count`.
- Yerel içerikte `!communityId` kaydet engelleri (kart altbilgisi, odak görünümü, dört detay sayfası) kalktı.
- `ApplicationCard` altbilgisi: Beğeni · Yorum · **Kaydet** · İstatistik … Paylaş; `PostStatisticsButton` Kaydedenler sekmesini açar (istek hariç).
- Site içi mesaj: `ShareModal` `community_post` için `sharePostId`; `lib/community-post-share.ts` (saf compose/parse, yeni mesaj şeması yok); `SharedCommunityPostCard` ("erişimin olmalı" durumu dahil); konuşma listesi/görünümü `sharePostId`'yi taşır.
- TR + EN çeviriler eklendi (`messages.sharedCommunityPost/communityPostNoAccess/aCommunityPost`, `communities.post.page.scopeHelp`, `communities.error.community_content_not_readable/community_post_not_savable`); kullanılmayan başvuru-sayfası anahtarları silindi.

## Doğrulama

- `supabase/tests/community-post-save.sql` (27 kontrol, `FAILED=0`): kaydet + sayaç (kaydeden tek kullanıcı, ikinci koleksiyon/çıkarma/koleksiyon silme), orijinal içeriğin sayacı değişmez, tam-bir-hedef CHECK'i, yerel gönderi/istek başvurusu reddi, sayaç istemciden yazılamaz, kapalı topluluk üyesi/üye olmayan, herkese açık toplulukta okuyabilen, yerel içerik kaydı + `save_count`, kaydedenler listesi, gönderi silinince cascade + `item_count` tutarlılığı. Önceki dokuz topluluk/sohbet SQL dosyası yeni migration'la `FAILED=0`.
- Playwright (`run-community-posts`, `mock-communities.mjs` koleksiyon taklidi): başvuru sayfası normal detay + eylem satırı + gönderiye bağlı beğeni/kaydet/yorum (16, 16a), gönderi menüsü (16e), Kaydedilenler (16g), İngilizce/mobil/tablet/koyu (16d, 16f), mesajla paylaşım + erişimsiz alıcı kartı (17, 17b).
- `npm test`: yeni `community-post-share.test.ts` + `saved-selection` testi.

## Bilinen boşluklar / dürüst liste

- Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
- Canlı uygulama: `apply_migration` bu ortamda 60 sn zaman aşımına düştü (içerik uygulanmadı, geri alındı); aynı SQL `execute_sql` ile parça parça uygulandı ve salt-okunur sorguyla doğrulandı; `schema_migrations`'a dosya sürümüyle kayıt elle düşüldü.
- Mesajla paylaşılan gönderiyi okuyamayan alıcı yalnızca gönderici başlık satırını düz metinde görür (diğer paylaşım türleriyle aynı); kart içeriği göstermez.
- Kaydedilen yerel içerik, kullanıcı topluluktan çıkınca listelerde görünmez olur (kayıt veritabanında kalır; geri dönünce görünür).
- Etkileşim kipi liste görünümlerinde üyelikten türetilir (kapatılmış topluluk ipucu yok; yazma yine sunucuda reddedilir).
