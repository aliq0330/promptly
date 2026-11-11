# 372 — Genel inceleme: RLS InitPlan, dile göre sözlük, sohbet/geliştirici düzeltmeleri, mesajlaşma ayrıştırması

**Durum: KODLANDI.** Migration `20261121100000_rls_auth_uid_initplan.sql` deploy hattıyla uygulanır — `schema_migrations`'a bak.
Gerçek Supabase'e/cihaza karşı DENENMEDİ; canlıya yalnız salt-okunur sorgu atıldı (aşağıda).

Kullanıcı "hangi modül geliştirilmeli" diye sordu, öneriler (Ekipler'in oturtulması, mesajlaşmanın bölünmesi, dil sözlüğü, RLS)
sunuldu; ardından "bütün incelemeleri yap, düzeltme olacaksa bozmadan düzelt" dedi. Önce tam temel durum çıkarıldı, sonra
yalnız ölçülen/yeniden üretilen sorunlar düzeltildi.

## Temel durum (değişiklikten önce, `main` @ 69f4db5)

| Kontrol | Sonuç |
|---|---|
| `tsc`, `eslint` (0 hata, 19 eski uyarı), `npm test` (1041) | yeşil |
| Yerel PostgreSQL, 89 SQL test dosyası — **her dosya kendi temiz veritabanında** | hepsi `FAILED=0` (CLAUDE.md'deki "`anon-hardening`/`contract-cleanup` kırmızı" notu eskimiş) |
| Canlı Edge Function `api` v14 / `mcp` v15 | 2026-11-09'da GitHub hattından yeniden deploy edilmiş; düşen kütüphane RPC'lerini çağırmıyor (362'deki "elle deploy edilmeli" notu eskimiş) |
| Ağ taklitli Playwright | `run-chat` 37/38 (senaryo 9), `run-developers` 21/23, `run-legal-notice` 10/14 — üçü de `main`'de aynı şekilde kırmızı |
| Supabase performans danışmanı | `auth_rls_initplan` **139** politika, 108 dizinsiz FK (bilgi), 43 kullanılmayan dizin (bilgi), 14 çoklu permissive politika |
| Paket | Dil sözlüğü (TR + EN birlikte) her sayfada tek parça: **711 KB ham / 195 KB gzip** |

> Not: `supabase/tests/run-local.sh a.sql b.sql …` tüm dosyaları TEK veritabanında koşturur ve birbirini kirletir (sahte kırmızı).
> CI her dosyayı ayrı veritabanında koşturur (`ci.yml`); yerelde de öyle yap.

## Yapılanlar

### 1. RLS: `auth.uid()` sorgu başına bir kez (migration `20261121100000`)
- `public` şemasında çıplak `auth.uid()` çağıran 139 politika `alter policy` ile `(select auth.uid())`'e çevrildi — politika
  silinmez/yeniden kurulmaz; komut, roller, permissive/restrictive aynı. Sonda çıplak kalan varsa migration hata verir (tek işlem).
- **Anlam aynı:** yerelde eski ve yeni `pg_policies`, sarmalama normalize edilince 409 satırın tamamı birebir aynı.
- **Canlıyla aynı sonuç:** canlıdaki 211 politikaya aynı dönüşüm salt-okunur SELECT içinde simüle edildi; özet (`md5`)
  yerel migration sonrasıyla birebir aynı (`146b814c…`). Canlıya yazma yapılmadı.
- Koruma testi `supabase/tests/rls-initplan.sql` (7 madde): çıplak `auth.uid()` kalmadı + sahibi/başkası/ziyaretçi davranışı.
  Migration'dan önce 1. madde kırmızı, sonra 7/7. Tam SQL paketi migration'la 90/90 yeşil.
- Yeni politika yazan migration `(select auth.uid())` yazmalı (CLAUDE.md §8.13c); yazmazsa bu test kırmızı olur.

### 2. Dil sözlüğü dile göre bölündü
- Kaynak DEĞİŞMEDİ: metinler hâlâ `translations*.ts`'e `{ tr, en }` olarak yazılır (§4.5).
- `scripts/build-i18n.mjs` (TypeScript derleyicisiyle) bunlardan `src/lib/i18n/generated/{tr,en}.ts` düz sözlüklerini üretir
  (anahtar başına bir satır; repoda tutulur; `npm run build`/`dev` öncesi kendiliğinden çalışır).
- Çalışma zamanı: `lib/i18n/dictionary.ts` (Türkçe statik; İngilizce `import()` ile ayrı parça; İngilizce ziyaretçide modül
  yüklenir yüklenmez paralel iner) + `lib/i18n/runtime.ts` (`translateForRuntime`, `getRuntimeLanguage` buraya TAŞINDI — 44
  dosyanın içe aktarması güncellendi). `translations.ts` artık yalnız kaynak + tiptir.
- `LanguageProvider`: dil seçimi (radyo, `language`) anında değişir; metinler sözlük inince güncellenir (o ana dek Türkçe metin —
  anahtar asla görünmez). `LanguageTermScope` aynı sözlükten okur.
- `src/lib/i18n-dictionary.test.ts`: üretilen dosyalar kaynakla birebir mi, her anahtarın iki dili dolu mu, ve **hiçbir kaynak
  dosya `translations*.ts`'ten değer içe aktarmıyor mu** (aktarırsa iki dil yeniden pakete girer; deneme dosyasıyla kırmızı olduğu görüldü).
- Ölçüm (`next build`, aynı ayarlar): Türkçe kritik parça **195 → 121 KB gzip (−38 %)**; İngilizce sözlük ayrı **103 KB gzip**,
  yalnız İngilizce kullanıcıya iner. **Ödünleşim:** statik ön-çizim Türkçe olduğundan hidrasyon için Türkçe sözlük herkese
  gerekir; İngilizce kullanıcı toplamda ~29 KB daha fazla indirir (ama kritik yoldaki parça küçüldü, İngilizce paralel iner).

### 3. Sohbet: uzak mesaja atlama anında (run-chat 9)
Aramada/yıldızlıda eski bir mesaja atlanınca pencere yükleniyor, liste önce en altta çiziliyor, sonra hedefe ~2500 px
**yumuşak** kayıyordu (~1 sn liste uçuyor, bu sırada "Güncel mesajlara dön" dahil hiçbir düğmeye basılamıyordu — test bunu
"element is not stable" olarak yakaladı). Artık hedef 1,5 ekrandan uzaksa (ya da hareketi azalt açıksa) anında konur, yakınsa
yumuşak kayar (`local-conversation-view.tsx`). `run-chat` 38/38.

### 4. Geliştiriciler sayfası: bölüm şeridi Mesajlar hapının altında kalıyordu (run-developers 17, 22)
`lg`+ ekranda oturumlu kullanıcıda sağ alttaki sabit "Mesajlar" hapı (z-40, `docs/history/328-*`) `/developers`'taki önceki/sonraki
bölüm şeridinin "Sonraki bölüm" düğmesini örtüyordu (gerçek hata — düğmeye basılamıyordu). Şerit, hap sayfadayken
(`html:has([data-message-dock-pill])`) hapın üstüne çıkar; hap yoksa (telefon, ziyaretçi) konum aynı. `run-developers` 23/23.

### 5. Yasal bant testi eskimişti (run-legal-notice 2–5)
Test `TERMS_VERSION`'ı sabit `2026-11-02` yazıyordu; koşullar 2026-11-08'e güncellenince kırmızı oldu. Test sürüm ve yürürlük
anını artık `legal-content.ts`'ten okur. Uygulama kodu değişmedi. 14/14.

### 6. Mesajlaşma bileşeninden iki kanca ayrıldı (davranış aynı)
`LocalConversationView` 2239 → 2080 satır:
- `use-pending-share.ts` — paylaşım bağlantısından (`?share<Tür>Id=`) gelen bekleyen paylaşım (6 durum + effect + türetme).
  Tek davranış farkı: bağlantı hızla değişirse geç gelen yanıt artık yanlış başlığı yazmaz (iptal bayrağı).
- `use-message-reactions.ts` — tepki listesi, canlı abonelik, iyimser "tek tepki" kuralı. İlk yükleme yine sohbetin toplu
  yüklemesindedir (`setReactionRows`), ek istek yok.
Daha derin bölme (mesaj penceresi/kaydırma, yazma alanı, başlık, oda/kanal kapsamı) bilerek bu turda yapılmadı: hepsi aynı
durumları paylaşıyor; ayrı, kademeli bir iş olarak ele alınmalı.

## Yapılmayanlar / karar bekleyenler
- **Ekip ölü sütunları** (`teams.library_space_id`… — 362'nin uyarısı) düşürülmedi: yıkıcı SQL + 30+ canlı fonksiyon adıyla anıyor; ayrı contract + kullanıcı onayı ister.
- **Gizlilik/Koşullar "Ekipler" bölümü** kütüphane/API cümleleri hâlâ eski modele göre — ürün/hukuk kararı, metne dokunulmadı.
- **Space panosunda eşzamanlı düzenleme** yok (son kayıt kazanır); ekipler ortak kullandığı için önemi arttı — tasarım işi.
- Danışmanın 108 dizinsiz FK / 43 kullanılmayan dizin bulguları (INFO) tek tek ölçülmeden dokunulmadı (§8.13: önce ölç).
- 19 eski lint uyarısı (eklenti globalleri, seed/test dosyaları) zararsız; dokunulmadı.

## Testler
- `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` (1044), `npm run build` temiz.
- Yerel PostgreSQL: 90 SQL test dosyası (yeni `rls-initplan.sql` dahil), her biri ayrı veritabanında, hepsi `FAILED=0`.
- Ağ taklitli Playwright: aşağıdaki tablo (son derlemeyle).
- İngilizce karşılıklar: yeni görünür metin YOK (yalnız yorum/belge); mevcut İngilizce senaryolar (`run-chat` 16, `run-settings` 5,
  `run-developers` 22, `run-legal-notice` 7) yeşil.
