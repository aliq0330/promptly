// delete-account — kullanıcının KENDİ hesabını kalıcı siler.
//
// Güvenlik:
//   • JWT doğrulaması AÇIK (varsayılan): Supabase geçersiz/eksik JWT'yi kapıda
//     reddeder; ayrıca burada `auth.getUser()` ile Auth sunucusuna doğrulatılır.
//   • Silinecek kullanıcı İSTEMCİDEN ALINMAZ: istek gövdesinde kullanıcı kimliği
//     yoktur, hedef her zaman doğrulanmış JWT'nin sahibidir (`auth.uid()`). Bir
//     kullanıcı yalnızca kendini silebilir; başkasını silmenin (moderatör
//     yolundaki `admin_delete_user(p_user_id, …)` gibi) bir yolu burada YOKTUR.
//   • Onay sunucuda da kontrol edilir: gövdedeki kullanıcı adı, profilindeki
//     kullanıcı adıyla eşleşmezse hiçbir şey silinmez (arayüz tek koruma değil).
//   • Moderatör hesapları bu yolla silinemez.
//   • SERVICE_ROLE anahtarı yalnızca bu fonksiyonda (Supabase'in otomatik
//     sağladığı secret) — repoda/istemcide YOK.
//
// Silme: `delete_account_data(uid)` (yalnızca service_role çalıştırabilir) tek
// transaction'da profili ve içeriği mevcut cascade kurallarıyla siler; hata olursa
// hesap olduğu gibi kalır (istemci oturumu açık bırakıp hatayı gösterir). Ardından
// kullanıcının artık hiçbir satıra bağlı olmayan Storage dosyaları (yalnızca ona ait
// yollar) en iyi çabayla kaldırılır; kalanları `cleanup-orphan-storage` süpürür.
//
// Çağrı:  POST { "confirmUsername": "<kullanıcı adı>" }  (Authorization: Bearer <kullanıcı JWT'si>)
// Yanıt:  200 { ok: true, filesRemoved, filesFailed }  |  4xx/5xx { error: <kod> }
// Deploy: `supabase functions deploy delete-account`   (JWT doğrulaması AÇIK — `--no-verify-jwt` EKLEME)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const REMOVE_BATCH = 100;
/** `message-images` yolu `{konuşma}/{gönderen}/{dosya}`; diğer bucket'larda ilk klasör sahibin kimliğidir. */
const SENDER_IN_SECOND_SEGMENT = "message-images";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  // 1) Kimlik: JWT'yi Auth sunucusuna doğrulat. Hedef kullanıcı BUDUR.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await asCaller.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) return json({ error: "unauthorized" }, 401);

  let confirmUsername = "";
  try {
    const body = await req.json();
    confirmUsername = String(body?.confirmUsername ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2) Sunucu tarafı onay + moderatör kontrolü.
  const { data: profile, error: profileError } = await admin.from("profiles").select("username, role").eq("id", userId).maybeSingle();
  if (profileError) return json({ error: "lookup_failed" }, 500);
  if (!profile) return json({ error: "not_found" }, 404);
  if (profile.role === "moderator") return json({ error: "moderator_account" }, 403);
  if (!confirmUsername || confirmUsername !== String(profile.username).toLowerCase()) {
    return json({ error: "confirmation_mismatch" }, 400);
  }

  // 3) Tek transaction'lık silme. Hata → hiçbir şey silinmemiş olur.
  const { error: deleteError } = await admin.rpc("delete_account_data", { p_user_id: userId });
  if (deleteError) {
    console.error("delete_account_data", deleteError.message);
    return json({ error: "delete_failed" }, 500);
  }

  // 4) Hesap gitti; yalnızca BU kullanıcıya ait, artık bağlı olmayan dosyaları kaldır (en iyi çaba).
  let filesRemoved = 0;
  let filesFailed = 0;
  try {
    const { data: orphans, error: scanError } = await admin.rpc("orphan_storage_objects", { p_min_age: "0 seconds" });
    if (scanError) throw new Error(scanError.message);
    const mine = new Map<string, string[]>();
    for (const row of (orphans ?? []) as Array<{ bucket_id: string; name: string }>) {
      const segments = row.name.split("/");
      const owner = row.bucket_id === SENDER_IN_SECOND_SEGMENT ? segments[1] : segments[0];
      if (owner !== userId) continue;
      const list = mine.get(row.bucket_id) ?? [];
      list.push(row.name);
      mine.set(row.bucket_id, list);
    }
    for (const [bucket, names] of mine) {
      for (let i = 0; i < names.length; i += REMOVE_BATCH) {
        const batch = names.slice(i, i + REMOVE_BATCH);
        const { data, error: removeError } = await admin.storage.from(bucket).remove(batch);
        if (removeError) filesFailed += batch.length;
        else filesRemoved += data?.length ?? 0;
      }
    }
  } catch (err) {
    console.error("storage cleanup", err);
    filesFailed += 1;
  }

  return json({ ok: true, filesRemoved, filesFailed });
});
