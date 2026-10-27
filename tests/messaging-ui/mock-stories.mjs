// Hikâyeler uçlarının ağ taklidi (docs/history/198-*). `mock.mjs` içindeki `db.extraRoutes` kancasına bağlanır. Görünürlük
// kuralının SADELEŞTİRİLMİŞ bir kopyasını içerir (yalnız istemci akışlarını sınamak için); asıl doğrulama
// `supabase/tests/stories.sql`'dedir. Gerçek Supabase'e KARŞI DENENMEDİ.
import { ME, U } from "./mock.mjs";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pub = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const author = (id) => {
  const u = Object.values(U).find((x) => x.id === id);
  return u ? { id: u.id, username: u.username, display_name: u.display_name, avatar_url: null } : null;
};
const inList = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : null);
const eq = (v) => (v?.startsWith("eq.") ? v.slice(3) : null);
const MEDIA_BASE = "https://example.supabase.co/storage/v1/object/public/story-media/";

export const layer = (text, over = {}) => ({ id: Math.random().toString(36).slice(2, 8), text, x: 0.5, y: 0.4, align: "center", size: "m", color: "white", bg: false, ...over });

/**
 * `db.stories` satırları sunucu biçimindedir (snake_case). `minutesAgo` ile oluşturma zamanı, `expired` ile süresi dolmuş hikâye.
 */
export function setupStories(db, { profileByUsername = true } = {}) {
  db.stories = [];
  db.storyViews = [];
  db.storyReactions = [];
  db.pollVotes = [];
  db.answers = [];
  db.highlights = [];
  db.drafts = [];
  db.archiveEnabled = true;
  db.failNextUpload = false;
  db.addStory = (owner, over = {}) => {
    const created = new Date(Date.now() - (over.minutesAgo ?? 30) * 60_000);
    const expires = new Date(created.getTime() + 24 * 3600_000);
    const row = {
      id: over.id ?? crypto.randomUUID(),
      author_id: owner.id,
      kind: over.kind ?? "text",
      media_url: over.media_url ?? null,
      media_mime: over.media_mime ?? null,
      media_width: null,
      media_height: null,
      media_duration_ms: null,
      layout: over.layout ?? { v: 1, bg: "cobalt", layers: [layer(over.text ?? `${owner.display_name} hikâyesi`)] },
      linked_type: over.linked_type ?? null,
      linked_id: over.linked_id ?? null,
      sticker_kind: over.sticker_kind ?? null,
      sticker_question: over.sticker_question ?? null,
      sticker_options: over.sticker_options ?? null,
      audience: over.audience ?? "public",
      community_id: over.community_id ?? null,
      created_at: created.toISOString(),
      expires_at: over.expired ? new Date(Date.now() - 60_000).toISOString() : expires.toISOString(),
      moderation_status: "visible",
      viewer_count: over.viewer_count ?? 0,
      view_count: over.viewer_count ?? 0,
      reaction_count: 0,
      reshared_from: null,
    };
    db.stories.push(row);
    return row;
  };
  const isFollower = (viewer, ownerId) => db.follows.some((f) => f.follower_id === viewer && f.following_id === ownerId);
  const highlighted = (id) => db.highlights.some((h) => h.items.includes(id));
  db.visible = (s, viewer) => {
    if (viewer && s.author_id === viewer) return true;
    if (s.moderation_status !== "visible") return false;
    if (viewer && db.isBlocked(viewer, s.author_id)) return false;
    if (new Date(s.expires_at) <= new Date() && !highlighted(s.id)) return false;
    if (s.audience === "public") return true;
    if (!viewer) return false;
    if (s.audience === "followers") return isFollower(viewer, s.author_id);
    return Boolean(db.member(s.community_id, viewer));
  };
  const withEmbeds = (s) => ({ ...s, author: author(s.author_id), community: null });

  const prior = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, method, q, body, signedIn, json, rows, err, route } = ctx;
    const viewer = signedIn;
    const rpc = table.startsWith("rpc/") ? table.slice(4) : null;
    if (profileByUsername && table === "profiles" && q.get("username")) {
      const name = q.get("username").replace(/^eq\./, "");
      return rows(Object.values(U).filter((u) => u.username === name).map(pub));
    }
    if (table === "profiles" && method === "PATCH" && "story_archive_enabled" in (body ?? {})) {
      db.archiveEnabled = body.story_archive_enabled;
      return rows([{ id: viewer }]);
    }
    if (table === "profiles" && (q.get("select") ?? "").includes("story_archive_enabled")) {
      return rows([{ story_archive_enabled: db.archiveEnabled }]);
    }

    if (rpc === "story_tray") {
      const scope = body.p_community_id;
      const active = db.stories.filter((s) => new Date(s.expires_at) > new Date() && s.moderation_status === "visible" && db.visible(s, viewer));
      const inScope = active.filter((s) =>
        scope ? s.community_id === scope : viewer && (s.author_id === viewer || (!s.community_id && isFollower(viewer, s.author_id)) || (s.community_id && db.member(s.community_id, viewer))),
      );
      const byAuthor = new Map();
      for (const s of inScope.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const list = byAuthor.get(s.author_id) ?? [];
        list.push(s);
        byAuthor.set(s.author_id, list);
      }
      const out = [...byAuthor.entries()].map(([aid, list]) => {
        const a = author(aid);
        return {
          author_id: aid,
          username: a.username,
          display_name: a.display_name,
          avatar_url: null,
          story_ids: list.map((s) => s.id),
          unseen_count: aid === viewer ? 0 : list.filter((s) => !db.storyViews.some((v) => v.story_id === s.id && v.viewer_id === viewer)).length,
          latest_at: list[list.length - 1].created_at,
          community_story_count: list.filter((s) => s.community_id).length,
        };
      });
      out.sort((x, y) => (y.author_id === viewer) - (x.author_id === viewer) || (y.unseen_count > 0) - (x.unseen_count > 0) || y.latest_at.localeCompare(x.latest_at));
      return json(200, out);
    }
    if (table === "stories" && method === "GET") {
      let list = db.stories.filter((s) => db.visible(s, viewer));
      const ids = inList(q.get("id"));
      if (ids) list = list.filter((s) => ids.includes(s.id));
      const a = eq(q.get("author_id"));
      if (a) list = list.filter((s) => s.author_id === a);
      if (q.get("moderation_status") === "eq.visible") list = list.filter((s) => s.moderation_status === "visible");
      const gt = q.get("expires_at")?.startsWith("gt.") ? q.get("expires_at").slice(3) : null;
      if (gt) list = list.filter((s) => s.expires_at > gt);
      const lt = q.get("created_at")?.startsWith("lt.") ? q.get("created_at").slice(3) : null;
      if (lt) list = list.filter((s) => s.created_at < lt);
      const desc = (q.get("order") ?? "").includes("desc");
      list = list.slice().sort((x, y) => x.created_at.localeCompare(y.created_at) * (desc ? -1 : 1));
      const lim = Number(q.get("limit") ?? 0);
      if (lim) list = list.slice(0, lim);
      if ((q.get("select") ?? "").trim() === "id") return rows(list.map((s) => ({ id: s.id })));
      return rows(list.map(withEmbeds));
    }
    if (table === "stories" && method === "DELETE") {
      const id = eq(q.get("id"));
      const target = db.stories.find((s) => s.id === id && s.author_id === viewer);
      db.stories = db.stories.filter((s) => s !== target);
      return rows(target ? [{ id }] : []);
    }
    if (table === "story_views" && method === "GET") {
      const ids = inList(q.get("story_id")) ?? [];
      return rows(db.storyViews.filter((v) => v.viewer_id === viewer && ids.includes(v.story_id)).map((v) => ({ story_id: v.story_id })));
    }
    if (rpc === "mark_story_viewed") {
      const s = db.stories.find((x) => x.id === body.p_story_id);
      if (!s || !db.visible(s, viewer)) return err("story_not_found");
      if (s.author_id !== viewer && !db.storyViews.some((v) => v.story_id === s.id && v.viewer_id === viewer)) {
        db.storyViews.push({ story_id: s.id, viewer_id: viewer, at: new Date().toISOString() });
        s.viewer_count += 1;
        s.view_count += 1;
      }
      return json(200, null);
    }
    const interactable = (id) => {
      const s = db.stories.find((x) => x.id === id);
      if (!s || !db.visible(s, viewer)) return { error: "story_not_found" };
      if (new Date(s.expires_at) <= new Date()) return { error: "story_expired" };
      if (s.author_id === viewer) return { error: "own_story" };
      return { story: s };
    };
    if (rpc === "set_story_reaction") {
      const { story, error } = interactable(body.p_story_id);
      if (error) return err(error);
      db.storyReactions = db.storyReactions.filter((r) => !(r.story_id === story.id && r.user_id === viewer));
      if (body.p_emoji) db.storyReactions.push({ story_id: story.id, user_id: viewer, emoji: body.p_emoji });
      return json(200, null);
    }
    if (table === "story_reactions" && method === "GET") {
      const sid = eq(q.get("story_id"));
      const r = db.storyReactions.find((x) => x.story_id === sid && x.user_id === viewer);
      return rows(r ? [{ emoji: r.emoji }] : []);
    }
    if (rpc === "vote_story_poll") {
      const { story, error } = interactable(body.p_story_id);
      if (error) return err(error);
      if (story.sticker_kind !== "poll" || body.p_option < 0 || body.p_option >= story.sticker_options.length) return err("invalid_vote");
      db.pollVotes = db.pollVotes.filter((v) => !(v.story_id === story.id && v.voter_id === viewer));
      db.pollVotes.push({ story_id: story.id, voter_id: viewer, option_index: body.p_option });
      return json(200, null);
    }
    if (rpc === "story_poll_results") {
      const s = db.stories.find((x) => x.id === body.p_story_id);
      if (!s || !db.visible(s, viewer)) return err("story_not_found");
      const mine = db.pollVotes.find((v) => v.story_id === s.id && v.voter_id === viewer)?.option_index ?? null;
      if (s.author_id !== viewer && mine === null) return json(200, { revealed: false, my_vote: null, total: null, counts: null });
      const counts = s.sticker_options.map((_, i) => db.pollVotes.filter((v) => v.story_id === s.id && v.option_index === i).length);
      return json(200, { revealed: true, my_vote: mine, total: counts.reduce((a, b) => a + b, 0), counts });
    }
    if (rpc === "answer_story_question") {
      const { story, error } = interactable(body.p_story_id);
      if (error) return err(error);
      const id = crypto.randomUUID();
      db.answers.push({ id, story_id: story.id, responder_id: viewer, body: body.p_body, created_at: new Date().toISOString() });
      return json(200, id);
    }
    if (table === "story_question_answers" && method === "GET") {
      const sid = eq(q.get("story_id"));
      const s = db.stories.find((x) => x.id === sid);
      return rows(
        db.answers
          .filter((a) => a.story_id === sid && (a.responder_id === viewer || s?.author_id === viewer) && (!q.get("id") || a.id === eq(q.get("id"))))
          .slice(Number(q.get("offset") ?? 0), q.get("limit") ? Number(q.get("offset") ?? 0) + Number(q.get("limit")) : undefined)
          .map((a) => ({ id: a.id, story_id: a.story_id, body: a.body, created_at: a.created_at, responder: author(a.responder_id) })),
      );
    }
    if (rpc === "reply_to_story") {
      const { story, error } = interactable(body.p_story_id);
      if (error) return err(error);
      const conv = db.addConv(crypto.randomUUID(), Object.values(U).find((u) => u.id === story.author_id));
      const msg = db.addMessage(conv, viewer, body.p_body);
      msg.story_id = story.id;
      msg.is_story_reply = true;
      return json(200, { conversation_id: conv, message_id: msg.id });
    }
    if (rpc === "story_viewers") {
      const s = db.stories.find((x) => x.id === body.p_story_id);
      if (!s || s.author_id !== viewer) return json(200, []);
      return json(
        200,
        db.storyViews
          .filter((v) => v.story_id === s.id)
          .slice(Number(body.p_offset ?? 0), body.p_limit ? Number(body.p_offset ?? 0) + Number(body.p_limit) : undefined)
          .map((v) => {
            const a = author(v.viewer_id);
            return { viewer_id: a.id, username: a.username, display_name: a.display_name, avatar_url: null, first_viewed_at: v.at, last_viewed_at: v.at, view_count: 1, reaction: db.storyReactions.find((r) => r.story_id === s.id && r.user_id === a.id)?.emoji ?? null };
          }),
      );
    }
    if (rpc === "create_story") {
      const p = body.p;
      const existing = db.stories.find((s) => s.author_id === viewer && s.client_token === p.client_token);
      if (existing) return json(200, existing.id);
      if (p.kind === "text" && !p.linked_type && !p.sticker_kind && !(p.layout?.layers?.length > 0)) return err("empty_story");
      if (p.kind !== "text" && !String(p.media_url ?? "").startsWith(`${MEDIA_BASE}${viewer}/`)) return err("invalid_media");
      if (p.audience === "community" && !db.member(p.community_id, viewer)) return err("forbidden");
      const row = db.addStory(Object.values(U).find((u) => u.id === viewer), {
        kind: p.kind,
        media_url: p.media_url,
        media_mime: p.media_mime,
        layout: p.layout,
        linked_type: p.linked_type,
        linked_id: p.linked_id,
        sticker_kind: p.sticker_kind,
        sticker_question: p.sticker_question,
        sticker_options: p.sticker_options,
        audience: p.audience,
        community_id: p.community_id,
        minutesAgo: 0,
      });
      row.client_token = p.client_token;
      return json(200, row.id);
    }
    if (rpc === "reshare_story") {
      const s = db.stories.find((x) => x.id === body.p_story_id && x.author_id === viewer);
      if (!s) return err("story_not_found");
      const row = db.addStory(Object.values(U).find((u) => u.id === viewer), { ...s, id: undefined, audience: body.p_audience, minutesAgo: 0, expired: false });
      return json(200, row.id);
    }
    if (table === "story_highlights" && method === "GET") {
      const owner = eq(q.get("owner_id"));
      return rows(
        db.highlights
          .filter((h) => h.owner_id === owner)
          .map((h) => ({
            id: h.id,
            owner_id: h.owner_id,
            title: h.title,
            cover_story_id: h.cover ?? null,
            position: 0,
            story_highlight_items: h.items
              .filter((sid) => {
                const s = db.stories.find((x) => x.id === sid);
                return s && db.visible(s, viewer);
              })
              .map((sid, i) => ({ story_id: sid, position: i })),
          }))
          .filter((h) => h.owner_id === viewer || h.story_highlight_items.length > 0),
      );
    }
    if (rpc === "save_story_highlight") {
      if (!String(body.p_title ?? "").trim() || !(body.p_story_ids?.length > 0)) return err("invalid_highlight");
      if (body.p_story_ids.some((id) => !db.stories.some((s) => s.id === id && s.author_id === viewer))) return err("story_not_found");
      const existing = db.highlights.find((h) => h.id === body.p_highlight_id);
      if (existing) Object.assign(existing, { title: body.p_title, items: body.p_story_ids, cover: body.p_cover_story_id });
      else db.highlights.push({ id: crypto.randomUUID(), owner_id: viewer, title: body.p_title, items: body.p_story_ids, cover: body.p_cover_story_id });
      return json(200, existing?.id ?? db.highlights[db.highlights.length - 1].id);
    }
    if (rpc === "add_story_to_highlight") {
      const h = db.highlights.find((x) => x.id === body.p_highlight_id && x.owner_id === viewer);
      if (!h) return err("highlight_not_found");
      if (!h.items.includes(body.p_story_id)) h.items.push(body.p_story_id);
      return json(200, null);
    }
    if (table === "story_drafts") {
      if (method === "GET") return rows(db.drafts.filter((d) => d.owner_id === viewer));
      if (method === "POST") {
        db.drafts.push({ ...body, updated_at: new Date().toISOString() });
        await route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } });
        return true;
      }
      if (method === "PATCH") {
        const id = eq(q.get("id"));
        const d = db.drafts.find((x) => x.id === id && x.owner_id === viewer);
        if (d) Object.assign(d, body, { updated_at: new Date().toISOString() });
        return rows(d ? [{ id }] : []);
      }
      if (method === "DELETE") {
        const id = eq(q.get("id"));
        db.drafts = db.drafts.filter((x) => !(x.id === id && x.owner_id === viewer));
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return true;
      }
    }
    if (["prompts", "prompt_requests", "workflows", "presets"].includes(table) && (q.get("select") ?? "").startsWith("id, title, description")) {
      if (table !== "prompts") return rows([]);
      return rows((db.linkable ?? []).filter(() => !q.get("author_id") || q.get("author_id") === `eq.${viewer}`));
    }
    return prior ? prior(ctx) : null;
  };
  return db;
}

export { ME, U, MEDIA_BASE };
