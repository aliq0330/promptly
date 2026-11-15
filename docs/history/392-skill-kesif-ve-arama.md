# 392 — Skill: keşif ve arama (Aşama 4)

PR B (3 PR'lık işin ikincisi). Plan `docs/skill-plani.md`, liste `docs/yapilacaklar.md`.

## Karar: ayrı RPC'ler, `feed_page` / `search_content` imzalarına DOKUNULMADI
Plan "`feed_page` imzasına DOKUNMA" diyordu; `search_content`'e `p_kind='skill'` eklemek 14 argümanlı iki aşırı yüklü büyük fonksiyonu yeniden yazmak demekti. Skill'in
kendi taksonomisi (uzmanlık alanı, uyumlu araç, lisans, paketli mi) zaten başka bir süzgeç kümesi olduğundan Skill keşfi ve araması TEK ayrı RPC'dir: `skill_feed_page`.
Karma "Tümü" akışına ve Ana Sayfa tür çipine Skill GİRMEZ (ayrı karar; `feed_page` yeniden yazımı gerektirir).

## Veritabanı — `20261130100000_skill_discovery.sql` (yalnız ekleyici)
- `skill_feed_page` (SECURITY INVOKER, STABLE; `anon` + `authenticated`): keyset `(sort_rank, created_at, id)`; yalnız yayında + herkese açık; engelleme `skills` RLS'inden gelir.
  Süzgeçler: uzmanlık alanı, uyumlu araç (herhangi biri), lisans, paketli mi (`skill_versions` var mı), yazar, etiketler (HEPSİ). Sıralama: `new` · `oldest` · `popular`
  (beğeni) · `most_used` (kullanım) · `recommended` (`use*2 + save*3 + like*2 + comment`; kişiselleştirilmemiş). Metin araması başlık/açıklama/talimat/etiket/araç üzerinde,
  LIKE joker karakterleri kaçırılır; **`match_source`** eşleşmenin NEREDE bulunduğunu söyler (title › summary › tag › tool › instructions).
- `related_skills(p_skill, p_limit)`: aynı uzmanlık alanı (+3), ortak etiket (+2/etiket), ortak araç (+2/araç), aynı yazar (+1); yalnız gerçek sinyal, sinyalsiz Skill dönmez.
- `skills_for_content(p_type, p_id)`: ters yön — bir prompt/workflow/ayar paketine bağlı yayınlanmış Skill'ler.
- İndeksler: başlık/açıklama için kısmi `pg_trgm` GIN (`extensions.gin_trgm_ops`), `skill_tags(tag_slug, skill_id)`. **Talimat `ilike`'ı dizinsizdir** (60 000 karaktere kadar metin);
  canlı hacimde `EXPLAIN` 5–7 tekrar medyanıyla ölçülmeden "hızlı" denmez (Skill sayısı bugün çok küçük).
- SQL testi `supabase/tests/skills-discovery.sql` (18 kontrol): varsayılan sıra, her sıralama, rank formülü, `match_source`, joker karakter, her süzgeç, etiketlerde VE, keyset sayfalama
  (tekrarsız), engelleme, benzer Skill (kendisi/taslak/özel dönmez), ters yön.

## İstemci
- `lib/supabase/skill-discovery.ts`: `fetchSkillFeedPage` (RPC → kimlik sırası → tek `in id` sorgusuyla kartlar, engelli yazarlar elenir), `searchSkillsPage` (`/skills` aramasının
  ContentListPage sözleşmesi artık bu RPC; eski `ilike` + `created_at` imleci kalktı), `fetchRelatedSkills`, `fetchSkillsForContent`.
- **Keşfet → "Skill'ler" bölümü** (`SkillDiscoverSection`, `NEXT_PUBLIC_SKILLS_ENABLED` arkasında menü girişi): arama kutusu (300 ms), uzmanlık alanı / araç / "İndirilebilir paket"
  çipleri, sıralama çipleri, kartın altında eşleşme kaynağı notu, `LoadMore` ile keyset devam.
- Skill detayında yan sütunda **"Benzer Skill'ler"**; prompt / workflow / ayar paketi detayında **"Bu içerik şu Skill'lerde"** (bayrak kapalıyken çizilmez).

## Test
SQL `skills-discovery` + etkilenenler yerel PostgreSQL'de; birim; ağ taklitli `run-skills-social` 16/16 (yeni: Keşfet bölümü süzgeç/arama/sıralama RPC parametreleri, eşleşme notu, benzer Skill).
**Gerçek Supabase / cihaz DENENMEDİ.**

## Bilinçli sınırlar
Ana Sayfa tür çipi ve karma "Tümü" akışı yok; İlişki Haritası'na (`/relations`) Skill eklenmedi; kapak görseli yok; arama dizini talimat için ölçülmedi;
`search_content`'e `skill` türü eklenmedi (site geneli arama kutusu Skill'i aramaz — Skill araması Keşfet → Skill'ler ve `/skills` içindedir).
