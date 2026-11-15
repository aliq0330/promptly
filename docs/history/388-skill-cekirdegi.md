# 388 — Skill / Beceri: 5. içerik türü, çekirdek dilim

Kullanıcı Skill'i (yapay zekâya bir işi ve çalışma yöntemini kazandıran paket) 5. içerik türü olarak istedi. Önce mockup ve tam plan
çıkarıldı (`docs/skill-plani.md`); kullanıcı "ana çekirdeği şablon olarak yaz, gelişmiş özellikleri ve diğer bağlantıları yapılacaklar
listesine ekle, ben peyderpey tamamlarım" dedi. Bu not yalnız **çekirdek dilimi** anlatır; kalan her şey `docs/yapilacaklar.md` →
"Skill için yapılacaklar" bölümündedir.

## Ne yapıldı
- **Veritabanı** (`20261126100000_skills_core.sql`, yalnız ekleyici): `skills` tablosu — `author_id`, `slug` (yazar içinde benzersiz), `title`,
  `summary`, `instructions` (Markdown, ≤ 60 000), `category` (8 uzmanlık alanı, CHECK), `compat` (claude-code · codex · cursor · other),
  `license`, `version` (MAJOR.MINOR.PATCH), `status`, `visibility`, korumalı sayaçlar (`use/like/comment/save_count`, bu dilimde yazılmaz).
  RLS: yayınlanmış + herkese açık herkese (anon dahil), taslak/"sadece ben" yalnız sahibine, yazma yalnız sahibine; engelleme iki yönlü
  (`skills_hide_blocked`, `(select auth.uid())` kalıbı); anon yazamaz; `protect_counter_columns`, `enforce_can_post`, `enforce_can_edit`,
  `enforce_rate_limit('skill', 20, 3600)`.
- **Kütüphane** (`src/lib/skills`): `skill-md.ts` (`renderSkillMd`, `slugifySkillName`, `withSlugSuffix`, sürüm/slug doğrulama — saf, bağımlılıksız),
  `categories.ts` (uzmanlık alanı/araç/lisans listeleri; **migration CHECK'iyle aynası birim testte karşılaştırılır**), `flag.ts`.
- **Veri erişimi** (`src/lib/supabase/skills.ts`): `fetchRecentSkills` (keyset), `searchSkillsPage` (başlık/açıklama/talimat `ilike`),
  `fetchSkillById`, `saveSkill` (yeni Skill'de `slug` addan türer, çakışırsa `-2`, `-3`…; düzenlemede `slug` değişmez), `deleteSkill`.
  Liste sorguları talimat metnini çekmez.
- **Arayüz** (`src/features/skills`, `src/app/(app)/skills`): `/skills` (liste, `ContentListPage`), `/skills/local?id=` (detay, Albüm düzeni, birincil eylem
  **SKILL.md indir** — tarayıcıda yerel Blob, sahibe Düzenle/Sil), `/skills/create` (`?edit=`, kolay mod: ad, kısa açıklama, uzmanlık alanı, talimat,
  araçlar, lisans, sürüm, "Kim görsün?"; taslak + yayın; `ComposeShell` + `PublishPanel` `hideDestination`). Kart `ContentCardPost` kabuğunu kullanır.
- **Oluştur menüsü:** Skill karosu, **`NEXT_PUBLIC_SKILLS_ENABLED=true` derleme değişkeni arkasında** (yarım özellik canlıya sızmasın). Rotalar adresle
  her zaman açılır. Karo sayısı 4 olunca ızgara 2×2 / `sm`+ 4 sütundur.
- **TR + EN:** `translations-skills.ts` (`skill.*`, `skills.category.*`, `createMenu.skill`, `compose.newSkill`); sözlük `build-i18n` ile üretildi.

## Kararlar
- Skill, Hazır ayar'ın tablosuna eklenmedi: **ayrı tablo ailesi** (kullanıcı kararı); Hazır ayar'ın 230 dosyalık yüzeyine dokunulmadı.
- Uzmanlık alanı DB'de `text` + CHECK (tablo yok); `skill_categories` tablosu yapılacaklar listesinde (expand → contract).
- `SKILL.md` ayrı saklanmaz: alanlardan **derlenir** (aranabilir metin DB'de); değişmez paket/sürüm sonraki dilimdir.
- `slug` düzenlemede değişmez (klasör adı kararlı kalsın).
- Lisans varsayılanı MIT (planda "zorunlu seçim, önerilen MIT").

## Doğrulama
- `npx tsc --noEmit` temiz; `npm run lint` 0 hata (kalan 23 uyarı önceden vardı, tests/ altında); `npm test` 1096/1096 (yeni: `src/lib/skills/skill-md.test.ts` 10 test).
- `next build` (sahte `NEXT_PUBLIC_SUPABASE_*` + `NEXT_PUBLIC_SKILLS_ENABLED=true` ile) temiz; `/skills`, `/skills/create`, `/skills/local` üretildi.
  Bu sandbox'ta `.env.local` yok: değişkenler verilmezse `next build` kök sayfada zaten düşer (Skill'le ilgisiz).
- Yerel PostgreSQL 16: tüm migration'lar baştan oynatıldı; `supabase/tests/skills-core.sql` (görünürlük, yazma yetkisi, sayaç koruması, 9 CHECK/benzersizlik,
  engelleme, anon, hız sınırı 20/21, CASCADE) + `rls-initplan.sql` + `anon-hardening.sql`.

## Denenmedi / sınırlar
- Gerçek Supabase'e, gerçek Storage'a ve fiziksel cihaza karşı **denenmedi**. Skill için ağ taklitli Playwright paketi **yok** (yapılacaklar listesinde);
  arayüz yalnız tip, lint ve derleme ile doğrulandı — **tarayıcıda gözle kontrol edilmedi**.
- Migration canlıya deploy hattıyla uygulanır (`schema_migrations`'a bak); bu oturumda canlıya uygulanmadı.
- Beğeni/yorum/kaydet/İstatistik/Paylaş, dosya/ZIP, sürüm geçmişi, arama RPC'si, Keşfet bölümü, profil bölümü, bildirim, moderasyon, API/MCP: hepsi
  `docs/yapilacaklar.md` → "Skill için yapılacaklar". Taslaklar listede görünmez (yalnız detay adresinden açılır).
