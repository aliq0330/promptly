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
  { name: "space_connections (pano okları, docs/history/262-*)", get: () => `space_connections?select=${encodeURIComponent("id,space_id,from_item_id,to_item_id,label,line_style,arrow,route,color,source_workflow_id,source_role")}&limit=1` },
  { name: "space_items kaynak sütunları (workflow'dan aktarılan nesneler, docs/history/262-*)", get: () => `space_items?select=${encodeURIComponent("id,source_workflow_id,source_step_id,source_role,source_step_no")}&limit=1` },
  { name: "prompt_comments (puan + etkinlik yorumu)", get: () => `prompt_comments?select=${encodeURIComponent("id,rating,space_activity_id")}&limit=1` },
  { name: "prompt_comments medya + içerik eki (docs/history/308-*)", get: () => `prompt_comments?select=${encodeURIComponent("id,media_kind,media_ref,media_width,media_height,attach_type,attach_id")}&limit=1` },
  { name: "prompt_likes tepki sütunu + hedef (docs/history/265-*)", get: () => `prompt_likes?select=${encodeURIComponent("id,reaction,target_id")}&limit=1` },
  { name: "reaction_stats (hedef başına tepki sayıları, docs/history/265-*)", get: () => `reaction_stats?select=${encodeURIComponent("target_id,reaction,n")}&limit=1` },
  { name: "rpc reaction_friends (takip ettiklerimden kim tepki verdi, docs/history/265-*)", rpc: "reaction_friends", body: { p_ids: [], p_per: 2 } },
  { name: "rpc profile_results + profile_result_count (profildeki Sonuçlar, yetim sonuçlar, docs/history/282-*, 283-*)", rpc: "profile_results", body: { p_creator: "00000000-0000-4000-8000-000000000000", p_limit: 1, p_offset: 0 } },
  { name: "rpc profile_result_count", rpc: "profile_result_count", body: { p_creator: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc feed_page", rpc: "feed_page", body: feedArgs },
  { name: "rpc feed_page p_has_media (Odak Medya süzgeci sunucuda, docs/history/254-*)", rpc: "feed_page", body: { ...feedArgs, p_open_only: false, p_tag: null, p_tool: null, p_authors: null, p_tags: null, p_tools: null, p_has_media: true } },
  { name: "rpc profile_content_stats (profil sayıları, docs/history/254-*)", rpc: "profile_content_stats", body: { p_user: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc group_unread_counts (grup okunmamış sayısı okuma anında, docs/history/258-*; yalnız oturumlu)", rpc: "group_unread_counts", body: { p_ids: [] }, deniedOk: true, soft: true },
  { name: "rpc feed_page_proven (Keşfet → Kanıtlanmış sıralaması, docs/history/307-*)", rpc: "feed_page_proven", body: { p_limit: 1 } },
  { name: "rpc discover_tool_counts", rpc: "discover_tool_counts", body: {} },
  // Yalnız oturumlu kullanıcıya açık RPC (docs/history/250-*): ziyaretçiye 401/403 dönmesi "var ama kapalı" demektir; 404 "yok" demektir ve boru hattını durdurur.
  { name: "rpc dispatch_my_weekly_digest (haftalık özet bildirimi, docs/history/307-*; yalnız oturumlu, ziyaretçiye kapalı)", rpc: "dispatch_my_weekly_digest", body: {}, deniedOk: true, soft: true },
  { name: "rpc import_workflows (workflow içe aktarma, docs/history/307-*; yalnız oturumlu, ziyaretçiye kapalı)", rpc: "import_workflows", body: { p_items: [], p_dry_run: true }, deniedOk: true, soft: true },
  { name: "rpc import_content (istek / hazır ayar içe aktarma; yalnız oturumlu, ziyaretçiye kapalı)", rpc: "import_content", body: { p_kind: "request", p_items: [], p_dry_run: true }, deniedOk: true, soft: true },
  { name: "rpc import_prompts (yalnız oturumlu; ziyaretçiye kapalı)", rpc: "import_prompts", body: { p_items: [], p_dry_run: true }, deniedOk: true, soft: true },
  { name: "rpc admin_import_prompts (yalnız oturumlu moderatör; ziyaretçiye kapalı)", rpc: "admin_import_prompts", body: { p_items: [], p_dry_run: true }, deniedOk: true, soft: true },
  { name: "rpc admin_bulk_delete_prompts (yalnız oturumlu moderatör; ziyaretçiye kapalı)", rpc: "admin_bulk_delete_prompts", body: { p_ids: [] }, deniedOk: true, soft: true },
  { name: "rpc admin_bulk_delete_prompts p_force (docs/history/252-*)", rpc: "admin_bulk_delete_prompts", body: { p_ids: [], p_force: true }, deniedOk: true, soft: true },
  { name: "rpc admin_bulk_delete_impact (docs/history/252-*)", rpc: "admin_bulk_delete_impact", body: { p_ids: [] }, deniedOk: true, soft: true },
  { name: "rpc admin_template_variables_candidates (docs/history/253-*)", rpc: "admin_template_variables_candidates", body: { p_scope: "own", p_limit: 1 }, deniedOk: true, soft: true },
  { name: "rpc admin_convert_template_variables (docs/history/253-*)", rpc: "admin_convert_template_variables", body: { p_ids: [], p_scope: "own" }, deniedOk: true, soft: true },
  { name: "rpc admin_bulk_set_prompt_taxonomy (docs/history/260-*)", rpc: "admin_bulk_set_prompt_taxonomy", body: { p_items: [], p_overwrite: false }, deniedOk: true, soft: true },
  { name: "rpc chat_shared_stats (paylaşılan medya/içerik/bağlantı sayıları, docs/history/271-*; yalnız oturumlu)", rpc: "chat_shared_stats", body: { p_conversation_id: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
  { name: "rpc chat_shared_items (docs/history/271-*)", rpc: "chat_shared_items", body: { p_conversation_id: "00000000-0000-4000-8000-000000000000", p_kind: "photos", p_limit: 1 }, deniedOk: true, soft: true },
  { name: "rpc set_content_interest (İlgimi çekiyor / çekmiyor, docs/history/275-*; yalnız oturumlu)", rpc: "set_content_interest", body: { p_kind: "prompt", p_id: "00000000-0000-4000-8000-000000000000", p_value: null }, deniedOk: true, soft: true },
  { name: "content_interest (kişinin kendi cevapları; ziyaretçiye kapalı, docs/history/275-*)", get: () => `content_interest?select=${encodeURIComponent("id,prompt_id,request_id,workflow_id,preset_id,value")}&limit=1`, deniedOk: true, soft: true },
  { name: "rpc suggest_creators (Takip edilecek kişiler şeridi, docs/history/285-*; yalnız oturumlu)", rpc: "suggest_creators", body: { p_limit: 1 }, deniedOk: true, soft: true },
  { name: "rpc dismiss_creator_suggestion (docs/history/285-*; yalnız oturumlu)", rpc: "dismiss_creator_suggestion", body: { p_creator: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
  { name: "creator_suggestion_dismissals (kişinin kendi kapatmaları; ziyaretçiye kapalı, docs/history/285-*)", get: () => `creator_suggestion_dismissals?select=${encodeURIComponent("creator_id")}&limit=1`, deniedOk: true, soft: true },
  { name: "rpc submit_report (merkezi şikâyet, docs/history/284-*; yalnız oturumlu)", rpc: "submit_report", body: { p_target_type: "prompt", p_target_id: "00000000-0000-4000-8000-000000000000", p_reason_code: "spam", p_details: null }, deniedOk: true, soft: true },
  { name: "rpc moderation_report_queue 2 argümanlı (neden kodu + ayrıntı, docs/history/284-*; yalnız moderatör)", rpc: "moderation_report_queue", body: { p_status: "open", p_reason: "all" }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_summary (Yaratıcı paneli, docs/history/294-*; yalnız oturumlu)", rpc: "creator_insights_summary", body: { p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_daily (docs/history/294-*)", rpc: "creator_insights_daily", body: { p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_top (docs/history/294-*)", rpc: "creator_insights_top", body: { p_days: 30, p_limit: 5 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_reaction_mix (docs/history/294-*)", rpc: "creator_insights_reaction_mix", body: { p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_results (Yaratıcı paneli sonuç sayacı, docs/history/295-*)", rpc: "creator_insights_results", body: { p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_prompt (prompt başına ayrıntı, docs/history/295-*)", rpc: "creator_insights_prompt", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_prompt_daily (docs/history/295-*)", rpc: "creator_insights_prompt_daily", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_prompt_reaction_mix (docs/history/295-*)", rpc: "creator_insights_prompt_reaction_mix", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_api (Yaratıcı paneli API / MCP kullanımı, docs/history/304-*; yalnız oturumlu)", rpc: "creator_insights_api", body: { p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc creator_insights_prompt_api (docs/history/304-*)", rpc: "creator_insights_prompt_api", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_days: 30 }, deniedOk: true, soft: true },
  { name: "rpc prompt_works_state (Çalıştı mı? oyu sayıları; ziyaretçiye de açık, docs/history/296-*)", rpc: "prompt_works_state", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc set_prompt_works (Çalıştı mı? oyu; yalnız oturumlu)", rpc: "set_prompt_works", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_works: null }, deniedOk: true, soft: true },
  { name: "prompt_works_stats (prompt başına evet/hayır sayıları, docs/history/296-*)", get: () => `prompt_works_stats?select=${encodeURIComponent("prompt_id,yes_count,no_count")}&limit=1` },
  { name: "profiles.suspended_reason ziyaretçiye KAPALI olmalı (moderasyon gerekçesi, docs/history/302-*)", get: () => `profiles?select=suspended_reason&limit=1`, mustBeDenied: true },
  { name: "rpc public_api_rate_hit sırsız REDDEDİLMELİ (hız sınırı sayacı, docs/history/302-*)", rpc: "public_api_rate_hit", body: { p_secret: "smoke-test-wrong-secret", p_bucket: "smoke-test-00000000", p_limit: 1, p_window_seconds: 60 }, mustBeDenied: true },
  { name: "rpc record_public_api_prompt_use sırsız REDDEDİLMELİ (API/MCP kullanım sayacı, docs/history/304-*)", rpc: "record_public_api_prompt_use", body: { p_secret: "smoke-test-wrong-secret", p_prompt_id: "00000000-0000-4000-8000-000000000000", p_source: "api", p_client: "smoke-test-00000000" }, mustBeDenied: true },
  { name: "rpc common_communities (ortak topluluklar, docs/history/271-*)", rpc: "common_communities", body: { p_user: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
];

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
let failed = 0;
for (const check of CHECKS) {
  try {
    const response = check.rpc
      ? await fetch(`${url}/rest/v1/rpc/${check.rpc}`, { method: "POST", headers, body: JSON.stringify(check.body) })
      : await fetch(`${url}/rest/v1/${check.get()}`, { headers });
    if (check.mustBeDenied) {
      // Tersine denetim: istek REDDEDİLMELİ (401/403); 200 dönerse sertleştirme canlıda yok demektir.
      if (response.status === 401 || response.status === 403) console.log(`✓ ${check.name}`);
      else {
        failed += 1;
        console.error(`✗ ${check.name}: ${response.status} (reddedilmeliydi)`);
      }
      continue;
    }
    if (!response.ok && !(check.deniedOk && (response.status === 401 || response.status === 403))) {
      // `soft`: yalnız oturumlu çağrılabilen RPC'lerin ziyaretçi anahtarıyla nasıl yanıt verdiği (401/403 mü 404 mü) canlıda doğrulanmadı;
      // bu yüzden uyarı verir ama yayını DURDURMAZ (özellik site açılışında değil, bir eylemde kullanılır).
      if (check.soft) {
        console.warn(`::warning::${check.name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
        continue;
      }
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
