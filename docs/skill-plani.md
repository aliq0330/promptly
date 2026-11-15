# Skill / Beceri — Uygulama Planı (5. içerik türü)

Bu dosya Skill'in **tam planıdır** (ürün, mimari, güvenlik, teslim sırası). Yapılacakların takibi `docs/yapilacaklar.md` →
"Skill için yapılacaklar" bölümündedir; çekirdek dilimin anlatısı `docs/history/388-skill-cekirdegi.md`'dedir.
Plan, repodaki mevcut desenlerden (Workflow / Hazır ayar tablo aileleri, `*_versions`, özel Storage bucket'ları, açık API çekirdeği,
dışa/içe aktarma zarfı) türetildi. Rakamlar ve limitler **TASLAK**tır; ölçümle kesinleşir.

## 1. Amaç, kapsam, ilkeler

Skill, yapay zekâya bir işi, uzmanlık yaklaşımını ve çalışma yöntemini kazandıran, yeniden kullanılabilir pakettir. Prompt (bir işi nasıl
yaptırırım), İstek (çözüm arıyorum), Workflow (çok adımlı zincir), Ayar paketi (hazır parametreler) ile aynı sosyal katmanı paylaşır ama
ayrı bir türdür.

İlkeler:
- **Mevcut desene uy.** Kendi tablo ailesi + ortak etkileşim tablolarına yeni hedef sütunu + `search_content`/`feed_page` ailesine yeni tür.
- **Skill ≠ Prompt.** Ayrı tablo, sayfa, sayaç. İçinde Prompt bulunabilir (kimlikle bağlanır, kopyalanmaz).
- **Dosyalar Postgres'te durmaz.** Özel Storage bucket'ı (`skill-files`), indirme imzalı adresle, yetki Skill'in görünürlüğüne bağlı.
- **Yayınlanmış sürüm değişmez.** Her yayın yeni sürüm; eski sürüm indirilebilir ve sabitlenebilir.
- **Sunucuda hiçbir şey çalıştırılmaz.** Betik, komut, araç tanımı yalnızca veridir.
- **Karar sunucudadır.** Doğrulama, yetki, sayaç, hız sınırı SQL ve Edge Function'dadır; istemci tek koruma değildir.
- **Geriye uyumlu geçiş** (expand → contract): migration yalnız ekler (CLAUDE.md §8.11).
- **TR + EN, tek tasarım sistemi.**

İlk sürümde YAPILMAYACAKLAR: MCP/başka yolla otomatik çalıştırma, ücretli dağıtım, ajan yürütme motoru, gerçek zamanlı ortak düzenleme,
topluluğa/ekibe özgü Skill (öneri; karar bekliyor).

## 2. Paket formatı

Skill paketi `SKILL.md` + dosyalar + metadata'dan oluşan düz bir klasördür; veritabanı onun aranabilir, sürümlü indeksidir.

```
<slug>/
  SKILL.md              zorunlu; frontmatter + talimat gövdesi
  rules/                isteğe bağlı (.md)
  references/           isteğe bağlı (.md .pdf .txt .json)
  examples/             isteğe bağlı (.md)
  scripts/              isteğe bağlı; betikler işaretlenir, ÇALIŞTIRILMAZ
  tools/manifest.json   isteğe bağlı; araç tanımı (yalnız veri)
  metadata.json         Promptly üretir
```

SKILL.md frontmatter (TASLAK; hedef araç belgesiyle doğrulanacak): `name` (küçük harf, rakam, tire; ≤ 64), `description` (≤ 1024),
`license` (SPDX), `metadata.version` / `author` / `source` (otomatik atıf).

Sürüm: `MAJOR.MINOR.PATCH`; ilk yayın `1.0.0`; `1.0.0` sonrası değişiklik notu zorunlu; ZIP yayında bir kez derlenir, `sha256` yazılır,
bucket'ta yalnız okunur; eski sürüm silinmez, "kullanımdan kaldırıldı" işaretlenir. Aranabilir metin (talimat, açıklama, etiket)
veritabanındadır; `SKILL.md` ve ZIP bunlardan derlenir (tek kaynak). Kolay modda yalnız talimat vardır.

Kimlik: sayfalar `id` ile (`/skills/local?id=`); `slug` yalnız klasör/`name` için, yazar başına benzersiz.
Lisans: MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, özel (tüm hakları saklı).

## 3. Veritabanı

| Tablo | Görevi | Durum |
| --- | --- | --- |
| `skills` | Ana kayıt, talimat, sayaçlar (korumalı) | **Çekirdekte yapıldı** (`20261126100000_skills_core.sql`) |
| `skill_versions` | Değişmez sürüm (`version`, `changelog`, `package_path`, `package_sha256`, `manifest jsonb`) | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_files` | Dosya kayıtları (`path`, `kind`, `size`, `sha256`, `storage_path`, `is_script`) | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_tags` | Etiket bağları (`tags` + sayaç tetikleyicisi kalıbı) | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_relations` | Prompt/Workflow/Ayar paketi bağları (kimlik başvurusu, `quote_target_ok`) | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_uses` | Kişi-Skill-gün kullanım kaydı (`prompt_copy_events` kalıbı; istemciye kapalı) | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_pins` | Kişisel sürüm sabitleme | **Yapıldı** (`20261127100000`, `389-*`) |
| `skill_categories` | Uzmanlık taksonomisi (şimdilik `skills.category` CHECK; tablo ileride) | Yapılacak (karar) |

Ortak tablolara `skill_id` dalları: `prompt_likes`, `prompt_comments` (+ `target_id` birleşimi, `handle_prompt_like_change` /
`handle_prompt_comment_change` / `handle_comment_delete` / `notify_comment_*` / `content_engagers` zincirlerinde AÇIK dal),
`collection_items`, `reaction_stats`, `content_relations`, `reports`, bildirim türü/tercihi. Yeni bir "tam biri dolu" CHECK yeniden
kurulumu yıkıcıdır (`-- ci:allow-destructive` + kullanıcı onayı).

Storage: özel `skill-files`, yol `{skill_id}/{version_id|draft}/{uuid}.{uzantı}`; ZIP `{skill_id}/packages/{version}.zip`;
`orphan_storage_objects` bucket listesine eklenir (aksi hâlde süpürücü dosyaları siler).

Sertleştirme: `can_read_skill`, `*_hide_blocked` (`(select auth.uid())`), anon yazamaz, tetikleyici fonksiyonlardan `EXECUTE` kapalı,
`char_length` CHECK'leri, `enforce_can_post` / `enforce_can_edit` / `enforce_rate_limit`, `protect_counter_columns`.

## 4. Güvenlik

| Tehdit | Önlem | Katman |
| --- | --- | --- |
| Zip slip (`../`, mutlak yol, `\`, NUL) | Yol normalleştirme; kaçan/tekrarlayan yol reddi | İstemci + sunucu |
| Zip bombası | Toplam/dosya başına açılmış boyut, oran limiti, iç içe arşiv yasağı, akış açma | Sunucu |
| Sembolik bağ, özel dosya | Red | Sunucu |
| Yürütülebilir ikili | ELF/PE/Mach-O imzası ve `.exe .dll .so` red | Sunucu |
| Betik | `.sh .py .js .ps1 .bat` işaretlenir; sayfada "çalıştırmadan önce incele" | Sunucu + arayüz |
| Uzantı/içerik uyumsuzluğu | Magic byte; metin dosyası geçerli UTF-8; JSON ayrıştırılabilir | Sunucu |
| Sızan gizli anahtar | Kalıp taraması; özel anahtar/JWT engel, diğerleri uyarı + onay | Sunucu |
| Yetkisiz indirme | Özel bucket, `can_read_skill`, kısa ömürlü imzalı adres | Sunucu |
| Yayın sonrası paket değiştirme | Yükleme yalnız taslak klasörüne; yayında ZIP + `sha256`, sürüm klasörü salt okunur | Sunucu |
| Kota/kötüye kullanım | Kişi başına toplam depolama, günlük yayın sınırı | Sunucu |
| Zararlı talimat | Sabit uyarı, şikâyet/kaldırma, API/MCP'de "veri, talimat değil", Aşama 6'da tarama | Arayüz + API |

Taslak limitler: ZIP 10 MB, açılmış 40 MB, ≤ 100 dosya, tek dosya 5 MB, yol ≤ 200 karakter ve 6 derinlik, kişi başına 200 MB, günde 10 yayın.
İzinli uzantılar: `md txt json yaml yml csv pdf png jpg webp` + işaretli betikler.

Nasıl kurulur: tek saf doğrulama modülü (`src/lib/skills/package-validate.ts`, bağımlılıksız, birim testli); istemci anlık ön kontrol, Edge
Function kesin karar için aynı modülü kullanır (kopya `sync-function-shared.mjs`). Dosya okuma/yazma ayrı Edge Function'da
(`skill-package`); `api`/`mcp`'ye service role konmaz. Hukuk: Gizlilik'e `skill_uses` ve Skill dosyaları, Koşullar'a Skill (kod, betik,
lisans) eklenir, `TERMS_VERSION` artar; hukuki danışman onayı gerekir.

## 5. Sunucu katmanı

RPC'ler: `skill_save_draft`, `skill_register_file`, `skill_set_relations`, `skill_publish_begin` / `skill_publish_commit` (idempotent,
`client_token`), `skill_set_deprecated`, `skill_delete`, `record_skill_use`, `skill_feed_page`, `skill_version_list`, `skill_file_list`,
`skill_related`, `search_content` (`p_kind='skill'`), Edge `skill-package`.

Yayın akışı: taslak dosyaları yükle ve kaydet → `skill_publish_begin` → Edge yeniden doğrular, `SKILL.md` + `metadata.json` derler,
ZIP'i yazar → `skill_publish_commit` (başarısızsa hiçbir satır kalıcı olmaz, aynı `client_token` ile yeniden denenir) → bildirim yalnız
ilk yayında ve sürümü sabitleyenlere.

Liste/arama: `feed_page` ağır ve geriye uyumlu imza kuralına bağlı; Skill ilk dilimde ayrı `skill_feed_page` RPC'si ile gelir, karma
"Tümü" akışına katılım ayrı karardır. Sana özel ve Odak ilk sürümde Skill almaz.

Açık API/MCP: `public-skills.ts` (`public-content.ts` kalıbı): `GET /v1/skills`, `/v1/skills/{id}`, `/v1/skills/{id}/package?version=`;
MCP `search_skills`, `get_skill`, `list_skill_files` (yalnız okuma).

## 6. İstemci mimarisi

- `src/app/(app)/skills/{page,local,create}`, `src/features/skills/`, `src/lib/skills/`, `src/lib/supabase/skills*.ts`.
- Yeni bağımlılıklar (karar bekliyor, öneri): ZIP için `fflate` (dinamik yükleme); kendi küçük, güvenli Markdown görüntüleyicimiz
  (HTML üretmez, `dangerouslySetInnerHTML` yok).
- Editör: `ComposeShell` içinde tek sayfa form; kolay mod (çekirdekte) + gelişmiş mod (dosya yükleme, dosya ağacı, tam ekran dosya
  düzenleme, bağlı içerik, canlı önizleme, ZIP içe aktarma). Telefonda tek sütun, masaüstünde üç bölme.
- Detay: `DetailBand` + `DetailActionBar`; birincil eylem "Skill'i indir" (`SkillInstallMenu`: ZIP, SKILL.md, Markdown, JSON, önceki
  sürümler); sekmeler Genel bakış, Dosyalar, Bağlı içerik, Sürümler, Yorumlar.
- Kart: `ContentCardPost` kabuğu (ikinci kabuk yazılmaz). Sağlayıcılar açılışta sorgu atmaz (§8.13).

## 7. Sosyal entegrasyon yüzeyleri

| Yüzey | Aşama | Not |
| --- | --- | --- |
| Beğeni/tepki, yorum, kaydet, koleksiyon, ortak koleksiyon | 3 | Kaydet değişmezi ve ortak koleksiyon kuralları korunur |
| Profil "Skill'ler" bölümü, `profile_content_stats`, İçeriklerim | 3 | `SectionMenu`'ye satır |
| Şikâyet ve moderasyon, bildirim, Yaratıcı paneli/İstatistik, Paylaş modalı | 3 | `notification-message.ts` + `nc.pref.*` + `_notification_pref_key` birlikte |
| Keşfet bölümü + süzgeç, arama, benzer Skill, İlişki Haritası | 4 | Kategori takip edilmez |
| Paylaşım sayfası `/share/skill/`, alıntı | 5 | Alıntı karar bekliyor |
| "Çalıştı mı?" oyu | 6 | `prompt_works_votes` kalıbı |
| Sana özel, Odak, Hikâye, Space öğesi, topluluk başvurusu, ekip | — | İlk sürümde YOK |

## 8. Dağıtım ve dışa aktarma

Birinci sınıf biçimler: ZIP (`LICENSE` + `metadata.json` otomatik), `SKILL.md`, Markdown (tek dosya; PDF/ikili dahil edilmez), JSON
(`promptly.skills` zarfı, `lib/exchange`). Claude Code: ZIP'in kendisi (`.claude/skills/<ad>/`) — doğrulanacak. Codex/Cursor adaptörleri
`lib/skills/adapters/<id>.ts` saf fonksiyonlardır (`verified`/`draft`); resmî belgeye karşı doğrulama + golden test + `docs/history`
kaydı olmadan kullanıcıya sunulmaz. Sürüm sabitleme: `/skills/local?id=…&v=1.1.0`, API `?version=`; kişisel sabitleme `skill_pins`.
İçe aktarma: ZIP/klasör → taslak (yazar, durum, görünürlük, sayaç dosyadan alınmaz; atıf `metadata.source` korunur).

## 9. Çok dillilik, tasarım, erişilebilirlik, performans

TR+EN (`translations-skills.ts`, `build-i18n`), hata kodları `server-errors.ts`, kategori adları `Record<slug, TranslationKey>`.
Yeni token yok; ikon `GraduationCap` (Skill) ve `BookOpen` (Eğitim). Dosya ağacı `role="tree"`, durum yalnız renkle verilmez. Liste
sorguları talimat çekmez (`summary_preview` sütunu), ZIP/Markdown görüntüleyici dinamik yüklenir, RLS'te çıplak `auth.uid()` yok.

## 10. Test stratejisi

Birim (`node --test`): `package-validate`, `skill-md`, `semver`, adaptör golden, zarf, izin aynası, `public-skills`. SQL
(`supabase/tests`): `skills-core` (yapıldı), `skills-versions`, `skills-publish`, `skills-relations`, `skills-social`, `skills-storage`,
`skills-search`, `skills-rate-limit`; `anon-hardening` ve `rls-initplan` yeni tabloları kapsar. Ağ taklitli Playwright
(`tests/messaging-ui/run-skills-*.mjs`). Kötü ZIP fixture seti. `scripts/smoke-test.mjs` `CHECKS`. Performans: `EXPLAIN`, 5–7 tekrar
medyan. Gerçek Supabase/Storage/cihaz denenemez: raporda "denenmedi" yazılır; elle kontrol listesi tutulur.

## 11. Aşamalı teslim (17 dilim)

| Dilim | Aşama | Kapsam | Önkoşul |
| --- | --- | --- | --- |
| 1.1 | 1 | `skills`, `skill_categories`, `skill_tags`, RLS, `can_read_skill`, sayaç koruması | — |
| 1.2 | 1 | `skill_versions`, `skill_files`, `skill_relations`, `skill_uses`, `skill_pins`, `skill-files` bucket, `orphan_storage_objects` | 1.1 |
| 1.3 | 1 | `lib/skills` (`package-validate`, `skill-md`, `semver`, `zip`) + kötü ZIP fixture'ları | — |
| 1.4 | 1 | `skill_publish_begin/commit`, Edge `skill-package`, `smoke-test` | 1.2, 1.3 |
| 2.1 | 2 | Veri erişimi, `SkillEditor` kolay mod, taslak, talimat | 1.1 |
| 2.2 | 2 | Gelişmiş mod: dosya yükleme, dosya ağacı, tam ekran dosya düzenleme, bağlı içerik | 1.4, 2.1 |
| 2.3 | 2 | Canlı önizleme, yayın akışı, ZIP içe aktarma | 2.2 |
| 3.1 | 3 | Ortak tablolara `skill_id` dalları; CHECK yeniden kurulumu (`-- ci:allow-destructive`) | 1.1 |
| 3.2 | 3 | Beğeni, yorum, kaydet, koleksiyon arayüzü; profil bölümü; İstatistik | 3.1, 2.3 |
| 3.3 | 3 | Bildirimler, moderasyon, Yaratıcı paneli | 3.2 |
| 4.1 | 4 | `skill_feed_page`, `search_content` `skill`, liste ve Keşfet bölümü | 3.1 |
| 4.2 | 4 | Filtre sayfası, arama kaynağı, `related_skills`, İlişki Haritası | 4.1 |
| 5.1 | 5 | İndirme menüsü, sürüm sabitleme, `record_skill_use`, `/share/skill/` | 4.2 |
| 5.2 | 5 | Dışa aktarma biçimleri, adaptör altyapısı, Claude Code adımları | 5.1 |
| 5.3 | 5 | Açık API, MCP araçları, `public-skills`, Edge deploy, `promptly-mcp` sürümü | 5.1 |
| 5.4 | 5 | Açılış: menü bayrağı, Gizlilik ve Koşullar, çeviri gözden geçirme | 5.2, 5.3 |
| 6.x | 6 | Çalıştı mı oyu, kalite göstergeleri, güvenlik taraması, Skill paketlerini bağlama | 5.4 |

**Yapıldı:** çekirdek (`388-*`) + dilim 1.2, 1.3, 1.4 (Edge deploy elle) + 2.1, 2.2, 2.3 (`389-*`). Kalan: 3.x, 4.x, 5.x, 6.x.

**Çekirdek dilim (yapıldı)**, yukarıdakilerin yalnız temel kısmını kapsar: 1.1'in `skills` tablosu, 1.3'ün `skill-md` + kategori yardımcıları,
2.1'in kolay mod editörü, 4.1'in basit listesi ve basit detay sayfası ile menü girişi (bayrak arkasında). Ayrıntı: `docs/history/388-skill-cekirdegi.md`.

Yayın ve geri alma: migration CI'da otomatik; Edge Function'lar elle deploy; Skill menü girişleri `NEXT_PUBLIC_SKILLS_ENABLED` arkasında;
geri alma = bayrağı kapat, Edge'i önceki sürüme döndür (migration'lar ekleyici, geri alınmaz).

## 12. Riskler ve karar bekleyen konular

Riskler: entegrasyon yüzeyi büyük (Ayar paketi 230 dosyada geçiyor); ortak tabloların CHECK yeniden kurulumu (yıkıcı, tek başına dilim 3.1);
Edge'de ZIP açma süre/bellek sınırı (ölçülmedi, 1.4'te ilk iş); depolama maliyeti ve kötüye kullanım; zararlı talimat/betik dağıtımı
(hukuki sorumluluk); araç biçimleri değişebilir; talimat araması dizin maliyeti; gerçek ortamda denenmeyenler.

| Konu | Seçenekler | Öneri |
| --- | --- | --- |
| Skill girişlerini gizleme | Derleme bayrağı / DB bayrağı | Derleme bayrağı (`NEXT_PUBLIC_SKILLS_ENABLED`) — çekirdekte uygulandı |
| ZIP kütüphanesi | `fflate` / kendi yazım | `fflate`, dinamik yükleme |
| Uzmanlık taksonomisi | Sabit liste / DB tablosu | DB tablosu, 8 kayıt (şimdilik CHECK) |
| Lisans | Zorunlu / isteğe bağlı | Zorunlu seçim, önerilen MIT (çekirdekte varsayılan MIT) |
| Alıntılama | Açık / kapalı | Aşama 5'te açık |
| Topluluk ve ekip Skill'i | İlk sürümde var / yok | Yok |
| Karma akışa katılma | İlk sürümde / Aşama 4 sonunda | Önce ayrı bölüm |
| Paket limitleri | Taslak rakamlar / ölçüm | Taslakla başla, 1.4 ölçümüyle kesinleştir |
| Hukuk ve gizlilik | Onay öncesi / sonrası yayın | Açılıştan önce (5.4'ün şartı) |
| Skill ikonu | `GraduationCap` / başka | `GraduationCap`, Eğitim kategorisi `BookOpen` |
