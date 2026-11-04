// Çevrimiçi durum uçlarının ağ taklidi (docs/history/329-*). SQL kurallarının (supabase/migrations/20261104110000_presence.sql) BİREBİR aynası:
// kitle (Herkes/Takip ettiklerim/Karşılıklı/Hiç kimse), görünmez, karşılıklılık, engel, topluluk okunabilirliği. Asıl doğrulama
// supabase/tests/presence.sql'dedir; burası istemcinin çağrılarını, kanal adlarını ve ekranları sınar. Gerçek Supabase'e bağlanmaz.

const ACTIVE_MS = 5 * 60_000;
const hex = () => crypto.randomUUID().replace(/-/g, "");

export function setupPresence(db) {
  db.presence = new Map(); // userId -> { mode, audience, key, lastActiveAt, focusKey, telegram }
  db.presenceCalls = []; // { fn, user, body }
  db.attendees = []; // { event_id, user }
  db.linkTokens = new Map(); // token -> communityId
  const st = (uid) => {
    if (!db.presence.has(uid)) db.presence.set(uid, { mode: "auto", audience: "everyone", key: hex(), lastActiveAt: null, focusKey: null, telegram: false });
    return db.presence.get(uid);
  };
  db.presenceOf = st;
  db.setActive = (uid, msAgo = 30_000) => { st(uid).lastActiveAt = new Date(Date.now() - msAgo).toISOString(); };
  const follows = (a, b) => db.follows.some((f) => f.follower_id === a && f.following_id === b);
  const hidden = (uid) => { const s = st(uid); return s.mode === "invisible" || s.audience === "nobody"; };
  const canView = (viewer, target) => {
    if (!viewer || !target) return false;
    if (viewer === target) return true;
    if (hidden(viewer)) return false;
    const s = st(target);
    if (s.mode !== "auto") return false;
    const ok = s.audience === "everyone" ? true : s.audience === "following" ? follows(target, viewer) : s.audience === "mutual" ? follows(target, viewer) && follows(viewer, target) : false;
    return ok && !db.isBlocked(viewer, target);
  };
  db.presenceCanView = canView;
  const topicOf = (uid) => `presence:${uid}:${st(uid).key}`;
  db.presenceTopic = topicOf;
  const recentlyActive = (uid) => { const at = st(uid).lastActiveAt; return at && Date.now() - Date.parse(at) < ACTIVE_MS; };
  const canReadCommunity = (gid, uid) => {
    const g = db.groups.find((x) => x.id === gid);
    if (!g) return false;
    return Boolean(db.member(gid, uid)) || g.visibility === "public";
  };
  const countFor = (gid) => db.members.filter((m) => m.conversation_id === gid).filter((m) => { const s = st(m.user_id); return s.mode === "auto" && s.audience === "everyone" && recentlyActive(m.user_id); }).length;

  /** Realtime yetkisi (hub `authorize` / `authorizeWrite`): `can_use_presence_topic` aynası. */
  db.presenceAuthorize = (topic, uid, write = false) => {
    const m = /^presence:([0-9a-f-]{36}):([0-9a-f]{32})$/.exec(topic);
    if (!m) return null; // presence konusu değil: çağıran karar verir
    const s = st(m[1]);
    if (s.key !== m[2]) return false;
    if (write) return m[1] === uid && s.mode === "auto" && s.audience !== "nobody";
    return canView(uid, m[1]);
  };

  const previous = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, body, signedIn, json } = ctx;
    const fn = table.startsWith("rpc/") ? table.slice(4) : null;
    const handlers = {
      my_presence: () => { const s = st(signedIn); return [{ mode: s.mode, audience: s.audience, topic: topicOf(signedIn), last_active_at: s.lastActiveAt }]; },
      presence_heartbeat: () => {
        const s = st(signedIn);
        if (s.mode === "auto") s.lastActiveAt = new Date().toISOString();
        return [{ mode: s.mode, audience: s.audience, topic: topicOf(signedIn), last_active_at: s.lastActiveAt }];
      },
      set_my_presence: () => {
        const s = st(signedIn);
        if (body.p_mode && !["auto", "invisible"].includes(body.p_mode)) return { error: "invalid_presence_mode" };
        if (body.p_audience && !["everyone", "following", "mutual", "nobody"].includes(body.p_audience)) return { error: "invalid_presence_audience" };
        const next = { mode: body.p_mode ?? s.mode, audience: body.p_audience ?? s.audience };
        if (next.mode !== s.mode || next.audience !== s.audience) s.key = hex();
        Object.assign(s, next);
        return [{ mode: s.mode, audience: s.audience, topic: topicOf(signedIn), last_active_at: s.lastActiveAt }];
      },
      presence_set_focus: () => { const s = st(signedIn); if (!s.telegram) { s.focusKey = null; return false; } s.focusKey = body.p_key ?? null; return true; },
      presence_lookup: () => (body.p_ids ?? []).filter((id) => id !== signedIn && db.users && Object.values(db.users).some((u) => u.id === id) && canView(signedIn, id))
        .map((id) => ({ user_id: id, topic: topicOf(id), last_active_at: st(id).lastActiveAt })),
      community_presence_counts: () => (hidden(signedIn) ? [] : (body.p_ids ?? []).filter((id) => canReadCommunity(id, signedIn)).map((id) => ({ community_id: id, online_count: countFor(id) }))),
      community_link_presence_count: () => {
        const gid = db.linkTokens.get(body.p_token);
        const g = gid && db.groups.find((x) => x.id === gid);
        return !g || g.visibility !== "public" || hidden(signedIn) ? null : countFor(gid);
      },
      community_online_members: () => {
        const gid = body.p_group_id;
        const staffOnly = Boolean(body.p_staff_only);
        const allowed = db.member(gid, signedIn) || (staffOnly && canReadCommunity(gid, signedIn));
        if (!allowed) return [];
        return db.members
          .filter((m) => m.conversation_id === gid && (!staffOnly || ["owner", "admin", "moderator"].includes(m.role)))
          .filter((m) => { const s = st(m.user_id); return s.mode === "auto" && s.audience !== "nobody" && recentlyActive(m.user_id) && canView(signedIn, m.user_id); })
          .map((m) => { const u = Object.values(db.users).find((x) => x.id === m.user_id); return { user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, role: m.role, joined_at: "2026-01-01T00:00:00Z", last_active_at: st(u.id).lastActiveAt }; });
      },
      community_events_presence: () => {
        if (hidden(signedIn)) return [];
        return (body.p_event_ids ?? []).map((id) => db.events?.find((e) => e.id === id)).filter((e) => e && canReadCommunity(e.community_id, signedIn)).map((e) => {
          const rs = db.attendees.filter((a) => a.event_id === e.id);
          const count = rs.filter((a) => { const s = st(a.user.id); return s.mode === "auto" && s.audience === "everyone" && recentlyActive(a.user.id); }).length;
          const list = db.member(e.community_id, signedIn)
            ? rs.filter((a) => recentlyActive(a.user.id) && canView(signedIn, a.user.id)).map((a) => ({ user_id: a.user.id, username: a.user.username, display_name: a.user.display_name, avatar_url: null, status: a.status }))
            : [];
          return { event_id: e.id, online_count: count, attendees: list };
        });
      },
    };
    if (fn && handlers[fn]) {
      db.presenceCalls.push({ fn, user: signedIn, body });
      if (!signedIn) return json(401, { code: "42501", message: "permission denied" });
      const out = handlers[fn]();
      if (out && out.error) return json(400, { code: "22023", message: out.error, details: "", hint: "" });
      return json(200, out);
    }
    return previous ? previous(ctx) : undefined;
  };
}
