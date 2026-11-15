# 389 — Skill: veri modeli ve paket (Aşama 1) + gelişmiş editör (Aşama 2)

Kullanıcı Skill planının sıradaki iki aşamasını birlikte istedi ("veri modeli ve paket ve gelişmiş editörü yap, sonra merge et"). Plan `docs/skill-plani.md`,
takip listesi `docs/yapilacaklar.md` → "Skill için yapılacaklar". Çekirdek dilim `388-*`'dedir; bu not onun üzerine eklenenleri anlatır.
`fflate` bağımlılığı (ZIP) planın önerisiydi; kullanıcı işi istediği için onaylı sayıldı (`package.json`: `fflate 0.8.2`, tarayıcıda dinamik yüklenir).

## Aşama 1 — veri modeli ve paket
- **Migration** `20261127100000_skill_package_model.sql` (yalnız ekleyici; tek yeniden tanımlanan nesne `orphan_storage_objects`):
  `skill_versions` (DEĞİŞMEZ sürüm: ZIP yolu + SHA-256 + `manifest`; yayından sonra yalnız `deprecated_at` değişir — tetikleyici korur; yazma yalnız
  `skill_publish_commit`), `skill_files` (çalışma kopyası; içerik Storage'da, satır yalnız sahibine görünür; yol/tür/betik bayrağı/saklama yolu CHECK'lerle sabit,
  büyük/küçük harf duyarsız benzersiz, ≤100 dosya, ≤40 MB/Skill, ≤200 MB/kişi tetikleyiciyle), `skill_tags`, `skill_relations` (Prompt/Workflow/Ayar paketi kimlik
  başvurusu; `quote_target_ok`; ≤20), `skill_uses` (istemciye KAPALI) + `record_skill_use`, `skill_pins` (kişisel sürüm sabitleme), özel `skill-files` bucket'ı +
  Storage politikaları (çalışma kopyasını yalnız sahibi okur/yazar; paketi sürüm satırını okuyabilen herkes okur, kimse istemciden yazamaz).
- **Yayın akışı = SQL + Edge**: `skill_publish_begin` / `skill_publish_commit` YALNIZ service_role (istemci çağıramaz). Edge Function `skill-package` JWT'yi doğrular,
  `begin` ile sürüm/not/günlük-10-yayın kurallarını SQL'de denetler, dosyaları indirip kayıtlı SHA-256 ile karşılaştırır, paketi YENİDEN doğrular, `SKILL.md` +
  `metadata.json` + `LICENSE` derler, ZIP'i içerik adresli yola (`{skill}/packages/{sürüm}-{sha16}.zip`) yazar, `commit` eder. Aynı `client_token` ile yeniden deneme
  ikinci sürüm açmaz. Mantığın tamamı `src/lib/skills/package-publish.ts`'tedir (bağımlılıklar enjekte → Node'da birim testli); Edge yalnız bağlar.
- **Paket kütüphanesi `src/lib/skills`**: `limits.ts`, `semver.ts`, `package-validate.ts` (zip slip, gizli/nokta dosya, uzantı listesi, ELF/PE/Mach-O imzası, iç içe
  arşiv, uzantı↔içerik, UTF-8/JSON, gizli anahtar taraması: özel anahtar + JWT ENGEL, sağlayıcı anahtarları UYARI + onay), `package-build.ts`, `package-zip.ts`,
  `zip.ts` (güvenli ZIP okuma: açmadan önce bildirilen boyutlar, oran sınırı, gerçek/bildirilen boyut uyumu), `skill-import.ts`, `markdown.ts`, `paths.ts`,
  `parseSkillMd`. Edge'e giden çekirdeğin kopyası `supabase/functions/_shared/skills/` (`node scripts/sync-function-shared.mjs`; `npm test` eskiyse kırılır).
  İstemci sınırları ile migration CHECK/tetikleyicileri aynı rakamlarda olmak zorunda: `package-limits.test.ts` migration metnini okuyup karşılaştırır.
- `scripts/smoke-test.mjs` yeni tablo/RPC'leri denetler; `deploy-functions.sh` + workflow'a `skill-package` eklendi (JWT AÇIK; `supabase/config.toml`).

## Aşama 2 — gelişmiş editör (`src/features/skills`)
- Editörde "Gelişmiş mod" anahtarı (dosya ya da yayınlanmış sürüm varsa kapatılamaz): **Paket dosyaları** (kurallar/referanslar/örnekler/betikler/araç tanımı/kök — her biri
  `FormDisclosure`), yükleme kuyruğu (ilerleme, iptal, yeniden dene, dosya başına doğrulama sebebi; `use-skill-uploads.ts`), **tam ekran düzenleyici** (masaüstünde
  dosya ağacı `role="tree"` · düzenleyici · canlı önizleme; telefonda dosya seçici + Düzenle/Önizle; dosya başına tampon, kaydedilmemiş değişiklik sorusu),
  **Bağlı içerik** (mevcut `ContentPickerDialog` + `CompactContentCard`), **ZIP içe aktarma** (alanlar dolar; yazar/sürüm/durum/görünürlük dosyadan ALINMAZ, atıf "Kaynak:"
  satırı olur; hatalı dosya raporlanıp atlanır), **sürüm yayın penceresi** (ilk yayın 1.0.0; sonrakilerde düzeltme/yeni özellik/kalıp önerisi + ZORUNLU değişiklik notu;
  uyarılar açık onay ister; hata kodları çevrilir).
- Ad yokken dosya eklenmez; ilk eklemede taslak kendiliğinden açılır (`ensureDraft`, eşzamanlı çağrılar tek taslak açar).
- Detay sayfası: sürüm varsa birincil eylem **ZIP indir** (imzalı adres, `record_skill_use`), eski sürümler de indirilir, sürüm listesi + değişiklik notu + SHA-256, paket
  dosya listesi (manifest) + betik uyarısı, bağlı içerik kartları, sahibe "kullanımdan kaldır". Talimat **güvenli Markdown görüntüleyicide** (HTML üretmez; `javascript:`
  bağlantısı çizilmez), "Ham metin" ile düz görünür.
- TR + EN (`translations-skills-package.ts`; yer tutucu `{{x}}`), veritabanı hata kodları `server-errors.ts`'te çevrilir.

## Kararlar
- **Kolay mod değişmedi**: dosyasız Skill hâlâ doğrudan `skills.status` ile yayınlanır, indirme `SKILL.md`'yi alanlardan derler. Gelişmiş modda yayın Edge Function'dan geçer.
- **Çalışma kopyası ≠ yayınlanan sürüm**: gelişmiş modda alanlar kaydedilirken durum korunur (yayınlanmış Skill taslağa düşmez); sayfadaki talimat çalışma kopyasıdır, ZIP son
  YAYINLANAN sürümdür. Sayfada "yayınlanmamış değişiklik var" göstergesi YOK (bilinen sınır).
- LICENSE dosyası SPDX kimliği + resmî metin bağlantısıdır, tam lisans metni değil (hukuk gözden geçirmesi açılış maddesinde).
- `skill_categories` tablosu YAPILMADI (tüketicisi olmayan ölü şema olurdu; `skills.category` CHECK'i kaldı).
- Etiket arayüzü yapılmadı (tablo var; paket `metadata.json` etiketleri şimdilik boş).
- Sembolik bağ: ZIP baştan kurulduğu ve girdi düz dosya baytı sayıldığı için üretilemez; ZIP öznitelikleri (`fflate` sunmuyor) okunmaz.

## Doğrulama
- `npx tsc --noEmit`, `eslint` temiz; `npm test` **1165/1165** (yeni: `semver`, `package-validate`, `package-build` [kötü ZIP fixture seti: zip slip, mutlak/ters eğik çizgi,
  gizli dosya, dosya başına boyut, sıkıştırma oranı, dosya sayısı, toplam, bozuk ZIP, yalan söyleyen başlık], `package-publish` [sahte bağımlılıklarla: bütünlük, doğrulama,
  uyarı onayı, idempotent, aşırı büyük ZIP], `package-limits` [migration aynası], `skill-import`, `markdown` [XSS], `paths`, `parseSkillMd`; `public-api-vendored`).
- Yerel PostgreSQL 16: tüm migration'lar baştan; `supabase/tests/skills-package.sql` (görünürlük, yol/tür/betik/saklama CHECK'leri, 100 dosya/40 MB/200 MB sınırları, değişmezlik,
  service-only RPC'ler, idempotent yayın, sürüm sırası 1.10.0 > 1.9.0, günlük 10 yayın, Storage politikaları, yetim taraması, CASCADE) + `skills-core`, `rls-initplan`,
  `anon-hardening`, `perf-rls` yeşil. **Tüm `supabase/tests/*.sql` paketi** (her dosya ayrı veritabanında) koşuldu: ilk koşuda `safety-hardening` #28 yeni tetikleyici fonksiyonunun
  (`skill_versions_immutable`) EXECUTE'unun kapatılmadığını yakaladı — düzeltildi, paket yeşil. (Ders: yeni içerik tablosunda yalnız kendi SQL testini değil tüm paketi koş.)
- Ağ taklitli Playwright `tests/messaging-ui/run-skills-package.mjs` (23 senaryo; masaüstü/telefon/İngilizce).
- `next build` Turbopack bu sandbox'ta Google Fonts'u çekemediği için `next build --webpack` ile temiz (CI etkilenmez).

## Denenmedi / sınırlar
- **Gerçek Supabase'e, Storage'a, Edge Function'a ve cihaza karşı DENENMEDİ.** Edge Function `skill-package` yazıldı ama bu sandbox'ta Deno yok: yalnız çekirdeği Node'da test
  edildi, `Deno.serve` bağlayıcısı çalıştırılmadı. **Edge Function CI ile deploy EDİLMEZ**: elle `Deploy Edge Functions` → `skill-package`. Deploy edilene kadar gelişmiş
  modda sürüm yayını "Paket servisi şu an kullanılamıyor" der; kolay mod etkilenmez.
- Edge'de ZIP derleme süre/bellek sınırı ve paket limitleri (10 MB ZIP, 40 MB, 100 dosya, 200 MB kota) ÖLÇÜLMEDİ — TASLAK rakamlardır.
- Gizlilik/Koşullar güncellenmedi (`skill_uses` ve Skill dosyaları; hukuk kararı, açılış maddesi). `NEXT_PUBLIC_SKILLS_ENABLED` hâlâ kapalı: menü girişi gizli, rotalar adresle açık.
- Sosyal katman (beğeni/yorum/kaydet), arama/Keşfet, bildirim, moderasyon, API/MCP, `/share/skill`, sürüm sabitleme arayüzü (`skill_pins` tablosu var) hâlâ yapılacaklar listesinde.
