# 407 — Skill: dosya gezgini (editör tek sayfa, detayda gezgin + kurulum sekmeleri)

**Neden.** Skill editörü "çok karışık" bulundu: Kolay/Gelişmiş modu, ayrı Talimat bölümü, klasör başına açılır satırlar, tam ekran dosya penceresi ve
kurulum komutlarının araç başına ayrı bölüm olması. İstenen: prompts.chat'teki gibi tek bir dosya gezgini (ağaç + dosya), editörde sekme / yan panel /
pencere YOK (pencere yalnız telefonda), detay (local) sayfasının geri kalanı (kapak bandı, eylem satırı, bölümler, yorumlar, yan sütun) olduğu gibi kalır.
Tasarım önce iki tuvalde (masaüstü/tablet/telefon) çizildi ve onaylandı; bu not koda çevrilmiş hâlidir.

## Ne değişti

**Ortak bileşenler** (`src/features/skills/`): `skill-file-tree.tsx` (klasör ağacı: önce SKILL.md, sonra `rules/references/examples/scripts/tools`, klasörler açılır/kapanır,
seçili dosyanın klasörü açık gelir, ↑/↓), `skill-file-frame.tsx` (çerçeve: `md`+ ağaç solda · dosya ortada · `lg`+ isteğe bağlı önizleme sağda; **telefonda ağaç ayrı kart
değil, aynı kartın ikinci hâlidir** — ☰ ağacı açar, dosya seçilince ya da ✕ ile dosya görünümü döner), `skill-code-view.tsx` (satır numaralı salt okunur kod).

**Detay** (`skill-detail-view.tsx` düzeni değişmedi):
- "Paket dosyaları" (`skill-files-explorer.tsx`): ağaç + görüntüleyici. Dosya listesi sürümün manifest'inden; **SKILL.md hemen** (`skillMdFor`), diğer dosyalar paketin
  ZIP'i ilk dosya açılınca imzalı adresten indirilip tarayıcıda okunur (`readSkillZip`, bir kez). Metin olmayan dosya "önizlenemez" der. Betik dosyasında uyarı;
  otomatik risk rozetleri (`data-skill-risk`) bilgilendirici olarak çerçevenin altında listelenir. Çerçevenin altında "N dosya · boyut" + ZIP indir.
- "Araca kur" (`skill-install-section.tsx`): Claude Code / Codex / Cursor ayrı bölümler değil, **tek kartta sekme** (`Tabs segmented`); her sekmede Kişisel/Proje seçimi
  (`ChoiceGroup`), tek komut, resmî belge bağlantısı. Yalnız doğrulanmış adaptörler sekme olur; uyumlu araçlarda "Diğer" varsa son sekme SKILL.md'yi kopyalatır.

**Editör** (`skill-editor.tsx`, `skill-files-workspace.tsx`):
- **Mod anahtarı kalktı.** Tek sayfa: Temel bilgiler → **Dosyalar** → bağlı içerik/Skill'ler → Ayrıntılar → Kim görsün? (→ Yayın). Paketli olmak türetilir:
  `advanced = dosya ya da yayınlanmış sürüm var` (dosya eklemek Skill'i kendiliğinden paketli yapar; dosyasız Skill eskisi gibi doğrudan yayınlanır, sürüm alanı form alanıdır).
- **Dosyalar bölümü** = tek gezgin: SKILL.md talimatın gövdesidir (`#skill-instructions` aynı kimlikle), üst bilgi satırları (ad, açıklama, lisans, sürüm) formdan ÜRETİLİR
  ve gri/kilitli gösterilir. Diğer dosyalar aynı yerde düzenlenir/kaydedilir (`saveSkillFile`), her dosyanın tamponu ayrıdır, kaydedilmemiş dosya sayısı görünür ve
  YAYINI engeller. "Yeni dosya"/"Dosya yükle" küçük bir pencere açar (klasör seç + ad/dosya); ZIP/klasör içe aktarma ve yükleme kuyruğu aynen kalır.
- **Yayın** (`skill-publish-dialog.tsx`): masaüstü ve tablette editör sayfasının "Yayın" bölümü olarak SAYFA İÇİNDE açılır (kaydırılıp odaklanır); **yalnız telefonda alt pencere**.
  İçerik/kimlikler (`data-skill-publish-dialog`, `#skill-publish-version` …) aynı.
- Silinen: `skill-package-section.tsx` (klasör başına açılır satırlar) ve `skill-file-editor.tsx` (tam ekran dosya penceresi).

## Testler
`tests/messaging-ui/run-skills-package.mjs` yeni arayüze göre yeniden yazıldı ve 3 senaryo eklendi (26 gezgin, 27 kurulum sekmeleri, 28 telefonda ☰): **28/28** (3 kez üst üste).
`run-skills-social.mjs` **38/38**. `npm test` 1196/1196, `tsc` temiz, lint 0 hata (uyarı sayısı değişmedi: 25), `npm run build` temiz.
**Gerçek Supabase/Storage/cihaza karşı DENENMEDİ** (ağ taklitli Playwright). İngilizce karşılıklar eklendi (`translations-skills-package.ts`).

## Sınırlar / sonraki
- Detayda SKILL.md içeriği çalışma kopyasından (`skillMdFor`) gelir, ZIP'teki sürümle birebir olmayabilir (önceki sınır: sayfadaki talimat çalışma kopyasıdır).
- Paket çok büyükse (≤10 MB) ilk metin olmayan/metin dosya açılışında ZIP tamamı indirilir; dosya başına ayrı okuma yok.
- Editörde dosya yeniden adlandırma/taşıma yok (sil + yeniden oluştur); klavye açıkken telefondaki düzen gerçek cihazda denenmedi.
- Metin: canlı sayfadaki "çalıştırılmaz" bilgilendirmesinin cümlesi değişmedi.
