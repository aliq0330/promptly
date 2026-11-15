# 390 — Skill: sosyal katman, dilim 1 (Aşama 3 — beğeni/tepki, yorum, bildirim, İstatistik, şikâyet, profil)

Kullanıcı Skill planının üçüncü aşamasını istedi ("Aşama 3'ü yap ve merge et"). Plan `docs/skill-plani.md`, takip listesi `docs/yapilacaklar.md` → "Skill için
yapılacaklar". Bu dilim aşamanın **yarısını** kapsar; kapsam dışı kalanlar en altta açıkça yazılı.

## Kural: Skill, ortak etkileşim tablolarının DOKUZUNCU hedefidir
`prompt_likes.skill_id` ve `prompt_comments.skill_id` (178'deki `community_post_id`, 215'teki `space_id`, 217'deki `quote_id` ile aynı kalıp). Ayrı Skill beğeni/yorum
tablosu YOKTUR; sosyal katman diğer içeriklerle aynı tablo, aynı tetikleyici, aynı arayüzdür.

## Veritabanı — `20261128100000_skill_social.sql`
- **Yıkıcı işaretin sebebi** (`-- ci:allow-destructive`, veri silinmez): `prompt_likes.target_id` ÜRETİLMİŞ bir sütundur (`coalesce` ifadesi PG16'da değiştirilemez) →
  sütun düşürülüp yeniden eklenir (değer satırdan türer; iki dizin + `reaction_stats` okuma politikası da yeniden kurulur); üç CHECK (`prompt_likes_exactly_one_target`,
  `prompt_comments_exactly_one_target`, `reports_target_type_check`) yeni hedefi kapsayacak biçimde yeniden kurulur.
  Planda "CHECK yeniden kurulumu yıkıcıdır, onay ister" yazılıydı; kullanıcı planı bilerek Aşama 3'ü istedi — bu varsayım rapora da yazıldı.
- **Hedef zinciri AÇIK dallıdır** (son `else` sessizce başka tabloya düşmesin): `handle_prompt_like_change` (`skills.like_count`), `handle_prompt_comment_change`
  (`skills.comment_count`), `handle_comment_delete` (yanıtlı yorum yumuşak silinir; Skill silinirken CASCADE'de koruma devre dışı), `enforce_like_rules` (kendi Skill'ini
  beğenemez, `self_like_not_allowed`), `enforce_skill_engagement` (yeni; okuyamayan/engelli/taslak-özel Skill'e `skill_not_found`, yanıt aynı Skill'in yorumuna olmalı
  `invalid_parent`), `_engager_content_visible`, `notify_comment_reply/like/mentions` (Skill dalı + adres). `reaction_stats` tetikleyicisi DEĞİŞMEDİ: yeniden kurulan `target_id` üretilmiş sütunundan okur. Yeni bildirim tetikleyicileri `notify_skill_like` / `cleanup_skill_like_notification` / `notify_skill_comment`. `content_engagers`
  (`likes`/`comments`; `saves` boş döner), `set_comment_pinned` (yalnız Skill sahibi; hedef başına tek sabit).
- **Sayaç koruması**: `skills.like_count/comment_count` istemciden yazılamaz (`protect_counter_columns`), güncelleyen tetikleyiciler SECURITY DEFINER.
- **Şikâyet**: `_report_reasons_for('skill')` = içerik nedenleri, `submit_report('skill', …)`, `moderation_report_queue` Skill başlığı + adresi + yazarı döner,
  `moderate_report('removed')` Skill'i siler (beğeni/yorumlar CASCADE).
- **Bildirim cümleleri** (SQL Türkçe): "Skill'ini beğendi: "…"" ve "Skill'ine yorum yaptı: "…""; adres `/skills/local?id=…[&hl=comment:…]`.
  İstemci kalıpları `notification-message.ts` + `notifMsg.likedSkill/commentedSkill(None)` (TR+EN).
- **SQL testi** `supabase/tests/skills-social.sql` (51 kontrol): beğeni/tepki/sayaç/`reaction_stats`/bildirim, kendi Skill'ini beğenememe, taslak/özel Skill'in varlığının
  sızmaması, engelleme, yorum + yanıt + bahsetme + çift bildirim olmaması, sabitleme, İstatistik listeleri, şikâyet → moderasyon → silme (CASCADE), yanıtlı Skill silme,
  Hazır ayar beğeni/yorum regresyonu (yeniden kurulan `target_id`/tetikleyiciler diğer hedefleri bozmadı).

## İstemci
- `likes.ts` / `reactions.ts` / `use-like-state` (`ReactionTargetType`) "skill" kabul eder; `comments.ts` `postCommentOnSkill`, `CommentScopeKind` "skill", `use-comment-thread`
  `{ skillId }` hedefi + yorum sabitleme (`canPin`); `CommentCountLink`/`EngageCommentCount` `skillId`; `StatisticsContentType` "skill" (kaydetme sekmesi yok);
  Realtime sayaç aboneliği `skills` tablosunu da dinler.
- **Detay** (`skill-detail-view.tsx`): yalnız **yayında + herkese açık** Skill'de Beğeni (tepki seçicisi) · Yorum · İstatistik + tepki özeti + yorum bölümü; taslak/özel
  Skill'de bunlar yerine "yayınlanınca açılır" notu. Başkasının Skill'inde ⋮ menüsünde Şikâyet (`ReportButton targetType="skill"`).
- **Kart** (`SkillCard`): altbilgide Beğeni + Yorum (yalnız yayında + herkese açık).
- **Profil**: "Skill'ler" bölümü (`ProfileSkillsPanel`, 24'erli sayfa + kendiliğinden devam; ziyaretçi yalnız yayındakini, sahibi taslak/özel olanları da görür) —
  `NEXT_PUBLIC_SKILLS_ENABLED` arkasında; sayı `fetchProfileSkillCount`.
- `report-reasons.ts` + `report.type.skill` çevirisi; moderasyon kuyruğunda tür adı.

## Testler
Yerel PostgreSQL: `skills-social` + tüm SQL paketi; birim testler; ağ taklitli Playwright `run-skills-social` (9 senaryo). **Gerçek Supabase / Realtime / cihaz DENENMEDİ.**

## Kapsam dışı (bilinçli; `docs/yapilacaklar.md` → Aşama 3'te açık)
Kaydet + koleksiyon + ortak koleksiyon (`collection_items.skill_id`, `SaveableContentType`) · Yaratıcı paneli / `creator_insights_*` · Paylaş modalı ve mesajla paylaşım ·
bildirimler: yayın → takipçilere ve yeni sürüm → sabitleyenlere (`nc.pref.*`, `_notification_pref_key`/`_notification_category`) · `profile_content_stats` Skill sayısı ·
İçeriklerim'e Skill listesi (taslaklar şimdilik yalnız profildeki bölümde ve detay adresinde) · `admin_*` sayaçları · Keşfet/arama (Aşama 4).
Gizlilik/Koşullar metni güncellenmedi (hukuk kararı).
