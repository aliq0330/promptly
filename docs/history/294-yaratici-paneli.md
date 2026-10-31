# 294 — Yaratıcı paneli (`/insights`): kendi promptlarının son N gündeki performansı

**Durum:** uygulandı (repoda). `npx tsc --noEmit`, `eslint` (yeni dosyalarda 0 hata; depoda önceden var olan uyarılar duruyor), `npm test` (599/599, yeni `insights.test.ts` 11),
`npm run build` (sahte Supabase değişkenleriyle) temiz. Yerel PostgreSQL 16'da `supabase/tests/creator-insights.sql` **20/20** (`FAILED=0`), migration denetimi temiz.
Ağ taklitli Playwright: yeni `run-insights.mjs` **12/12**. **Migration canlıya UYGULANMADI** (`20261101100000_creator_insights.sql`; Deploy hattı uygular).
Gerçek Supabase'e, gerçek veriyle/ölçekle (3000 prompt × 90 gün `explain`), iOS Safari'ye ve gerçek cihaza KARŞI DENENMEDİ. İngilizce karşılıkları eklendi (`translations-insights.ts`).

## Ne
- **Sayfa** `/insights` (giriş şart, `RequireAuth` düzeni): sade başlık + tek **dönem menüsü** (Son 7/30/90 gün, `SectionMenu`), beş kart (Kopyalama · Tepki · Yorum ·
  Kaydedilme · Yeni takipçi; önceki döneme göre ▲/▼/●), günlük trend grafiği (kopyalama + tepki, zirve gün balonlu), "En çok kopyalananlar" (ilk 5), "Tepki dağılımı"
  (statik tepki posteri + çubuk), "Bu sayılar nasıl hesaplanır?" notu. Boş durum: hiç etkileşim yokken tek `EmptyState` (Prompt oluştur). Hata: "Tekrar dene" — hata
  ASLA 0'a çevrilmez. Girişler: kenar çubuğu "Kütüphanem" grubu + hesap menüsü.
- **Veri**: `creator_insights_summary / _daily / _top / _reaction_mix` (hepsi SECURITY DEFINER). `prompt_copy_events` istemciye kapalı olduğu ve başkalarının özel
  koleksiyonlarındaki kaydetmeler çağıranın RLS'inden görünmediği için INVOKER olamaz; güvenlik kuralı: kimlik `auth.uid()`, kapsam `prompts.author_id = auth.uid()`
  (başkasının kimliği parametre değildir), yalnız toplu sayı döner, anon kapalı, iç yardımcı (`_creator_insights_window`) istemciye kapalı.
- **İstemci**: `lib/insights.ts` (saf: `trendOf`, `niceMax`, `linePoints`, `peakIndex`, `reactionRows` …, birim testli), `lib/supabase/insights.ts` (tek `Promise.all`),
  `features/insights/*` (hook: dönem başına 3 dk modül önbelleği; grafik: ek bağımlılık yok, satır içi SVG, gerçek piksel genişliğiyle — telefonda yazılar küçülmez).

## Kararlar
- **Kapsam**: yayında + herkese açık + silinmemiş + `community_id is null` promptlar. İstek/Workflow/Hazır ayar v2 (kopyalama sinyali yalnız promptta var).
- **"Kopyalama" ≠ "kopyalayan kişi"**: `prompt_copy_events` (prompt, kullanıcı, gün) başına bir satırdır; aynı kişi iki promptu kopyalarsa 2 sayılır → etiket "Kopyalama".
  Misafir ve yazarın kendisi sayılmaz.
- **Önceki dönem 0 iken yüzde yok**: "● Yeni" (0'dan 40'a "%∞" yanıltıcıdır). %0'a yuvarlanan değişim "— Değişmedi".
- **Günler UTC** (`prompt_copy_events.day` zaten UTC); dönem = bugün dahil son N gün, önceki dönem = hemen öncesi aynı uzunlukta pencere. Türkiye'de gün sınırı 3 saat kayar (kabul).
- **Tepki/yorum/kaydetme/takip zamanı = ilk eklendikleri `created_at`**: geri alınan geçmişten düşer, tepki değişimi zamanı oynatmaz. Kaydetme = kişi başına prompt başına
  dönemdeki ilk koleksiyona koyma (iki koleksiyon tek sayılır). Yazarın kendi yorumu ve silinmiş (`deleted_at`) yorum sayılmaz.
- Üst sınırlar: dönem ≤ 90 gün, liste ≤ 20.

## Sınırlar / açık
- Büyük yazarda (binlerce prompt × 90 gün) sorgu süresi ÖLÇÜLMEDİ. Yavaşsa önce `explain`; çare önceden toplanmış günlük özet tablosu (olayla artan) olur — v2.
- Araç/etiket kırılımı, dışa aktarma, haftalık e-posta özeti, İstek/Workflow/Hazır ayar istatistikleri yok.
- Tepki dağılımı yalnız dönem içi `prompt_likes`'tan; `reaction_stats` (tüm zamanlar) kullanılmadı.
