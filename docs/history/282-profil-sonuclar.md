# 282 — Profilde "Sonuçlar" bölümü

Kullanıcı kendi paylaştığı sonuçları toplu görmek istedi (şimdiye dek tek yol, her promptun sayfasına tek tek girmekti).

- Profilin tek bölüm menüsüne **Sonuçlar** eklendi (Alıntılar'dan sonra, sayıyla). Başkasının profilinde yalnız sonucu varsa görünür; kendi profilinde boşken de görünür (boş durum + "Promptları keşfet").
- Liste `ProfileResultsPanel`: prompt sayfasındaki `ResultCard` (yalnız görsel, 281) ile 2/3/4 sütunlu ızgara, 24'erli sayfa + otomatik "daha fazla" (`usePagedList` + `LoadMore auto`).
- Veri: `fetchResultsByCreatorPage` / `fetchProfileResultCount` (`lib/supabase/prompt-results.ts`). Prompt ile iç birleşim + `prompts.community_id is null`: topluluğa özgü içeriğin sonucu yazarın profilinde görünmez (CLAUDE.md §6 topluluk içeriği kuralı); gerisi tablonun kendi okuma kuralı (sonuç, promptu okuyabilene görünür). `prompt_id`'si boş eski sonuçlar listelenmez.
- Çeviriler: `results.profile.*` (TR + EN).

## Sınırlar
- Profil üstündeki sayılar (`profile_content_stats`) sonuçları saymıyor; menü sayısı ayrı bir `head` sayımıyla geliyor. Migration yok; çok büyük hesaplarda `prompt_results (creator_id, created_at)` bileşik dizini istenebilir.
- Kart hangi promptun sonucu olduğunu yazmıyor (özet satırında prompt başlığı yok); dokununca sonucun sayfasında "hangi promptla üretildi" bağlantısı var.
- Başkasının sonucunu da kendi profilinde görüyor olma durumu yok: yalnız yaratıcısının profilinde.
- Yalnız istemci kodu. Gerçek Supabase'e (`prompts!inner` + gömülü süzgeç davranışı dahil) / telefona karşı denenmedi.

Test: `run-result-stats` 8/8 (yeni senaryolar 3, 3b, 3c).
