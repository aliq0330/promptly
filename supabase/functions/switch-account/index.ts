// switch-account — yalnızca site sahibi `aliq` (moderatör) için: demo hesaplardan birine hızlı geçiş.
//
// Güvenlik:
//   • JWT doğrulaması AÇIK; çağıran `auth.getUser()` ile Auth sunucusuna doğrulatılır.
//   • Çağıranın profili sunucuda okunur: kullanıcı adı `aliq` VE `role = 'moderator'`
//     değilse hiçbir şey yapılmaz (arayüzdeki gizleme tek koruma değildir).
//   • Hedef yalnızca seed'in demo hesaplarıdır (`5eed0000-0000-4000-8000-0000000000NN`);
//     gerçek kullanıcı hesaplarına bu yoldan geçilemez. Hedef kimliği istemciden gelir
//     ama beyaz listeye (desen + profilin var olması) uymazsa reddedilir.
//   • Şifre bilinmeden oturum, magic link özetinin (`hashed_token`) sunucuda
//     doğrulanmasıyla üretilir; e-posta tarayıcıya dönmez, yalnızca oturum döner.
//   • SERVICE_ROLE anahtarı yalnızca bu fonksiyonda (Supabase'in otomatik secret'ı).
//
// Çağrı:  POST { "targetId": "<demo kullanıcı uuid>" }  (Authorization: Bearer <aliq JWT'si>)
// Yanıt:  200 { access_token, refresh_token }  |  4xx/5xx { error: <kod> }
// Deploy: `supabase functions deploy switch-account`   (JWT doğrulaması AÇIK — `--no-verify-jwt` EKLEME)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://aliq0330.github.io", "http://localhost:3000"];
const OWNER_USERNAME = "aliq";
const DEMO_ID_PATTERN = /^5eed0000-0000-4000-8000-0000000000[0-9a-f]{2}$/;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "forbidden_origin" }, 403, {});
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, cors);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await asCaller.auth.getUser();
  const callerId = authData?.user?.id;
  if (authError || !callerId) return json({ error: "unauthorized" }, 401, cors);

  let targetId = "";
  try {
    const body = await req.json();
    targetId = String(body?.targetId ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  if (!DEMO_ID_PATTERN.test(targetId)) return json({ error: "invalid_target" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: caller, error: callerError } = await admin.from("profiles").select("username, role").eq("id", callerId).maybeSingle();
  if (callerError) return json({ error: "lookup_failed" }, 500, cors);
  if (!caller || String(caller.username).toLowerCase() !== OWNER_USERNAME || caller.role !== "moderator") {
    return json({ error: "forbidden" }, 403, cors);
  }

  const { data: target } = await admin.auth.admin.getUserById(targetId);
  const email = target?.user?.email;
  if (!email) return json({ error: "invalid_target" }, 404, cors);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("generateLink", linkError?.message);
    return json({ error: "switch_failed" }, 500, cors);
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verifyError || !verified.session) {
    console.error("verifyOtp", verifyError?.message);
    return json({ error: "switch_failed" }, 500, cors);
  }

  console.log(`switch-account: ${callerId} -> ${targetId}`);
  return json({ access_token: verified.session.access_token, refresh_token: verified.session.refresh_token }, 200, cors);
});
