#!/usr/bin/env node
// Yayın öncesi duman testi (docs/history/226-*): istemcinin SİTE AÇILIRKEN ve her akışta yaptığı sorgular, canlı şemaya karşı çalışır.
// Migration uygulandıktan sonra, site derlenmeden ÖNCE koşar; bir sorgu hata verirse boru hattı durur ve site yayınlanmaz.
// (İstemci ile veritabanı arasındaki "sütun/RPC yok" uyuşmazlığını yayından önce yakalar.)
//
// Ortam: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (derlemede kullanılanlarla aynı, herkese açık anahtar).
// Yeni bir tablo/sütun/RPC'yi istemci ZORUNLU kullanmaya başladığında CHECKS'e satır ekle; istemci `PROFILE_SELECT`i kendi kaynağından okunur.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("::error::NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil.");
  process.exit(1);
}

/** `export const PROFILE_SELECT = "…";` — istemcinin gerçekten seçtiği sütun listesi (kopyası değil, kaynağı). */
function profileSelect() {
  const source = readFileSync(join(root, "src", "lib", "supabase", "profiles.ts"), "utf8");
  const match = /export const PROFILE_SELECT\s*=\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("PROFILE_SELECT src/lib/supabase/profiles.ts içinde bulunamadı.");
  return match[1];
}

const feedArgs = {
  p_scope: "all", p_order: "newest", p_kinds: null, p_content_type: null, p_category: null, p_subcategory: null,
  p_limit: 1, p_after_rank: null, p_after_created_at: null, p_after_id: null,
};

const CHECKS = [
  { name: "profiles (istemcinin PROFILE_SELECT'i)", get: () => `profiles?select=${encodeURIComponent(profileSelect())}&limit=1` },
  { name: "prompts + yazar + medya", get: () => `prompts?select=${encodeURIComponent("id,title,like_count,copy_count,community_id,profiles:author_id(id,username,is_demo),prompt_media(id,dominant_color)")}&limit=1` },
  { name: "prompt_requests", get: () => `prompt_requests?select=${encodeURIComponent("id,title,status,community_id")}&limit=1` },
  { name: "workflows", get: () => `workflows?select=${encodeURIComponent("id,title,community_id")}&limit=1` },
  { name: "presets", get: () => `presets?select=${encodeURIComponent("id,title,community_id")}&limit=1` },
  { name: "notifications (RLS: ziyaretçiye boş, tablo/sütun var)", get: () => `notifications?select=${encodeURIComponent("id,is_read,created_at")}&limit=1` },
  { name: "spaces (puan + etkinlik görünürlüğü, docs/history/242-*)", get: () => `spaces?select=${encodeURIComponent("id,quote_count,rating_avg,rating_count,comment_count,activity_visibility")}&limit=1` },
  { name: "space_activity (önce/sonra ayrıntısı, not, yorum sayacı)", get: () => `space_activity?select=${encodeURIComponent("id,details,author_note,comment_count")}&limit=1` },
  { name: "prompt_comments (puan + etkinlik yorumu)", get: () => `prompt_comments?select=${encodeURIComponent("id,rating,space_activity_id")}&limit=1` },
  { name: "rpc feed_page", rpc: "feed_page", body: feedArgs },
  { name: "rpc discover_tool_counts", rpc: "discover_tool_counts", body: {} },
  // Yalnız oturumlu kullanıcıya açık RPC (docs/history/250-*): ziyaretçiye 401/403 dönmesi "var ama kapalı" demektir; 404 "yok" demektir ve boru hattını durdurur.
  { name: "rpc import_prompts (yalnız oturumlu; ziyaretçiye kapalı)", rpc: "import_prompts", body: { p_items: [], p_dry_run: true }, deniedOk: true },
  { name: "rpc admin_import_prompts (yalnız oturumlu moderatör; ziyaretçiye kapalı)", rpc: "admin_import_prompts", body: { p_items: [], p_dry_run: true }, deniedOk: true },
];

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
let failed = 0;
for (const check of CHECKS) {
  try {
    const response = check.rpc
      ? await fetch(`${url}/rest/v1/rpc/${check.rpc}`, { method: "POST", headers, body: JSON.stringify(check.body) })
      : await fetch(`${url}/rest/v1/${check.get()}`, { headers });
    if (!response.ok && !(check.deniedOk && (response.status === 401 || response.status === 403))) {
      failed += 1;
      console.error(`✗ ${check.name}: ${response.status} ${(await response.text()).slice(0, 300)}`);
    } else {
      console.log(`✓ ${check.name}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`✗ ${check.name}: ${error.message}`);
  }
}
if (failed > 0) {
  console.error(`::error::Duman testi başarısız (${failed}/${CHECKS.length}): istemci canlı şemayla uyumsuz — site yayınlanmadı.`);
  process.exit(1);
}
console.log(`Duman testi temiz (${CHECKS.length}/${CHECKS.length}).`);
