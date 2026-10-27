// Promptly Spaces uçlarının ağ taklidi (docs/history/213-*). `mock.mjs` içindeki `db.extraRoutes` kancasına bağlanır (önceki kancayı
// zincirler). Yetki kuralının SADELEŞTİRİLMİŞ bir kopyasını içerir (yalnız istemci akışlarını sınamak için: rol → düzenleme, gizli not
// yalnız üyeye); asıl doğrulama `supabase/tests/spaces.sql`'dedir. Gerçek Supabase'e KARŞI DENENMEDİ.
import { ME, U } from "./mock.mjs";

const person = (id) => {
  const u = Object.values(U).find((x) => x.id === id);
  return u ? { id: u.id, username: u.username, display_name: u.display_name, avatar_url: null } : null;
};
const PROFILE_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const now = () => new Date().toISOString();
const eqv = (v) => (v?.startsWith("eq.") ? v.slice(3) : null);
const inv = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : null);
const SKIP = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function applyFilters(list, q) {
  return list.filter((row) => {
    for (const [key, value] of q.entries()) {
      if (SKIP.has(key)) continue;
      const e = eqv(value);
      const l = inv(value);
      if (e != null && String(row[key]) !== e) return false;
      if (l && !l.includes(String(row[key]))) return false;
      if (value === "is.null" && row[key] != null) return false;
    }
    return true;
  });
}

export const SID = (n) => `5ace0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const IID = (n) => `17e30000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const MEDIA = (space, n) => `https://example.supabase.co/storage/v1/object/public/space-media/${space}/${IID(n)}.jpg`;

/**
 * `db.spaces` vb. satırlar sunucu biçimindedir (snake_case). `addSpace` sahibi + üyeleri kurar; `addItem` öğe ekler.
 */
export function setupSpaces(db) {
  db.spaces = [];
  db.spaceMembers = [];
  db.spaceItems = [];
  db.spaceConnections = []; // docs/history/262-*: pano okları
  db.spaceGroups = [];
  db.spacePalettes = [];
  db.spaceInvites = [];
  db.spaceActivity = [];
  db.spaceState = [];
  db.spaceLinks = [];
  db.spaceGrants = [];
  db.spaceFail = {}; // { layout: n } → sonraki n yerleşim kaydı 500 döner
  db.addSpace = (n, over = {}) => {
    const row = {
      id: SID(n),
      owner_id: over.owner ?? ME,
      title: over.title ?? `Space ${n}`,
      description: over.description ?? "",
      kind: over.kind ?? "moodboard",
      visibility: over.visibility ?? "private",
      cover_url: null,
      cover_item_id: null,
      archived_at: over.archived ? "2026-09-01T00:00:00Z" : null,
      created_at: over.created_at ?? `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00Z`,
      updated_at: over.updated_at ?? `2026-09-${String(10 + n).padStart(2, "0")}T12:00:00Z`,
      updated_by: null,
      quote_count: over.quote_count ?? 0,
      rating_avg: over.rating_avg ?? 0,
      rating_count: over.rating_count ?? 0,
      comment_count: over.comment_count ?? 0,
      activity_visibility: over.activity_visibility ?? "everyone",
    };
    db.spaces.push(row);
    db.spaceMembers.push({ space_id: row.id, user_id: row.owner_id, role: "owner", created_at: row.created_at });
    for (const [user, role] of over.members ?? []) db.spaceMembers.push({ space_id: row.id, user_id: user.id, role, created_at: row.created_at });
    return row;
  };
  // Etkinlik satırı (docs/history/242-*): önce/sonra ayrıntısı + yapanın notu + yorum sayacı.
  db.addActivity = (spaceId, over = {}) => {
    const row = {
      id: over.id ?? crypto.randomUUID(),
      space_id: spaceId,
      actor_id: over.actor ?? ME,
      action: over.action ?? "renamed",
      label: over.label ?? null,
      count: over.count ?? 1,
      details: over.details ?? null,
      author_note: over.author_note ?? null,
      comment_count: over.comment_count ?? 0,
      created_at: over.created_at ?? now(),
    };
    db.spaceActivity.push(row);
    return row;
  };
  db.addItem = (spaceId, over = {}) => {
    const row = {
      id: over.id ?? crypto.randomUUID(),
      space_id: spaceId,
      kind: over.kind ?? "note",
      x: over.x ?? 0, y: over.y ?? 0, w: over.w ?? 220, h: over.h ?? 180, z: over.z ?? 0,
      group_id: over.group_id ?? null,
      prompt_id: over.prompt_id ?? null,
      media_url: over.media_url ?? null,
      media_width: over.media_width ?? null,
      media_height: over.media_height ?? null,
      is_draft: over.is_draft ?? false,
      source_prompt_id: null,
      content_type: over.content_type ?? null, content_id: over.content_id ?? null,
      source_workflow_id: over.source_workflow_id ?? null, source_step_id: over.source_step_id ?? null, source_role: over.source_role ?? null, source_step_no: over.source_step_no ?? null,
      palette_id: over.palette_id ?? null,
      title: over.title ?? "", body: over.body ?? "", note: over.note ?? "",
      color: over.color ?? "neutral",
      attached_item_id: null,
      is_private: over.is_private ?? false,
      created_by: ME, updated_by: ME,
      created_at: over.created_at ?? now(), updated_at: over.updated_at ?? now(),
    };
    db.spaceItems.push(row);
    return row;
  };

  db.addConnection = (spaceId, from, to, over = {}) => {
    const row = { id: over.id ?? crypto.randomUUID(), space_id: spaceId, from_item_id: from, to_item_id: to, label: over.label ?? "", line_style: over.line_style ?? "solid", arrow: over.arrow ?? "end", route: over.route ?? "curve", color: over.color ?? "primary", source_workflow_id: over.source_workflow_id ?? null, source_role: over.source_role ?? null, created_by: ME, created_at: now() };
    db.spaceConnections.push(row);
    return row;
  };

  const roleOf = (spaceId, uid) => db.spaceMembers.find((m) => m.space_id === spaceId && m.user_id === uid)?.role ?? null;
  const space = (id) => db.spaces.find((s) => s.id === id);
  const canRead = (id, uid) => {
    const s = space(id);
    if (!s) return false;
    if (roleOf(id, uid)) return true;
    if (s.archived_at) return false;
    if (s.visibility === "public") return true;
    return s.visibility === "link" && db.spaceGrants.some((g) => g.space_id === id && g.user_id === uid && db.spaceLinks.find((l) => l.id === g.link_id && !l.revoked_at));
  };
  const canEdit = (id, uid) => ["owner", "editor"].includes(roleOf(id, uid)) && !space(id)?.archived_at;
  const summary = (s, uid) => {
    const items = db.spaceItems.filter((i) => i.space_id === s.id && (!i.is_private || roleOf(s.id, uid)));
    const owner = person(s.owner_id);
    const state = db.spaceState.find((x) => x.space_id === s.id && x.user_id === uid);
    return {
      id: s.id, owner_id: s.owner_id, owner_username: owner?.username, owner_display_name: owner?.display_name, owner_avatar_url: null,
      title: s.title, description: s.description, kind: s.kind, visibility: s.visibility, cover_url: s.cover_url, cover_item_id: s.cover_item_id,
      cover_item_url: items.find((i) => i.id === s.cover_item_id)?.media_url ?? null,
      preview_urls: items.filter((i) => i.kind === "image").slice(-4).reverse().map((i) => i.media_url),
      image_count: items.filter((i) => i.kind === "image").length,
      prompt_count: items.filter((i) => i.kind === "prompt").length,
      note_count: items.filter((i) => i.kind === "note").length,
      member_count: roleOf(s.id, uid) ? db.spaceMembers.filter((m) => m.space_id === s.id).length : null,
      my_role: roleOf(s.id, uid), is_favorite: Boolean(state?.favorite), last_opened_at: state?.last_opened_at ?? null,
      created_at: s.created_at, updated_at: s.updated_at, archived_at: s.archived_at,
    };
  };

  const prior = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, method, q, body, signedIn, json, rows, err } = ctx;
    const uid = signedIn;
    // Profil sayfası (docs/history/214-*, "Spaces" sekmesi): kullanıcı adına göre tek profil — `mock-stories.mjs` ile aynı biçim.
    if (table === "profiles" && q.get("username")) {
      const name = q.get("username").replace(/^eq\./, "");
      return rows(Object.values(U).filter((u) => u.username === name).map((u) => Object.fromEntries(PROFILE_COLS.map((c) => [c, u[c]]))));
    }
    const rpcCall = (name, fn) => {
      if (table !== `rpc/${name}`) return undefined;
      db.calls.push({ method: "RPC", table: name, body });
      return fn();
    };
    const handled =
      rpcCall("list_spaces", () => {
        const filter = body.p_filter ?? "all";
        const term = (body.p_query ?? "").toLowerCase();
        let list = db.spaces.filter((s) => canRead(s.id, uid)).filter((s) => {
          const role = roleOf(s.id, uid);
          const st = db.spaceState.find((x) => x.space_id === s.id && x.user_id === uid);
          if (filter === "all") return role && !s.archived_at;
          if (filter === "mine") return role === "owner" && !s.archived_at;
          if (filter === "shared") return ["editor", "viewer"].includes(role) && !s.archived_at;
          if (filter === "favorites") return st?.favorite;
          if (filter === "recent") return st?.last_opened_at && !s.archived_at;
          if (filter === "public") return s.visibility === "public" && !s.archived_at && s.owner_id !== uid;
          if (filter === "archived") return role === "owner" && s.archived_at;
          return false;
        });
        if (term) list = list.filter((s) => s.title.toLowerCase().includes(term) || s.description.toLowerCase().includes(term) || db.spaceItems.some((i) => i.space_id === s.id && `${i.title} ${i.body} ${i.note}`.toLowerCase().includes(term)));
        list.sort((a, b) => (body.p_sort === "title" ? a.title.localeCompare(b.title) : b.updated_at.localeCompare(a.updated_at)));
        const offset = body.p_offset ?? 0;
        return json(200, list.slice(offset, offset + (body.p_limit ?? 24)).map((s) => summary(s, uid)));
      }) ??
      // docs/history/214-*: vitrin — yalnız herkese açık + arşivsiz; sahibe ve/veya prompt'a göre, süzgeçsiz çağrı boş.
      rpcCall("list_public_spaces", () => {
        if (!body.p_owner && !body.p_prompt) return json(200, []);
        const list = db.spaces
          .filter((s) => canRead(s.id, uid) && s.visibility === "public" && !s.archived_at)
          .filter((s) => !body.p_owner || s.owner_id === body.p_owner)
          .filter((s) => !body.p_prompt || db.spaceItems.some((i) => i.space_id === s.id && i.prompt_id === body.p_prompt))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        return json(200, list.slice(0, body.p_limit ?? 24).map((s) => summary(s, uid)));
      }) ??
      rpcCall("create_space", () => {
        if (!uid) return json(401, { message: "not_authenticated" });
        if (!body.p_title?.trim()) return err("space_title_required");
        const n = 100 + db.spaces.length;
        const row = db.addSpace(n, { title: body.p_title.trim(), description: body.p_description, kind: body.p_kind, visibility: body.p_visibility, created_at: now(), updated_at: now() });
        (body.p_groups ?? []).forEach((name, position) => db.spaceGroups.push({ id: crypto.randomUUID(), space_id: row.id, name, color: "primary", position, created_at: now() }));
        return json(200, row.id);
      }) ??
      rpcCall("my_space_invitations", () => json(200, db.spaceInvites.filter((i) => i.invitee_id === uid && i.status === "pending").map((i) => {
        const s = space(i.space_id);
        const inviter = person(i.invited_by);
        return { id: i.id, space_id: i.space_id, role: i.role, created_at: i.created_at, space_title: s.title, space_kind: s.kind, inviter_username: inviter?.username, inviter_display_name: inviter?.display_name, inviter_avatar_url: null };
      }))) ??
      rpcCall("respond_space_invitation", () => {
        const inv = db.spaceInvites.find((i) => i.id === body.p_invitation_id && i.invitee_id === uid && i.status === "pending");
        if (!inv) return err("space_invite_not_found");
        inv.status = body.p_accept ? "accepted" : "declined";
        if (body.p_accept) db.spaceMembers.push({ space_id: inv.space_id, user_id: uid, role: inv.role, created_at: now() });
        return json(200, inv.space_id);
      }) ??
      rpcCall("set_space_favorite", () => {
        if (!canRead(body.p_space_id, uid)) return err("space_not_found");
        const st = db.spaceState.find((x) => x.space_id === body.p_space_id && x.user_id === uid);
        if (st) st.favorite = body.p_favorite;
        else db.spaceState.push({ space_id: body.p_space_id, user_id: uid, favorite: body.p_favorite, last_opened_at: null });
        return json(200, null);
      }) ??
      rpcCall("touch_space", () => {
        const st = db.spaceState.find((x) => x.space_id === body.p_space_id && x.user_id === uid);
        if (st) st.last_opened_at = now();
        else db.spaceState.push({ space_id: body.p_space_id, user_id: uid, favorite: false, last_opened_at: now() });
        return json(200, null);
      }) ??
      rpcCall("space_save_layout", () => {
        if (db.spaceFail.layout > 0) {
          db.spaceFail.layout -= 1;
          return json(500, { message: "boom" });
        }
        if (!canEdit(body.p_space_id, uid)) return err("space_forbidden");
        const ids = [];
        for (const entry of body.p_items) {
          const item = db.spaceItems.find((i) => i.id === entry.id && i.space_id === body.p_space_id);
          if (!item) continue;
          for (const key of ["x", "y", "w", "h", "z"]) if (entry[key] !== null && entry[key] !== undefined) item[key] = entry[key];
          if (entry.set_group) item.group_id = entry.group_id;
          ids.push(item.id);
        }
        return json(200, ids);
      }) ??
      rpcCall("invite_space_member", () => {
        if (roleOf(body.p_space_id, uid) !== "owner") return err("space_forbidden");
        const target = Object.values(U).find((u) => u.username === body.p_username);
        if (!target) return err("space_user_not_found");
        if (roleOf(body.p_space_id, target.id)) return err("space_already_member");
        const id = crypto.randomUUID();
        db.spaceInvites.push({ id, space_id: body.p_space_id, invitee_id: target.id, role: body.p_role, invited_by: uid, status: "pending", created_at: now() });
        return json(200, id);
      }) ??
      rpcCall("revoke_space_invitation", () => {
        const inv = db.spaceInvites.find((i) => i.id === body.p_invitation_id);
        if (inv) inv.status = "revoked";
        return json(200, null);
      }) ??
      rpcCall("set_space_member_role", () => {
        const m = db.spaceMembers.find((x) => x.space_id === body.p_space_id && x.user_id === body.p_user_id);
        if (roleOf(body.p_space_id, uid) !== "owner" || !m) return err("space_forbidden");
        m.role = body.p_role;
        return json(200, null);
      }) ??
      rpcCall("remove_space_member", () => {
        db.spaceMembers = db.spaceMembers.filter((x) => !(x.space_id === body.p_space_id && x.user_id === body.p_user_id && x.role !== "owner"));
        return json(200, null);
      }) ??
      rpcCall("set_space_activity_note", () => {
        if (!uid) return err("not_authenticated");
        const a = db.spaceActivity.find((x) => x.id === body.p_activity_id);
        if (!a || !canRead(a.space_id, uid)) return err("space_not_found");
        if (a.actor_id !== uid) return err("space_forbidden");
        const note = String(body.p_note ?? "").trim();
        if (note.length > 280) return err("invalid_note");
        a.author_note = note || null;
        return json(200, null);
      }) ??
      rpcCall("create_space_link", () => {
        const s = space(body.p_space_id);
        if (roleOf(s.id, uid) !== "owner") return err("space_forbidden");
        if (s.visibility !== "link") return err("space_not_link_visible");
        db.spaceLinks.forEach((l) => l.space_id === s.id && (l.revoked_at ??= now()));
        const token = `tok_${"x".repeat(30)}${db.spaceLinks.length}`;
        db.spaceLinks.push({ id: crypto.randomUUID(), space_id: s.id, token, created_at: now(), revoked_at: null });
        return json(200, { link_id: "l", token, created_at: now() });
      }) ??
      rpcCall("revoke_space_link", () => {
        let n = 0;
        db.spaceLinks.forEach((l) => {
          if (l.space_id === body.p_space_id && !l.revoked_at) {
            l.revoked_at = now();
            n += 1;
          }
        });
        return json(200, n);
      }) ??
      rpcCall("space_link_status", () => {
        const l = db.spaceLinks.find((x) => x.space_id === body.p_space_id && !x.revoked_at);
        return json(200, l ? [{ active: true, created_at: l.created_at, opened_count: db.spaceGrants.filter((g) => g.link_id === l.id).length }] : []);
      }) ??
      rpcCall("open_space_link", () => {
        if (!uid) return json(401, { message: "not_authenticated" });
        const l = db.spaceLinks.find((x) => x.token === body.p_token && !x.revoked_at);
        if (!l || space(l.space_id)?.visibility !== "link") return err("space_link_invalid");
        db.spaceGrants.push({ space_id: l.space_id, user_id: uid, link_id: l.id });
        return json(200, l.space_id);
      });
    if (handled) return handled;

    // ---- tablolar ----
    if (table === "spaces") {
      if (method === "GET") return rows(applyFilters(db.spaces, q).filter((s) => canRead(s.id, uid)));
      if (method === "PATCH") {
        const targets = applyFilters(db.spaces, q).filter((s) => roleOf(s.id, uid) === "owner");
        for (const s of targets) Object.assign(s, body, { updated_at: now() });
        return rows(targets);
      }
      if (method === "DELETE") {
        const targets = applyFilters(db.spaces, q).filter((s) => roleOf(s.id, uid) === "owner");
        db.spaces = db.spaces.filter((s) => !targets.includes(s));
        return rows(targets.map((s) => ({ id: s.id })));
      }
    }
    if (table === "space_members" && method === "GET") {
      const list = applyFilters(db.spaceMembers, q).filter((m) => m.user_id === uid || roleOf(m.space_id, uid));
      return rows(list.map((m) => ({ ...m, profile: person(m.user_id) })));
    }
    if (table === "space_invitations" && method === "GET") {
      return rows(applyFilters(db.spaceInvites, q).filter((i) => roleOf(i.space_id, uid) === "owner").map((i) => ({ ...i, invitee: person(i.invitee_id) })));
    }
    if (table === "space_user_state" && method === "GET") return rows(applyFilters(db.spaceState, q).filter((x) => x.user_id === uid));
    if (table === "space_activity" && method === "GET") {
      // Okuma: üye her zaman; üye olmayan yalnız Space'i okuyabiliyorsa ve ayar "herkes" ise (varsayılan).
      const visible = (a) => roleOf(a.space_id, uid) || (canRead(a.space_id, uid) && space(a.space_id)?.activity_visibility !== "members");
      let list = applyFilters(db.spaceActivity, q).filter(visible);
      const lt = q.get("created_at")?.startsWith("lt.") ? q.get("created_at").slice(3) : null;
      const gt = q.get("created_at")?.startsWith("gt.") ? q.get("created_at").slice(3) : null;
      if (lt) list = list.filter((a) => a.created_at < lt);
      if (gt) list = list.filter((a) => a.created_at > gt);
      const order = q.get("order") ?? "";
      list = [...list].sort((a, b) => (order.endsWith(".asc") ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
      if (q.get("limit")) list = list.slice(0, Number(q.get("limit")));
      return rows(list.map((a) => ({ ...a, actor: person(a.actor_id) })));
    }
    for (const [name, key] of [["space_items", "spaceItems"], ["space_groups", "spaceGroups"], ["space_palettes", "spacePalettes"], ["space_connections", "spaceConnections"]]) {
      if (table !== name) continue;
      if (method === "GET") {
        let list = applyFilters(db[key], q).filter((r) => canRead(r.space_id, uid));
        if (name === "space_items") list = list.filter((r) => !r.is_private || roleOf(r.space_id, uid));
        return rows(list);
      }
      if (method === "POST") {
        const input = Array.isArray(body) ? body : [body];
        if (input.some((r) => !canEdit(r.space_id, uid))) return json(403, { code: "42501", message: "new row violates row-level security policy for table \"" + name + "\"" });
        if (name === "space_connections") {
          for (const r of input) {
            if (db.spaceConnections.some((c) => (c.from_item_id === r.from_item_id && c.to_item_id === r.to_item_id))) return json(409, { code: "23505", message: "duplicate key value violates unique constraint \"space_connections_pair_idx\"" });
            if (db.spaceFail.connectionLimit) return err("space_connection_limit");
          }
        }
        if (name === "space_items") {
          for (const r of input) {
            if (r.kind === "image" && db.spaceItems.some((i) => i.space_id === r.space_id && i.kind === "image" && i.media_url === r.media_url)) {
              return json(409, { code: "23505", message: "duplicate key value violates unique constraint \"space_items_unique_image\"" });
            }
            if (db.spaceFail.sourceUnavailable && r.prompt_id) return err("space_source_unavailable");
          }
        }
        const created = input.map((r) => ({ created_at: now(), updated_at: now(), colors: [], description: "", source: "manual", ...r }));
        db[key].push(...created);
        return rows(created);
      }
      if (method === "PATCH") {
        const targets = applyFilters(db[key], q).filter((r) => canEdit(r.space_id, uid));
        for (const r of targets) Object.assign(r, body, { updated_at: now() });
        return rows(targets);
      }
      if (method === "DELETE") {
        const targets = applyFilters(db[key], q).filter((r) => canEdit(r.space_id, uid));
        db[key] = db[key].filter((r) => !targets.includes(r));
        if (name === "space_items") {
          const gone = new Set(targets.map((r) => r.id));
          db.spaceConnections = db.spaceConnections.filter((c) => !gone.has(c.from_item_id) && !gone.has(c.to_item_id));
        }
        if (name === "space_groups") db.spaceItems.forEach((i) => targets.some((g) => g.id === i.group_id) && (i.group_id = null));
        return rows(targets.map((r) => ({ id: r.id })));
      }
    }
    return prior ? prior(ctx) : false;
  };
}
