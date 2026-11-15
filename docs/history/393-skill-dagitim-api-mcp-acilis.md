# 393 — Skill: dağıtım, açık API + MCP, paylaşım sayfası, açılış hazırlığı, "Çalıştı mı?" (Aşama 5 + açılış + Aşama 6'nın ilk dilimi)

PR C (3 PR'lık işin sonuncusu). Plan `docs/skill-plani.md`, liste `docs/yapilacaklar.md`.

## Dağıtım (Aşama 5)
- **Statik paylaşım sayfası** `/share/skill/<id>/`: `ShareKind` + `share-link.ts` (rota/regex/yol eşlemesi) + `share-catalog.ts` kaynağı (`skills`, yalnız yayında + herkese açık); ShareModal Skill bağlantısı artık bu sayfadır
  (kendi başlığı/açıklaması, `og:*`). Taslak/özel Skill'in başlığı hiçbir meta etikete girmez. Birim testler `share-link.test.ts`.
- **İndirme menüsü** (detay): birincil ZIP/SKILL.md düğmesine ek menü — SKILL.md indir · kopyala · özet (JSON) indir. **Sürüm sabitleme** (`skill_pins`, kişi başına Skill başına tek satır; sürüm satırında "Sabitle"/"Sabitlemeyi kaldır";
  yazar kendi Skill'ini sabitlemez); yeni sürüm çıkınca sabitleyene bildirim `391-*`'dadır.
- **Kurulum adaptörleri** `lib/skills/adapters` (saf veri; `verified` / `draft`): **Claude Code `verified`** (https://code.claude.com/docs/en/skills okundu: kişisel `~/.claude/skills/<ad>/SKILL.md`, proje `.claude/skills/<ad>/SKILL.md`; ZIP kökünde `SKILL.md` durur, ad klasörüne açılır).
  **Codex ve Cursor `draft`: resmî belgeyle doğrulanmadığı için hiçbir yerde gösterilmez** (adım üretmezler). Kabuk komutu yalnız güvenli ad (`^[a-z0-9]+(-[a-z0-9]+)*$`) ve dosya adından üretilir; aksi hâlde komut ÜRETİLMEZ. Promptly komutu çalıştırmaz, yalnız kopyalatır.
- **Açık API + MCP** (`lib/public-api/public-skills.ts`, aynı ilkeler: yalnız anon anahtar, yalnız yayında + herkese açık, anon RLS): `GET /v1/skills` (q, category, compat, license, has_package, tag, sort, keyset), `GET /v1/skills/{id}` (SKILL.md gövdesi + son sürüm + dosya listesi + bağlı içerik bağlantıları),
  `GET /v1/skills/{id}/files?version=`. MCP araçları `search_skills`, `get_skill`, `list_skill_files` (salt-okunur; yanıt "güvenilmeyen veri" notuyla sarılır). Dosya GÖVDELERİ dönmez; betik olarak işaretli dosyalar `script: true`. Arama `skill_feed_page` (392).
  OpenAPI, endpoint dizini, `/developers` metni + örnek, `promptly-mcp` **0.3.0** (`mcp/package.json`, Edge `mcp` sürümü), Edge kopyaları `sync-function-shared.mjs`; birim testler `public-skills.test.ts` (7), MCP testleri güncellendi (9 araç).

## Açılış hazırlığı
- **Gizlilik Politikası** "Skill'ler" bölümü (ne saklanır, `skill_uses` kimseye gösterilmez, bildirimler, dosyalar çalıştırılmaz) + **Kullanım Koşulları** "Skill'ler" bölümü (hak sahipliği/lisans, gizli anahtar yok, zararlı kod yasağı, betikleri okuma sorumluluğu) +
  "Otomatik erişim" maddesine Skill. **`TERMS_VERSION` / `TERMS_EFFECTIVE_AT` 2026-11-15'e çıktı: oturum açmış herkese "Koşullar güncellendi" bandı bir kez çıkar.** **Hukuki danışmandan geçmedi**; metin bir ürün taslağıdır.
- **Bayrak**: `deploy.yml` derlemesine `NEXT_PUBLIC_SKILLS_ENABLED: ${{ vars.NEXT_PUBLIC_SKILLS_ENABLED }}` bağlandı. **Bayrak AÇILMADI**: GitHub → Settings → Variables'a `NEXT_PUBLIC_SKILLS_ENABLED=true` yazıp yeniden dağıtınca menü girişleri (Oluştur, Keşfet → Skill'ler, profil, İçeriklerim, "Bu içerik şu Skill'lerde") görünür.
  Bayrak açılmadan da `/skills*` adresleri çalışır.

## "Çalıştı mı?" oyu (Aşama 6'nın ilk dilimi) — `20261130110000_skill_works.sql` (yalnız ekleyici)
`prompt_works_votes` kalıbı: `skill_works_votes` (istemciye KAPALI), `skill_works_stats` (SECURITY DEFINER tetikleyici, istemci yazamaz), `set_skill_works` (oy için **Skill'i indirmiş/kullanmış olmak** şart: `skill_uses` — prompttaki "kopyalamış olmalı"nın karşılığı; yazar oy veremez; engel iki yönlü; saatte 30; yalnız yayında + herkese açık) ve `skill_works_state`.
Arayüz `SkillWorksVote` (eşikler/iyimser güncelleme prompttakiyle aynı `lib/prompt-works.ts`; "Kanıtlanmış" = ≥10 oy + Wilson alt sınırı ≥0.7). SQL testi `skills-works.sql` (19 kontrol).

## Test
`skills-works` + `skills-discovery` + etkilenen SQL testleri yerel PostgreSQL'de; birim 1176; MCP 36; ağ taklitli `run-skills-social` 22/22 (yeni: sürüm sabitleme, indirme menüsü, oy), `run-skills-package` 23/23.
**Gerçek Supabase / Realtime / cihaz DENENMEDİ; Edge Function `api` ve `mcp` ile `skill-package` canlıya ELLE deploy edilmeli** (yeni uçlar/araçlar deploy edilene kadar canlıda yok); `promptly-mcp` 0.3.0 npm'e "Publish MCP package" ile elle yayınlanır.

## YAPILMADI (bilinçli)
- **`promptly.skills` dışa/içe aktarma zarfı**: `content-format.ts`/`import_content` kind başına dallanıyor; Skill zarfı + `import_skills` RPC'si + modal bağlantısı ayrı bir dilimdir.
- **Codex / Cursor kurulum adımları**: resmî belge bulunamadı/okunmadı → `draft`, sunulmuyor.
- **Skill alıntılama** (`create_quote`): `content_quotes` CHECK'i + `skills.quote_count` + akış kartı gerektirir; karar bekliyor.
- **Aşama 6'nın kalanı**: kalite göstergeleri, otomatik güvenlik taraması (yayında yalnız gizli anahtar taraması var), paketleri birbirine bağlama, kullanım değerlendirmesi (araç + sürüm etiketli yorum); oy sonrası yorum daveti.
- Mesajla paylaşım/hikâye, İlişki Haritası, Ana Sayfa tür çipi (`391-*`/`392-*`).
