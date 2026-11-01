// Stateful in-memory stand-in for the slice of Supabase REST the messaging screens use.
export const ME = "11111111-1111-4111-8111-111111111111";
const mk = (n, username, name) => ({ id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`, username, display_name: name, avatar_url: null, cover_url: null, bio: null, website: null, follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [], message_privacy: "everyone", email: `${username}@secret.dev`, phone: "555" });
export const U = {
  alice: { ...mk("1", "alice", "Alice") },
  bob: mk("2", "bobby", "Bob"),
  carol: mk("3", "carol", "Carol"),
  dave: mk("4", "dave", "Dave"),
  amy: mk("5", "amy", "Amy"),
  zed: mk("6", "zed", "Zed"),
  erin: mk("7", "erin", "Erin"),
  locked: mk("8", "locked", "Locked"),
  blockedme: mk("9", "blockedme", "Blockedby"),
  iblocked: mk("a", "iblocked", "Iblocked"),
};
U.locked.message_privacy = "followers_only";
const DEFAULT_PERMS = {
  admin: { edit_settings: true, change_visibility: true, manage_invites: true, manage_requests: true, remove_members: true, ban_members: true, manage_roles: true, delete_messages: true, pin_messages: true },
  moderator: { edit_settings: false, change_visibility: false, manage_invites: false, manage_requests: true, remove_members: true, ban_members: false, manage_roles: false, delete_messages: true, pin_messages: true },
};
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pub = (p) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, p[c]]));

export function createDb() {
  const db = {
    users: U,
    conversations: [], // { id, last_message_at }
    members: [], // { conversation_id, user_id, status, unread_count, archived_at, deleted_at, cleared_at }
    messages: [], // MessageRow
    groups: [], // chat_groups rows (id = conversation id)
    requests: [], // chat_group_join_requests { id, group_id, user_id, message, status, created_at }
    invitations: [], // chat_group_invitations { id, group_id, invitee_id, inviter_id, status, created_at, expires_at }
    rpc: {}, // optional per-test overrides: name -> (body, db) => ({ status, body })
    follows: [], // { follower_id, following_id }
    blocks: [], // { blocker_id, blocked_id }
    calls: [], // { method, table, body }
    failMemberPatch: false,
    patchDelayMs: 0,
    searchSelects: [],
    pins: [], // pinned_messages { message_id, conversation_id, pinned_by, pinned_at }
    stars: [], // message_stars { user_id, message_id, created_at }
    readCalls: [], // mark_conversation_read_up_to çağrıları
    clock: 0,
  };
  db.stamp = () => new Date(Date.UTC(2026, 5, 1, 0, 0, ++db.clock)).toISOString();
  db.follow = (a, b) => db.follows.push({ follower_id: a.id, following_id: b.id });
  /** Seeds a 1:1 conversation between ME and `other`. */
  db.addConv = (id, other, { status = "accepted", my = {}, theirs = {}, texts = [] } = {}) => {
    db.conversations.push({ id, last_message_at: db.stamp() });
    const mine = { conversation_id: id, user_id: ME, status, unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null };
    const their = { conversation_id: id, user_id: other.id, status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null };
    db.members.push(mine, their);
    texts.forEach((text, i) => db.addMessage(id, i % 2 === 0 ? other.id : ME, text));
    Object.assign(mine, my); Object.assign(their, theirs); // overrides AFTER the messages (the resurface trigger would undo them)
    return id;
  };
  /** Seeds a group conversation; `members` = [[user, role], …]; ME is added with `myRole`. */
  db.addGroup = (id, { name = "Tasarım Atölyesi", visibility = "private", myRole = "member", members = [], posting_policy = "members", member_limit = 100, description = null, texts = [], pending = 0, muted = false, permissions = null } = {}) => {
    db.conversations.push({ id, last_message_at: db.stamp(), kind: "group" });
    const base = { status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null };
    db.members.push({ conversation_id: id, user_id: ME, role: myRole, ...base, muted_at: muted ? db.stamp() : null });
    for (const [u, role] of members) db.members.push({ conversation_id: id, user_id: u.id, role, ...base });
    db.groups.push({ id, name, description, avatar_url: null, visibility, posting_policy, member_limit, member_count: db.members.filter((m) => m.conversation_id === id).length, pending_request_count: pending, history_visible: false, members_can_pin: false, role_permissions: structuredClone(permissions ?? DEFAULT_PERMS), created_at: "2026-01-01T00:00:00Z", category: "general", feed_policy: "members", rules: null, rules_version: 1, rules_required: false, closed_at: null, post_count: 0, origin: "native" });
    texts.forEach(([u, text]) => db.addMessage(id, u.id, text));
    return id;
  };
  db.addMessage = (conversation_id, sender_id, body) => {
    const created_at = db.stamp();
    const row = { id: crypto.randomUUID(), conversation_id, sender_id, body, shared_prompt_id: null, shared_request_id: null, reply_to_message_id: null, attachments: [], edited_at: null, deleted_at: null, created_at };
    db.messages.push(row);
    const conv = db.conversations.find((c) => c.id === conversation_id);
    if (conv) conv.last_message_at = created_at;
    // resurface_conversation_on_message trigger
    for (const m of db.members) if (m.conversation_id === conversation_id && !m.muted_at) { m.archived_at = null; m.deleted_at = null; }
    return row;
  };
  db.member = (conversation_id, user_id) => db.members.find((m) => m.conversation_id === conversation_id && m.user_id === user_id);
  db.isBlocked = (a, b) => db.blocks.some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
  db.hasConv = (a, b) => db.members.some((m) => m.user_id === a && db.members.some((n) => n.conversation_id === m.conversation_id && n.user_id === b));
  db.messageable = (id) => {
    const p = Object.values(U).find((u) => u.id === id);
    if (!p || id === ME || db.isBlocked(ME, id)) return false;
    if (db.hasConv(ME, id)) return true;
    return p.message_privacy !== "followers_only" || db.follows.some((f) => f.follower_id === id && f.following_id === ME);
  };
  return db;
}

const val = (v, op) => (v?.startsWith(`${op}.`) ? v.slice(op.length + 1) : null);
const inList = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : null);
function filterRows(list, q, cols) {
  return list.filter((r) => cols.every((c) => {
    const v = q.get(c);
    if (v == null) return true;
    const e = val(v, "eq"); const n = val(v, "neq"); const l = inList(v); const g = val(v, "gt"); const lt = val(v, "lt");
    if (e != null) return String(r[c]) === e;
    if (n != null) return String(r[c]) !== n;
    if (l) return l.includes(String(r[c]));
    if (g != null) return String(r[c]) > g;
    if (lt != null) return String(r[c]) < lt;
    return true;
  }));
}

export async function installMock(context, db, opts = {}) {
  // `guest: true` → oturum açmamış ziyaretçi (localStorage'da oturum yok, `signedIn` boş; auth uçları 401 döner).
  const guest = Boolean(opts.guest);
  const signedIn = guest ? null : (opts.signedIn ?? ME);
  await context.route("https://example.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const q = url.searchParams;
    const accept = req.headers()["accept"] ?? "";
    const wantsObject = accept.includes("vnd.pgrst.object");
    const method = req.method();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*" }, body: JSON.stringify(body) });
    const rows = (list) => (wantsObject ? (list.length === 1 ? json(200, list[0]) : json(406, { code: "PGRST116", message: "no rows", details: "", hint: "" })) : json(200, list));
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    // OAuth sunucusu (docs/history/316-*): `db.oauth(method, path, body, query)` varsa onay/izin uçlarını o yanıtlar.
    if ((p.startsWith("/auth/v1/oauth/authorizations/") || p.startsWith("/auth/v1/user/oauth/grants")) && db.oauth) {
      const result = db.oauth(method, p, req.postData() ? JSON.parse(req.postData()) : null, Object.fromEntries(q.entries()));
      return json(result.status ?? 200, result.body ?? null);
    }
    if (p.startsWith("/auth/v1/user") && guest) return json(401, { message: "not authenticated" });
    if (p.startsWith("/auth/v1/user")) return json(200, { id: signedIn, aud: "authenticated", role: "authenticated", email: "alice@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    // Storage: özel bucket'lar için signed URL (docs/history/177-*). Ortak /object/public/… adresi İSTEKLE çekilirse kaydedilir (sızıntı testi).
    if (p.startsWith("/storage/v1/object/sign/") && method === "POST") {
      const bucket = p.split("/")[5];
      const sbody = JSON.parse(req.postData() || "{}");
      db.calls.push({ method: "SIGN", table: bucket, body: sbody });
      return json(200, (sbody.paths ?? []).map((path) => ({ error: null, path, signedURL: `/object/sign/${bucket}/${path}?token=t` })));
    }
    if (p.startsWith("/storage/v1/object/sign/")) return route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
    if (p.startsWith("/storage/v1/object/public/")) { db.calls.push({ method: "PUBLICGET", table: p, body: null }); return route.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ message: "Bucket not found" }) }); }
    // Storage yüklemesi (docs/history/191-*): bucket/yol + gönderilen bayt sayısı kaydedilir (otomatik küçültme testleri boyutu denetler).
    if (p.startsWith("/storage/v1/object/") && method === "POST") {
      const buf = req.postDataBuffer();
      const key = p.replace("/storage/v1/object/", "");
      db.calls.push({ method: "UPLOAD", table: key, body: { size: buf?.length ?? 0, contentType: req.headers()["content-type"] ?? "" } });
      return json(200, { Key: key });
    }
    if (!p.startsWith("/rest/v1/")) return json(200, {});
    const table = p.replace("/rest/v1/", "");
    const sel = q.get("select") ?? "";
    const body = method === "POST" || method === "PATCH" ? JSON.parse(req.postData() || "{}") : null;
    if (method !== "GET") db.calls.push({ method, table, body, query: Object.fromEntries(q) });


    // ---- grup sohbeti RPC'leri (docs/history/172-*) ----
    const groupOf = (gid) => db.groups.find((g) => g.id === gid);
    const roleOf = (gid, uid = signedIn) => db.member(gid, uid)?.role ?? null;
    const err = (code) => json(400, { code: "P0001", message: code, details: "", hint: "" });
    if (table.startsWith("rpc/") && db.rpc[table.slice(4)]) { const r = db.rpc[table.slice(4)](body, db); return json(r.status ?? 200, r.body ?? null); }
    // Topluluk uçları (docs/history/175-*): mock-communities.mjs `db.extraRoutes`'u kurar.
    if (db.extraRoutes) {
      let used = false;
      const flag = (fn) => (...a) => { used = true; return fn(...a); };
      const result = await db.extraRoutes({ table, method, q, body, sel, signedIn, json: flag(json), rows: flag(rows), err: flag(err), route });
      if (used || result) return;
    }
    if (table === "rpc/conversation_last_messages") {
      const out = [];
      for (const cid of body.p_conversation_ids ?? []) {
        const mine = db.member(cid, signedIn); if (!mine) continue;
        const list = db.messages.filter((m) => m.conversation_id === cid && (!mine.cleared_at || m.created_at > mine.cleared_at));
        const last = list.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (last) out.push(last);
      }
      return json(200, out);
    }
    if (table === "rpc/create_chat_group") {
      const name = String(body.p_name ?? "").trim();
      if (!name || name.length > 60) return err("invalid_name");
      const id = crypto.randomUUID();
      db.conversations.push({ id, last_message_at: db.stamp(), kind: "group" });
      db.members.push({ conversation_id: id, user_id: signedIn, role: "owner", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
      db.groups.push({ id, name, description: body.p_description ?? null, avatar_url: body.p_avatar_url ?? null, visibility: body.p_visibility, posting_policy: "members", member_limit: body.p_member_limit, member_count: 1, pending_request_count: 0, created_at: db.stamp() });
      const skipped = (body.p_invite_user_ids ?? []).filter((u) => db.isBlocked(signedIn, u)).map((u) => ({ user_id: u, reason: "blocked" }));
      return json(200, { group_id: id, invited_count: (body.p_invite_user_ids ?? []).length - skipped.length, skipped });
    }
    if (table === "rpc/set_chat_group_visibility") {
      const g = groupOf(body.p_group_id);
      if (!g || !["owner", "admin"].includes(roleOf(g.id) ?? "")) return err("forbidden");
      if (g.visibility === body.p_visibility) return json(200, { changed: false, visibility: g.visibility, accepted_count: 0, already_member_count: 0, skipped_count: 0, skipped: [], pending_remaining: g.pending_request_count, member_count: g.member_count });
      g.visibility = body.p_visibility;
      let accepted = 0; const skipped = [];
      if (body.p_visibility === "public") {
        for (const r of db.requests.filter((x) => x.group_id === g.id && x.status === "pending")) {
          if (g.member_count >= g.member_limit) { skipped.push({ request_id: r.id, user_id: r.user_id, reason: "member_limit" }); continue; }
          if (db.isBlocked(signedIn, r.user_id)) { skipped.push({ request_id: r.id, user_id: r.user_id, reason: "blocked" }); continue; }
          r.status = "accepted"; accepted += 1; g.member_count += 1;
          db.members.push({ conversation_id: g.id, user_id: r.user_id, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
        }
        g.pending_request_count = db.requests.filter((x) => x.group_id === g.id && x.status === "pending").length;
      }
      return json(200, { changed: true, visibility: g.visibility, accepted_count: accepted, already_member_count: 0, skipped_count: skipped.length, skipped, pending_remaining: g.pending_request_count, member_count: g.member_count });
    }
    if (table === "rpc/moderate_chat_group_message") {
      const m = db.messages.find((x) => x.id === body.p_message_id);
      if (!m) return err("message_not_found");
      const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
      if (rank[roleOf(m.conversation_id) ?? "member"] < 2 || rank[roleOf(m.conversation_id, m.sender_id) ?? "member"] >= rank[roleOf(m.conversation_id)]) return err("forbidden");
      m.deleted_at = db.stamp(); m.body = null;
      return json(200, null);
    }
    if (table === "rpc/remove_chat_group_member") {
      const g = groupOf(body.p_group_id); const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
      const actor = roleOf(g?.id); const target = roleOf(g?.id, body.p_user_id);
      if (!actor || !target || rank[target] >= rank[actor] || (actor === "moderator" && target !== "member") || (body.p_ban && !["owner", "admin"].includes(actor))) return err("forbidden");
      db.members = db.members.filter((m) => !(m.conversation_id === g.id && m.user_id === body.p_user_id)); g.member_count -= 1;
      return json(200, null);
    }
    if (table === "rpc/set_chat_group_member_role") {
      const m = db.member(body.p_group_id, body.p_user_id);
      if (!m || !["owner", "admin"].includes(roleOf(body.p_group_id) ?? "")) return err("forbidden");
      m.role = body.p_role; return json(200, null);
    }
    if (table === "rpc/transfer_chat_group_ownership") {
      if (roleOf(body.p_group_id) !== "owner") return err("forbidden");
      db.member(body.p_group_id, signedIn).role = "admin"; db.member(body.p_group_id, body.p_user_id).role = "owner";
      return json(200, null);
    }
    if (table === "rpc/update_chat_group_owner_settings") {
      const g = groupOf(body.p_group_id);
      if (roleOf(body.p_group_id) !== "owner") return err("forbidden");
      const patch = body.p_patch ?? {};
      if ("history_visible" in patch) g.history_visible = patch.history_visible;
      if ("members_can_pin" in patch) g.members_can_pin = patch.members_can_pin;
      for (const [role, caps] of Object.entries(patch.role_permissions ?? {})) Object.assign(g.role_permissions[role], caps);
      return json(200, { changed: true });
    }
    if (table === "rpc/update_chat_group") {
      const g = groupOf(body.p_group_id);
      if (!["owner", "admin"].includes(roleOf(body.p_group_id) ?? "")) return err("forbidden");
      const patch = body.p_patch ?? {};
      for (const [k, v] of Object.entries(patch)) g[k === "description" ? "description" : k] = v === "" ? null : v;
      return json(200, { changed: true });
    }
    if (table === "rpc/invite_to_chat_group") {
      if (!["owner", "admin"].includes(roleOf(body.p_group_id) ?? "")) return err("forbidden");
      const skipped = []; let invited = 0;
      for (const uid of body.p_user_ids ?? []) {
        if (db.isBlocked(signedIn, uid)) skipped.push({ user_id: uid, reason: "blocked" });
        else if (db.member(body.p_group_id, uid)) skipped.push({ user_id: uid, reason: "already_member" });
        else { invited += 1; db.invitations.push({ id: crypto.randomUUID(), group_id: body.p_group_id, invitee_id: uid, inviter_id: signedIn, status: "pending", created_at: db.stamp(), expires_at: "2099-01-01T00:00:00Z" }); }
      }
      return json(200, { invited_count: invited, skipped });
    }
    if (table === "rpc/create_chat_group_link") {
      if (!["owner", "admin"].includes(roleOf(body.p_group_id) ?? "")) return err("forbidden");
      return json(200, { link_id: crypto.randomUUID(), token: "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-xyzab", expires_at: "2099-01-01T00:00:00Z", max_uses: body.p_max_uses });
    }
    if (table === "rpc/decide_chat_group_join_request") {
      const r = db.requests.find((x) => x.id === body.p_request_id);
      if (!r) return err("request_not_found");
      if (!["owner", "admin", "moderator"].includes(roleOf(r.group_id) ?? "")) return err("forbidden");
      if (r.status !== "pending") return err("invalid_state");
      const g = groupOf(r.group_id);
      r.status = body.p_accept ? "accepted" : "rejected"; g.pending_request_count -= 1;
      if (body.p_accept) { g.member_count += 1; db.members.push({ conversation_id: g.id, user_id: r.user_id, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null }); }
      return json(200, { outcome: body.p_accept ? "accepted" : "rejected" });
    }
    if (table === "rpc/chat_group_members" || table === "rpc/community_members") {
      if (!db.member(body.p_group_id, signedIn)) return json(200, []);
      const term = (body.p_search ?? "").toLowerCase();
      const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
      const list = db.members.filter((m) => m.conversation_id === body.p_group_id && (!body.p_role || m.role === body.p_role)).map((m) => ({ m, u: Object.values(U).find((x) => x.id === m.user_id) }))
        .filter(({ u }) => !term || u.username.includes(term) || u.display_name.toLowerCase().includes(term))
        .sort((a, b) => rank[b.m.role] - rank[a.m.role]);
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 50)).map(({ m, u }) => ({ user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, role: m.role, joined_at: "2026-01-01T00:00:00Z" })));
    }
    if (table === "rpc/discover_chat_groups") {
      const term = (body.p_query ?? "").toLowerCase();
      const list = db.groups.filter((g) => g.visibility === "public" && (!term || g.name.toLowerCase().includes(term) || (g.description ?? "").toLowerCase().includes(term)))
        .map((g) => ({ id: g.id, name: g.name, description: g.description, avatar_url: null, member_count: g.member_count, member_limit: g.member_limit, created_at: g.created_at, last_message_at: null, my_status: db.member(g.id, signedIn) ? "member" : db.invitations.some((i) => i.group_id === g.id && i.invitee_id === signedIn && i.status === "pending") ? "invited" : "none" }));
      return json(200, list.slice(body.p_offset ?? 0, (body.p_offset ?? 0) + (body.p_limit ?? 20)));
    }
    if (table === "rpc/join_chat_group") {
      const g = groupOf(body.p_group_id);
      if (!g || g.visibility !== "public") return err("group_not_found");
      if (db.member(g.id, signedIn)) return json(200, { outcome: "already_member", group_id: g.id });
      if (g.member_count >= g.member_limit) return err("member_limit_reached");
      g.member_count += 1;
      db.members.push({ conversation_id: g.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null });
      return json(200, { outcome: "joined", group_id: g.id });
    }
    if (table === "rpc/preview_chat_group_link" || table === "rpc/join_chat_group_via_link") {
      const g = db.groups.find((x) => x.link_token && x.link_token === body.p_token);
      if (!g) return table === "rpc/preview_chat_group_link" ? json(200, { valid: false }) : err("invalid_link");
      const member = db.member(g.id, signedIn);
      const pending = db.requests.some((r) => r.group_id === g.id && r.user_id === signedIn && r.status === "pending");
      if (table === "rpc/preview_chat_group_link") return json(200, { valid: true, group_id: member ? g.id : null, name: g.name, description: g.description, avatar_url: null, visibility: g.visibility, member_count: g.member_count, member_limit: g.member_limit, my_status: member ? "member" : pending ? "requested" : "none" });
      if (member) return json(200, { outcome: "already_member", group_id: g.id });
      if (g.visibility === "public") { g.member_count += 1; db.members.push({ conversation_id: g.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null }); return json(200, { outcome: "joined", group_id: g.id }); }
      if (pending) return json(200, { outcome: "already_requested", group_id: null });
      db.requests.push({ id: crypto.randomUUID(), group_id: g.id, user_id: signedIn, message: body.p_message ?? null, status: "pending", created_at: db.stamp() });
      g.pending_request_count += 1;
      return json(200, { outcome: "requested", group_id: null });
    }
    if (table === "rpc/leave_chat_group") {
      const g = groupOf(body.p_group_id); const role = roleOf(body.p_group_id);
      if (!role) return err("not_a_member");
      if (role === "owner" && g.member_count > 1) return err("owner_must_transfer");
      db.members = db.members.filter((m) => !(m.conversation_id === g.id && m.user_id === signedIn)); g.member_count -= 1;
      return json(200, null);
    }
    if (table === "rpc/respond_chat_group_invitation") {
      const inv = db.invitations.find((i) => i.id === body.p_invitation_id && i.invitee_id === signedIn);
      if (!inv || inv.status !== "pending") return err("invalid_state");
      inv.status = body.p_accept ? "accepted" : "declined";
      if (body.p_accept) { const g = groupOf(inv.group_id); g.member_count += 1; db.members.push({ conversation_id: g.id, user_id: signedIn, role: "member", status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null, muted_at: null }); return json(200, { outcome: "accepted", group_id: g.id }); }
      return json(200, { outcome: "declined" });
    }
    if (table === "chat_group_join_requests" && method === "GET") {
      const gid = val(q.get("group_id") ?? "", "eq"); const uid = val(q.get("user_id") ?? "", "eq");
      const list = db.requests.filter((r) => r.status === "pending" && (!gid || r.group_id === gid) && (!uid || r.user_id === uid));
      return rows(list.map((r) => ({ ...r, profiles: pub(Object.values(U).find((u) => u.id === r.user_id)), chat_groups: groupOf(r.group_id) })));
    }
    if (table === "chat_group_invitations" && method === "GET") {
      const invitee = val(q.get("invitee_id") ?? "", "eq"); const gid = val(q.get("group_id") ?? "", "eq");
      const list = db.invitations.filter((i) => i.status === "pending" && (!invitee || i.invitee_id === invitee) && (!gid || i.group_id === gid));
      return rows(list.map((i) => ({ ...i, chat_groups: groupOf(i.group_id), inviter: pub(Object.values(U).find((u) => u.id === i.inviter_id)), invitee: pub(Object.values(U).find((u) => u.id === i.invitee_id)) })));
    }
    if ((table === "chat_group_links" || table === "chat_group_bans") && method === "GET") return rows([]);
    // `chat_groups` satırını yalnız ÜYE okur (docs/history/177-*): üye olmayan kartı `rpc/community_cards` ile alır.
    if (table === "chat_groups" && method === "GET") return rows(db.groups.filter((g) => (!val(q.get("id") ?? "", "eq") || g.id === val(q.get("id"), "eq")) && db.member(g.id, signedIn)));

    // ---- sohbet geliştirmeleri (docs/history/174-*): okundu imleci, mesaj bilgisi, sabitleme, arama, yıldız ----
    const memberOf = (cid, uid = signedIn) => db.member(cid, uid);
    if (table === "rpc/mark_conversation_read_up_to") {
      const m = memberOf(body.p_conversation_id);
      if (!m) return err("not_a_member");
      db.readCalls.push({ conversation_id: body.p_conversation_id, up_to: body.p_up_to });
      const max = db.messages.filter((x) => x.conversation_id === m.conversation_id).map((x) => x.created_at).sort().pop() ?? null;
      const target = max && body.p_up_to > max ? max : body.p_up_to;
      if (!m.last_read_at || target > m.last_read_at) { m.last_read_at = target; m.last_read_updated_at = db.stamp(); }
      m.unread_count = db.messages.filter((x) => x.conversation_id === m.conversation_id && x.sender_id !== signedIn && !x.deleted_at && x.created_at > m.last_read_at).length;
      return json(200, m.last_read_at);
    }
    if (table === "rpc/message_read_receipts") {
      const msg = db.messages.find((x) => x.id === body.p_message_id);
      if (!msg || msg.deleted_at) return err("message_not_found");
      if (msg.sender_id !== signedIn || !memberOf(msg.conversation_id)) return err("forbidden");
      const list = db.members.filter((m) => m.conversation_id === msg.conversation_id && m.user_id !== signedIn).map((m) => {
        const u = Object.values(U).find((x) => x.id === m.user_id);
        const read = Boolean(m.last_read_at && m.last_read_at >= msg.created_at);
        return { user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, has_read: read, read_at: read ? (m.last_read_updated_at ?? m.last_read_at) : null };
      });
      return json(200, list);
    }
    if (table === "rpc/set_message_pinned") {
      const msg = db.messages.find((x) => x.id === body.p_message_id);
      if (!msg || msg.deleted_at || !memberOf(msg.conversation_id)) return err("message_not_found");
      const conv = db.conversations.find((c) => c.id === msg.conversation_id);
      if (conv?.kind === "group") {
        const g = groupOf(conv.id); const role = roleOf(conv.id);
        const caps = g.role_permissions?.[role];
        const allowed = role === "owner" || (caps ? (caps.pin_messages ?? true) : false) || (role === "member" && g.members_can_pin);
        if (!allowed) return err("forbidden");
      }
      db.pinCalls = [...(db.pinCalls ?? []), { message_id: msg.id, pinned: body.p_pinned }];
      const exists = db.pins.some((x) => x.message_id === msg.id);
      if (body.p_pinned && !exists) {
        if (db.pins.filter((x) => x.conversation_id === msg.conversation_id).length >= 20) return err("pin_limit_reached");
        db.pins.push({ message_id: msg.id, conversation_id: msg.conversation_id, pinned_by: signedIn, pinned_at: db.stamp() });
      } else if (!body.p_pinned) db.pins = db.pins.filter((x) => x.message_id !== msg.id);
      return json(200, { pinned: body.p_pinned });
    }
    if (table === "pinned_messages" && method === "GET") {
      const cid = val(q.get("conversation_id") ?? "", "eq");
      if (!cid || !memberOf(cid)) return rows([]);
      return rows(db.pins.filter((x) => x.conversation_id === cid).sort((a, b) => b.pinned_at.localeCompare(a.pinned_at)));
    }
    // Paylaşılan fotoğraf/içerik/bağlantı (docs/history/271-*): sunucudaki `chat_shared_stats` / `chat_shared_items` ile aynı kurallar.
    if (table === "rpc/chat_shared_stats" || table === "rpc/chat_shared_items") {
      const mine = memberOf(body.p_conversation_id);
      const hidden = db.hidden ?? [];
      const isContent = (m) => Boolean(m.shared_prompt_id || m.shared_request_id || /\/(workflows|presets|spaces)\/local\?id=[0-9a-f-]{36}|\/communities\/post\/local\?id=[0-9a-f-]{36}/i.test(m.body ?? ""));
      const isLink = (m) => !isContent(m) && /https?:\/\/\S+/i.test(m.body ?? "");
      const visible = mine ? db.messages.filter((x) => x.conversation_id === body.p_conversation_id && !x.deleted_at && (!mine.cleared_at || x.created_at > mine.cleared_at) && !hidden.some((h) => h.message_id === x.id && h.user_id === signedIn)) : [];
      if (table === "rpc/chat_shared_stats") {
        return json(200, { photos: visible.reduce((n, m) => n + (m.attachments ?? []).length, 0), content: visible.filter(isContent).length, links: visible.filter(isLink).length });
      }
      const pick = { photos: (m) => (m.attachments ?? []).length > 0, content: isContent, links: isLink }[body.p_kind];
      const list = pick ? visible.filter(pick).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) : [];
      return json(200, list.slice(0, Math.min(Math.max(body.p_limit ?? 100, 1), 200)).map((m) => ({ id: m.id, created_at: m.created_at, sender_id: m.sender_id, body: m.body, attachments: m.attachments ?? [], shared_prompt_id: m.shared_prompt_id, shared_request_id: m.shared_request_id })));
    }
    if (table === "rpc/common_communities") {
      if (!body.p_user || body.p_user === signedIn || db.isBlocked(signedIn, body.p_user)) return json(200, []);
      const ids = db.groups.filter((g) => db.member(g.id, signedIn) && db.member(g.id, body.p_user)).map((g) => g.id);
      return json(200, ids);
    }
    if (table === "rpc/search_conversation_messages") {
      const term = String(body.p_query ?? "").trim();
      if (term.length < 2 || term.length > 100) return err("invalid_query");
      const mine = memberOf(body.p_conversation_id);
      if (!mine) return json(200, []);
      const hidden = db.hidden ?? [];
      let list = db.messages.filter((x) => x.conversation_id === body.p_conversation_id && !x.deleted_at && x.body && x.body.toLowerCase().includes(term.toLowerCase())
        && (!mine.cleared_at || x.created_at > mine.cleared_at) && !hidden.some((h) => h.message_id === x.id && h.user_id === signedIn));
      list.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      if (body.p_before_created_at) list = list.filter((x) => x.created_at < body.p_before_created_at);
      db.searchCalls = [...(db.searchCalls ?? []), { query: term, before: body.p_before_created_at }];
      return json(200, list.slice(0, Math.min(body.p_limit ?? 20, 50)).map((x) => ({ id: x.id, sender_id: x.sender_id, body: x.body, created_at: x.created_at })));
    }
    if (table === "message_stars") {
      if (method === "GET") {
        const cid = val(q.get("messages.conversation_id") ?? "", "eq");
        const list = db.stars.filter((x) => x.user_id === signedIn).map((x) => ({ x, m: db.messages.find((mm) => mm.id === x.message_id) })).filter(({ m }) => m && (!cid || m.conversation_id === cid) && memberOf(m.conversation_id));
        return rows(list.map(({ x, m }) => ({ message_id: x.message_id, messages: { conversation_id: m.conversation_id } })));
      }
      if (method === "POST") {
        const m = db.messages.find((x) => x.id === body.message_id);
        if (body.user_id !== signedIn || !m || !memberOf(m.conversation_id)) return json(403, { code: "42501", message: 'new row violates row-level security policy for table "message_stars"' });
        if (db.stars.some((x) => x.user_id === signedIn && x.message_id === m.id)) return json(409, { code: "23505", message: 'duplicate key value violates unique constraint "message_stars_pkey"' });
        db.stars.push({ user_id: signedIn, message_id: m.id, created_at: db.stamp() });
        return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } });
      }
      if (method === "DELETE") {
        const mid = val(q.get("message_id") ?? "", "eq");
        db.stars = db.stars.filter((x) => !(x.user_id === signedIn && (!mid || x.message_id === mid)));
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      }
    }
    if (table === "rpc/list_starred_messages") {
      const hidden = db.hidden ?? [];
      let list = db.stars.filter((x) => x.user_id === signedIn).map((x) => ({ x, m: db.messages.find((mm) => mm.id === x.message_id) }))
        .filter(({ m }) => m && !m.deleted_at && memberOf(m.conversation_id) && (!memberOf(m.conversation_id).cleared_at || m.created_at > memberOf(m.conversation_id).cleared_at) && !hidden.some((h) => h.message_id === m.id && h.user_id === signedIn));
      list.sort((a, b) => b.x.created_at.localeCompare(a.x.created_at));
      if (body.p_before_starred_at) list = list.filter(({ x }) => x.created_at < body.p_before_starred_at);
      return json(200, list.slice(0, Math.min(body.p_limit ?? 30, 100)).map(({ x, m }) => {
        const conv = db.conversations.find((c) => c.id === m.conversation_id); const g = conv?.kind === "group" ? groupOf(conv.id) : null;
        const partner = g ? null : db.members.find((mm) => mm.conversation_id === m.conversation_id && mm.user_id !== signedIn)?.user_id ?? null;
        return { starred_at: x.created_at, message_id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, body: m.body, has_attachments: (m.attachments ?? []).length > 0, has_shared: false, created_at: m.created_at, kind: g ? "group" : "direct", group_name: g?.name ?? null, group_avatar_url: null, partner_id: partner };
      }));
    }
    if (table === "message_hidden_for" && method === "GET") {
      const mid = val(q.get("message_id") ?? "", "eq");
      return rows((db.hidden ?? []).filter((h) => h.user_id === signedIn && (!mid || h.message_id === mid)).map((h) => ({ message_id: h.message_id })));
    }
    if (table === "rpc/filter_messageable_users") return json(200, (body.p_user_ids ?? []).filter((id) => db.messageable(id)));
    if (table === "rpc/mark_conversation_read") {
      // Yalnız sayaç sıfırlanır (okundu imleci ilerlemez); çağrılar `db.unreadResets`'e yazılır.
      (db.unreadResets ??= []).push(body.p_conversation_id);
      if (db.failMarkRead) return json(500, { code: "XX000", message: "boom" });
      const m = db.member(body.p_conversation_id, signedIn);
      if (m) m.unread_count = 0;
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (table === "rpc/start_direct_conversation") {
      const other = body.other_user_id;
      if (!db.messageable(other)) return json(400, { code: "P0001", message: "Bu kullanıcıyla mesajlaşamazsın.", details: "", hint: "" });
      const existing = db.members.find((m) => m.user_id === signedIn && db.members.some((n) => n.conversation_id === m.conversation_id && n.user_id === other));
      if (existing) return json(200, existing.conversation_id);
      const id = crypto.randomUUID();
      db.conversations.push({ id, last_message_at: db.stamp() });
      db.members.push({ conversation_id: id, user_id: signedIn, status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null });
      const follows = db.follows.some((f) => f.follower_id === other && f.following_id === signedIn);
      db.members.push({ conversation_id: id, user_id: other, status: follows ? "accepted" : "pending", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null });
      return json(200, id);
    }

    if (table === "profiles") {
      if (sel.includes("email") || sel.includes("phone")) db.searchSelects.push(sel);
      db.searchSelects.push(sel);
      const id = val(q.get("id") ?? "", "eq");
      const ids = inList(q.get("id") ?? "");
      let list = Object.values(U);
      if (id) list = list.filter((u) => u.id === id);
      if (ids) list = list.filter((u) => ids.includes(u.id));
      const uname = val(q.get("username") ?? "", "eq");
      if (uname) list = list.filter((u) => u.username === uname);
      const or = q.get("or");
      if (or) {
        const m = or.match(/ilike\.%(.*?)%/);
        const needle = (m?.[1] ?? "").toLowerCase();
        list = list.filter((u) => u.display_name.toLowerCase().includes(needle) || u.username.toLowerCase().includes(needle));
      }
      return rows(list.map(pub));
    }
    if (table === "follows" && method === "GET") {
      const a = val(q.get("follower_id") ?? "", "eq"); const b = val(q.get("following_id") ?? "", "eq");
      let list = db.follows.filter((f) => (!a || f.follower_id === a) && (!b || f.following_id === b));
      const lim = Number(q.get("limit") ?? 0); if (lim) list = list.slice(0, lim);
      const key = a ? "following_id" : "follower_id";
      return rows(list.map((f) => ({ profiles: pub(Object.values(U).find((u) => u.id === f[key])) })));
    }
    if (table === "blocks" && method === "POST") { db.blocks.push({ blocker_id: body.blocker_id, blocked_id: body.blocked_id }); return json(201, {}); }
    if (table === "blocks" && method === "DELETE") {
      const blocker = val(q.get("blocker_id") ?? "", "eq"); const blocked = val(q.get("blocked_id") ?? "", "eq");
      db.blocks = db.blocks.filter((x) => !(x.blocker_id === blocker && x.blocked_id === blocked));
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (table === "blocks" && method === "GET") {
      const b = val(q.get("blocker_id") ?? "", "eq");
      return rows(db.blocks.filter((x) => !b || x.blocker_id === b).map((x) => ({ blocked_id: x.blocked_id, profiles: pub(Object.values(U).find((u) => u.id === x.blocked_id)) })));
    }
    if (table === "conversation_members") {
      if (method === "GET") {
        let list = filterRows(db.members, q, ["conversation_id", "user_id"]);
        // PostgREST `.range()`: offset/limit (sayfalı okuma — 1000'den çok üyelik).
        const rangeLimit = Number(q.get("limit") ?? 0);
        if (rangeLimit) list = list.slice(Number(q.get("offset") ?? 0), Number(q.get("offset") ?? 0) + rangeLimit);
        if (sel.includes("profiles(")) return rows(list.map((m) => ({ conversation_id: m.conversation_id, profiles: pub(Object.values(U).find((u) => u.id === m.user_id)) })));
        if (sel === "cleared_at") return rows(list.map((m) => ({ cleared_at: m.cleared_at })));
        if (sel === "last_read_at") return rows(list.map((m) => ({ last_read_at: m.last_read_at ?? null })));
        return rows(list.map((m) => {
          const conv = db.conversations.find((c) => c.id === m.conversation_id);
          return { ...m, conversations: conv ? { ...conv, kind: conv.kind ?? "direct", chat_groups: conv.kind === "group" ? groupOf(conv.id) ?? null : null } : conv };
        }));
      }
      if (method === "PATCH") {
        if (db.patchDelayMs) await new Promise((r) => setTimeout(r, db.patchDelayMs));
        if (db.failMemberPatch) return json(500, { code: "XX000", message: "boom" });
        const targets = filterRows(db.members, q, ["conversation_id", "user_id"]).filter((m) => m.user_id === signedIn); // RLS: own row only
        targets.forEach((m) => Object.assign(m, body));
        return rows(targets.map((m) => ({ conversation_id: m.conversation_id })));
      }
      if (method === "DELETE") {
        const targets = filterRows(db.members, q, ["conversation_id", "user_id"]).filter((m) => m.user_id === signedIn);
        db.members = db.members.filter((m) => !targets.includes(m));
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      }
    }
    if (table === "messages") {
      if (method === "GET") {
        let list = filterRows(db.messages, q, ["id", "conversation_id", "created_at"]);
        // `.contains("attachments", [{}])` (Kişi bilgisi fotoğrafları) ve `deleted_at is null`.
        if ((q.get("attachments") ?? "").includes("[object Object]")) return json(400, { code: "22P02", message: "invalid input syntax for type json" });
        if ((q.get("attachments") ?? "").startsWith("cs.")) list = list.filter((m) => Array.isArray(m.attachments) && m.attachments.length > 0);
        if (q.get("deleted_at") === "is.null") list = list.filter((m) => !m.deleted_at);
        const order = q.get("order") ?? "";
        list = list.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) * (order.includes("desc") ? -1 : 1));
        const lim = Number(q.get("limit") ?? 0); if (lim) list = list.slice(0, lim);
        return rows(list);
      }
      if (method === "POST") {
        const member = db.member(body.conversation_id, signedIn);
        const isGroupConv = db.conversations.find((c) => c.id === body.conversation_id)?.kind === "group";
        const g = isGroupConv ? db.groups.find((x) => x.id === body.conversation_id) : null;
        const others = isGroupConv ? [] : db.members.filter((m) => m.conversation_id === body.conversation_id && m.user_id !== signedIn);
        const cannotPostInGroup = g && g.posting_policy === "admins" && member && member.role === "member";
        if (!member || cannotPostInGroup || others.some((m) => db.isBlocked(signedIn, m.user_id))) return json(403, { code: "42501", message: 'new row violates row-level security policy for table "messages"' });
        const row = db.addMessage(body.conversation_id, signedIn, body.body);
        if (body.reply_to_message_id) row.reply_to_message_id = body.reply_to_message_id;
        if (body.shared_prompt_id) row.shared_prompt_id = body.shared_prompt_id;
        if (body.shared_request_id) row.shared_request_id = body.shared_request_id;
        if (Array.isArray(body.attachments) && body.attachments.length > 0) row.attachments = body.attachments;
        return route.fulfill({ status: 201, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(wantsObject ? row : [row]) });
      }
    }
    if (method === "GET") return rows([]);
    return json(200, {});
  });
  const session = { access_token: "x.y.z", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: "r", user: { id: signedIn, aud: "authenticated", role: "authenticated", email: "alice@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
  await context.addInitScript(([s, isGuest]) => { try { if (!isGuest) localStorage.setItem("sb-example-auth-token", JSON.stringify(s)); localStorage.setItem("promptly-language", "tr"); } catch {} }, [session, guest]);
}
