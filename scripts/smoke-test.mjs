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
  { name: "space_connections (pano okları, docs/history/262-*)", get: () => `space_connections?select=${encodeURIComponent("id,space_id,from_item_id,to_item_id,label,line_style,arrow,route,color,source_workflow_id,source_role")}&limit=1` },
  { name: "space_items kaynak sütunları (workflow'dan aktarılan nesneler, docs/history/262-*)", get: () => `space_items?select=${encodeURIComponent("id,source_workflow_id,source_step_id,source_role,source_step_no")}&limit=1` },
  { name: "rpc workflow_space_links (workflow sayfasındaki Space önizlemesi, ziyaretçiye de açık, docs/history/339-*)", rpc: "workflow_space_links", body: { p_workflow_id: "00000000-0000-4000-8000-000000000000" } },
  { name: "messages.room_id + community_rooms (sohbet odaları, docs/history/352-*)", get: () => `messages?select=${encodeURIComponent("id,room_id")}&limit=1` },
  { name: "community_rooms ziyaretçiye KAPALI olmalı (odalar yalnız üyeye görünür, docs/history/352-*)", get: () => `community_rooms?select=${encodeURIComponent("id,community_id,name")}&limit=1`, mustBeDenied: true },
  { name: "rpc my_room_pins ziyaretçiye KAPALI olmalı (oda sabitleme, docs/history/381-*)", rpc: "my_room_pins", body: { p_community_id: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "calls ziyaretçiye KAPALI olmalı (1-1 arama geçmişi yalnız arayan/aranan, docs/history/449-*)", get: () => `calls?select=${encodeURIComponent("id,caller_id,callee_id,status")}&limit=1`, mustBeDenied: true },
  { name: "rpc call_start ziyaretçiye KAPALI olmalı (1-1 arama, docs/history/449-*)", rpc: "call_start", body: { p_conversation_id: "00000000-0000-4000-8000-000000000000", p_type: "audio" }, mustBeDenied: true },
  { name: "rpc comment_history ziyaretçiye açık (yorum düzenleme geçmişi, docs/history/452-*)", rpc: "comment_history", body: { p_comment_id: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc set_comment_subscription ziyaretçiye KAPALI olmalı (yorum takibi, docs/history/452-*)", rpc: "set_comment_subscription", body: { p_kind: "prompt", p_target: "00000000-0000-4000-8000-000000000000", p_comment: null, p_on: true }, mustBeDenied: true },
  { name: "rpc my_comment_subscriptions ziyaretçiye KAPALI olmalı (yorum takibi listesi, docs/history/452-*)", rpc: "my_comment_subscriptions", body: {}, mustBeDenied: true },
  { name: "rpc get_my_call_settings ziyaretçiye KAPALI olmalı (arama ayarları, docs/history/450-*)", rpc: "get_my_call_settings", body: {}, mustBeDenied: true },
  { name: "rpc set_my_call_settings ziyaretçiye KAPALI olmalı (arama ayarları, docs/history/450-*)", rpc: "set_my_call_settings", body: { p_privacy: "everyone", p_notify_missed: true }, mustBeDenied: true },
  { name: "call_settings ziyaretçiye KAPALI olmalı (docs/history/450-*)", get: () => `call_settings?select=${encodeURIComponent("user_id,privacy")}&limit=1`, mustBeDenied: true },
  { name: "rpc community_rooms_overview ziyaretçiye KAPALI olmalı (docs/history/352-*)", rpc: "community_rooms_overview", body: { p_community_id: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc create_community_room ziyaretçiye KAPALI olmalı (docs/history/352-*)", rpc: "create_community_room", body: { p_community_id: "00000000-0000-4000-8000-000000000000", p_name: "x" }, mustBeDenied: true },
  { name: "rpc space_apply_workflow_plan ziyaretçiye KAPALI olmalı (workflow'u panoya tek işlemde yazar, docs/history/339-*)", rpc: "space_apply_workflow_plan", body: { p_space_id: "00000000-0000-4000-8000-000000000000", p_group: null, p_items: [], p_connections: [] }, mustBeDenied: true },
  { name: "space_items onay sütunları (ekip kütüphanesi, docs/history/348-*)", get: () => `space_items?select=${encodeURIComponent("id,approved_at,approved_by")}&limit=1` },
  { name: "space_items inceleme sütunları (Onaya gönder, docs/history/349-*)", get: () => `space_items?select=${encodeURIComponent("id,review_requested_at,review_requested_by")}&limit=1` },
  { name: "prompt_comments medya + içerik eki (docs/history/308-*)", get: () => `prompt_comments?select=${encodeURIComponent("id,media_kind,media_ref,media_width,media_height,attach_type,attach_id")}&limit=1` },
  { name: "prompt_likes tepki sütunu + hedef (docs/history/265-*)", get: () => `prompt_likes?select=${encodeURIComponent("id,reaction,target_id")}&limit=1` },
  { name: "reaction_stats (hedef başına tepki sayıları, docs/history/265-*)", get: () => `reaction_stats?select=${encodeURIComponent("target_id,reaction,n")}&limit=1` },
  { name: "rpc reaction_friends (takip ettiklerimden kim tepki verdi, docs/history/265-*)", rpc: "reaction_friends", body: { p_ids: [], p_per: 2 } },
  { name: "rpc comment_reaction_counts + comment_reaction_friends (yorum tepki sayıları, docs/history/327-*)", rpc: "comment_reaction_counts", body: { p_ids: [] } },
  { name: "rpc comment_reaction_friends (yorumda takip ettiklerimden kim tepki verdi, docs/history/327-*)", rpc: "comment_reaction_friends", body: { p_ids: [], p_per: 2 } },
  { name: "rpc profile_results + profile_result_count (profildeki Sonuçlar, yetim sonuçlar, docs/history/282-*, 283-*)", rpc: "profile_results", body: { p_creator: "00000000-0000-4000-8000-000000000000", p_limit: 1, p_offset: 0 } },
  { name: "rpc profile_result_count", rpc: "profile_result_count", body: { p_creator: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc feed_page", rpc: "feed_page", body: feedArgs },
  { name: "rpc feed_page p_has_media (Odak Medya süzgeci sunucuda, docs/history/254-*)", rpc: "feed_page", body: { ...feedArgs, p_open_only: false, p_tag: null, p_tool: null, p_authors: null, p_tags: null, p_tools: null, p_has_media: true } },
  { name: "rpc profile_content_stats (profil sayıları, docs/history/254-*)", rpc: "profile_content_stats", body: { p_user: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc group_unread_counts (grup okunmamış sayısı okuma anında, docs/history/258-*; yalnız oturumlu)", rpc: "group_unread_counts", body: { p_ids: [] }, deniedOk: true, soft: true },
  { name: "rpc feed_page_proven (Keşfet → Kanıtlanmış sıralaması, docs/history/307-*)", rpc: "feed_page_proven", body: { p_limit: 1 } },
  { name: "rpc discover_tool_counts", rpc: "discover_tool_counts", body: {} },
  // Ortak koleksiyon (docs/history/386-*): yeni sütunlar + ziyaretçiye açık okuma RPC'leri + yalnız oturumlu yazma RPC'leri.
  { name: "collections ortak sütunları (docs/history/386-*)", get: () => `collections?select=${encodeURIComponent("id,is_shared,member_count")}&limit=1` },
  { name: "collection_items.added_by (ekleyen, docs/history/386-*)", get: () => `collection_items?select=${encodeURIComponent("id,added_by")}&limit=1` },
  { name: "collection_members (yalnız kendi satırım okunur; ziyaretçide boş, docs/history/386-*)", get: () => `collection_members?select=${encodeURIComponent("collection_id,user_id")}&limit=1` },
  { name: "rpc collection_members_list (ortak listesi; herkese açık koleksiyonda ziyaretçi de okur, docs/history/386-*)", rpc: "collection_members_list", body: { p_collection: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc profile_collections (profildeki ortak koleksiyonlar; ziyaretçi de okur, docs/history/386-*)", rpc: "profile_collections", body: { p_user: "00000000-0000-4000-8000-000000000000", p_limit: 1, p_offset: 0 } },
  { name: "rpc set_collection_shared ziyaretçiye KAPALI olmalı (docs/history/386-*)", rpc: "set_collection_shared", body: { p_collection: "00000000-0000-4000-8000-000000000000", p_shared: true }, mustBeDenied: true },
  { name: "rpc invite_collection_member ziyaretçiye KAPALI olmalı (docs/history/386-*)", rpc: "invite_collection_member", body: { p_collection: "00000000-0000-4000-8000-000000000000", p_username: "x" }, mustBeDenied: true },
  { name: "rpc my_collection_invitations ziyaretçiye KAPALI olmalı (docs/history/386-*)", rpc: "my_collection_invitations", body: {}, mustBeDenied: true },
  { name: "rpc remove_collection_member ziyaretçiye KAPALI olmalı (docs/history/386-*)", rpc: "remove_collection_member", body: { p_collection: "00000000-0000-4000-8000-000000000000", p_user: "00000000-0000-4000-8000-000000000000", p_remove_items: false }, mustBeDenied: true },
  { name: "rpc unsave_content (Kaydedilenlerden kaldır, docs/history/336-*; yalnız oturumlu)", rpc: "unsave_content", body: { p_type: "prompt", p_id: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
  // Yalnız oturumlu kullanıcıya açık RPC (docs/history/250-*): ziyaretçiye 401/403 dönmesi "var ama kapalı" demektir; 404 "yok" demektir ve boru hattını durdurur.
  // Bildirim merkezi (docs/history/326-*): yalnız oturumlu RPC'ler (ziyaretçiye 401/403 = "var ama kapalı"; 404 = "yok" ve boru hattını durdurur).
  { name: "rpc notifications_grouped_page (gruplu bildirim kartları, docs/history/326-*; yalnız oturumlu)", rpc: "notifications_grouped_page", body: { p_limit: 1, p_before_at: null, p_before_key: null, p_category: null, p_unread_only: false, p_snoozed_only: false }, deniedOk: true, soft: true },
  { name: "rpc notifications_unread_group_count (zil rozeti)", rpc: "notifications_unread_group_count", body: {}, deniedOk: true, soft: true },
  { name: "rpc notifications_unread_by_category (kategori menüsü sayıları)", rpc: "notifications_unread_by_category", body: {}, deniedOk: true, soft: true },
  { name: "rpc notifications_snooze_summary", rpc: "notifications_snooze_summary", body: {}, deniedOk: true, soft: true },
  { name: "rpc set_notification_mute (sessize al; yalnız oturumlu)", rpc: "set_notification_mute", body: { p_kind: "content", p_target: "/x", p_label: "", p_on: false }, deniedOk: true, soft: true },
  { name: "rpc set_notification_type_pref (tür kapat; yalnız oturumlu)", rpc: "set_notification_type_pref", body: { p_key: "comments", p_enabled: true }, deniedOk: true, soft: true },
  { name: "notification_mutes + notification_type_prefs tabloları (RLS: ziyaretçiye boş/kapalı)", get: () => `notification_mutes?select=${encodeURIComponent("kind,target,label,created_at")}&limit=1`, deniedOk: true, soft: true },
  { name: "comment_likes tepki sütunu (docs/history/326-*)", get: () => `comment_likes?select=${encodeURIComponent("comment_id,reaction")}&limit=1` },
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
  { name: "rpc prompt_works_for_users (yorum/sonuç rozeti için yazarın oyu; ziyaretçiye de açık, docs/history/341-*)", rpc: "prompt_works_for_users", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_user_ids: ["00000000-0000-4000-8000-000000000001"] } },
  { name: "rpc set_prompt_works (Çalıştı mı? oyu; yalnız oturumlu)", rpc: "set_prompt_works", body: { p_prompt_id: "00000000-0000-4000-8000-000000000000", p_works: null }, deniedOk: true, soft: true },
  { name: "prompt_works_stats (prompt başına evet/hayır sayıları, docs/history/296-*)", get: () => `prompt_works_stats?select=${encodeURIComponent("prompt_id,yes_count,no_count")}&limit=1` },
  { name: "rpc my_teams (Ekipler, docs/history/353-*; yalnız oturumlu)", rpc: "my_teams", body: { p_limit: 1, p_offset: 0 }, deniedOk: true, soft: true },
  { name: "rpc my_teams_preview (Ekipler kartı, docs/history/355-*; yalnız oturumlu)", rpc: "my_teams_preview", body: { p_ids: [] }, deniedOk: true, soft: true },
  { name: "rpc team_list_channels (ekip kanalları; yalnız oturumlu)", rpc: "team_list_channels", body: { p_team: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
  { name: "rpc preview_team_link (davet bağlantısı; yalnız oturumlu)", rpc: "preview_team_link", body: { p_token: "x" }, deniedOk: true, soft: true },
  { name: "rpc team_report_message (ekip kanalı mesajı şikâyeti; yalnız oturumlu)", rpc: "team_report_message", body: { p_message: "00000000-0000-4000-8000-000000000000", p_reason_code: "spam" }, deniedOk: true, soft: true },
  { name: "spaces.team_id (ekibe bağlı Space, docs/history/353-*)", get: () => `spaces?select=id,team_id&limit=1` },
  { name: "rpc team_create_project_channel ziyaretçiye KAPALI olmalı (docs/history/360-*)", rpc: "team_create_project_channel", body: { p_space: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_my_space_levels ziyaretçiye KAPALI olmalı (proje seviyelerim, docs/history/360-*)", rpc: "team_my_space_levels", body: { p_team: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_create_space 7 argümanlı imza ziyaretçiye KAPALI olmalı (Space + kanal, docs/history/360-*)", rpc: "team_create_space", body: { p_team: "00000000-0000-4000-8000-000000000000", p_title: "x", p_description: "", p_kind: "free", p_groups: [], p_mode: "all", p_channel: true }, mustBeDenied: true },
  { name: "space_items.rev_state (ekip projesi onay durumu, docs/history/362-*)", get: () => `space_items?select=${encodeURIComponent("id,rev_state")}&limit=1` },
  { name: "rpc team_projects_list ziyaretçiye KAPALI olmalı (ekip projeleri, docs/history/362-*)", rpc: "team_projects_list", body: { p_team: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc pin_comment_create ziyaretçiye KAPALI olmalı (ekip panosu yorumu, docs/history/367-*)", rpc: "pin_comment_create", body: { p_space: "00000000-0000-4000-8000-000000000000", p_body: "x", p_x: 0, p_y: 0 }, mustBeDenied: true },
  { name: "rpc team_board_place_items ziyaretçiye KAPALI olmalı (dosyadaki öğeyi panoya yerleştirir, docs/history/376-*)", rpc: "team_board_place_items", body: { p_board: "00000000-0000-4000-8000-000000000000", p_items: ["00000000-0000-4000-8000-000000000000"] }, mustBeDenied: true },
  { name: "rpc team_item_delete ziyaretçiye KAPALI olmalı (dosyadan sil, docs/history/376-*)", rpc: "team_item_delete", body: { p_item: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_attach_content ziyaretçiye KAPALI olmalı (içeriği dosyaya/panoya ekle, docs/history/376-*)", rpc: "team_attach_content", body: { p_file: "00000000-0000-4000-8000-000000000000", p_type: "prompt", p_id: "00000000-0000-4000-8000-000000000000", p_board: null }, mustBeDenied: true },
  { name: "space_items.file_item_id (pano yansıması, docs/history/376-*)", get: () => `space_items?select=${encodeURIComponent("id,file_item_id")}&limit=1` },
  { name: "ekibe özgü içerik sütunu team_file_id (docs/history/376-*)", get: () => `prompts?select=${encodeURIComponent("id,team_file_id")}&limit=1` },
  { name: "rpc search_content yeni imza: yazar hariç (ekip dosyası seçicisi, docs/history/376-*)", rpc: "search_content", body: { p_kind: "prompt", p_query: null, p_sort: "new", p_author_ids: null, p_content_types: null, p_content_type: null, p_category: null, p_subcategory: null, p_tag_slugs: null, p_tool_refs: null, p_limit: 1, p_after_rank: null, p_after_created_at: null, p_after_id: null, p_exclude_author_ids: [] } },
  { name: "rpc team_transfer_items ziyaretçiye KAPALI olmalı (panoya taşı/kopyala, docs/history/367-*)", rpc: "team_transfer_items", body: { p_from: "00000000-0000-4000-8000-000000000000", p_to: "00000000-0000-4000-8000-000000000000", p_ids: [], p_copy: false }, mustBeDenied: true },
  { name: "rpc team_reorder_boards ziyaretçiye KAPALI olmalı (pano sırası, docs/history/367-*)", rpc: "team_reorder_boards", body: { p_project: "00000000-0000-4000-8000-000000000000", p_file: null, p_ids: [] }, mustBeDenied: true },
  { name: "rpc team_create_board_in_group ziyaretçiye KAPALI olmalı (pano grubu, docs/history/368-*)", rpc: "team_create_board_in_group", body: { p_from: "00000000-0000-4000-8000-000000000000", p_title: "x" }, mustBeDenied: true },
  { name: "rpc team_rename_board_group ziyaretçiye KAPALI olmalı (pano grubu, docs/history/368-*)", rpc: "team_rename_board_group", body: { p_group: "00000000-0000-4000-8000-000000000000", p_title: "x" }, mustBeDenied: true },
  { name: "rpc team_channels_overview ziyaretçiye KAPALI olmalı (ekip kanalları + proje kanalları, docs/history/369-*)", rpc: "team_channels_overview", body: { p_team: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_add_project_channel ziyaretçiye KAPALI olmalı (proje/dosya kanalı, docs/history/369-*)", rpc: "team_add_project_channel", body: { p_project: "00000000-0000-4000-8000-000000000000", p_name: "x", p_description: "", p_file: null, p_posting: "members", p_notify: "mentions" }, mustBeDenied: true },
  { name: "rpc team_set_mute ziyaretçiye KAPALI olmalı (ekip/proje sessize alma, docs/history/369-*)", rpc: "team_set_mute", body: { p_team: "00000000-0000-4000-8000-000000000000", p_project: null, p_muted: true }, mustBeDenied: true },
  { name: "rpc team_my_mutes ziyaretçiye KAPALI olmalı (sessizlik satırlarım, docs/history/369-*)", rpc: "team_my_mutes", body: {}, mustBeDenied: true },
  { name: "space_items.data (çizim öğeleri, docs/history/367-*)", get: () => `space_items?select=${encodeURIComponent("id,data")}&limit=1` },
  { name: "rpc team_project_get ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_project_get", body: { p_project: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_create_project ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_create_project", body: { p_team: "00000000-0000-4000-8000-000000000000", p_title: "x" }, mustBeDenied: true },
  { name: "rpc team_review_submit ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_review_submit", body: { p_item_ids: ["00000000-0000-4000-8000-000000000000"] }, mustBeDenied: true },
  { name: "rpc team_review_decide ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_review_decide", body: { p_item_ids: ["00000000-0000-4000-8000-000000000000"], p_decision: "approve", p_note: "" }, mustBeDenied: true },
  { name: "rpc team_review_pending ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_review_pending", body: { p_project: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_project_todos ziyaretçiye KAPALI olmalı (docs/history/362-*)", rpc: "team_project_todos", body: {}, mustBeDenied: true },
  { name: "rpc team_review_board ziyaretçiye KAPALI olmalı (docs/history/366-*)", rpc: "team_review_board", body: { p_team: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc team_recent_activity ziyaretçiye KAPALI olmalı (docs/history/366-*)", rpc: "team_recent_activity", body: { p_team: "00000000-0000-4000-8000-000000000000", p_limit: 5 }, mustBeDenied: true },
  { name: "rpc team_member_project_roles ziyaretçiye KAPALI olmalı (docs/history/366-*)", rpc: "team_member_project_roles", body: { p_team: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "profiles.suspended_reason ziyaretçiye KAPALI olmalı (moderasyon gerekçesi, docs/history/302-*)", get: () => `profiles?select=suspended_reason&limit=1`, mustBeDenied: true },
  { name: "rpc public_api_rate_hit sırsız REDDEDİLMELİ (hız sınırı sayacı, docs/history/302-*)", rpc: "public_api_rate_hit", body: { p_secret: "smoke-test-wrong-secret", p_bucket: "smoke-test-00000000", p_limit: 1, p_window_seconds: 60 }, mustBeDenied: true },
  { name: "rpc record_public_api_prompt_use sırsız REDDEDİLMELİ (API/MCP kullanım sayacı, docs/history/304-*)", rpc: "record_public_api_prompt_use", body: { p_secret: "smoke-test-wrong-secret", p_prompt_id: "00000000-0000-4000-8000-000000000000", p_source: "api", p_client: "smoke-test-00000000" }, mustBeDenied: true },
  { name: "rpc list_my_api_tokens (Ayarlar → Geliştirici anahtarları, docs/history/314-*; yalnız oturumlu)", rpc: "list_my_api_tokens", body: {}, deniedOk: true, soft: true },
  { name: "api_tokens ziyaretçiye KAPALI olmalı (anahtar özetleri, docs/history/314-*)", get: () => `api_tokens?select=id&limit=1`, mustBeDenied: true },
  { name: "rpc _api_token_authenticate ziyaretçiye KAPALI olmalı (yalnız Edge Function'ın sahip-rol bağlantısı, docs/history/314-*)", rpc: "_api_token_authenticate", body: { p_token: "pmt_" + "A".repeat(43) }, mustBeDenied: true },
  { name: "rpc list_my_oauth_grants (Ayarlar → Bağlı uygulamalar, docs/history/317-*; yalnız oturumlu)", rpc: "list_my_oauth_grants", body: {}, deniedOk: true, soft: true },
  { name: "rpc oauth_request_info (onay sayfası, docs/history/317-*; yalnız oturumlu)", rpc: "oauth_request_info", body: { p_request: "x" }, deniedOk: true, soft: true },
  { name: "oauth_clients ziyaretçiye KAPALI olmalı (docs/history/317-*)", get: () => `oauth_clients?select=id&limit=1`, mustBeDenied: true },
  { name: "oauth_codes ziyaretçiye KAPALI olmalı (docs/history/317-*)", get: () => `oauth_codes?select=code_hash&limit=1`, mustBeDenied: true },
  { name: "oauth_grants ziyaretçiye KAPALI olmalı (docs/history/317-*)", get: () => `oauth_grants?select=id&limit=1`, mustBeDenied: true },
  { name: "rpc _oauth_exchange_code ziyaretçiye KAPALI olmalı (yalnız Edge Function'ın sahip-rol bağlantısı, docs/history/317-*)", rpc: "_oauth_exchange_code", body: { p_client: "00000000-0000-4000-8000-000000000000", p_code: "x", p_redirect: "https://a.test/cb", p_verifier: "v".repeat(43) }, mustBeDenied: true },
  { name: "rpc _oauth_register_client ziyaretçiye KAPALI olmalı (docs/history/317-*)", rpc: "_oauth_register_client", body: { p_name: "x", p_redirect_uris: ["https://a.test/cb"] }, mustBeDenied: true },
  { name: "rpc api_me_prompts ziyaretçiye KAPALI olmalı (kişisel API okuması, docs/history/315-*)", rpc: "api_me_prompts", body: { p_limit: 1 }, mustBeDenied: true },
  { name: "rpc api_me_throttle ziyaretçiye KAPALI olmalı (docs/history/315-*)", rpc: "api_me_throttle", body: { p_write: false }, mustBeDenied: true },
  { name: "rpc api_me_whoami ziyaretçiye KAPALI olmalı (docs/history/321-*)", rpc: "api_me_whoami", body: {}, mustBeDenied: true },
  { name: "rpc api_me_requests ziyaretçiye KAPALI olmalı (docs/history/321-*)", rpc: "api_me_requests", body: { p_limit: 1 }, mustBeDenied: true },
  { name: "rpc api_me_update_draft ziyaretçiye KAPALI olmalı (docs/history/321-*)", rpc: "api_me_update_draft", body: { p_kind: "prompt", p_id: "00000000-0000-0000-0000-000000000000", p_patch: {}, p_expected_updated_at: "2026-01-01T00:00:00Z" }, mustBeDenied: true },
  { name: "rpc api_me_sync_draft_variables ziyaretçiye KAPALI olmalı (docs/history/439-*)", rpc: "api_me_sync_draft_variables", body: { p_id: "00000000-0000-0000-0000-000000000000" }, mustBeDenied: true },
  { name: "rpc api_me_media_begin ziyaretçiye KAPALI olmalı (docs/history/333-*)", rpc: "api_me_media_begin", body: { p_prompt_id: "00000000-0000-0000-0000-000000000000" }, mustBeDenied: true },
  { name: "rpc api_me_media_commit ziyaretçiye KAPALI olmalı (docs/history/333-*)", rpc: "api_me_media_commit", body: { p_prompt_id: "00000000-0000-0000-0000-000000000000", p_path: "x", p_url: "y", p_width: 1, p_height: 1 }, mustBeDenied: true },
  { name: "rpc api_me_media_begin(p_prompt_id, p_generation_id) ziyaretçiye KAPALI olmalı (docs/history/438-*)", rpc: "api_me_media_begin", body: { p_prompt_id: "00000000-0000-0000-0000-000000000000", p_generation_id: "smoke" }, mustBeDenied: true },
  { name: "rpc api_me_media_commit(…, p_generation_id) ziyaretçiye KAPALI olmalı (docs/history/438-*)", rpc: "api_me_media_commit", body: { p_prompt_id: "00000000-0000-0000-0000-000000000000", p_path: "x", p_url: "y", p_width: 1, p_height: 1, p_alt: null, p_generation_id: "smoke" }, mustBeDenied: true },
  { name: "rpc api_me_throttle_kind ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_throttle_kind", body: { p_kind: "read" }, mustBeDenied: true },
  { name: "rpc api_me_feed ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_feed", body: { p_tab: "for_you" }, mustBeDenied: true },
  { name: "rpc api_me_collections ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_collections", body: {}, mustBeDenied: true },
  { name: "rpc api_me_collection_prompts ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_collection_prompts", body: { p_collection: "00000000-0000-0000-0000-000000000000" }, mustBeDenied: true },
  { name: "rpc api_me_engagement ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_engagement", body: { p_ids: ["00000000-0000-0000-0000-000000000000"] }, mustBeDenied: true },
  { name: "rpc api_me_react ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_react", body: { p_prompt: "00000000-0000-0000-0000-000000000000", p_reaction: "love" }, mustBeDenied: true },
  { name: "rpc api_me_set_saved ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_set_saved", body: { p_prompt: "00000000-0000-0000-0000-000000000000", p_saved: true }, mustBeDenied: true },
  { name: "rpc api_me_collection_item ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_collection_item", body: { p_collection: "00000000-0000-0000-0000-000000000000", p_prompt: "00000000-0000-0000-0000-000000000000", p_present: true }, mustBeDenied: true },
  { name: "rpc api_me_set_follow ziyaretçiye KAPALI olmalı (docs/history/432-*)", rpc: "api_me_set_follow", body: { p_username: "x", p_follow: true }, mustBeDenied: true },
  { name: "rpc telegram_link_code_create ziyaretçiye KAPALI olmalı (docs/history/323-*)", rpc: "telegram_link_code_create", body: { p_write: false }, mustBeDenied: true },
  // Skill (docs/history/388-*, 389-*): paket modeli. Sürüm/etiket/ilişki ziyaretçiye açıktır (Skill görünürlüğünü izler); dosya, kullanım, sabitleme ve yayın RPC'leri KAPALI.
  { name: "content_quotes.skill_id + skills.quote_count (Skill alıntılama, docs/history/394-*)", get: () => `content_quotes?select=${encodeURIComponent("id,skill_id,target_id")}&limit=1` },
  { name: "skills.quote_count (Skill alıntılama, docs/history/394-*)", get: () => `skills?select=${encodeURIComponent("id,quote_count")}&limit=1` },
  { name: "skill_links (Skill ↔ Skill bağları, docs/history/397-*)", get: () => `skill_links?select=${encodeURIComponent("id,skill_id,linked_skill_id,position")}&limit=1` },
  { name: "rpc skill_works_by_tool ziyaretçiye açık (araç başına oy toplamı, docs/history/397-*)", rpc: "skill_works_by_tool", body: { p_skill_id: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc import_skills ziyaretçiye KAPALI olmalı (Skill içe aktarma, docs/history/397-*)", rpc: "import_skills", body: { p_items: [], p_dry_run: true }, mustBeDenied: true },
  { name: "rpc set_skill_works_tool ziyaretçiye KAPALI olmalı (docs/history/397-*)", rpc: "set_skill_works_tool", body: { p_skill_id: "00000000-0000-4000-8000-000000000000", p_tool: null }, mustBeDenied: true },
  { name: "skill_categories (uzmanlık alanı tablosu, docs/history/399-*)", get: () => `skill_categories?select=${encodeURIComponent("id,label_tr,label_en,position")}&limit=1` },
  { name: "domains (ortak ALAN sözlüğü, docs/history/426-*)", get: () => `domains?select=${encodeURIComponent("id,label_tr,label_en,position")}&limit=1` },
  { name: "community_domains ziyaretçiye de açık (topluluk konusu, docs/history/426-*)", rpc: "community_domains", body: { p_ids: [] } },
  { name: "skills.cover_path (Skill kapak görseli, docs/history/399-*)", get: () => `skills?select=${encodeURIComponent("id,cover_path")}&limit=1` },
  { name: "skill_versions.instructions (yayınlanan talimat anlık görüntüsü, docs/history/415-*)", get: () => `skill_versions?select=${encodeURIComponent("id,skill_id,version,instructions")}&limit=1` },
  { name: "rpc skill_object_count ziyaretçiye KAPALI olmalı (Skill taslak nesne sınırı, docs/history/416-*)", rpc: "skill_object_count", body: { p_skill: "00000000-0000-4000-8000-000000000000", p_folder: "draft" }, mustBeDenied: true },
  { name: "rpc skill_works_by_version ziyaretçiye açık (sürüm başına oy toplamı, docs/history/399-*)", rpc: "skill_works_by_version", body: { p_skill_id: "00000000-0000-4000-8000-000000000000" } },
  { name: "rpc set_skill_works_version ziyaretçiye KAPALI olmalı (docs/history/399-*)", rpc: "set_skill_works_version", body: { p_skill_id: "00000000-0000-4000-8000-000000000000", p_version: null }, mustBeDenied: true },
  { name: "community_posts.skill_id (Skill topluluğa duyurulur, docs/history/408-*)", get: () => `community_posts?select=${encodeURIComponent("id,skill_id")}&limit=1` },
  { name: "skills (Skill çekirdeği, docs/history/388-*)", get: () => `skills?select=${encodeURIComponent("id,slug,title,version,status,visibility,use_count")}&limit=1` },
  { name: "skill_versions (değişmez sürüm + paket özeti, docs/history/389-*)", get: () => `skill_versions?select=${encodeURIComponent("id,skill_id,version,changelog,package_path,package_sha256,package_size,file_count,manifest,deprecated_at")}&limit=1` },
  { name: "skill_tags (Skill etiketleri, docs/history/389-*)", get: () => `skill_tags?select=skill_id,tag_slug&limit=1` },
  { name: "skill_relations (Skill'e bağlı içerik, docs/history/389-*)", get: () => `skill_relations?select=${encodeURIComponent("id,skill_id,target_type,target_id,position")}&limit=1` },
  { name: "skill_files ziyaretçiye KAPALI olmalı (çalışma kopyası yalnız sahibine, docs/history/389-*)", get: () => `skill_files?select=id&limit=1`, mustBeDenied: true },
  { name: "skill_uses ziyaretçiye KAPALI olmalı (kişi-Skill-gün kullanım kaydı, docs/history/389-*)", get: () => `skill_uses?select=user_id&limit=1`, mustBeDenied: true },
  { name: "skill_pins ziyaretçiye KAPALI olmalı (kişisel sürüm sabitleme, docs/history/389-*)", get: () => `skill_pins?select=user_id&limit=1`, mustBeDenied: true },
  { name: "rpc skill_publish_begin istemciye KAPALI olmalı (yalnız service_role: Edge Function skill-package, docs/history/389-*)", rpc: "skill_publish_begin", body: { p_user: "00000000-0000-4000-8000-000000000000", p_skill: "00000000-0000-4000-8000-000000000000", p_version: "1.0.0", p_changelog: "", p_client_token: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc skill_publish_commit istemciye KAPALI olmalı (docs/history/389-*)", rpc: "skill_publish_commit", body: { p_user: "00000000-0000-4000-8000-000000000000", p_skill: "00000000-0000-4000-8000-000000000000", p_version: "1.0.0", p_changelog: "", p_client_token: "00000000-0000-4000-8000-000000000000", p_package_sha256: "0000000000000000000000000000000000000000000000000000000000000000", p_package_size: 1, p_file_count: 0, p_manifest: {} }, mustBeDenied: true },
  { name: "rpc record_skill_use ziyaretçiye KAPALI olmalı (indirme/kurulum sayacı, docs/history/389-*)", rpc: "record_skill_use", body: { p_skill_id: "00000000-0000-4000-8000-000000000000" }, mustBeDenied: true },
  { name: "rpc skill_set_deprecated ziyaretçiye KAPALI olmalı (docs/history/389-*)", rpc: "skill_set_deprecated", body: { p_skill: "00000000-0000-4000-8000-000000000000", p_version: "1.0.0", p_deprecated: true }, mustBeDenied: true },
  { name: "rpc skill_feed_page ziyaretçiye açık (Skill keşfi/arama, docs/history/392-*)", rpc: "skill_feed_page", body: { p_limit: 1 } },
  { name: "rpc related_skills ziyaretçiye açık (benzer Skill, docs/history/392-*)", rpc: "related_skills", body: { p_skill: "00000000-0000-4000-8000-000000000000", p_limit: 1 } },
  { name: "rpc skills_for_content ziyaretçiye açık (ters yön, docs/history/392-*)", rpc: "skills_for_content", body: { p_type: "prompt", p_id: "00000000-0000-4000-8000-000000000000", p_limit: 1 } },
  { name: "collection_items.skill_id (Skill kaydet/koleksiyon, docs/history/391-*)", get: () => `collection_items?select=${encodeURIComponent("skill_id")}&limit=1` },
  { name: "rpc admin_skill_stats ziyaretçiye KAPALI olmalı (moderatör Skill sayıları, docs/history/395-*)", rpc: "admin_skill_stats", body: {}, mustBeDenied: true },
  { name: "rpc creator_insights_skills ziyaretçiye KAPALI olmalı (Yaratıcı paneli Skill sayıları, docs/history/391-*)", rpc: "creator_insights_skills", body: { p_days: 30 }, mustBeDenied: true },
  { name: "prompt_likes.skill_id (Skill beğenisi, docs/history/390-*)", get: () => `prompt_likes?select=${encodeURIComponent("skill_id,target_id")}&limit=1` },
  { name: "prompt_comments.skill_id (Skill yorumu, docs/history/390-*)", get: () => `prompt_comments?select=${encodeURIComponent("skill_id,pinned_at")}&limit=1` },
  { name: "rpc list_my_telegram_links ziyaretçiye KAPALI olmalı (docs/history/323-*)", rpc: "list_my_telegram_links", body: {}, mustBeDenied: true },
  { name: "rpc _telegram_link_authenticate istemciye KAPALI olmalı (yalnız sahip rol; docs/history/323-*)", rpc: "_telegram_link_authenticate", body: { p_telegram_user_id: 1 }, mustBeDenied: true },
  { name: "rpc common_communities (ortak topluluklar, docs/history/271-*)", rpc: "common_communities", body: { p_user: "00000000-0000-4000-8000-000000000000" }, deniedOk: true, soft: true },
  // Çevrimiçi durum (docs/history/329-*): hepsi yalnız oturumlu — ziyaretçi anahtarıyla REDDEDİLMELİ (anon durum bilgisi göremez).
  { name: "presence_state ziyaretçiye KAPALI olmalı (son görülme / görünmez mod, docs/history/329-*)", get: () => `presence_state?select=user_id&limit=1`, mustBeDenied: true },
  { name: "rpc presence_lookup ziyaretçiye KAPALI olmalı (docs/history/329-*)", rpc: "presence_lookup", body: { p_ids: [] }, mustBeDenied: true },
  { name: "rpc my_presence ziyaretçiye KAPALI olmalı (docs/history/329-*)", rpc: "my_presence", body: {}, mustBeDenied: true },
  { name: "rpc community_presence_counts ziyaretçiye KAPALI olmalı (docs/history/329-*)", rpc: "community_presence_counts", body: { p_ids: [] }, mustBeDenied: true },
  // Rahatsız etme saatleri (docs/history/435-*): yalnız oturumlu; tablo istemciye hiç açık değil.
  { name: "rpc get_my_quiet_hours ziyaretçiye KAPALI olmalı (docs/history/435-*)", rpc: "get_my_quiet_hours", body: {}, mustBeDenied: true },
  { name: "notification_quiet_hours ziyaretçiye KAPALI olmalı (docs/history/435-*)", get: () => `notification_quiet_hours?select=user_id&limit=1`, mustBeDenied: true },
  // Takip Ettiklerin etkinlik akışı (docs/history/451-*): yalnız oturumlu; ziyaretçi reddedilir (var olduğunu da gösterir).
  { name: "rpc following_activity_page ziyaretçiye KAPALI olmalı (docs/history/451-*)", rpc: "following_activity_page", body: { p_limit: 1 }, mustBeDenied: true },
  { name: "rpc following_activity_summary ziyaretçiye KAPALI olmalı (docs/history/451-*)", rpc: "following_activity_summary", body: {}, mustBeDenied: true },
  { name: "rpc follow_feed_visit ziyaretçiye KAPALI olmalı (docs/history/451-*)", rpc: "follow_feed_visit", body: { p_peek: true }, mustBeDenied: true },
  // Keşfet editoryal açılışı (docs/history/451-*): ziyaretçiye açık okuma RPC'leri.
  { name: "rpc discover_weekly_stats (docs/history/451-*)", rpc: "discover_weekly_stats", body: {} },
  { name: "rpc discover_trending_topics (docs/history/451-*)", rpc: "discover_trending_topics", body: { p_limit: 1 } },
  { name: "rpc discover_rising_tools (docs/history/451-*)", rpc: "discover_rising_tools", body: { p_limit: 1 } },
  { name: "rpc feed_page_rising (Keşfet → Yükselen, docs/history/451-*)", rpc: "feed_page_rising", body: { p_limit: 1 } },
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
