// cleanup-orphan-storage — hiçbir DB satırının göstermediği Storage
// dosyalarını (silinmiş prompt/istek/sonuç, değiştirilmiş görsel, yarım kalmış
// yükleme) bulur ve ister raporlar ister siler.
//
// Güvenlik: yalnızca moderatör çağırabilir (çağıranın JWT'siyle `is_moderator`
// RPC'si doğrulanır). SERVICE_ROLE anahtarı yalnızca bu fonksiyonda
// (Supabase'in otomatik sağladığı secret) — repoda/istemcide YOK. Varsayılan
// KURU ÇALIŞMA: `{ "apply": true }` gönderilmedikçe hiçbir şey silinmez.
// Son 1 saatte yüklenen dosyalara dokunulmaz (yükleme ile DB satırı arasındaki
// kısa boşluk). Silme Storage API'siyle yapılır (storage.objects satırını
// SQL ile silmek dosyayı diskten kaldırmaz).
//
// Çağrı:  POST  { "apply": false }  → rapor
//         POST  { "apply": true }   → siler
// Deploy: `supabase functions deploy cleanup-orphan-storage`  (JWT doğrulaması açık)

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: isMod, error: modError } = await asCaller.rpc("is_moderator");
  if (modError || isMod !== true) return json({ error: "forbidden" }, 403);

  let apply = false;
  try {
    const body = await req.json();
    apply = body?.apply === true;
  } catch {
    // gövde yok → kuru çalışma
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: orphans, error } = await admin.rpc("orphan_storage_objects");
  if (error) return json({ error: "scan_failed", detail: error.message }, 500);

  const rows = (orphans ?? []) as Array<{ bucket_id: string; name: string; size: number }>;
  const byBucket = new Map<string, string[]>();
  const summary: Record<string, { count: number; bytes: number }> = {};
  for (const r of rows) {
    (byBucket.get(r.bucket_id) ?? byBucket.set(r.bucket_id, []).get(r.bucket_id)!).push(r.name);
    const s = (summary[r.bucket_id] ??= { count: 0, bytes: 0 });
    s.count += 1;
    s.bytes += Number(r.size) || 0;
  }

  if (!apply) return json({ applied: false, total: rows.length, buckets: summary });

  let removed = 0;
  const failures: string[] = [];
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += REMOVE_BATCH) {
      const batch = names.slice(i, i + REMOVE_BATCH);
      const { data, error: rmError } = await admin.storage.from(bucket).remove(batch);
      if (rmError) failures.push(`${bucket}: ${rmError.message}`);
      else removed += data?.length ?? 0;
    }
  }
  return json({ applied: true, total: rows.length, removed, buckets: summary, failures });
});
