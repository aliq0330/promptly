# 409 — Skill local sayfası prompt düzeninde + 4 gerçek açık kaynak Skill

**Neden.** 408'deki karşılaştırmada Skill sayfası prompt sayfasından çok daha uzun ve yoğun çıktı (9-10 bölüm üst üste, büyük İndir düğmesi eylem satırında).
İstenen: Skill sayfası prompt sayfası gibi olsun, İndir blok içinde. Önce yan yana mockup çizildi ve onaylandı; bu not koda çevrilmiş hâlidir.

## Sayfa düzeni (`skill-detail-view.tsx`)
- **Bant:** kapak varsa bulanık arka plan + renk (prompt'taki `backdrop`), kapak yoksa varsayılan mavi bant; isimlerin altında "N kez kullanıldı" (`useCount`, prompt'la aynı çeviri anahtarları).
- **Eylem satırı:** büyük birincil İndir düğmesi KALKTI; yalnız Beğeni · Yorum · Kaydet + İstatistik · Paylaş (prompt gibi).
- **Ana sütun:** özet + tek satırlık "Promptly çalıştırmaz" notu (eski bilgi bandı değil) → **sekmeler Talimat · Dosyalar (n) · Sürümler (n)** (prompt'taki Prompt · Geçmiş · DNA gibi; tek sekme varsa çizilmez; Sürümler sahibine hep görünür).
  - **Talimat sekmesi:** `SkillTextBlock` = prompt metni bloğunun karşılığı: SKILL.md monospace blokta (varsayılan "Ham metin", "Biçimli" gövdeyi güvenli Markdown çizer), altında bilgi satırı
    (araçlar · sürüm · lisans · dosya sayısı/boyut). Bloğun ALTINDA eylem satırı: **bölünmüş İndir ▾** (ZIP ya da SKILL.md; menüde SKILL.md indir · özet JSON · Promptly dosyası) + **SKILL.md'yi kopyala**.
    Altında "Araca kur" kartı (Claude Code/Codex/Cursor sekmeleri) ve "Çalıştı mı?".
  - **Dosyalar / Sürümler sekmeleri:** 407'deki paket dosyaları gezgini ve sürüm listesi, davranış aynı.
- **Yan sütun:** Hakkında kartı ("Skill bilgisi" kartı içine katıldı: sürüm · lisans · güncelleme; alıntı sayısı eklendi — `skills.quote_count` artık seçiliyor), **Kalite**, **Birlikte kullanılan Skill'ler**,
  **Birlikte kullanılan içerik**, Benzer Skill'ler, **"Bu Skill şu Space'lerde"** (yeni). Kalite/Linked/Related bileşenleri `aside` kipi kazandı (`AsideSection`).
- Sayfa sonundaki ayrı SKILL.md bloğu ve ana sütundaki Kalite/İlgili bölümleri kalktı.

## Veritabanı
- Migration `20261203100000_list_public_spaces_for_skill.sql` (yalnız ekleyici): `list_public_spaces`'in Skill karşılığı, INVOKER, anon+authenticated; yalnız herkese açık + arşivsiz Space.
  Mevcut `list_public_spaces` aşırı yüklenmedi (eski çağıranlar etkilenmez). İstemci `listPublicSpaces({ skillId })`, `usePublicSpaces({ skillId })`, `SkillSpacesAside`.

## Açık kaynak Skill'ler (aliq hesabında yayınlandı, 2026-11-16)
Dört gerçek Skill, kaynak depodan BAYT BAYT aynı (md5 doğrulandı), yalnız özet Türkçe + "Kaynak:" satırı eklendi, SKILL.md gövdesi değiştirilmedi:
`frontend-design` (Anthropic, Apache-2.0), `verification-before-completion`, `receiving-code-review`, `finishing-a-development-branch` (obra/superpowers, Jesse Vincent, MIT).
Veritabanına doğrudan eklendi (kolay mod: dosyasız, `status='published'`; paket/ZIP yok) — bu dört Skill'in yan dosyaları (örn. `root-cause-tracing.md`) bilerek alınmadı, yalnızca kendi içinde tam olanlar seçildi.
Lisans ve atıf: özetteki "Kaynak:" satırı + `license` alanı; bu Skill'ler Promptly'nin değil özgün yazarlarının eseridir.

## Testler
Birim 1198; ağ taklitli: run-skills-social 40/40 (yeni 35), run-skills-package 29/29 (sekmeler için güncellendi), run-detail-pages, run-community-posts, run-comment-extras yeşil;
yerel PostgreSQL `skills-space` (yeni 6-7: RPC) + `skill-surfaces` + `skills-core` FAILED=0. **Gerçek Supabase/cihaz DENENMEDİ** (RPC canlıda yok: deploy hattı uygular).

## Sınırlar
- Kategori çipi bağlantı değil (Skill için kategori konu sayfası yok); mockup'taki "Araca kur" düğmesi yerine kart doğrudan görünür.
- `skill.aboutTitle` ("Skill bilgisi") çeviri anahtarı artık kullanılmıyor.
