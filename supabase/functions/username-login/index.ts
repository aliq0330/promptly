// username-login — kullanıcı adı + şifreyle giriş. Supabase Auth yalnızca
// e-postayla giriş bildiği için kullanıcı adını SUNUCUDA e-postaya çevirir;
// e-posta tarayıcıya HİÇ dönmez, yalnızca oturum (access/refresh token) döner.
//
// Güvenlik: kullanıcı adı yok / şifre yanlış aynı genel hatayı döner (hesap
// var mı yok mu anlaşmaz), bilinmeyen kullanıcıda da sahte bir giriş
// denemesi yapılarak süre farkı azaltılır. Hız sınırı KALICIDIR: her istek
// önce `public.auth_login_attempt` RPC'sine sorulur (migration
// 20260919830000; ham IP saklanmaz, hash'i RPC içinde üretilir; dakikada 10
// deneme) — isolate ölünce sıfırlanmaz. Supabase'in kendi auth hız sınırları
// ayrıca geçerli. SERVICE_ROLE anahtarı yalnızca bu fonksiyonda (Supabase'in
// otomatik sağladığı secret) — repoda/istemcide YOK.
//
// CORS: `*` değil. İzinli origin'ler site (GitHub Pages) ve yerel geliştirme;
// `chrome-extension://` origin'i (promptly-extension) yansıtılır; Origin
// başlığı yoksa (uzantı service worker'ı vb.) CORS başlığı eklenmez ama istek
// işlenir; başka her origin 403 alır.
//
// Deploy: `supabase functions deploy username-login --no-verify-jwt`
// (giriş yapmamış kullanıcı çağırdığı için JWT doğrulaması kapalı olmalı;
// `scripts/deploy-functions.sh` / "Deploy Edge Functions" workflow'u da aynısını
// yapar). ÖNCE `20260919830000_auth_login_attempts.sql` canlıya uygulanmalı;
// uygulanmamışsa RPC hata verir ve fonksiyon hız sınırsız (fail-open) çalışır,
// hata loglanır.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://aliq0330.github.io", "http://localhost:3000"];

/** CORS başlıkları: yalnızca izinli origin yansıtılır (Origin yoksa hiçbir şey yansıtılmaz). */
function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function originAllowed(origin: string | null): boolean {
  if (!origin) return true; // uzantı service worker'ı / sunucudan sunucuya
  return origin.startsWith("chrome-extension://") || ALLOWED_ORIGINS.includes(origin);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Hesap var mı yok mu ayrımını sızdırmayan TEK hata.
const INVALID = { error: "invalid_credentials" };

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!originAllowed(origin)) return json({ error: "forbidden_origin" }, 403, {});
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Hız sınırı: kalıcı sayaç RPC'de (yalnızca service_role çağırabilir).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { data: limited, error: limitError } = await admin.rpc("auth_login_attempt", { p_ip: ip });
  if (limitError) console.error("auth_login_attempt", limitError.message);
  else if (limited === true) return json({ error: "rate_limited" }, 429, cors);

  let identifier = "";
  let password = "";
  try {
    const body = await req.json();
    identifier = String(body?.identifier ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  if (!identifier || !password || password.length > 200) return json(INVALID, 401, cors);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let email: string | null = null;
  if (USERNAME_PATTERN.test(identifier)) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", identifier)
      .maybeSingle();
    if (profile) {
      const { data: userData } = await admin.auth.admin.getUserById(profile.id);
      email = userData?.user?.email ?? null;
    }
  }

  // Bilinmeyen kullanıcıda da gerçek bir giriş denemesi yap (süre farkını azaltır).
  const { data, error } = await anon.auth.signInWithPassword({
    email: email ?? "no-such-user@invalid.example",
    password,
  });
  if (!email || error || !data.session) return json(INVALID, 401, cors);

  return json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    200,
    cors,
  );
});
