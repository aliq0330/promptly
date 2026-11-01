# 302 — API/MCP hız sınırı + anon sertleştirmesi

**Durum:** kodda ve testte uygulandı. Canlıya iki yoldan iner: migration `deploy.yml` ile (merge'de), Edge Function'lar ELLE deploy edilir (CI deploy etmez). Bu notun altındaki "Canlı durum" bölümüne ne zaman/nasıl indiği yazılır.

## Neden
"API/MCP güvenli mi, hız sınırı var mı" sorusu canlıda ölçüldü (salt okunur, anon rolüyle):
- 40 eşzamanlı istek hepsi 200 döndü → **hız sınırı yoktu**; yanıtta `cf-cache-status: DYNAMIC` (her istek fonksiyona + veritabanına gider).
- Anon anahtar sitenin JS paketinde açık → herkes API'yi atlayıp `/rest/v1`'e doğrudan gidebilir (bu kapı baştan beri açıktı).
- `anon`'un ~50 public tabloda tablo düzeyinde INSERT/UPDATE/DELETE yetkisi vardı (Supabase varsayılanı); koruma yalnız RLS'ti.
- `profiles.suspended_reason` / `posting_block_reason` (moderatörün yazdığı serbest metin) anon dahil herkesçe okunabiliyordu (o gün iki sütun da boştu: sızan veri yok, yapısal açık).
- Anon olarak `blocks`/`messages`/`notifications`/`conversation_members` 0 satır, özel Space okunamıyor, `story_poll_results` hata veriyor, `is_blocked` gerçek çiftte `false` → okuma katmanı beklendiği gibi. 33 topluluk içeriği (herkese açık topluluklarda, tasarım gereği) anon'a açık; API bunları `community_id is null` ile dışarıda bırakır.

## Ne yapıldı
1. **Hız sınırı** (`src/lib/public-api/rate-limit.ts`, saf + birim testli): IP başına sabit pencere, `api` 60/dk, `mcp` 300/dk. Aşılınca `429` + `Retry-After` + her yanıtta `RateLimit-Limit/Remaining/Reset` (CORS'ta okunabilir); MCP'de JSON-RPC hatası (-32000). CORS ön kontrolü (OPTIONS) sayılmaz; MCP'de yalnız POST sayılır.
   - **Bu bir adil kullanım freni, güvenlik duvarı değil.** Sayaç Edge Function örneğinin belleğindedir: çok örnek ayağa kalkarsa toplam izin artar, örnek yeniden başlayınca sıfırlanır. Veritabanında sayaç **bilerek yok** (her isteğe yazma + anon'un çağırabileceği, başkasının kovasını doldurabilecek bir uç demekti; service role bu yüzeylerde yasak). `/rest/v1`'e doğrudan gidenler bu sınırı atlar.
   - IP: `cf-connecting-ip` (Cloudflare ekler), yoksa `x-forwarded-for`'un ilki; **hiçbiri yoksa sınır uygulanmaz** (herkesi tek kovaya koymak herkesi kilitlerdi). IPv6 /64'e indirilir. Bellek `maxKeys=5000` ile sınırlı.
   - **MCP sınırı geniş (300)** çünkü claude.ai/ChatGPT bağlayıcıları isteği kullanıcının değil şirketin sunucularından atar: aynı IP binlerce kişiyi taşır. Durumsuz MCP'de bir sohbet ≥3 istek (initialize + liste + çağrı) yapar. Gerçek kullanımda 429 görülürse bu sayı artırılmalı; ölçüm yok.
2. **Anon yazma yetkisi kaldırıldı** (migration `20261101130000_anon_hardening.sql`): `revoke insert, update, delete, truncate, references, trigger` `anon`'dan; yeni tablolar için varsayılan da. Hiçbir yazma politikası anon'u `auth.uid()` denetimi olmadan kabul etmiyordu (canlıda sorgulandı), yani bu hiçbir yolu kapatmaz.
3. **Moderasyon gerekçeleri okunamaz**: `profiles`'ta tablo düzeyi SELECT kaldırıldı, gerekçe sütunları HARİÇ sütun sütun verildi (`anon` + `authenticated`). Yönetici RPC'leri SECURITY DEFINER olduğu için etkilenmez; istemci bu sütunları seçmiyordu. `suspended_until`/`posting_blocked` (var/yok bayrağı) okunur kalır: INVOKER `suggest_creators` ve `enforce_community_content` bunları arayanın yetkisiyle okuyor — bunları gizlemek o iki fonksiyonu yeniden yazmayı gerektirirdi.
   - **Bedel/tuzak:** `profiles`'a eklenen yeni sütun artık otomatik okunamaz (migration'da `grant select (…)` yazılır); `select *` hata verir. `supabase/tests/anon-hardening.sql` her sütunun ya okunabilir ya bilerek gizli olduğunu denetler (yeni sütunu unutan PR'ı CI'da kırar).
4. **Duman testi** (`scripts/smoke-test.mjs`): ziyaretçi anahtarıyla `suspended_reason` okumasının reddedildiğini (401/403) denetler (tersine denetim, `mustBeDenied`).

## Sınırlar / dürüst notlar
- **Gerçek kapsam:** gerekçe sütunları artık kimse tarafından (kayıtlı kullanıcı dahil) okunamaz; ama `role`, `message_privacy`, `language`, `theme_*`, `suspended_until`, `posting_blocked` hâlâ herkesçe okunur (istemci/INVOKER fonksiyonlar kullanıyor).
- Anon'a açık 24 SECURITY DEFINER fonksiyondan yalnız birkaçı davranışla denendi; gövdelerin hepsi okunmadı, bağımsız denetim yok.
- Veritabanını koruyan şey hâlâ zaman aşımları + plan sınırlarıdır; `/rest/v1` üzerindeki RPC'ler (ör. `search_content`) için IP başına sınır yok.
- Realtime `profiles` UPDATE aboneliği (`engagement-realtime-provider`) sütun yetkisi değişikliğinden sonra denenmedi (yerelde Realtime yok); Supabase Realtime'ın okunamayan sütunları dışarıda bıraktığı varsayımına dayanır.
- Migration'ı canlıda önce işlem içinde denedim (anon + authenticated rolleriyle gerçek sorgular, sonunda `rollback`): anon profil/prompt/`search_content`/`feed_page` okuyor, yazamıyor; authenticated `suggest_creators`, kendi profilini okuma/güncelleme çalışıyor. Bu, kalıcı uygulama değil provaydı.

## Doğrulama
`tsc` ✅ · `lint` · `npm test` · MCP paketi testleri (16, hız sınırı dahil) · `deno check` (api + mcp) ✅ · yerel PostgreSQL'de `anon-hardening.sql` 15/15 ✅ + mevcut tüm SQL testleri (52/52 temiz, CI ile aynı döngü). Arayüz: `/developers` sayfasındaki adil kullanım maddesi (İngilizce karşılık eklendi).

## Canlı durum
(Merge/deploy sonrası doldurulur.)
