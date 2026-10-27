# 259 — `/tags` sayfası geç açılıyordu: `trending_tags` yeniden yazıldı

**Durum: uygulandı (repoda). Migration `20260929140000_trending_tags_fast.sql` (yalnızca `create or replace`, aynı imza, `drop` yok) — `main`'e birleşince `deploy.yml` uygular. Yerel PostgreSQL'de eski tanımla birebir eşitliği sınandı (`trending-tags.sql`); yeni sorgu canlıda salt-okunur `EXPLAIN ANALYZE` ile ölçüldü, işlev canlıda DEĞİŞTİRİLMEDİ.**

## Soru
"/tags geç açılıyor, etiketleri saymaya uğraştığı için mi?"

## Bulgu (canlı, salt-okunur `EXPLAIN ANALYZE`)
- Etiket **sayıları** sorun değil: kullanım sayıları `tags.usage_count` sütunlarında önceden tutuluyor; tüm kataloğu (1 545 etiket) sıralı okumak **3 ms**.
- Yavaş olan **"Yükselen etiketler"**: `trending_tags()` **~371 ms**, **~350 000 sayfa okuması**. Her etiket için dört CTE'yi (son/önceki dönem × prompt/istek) bir skaler alt sorguyla baştan tarıyordu (etiket sayısı × 4 tarama).
  Sayfa üç isteği `Promise.all` ile bekleyip hepsi bitince gösterdiği için en yavaşı (bu) sayfayı geciktiriyordu; etiket ve prompt arttıkça kötüleşirdi.

## Ne yapıldı
`trending_tags` aynı sonucu tek geçişte verir: her kaynak (prompt, istek) yalnızca son iki dönemdeki bağlarını okuyup `filter` ile "son / önceki" diye böler, kaynaklar birleşir, etiketle eşlenir.
Canlıda aynı sorgu: **~35 ms, ~5 300 sayfa** (≈10× hızlı, ≈65× az okuma). Kalan maliyet son 14 gündeki prompt sayısıyla orantılı (toplu yüklemeden sonra 3 060).
Davranış aynı: aynı imza/dönüş (`bigint`), aynı sıralama, yalnız `recent_count > 0`.

## Doğrulama
`supabase/tests/trending-tags.sql`: 400 etiket, 3 000 prompt (bir kısmı taslak), 300 istek (bir kısmı taslak), rastgele etiket bağları; eski tanım (`_trending_tags_old`) ile yeni sürüm aynı satırlar/aynı sırada (12/7, 50/3, 400/10, 5/1), taslak sayılmaz, dönüş tipi `bigint`.
İngilizce: yeni metin yok. Gerçek Supabase'e uygulanmadı; sayfa süresi gerçek tarayıcıda ölçülmedi.

## Bilinçli sınırlar
`/tags` yine tüm kataloğu istemciye alır (arama + 3 sıralama istemcide; 1 545 etiket ≈ iki ardışık istek). Katalog 10 000'lere çıkarsa Keşfet → Etiketler gibi sunucu sayfalama + sunucu araması gerekir (ayrı iş).
