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
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pub = (p) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, p[c]]));

export function createDb() {
  const db = {
    users: U,
    conversations: [], // { id, last_message_at }
    members: [], // { conversation_id, user_id, status, unread_count, archived_at, deleted_at, cleared_at }
    messages: [], // MessageRow
    follows: [], // { follower_id, following_id }
    blocks: [], // { blocker_id, blocked_id }
    calls: [], // { method, table, body }
    failMemberPatch: false,
    patchDelayMs: 0,
    searchSelects: [],
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
  db.addMessage = (conversation_id, sender_id, body) => {
    const created_at = db.stamp();
    const row = { id: crypto.randomUUID(), conversation_id, sender_id, body, shared_prompt_id: null, shared_request_id: null, reply_to_message_id: null, attachments: [], edited_at: null, deleted_at: null, created_at };
    db.messages.push(row);
    const conv = db.conversations.find((c) => c.id === conversation_id);
    if (conv) conv.last_message_at = created_at;
    // resurface_conversation_on_message trigger
    for (const m of db.members) if (m.conversation_id === conversation_id) { m.archived_at = null; m.deleted_at = null; }
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
    const e = val(v, "eq"); const n = val(v, "neq"); const l = inList(v); const g = val(v, "gt");
    if (e != null) return String(r[c]) === e;
    if (n != null) return String(r[c]) !== n;
    if (l) return l.includes(String(r[c]));
    if (g != null) return String(r[c]) > g;
    return true;
  }));
}

export async function installMock(context, db, { signedIn = ME } = {}) {
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
    if (p.startsWith("/auth/v1/user")) return json(200, { id: signedIn, aud: "authenticated", role: "authenticated", email: "alice@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    if (!p.startsWith("/rest/v1/")) return json(200, {});
    const table = p.replace("/rest/v1/", "");
    const sel = q.get("select") ?? "";
    const body = method === "POST" || method === "PATCH" ? JSON.parse(req.postData() || "{}") : null;
    if (method !== "GET") db.calls.push({ method, table, body, query: Object.fromEntries(q) });

    if (table === "rpc/filter_messageable_users") return json(200, (body.p_user_ids ?? []).filter((id) => db.messageable(id)));
    if (table === "rpc/mark_conversation_read") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
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
      let list = Object.values(U);
      if (id) list = list.filter((u) => u.id === id);
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
    if (table === "blocks" && method === "GET") {
      const b = val(q.get("blocker_id") ?? "", "eq");
      return rows(db.blocks.filter((x) => !b || x.blocker_id === b).map((x) => ({ blocked_id: x.blocked_id, profiles: pub(Object.values(U).find((u) => u.id === x.blocked_id)) })));
    }
    if (table === "conversation_members") {
      if (method === "GET") {
        let list = filterRows(db.members, q, ["conversation_id", "user_id"]);
        if (sel.includes("profiles(")) return rows(list.map((m) => ({ conversation_id: m.conversation_id, profiles: pub(Object.values(U).find((u) => u.id === m.user_id)) })));
        if (sel === "cleared_at") return rows(list.map((m) => ({ cleared_at: m.cleared_at })));
        return rows(list.map((m) => ({ ...m, conversations: db.conversations.find((c) => c.id === m.conversation_id) })));
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
        let list = filterRows(db.messages, q, ["conversation_id", "created_at"]);
        const order = q.get("order") ?? "";
        list = list.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) * (order.includes("desc") ? -1 : 1));
        const lim = Number(q.get("limit") ?? 0); if (lim) list = list.slice(0, lim);
        return rows(list);
      }
      if (method === "POST") {
        const member = db.member(body.conversation_id, signedIn);
        const others = db.members.filter((m) => m.conversation_id === body.conversation_id && m.user_id !== signedIn);
        if (!member || others.some((m) => db.isBlocked(signedIn, m.user_id))) return json(403, { code: "42501", message: 'new row violates row-level security policy for table "messages"' });
        const row = db.addMessage(body.conversation_id, signedIn, body.body);
        return route.fulfill({ status: 201, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(wantsObject ? row : [row]) });
      }
    }
    if (method === "GET") return rows([]);
    return json(200, {});
  });
  const session = { access_token: "x.y.z", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: "r", user: { id: signedIn, aud: "authenticated", role: "authenticated", email: "alice@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
  await context.addInitScript((s) => { try { localStorage.setItem("sb-example-auth-token", JSON.stringify(s)); localStorage.setItem("promptly-language", "tr"); } catch {} }, session);
}
