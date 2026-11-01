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
  db.likes = []; // { community_post_id, user_id }
  db.comments = []; // { id, community_post_id | prompt_id, author_id, body, parent_id, created_at }
  db.audit = [];
  db.acceptances = [];
  db.stats = null;
  db.suggestions = false; // öneri şeridi yalnız ilgili senaryolarda açılır (kartlar listede tekrar etmesin)
  db.ownContent = { prompt: [], request: [], workflow: [], preset: [] };
  // Koleksiyonlar (docs/history/184-*): kaydet penceresi, Kaydedilenler ve gönderi kaydetme sayacı için küçük bir taklit.
  db.collections = [
    { id: "c0000000-0000-4000-8000-0000000000d1", owner_id: ME, name: "Genel", visibility: "private", item_count: 0, follower_count: 0, is_default: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    { id: "c0000000-0000-4000-8000-0000000000d2", owner_id: ME, name: "Tasarım", visibility: "private", item_count: 0, follower_count: 0, is_default: false, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
  ];
  db.collectionItems = []; // { id, collection_id, prompt_id?, workflow_id?, preset_id?, community_post_id?, created_at }

  db.addCommunity = (id, opts = {}) => {
    const { name = "Prompt Atölyesi", visibility = "public", category = "image", myRole = "member", members = [], rules = null, rulesRequired = false, closed = false, feedPolicy = "members", description = "Topluluk açıklaması", texts = [], pending = 0, origin = "native" } = opts;
    db.addGroup(id, { name, visibility, myRole: myRole === "none" ? "member" : myRole, members, description, texts, pending });
    if (myRole === "none") { db.members = db.members.filter((m) => !(m.conversation_id === id && m.user_id === ME)); }
    const g = db.groups.find((x) => x.id === id);
    Object.assign(g, { category, feed_policy: feedPolicy, rules, rules_required: rulesRequired, closed_at: closed ? "2026-02-01T00:00:00Z" : null, origin });
    g.member_count = db.members.filter((m) => m.conversation_id === id).length;
    return g;
  };
  db.addPost = (communityId, { author = U.bob, type = "prompt", title = "Gün batımı promptu", note = null, pinned = false, gone = false, kind = "application", visibility = "public", likeCount = 0, commentCount = 0 } = {}) => {
    const pid = crypto.randomUUID();
    const row = { id: crypto.randomUUID(), community_id: communityId, author_id: author.id, kind, like_count: likeCount, comment_count: commentCount, save_count: 0, content_type: type, note, pinned_at: pinned ? db.stamp() : null, created_at: db.stamp(), content: gone ? null : { id: pid, title, visibility, communityId: kind === "native" ? communityId : null } };
    db.posts.push(row);
    db.groups.find((g) => g.id === communityId).post_count += 1;
    return row;
  };

  const promptRow = (c, author) => ({
    id: c.id, title: c.title, description: "açıklama", prompt_text: "metin", tool: null, tools: [], content_type: "text", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-02-01T00:00:00Z", show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: c.visibility ?? "public", deleted_at: null, community_id: c.communityId ?? null,
    profiles: pub(author), prompt_media: [], prompt_tags: [],
  });

  db.extraRoutes = async ({ table, method, q, body, signedIn, json, rows, err }) => {
    const g = (id) => db.groups.find((x) => x.id === id);
    const role = (id, uid = signedIn) => db.member(id, uid)?.role ?? null;
    const staff = (id) => ["owner", "admin", "moderator"].includes(role(id) ?? "");
    const manager = (id) => ["owner", "admin"].includes(role(id) ?? "");
    const log = (name, b) => db.calls.push({ method: "RPC", table: name, body: b });

    // ---- keşif / listeler ----
    // Topluluk KARTI (üye olmayanın gördüğü tek şey; docs/history/177-*): açık/kapalı herkese, tamamen kapalı yalnız üye/davetli/başvurana.
    if (table === "rpc/community_cards") {
      log("community_cards", body);
      const invited = (x) => db.invitations.some((i) => i.group_id === x.id && i.invitee_id === signedIn && i.status === "pending");
      const requested = (x) => db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending");
      const list = (body.p_ids ?? []).map((id) => g(id)).filter((x) => x && (x.visibility !== "private" || db.member(x.id, signedIn) || invited(x) || requested(x)))
        .map((x) => ({
          id: x.id, name: x.name, description: x.description, avatar_url: x.avatar_url ?? null, category: x.category, visibility: x.visibility, member_count: x.member_count, member_limit: x.member_limit,
          rules: x.rules, rules_required: x.rules_required, rules_version: x.rules_version ?? 1, closed_at: x.closed_at, origin: x.origin ?? "native",
          post_count: x.visibility === "public" || db.member(x.id, signedIn) ? x.post_count : null, created_at: x.created_at,
        }));
      return json(200, list);
    }
    // Üye olmayanın kapağı (docs/history/191-*): kart RPC'siyle AYNI görünürlük kuralı.
    if (table === "rpc/community_card_covers") {
      log("community_card_covers", body);
      const invited = (x) => db.invitations.some((i) => i.group_id === x.id && i.invitee_id === signedIn && i.status === "pending");
      const requested = (x) => db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending");
      return json(200, (body.p_ids ?? []).map((id) => g(id)).filter((x) => x && (x.visibility !== "private" || db.member(x.id, signedIn) || invited(x) || requested(x)))
        .map((x) => ({ id: x.id, cover_url: x.cover_url ?? null, cover_color: x.cover_color ?? null })));
    }
    if (table === "rpc/discover_communities") {
      log("discover_communities", body);
      const term = (body.p_query ?? "").toLowerCase();
      const list = db.groups
        .filter((x) => x.visibility === "public" && !x.closed_at && (!body.p_category || x.category === body.p_category) && (!term || x.name.toLowerCase().includes(term) || (x.description ?? "").toLowerCase().includes(term)))
        .map((x) => ({
          id: x.id, name: x.name, description: x.description, avatar_url: x.avatar_url ?? null, category: x.category, member_count: x.member_count, member_limit: x.member_limit, post_count: x.post_count,
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
        return ["owner", "admin", "moderator"].includes(r ?? "");
      }).map((x) => ({
        id: x.id, name: x.name, description: x.description, avatar_url: x.avatar_url ?? null, category: x.category, visibility: x.visibility, member_count: x.member_count, member_limit: x.member_limit, post_count: x.post_count,
        upcoming_event_count: 0, closed: Boolean(x.closed_at), created_at: x.created_at, last_activity_at: null, my_role: role(x.id), unread_count: db.member(x.id, signedIn)?.unread_count ?? 0,
        pending_request_count: staff(x.id) ? x.pending_request_count : 0,
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
    // Arama (herkese açık + kapalı; tamamen kapalı asla) ve öneriler. Kapalı topluluk için içerik istatistiği null döner (sunucu gibi).
    const myStatusOf = (x) =>
      db.member(x.id, signedIn) ? "member" : db.invitations.some((i) => i.group_id === x.id && i.invitee_id === signedIn && i.status === "pending") ? "invited" : db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending") ? "requested" : "none";
    const searchRow = (x, extra = {}) => {
      const open = x.visibility === "public" || Boolean(db.member(x.id, signedIn));
      return {
        id: x.id, name: x.name, description: x.description, avatar_url: x.avatar_url ?? null, category: x.category, visibility: x.visibility, member_count: x.member_count, member_limit: x.member_limit,
        post_count: open ? x.post_count : null, upcoming_event_count: open ? db.events.filter((e) => e.community_id === x.id && e.status === "scheduled").length : null,
        rules_required: x.rules_required, created_at: x.created_at, last_activity_at: null, my_status: myStatusOf(x), ...extra,
      };
    };
    if (table === "rpc/search_communities") {
      log("search_communities", body);
      const term = (body.p_query ?? "").trim().toLowerCase();
      if (!term) return json(200, []);
      const list = db.groups
        .filter((x) => ["public", "restricted"].includes(x.visibility) && !x.closed_at && (!body.p_category || x.category === body.p_category) && (x.name.toLowerCase().includes(term) || (x.description ?? "").toLowerCase().includes(term)))
        .map((x) => searchRow(x));
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 20)));
    }
    if (table === "rpc/suggest_communities") {
      log("suggest_communities", body);
      if (!db.suggestions) return json(200, []);
      const mine = new Set(db.groups.filter((x) => db.member(x.id, signedIn) && x.category !== "general").map((x) => x.category));
      const list = db.groups
        .filter((x) => ["public", "restricted"].includes(x.visibility) && !x.closed_at && x.member_count < x.member_limit && myStatusOf(x) === "none")
        .map((x) => ({ x, overlap: mine.has(x.category) }))
        .sort((a, b) => Number(b.overlap) - Number(a.overlap) || b.x.member_count - a.x.member_count)
        .map(({ x, overlap }) => searchRow(x, { reason: overlap ? "category" : "popular" }));
      return json(200, list.slice(0, body.p_limit ?? 8));
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
    if (table === "rpc/request_join_community") {
      log("request_join_community", body);
      const x = g(body.p_group_id);
      if (!x) return err("group_not_found");
      if (db.member(x.id, signedIn)) return json(200, { outcome: "already_member", group_id: x.id });
      if (x.visibility === "public") {
        if (x.rules_required && !body.p_accept_rules) return err("rules_not_accepted");
        x.member_count += 1;
        db.members.push({ conversation_id: x.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
        return json(200, { outcome: "joined", group_id: x.id });
      }
      if (x.visibility !== "restricted") return err("group_not_found");
      if (x.closed_at) return err("community_closed");
      if (db.requests.some((r) => r.group_id === x.id && r.user_id === signedIn && r.status === "pending")) return json(200, { outcome: "already_requested", group_id: null });
      if (x.rules_required && !body.p_accept_rules) return err("rules_not_accepted");
      if (x.member_count >= x.member_limit) return err("member_limit_reached");
      const request = { id: crypto.randomUUID(), group_id: x.id, user_id: signedIn, message: body.p_message ?? null, status: "pending", created_at: db.stamp() };
      db.requests.push(request);
      x.pending_request_count += 1;
      return json(200, { outcome: "requested", group_id: null, request_id: request.id });
    }
    if (table === "rpc/cancel_chat_group_join_request") {
      log("cancel_chat_group_join_request", body);
      const request = db.requests.find((r) => r.id === body.p_request_id && r.user_id === signedIn);
      if (!request) return err("request_not_found");
      if (request.status !== "pending") return err("invalid_state");
      request.status = "cancelled";
      const x = g(request.group_id);
      x.pending_request_count = Math.max(0, x.pending_request_count - 1);
      return json(200, null);
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
    // ---- Topluluklar ana sayfası (docs/history/185-*): sunucu kurallarının TAKLİDİ — asıl doğrulama supabase/tests/community-home.sql ----
    db.seen ??= new Map(); // gönderi kimliği → görülme zamanı
    const feedGroup = (post) => g(post.community_id);
    const feedVisible = (post) => { const x = feedGroup(post); return x && ["public", "restricted"].includes(x.visibility) && (x.visibility === "public" || Boolean(db.member(x.id, signedIn))); };
    if (table === "rpc/member_feed_page") {
      log("member_feed_page", body);
      let list = db.posts.filter((p) => feedGroup(p) && ["public", "restricted"].includes(feedGroup(p).visibility) && Boolean(db.member(p.community_id, signedIn)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      if (body.p_before_at) list = list.filter((p) => p.created_at < body.p_before_at || (p.created_at === body.p_before_at && p.id < body.p_before_id));
      return json(200, list.slice(0, body.p_limit ?? 12).map((p) => ({ post_id: p.id, community_id: p.community_id, created_at: p.created_at })));
    }
    if (table === "rpc/discover_feed_page") {
      log("discover_feed_page", body);
      const asOf = body.p_as_of ?? new Date().toISOString();
      const scored = db.posts
        .filter((p) => feedVisible(p) && p.author_id !== signedIn && p.created_at <= asOf && !(db.seen.has(p.id) && db.seen.get(p.id) < asOf))
        .map((p) => {
          const member = Boolean(db.member(p.community_id, signedIn));
          const followed = db.follows.some((f) => f.follower_id === signedIn && f.following_id === p.author_id);
          return { p, source: member ? "member" : followed ? "followed" : "public", base: (member ? 1 : 0) + (followed ? 2 : 0) + p.created_at.length * 0 + (Date.parse(p.created_at) % 1e6) / 1e12 };
        });
      const perCommunity = new Map();
      for (const e of scored.sort((a, b) => b.base - a.base || b.p.id.localeCompare(a.p.id))) { const n = perCommunity.get(e.p.community_id) ?? 0; perCommunity.set(e.p.community_id, n + 1); e.score = e.base - 0.75 * n; }
      const ordered = scored.sort((a, b) => b.score - a.score || b.p.id.localeCompare(a.p.id));
      return json(200, ordered.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 12)).map((e) => ({ post_id: e.p.id, community_id: e.p.community_id, source: e.source, score: e.score })));
    }
    if (table === "rpc/mark_community_posts_seen") {
      log("mark_community_posts_seen", body);
      let n = 0;
      for (const id of body.p_post_ids ?? []) { const p = db.posts.find((x) => x.id === id); if (p && feedVisible(p) && !db.seen.has(id)) { db.seen.set(id, new Date().toISOString()); n += 1; } }
      return json(200, n);
    }
    const relevanceOf = (x) => {
      const mine = new Set(db.groups.filter((m) => db.member(m.id, signedIn) && m.category !== "general").map((m) => m.category));
      return (mine.has(x.category) ? 3 : 0) + (db.reasons?.[x.id] ? 2 : 0) + Math.log(1 + x.member_count);
    };
    const reasonOf = (x) => db.reasons?.[x.id] ?? (new Set(db.groups.filter((m) => db.member(m.id, signedIn) && m.category !== "general").map((m) => m.category)).has(x.category) ? "category" : "popular");
    if (table === "rpc/recommend_communities") {
      log("recommend_communities", body);
      const list = db.groups
        .filter((x) => ["public", "restricted"].includes(x.visibility) && !x.closed_at && x.member_count < x.member_limit && myStatusOf(x) === "none")
        .sort((a, b) => relevanceOf(b) - relevanceOf(a))
        .map((x) => searchRow(x, { reason: reasonOf(x) }));
      return json(200, list.slice(0, body.p_limit ?? 10));
    }
    if (table === "rpc/browse_communities") {
      log("browse_communities", body);
      const term = (body.p_query ?? "").trim().toLowerCase();
      let list = db.groups.filter((x) => ["public", "restricted"].includes(x.visibility) && !x.closed_at && (!body.p_category || x.category === body.p_category) && (!term || x.name.toLowerCase().includes(term) || (x.description ?? "").toLowerCase().includes(term)));
      const sort = body.p_sort ?? "relevant";
      list = list.sort((a, b) => sort === "newest" ? b.created_at.localeCompare(a.created_at) : sort === "popular" || sort === "active" ? b.member_count - a.member_count : relevanceOf(b) - relevanceOf(a) || b.member_count - a.member_count);
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 20)).map((x) => searchRow(x, { reason: reasonOf(x) })));
    }

    if (table === "community_rule_acceptances" && method === "GET") {
      const cid = eq(q, "community_id");
      return rows(db.acceptances.filter((a) => a.user_id === signedIn && (!cid || a.community_id === cid)).map((a) => ({ rules_version: a.rules_version })));
    }

    // ---- akış ----
    if (table === "community_posts" && method === "GET") {
      const cid = eq(q, "community_id");
      const pinnedOnly = q.get("pinned_at")?.startsWith("not.is");
      const unpinned = q.get("pinned_at") === "is.null";
      const pid = eq(q, "id");
      const idList = (q.get("id") ?? "").match(/^in\.\((.*)\)$/)?.[1]?.split(",").map((x) => x.replace(/"/g, "")) ?? null;
      let list = db.posts.filter((p) => (!cid || p.community_id === cid) && (!pid || p.id === pid) && (!idList || idList.includes(p.id)) && (pinnedOnly ? p.pinned_at : unpinned ? !p.pinned_at : true));
      list = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
      const lim = Number(q.get("limit") ?? 0); if (lim) list = list.slice(0, lim);
      return rows(list.map((p) => ({
        id: p.id, community_id: p.community_id, kind: p.kind, like_count: p.like_count, comment_count: p.comment_count, save_count: p.save_count ?? 0, content_type: p.content_type, note: p.note, pinned_at: p.pinned_at, created_at: p.created_at, author: pub(userById(p.author_id)),
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
      const post = db.addPost(x.id, { author: userById(signedIn), type: body.p_content_type, title: own.title, note: body.p_note, kind: "application" });
      post.content = { id: own.id, title: own.title, visibility: own.visibility };
      return json(200, post.id);
    }
    // Oluşturma formu: yeni istek kaydı (yalnızca kimlik/zaman döner); kayıt, yerel gönderi RPC'sinin "sahibinin içeriği" listesine girer.
    if (table === "prompt_requests" && method === "POST") {
      // Topluluğa özgü içerik (docs/history/179-*): sunucu görünürlüğü private'a zorlar, taslağı reddeder, akış gönderisini kendiliğinden ekler.
      if (body.community_id) {
        const x = g(body.community_id);
        if (!x || !db.member(x.id, signedIn)) return json(403, { code: "P0001", message: "forbidden", details: "", hint: "" });
        if (body.is_draft) return json(400, { code: "P0001", message: "community_draft_not_allowed", details: "", hint: "" });
        if (x.closed_at) return json(400, { code: "P0001", message: "community_closed", details: "", hint: "" });
        const post = db.addPost(x.id, { author: userById(signedIn), type: "request", title: body.title, kind: "native", visibility: "private" });
        post.content = { id: body.id, title: body.title, visibility: "private" };
      }
      db.ownContent.request.push({ id: body.id, title: body.title, visibility: body.visibility, draft: Boolean(body.is_draft) });
      return json(201, { id: body.id, created_at: db.stamp() });
    }

    // ---- koleksiyonlar ve kaydetme (docs/history/184-*) ----
    if (table === "rpc/get_or_create_own_default_collection") return json(200, null);
    if (table === "collections" && method === "GET") {
      const owner = eq(q, "owner_id"); const id = eq(q, "id");
      const found = db.collections.filter((c) => (!owner || c.owner_id === owner) && (!id || c.id === id)).map((c) => ({ ...c, profiles: pub(userById(c.owner_id)) }));
      return id ? json(200, found[0] ?? null) : rows(found);
    }
    if (table === "collection_items") {
      const TARGETS = ["prompt_id", "workflow_id", "preset_id", "community_post_id"];
      const inList = (col) => { const m = (q.get(col) ?? "").match(/^in\.\((.*)\)$/); return m ? m[1].split(",").map((x) => x.replace(/"/g, "")) : null; };
      if (method === "GET") {
        const owner = q.get("collections.owner_id")?.replace("eq.", "") ?? null;
        const colId = eq(q, "collection_id");
        const list = db.collectionItems.filter((i) => {
          const col = db.collections.find((c) => c.id === i.collection_id);
          if (owner && col?.owner_id !== owner) return false;
          if (colId && i.collection_id !== colId) return false;
          return TARGETS.every((t) => { const v = eq(q, t); const ids = inList(t); return (!v || i[t] === v) && (!ids || ids.includes(i[t])); });
        });
        return rows(list.map((i) => ({ ...i, collections: { owner_id: db.collections.find((c) => c.id === i.collection_id)?.owner_id }, prompts: null, workflows: null, presets: null })));
      }
      if (method === "POST") {
        const target = TARGETS.find((t) => body[t]);
        const col = db.collections.find((c) => c.id === body.collection_id);
        if (!col || col.owner_id !== signedIn) return json(403, { code: "42501", message: "forbidden", details: "", hint: "" });
        if (body.community_post_id) {
          const post = db.posts.find((p) => p.id === body.community_post_id);
          if (!post) return json(400, { code: "P0001", message: "community_post_not_found", details: "", hint: "" });
          if (post.kind === "native" || post.content_type === "request") return json(400, { code: "P0001", message: "community_post_not_savable", details: "", hint: "" });
          if (!db.member(post.community_id, signedIn) && g(post.community_id).visibility !== "public") return json(400, { code: "P0001", message: "community_content_not_readable", details: "", hint: "" });
        }
        if (db.collectionItems.some((i) => i.collection_id === body.collection_id && i[target] === body[target])) return json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: "", hint: "" });
        db.collectionItems.push({ id: crypto.randomUUID(), created_at: db.stamp(), ...body });
        col.item_count += 1;
        if (body.community_post_id) {
          const owns = db.collectionItems.filter((i) => i.community_post_id === body.community_post_id && db.collections.find((c) => c.id === i.collection_id)?.owner_id === signedIn).length;
          if (owns === 1) db.posts.find((p) => p.id === body.community_post_id).save_count = (db.posts.find((p) => p.id === body.community_post_id).save_count ?? 0) + 1;
        }
        return json(201, {});
      }
      if (method === "DELETE") {
        const colId = eq(q, "collection_id");
        const target = TARGETS.find((t) => eq(q, t));
        const before = db.collectionItems.length;
        db.collectionItems = db.collectionItems.filter((i) => !(i.collection_id === colId && target && i[target] === eq(q, target)));
        const col = db.collections.find((c) => c.id === colId);
        if (col) col.item_count = Math.max(0, col.item_count - (before - db.collectionItems.length));
        if (target === "community_post_id" && before > db.collectionItems.length) {
          const stillSaved = db.collectionItems.some((i) => i.community_post_id === eq(q, target) && db.collections.find((c) => c.id === i.collection_id)?.owner_id === signedIn);
          const post = db.posts.find((p) => p.id === eq(q, target));
          if (post && !stillSaved) post.save_count = Math.max(0, (post.save_count ?? 0) - 1);
        }
        return json(200, []);
      }
    }

    // ---- gönderinin KENDİ beğenisi / yorumları (docs/history/178-*) ----
    const engageGuard = (postId) => {
      const post = db.posts.find((p) => p.id === postId);
      if (!post) return "post_not_found";
      if (!db.member(post.community_id, signedIn)) return "forbidden";
      if (g(post.community_id).closed_at) return "community_closed";
      return null;
    };
    if (table === "prompt_likes") {
      if (method === "GET") {
        const listed = (q.get("community_post_id") ?? "").match(/^in\.\((.*)\)$/);
        const ids = listed ? listed[1].split(",").map((x) => x.replace(/"/g, "")) : null;
        const uid = eq(q, "user_id");
        return rows(db.likes.filter((l) => (!uid || l.user_id === uid) && (!ids || ids.includes(l.community_post_id))).map((l) => ({ community_post_id: l.community_post_id })));
      }
      if (method === "POST") {
        const failure = body.community_post_id ? engageGuard(body.community_post_id) : null;
        if (failure) return json(400, { code: "P0001", message: failure, details: "", hint: "" });
        if (db.likes.some((l) => l.community_post_id === body.community_post_id && l.user_id === body.user_id)) return json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: "", hint: "" });
        db.likes.push({ community_post_id: body.community_post_id, user_id: body.user_id });
        db.posts.find((p) => p.id === body.community_post_id).like_count += 1;
        return json(201, {});
      }
      if (method === "DELETE") {
        const post = db.posts.find((p) => p.id === eq(q, "community_post_id"));
        const before = db.likes.length;
        db.likes = db.likes.filter((l) => !(l.community_post_id === eq(q, "community_post_id") && l.user_id === eq(q, "user_id")));
        if (post && db.likes.length < before) post.like_count = Math.max(0, post.like_count - 1);
        return json(200, []);
      }
    }
    if (table === "prompt_comments") {
      const COMMENT_COLS = (c) => ({ id: c.id, body: c.body, parent_id: c.parent_id ?? null, like_count: 0, created_at: c.created_at, edited_at: null, deleted_at: null, profiles: pub(userById(c.author_id)) });
      if (method === "GET") {
        const cp = eq(q, "community_post_id"); const pr = eq(q, "prompt_id");
        // Sayfalı yorum ağacı (docs/history/258-*): üst düzey (parent_id=is.null) + range, yanıtlar parent_id=in.(…), tek yorum id=eq.
        const parents = (q.get("parent_id") ?? "").startsWith("in.(") ? q.get("parent_id").slice(4, -1).split(",").map((x) => x.replace(/"/g, "")) : null;
        const byId = eq(q, "id");
        let list = db.comments.filter((c) => (byId ? c.id === byId : parents ? parents.includes(c.parent_id) : cp ? c.community_post_id === cp : pr ? c.prompt_id === pr : false));
        if (q.get("parent_id") === "is.null") list = list.filter((c) => !c.parent_id);
        list = list.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        db.commentQueries = [...(db.commentQueries ?? []), { parent: q.get("parent_id"), offset: Number(q.get("offset") ?? 0), limit: Number(q.get("limit") ?? 0) }];
        if (q.get("limit")) list = list.slice(Number(q.get("offset") ?? 0), Number(q.get("offset") ?? 0) + Number(q.get("limit")));
        return rows(list.map(COMMENT_COLS));
      }
      if (method === "POST") {
        if (body.community_post_id) {
          const failure = engageGuard(body.community_post_id);
          if (failure) return json(400, { code: "P0001", message: failure, details: "", hint: "" });
          if (body.parent_id && db.comments.find((c) => c.id === body.parent_id)?.community_post_id !== body.community_post_id) return json(400, { code: "P0001", message: "invalid_parent", details: "", hint: "" });
          db.posts.find((p) => p.id === body.community_post_id).comment_count += 1;
        }
        const row = { id: crypto.randomUUID(), created_at: db.stamp(), ...body };
        db.comments.push(row);
        return json(201, COMMENT_COLS(row));
      }
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
      const needle = /ilike\.%(.*)%/.exec(q.get("title") ?? "")?.[1]?.toLowerCase();
      db.shareQueries = [...(db.shareQueries ?? []), { type, limit: Number(q.get("limit") ?? 0), search: needle ?? "" }];
      return rows(db.ownContent[type].filter((c) => c.visibility !== "private" && (!needle || c.title.toLowerCase().includes(needle))).slice(0, Number(q.get("limit") ?? 0) || undefined).map((c) => ({ id: c.id, title: c.title })));
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
      db.eventQueries = [...(db.eventQueries ?? []), { limit: Number(q.get("limit") ?? 0), scope: lt ? "past" : "upcoming" }];
      const lim = Number(q.get("limit") ?? 0);
      return rows(db.events.filter((e) => e.community_id === cid && (!gte || e.starts_at >= gte) && (!lt || e.starts_at < lt)).sort((a, b) => (lt ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at))).slice(0, lim || undefined).map((e) => { const copy = { ...e }; delete copy.rsvps; return copy; }));
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
    // Merkezi şikâyet (docs/history/284-*): topluluk gönderisi / sohbet mesajı `community_reports`'a yönlenir.
    if (table === "rpc/submit_report") {
      log("submit_report", body);
      // Topluluğun kendisi (docs/history/305-*): sunucuda `reports`'a yazılır; moderatör kuyruğu bu taklitte yok, yalnız kabul edilir.
      if (body.p_target_type === "community") return g(body.p_target_id) ? json(200, crypto.randomUUID()) : err("report_target_not_found");
      const kind = body.p_target_type === "community_post" ? "post" : body.p_target_type === "chat_message" ? "message" : null;
      if (!kind) return err("report_target_not_found");
      const cid = kind === "post" ? db.posts.find((p) => p.id === body.p_target_id)?.community_id : db.messages.find((m) => m.id === body.p_target_id)?.conversation_id;
      if (!cid) return err("report_target_not_found");
      if (!db.member(cid, signedIn)) return err("forbidden");
      db.reports.push({ id: crypto.randomUUID(), community_id: cid, reporter_id: signedIn, target_kind: kind, post_id: kind === "post" ? body.p_target_id : null, message_id: kind === "message" ? body.p_target_id : null, target_user_id: null, reason: body.p_reason_code, reason_code: body.p_reason_code, details: body.p_details, status: "open", resolution: null, created_at: db.stamp(), resolved_at: null });
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
