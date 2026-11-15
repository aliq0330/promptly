# 394 — Skill alıntılama

**Durum:** uygulandı (kodlandı, ağ taklitli + yerel PostgreSQL ile sınandı; gerçek Supabase/cihaz DENENMEDİ).

Skill, `content_quotes`'un altıncı hedefidir (Prompt · İstek · Workflow · Ayar paketi · Space · **Skill**). Alıntı Skill'in kopyası değil başvurusudur;
kendi beğeni/yorum/istatistik/bildirimi alıntıya aittir ve alıntılanan Skill'in sayaçlarına karışmaz (217'nin kuralı). Yazma yolu hâlâ TEK
`create_quote` RPC'sidir.

## Karar
- Yalnız **yayında + herkese açık** Skill alıntılanır (`_quote_content_info`); başkasının taslak/özel Skill'i `content_not_found` (varlık sızmaz), sahibin kendi taslağı `content_not_public`. Aynı Skill 24 saatte bir kez, günde ≤ 30 alıntı.
- **Topluluğa duyurulmaz**: `community_posts` Skill'i kabul etmez; Paylaş → Alıntıla penceresinde Skill için topluluk seçici gizlidir, yalnız akış.
- `feed_page`'e dokunulmadı: alıntı satırı `content_quotes`'tan zaten gelir (içerik türünden bağımsız), kart `quote_feed_cards` + `fetchSkillsByIds` ile kurulur.
- Skill silinince alıntılar CASCADE gider; Skill gizlenince alıntı RLS ile görünmez, geri açılınca geri gelir.

## Migration `20261201100000_skill_quotes.sql` (`-- ci:allow-destructive`)
`content_quotes.target_id` üretilmiş sütunu yeni hedefi kapsayacak biçimde yeniden kurulur (PostgreSQL üretilmiş ifadeyi değiştirmeye izin vermez);
bağlı okuma politikası + dizin aynı işlemde yeniden yazılır, üç CHECK kısıtı yeni hedefi kapsar. Veri silinmez. Ayrıca: `skills.quote_count`
(korumalı sayaç), `handle_quote_count_change`, `_quote_content_info`, `_quote_target_title`, `create_quote`, `search_quotes` Skill koluyla yenilendi.

## İstemci
`Quote.contentType: QuoteContentType` (+ `skill`), `Quote.skill`, `fetchSkillsByIds`; `QuoteCard` Skill özetini gösterir; alıntı sayfası Skill kartı + "Orijinal içeriği aç";
`share-catalog` `/share/quote/` başlığı `skills(title)` embed'ini de okur.

## Testler
SQL `supabase/tests/skills-quotes.sql` (21 kontrol); ağ taklitli `run-skills-social` senaryo 18–19 (24/24); birim `share-catalog`.
