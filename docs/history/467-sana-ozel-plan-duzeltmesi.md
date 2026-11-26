# 467 — "Sana özel" yavaşlığı: işlevin planı her çağrıda gerçek değerlerle

## Ne oldu

466 ile `for_you_page` ikiye bölündü: kişinin sinyalleri çağıranın yetkisiyle hesaplanıyor, ağır sıralama RLS'siz `_for_you_rank`'te yapılıyor. Yerel veritabanında 2 kat hızlıydı ve sonuçları birebir aynıydı.

Canlıya çıkınca ölçüldü. Sonuçlar yine birebir aynıydı, ama sıralama çok yavaşlamıştı:

| Hesap | 466 öncesi | 466 sonrası |
|---|---|---|
| aliq (62 beğenilen etiket), ılık çağrı | ~105 ms | ~430 ms |
| 225 beğenili demo hesap (51 etiket) | ölçülmedi | **6 164 ms** |

`authenticated` için zaman aşımı 8 sn olduğundan, ikinci satır "Akış yüklenemedi" hatasının yeniden kaynağı olabilirdi.

## Neden

`_for_you_rank` SQL dilinde yazılmıştı. SQL dilindeki bir işlev, dizi parametrelerini (beğenilen etiketler `p_lt_slugs`…) planlarken değerlerini görmez; genel (generic) plan kurar.

- `unnest(p_lt_slugs)` 10 satır sanılır.
- Etiket özeti `pt` ~150 satır tahmin edilir; gerçekte ~2 400 satırdır.
- Bu yanlış tahminle planlayıcı ~3 400 adayın her biri için özeti baştan tarayan bir iç içe döngü seçer. Özet tek başına 7 ms sürer; döngüyle yüzlerce ms, çok beğenisi olan hesapta saniyeler olur.

Ölçümle ayrıldı (canlı, aliq):

| Parça | Süre |
|---|---|
| Sinyal hesabı | 7–10 ms |
| Sinyalsiz sıralama | 40 ms |
| 62 etiketle sıralama | 433 ms |
| Etiket özeti tek başına | 7 ms |

Yerelde test verisi küçük olduğu için yanlış plan maliyetli değildi; sorun ancak canlı veride görüldü.

## Düzeltme

`20261222100000_for_you_rank_custom_plan.sql`:

- `_for_you_rank` PL/pgSQL'e çevrildi; gövde AYNEN kaldı, tek fark `return query`.
- `set plan_cache_mode = force_custom_plan` eklendi: her çağrıda parametrelerin gerçek değerleriyle plan kurulur. SQL dilindeki işlev de zaten her çağrıda plan kuruyordu, ek maliyet yok.
- `#variable_conflict use_column`: dönüş sütun adları (`kind`, `id`…) sorgudaki aynı adlı sütunlarla çakışmasın diye.
- İmza, yetkiler ve `for_you_page` değişmedi.

İkinci bir yol da denendi ve elendi: etiket sinyallerini aday başına index'ten okuyan `lateral` sorgu. Plan tahmininden bağımsızdı ama daha yavaştı (225 beğenili hesapta 174 ms; seçilen yolla 78 ms).

## Doğrulama

**Canlı** — aynı işlem içinde, geçici işlevle, sonunda geri alındı:

| Hesap | 466 öncesi | 466 sonrası | 467 |
|---|---|---|---|
| aliq | ~105 ms | ~430 ms | **~34 ms** |
| 225 beğenili hesap | — | 6 164 ms | **~78 ms** |

Her ikisinde de sonuç özeti eskisiyle aynıdır.

**Yerel:**
- Rastgele veride eski `for_you_page` (20261208100000) ile yeni zincir karşılaştırıldı: 600 sayfa, 14 996 satır, fark 0.
- `supabase/tests/for-you-fast.sql` 11/11. Yeni 11. madde işlevin PL/pgSQL + `force_custom_plan` olduğunu denetler; SQL diline geri dönülürse kırmızı olur.

## Kural (CLAUDE.md §13e)

Dizi/küme parametresi bir birleştirmenin boyunu belirliyorsa, ağır bir okuma işlevi SQL dilinde yazılmaz. Bu durumda PL/pgSQL + `force_custom_plan` kullanılır, ya da parametre birleştirmeye girmez. Yerel küçük veride hızlı olmak yetmez; canlıda `begin … rollback` içinde ölçülür.
