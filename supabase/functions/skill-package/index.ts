// skill-package — Skill'in DEĞİŞMEZ yayın paketini (ZIP) derler ve sürümü kaydeder (docs/history/389-*; plan: docs/skill-plani.md Aşama 1).
// Mantığın tamamı `src/lib/skills/package-publish.ts` çekirdeğindedir (birim testli); burası onu Supabase'e (RPC + Storage) bağlar. Çekirdeğin buradaki
// kopyası `../_shared/skills/` — `node scripts/sync-function-shared.mjs` üretir (elle düzenleme).
//
// GÜVENLİK — BU FONKSİYON SERVICE ROLE KULLANIR ve bu yüzden KÜÇÜK TUTULUR (`api`/`mcp` işlevlerine service role ASLA konmaz):
//  • Kimlik: JWT doğrulaması AÇIK (varsayılan) + `auth.getUser()` ile Auth sunucusuna doğrulatılır. Yayınlayan kullanıcı BUDUR; istek gövdesinde kullanıcı
//    kimliği yoktur. `skill_publish_begin/commit` yalnız service_role çalıştırabilir ve sahipliği kendileri yeniden denetler (`p_user`).
//  • Service role yalnız iki iş için: Skill'in çalışma dosyalarını okumak (`{skill}/draft/…`) ve paketi `{skill}/packages/…` yoluna yazmak. Yol sunucuda kurulur
//    (içerik adresli: sürüm + ZIP özetinin ilk 16 hanesi); istemci yol/boyut/özet veremez.
//  • Dosyalar ÇALIŞTIRILMAZ, yorumlanmaz; yalnız okunur, doğrulanır (zip slip, yürütülebilir imza, iç içe arşiv, gizli anahtar, UTF-8/JSON, sınırlar) ve paketlenir.
//    İstemcideki doğrulama yalnız ön kontroldür; kesin karar BURADADIR.
//  • Boyutlar TASLAK sınırlardır (src/lib/skills/limits.ts); Edge'in süre/bellek sınırı altındaki gerçek davranışı canlıda ÖLÇÜLMEDİ.
//
// Çağrı:  POST { skill_id, version, changelog, client_token, acknowledge_warnings }   (Authorization: Bearer <kullanıcı JWT'si>)
// Yanıt:  200 { ok: true, already, version: {…}, warnings: […] } | 4xx/5xx { error: <kod>, issues?: […] }
// Deploy: `supabase functions deploy skill-package`   (JWT doğrulaması AÇIK — `--no-verify-jwt` EKLEME; scripts/deploy-functions.sh)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "npm:fflate@0.8.2";
import { PublishError, publishSkillPackage, type BeginResult, type PublishDeps, type PublishedVersionRow } from "../_shared/skills/lib/skills/package-publish.ts";
import type { ZipSync } from "../_shared/skills/lib/skills/package-zip.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = "https://aliq0330.github.io/promptly";
const BUCKET = "skill-files";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Veritabanının bilerek fırlattığı kısa kodlar (`skill_*`) → HTTP durumu. Bilinmeyen hata ayrıntısı istemciye SIZDIRILMAZ. */
const DB_ERRORS: Record<string, number> = {
  skill_not_found: 404,
  skill_version_invalid: 400,
  skill_version_exists: 409,
  skill_version_not_newer: 409,
  skill_changelog_required: 400,
  skill_changelog_too_long: 400,
  skill_publish_rate_limit: 429,
  skill_package_missing: 409,
  skill_package_mismatch: 409,
  skill_package_invalid: 400,
};

function dbErrorCode(message: string): string | null {
  const found = Object.keys(DB_ERRORS).find((code) => message.includes(code));
  return found ?? null;
}

const FAILURE_STATUS: Record<string, number> = {
  package_invalid: 422,
  warnings_unacknowledged: 409,
  file_integrity: 409,
  file_missing: 409,
  skill_incomplete: 422,
  package_too_large: 413,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await asCaller.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const skillId = String(body.skill_id ?? "");
  const version = String(body.version ?? "");
  const changelog = String(body.changelog ?? "");
  const clientToken = String(body.client_token ?? "");
  if (!UUID.test(skillId) || !UUID.test(clientToken) || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || changelog.length > 2000) return json({ error: "bad_request" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const deps: PublishDeps = {
    async begin({ user, skillId: skill, version: v, changelog: notes, clientToken: token }) {
      const { data, error } = await admin.rpc("skill_publish_begin", { p_user: user, p_skill: skill, p_version: v, p_changelog: notes, p_client_token: token });
      if (error) throw new Error(error.message);
      return data as BeginResult;
    },
    async readFile(storagePath) {
      const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw new Error("download_failed");
      return new Uint8Array(await data.arrayBuffer());
    },
    async writePackage(path, bytes) {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/zip", upsert: false, cacheControl: "31536000" });
      // İçerik adresli yol: aynı yol zaten varsa içerik de aynıdır (önceki, tamamlanamamış bir denemenin çıktısı).
      if (error && !/already exists|duplicate|409/i.test(error.message + String((error as { statusCode?: string }).statusCode ?? ""))) throw new Error("upload_failed");
    },
    async commit(args) {
      const { data, error } = await admin.rpc("skill_publish_commit", {
        p_user: args.user,
        p_skill: args.skillId,
        p_version: args.version,
        p_changelog: args.changelog,
        p_client_token: args.clientToken,
        p_package_sha256: args.sha256,
        p_package_size: args.size,
        p_file_count: args.fileCount,
        p_manifest: args.manifest,
      });
      if (error) throw new Error(error.message);
      return data as PublishedVersionRow;
    },
    zipSync: zipSync as unknown as ZipSync,
    sourceUrl: (id) => `${SITE_URL}/skills/local?id=${id}`,
  };

  try {
    const outcome = await publishSkillPackage({ user: userId, skillId, version, changelog, clientToken, acknowledgeWarnings: body.acknowledge_warnings === true }, deps);
    return json({ ok: true, already: outcome.already, version: outcome.version, warnings: outcome.warnings });
  } catch (error) {
    if (error instanceof PublishError) return json({ error: error.code, issues: error.issues }, FAILURE_STATUS[error.code] ?? 422);
    const message = error instanceof Error ? error.message : String(error);
    const code = dbErrorCode(message);
    if (code) return json({ error: code }, DB_ERRORS[code]);
    console.error("skill-package", message);
    return json({ error: "publish_failed" }, 500);
  }
});
