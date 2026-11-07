// Topluluk sohbet odaları ağ taklidi (docs/history/352-*): `db.rpc` geçersiz kılmalarıyla oda RPC'lerini bellekte taklit eder.
// Gerçek kurallar `supabase/tests/community-rooms.sql`'dedir; burada yalnız istemci mantığı (hangi çağrı, hangi parametre, hangi ekran) sınanır.
import { ME } from "./mock.mjs";

const STAFF = ["owner", "admin", "moderator"];

export function setupRooms(db) {
  db.rooms = []; // community_rooms satırları
  db.roomState = []; // { user_id, room_id, last_read_at, muted_at }
  db.roomCalls = []; // { fn, body }
  const roleOf = (communityId) => db.member(communityId, ME)?.role ?? null;
  const visible = (room) => room.read_policy === "all" || STAFF.includes(roleOf(room.community_id));
  const stateOf = (roomId) => db.roomState.find((s) => s.user_id === ME && s.room_id === roomId);
  const ok = (body = null) => ({ status: 200, body });
  const fail = (code) => ({ status: 400, body: { code: "P0001", message: code, details: "", hint: "" } });

  db.addRoom = (communityId, { id = crypto.randomUUID(), name, description = null, icon = "message", section = null, posting_policy = "members", read_policy = "all", is_default = false, archived_at = null } = {}) => {
    const position = db.rooms.filter((r) => r.community_id === communityId).length;
    const row = { id, community_id: communityId, name, description, icon, section, position, posting_policy, read_policy, is_default, archived_at, created_at: db.stamp() };
    db.rooms.push(row);
    return row;
  };
  /** Varsayılan oda ("Genel") + istenen diğer odalar; mesajlar `room` adıyla odaya bağlanır. */
  db.addRoomMessage = (communityId, roomId, senderId, body) => {
    const row = db.addMessage(communityId, senderId, body);
    const room = db.rooms.find((r) => r.id === roomId);
    if (room && !room.is_default) row.room_id = room.id;
    return row;
  };

  const unreadOf = (room) => {
    if (room.archived_at) return 0;
    const me = db.member(room.community_id, ME);
    const cursor = room.is_default ? me?.last_read_at : stateOf(room.id)?.last_read_at;
    return db.messages.filter(
      (m) => m.conversation_id === room.community_id && (room.is_default ? !m.room_id : m.room_id === room.id) && m.sender_id !== ME && !m.deleted_at && (!cursor || m.created_at > cursor),
    ).length;
  };

  db.rpc.community_rooms_overview = (body) => {
    const g = db.groups.find((x) => x.id === body.p_community_id);
    const role = roleOf(body.p_community_id);
    if (!g || !role) return ok([]);
    const rows = db.rooms
      .filter((r) => r.community_id === body.p_community_id && visible(r))
      .sort((a, b) => a.position - b.position)
      .map((r) => ({
        id: r.id, name: r.name, description: r.description, icon: r.icon, section: r.section, position: r.position,
        posting_policy: r.posting_policy, read_policy: r.read_policy, is_default: r.is_default, archived_at: r.archived_at,
        muted: Boolean(stateOf(r.id)?.muted_at), unread_count: unreadOf(r),
        last_message_at: db.messages.filter((m) => m.conversation_id === r.community_id && (r.is_default ? !m.room_id : m.room_id === r.id)).map((m) => m.created_at).sort().pop() ?? null,
        can_post: !r.archived_at && !g.closed_at && (r.posting_policy === "members" || STAFF.includes(role)) && (!r.is_default || g.posting_policy === "members" || STAFF.includes(role)),
      }));
    return ok(rows);
  };
  db.rpc.community_last_rooms = (body) => {
    const out = [];
    for (const cid of body.p_conversation_ids ?? []) {
      const last = db.messages.filter((m) => m.conversation_id === cid).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!last) continue;
      const room = db.rooms.find((r) => r.community_id === cid && (last.room_id ? r.id === last.room_id : r.is_default));
      if (room) out.push({ conversation_id: cid, room_id: room.id, room_name: room.name });
    }
    return ok(out);
  };
  db.rpc.create_community_room = (body) => {
    db.roomCalls.push({ fn: "create", body });
    const role = roleOf(body.p_community_id);
    if (!STAFF.includes(role) || role === "moderator") return fail("forbidden");
    const name = String(body.p_name ?? "").trim();
    if (!name || name.length > 40) return fail("invalid_room_name");
    if (db.rooms.filter((r) => r.community_id === body.p_community_id && !r.archived_at).length >= 20) return fail("room_limit_reached");
    if (db.rooms.some((r) => r.community_id === body.p_community_id && !r.archived_at && r.name.toLowerCase() === name.toLowerCase())) return fail("room_name_taken");
    const row = db.addRoom(body.p_community_id, { name, description: body.p_description, icon: body.p_icon, section: body.p_section, posting_policy: body.p_posting_policy, read_policy: body.p_read_policy });
    return ok(row.id);
  };
  db.rpc.update_community_room = (body) => {
    db.roomCalls.push({ fn: "update", body });
    const room = db.rooms.find((r) => r.id === body.p_room_id);
    if (!room) return fail("room_not_found");
    const patch = body.p_patch ?? {};
    for (const [k, v] of Object.entries(patch)) room[k] = k === "section" ? (String(v).trim() || null) : k === "description" ? (String(v).trim() || null) : v;
    return ok();
  };
  db.rpc.reorder_community_rooms = (body) => {
    db.roomCalls.push({ fn: "reorder", body });
    (body.p_room_ids ?? []).forEach((id, i) => { const r = db.rooms.find((x) => x.id === id); if (r) r.position = i; });
    return ok();
  };
  db.rpc.archive_community_room = (body) => {
    db.roomCalls.push({ fn: "archive", body });
    const room = db.rooms.find((r) => r.id === body.p_room_id);
    if (!room) return fail("room_not_found");
    if (room.is_default) return fail("room_default_locked");
    room.archived_at = body.p_archived ? db.stamp() : null;
    return ok();
  };
  db.rpc.delete_community_room = (body) => {
    db.roomCalls.push({ fn: "delete", body });
    const room = db.rooms.find((r) => r.id === body.p_room_id);
    if (!room) return fail("room_not_found");
    if (roleOf(room.community_id) !== "owner") return fail("forbidden");
    if (room.is_default) return fail("room_default_locked");
    db.rooms = db.rooms.filter((r) => r !== room);
    db.messages = db.messages.filter((m) => m.room_id !== room.id);
    return ok();
  };
  db.rpc.mark_room_read_up_to = (body) => {
    db.roomCalls.push({ fn: "read", body });
    let s = stateOf(body.p_room_id);
    if (!s) { s = { user_id: ME, room_id: body.p_room_id, last_read_at: null, muted_at: null }; db.roomState.push(s); }
    if (!s.last_read_at || s.last_read_at < body.p_up_to) s.last_read_at = body.p_up_to;
    return ok();
  };
  db.rpc.set_room_muted = (body) => {
    db.roomCalls.push({ fn: "mute", body });
    let s = stateOf(body.p_room_id);
    if (!s) { s = { user_id: ME, room_id: body.p_room_id, last_read_at: null, muted_at: null }; db.roomState.push(s); }
    s.muted_at = body.p_muted ? db.stamp() : null;
    return ok();
  };
  return db;
}
