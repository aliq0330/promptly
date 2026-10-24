# 226 — Migration + istemci tek yayın boru hattı

**Durum:** uygulandı (repo; iş akışları ve betikler). Betik mantığı yerelde sınandı (psql sürücüsüyle uçtan uca: uygulama, atomik geri alma, yıkıcı SQL engeli, yeniden çalıştırma; `scripts/migrations-lib.test.mjs` 8 birim test; Playwright `run-safety` 11/11). **GitHub Actions'ta ve gerçek projeye karşı DOĞRULANDI** (PR #302 birleşince #351: denetim + duman testi canlı şemaya karşı temiz; PR #303 `20260924100000_pipeline_selftest.sql` [zararsız tablo yorumu] → #352'de Management API sürücüsü migration'ı uyguladı, `schema_migrations`'a `20260924100000` kaydı düştü, yorum canlıda görüldü, ardından duman testi + derleme + yayın yeşil). Denenmeyen: hatada geri alma ve yıkıcı SQL engelinin CANLI projede davranışı (yalnız yerel psql sürücüsüyle sınandı).

## Sorun
Migration'lar elle (MCP/SQL Editor), istemci `main`'e birleşince otomatik yayınlanıyordu; aralarında sıra kuralı yoktu. 224'te `profiles.is_demo` sütununu seçen istemci migration'dan önce yayınlandı ve her profil sorgusu 400 verme riski taşıdı.

## Üç katman
1. **Migration'ı CI uygular** (`deploy.yml`): `check` → `apply-migrations` → `smoke-test` → derleme → yayın. Herhangi biri kırmızıysa site eski haliyle kalır. `supabase db push` KULLANILMAZ (canlıda repo sürümleri + MCP zaman damgaları karışık kayıtlı; CLI bu yüzden güvenle durur). Bunun yerine `scripts/apply-migrations.mjs`:
   - `supabase/migrations-baseline.txt` (şu an `20260923100100`) = canlıda olduğu bilinen son sürüm. Yalnız ondan YENİ dosyalar aday; eskilere asla dokunulmaz (geçmiş uzlaştırma gerekmez).
   - Adaylardan `supabase_migrations.schema_migrations`'ta kaydı olmayanlar bekleyen sayılır; her biri **tek istekte** (migration + kayıt) uygulanır → kayıt yazılamazsa migration da geri alınır. İlk hatada durur.
   - Yıkıcı ifade (`drop table/view/column/schema/function/type/extension`, `truncate`) dosyanın başında `-- ci:allow-destructive` olmadan uygulanmaz (`drop trigger/policy/index/constraint … if exists` serbest). CLAUDE.md'deki "yıkıcı SQL için onay" kuralının CI karşılığı: işareti koyan kişi PR'da bunu gözle onaylatmış olur.
   - Bekleyen yoksa secret gerekmez, sessizce geçer. Zamanlanmış (6 saatlik) yeniden derlemede migration uygulanmaz.
   - Sürücü: Management API `POST /v1/projects/{ref}/database/query` (CI) ya da `MIGRATE_DRIVER=psql` (yerel deneme).
2. **Geriye uyumlu geçiş**: kural CLAUDE.md §8.11. Kod tarafı: `tolerateMissingOptionalColumns` (`lib/supabase/server-errors.ts`) — `OPTIONAL_COLUMNS` (şimdilik `is_demo`) canlıda yoksa `42703` hatasında istek sütunsuz bir kez yeniden denenir, o oturumda sütun baştan çıkarılır; site açılır, yalnız rozet görünmez.
3. **Sigorta**: `scripts/smoke-test.mjs` migration'dan SONRA, derlemeden ÖNCE istemcinin sorgularını (`PROFILE_SELECT` kaynaktan okunur, prompt/istek/workflow/hazır ayar/bildirim sütunları, `feed_page`, `discover_tool_counts`) canlı şemaya anon anahtarla dener; uyuşmazlıkta yayın durur.

## PR denetimi (`ci.yml`, canlıya dokunmaz)
`checks` (lint, tsc, birim testler, migration adı/yıkıcı denetimi) · `database` (PostgreSQL 16 servisinde bütün migration'lar baştan + `supabase/tests/*.sql`, hepsi `FAILED=0`) · `ui` (altı Playwright paketi; `continue-on-error`, bilgilendirici).

## Kullanıcının yapacağı (bir kerelik)
- Depo secret'ları: `SUPABASE_ACCESS_TOKEN` (Dashboard → Account → Access Tokens) ve `SUPABASE_PROJECT_REF` (`xqxybhjcyrvaroknucdq`). `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` zaten var (derleme kullanıyor).
- İsteğe bağlı: GitHub → Settings → Environments'ta `production` + zorunlu onaylayıcı ve `deploy.yml` işine `environment: production` eklemek (her canlı migration'dan önce insan onayı). Şimdilik eklenmedi.
- `main` için "Require status checks" (`checks`, `database`) açılırsa kırmızı PR birleşemez.

## Bilinçli sınırlar
- Geri alma (down migration) yok: hata veren migration atomik geri alınır, ama uygulanmış bir migration'ı geri çevirmek yeni bir ileri migration'dır.
- Edge Function'lar bu boru hattında değil (`deploy-functions.yml`, elle).
- Smoke testi anon anahtarla koşar: RLS yüzünden yalnız "sorgu geçerli mi (tablo/sütun/RPC var mı)"yı sınar, veri doğruluğunu değil.
- Aynı anda iki `main` itmesi `concurrency: pages-deploy` ile sıraya girer (migration'lar paralel uygulanmaz).
