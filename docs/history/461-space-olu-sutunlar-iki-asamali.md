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

## C — kişisel Space'e konumlu yorum, çizim araçları ve ekip dosyası köprüsü

Önceki turda "ekip tablolarına bağlı" diye bırakılanlar yapıldı.

**Konumlu yorum (`20261219100000_space_personal_pin_comments.sql`):** `pin_comment_create/update/set_resolved/delete` kişisel Space'te de çalışır. `_pin_comment_require`
kişisel Space'te `can_read_space` ister (üye = yorum yazar, görüntüleyici dahil); okuma politikası `can_read_space`; yazma yine YALNIZ RPC. Çözme: yazan + sahip/düzenleyici;
silme: yazan + sahip. Bildirim ekip bildirimi değil Space üyesine doğrudan `notifications` satırıdır (`_space_member_notify`, @bahsetme · yanıt · öğe sahibi; bağlantı
`/spaces/local?id=…&tab=board&comment=`). Arayüz: `SpaceBoard` ekip kipinin yorum paneli/işaretleri/yorum aracını kişisel Space'te de kullanır (`canDraw`/`usePinComments`
artık `teamMode`'a bağlı değil); eski araç çubuğuna "Çiz" menüsü + "Yorumlar" düğmesi (sayaçlı) eklendi, telefonda "⋯" menüsüne. Rol eşlemesi: sahip → lider (silebilir),
düzenleyici → düzenleyici (çözebilir), görüntüleyici → yorum yazar. Kişisel Space tek panodur: yorum panelinde "Bu pano / Tüm panolar" seçici çizilmez (`hideScope`).
Çizim öğeleri (`frame/text/shape`) veritabanında zaten Space'e özgü değildi (`space_items` CHECK + tetikleyici kişisel Space'i engellemiyor) — yalnız istemci kısıtı kalktı.

**Köprü (`20261219110000_space_copy_items.sql`, `space_copy_items(p_from, p_to, p_ids, p_media)`):** öğeleri bir alandan başka bir alana KOPYALAR; kaynak kişisel Space,
ekip dosyasının/panosunun alanı ya da ikisi birden hedef olabilir. **SECURITY INVOKER**: kaynağı çağıranın RLS'i okur (taslak/gizli öğe zaten görünmez), hedefe yazma
çağıranın RLS'i + öğe tetikleyicileridir (ekip alanında onay durumunu çağıranın rolü belirler) — işlev istemcinin tek tek yapabileceğinden fazlasını yapmaz.
Görsel dosyaları hedef klasöre İSTEMCİDE kopyalanır (`lib/supabase/space-copy.ts`: indir → `uploadSpaceImage` → `p_media`), kopyalanamayan görsel atlanır ve sayılır.
Arayüz: `CopyItemsDialog` (yeni Space · var olan Space · ekip → proje → dosya) — Space ⋮ menüsü ("Başka yere kopyala"), pano seçim çubuğu ("Seçilenleri kopyala"),
ekip dosyası bilgisi ("Space'e kopyala"). Kayıp listesi pencerede baştan, sonuçta sayılarla gösterilir.

**KOPYALANMAYANLAR (eşleme/kayıp listesi):** gizli notlar · yorumlar · onay durumları (hedefte yeniden belirlenir) · ekip değişkenleri · ekibe özgü içerik (`team_file_id`) ve
topluluk içeriği (hedefte kullanılamaz → "kullanılamıyor" sayılır) · ekip dosyasının ASIL alanına çizim nesneleri (yalnız panoya aittir) · hedefte zaten var olan tekil
öğeler. Gruplar adlarıyla, oklar iki ucu da kopyalandıysa kopyalanır; paletler hedefe yeni palet olarak yazılır. Bir çağrıda en çok 200 öğe.

**Bilerek YAPILMADI — pano grupları:** `team_board_groups` ekip dosyasının BİRDEN ÇOK panosunu gruplar; kişisel Space tek bir panodur, "grup" kavramı oraya uymaz
(Space'in kendi öğe grupları zaten var). Çoklu pano kişisel Space'e eklenirse ayrı bir ürün kararıdır.

Testler: `space-personal-pins.sql` (14), `space-copy-items.sql` (12), ağ taklitli `run-space-personal-canvas.mjs` (5).
