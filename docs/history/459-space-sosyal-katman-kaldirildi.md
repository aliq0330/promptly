# 459 — Space'in sosyal katmanı kaldırıldı (Space = özel çalışma tuvali)

**Karar (kullanıcı, 2026-11-25):** Space, ekip dosyası gibi olsun; yorum, 1–5 puan, etkinlik sekmesi, alıntı/akış, herkese açık/bağlantılı
görünürlük, paylaşım, Keşfet/profil listesi ve "Sabitle" kalksın. Bu, 214 (vitrin), 215/241 (akış = alıntı) ve 242 (yorum + puan + etkinlik)
kararlarını GERİ ALIR.

## Neden

Space ile ekip dosyası aynı motoru kullanıyor (pano, öğeler, oklar, görsel, `can_read_space`/`can_edit_space`); ekip projesinin alanı Space
motorunun gizli bir satırı (`spaces.kind='team_area'`). Sosyal katman yalnız Space'te vardı ve iki tarafı ayıran tek şeydi. Kaldırınca
"Space = tek ekip dosyası modeli" olur; ileride Space ↔ ekip dosyası köprüsü (taşıma / yayınlama) basitleşir. Önceki oturumdaki analizin
özeti (kod değişikliği yoktu): ortak çekirdek var, geri kalan iki tarafa dağılmış; bu iş Space tarafındaki sosyal fazlalığı çıkarır.

## Canlıda ne vardı (2026-11-25, salt-okunur sayım)

31 Space (28'i kişisel, 3'ü ekip alanı); 18'i herkese açık, 1'i bağlantılı, 12'si özel. 2 Space yorumu (1'i puanlı), 4 Space alıntısı,
2 eski Space beğenisi, 6 toplulukta Space duyurusu, 0 paylaşım bağlantısı, 293 etkinlik satırı, 6 sabitlenmiş Space.

## Ne değişti

**Veritabanı** (`20261215100000_space_social_removal.sql`, yıkıcı: `-- ci:allow-destructive`):
1. Silinecek sosyal veri ÖNCE `space_social_archive` tablosuna JSON olarak arşivlendi (istemciye KAPALI: RLS açık, politika/yetki yok).
2. Space yorumu/puanı, alıntıları, beğenileri, topluluk duyuruları, bunların bildirimleri silindi; sayaçlar sıfırlandı; paylaşım bağlantıları silindi.
3. Tüm Space'ler `private`; `spaces_visibility_check` yalnız `private` kabul eder; `spaces_force_private` tetikleyicisi eski istemci
   "herkese açık" yazsa bile sessizce özel bırakır. `can_read_space` YALNIZ üyeliktir.
4. Yeni yorum/puan/beğeni/alıntı/duyuru reddedilir (`enforce_space_engagement`, `content_quotes_no_space`, `community_posts_no_space`:
   `space_engagement_closed`).
5. Düşen RPC'ler: `create/open/revoke_space_link`, `space_link_status`, `list_public_spaces`, `list_public_spaces_for_skill`,
   `set_space_shared`, `set_space_favorite`.

**İstemci:** Space sayfasında Yorumlar/Etkinlik sekmeleri, puan rozeti, Paylaş, Sabitle, görünürlük rozeti/seçici, alıntı sayısı/şikâyet
altbilgisi; Space listesinde "Sabitli/Herkese açık" bölümleri ve görünürlük süzgeci; `/spaces/link` rotası; Keşfet'te Spaces bölümü +
editoryal şerit; profilde Spaces sekmesi; prompt/skill detayında "Bu … şu Space'lerde" bloğu; alıntı/topluluk kartlarında Space önizlemesi;
Paylaş penceresinde Space hedefi; yorum eki olarak Space; Takip Ettiklerin'de Space etkinliği/kaynak çipi/ayarı; ortak yorum kancasında
Space kapsamı, puan ve etkinlik yorumu. Silinen dosyalar: `space-preview`, `space-showcase`, `space-discover-section`, `public-spaces`,
`space-link-page`, `activity-parts`, `tabs/comments-tab`, `tabs/activity-tab`, `components/ui/star-rating`.

**Kalanlar (bilerek):** "Space'e ekle", Space'e davet/roller (sahip · düzenleyici · görüntüleyici), workflow'un Space panosu önizlemesi
(yalnız üyelere), sohbette eski Space paylaşım kartlarını çizme, Skill ↔ Space bağı, ekip alanları.

## Ölü ama düşürülmemiş sütunlar/tablolar

`feed_page`, bildirim/moderasyon tetikleyicileri ve `following_activity_*` bu sütunları adıyla anıyor; düşürmek her yorum/beğeni yazımını
etkiler. Bu yüzden ayrı bir contract'ta, SQL testleriyle birlikte düşürülür: `spaces.rating_avg/rating_count/comment_count/quote_count/
like_count/shared_at/activity_visibility`, `prompt_comments.space_id/space_activity_id/rating`, `content_quotes.space_id`,
`prompt_likes.space_id`, `community_posts.space_id`, `space_activity.comment_count/author_note`, `space_share_links`, `space_link_grants`,
`space_user_state.favorite`. `space_activity` günlüğü yazılmaya devam eder, istemcide gösterilmez.

## Geri alma

Veri `space_social_archive`'de (`source` = `prompt_comments` | `content_quotes` | `prompt_likes` | `community_posts` | `spaces_visibility` |
`space_share_links`; `row_data` = silinen satırın JSON'u). Arşivi kalıcı silmek ayrı bir karar; Gizlilik metnine yansıtılmadı.

## Doğrulama

- `npx tsc --noEmit`, `npm run lint`, `npm test` (1540 birim testi) temiz.
- Yerel PostgreSQL 16: tüm migration'lar baştan oynar; Space ile ilgili 38 SQL testi + yeni `space-social-removal.sql` (11 kontrol).
  Veri adımı ayrıca eski şemada oluşturulan yorum/puan/alıntı/bağlantı fixture'ı üzerinde kuru koşuda denendi (arşivlendi, silindi, özelleşti).
- Canlıya karşı DENENMEDİ (sandbox `*.supabase.co`'ya erişemez; Supabase MCP salt-okunur sayım içindi).
- Playwright UI paketleri: bkz. PR açıklaması.
- İngilizce karşılıklar: yeni/değişen metinler (`spaces.members.accessPrivate`, `guestHint`, `missingBody/Guest`, `roleHelp.owner`) TR+EN; 152 ölü
  çeviri anahtarı (Space yorum/puan/etkinlik/paylaşım/bağlantı) silindi.
