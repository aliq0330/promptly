// api — Promptly açık API'si (salt-okunur, `docs/history/297-*`). Bütün mantık `src/lib/public-api` çekirdeğindedir; burası yalnız
// onu `Deno.serve`'e bağlar. Çekirdeğin buradaki kopyası `../_shared/promptly/` — `node scripts/sync-function-shared.mjs` üretir,
// elle düzenlenmez.
//
// Güvenlik: yalnız ANON anahtar (Supabase'in otomatik verdiği `SUPABASE_ANON_KEY`) — sitenin oturumsuz ziyaretçisiyle aynı yetki, RLS
// her şeyi belirler. SERVICE ROLE BURADA KULLANILMAZ ve eklenmemeli: anahtarlı/yazan uçlar Faz 2'de kullanıcının KENDİ oturumuyla gelir.
//
// Deploy: `supabase functions deploy api --no-verify-jwt` (herkese açık okuma; `supabase/config.toml` + `scripts/deploy-functions.sh`).
// Adres: https://<ref>.supabase.co/functions/v1/api/v1  — belge: …/v1/openapi.json

import { createApiHandler } from "../_shared/promptly/lib/public-api/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const handler = createApiHandler({
  config: { url: SUPABASE_URL, anonKey: ANON_KEY },
  publicBaseUrl: SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/api/v1` : undefined,
  onError: (error) => console.error("api", error),
});

Deno.serve(handler);
