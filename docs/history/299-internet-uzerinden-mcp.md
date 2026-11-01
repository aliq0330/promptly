# 299 — İnternet üzerinden çalışan MCP (uzak sunucu / özel bağlayıcı)

**Durum:** uygulandı. Edge Function `mcp` **canlıda** (v1, 2026-11-01, `verify_jwt` kapalı): `https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp`. Gerçek MCP istemcisiyle canlı veriye
karşı doğrulandı. **claude.ai / ChatGPT / Cursor'da gerçek bağlayıcı olarak ekleme denenmedi.**

## Neden

`promptly-mcp` (297) bilgisayarda çalışan bir stdio programıdır: telefon uygulaması ve claude.ai'da kurulamaz. Uzak MCP (Streamable HTTP) adresi,
kullanıcının hiçbir şey kurmadan Claude'a bir URL eklemesini sağlar.

## Mimari

- **Aynı sunucu tanımı** (`mcp/src/server.ts`: 4 araç + `find-prompt`) yeni bir `Request → Response` işleyicisine bağlandı: `mcp/src/remote.ts`
  (`createRemoteHandler`). Edge Function `supabase/functions/mcp` yalnız onu `Deno.serve`'e verir. İkinci bir sorgu/araç tanımı yazılmadı.
- **Oturumsuz + düz JSON cevap** (`WebStandardStreamableHTTPServerTransport`, `sessionIdGenerator: undefined`, `enableJsonResponse: true`): Edge
  Function'lar istekler arası bellek tutmaz, SSE akışı gerekmez. Her POST için yeni sunucu + yeni taşıma (oturumsuz taşıma yeniden kullanılamaz).
  Sonuç: popüler prompt'ları MCP prompt'u olarak listeleme (`loadPopularPrompts`) uzak sürümde YOK (her istekte veritabanını yoklardı).
- **Yetki:** açık API ile aynı — yalnız ANON anahtar, yalnız okur, kimlik doğrulaması yok (`verify_jwt` kapalı; kökte `/.well-known/oauth-*` 404 →
  istemciler kimlik doğrulamasız bağlayıcı sanır). Service role yok. Kullanıcı içeriği "veri, talimat değil" notuyla gider (297 ile aynı).
- **HTTP davranışı:** POST → MCP; GET/DELETE (akış/oturum) → 405 + `Allow` (tarayıcıdan GET → kısa durum JSON'u); `OPTIONS` → 204 + CORS `*`
  (`mcp-session-id`/`mcp-protocol-version` başlıkları izinli/açık); gövde ≤ 64 KB (aşarsa 413, ayrıştırmadan önce); bozuk JSON → 400 JSON-RPC
  hatası; `Accept` eksik/yarım gelirse hoşgörüyle tamamlanır; ayar eksikse 500 + genel mesaj (iç ayrıntı sızmaz, yalnız günlüğe).
- **Kopya:** deploy yalnız `supabase/functions`'ı paketlediği için `scripts/sync-function-shared.mjs` artık `mcp/src/server.ts` ve `remote.ts`'i de
  `supabase/functions/mcp/` altına kopyalar (içe aktarma yolları `../../src/…` → `../_shared/promptly/…` yeniden yazılır, başlık satırı eklenir).
  Kopyalanan dosyaların paket içe aktarmaları YALNIZ izinli listededir (`@modelcontextprotocol/sdk/*.js`, `zod`); kapsam dışı içe aktarma kopya
  aşamasında hata verir (negatif test elle yapıldı). Paket adları Deno'da `supabase/functions/mcp/deno.json` import map'inden çözülür
  (`npm:` + sabit sürümler: sdk 1.32.2, zod 4.6.7). `public-api-vendored.test.ts` bu kopyaları da denetler.
- **Tip:** araç callback parametrelerine AÇIK tip yazıldı (`SearchArgs` vb.): Deno'nun npm tip çözümlemesinde zod şemasından bağlamsal çıkarım
  çalışmıyor (`deno check` örtük `any` veriyordu; Node `tsc` 5.9 ve 6.0.3'te sorun yoktu). Artık `deno check` temiz.

## Test

- `mcp/test/remote.test.ts` (9): gerçek MCP istemcisi (`StreamableHTTPClientTransport`) → işleyici (ağ yok, sahte Supabase): araç listesi/ek açıklamalar/
  talimatlar, yalnız `find-prompt`, uçtan uca araçlar + güvenilmeyen-içerik notu, hatalar araç hatası olur, art arda çok istemci, GET/DELETE/PUT,
  CORS, Accept hoşgörüsü, 400/413, "ayarlanmamış" iç ayrıntı sızdırmaz. MCP paketi toplam 15 test; kök `npm test` 638/638.
- **Gerçek Deno** (`deno run`, sahte Supabase): hem kaynak (`index.ts` + import map) hem deploy edilen tek dosya paketi, curl + gerçek MCP istemcisiyle.
- **Canlı** (sandbox'tan gerçek istek): bilgi JSON'u, GET(SSE)=405, OPTIONS=204+CORS, gerçek MCP istemcisiyle `initialize` → araç/prompt listesi →
  `search_prompts` (canlı veri) → `fill_prompt` (varsayılan + atıf `@baran · Promptly`) → Türkçe etiketle arama → `popular_prompts` →
  topluluğa özgü prompt `not_found` → hatalı `sort` doğrulama hatası; 70 KB gövde 413; bozuk JSON 400; Accept'siz POST 200.

## Deploy hakkında (dürüst not)

Deploy, Supabase MCP aracıyla **tek dosyalık esbuild paketi** olarak yapıldı (`esbuild … --platform=neutral --external:@modelcontextprotocol/sdk/*
--external:zod`, ardından bu iki içe aktarma `npm:…@sürüm` ile yeniden yazıldı; 29,6 KB; SDK paketlenmedi çünkü 1,6 MB tam paket aracın girdi
sınırına sığmaz, Edge çalışma zamanı `npm:` ile kendisi indirir). Yüklenen dosyada birkaç Unicode karakteri kaçışlı yerine düz yazıldı (anlam aynı);
canlıdaki kaynak yerel dosyayla BAYT BAYT karşılaştırılmadı, davranış canlıda yukarıdaki gibi doğrulandı. Depodaki CLI yolu
(`./scripts/deploy-functions.sh mcp` → `supabase functions deploy mcp --no-verify-jwt`, import map ile) bu oturumda ÇALIŞTIRILMADI; yalnız `deno check`
ve `deno run` ile yerelde denendi. Sonraki CLI deploy'u canlıdaki paketi kaynak düzeniyle değiştirir.

## Bilinen sınırlar

- **claude.ai/ChatGPT/Cursor'da gerçek bağlayıcı olarak ekleme DENENMEDİ** (sandbox'tan yapılamaz); özel bağlayıcı kullanılabilirliği plana bağlı olabilir.
- Hız sınırı yok: herkese açık, kimlik doğrulamasız uçtur; her çağrı Edge Function + 1–3 PostgREST isteğidir (Supabase kotası). Kötüye kullanım
  görülürse IP özeti tablosuyla sınır (username-login kalıbı) ya da Supabase tarafı kısıtı eklenir.
- Oturumsuz olduğu için sunucu tarafı bildirimi/abonelik yok; popüler prompt'lar MCP prompt'u olarak listelenmez (araçlar var).
- Yazan uçlar (kaydet, taslak yükle) yok — Faz 2 (kullanıcının kendi JWT'si) hâlâ yapılmadı.
- Kullanım Koşulları (298) "API ve MCP" kapsamında; uzak adres için ayrıca madde gerekmedi, ama "Gizlilik → Açık API ve MCP" maddesi bu uç için de geçerlidir.
