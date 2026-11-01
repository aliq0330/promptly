# 304 — API / MCP kullanımı Yaratıcı panelinde

**Durum:** uygulandı (repoda). Migration ve Edge Function'lar canlıya UYGULANMADI/DEPLOY EDİLMEDİ — aşağıda "Canlıya alma".
Denenen: yerel PostgreSQL 16'da `supabase/tests/public-api-prompt-uses.sql` 26/26, birim testleri (`npm test` 667/667, `mcp` 18/18), ağ taklitli
arayüz testi `run-insights.mjs` 22/22, `tsc`/`lint`/`build` temiz. **Denenmedi:** gerçek Supabase'e karşı, deploy edilmiş Edge Function'la.

## İstek
Açık API ve MCP üzerinden yapılan "kopyalama" işlemlerini sayıp Yaratıcı panelinde göstermek (297'deki sınır: "kopyalama sayacı MCP/API kullanımını saymaz").

## Karar: ayrı sayı, `copy_count`'a KARIŞMAZ
Site kopyalaması oturumlu kullanıcı başına sayılır (güvenilir kimlik, `record_prompt_copy`). API/MCP kimliksizdir (yalnız IP özeti). İkisini toplayıp
`prompts.copy_count`'u artırmak Popüler / Sana özel / "En çok kullanılan" sıralamasını ve kilometre taşı bildirimlerini kimliksiz bir girdiye açardı.
Bu yüzden panelde ayrı bir **"API / MCP"** kutusu (toplam + trend + "API N · MCP M") vardır; Kopyalama kutusu değişmedi.

## Ne sayılır
- API: `GET /v1/prompts/{id}` (`?format=` dahil, geçerliyse) ve `POST /v1/prompts/{id}/fill`.
- MCP (internet üzerinden, Edge Function `mcp`): `get_prompt` ve `fill_prompt`.
- SAYILMAZ: arama, popüler listesi (listede görmek kullanmak değil), hatalı istek/bilinmeyen prompt/geçersiz `format`.
- Prompt yayında + herkese açık + silinmemiş + topluluğa ait değil olmalı (SQL yeniden doğrular).

## Mimari
```
src/lib/public-api/usage.ts   PromptUseRecorder (bağımlılıksız): record(promptId, clientKey) — asla fırlatmaz
  http.ts                     createApiHandler({ usage })  → GET/fill başarısında await usage.record (hata yutulur)
mcp/src/server.ts             createPromptlyServer({ onPromptUse }) → get_prompt / fill_prompt
mcp/src/remote.ts             createRemoteHandler({ usage }) → onPromptUse = usage.record(id, clientKeyOf(request))
supabase/functions/{api,mcp}  recorder = createRemotePromptUseRecorder({ secret: RATE_LIMIT_SECRET, source: "api"|"mcp" })
```
Veritabanı (`20261101160000_public_api_prompt_uses.sql`, yalnız ekleyici):
- `public_api_prompt_uses (prompt_id, source, day, uses)` — kalıcı toplam; yalnız sayı, kimin kullandığı yok.
- `public_api_prompt_use_seen (prompt_id, source, client_hash, day)` — mükerrer engeli; **yalnız bugünü tutar** (her çağrıda dünkü ve eski satırlar silinir).
- `record_public_api_prompt_use(p_secret, p_prompt_id, p_source, p_client)` — SECURITY DEFINER; **302'deki hız sınırıyla aynı SIR kapısı** (`RATE_LIMIT_SECRET`,
  özeti `public_api_rate_limit_config`'te; yeni sır/ortam değişkeni gerekmez). Sırsız çağrı hiçbir satır yazmadan reddedilir. Anon anahtar sitede açık olduğundan
  sırsız bir sayaç ucu başkasının promptunu şişirmeye yarardı.
- Mükerrer: aynı istemci + aynı prompt + aynı yüzey + aynı UTC günü = 1. Bir istemci günde en çok 100 FARKLI prompt sayar (kazıyıcı bütün kütüphaneye +1 yazamaz).
- Panel: `creator_insights_api(p_days)` ve `creator_insights_prompt_api(p_prompt_id, p_days)` (SECURITY DEFINER; kapsam `author_id = auth.uid()`, başkasının/olmayan
  prompt `not_found`, anon kapalı). 294/295'teki RPC'lerin dönüş şekli DEĞİŞMEDİ (ayrı RPC).
- Kimlik: `clientKeyOf` (IP) → kova = sha256(sır|use|yüzey|IP).slice(0,32); ham IP veritabanına gitmez. IP belirlenemezse SAYILMAZ (hepsini tek kovaya koymak sayıyı anlamsız kılar).
- Hata = sayma (API/MCP asla sayaç yüzünden düşmez; 1500 ms zaman aşımlı istemci).

## Arayüz
`/insights`: 7 kutu (lg'de 4 sütun; Takipçi iki sütun) — "API / MCP" Kopyalama'nın yanında; `/insights/local?id=`: 6 kutu. `InsightStatTile`'a isteğe bağlı `detail` satırı.
`hasNoActivity`/`promptHasNoActivity` API/MCP'yi de etkinlik sayar (yalnız API ile kullanılan yaratıcı boş durum görmez). "Bu sayılar nasıl hesaplanır?" notuna cümle eklendi.
**İngilizce karşılıklar eklendi** (`translations-insights.ts`: `insights.tile.api`, `insights.tile.apiDetail`, not metni; Gizlilik metni TR+EN).

## Gizlilik metni
`legal-content.ts` Gizlilik → Açık API ve MCP maddesi: hız sınırı özeti "en çok bir saat" kalır; bunun yanına sayım için aynı türde özetin "en çok bir gün" saklandığı,
sayının kimin kullandığını içermediği yazıldı (Kullanım Koşulları değişmedi → `TERMS_VERSION` artırılmadı). Hukuki danışmandan geçmedi.

## Bilinen sınırlar (panelde de söylenir)
- **`npx promptly-mcp` (yerel) SAYILMAZ:** doğrudan Supabase'e gider (anon anahtar), Edge Function'dan geçmez; kimliksiz bir sayaç ucu açmak kötüye kullanıma açık olurdu.
  Sayılması için pakete (yeni npm sürümü) `api` Edge Function'ına bir bildirim ucu eklemek gerekir — ayrı karar (yerel pakete telemetri koymak bir gizlilik kararıdır).
- Yazar kendi promptunu API'den okursa sayılır (kimlik yok); aynı IP'yi paylaşanlar (şirket ağı, claude.ai/ChatGPT bağlayıcıları) tek sayılır; farklı IP'den kazıyıcı hâlâ şişirebilir
  (hız sınırı + günlük 100 tavanı yalnız frendir). Bu yüzden "kopyalama" değil "kullanım" denir ve ayrı gösterilir.
- Günlük seriye/trend grafiğine ve "En çok kopyalananlar" listesine eklenmedi (yalnız kutular; dönüş şeklini değiştirmek `drop function` ister).
- `GET /v1/prompts/{id}` yanıtı `Cache-Control: public, max-age=60` taşır; araya giren bir paylaşımlı önbellek varsa tekrar istekler Edge Function'a hiç ulaşmaz (günlük
  mükerrer kuralı bunu zaten saymaz, ama farklı IP'lerden gelen isteklerin önbellekten karşılanıp karşılanmadığı canlıda ölçülmedi).
- Yerel testte `supabase/tests/anon-hardening.sql` #4 ("a newly created table gives anon no write privilege") bu değişiklikten BAĞIMSIZ düşüyor (migration yokken de
  düşüyor — yerel PostgreSQL varsayılan yetkileri); CI'da bu testin durumu bu oturumda görülmedi.

## Canlıya alma (yapılmadı)
1. Migration: `deploy.yml` main'e itilince `scripts/apply-migrations.mjs` uygular (canlı şemada hiçbir şey kaldırılmaz/yeniden adlandırılmaz → expand).
2. Edge Function'lar CI ile deploy EDİLMEZ: `api` ve `mcp` elle (`./scripts/deploy-functions.sh api`, `mcp` ya da "Deploy Edge Functions" workflow'u, `function` seçeneği).
   `RATE_LIMIT_SECRET` canlıda zaten tanımlı (302); yenisi gerekmez. Fonksiyon migration'dan ÖNCE deploy edilirse sayım sessizce atlanır (hata yutulur), sonra düzelir.
3. Doğrulama önerisi: bir promptu `GET /v1/prompts/{id}` ile iki kez oku, yazarın panelinde "API / MCP" 1 artmalı (aynı IP aynı gün tek sayılır).
