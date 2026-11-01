# 315 — Anahtarı kabul eden uçlar: `/v1/me*` + kişisel MCP (313'ün 4. adımı)

> **Durum:** kod ve migration repoda. Migration `20261102120000_api_me.sql` merge'de deploy hattıyla canlıya iner; **Edge Function'lar (`api`, `mcp`) ayrıca
> yüklenmelidir** (CI deploy etmez, CLAUDE.md §2). Bu satır yükleme yapılınca güncellenir.

## Mimari (313 §3 yol B — canlıda Edge'den denendi)
- Kimlik tek işlemde kurulur (`lib/public-api/me.ts`, `createMeBackend`): (1) anahtar `_api_token_authenticate` ile doğrulanır, (2) `set local role authenticated` +
  `request.jwt.claims`, (3) `api_me_throttle` (hesap başına okuma 120/dk, yazma 30/dk; `_rate_limit`), (4) işlem. Sonrası çağıranın RLS'i/askısı/hız sınırlarıyla çalışır.
- Çekirdek bağımlılıksızdır: veritabanına `MeDb` arayüzüyle konuşur (Edge'de `supabase/functions/_shared/me-edge.ts` = `npm:postgres`, tek bağlantı, `prepare:false`,
  `statement_timeout` 8 sn); Node'da sahte `MeDb`. Service role YOK; bağlantı dizesi (`SUPABASE_DB_URL`) yoksa uçlar 404'tür (açık API etkilenmez).
- Mantık SQL'dedir (kalıp: tek doğruluk kaynağı RPC): INVOKER `api_me_profile/api_me_prompts/api_me_prompt/api_me_saved` (keyset, en çok 51 satır, topluluğa özgü ve silinmiş
  içerik yok) + DEFINER `api_me_throttle`. Yazma YENİ yol değil: mevcut `import_prompts` (hep özel taslak; askı/hız sınırı geçerli). SQL testi `api-me.sql` 17/17.

## Uçlar (`createApiHandler({ me })`, OpenAPI'de belgeli)
| Uç | Kapsam | Not |
|---|---|---|
| `GET /v1/me` | read | kullanıcı adı + kapsamlar + `via` (key/oauth) |
| `GET /v1/me/prompts?status=&limit=&cursor=` | read | kendi promptların (özel/taslak dahil), keyset; imleç mikrosaniyelidir (JS Date keser) |
| `GET /v1/me/prompts/{id}` | read | tam metin, etiketler, `{değişkenler}`; başkasının/silinmiş/topluluk içeriği → 404 |
| `GET /v1/me/saved` | read | koleksiyonlarımdaki benzersiz promptlar |
| `POST /v1/me/prompts[?dry_run=true]` | write | gövde = sitedeki "Dışa aktar" JSON dosyası (≤30, ≤64 KB); sonuç hep özel taslak; 422 = hiçbir şey yazılmadı |
Hata eşlemesi: yok/geçersiz kimlik 401 (`WWW-Authenticate`), kapsam yok/askı/paylaşım engeli 403, hız sınırı 429, bilinmeyen DB hatası 502 (metin sızmaz). Yanıtlar `no-store`.

## Kişisel MCP (`…/functions/v1/mcp/me`)
- Aynı `server.ts`'e `me` seçeneğiyle 4 araç eklenir: `list_my_prompts`, `get_my_prompt`, `list_my_saved`, `save_prompt_draft` (tek yazma; `readOnlyHint:false`, `destructiveHint:false`).
  Her araç çağrısı bearer'ı YENİDEN doğrular (iptal edilen anahtar bir sonraki çağrıda çalışmaz) ve kullanıcı olarak çalışır.
- Kimliksiz/biçimi bozuk istek 401 + `WWW-Authenticate: Bearer resource_metadata="…/mcp/oauth-protected-resource"` (RFC 9728; OAuth istemcilerinin girişi başlatma yolu, 5. adım);
  `/mcp/oauth-protected-resource` korumalı kaynak metadatasını verir. Açık `/mcp` adresi anahtar gönderilse bile kişisel araç SUNMAZ (testli).
- OAuth belirteci (JWT) Supabase Auth'a doğrulatılır (`GET /auth/v1/user`) ve yalnız **okuma** kapsamı alır (en az yetki).

## `/developers`
"Hesabınla kullan (kişisel anahtar)" bölümü (TR+EN, **İngilizce karşılıkları eklendi**): curl örnekleri, kişisel MCP adresi + Claude Code `--header` + Cursor `headers`, kurallar;
claude.ai/ChatGPT bağlayıcılarının sabit başlık gönderemediği (OAuth gerek) açıkça yazılı, anahtarın oralara yapıştırılmaması söylenir.

## Test
`me.test.ts` 17 (işlem sırası, 401/403/429/502 eşlemesi, imleç, import, OAuth), `remote.test.ts` +9 (gerçek MCP istemcisiyle `/mcp/me`), `developers.test.ts` +1, `run-developers.mjs` 15/15,
SQL `api-me.sql` 17/17. **Denenmedi:** gerçek Supabase/Edge'de uçtan uca (deploy sonrası canlı doğrulama ayrıca yazılır), gerçek Claude/Cursor istemcisi.

## Canlı doğrulama (2026-11-01) ve bulunan hata
Canlıya (`api` v6, `mcp` v5) geçici bir anahtarla (demo hesap, 1 saatlik, deneme sonunda silindi) uçtan uca denendi: `GET /v1/me`, `/me/prompts`, `/me/saved`,
`POST /me/prompts` (kuru çalıştırma + gerçek yazma → ÖZEL TASLAK), MCP `/mcp/me` 8 araç, `save_prompt_draft`, salt-okunur anahtarla yazma → 403, iptal edilen anahtar → 401,
anahtarsız `/mcp/me` → 401 + `WWW-Authenticate`, açık `/mcp` hâlâ yalnız 4 araç. Oluşan 2 deneme taslağı ve anahtar silindi.

**Hata (yalnız canlıda çıktı, birim testleri yakalamadı):** Edge'deki `postgres.js` sürücüsü `$1::jsonb` parametresini KENDİSİ `JSON.stringify` eder; çekirdek de önceden
stringify ettiği için çift kodlanıyordu ve yazma yolu 502 `upstream` veriyordu (okuma yolları jsonb parametresi taşımadığı için etkilenmedi). Düzeltme: `$1::text::jsonb`
(sürücü metni olduğu gibi gönderir, sunucu çevirir). **Kural:** Edge'den (postgres.js) giden jsonb parametresi `::text::jsonb` ile yazılır; sahte `MeTx` testleri bunu göremez.
