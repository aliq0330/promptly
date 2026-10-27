# 257 — Takipçiler / Takip ettiklerim sayfalı (100 000 takipçi sorusu)

**Durum: uygulandı (repoda). İstemci + yalnızca ekleyici bir migration (`20260929100000_follows_list_indexes.sql`: iki bileşik dizin, `drop` yok). Ağ taklitli Playwright'ta sınandı; migration yerel PostgreSQL'de ve canlıda DENENMEDİ — `main`'e birleşince `deploy.yml` uygular. Migration yoksa sayfalar yine çalışır (yalnız büyük hesaplarda daha yavaş).**

## Soru ve bulgu
"Bir kişinin 100 000 takipçisi olsa `/followers` kasmaz mı?" — Kasardı, üstelik yanlış sonuç verirdi: `fetchFollowerProfiles` sıralamasız ve sayfasızdı; PostgREST ilk **1000** satırı döndürüyor, ekran hepsini birden çiziyordu (100 000'in 99 000'i hiç görünmezdi). `/following` ayrıca takip edilen kimliklerin tamamını `in(...)` ile prompt sorgusuna yolluyordu (1000 kimlik ≈ 37 KB URL → sınırı aşıp boş dönebilir).
Koruma testi bunu kaçırmıştı: `if (limit) query.limit(limit)` "sınırlı" sayılıyordu.

## Ne yapıldı
- `fetchFollowerProfilesPage` / `fetchFollowedProfilesPage` (`profiles.ts`): 50'şerli, en yeni takip önce (`created_at desc`, kişi id'si ikinci anahtar), **toplam sayılmaz** (100 000 satırı saymak için gerekçe yok; sayı profildeki `follower_count`). `/followers` ve `/following` `usePagedList` + `PagedListState` + `LoadMore` (kendiliğinden devam). Engellenenler sayfa başına süzülür.
- `/following` "Son paylaşımlar": takip edilenlerin kimliklerini istemci göndermiyor; `feed_page` `following` kapsamı (sunucu seçer, keyset, kendiliğinden sayfa). `fetchPromptsByAuthors` ölü kod olarak kaldırıldı.
- Migration: `follows (following_id, created_at desc, follower_id)` ve `follows (follower_id, created_at desc, following_id)` — sayfa başına tüm takipçileri sıralamak yerine dizinden okunur.
- Koruma testi sıkılaştı: `limit?: number` parametreli (yalnız çağıran isterse sınırlayan) fonksiyon artık "sınırlı" sayılmaz; seçici/pencere çağıranları için izin listesine gerekçeyle yazıldı (`fetchFollowedProfiles`, `fetchFollowerProfiles`).

## Bilinçli sınırlar
- Offset sayfalama: 100 000. kişiye kadar kaydırmak derin offset ister (nadir; keyset gerekirse ayrı iş). Yeni takipçi gelirken kayma olabilir (tekrar satırı `usePagedList` anahtarıyla elenir).
- `/followers` başkasının profilinde yok (yalnız kendi listesi); `follower_count` sayısı değişmedi.

## Doğrulama
`run-pagination` 16/16 (16: 130 takipçi → 50'şerli istek [0, 50, 100], sıralama `created_at.desc,follower_id.asc`, sınırsız istek yok; `/following` aynı + `feed_page` `following` çağrısı), `npm test` 477/477, tsc/eslint/build, `apply-migrations --check` temiz. Gerçek Supabase'e / 100 000 satırlık veriyle denenmedi. İngilizce: yeni metin yok.
