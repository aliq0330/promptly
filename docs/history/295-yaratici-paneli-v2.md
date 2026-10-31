# 295 — Yaratıcı paneli v2: sonuç sayacı, prompt başına ayrıntı, kilometre taşı bildirimleri

**Durum:** uygulandı (repoda). Migration `20261101110000_creator_insights_v2.sql` canlıya UYGULANMADI (deploy hattı `main`'e birleşince uygular).
`npx tsc --noEmit`, `eslint` (yeni dosyalarda 0 hata), `npm test`, `npm run build` (sahte Supabase değişkenleriyle) temiz. Yerel PostgreSQL 16'da
`supabase/tests/creator-insights-v2.sql` **26/26** (`creator-insights.sql` 20/20 yeniden geçti). Ağ taklitli Playwright `run-insights.mjs` **21/21**.
Gerçek Supabase'e, gerçek veriyle/ölçekle ve iOS Safari'ye KARŞI DENENMEDİ. İngilizce karşılıkları eklendi (`translations-insights.ts`).
294'ün devamıdır (`294-yaratici-paneli.md`).

## Ne
- **Sonuç sayacı**: panelde altıncı kart "Sonuç" — dönemde BAŞKALARININ promptlarının altına paylaştığı sonuç sayısı (`prompt_results`), önceki döneme göre.
  Yeni RPC `creator_insights_results` (294'teki `creator_insights_summary`'nin dönüş şekli değişmedi: dönüş tipini değiştirmek `drop function` ister).
  Platformun asıl döngüsünü (prompt → kopyala → üret → sonucu paylaş) yaratıcıya ölçülebilir yapar.
- **Prompt başına ayrıntı** `/insights/local?id=` (statik export kalıbı): "En çok kopyalananlar" satırı artık buraya gider. Beş kart (Kopyalama · Sonuç · Tepki · Yorum ·
  Kaydedilme, önceki döneme göre), günlük trend (genel panelle AYNI `InsightTrendCard`), tepki dağılımı, "Promptu aç" ve geri bağlantısı. Üç RPC:
  `creator_insights_prompt` / `_prompt_daily` / `_prompt_reaction_mix`. Prompt çağıranın değilse (başkasınınki, taslak, özel, topluluğa özgü, olmayan) sunucu
  hepsinde aynı `not_found`'u verir — varlığı sızmaz; arayüz "bu prompt panelde gösterilemiyor" der (hata uyarısı değil). Geçersiz `?id=` RPC çağrılmadan aynı ekranı gösterir.
- **Kilometre taşı bildirimleri**: bir promptun kopyalama sayısı 10 · 50 · 100 · 500 · 1000 · 5000 · 10000'i, tepki sayısı 10 · 50 · 100 · 500 · 1000 · 5000'i GEÇTİĞİNDE
  yazarına tek bildirim ("Promptun "…" 100 kopyalamaya ulaştı."), tıklayınca o promptun ayrıntı sayfası. `prompts` üzerinde `AFTER UPDATE OF copy_count, like_count` tetikleyicisi
  (`_notify_creator_milestones`, SECURITY DEFINER; `when` koşuluyla yalnız artışta çalışır). Mevcut `notifications` kalıbı kullanıldı: tür `system`, actor yok, `dedupe_key`
  (`milestone:copies|reactions:<prompt>:<eşik>`) ile aynı eşik ikinci kez yazılmaz — sayaç düşüp eşiği yeniden geçse de. Yeni tür/tablo/CHECK yok.

## Kararlar
- Tek hamlede birden çok eşik geçilirse (toplu düzeltme/seed) YALNIZ en yükseği bildirilir (spam yok). Taslak, özel, topluluğa özgü ve silinmiş prompt bildirim üretmez.
- Cümle SQL'de Türkçe saklanır; `notification-message.ts` İngilizceye çevirir (başlık çevrilmez; başlığın içinde `"` olsa da sayıdan önceki SON tırnakta bölünür).
  Yeni bir bildirim cümlesi eklerken kalıbı oraya + `notifMsg.*` anahtarını eklemek kuralı (CLAUDE.md 4.5) burada da uygulandı.
- Kart etiketi "Sonuç": altı kartlı masaüstü düzeninde "Üretilen sonuç" kırpılıyordu; ne sayıldığı "Bu sayılar nasıl hesaplanır?" notunda yazar.
- Ortak yükleyici `useInsightData` (anahtar başına 3 dk önbellek, türetilmiş durum); genel panel ve ayrıntı sayfası aynı kancayı kullanır.

## Sınırlar / açık
- Kilometre taşı eşikleri elle seçildi; yazarın kendi eşiğini ayarlaması yok. Tepki eşiği `like_count`'a (tüm tepkiler) bakar; tepki geri alınıp eşik yeniden geçilirse aynı eşik tekrar bildirilmez.
- Sonuç sayacı yalnız `prompt_results` satırlarını sayar (silinen prompt/sonuç sayılmaz); sonuç beğeni/yorumları panelde yok.
- Büyük yazarda sorgu süresi hâlâ ÖLÇÜLMEDİ (294 notu geçerli). Kopyalamanın geldiği yer / araç-etiket kırılımı / haftalık özet bu turda YOK (önerilen sırada sonraki işler).
