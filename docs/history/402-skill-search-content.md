# 402 — Skill `search_content`'e girdi

**Durum:** uygulandı (kodlandı; yerel PostgreSQL + ağ taklitli testle sınandı; gerçek Supabase/cihaz DENENMEDİ). Migration `20261201170000_skill_in_search_content.sql` (yalnız işlev gövdesi yeniden yazılır: imza/dönüş/yetki aynı, eski 14 argümanlı sarmalayıcı değişmez, veri değişmez). 392'de "Skill `search_content`'e girmez" kararı bununla TERSİNE çevrildi.

- **`search_content` `p_kind='skill'`:** yayında + herkese açık Skill; başlık/özet/talimat ve etiket adı aranır (`ilike`, joker karakterler harfiyen); yazar, etiket (hepsi), yazar-hariç süzgeçleri, sıralama (alaka/yeni/eski/popüler) ve aynı keyset üçlüsü. İçerik türü/kategori/alt kategori/araç süzgeci verilmişse Skill girmez (Skill'in kategorisi ve uyumlu araçları prompt taksonomisinden ayrı kataloglardır — `feed_page` ile aynı kural).
- **İstemci:** `SearchKind` beşinci tür olarak `skill`'i kabul eder; genel aramanın "Skill'ler" grubu (`SearchSkills`) artık `skill_feed_page` yerine `searchContentIds('skill', …)` + kimlik sırasıyla `fetchSkillsByIds` kullanır — diğer türlerle AYNI motor. Gönderi grupları `PostSearchKind` (skill hariç) ile çalışmaya devam eder.
- **Değişmeyenler:** Keşfet → Skill'ler bölümü ve Ana Sayfa çipi `skill_feed_page`'i kullanmaya devam eder (uzmanlık alanı/araç/paket süzgeçleri ve `match_source` oradadır). Açık API/MCP `search_skills` ayrıdır.
- Testler: SQL `skills-search` (14 kontrol); ağ taklitli `run-skills-social` 34/34 (senaryo 25 `search_content`'e çevrildi).
