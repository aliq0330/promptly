# 410 — Skill: ☰ formu göndermesin, Dosyalar sekmesi hep var, sekme gövdelerinde ayrı başlık yok

**Neden.** İki ekran görüntüsünden (iPhone) çıkan dört sorun; 409'dan sonraki `main` üzerinde yeniden doğrulandı.

## 1. Editörde ☰ → Skill sayfasına atıyordu (kök neden)
`IconButton` `type` vermiyordu; HTML'de `<button>` varsayılanı `submit`. Dosya gezgini editörün `<form>`'u içindedir, bu yüzden ☰ (ağaç aç), ✕ (ağaç kapat),
Yeni dosya, Yükle ve Sil düğmeleri formu GÖNDERİYOR; `saveSkill` çalışıp `router.push(skillHref)` ile detaya atıyordu (başlık/kategori doluysa; eksikse sadece hata çıkıyordu).
**Düzeltme:** `components/ui/icon-button.tsx` varsayılan `type="button"` (çağrıda ezilebilir). Sitedeki 13 `IconButton` kullanımının hepsi `onClick` taşıyor, gönderen yok.
Test: `run-skills-package` 21b — formun `submit` olayı sayılır; düzeltme olmadan 2 gönderimle KIRMIZI, düzeltmeyle yeşil (doğrulandı).

## 2. Yalnız SKILL.md varsa dosya ağacı yoktu
`SkillFilesSection` manifest boşsa `null` dönüyordu (manifest SKILL.md'yi içermez, ağaca koddan eklenir) ve detay yalnız `latest` sürüm varken çiziyordu; sekme de `fileCount > 0` şartına bağlıydı.
**Düzeltme:** **Dosyalar sekmesi her Skill'de var**, sayı SKILL.md'yi de sayar; `SkillFilesSection` `version: SkillVersion | null` alır (sürüm yoksa ağaç yalnız çalışma kopyasındaki SKILL.md, ZIP düğmesi yerine "SKILL.md indir",
alt satırda "Henüz paketlenmiş sürüm yok" notu). ZIP yalnız sürüm varsa indirilir (`usePackageContents(packagePath | null)`).

## 3. "Talimat"/"Dosyalar"/"Sürümler" başlığı sekme adının tekrarıydı
Sekme çubuğu her Skill'de çıktığı için (Talimat + Dosyalar her zaman) sekme gövdelerindeki `DetailSection` başlığı kaldırıldı; bölümler `<section aria-label>` olarak kalır (`#skill-text`, `#skill-files`, `#skill-versions`),
yani ekran okuyucu etiketini korur. Talimat'ın ayrı SKILL.md kod bloğu 409'da zaten tek bloğa (`SkillTextBlock`, Ham metin | Biçimli) birleşmişti; bu iş yalnız başlığı kaldırır.
Çeviri: `skill.detail.noPackageYet` (TR+EN eklendi, sözlük üretildi).

## 4. "Bağlı gönderi varken sayfa sağa taşıyor" — YENİDEN ÜRETİLEMEDİ
Dört türden (Prompt/İstek/Workflow/Ayar paketi) çok uzun, boşluksuz başlıklı bağlı içerikle 390 px'te hem detayda (`run-skills-social` 9b) hem editörde (`run-skills-package` 21c) taşma YOK.
İki test koruma olarak eklendi (taşan ilk 6 öğeyi mesajda listeler). Kullanıcının gerçek iPhone/Safari ekranında görülen taşma ağ taklitli Chromium'da tekrarlanmadı; gerçek veriyle (görselli kapak, farklı tür)
oluşursa test mesajı taşan öğeyi gösterir. **Bilinen sınır.**

## Testler
Birim 1198/1198; `run-skills-package` 32/32 (yeni 14b, 21b, 21c), `run-skills-social` 41/41 (yeni 9b), `run-detail-pages` 47/47; tsc/eslint (0 hata)/build temiz. Gerçek Supabase/cihaz DENENMEDİ.
(`run-comment-extras` 2 numaralı senaryo bu ortamda GIPHY anahtarı `test` verdiğim için düşer — beklenen `test-key`; değişiklikle ilgisiz.)
