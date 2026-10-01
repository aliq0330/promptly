// username-login — kullanıcı adı + şifreyle giriş. Supabase Auth yalnızca
// e-postayla giriş bildiği için kullanıcı adını SUNUCUDA e-postaya çevirir;
// e-posta tarayıcıya HİÇ dönmez, yalnızca oturum (access/refresh token) döner.
//
// Güvenlik: kullanıcı adı yok / şifre yanlış aynı genel hatayı döner (hesap
// var mı yok mu anlaşılmaz), bilinmeyen kullanıcıda da sahte bir giriş
// denemesi yapılarak süre farkı azaltılır, IP başına basit hız sınırı var
// (isolate başına bellek içi — best-effort; Supabase'in kendi auth hız
// sınırları ayrıca geçerli). SERVICE_ROLE anahtarı yalnızca bu fonksiyonda
// (Supabase'in otomatik sağladığı secret) — repoda/istemcide YOK.
//
// Deploy: `supabase functions deploy username-login --no-verify-jwt`
// (giriş yapmamış kullanıcı çağırdığı için JWT doğrulaması kapalı olmalı).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const RATE_LIMIT = 10; // dakikada IP başına deneme
const RATE_WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

// Hesap var mı yok mu ayrımını sızdırmayan TEK hata.
const INVALID = { error: "invalid_credentials" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

  let identifier = "";
  let password = "";
  try {
    const body = await req.json();
    identifier = String(body?.identifier ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!identifier || !password || password.length > 200) return json(INVALID, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  if (!email || error || !data.session) return json(INVALID, 401);

  return json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    200,
  );
});
