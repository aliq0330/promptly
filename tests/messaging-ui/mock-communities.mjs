// Topluluk uçlarının ağ taklidi (docs/history/175-*). `mock.mjs` içindeki `db.extraRoutes` kancasına bağlanır; gerçek Supabase'e
// bağlanmaz. SQL tarafının asıl doğrulaması `supabase/tests/communities.sql`'dir; burası yalnızca ARAYÜZÜN çağrıları, durumları ve metinleri sınar.
import { ME, U } from "./mock.mjs";

const allUsers = () => Object.values(U);
const userById = (id) => allUsers().find((u) => u.id === id);
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pub = (p) => (p ? Object.fromEntries(PUBLIC_COLS.map((c) => [c, p[c]])) : null);
const eq = (q, col) => { const v = q.get(col); return v?.startsWith("eq.") ? v.slice(3) : null; };

export function setupCommunities(db) {
  db.posts = []; // { id, community_id, author_id, content_type, content (prompt satırı), note, pinned_at, created_at }
  db.announcements = [];
  db.events = []; // { ...row, rsvps: {userId: status} }
  db.reports = [];
  db.audit = [];
  db.bookmarks = new Set();
  db.acceptances = [];
  db.stats = null;
  db.ownContent = { prompt: [], request: [], workflow: [], preset: [] };

  db.addCommunity = (id, opts = {}) => {
    const { name = "Prompt Atölyesi", visibility = "public", category = "image", myRole = "member", members = [], rules = null, rulesRequired = false, closed = false, feedPolicy = "members", description = "Topluluk açıklaması", texts = [], pending = 0, origin = "native" } = opts;
    db.addGroup(id, { name, visibility, myRole: myRole === "none" ? "member" : myRole, members, description, texts, pending });
    if (myRole === "none") { db.members = db.members.filter((m) => !(m.conversation_id === id && m.user_id === ME)); }
    const g = db.groups.find((x) => x.id === id);
    Object.assign(g, { category, feed_policy: feedPolicy, rules, rules_required: rulesRequired, closed_at: closed ? "2026-02-01T00:00:00Z" : null, origin });
    g.member_count = db.members.filter((m) => m.conversation_id === id).length;
    return g;
  };
  db.addPost = (communityId, { author = U.bob, type = "prompt", title = "Gün batımı promptu", note = null, pinned = false, gone = false } = {}) => {
    const pid = crypto.randomUUID();
    const row = { id: crypto.randomUUID(), community_id: communityId, author_id: author.id, content_type: type, note, pinned_at: pinned ? db.stamp() : null, created_at: db.stamp(), content: gone ? null : { id: pid, title } };
    db.posts.push(row);
    db.groups.find((g) => g.id === communityId).post_count += 1;
    return row;
  };

  const promptRow = (c, author) => ({
    id: c.id, title: c.title, description: "açıklama", prompt_text: "metin", tool: null, tools: [], content_type: "text", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-02-01T00:00:00Z", show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null,
    profiles: pub(author), prompt_media: [], prompt_tags: [],
  });

  db.extraRoutes = async ({ table, method, q, body, signedIn, json, rows, err }) => {
    const g = (id) => db.groups.find((x) => x.id === id);
    const role = (id, uid = signedIn) => db.member(id, uid)?.role ?? null;
    const staff = (id) => ["owner", "admin", "moderator"].includes(role(id) ?? "");
    const manager = (id) => ["owner", "admin"].includes(role(id) ?? "");
    const log = (name, b) => db.calls.push({ method: "RPC", table: name, body: b });

    // ---- keşif / listeler ----
    if (table === "rpc/discover_communities") {
      log("discover_communities", body);
      const term = (body.p_query ?? "").toLowerCase();
      const list = db.groups
        .filter((x) => x.visibility === "public" && !x.closed_at && (!body.p_category || x.category === body.p_category) && (!term || x.name.toLowerCase().includes(term) || (x.description ?? "").toLowerCase().includes(term)))
        .map((x) => ({
          id: x.id, name: x.name, description: x.description, avatar_url: null, category: x.category, member_count: x.member_count, member_limit: x.member_limit, post_count: x.post_count,
          upcoming_event_count: db.events.filter((e) => e.community_id === x.id && e.status === "scheduled").length, rules_required: x.rules_required, created_at: x.created_at, last_activity_at: null,
          my_status: db.member(x.id, signedIn) ? "member" : db.invitations.some((i) => i.group_id === x.id && i.invitee_id === signedIn && i.status === "pending") ? "invited" : db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending") ? "requested" : "none",
        }));
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 20)));
    }
    if (table === "rpc/list_my_communities") {
      log("list_my_communities", body);
      const scope = body.p_scope;
      const list = db.groups.filter((x) => {
        const r = role(x.id);
        if (scope === "member") return Boolean(r);
        if (scope === "managed") return ["owner", "admin", "moderator"].includes(r ?? "");
        return db.bookmarks.has(x.id) && (x.visibility === "public" || r);
      }).map((x) => ({
        id: x.id, name: x.name, description: x.description, avatar_url: null, category: x.category, visibility: x.visibility, member_count: x.member_count, member_limit: x.member_limit, post_count: x.post_count,
        upcoming_event_count: 0, closed: Boolean(x.closed_at), created_at: x.created_at, last_activity_at: null, my_role: role(x.id), unread_count: db.member(x.id, signedIn)?.unread_count ?? 0,
        pending_request_count: staff(x.id) ? x.pending_request_count : 0, bookmarked: db.bookmarks.has(x.id),
      }));
      return json(200, list);
    }
    if (table === "rpc/community_members") {
      if (!db.member(body.p_group_id, signedIn)) return json(200, []);
      const term = (body.p_search ?? "").toLowerCase();
      const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
      const list = db.members.filter((m) => m.conversation_id === body.p_group_id && (!body.p_role || m.role === body.p_role)).map((m) => ({ m, u: userById(m.user_id) }))
        .filter(({ u }) => !term || u.username.includes(term) || u.display_name.toLowerCase().includes(term)).sort((a, b) => rank[b.m.role] - rank[a.m.role]);
      log("community_members", body);
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 30)).map(({ m, u }) => ({ user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, role: m.role, joined_at: "2026-01-01T00:00:00Z" })));
    }
    if (table === "rpc/set_community_bookmark") {
      log("set_community_bookmark", body);
      if (body.p_on) db.bookmarks.add(body.p_group_id); else db.bookmarks.delete(body.p_group_id);
      return json(200, null);
    }

    // ---- oluşturma / ayar / katılım ----
    if (table === "rpc/create_community") {
      log("create_community", body);
      const name = String(body.p_name ?? "").trim();
      if (!name) return err("invalid_name");
      const id = crypto.randomUUID();
      db.conversations.push({ id, last_message_at: db.stamp(), kind: "group" });
      db.members.push({ conversation_id: id, user_id: signedIn, role: "owner", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
      db.groups.push({
        id, name, description: body.p_description ?? null, avatar_url: body.p_avatar_url ?? null, visibility: body.p_visibility, posting_policy: body.p_posting_policy, member_limit: body.p_member_limit, member_count: 1,
        pending_request_count: 0, history_visible: false, members_can_pin: false, role_permissions: { admin: {}, moderator: {} }, created_at: db.stamp(), category: body.p_category, feed_policy: body.p_feed_policy,
        rules: body.p_rules ?? null, rules_version: 1, rules_required: Boolean(body.p_rules_required), closed_at: null, post_count: 0, origin: "native",
      });
      return json(200, { group_id: id, invited_count: (body.p_invite_user_ids ?? []).length, skipped: [] });
    }
    if (table === "rpc/join_community") {
      log("join_community", body);
      const x = g(body.p_group_id);
      if (!x || x.visibility !== "public") return err("group_not_found");
      if (x.closed_at) return err("community_closed");
      if (db.member(x.id, signedIn)) return json(200, { outcome: "already_member", group_id: x.id });
      if (x.rules_required && !body.p_accept_rules) return err("rules_not_accepted");
      if (x.member_count >= x.member_limit) return err("member_limit_reached");
      x.member_count += 1;
      db.members.push({ conversation_id: x.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
      return json(200, { outcome: "joined", group_id: x.id });
    }
    if (table === "rpc/respond_community_invitation") {
      log("respond_community_invitation", body);
      const inv = db.invitations.find((i) => i.id === body.p_invitation_id && i.invitee_id === signedIn);
      if (!inv || inv.status !== "pending") return err("invitation_not_found");
      const x = g(inv.group_id);
      if (body.p_accept && x.rules_required && !body.p_accept_rules) return err("rules_not_accepted");
      inv.status = body.p_accept ? "accepted" : "declined";
      if (!body.p_accept) return json(200, { outcome: "declined" });
      x.member_count += 1;
      db.members.push({ conversation_id: x.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
      return json(200, { outcome: "accepted", group_id: x.id });
    }
    if (table === "rpc/preview_community_link" || table === "rpc/join_community_via_link") {
      log(table.slice(4), body);
      const x = db.groups.find((y) => y.link_token && y.link_token === body.p_token);
      if (!x) return table === "rpc/preview_community_link" ? json(200, { valid: false }) : err("invalid_link");
      const member = db.member(x.id, signedIn);
      const pending = db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending");
      if (table === "rpc/preview_community_link") {
        return json(200, { valid: true, group_id: member ? x.id : null, name: x.name, description: x.description, avatar_url: null, visibility: x.visibility, member_count: x.member_count, member_limit: x.member_limit, my_status: member ? "member" : pending ? "requested" : "none", category: x.category, rules: x.rules, rules_required: x.rules_required, closed: Boolean(x.closed_at), post_count: x.post_count });
      }
      if (member) return json(200, { outcome: "already_member", group_id: x.id });
      if (x.rules_required && !body.p_accept_rules) return err("rules_not_accepted");
      if (x.visibility === "public") { x.member_count += 1; db.members.push({ conversation_id: x.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null }); return json(200, { outcome: "joined", group_id: x.id }); }
      db.requests.push({ id: crypto.randomUUID(), group_id: x.id, user_id: signedIn, message: body.p_message ?? null, status: "pending", created_at: db.stamp() });
      x.pending_request_count += 1;
      return json(200, { outcome: "requested", group_id: null });
    }
    if (table === "rpc/update_community") {
      log("update_community", body);
      const x = g(body.p_group_id);
      if (!manager(x.id)) return err("forbidden");
      const patch = body.p_patch ?? {};
      if ("category" in patch) x.category = patch.category;
      if ("feed_policy" in patch) x.feed_policy = patch.feed_policy;
      if ("rules" in patch) { x.rules = patch.rules; x.rules_version += 1; }
      if ("rules_required" in patch) x.rules_required = patch.rules_required;
      return json(200, { changed: true, rules_version: x.rules_version });
    }
    if (table === "rpc/accept_community_rules") {
      log("accept_community_rules", body);
      if (!db.member(body.p_group_id, signedIn)) return err("not_a_member");
      db.acceptances.push({ community_id: body.p_group_id, user_id: signedIn, rules_version: g(body.p_group_id).rules_version });
      return json(200, null);
    }
    if (table === "rpc/close_community" || table === "rpc/reopen_community") {
      log(table.slice(4), body);
      if (role(body.p_group_id) !== "owner") return err("forbidden");
      g(body.p_group_id).closed_at = table === "rpc/close_community" ? "2026-03-01T00:00:00Z" : null;
      return json(200, null);
    }
    if (table === "community_rule_acceptances" && method === "GET") {
      const cid = eq(q, "community_id");
      return rows(db.acceptances.filter((a) => a.user_id === signedIn && (!cid || a.community_id === cid)).map((a) => ({ rules_version: a.rules_version })));
    }
    if (table === "community_bookmarks" && method === "GET") {
      const cid = eq(q, "community_id");
      return rows(cid && db.bookmarks.has(cid) ? [{ community_id: cid }] : []);
    }

    // ---- akış ----
    if (table === "community_posts" && method === "GET") {
      const cid = eq(q, "community_id");
      const pinnedOnly = q.get("pinned_at")?.startsWith("not.is");
      const unpinned = q.get("pinned_at") === "is.null";
      let list = db.posts.filter((p) => p.community_id === cid && (pinnedOnly ? p.pinned_at : unpinned ? !p.pinned_at : true));
      list = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
      const lim = Number(q.get("limit") ?? 0); if (lim) list = list.slice(0, lim);
      return rows(list.map((p) => ({
        id: p.id, community_id: p.community_id, content_type: p.content_type, note: p.note, pinned_at: p.pinned_at, created_at: p.created_at, author: pub(userById(p.author_id)),
        prompts: p.content_type === "prompt" && p.content ? promptRow(p.content, userById(p.author_id)) : null, prompt_requests: null, workflows: null, presets: null,
      })));
    }
    if (table === "rpc/share_to_community") {
      log("share_to_community", body);
      const x = g(body.p_group_id);
      if (!db.member(x.id, signedIn)) return err("forbidden");
      if (x.closed_at) return err("community_closed");
      if (x.feed_policy === "admins" && !staff(x.id)) return err("forbidden");
      const own = db.ownContent[body.p_content_type]?.find((c) => c.id === body.p_content_id);
      if (!own) return err("content_not_found");
      if (own.visibility === "private") return err("content_not_public");
      if (db.posts.some((p) => p.community_id === x.id && p.content?.id === own.id)) return err("already_shared");
      const post = db.addPost(x.id, { author: userById(signedIn), type: body.p_content_type, title: own.title, note: body.p_note });
      post.content = { id: own.id, title: own.title };
      return json(200, post.id);
    }
    if (table === "rpc/delete_community_post" || table === "rpc/moderate_community_post" || table === "rpc/set_community_post_pinned" || table === "rpc/update_community_post") {
      log(table.slice(4), body);
      const post = db.posts.find((p) => p.id === body.p_post_id);
      if (!post) return err("post_not_found");
      const x = g(post.community_id);
      if (table === "rpc/delete_community_post") { if (post.author_id !== signedIn) return err("forbidden"); }
      else if (table === "rpc/update_community_post") { if (post.author_id !== signedIn) return err("forbidden"); post.note = body.p_note; return json(200, null); }
      else if (table === "rpc/set_community_post_pinned") {
        if (!staff(x.id)) return err("forbidden");
        if (body.p_pinned && db.posts.filter((p) => p.community_id === x.id && p.pinned_at).length >= 3) return err("pin_limit_reached");
        post.pinned_at = body.p_pinned ? db.stamp() : null; return json(200, null);
      } else {
        const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
        if (!staff(x.id) || (post.author_id !== signedIn && rank[role(x.id, post.author_id) ?? "member"] >= rank[role(x.id)])) return err("forbidden");
        db.audit.push({ id: crypto.randomUUID(), group_id: x.id, action: "post_removed", actor_id: signedIn, target_user_id: post.author_id, details: {}, created_at: db.stamp() });
      }
      db.posts = db.posts.filter((p) => p.id !== post.id); x.post_count -= 1;
      return json(200, null);
    }
    if ((table === "prompts" || table === "prompt_requests" || table === "workflows" || table === "presets") && method === "GET" && (q.get("select") ?? "").replace(/\s/g, "") === "id,title") {
      const type = table === "prompts" ? "prompt" : table === "prompt_requests" ? "request" : table === "workflows" ? "workflow" : "preset";
      return rows(db.ownContent[type].filter((c) => c.visibility !== "private").map((c) => ({ id: c.id, title: c.title })));
    }

    // ---- duyurular ----
    if (table === "community_announcements" && method === "GET") {
      const cid = eq(q, "community_id");
      return rows(db.announcements.filter((a) => a.community_id === cid).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)).map((a) => ({ ...a, author: pub(userById(a.author_id)) })));
    }
    if (table === "rpc/publish_community_announcement") {
      log("publish_community_announcement", body);
      if (!manager(body.p_group_id)) return err("forbidden");
      const id = crypto.randomUUID();
      db.announcements.push({ id, community_id: body.p_group_id, author_id: signedIn, title: body.p_title, body: body.p_body, pinned: body.p_pinned, created_at: db.stamp(), edited_at: null });
      if (body.p_post_to_chat) { const m = db.addMessage(body.p_group_id, signedIn, body.p_title); m.announcement_id = id; }
      return json(200, id);
    }
    if (table === "rpc/update_community_announcement") {
      log("update_community_announcement", body);
      const a = db.announcements.find((x) => x.id === body.p_announcement_id);
      if (!a || !manager(a.community_id)) return err("forbidden");
      Object.assign(a, { title: body.p_title, body: body.p_body, pinned: body.p_pinned ?? a.pinned, edited_at: db.stamp() });
      return json(200, null);
    }
    if (table === "rpc/delete_community_announcement") {
      log("delete_community_announcement", body);
      const a = db.announcements.find((x) => x.id === body.p_announcement_id);
      if (!a || !manager(a.community_id)) return err("forbidden");
      db.announcements = db.announcements.filter((x) => x.id !== a.id);
      return json(200, null);
    }

    // ---- etkinlikler ----
    if (table === "community_events" && method === "GET") {
      const cid = eq(q, "community_id");
      const gte = q.get("starts_at")?.startsWith("gte.") ? q.get("starts_at").slice(4) : null;
      const lt = q.get("starts_at")?.startsWith("lt.") ? q.get("starts_at").slice(3) : null;
      return rows(db.events.filter((e) => e.community_id === cid && (!gte || e.starts_at >= gte) && (!lt || e.starts_at < lt)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((e) => { const copy = { ...e }; delete copy.rsvps; return copy; }));
    }
    if (table === "community_event_rsvps" && method === "GET") {
      const ids = q.get("event_id")?.startsWith("in.(") ? q.get("event_id").slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : [];
      return rows(db.events.filter((e) => ids.includes(e.id) && e.rsvps[signedIn]).map((e) => ({ event_id: e.id, status: e.rsvps[signedIn] })));
    }
    if (table === "rpc/create_community_event" || table === "rpc/update_community_event" || table === "rpc/cancel_community_event" || table === "rpc/delete_community_event") {
      log(table.slice(4), body);
      if (table === "rpc/create_community_event") {
        if (!manager(body.p_group_id)) return err("forbidden");
        if (new Date(body.p_starts_at) <= new Date()) return err("invalid_event_time");
        const id = crypto.randomUUID();
        db.events.push({ id, community_id: body.p_group_id, title: body.p_title, description: body.p_description, starts_at: body.p_starts_at, ends_at: body.p_ends_at, timezone: body.p_timezone, location: body.p_location, online_url: body.p_online_url, status: "scheduled", going_count: 0, maybe_count: 0, rsvps: {} });
        return json(200, id);
      }
      const e = db.events.find((x) => x.id === body.p_event_id);
      if (!e || !manager(e.community_id)) return err("forbidden");
      if (table === "rpc/update_community_event") Object.assign(e, { title: body.p_patch.title, description: body.p_patch.description, starts_at: body.p_patch.starts_at, ends_at: body.p_patch.ends_at, timezone: body.p_patch.timezone, location: body.p_patch.location, online_url: body.p_patch.online_url });
      if (table === "rpc/cancel_community_event") e.status = "cancelled";
      if (table === "rpc/delete_community_event") db.events = db.events.filter((x) => x.id !== e.id);
      return json(200, table === "rpc/update_community_event" ? { changed: true } : null);
    }
    if (table === "rpc/set_community_event_rsvp") {
      log("set_community_event_rsvp", body);
      const e = db.events.find((x) => x.id === body.p_event_id);
      if (!e || !db.member(e.community_id, signedIn)) return err("forbidden");
      if (e.status === "cancelled") return err("event_cancelled");
      if (body.p_status === "none") delete e.rsvps[signedIn]; else e.rsvps[signedIn] = body.p_status;
      e.going_count = Object.values(e.rsvps).filter((s) => s === "going").length; e.maybe_count = Object.values(e.rsvps).filter((s) => s === "maybe").length;
      return json(200, null);
    }
    if (table === "rpc/dispatch_my_event_reminders") { log("dispatch_my_event_reminders", body); return json(200, 0); }

    // ---- raporlar / moderasyon ----
    if (table === "rpc/report_community_content") {
      log("report_community_content", body);
      if (!db.member(body.p_group_id, signedIn)) return err("forbidden");
      if (String(body.p_reason ?? "").trim().length < 3) return err("invalid_reason");
      db.reports.push({ id: crypto.randomUUID(), community_id: body.p_group_id, reporter_id: signedIn, target_kind: body.p_kind, post_id: body.p_kind === "post" ? body.p_target_id : null, message_id: body.p_kind === "message" ? body.p_target_id : null, target_user_id: null, reason: body.p_reason, status: "open", resolution: null, created_at: db.stamp(), resolved_at: null });
      return json(200, crypto.randomUUID());
    }
    if (table === "community_reports" && method === "GET") {
      const cid = eq(q, "community_id");
      const status = q.get("status");
      const open = status === "eq.open";
      return rows(db.reports.filter((r) => r.community_id === cid && (open ? r.status === "open" : r.status !== "open")).map((r) => ({ ...r, reporter: pub(userById(r.reporter_id)), messages: r.message_id ? { body: db.messages.find((m) => m.id === r.message_id)?.body ?? null, deleted_at: null } : null, community_posts: r.post_id ? { prompts: { title: db.posts.find((p) => p.id === r.post_id)?.content?.title ?? "İçerik" }, prompt_requests: null, workflows: null, presets: null } : null })));
    }
    if (table === "rpc/resolve_community_report") {
      log("resolve_community_report", body);
      const r = db.reports.find((x) => x.id === body.p_report_id);
      if (!r || !staff(r.community_id)) return err("forbidden");
      if (r.status !== "open") return err("invalid_state");
      r.status = body.p_action === "dismiss" ? "dismissed" : "resolved"; r.resolved_at = db.stamp(); r.resolution = body.p_note ?? (body.p_action === "dismiss" ? "dismissed" : "content_removed");
      if (body.p_action === "remove" && r.post_id) { db.posts = db.posts.filter((p) => p.id !== r.post_id); g(r.community_id).post_count -= 1; }
      if (body.p_action === "remove" && r.message_id) { const m = db.messages.find((x) => x.id === r.message_id); if (m) { m.deleted_at = db.stamp(); m.body = null; } }
      return json(200, null);
    }

    // ---- istatistik / denetim ----
    if (table === "rpc/community_stats") {
      log("community_stats", body);
      if (!manager(body.p_group_id)) return err("forbidden");
      return json(200, db.stats ?? {
        days: body.p_days, members: { total: 12, joined: 4, left: 1, net: 3 }, posts: { total: 9, in_period: 5, authors_in_period: 3 }, engagement: { likes: 21, comments: 6 },
        events: { total: 3, upcoming: 2, in_period: 1, going_in_period: 7, going_upcoming: 10 }, chat: { messages_in_period: 340, active_senders_in_period: 8 },
        queue: { pending_requests: 2, pending_invitations: 1, open_reports: 1 }, series: Array.from({ length: Number(body.p_days) }, (_, i) => ({ day: `2026-05-${String((i % 28) + 1).padStart(2, "0")}`, joined: i % 3, posts: i % 2, messages: i * 2 })),
      });
    }
    if (table === "chat_group_audit" && method === "GET") {
      const gid = eq(q, "group_id");
      return rows(db.audit.filter((a) => a.group_id === gid).map((a) => ({ ...a, actor: pub(userById(a.actor_id)) })));
    }
    return null;
  };
}
