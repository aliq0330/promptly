# 460 — Space sosyal katmanı contract'ı + kişisel Space'te dışa aktarma

459'un ardından ("Yapılmayanları yap"): güvenle ve doğrulanabilir biçimde yapılabilenler yapıldı, geri kalanı gerekçesiyle açık bırakıldı.

## Yapıldı

**1. Contract (`20261216100000_space_social_contract.sql`, yıkıcı):** yalnız Space'e ait ve başka fonksiyonlara dolanmamış nesneler düştü.
- Tablolar: `space_share_links`, `space_link_grants` (yalnız `spaces_after_update` anıyordu; o yeniden yazıldı).
- Sütunlar: `spaces.rating_avg/rating_count/activity_visibility`; puan tetikleyicileri (`prompt_comments_space_rating`, `spaces_protect_rating`),
  `handle_space_rating_change`, `prompt_comments_space_rating_uniq` dizini.
- Ölü yazma yolları: `notify_space_comment` (+ tetikleyicisi), `set_space_activity_note`.
- `list_spaces` "recommended" sıralamasından puan terimi çıktı; `space_activity` okuma politikası "herkese açık etkinlik" ayarı kalktığı için yalnız üyeler.

**Bilerek DÜŞMEDİ** (adıyla başka fonksiyonlarda geçiyor; yeniden yazmak her yorum/beğeni yazımını riske atar, bu yüzden ayrı ve daha dikkatli bir
contract): `spaces.quote_count/comment_count/like_count/shared_at` (feed_page, moderate_report, notify_comment_mentions, space_feed_cards),
`prompt_comments.space_id/space_activity_id/rating` (handle_prompt_comment_change, handle_comment_delete, comment_follow_on_insert…),
`content_quotes.space_id`, `prompt_likes.space_id`, `community_posts.space_id` (create_quote, content_engagers, handle_*_change, search_quotes,
share_to_community…), `space_activity.comment_count/author_note` (following_activity_page), `space_user_state.favorite` (list_spaces çıktısı).

**2. Kişisel Space'te dışa aktarma:** pano araç çubuğuna "Dışa aktar" (PNG · PDF · JSON) eklendi; yalnız düzenleyebilenlere. İşlev ekip panosunun
Paylaş penceresindekiyle AYNIDIR (`board-export-run.ts` ortak; ikinci bir dışa aktarma yazılmadı), tarayıcıda üretilir, sunucuya yazılmaz.

**3. CLAUDE.md** 459'dan kalan eski ifadelerden (Keşfet "Spaces", profil "Spaces", Paylaş'ta Space sahibi, sohbette Space paylaşımı, takip
akışında Space etkinliği, `star-rating` istisnası…) temizlendi.

## YAPILMADI (ve neden)

- **Konumlu yorum, çizim öğeleri (çerçeve/metin/şekil), pano grupları kişisel Space'e:** ekip panosuna dolanmış. Konumlu yorum RPC'leri
  (`pin_comment_*`) `team_projects`/`team_id`'ye, ekip bildirimlerine ve ekip rollerine bağlı; çizim araçları `SpaceBoard`'un `team` kipinin araç
  çubuğunda (`canDraw = teamMode && …`); pano grupları `team_board_groups` ekip tablosu. Kişisel Space'e açmak = ayrı RPC/bildirim tasarımı + 2000
  satırlık `SpaceBoard`'un kipleri arasında bir yeniden düzenleme; arayüz testleri bu ortamda güvenilir değil, bu yüzden tek geçişte yazılmadı.
- **Space ↔ ekip dosyası köprüleri** ("Space'i ekibe taşı", "dosyayı Space olarak yayınla"): 376'daki dosya/pano ayrımı (asıl öğe ↔ yansıma,
  onay durumu, rol eşlemesi) için tasarım ve kayıp önizlemesi gerekiyor; yanlış bir dönüşüm veri bozar. Önce tasarım notu (eşleme tablosu, hangi
  öğenin `approved`/`draft` başlayacağı kararı) çıkmalı.
- `space_social_archive` tablosunun kalıcı silinmesi: kullanıcı kararı, dokunulmadı.

## Doğrulama

`tsc`, `lint` (0 hata), birim testleri, yerel PostgreSQL'de tüm migration'lar + SQL testleri. Canlıya karşı denenmedi. İngilizce: `spaces.board.export`
TR+EN eklendi.
