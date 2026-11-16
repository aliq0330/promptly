# 410 — CI `database` işi: ~30 dk → ~3 dk (şablon veritabanı + ANALYZE)

**Durum:** uygulandı (yalnız `supabase/tests/run-local.sh`, iki test dosyası, `ci.yml`'e zaman sınırı). Yerel PostgreSQL 16'da 112 test dosyasının tamamı yeşil: 7 dk 54 sn → 2 dk 50 sn
(yalnız şablon) ve CI'daki ~30 dk'nın yerine hedef ~3–5 dk (CI makinesi yerelden ~1,5× yavaş; GitHub Actions'ta gerçek süre bu PR'ın kendi koşusunda görülür).

## Neden yavaştı (iki ayrı sebep)
1. **Migration'lar her test dosyası için baştan oynatılıyordu.** `289-*` ölçtüğünde 48 test × 155 migration ≈ 9 dk'ydı; şimdi 112 test × 248 migration (3,3 MB SQL):
   dosya başına ~10 sn (yerel) – ~16 sn (CI) yalnız şema kurmaya gidiyordu.
2. **İstatistik yoktu (asıl büyük kalem).** Yeni kurulan/klonlanan veritabanında hiçbir tabloya `ANALYZE` yapılmamıştır; planlayıcı kör kalır. Sonuç: `storage.objects`
   politikalı her `count(*)` 5–10 sn (`stories` 32 sn, `skills-package` 44 sn, `community-cover` 25 sn, `api-me-media` 34 sn …) ve `notification-center` testindeki 5000 satırlık tarama
   (50 × `notifications_grouped_page`) **167 sn** — aynı sorgu `ANALYZE` sonrası **1 sn**. Canlıda autovacuum bunu yapar; sorun yalnız test ortamıdır (üretim kodu değişmedi).

## Ne değişti
- `run-local.sh`: stub'lar + tüm migration'lar **bir kez** bir şablon veritabanına oynatılır, ardından `analyze` çalışır; her test `createdb -T` ile (~0,1 sn) o şablondan klonlanır
  (`pg_statistic` de kopyalanır). Şablon adı stub + migration içeriğinin SHA-1 özetini taşır (`promptly_tpl_<özet>`) → migration değişince eski şablon kullanılmaz. Yarım kalmış
  şablon kullanılmaz (geçici adla kurulur, bitince yeniden adlandırılır). `PROMPTLY_NO_TEMPLATE=1` eski "her seferinde baştan" davranışını verir.
- `notification-center.sql` ve `community-notify-scale.sql`: testin kendi toplu `INSERT`'inden sonra `analyze` (şablondaki istatistik testin eklediği veriyi bilmez).
- `ci.yml` `database` işine `timeout-minutes: 20` (takılan koşu 6 saat yanmasın).

## Kurallar
- Yeni bir SQL testi **büyük hacimde veri ekliyorsa** (yüzlerce+ satır, `generate_series`) eklemeden sonra `analyze <tablo>;` yazar; aksi hâlde test dakikalarca sürebilir.
- Test veritabanında kalıcı sunucu ayarı gerekiyorsa `run-local.sh`'taki `alter database "$DB" set …` yanına yazılır (veritabanı ayarları `createdb -T` ile KOPYALANMAZ).
- Şablon yalnız aynı kümede paylaşılır; testler paralel koşturulmak istenirse kümedeki roller (`anon`, `authenticated`…) ortak olduğundan rol oluşturan/silen testler ayrıca denetlenmeli (yapılmadı).

## Sınırlar
- `community-notify-scale` hâlâ ~90 sn (21 000 kullanıcı + tetikleyici kurulumu; bilinçli ölçek testi).
- Gerçek GitHub Actions süresi bu PR'da ölçülür; yerel sayı yalnız yönü gösterir.
