# 461 — Space'in ölü sütunları: iki aşamalı (expand → contract) temizlik

459/460'ta bilerek bırakılan ölü sütunlar kapatıldı. Kural (CLAUDE.md §8.11): önce istemci + fonksiyonlar bu sütunlara bakmayı bırakır (A), sonra sütunlar düşer (B).

## A — `20261217100000_space_dead_refs_cleanup.sql` (genişlet; yıkıcı değil)

Ortak (yorum/beğeni/alıntı/topluluk/bildirim/akış) fonksiyonları Space'e ait sütunlara bakmaz: `comment_follow_on_insert`, `content_engagers`, `create_quote`,
`enforce_like_rules`, `feed_page` (Space adayı kalktı), `following_activity_page/summary` (Space etkinliği kalktı), `handle_comment_delete`,
`handle_prompt_comment_change`, `handle_prompt_like_change`, `handle_quote_count_change`, `moderate_report`, `my_comment_subscriptions`,
`notify_comment_like/mentions/reply`, `notify_community_post_like`, `search_quotes`, `set_comment_subscription`, `share_to_community`,
`sync_like_notification_reaction`. `create_quote` / `share_to_community` artık `space` türünü `invalid_content` ile reddeder.
Bulunan hata düzeltildi: `comment_follow_on_insert` 'request' yorum bildirimine yanlış `/spaces/local` bağlantısı veriyordu (artık `/requests/local`).
İstemci: `communities.ts` `space_id` seçmez, `likes.ts`/`content-statistics.ts` türlerinden `space` çıktı, `following-activity.ts` Space olay türü/sayacı yok.

## B — `20261218100000_space_dead_columns_drop.sql` (contract; yıkıcı)

Düşenler: `prompt_comments.space_id/space_activity_id/rating`, `prompt_likes.space_id`, `content_quotes.space_id`, `community_posts.space_id`,
`comment_subscriptions.space_id`, `spaces.like_count/comment_count/quote_count/shared_at`, `space_user_state.favorite`,
`follow_feed_settings.show_space_activity`, `space_activity` tablosu (+ `_space_log`), Space'e ait tetikleyici/fonksiyonlar. Üretilmiş `target_id` /
`target_kind` sütunları, "tam biri dolu" CHECK'leri ve bağlı politikalar Space'siz yeniden kuruldu. `list_spaces` dönüşünden `is_favorite` çıktı.
Veri: Space yorum/beğeni/alıntı satırları zaten 459'da `space_social_archive`'a arşivlenip silinmişti.

**Bilerek KALDI:** `spaces.visibility` (hep `private`, CHECK + tetikleyici; `create_space.p_visibility` eski istemci imzası için durur) ve
`space_social_archive` (silinen sosyal verinin arşivi; kalıcı silme bir ürün/hukuk kararıdır, otomatik yapılmaz).
