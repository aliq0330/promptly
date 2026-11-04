// Bildirim merkezi (docs/history/326-*), ağ taklitli: zil rozeti (kart sayısı), zilin altında hızlı eylemli panel, sunucu gruplaması ("Burak, Carol ve 1 kişi daha"),
// hızlı beğen/yanıtla/takip/kabul-reddet + "Geri al", "N yeni" hapı, bölünmüş gelen kutusu + Ayrıntı, sessize al / ertele / tür kapat, mobil sayfa, Ayarlar.
// Gerçek Supabase'e / Realtime'a / cihaza KARŞI DENENMEDİ: RPC'ler bu dosyada JS ile taklit edilir; asıl SQL doğrulaması `supabase/tests/notification-center.sql`'dedir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";
import { notificationCategoryOf, notificationGroupKey } from "../../src/lib/notification-mirror.ts";

const BASE = "http://localhost:4190/promptly";
const server = await serve(4190);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const P1 = "a1000000-0000-4000-8000-000000000001";
const C1 = "c1000000-0000-4000-8000-000000000001";
const S1 = "5a000000-0000-4000-8000-000000000001";
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

/** Sunucunun `notifications` tablosu + RPC'lerinin JS taklidi (SQL ile aynı kurallar: grup anahtarı, ertelenmiş gizleme, keyset). */
function makeNotifications(db, rows) {
  const state = { rows, calls: [], mutes: [], prefs: [], commentLikes: [], comments: [], follows: db.follows, replies: [], seq: 100 };
  const gk = (r) => notificationGroupKey(r.type, r.target_href, r.id);
  const sa = (r) => (r.snoozed_until && new Date(r.snoozed_until) > new Date(r.created_at) ? r.snoozed_until : r.created_at);
  const visible = (r, snoozedOnly = false) => (snoozedOnly ? r.snoozed_until && new Date(r.snoozed_until) > new Date() : !r.snoozed_until || new Date(r.snoozed_until) <= new Date());
  const idsFor = (key) => state.rows.filter((r) => gk(r) === key);
  db.rpc.notifications_grouped_page = (b) => {
    const list = [...state.rows].sort((x, y) => (y.created_at < x.created_at ? -1 : 1)).filter((r) => visible(r, b.p_snoozed_only) && (!b.p_category || notificationCategoryOf(r.type, r.target_href) === b.p_category));
    const groups = new Map();
    for (const r of list) groups.set(gk(r), [...(groups.get(gk(r)) ?? []), r]);
    let out = [...groups.entries()].map(([key, rs]) => {
      rs.sort((x, y) => (sa(y) < sa(x) ? -1 : 1));
      const actors = [...new Set(rs.map((r) => r.actor_id).filter(Boolean))].slice(0, 3);
      const counts = {};
      for (const r of rs) if (r.reaction) counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
      return { group_key: key, type: rs[0].type, target_href: rs[0].target_href, sort_at: sa(rs[0]), row_count: rs.length, unread_count: rs.filter((r) => !r.is_read).length, latest_id: rs[0].id, latest_message: rs[0].message, latest_actor_id: rs[0].actor_id, actor_ids: actors, reaction_counts: counts };
    });
    out.sort((x, y) => (y.sort_at === x.sort_at ? (y.group_key < x.group_key ? -1 : 1) : y.sort_at < x.sort_at ? -1 : 1));
    if (b.p_unread_only) out = out.filter((g) => g.unread_count > 0);
    if (b.p_before_at) out = out.filter((g) => g.sort_at < b.p_before_at || (g.sort_at === b.p_before_at && g.group_key < b.p_before_key));
    return { body: out.slice(0, b.p_limit ?? 30) };
  };
  const unreadGroups = () => new Set(state.rows.filter((r) => !r.is_read && visible(r)).map(gk));
  db.rpc.notifications_unread_group_count = () => ({ body: unreadGroups().size });
  db.rpc.notifications_unread_by_category = () => {
    const by = {};
    for (const r of state.rows.filter((x) => !x.is_read && visible(x))) { const c = notificationCategoryOf(r.type, r.target_href); (by[c] ??= new Set()).add(gk(r)); }
    return { body: Object.entries(by).map(([category, s]) => ({ category, n: s.size })) };
  };
  db.rpc.notifications_snooze_summary = () => {
    const sn = state.rows.filter((r) => visible(r, true));
    return { body: [{ snoozed_groups: new Set(sn.map(gk)).size, next_wake: sn.map((r) => r.snoozed_until).sort()[0] ?? null }] };
  };
  db.rpc.notifications_group_members = (b) => ({ body: idsFor(b.p_key).sort((x, y) => (y.created_at < x.created_at ? -1 : 1)).map((r) => ({ id: r.id, actor_id: r.actor_id, reaction: r.reaction ?? null, is_read: r.is_read, created_at: r.created_at, message: r.message })) });
  db.rpc.notifications_group_mark_read = (b) => { state.calls.push(["mark_read", b.p_key]); const rs = idsFor(b.p_key); rs.forEach((r) => (r.is_read = true)); return { body: rs.length }; };
  db.rpc.notifications_group_mark_unread = (b) => { state.calls.push(["mark_unread", b.p_key]); const rs = idsFor(b.p_key); rs.forEach((r) => (r.is_read = false)); return { body: rs.length }; };
  db.rpc.notifications_group_delete = (b) => { state.calls.push(["delete", b.p_key]); const rs = idsFor(b.p_key); state.rows = state.rows.filter((r) => !rs.includes(r)); return { body: rs.length }; };
  db.rpc.notifications_group_snooze = (b) => { state.calls.push(["snooze", b.p_key, b.p_until]); const rs = idsFor(b.p_key); rs.forEach((r) => { r.snoozed_until = b.p_until; r.is_read = false; }); return { body: rs.length }; };
  db.rpc.notifications_group_unsnooze = (b) => { state.calls.push(["unsnooze", b.p_key]); const rs = idsFor(b.p_key); rs.forEach((r) => (r.snoozed_until = null)); return { body: rs.length }; };
  db.rpc.set_notification_mute = (b) => {
    state.calls.push(["mute", b.p_kind, b.p_target, b.p_on]);
    state.mutes = state.mutes.filter((m) => !(m.kind === b.p_kind && m.target === b.p_target));
    if (b.p_on) state.mutes.push({ kind: b.p_kind, target: b.p_target, label: b.p_label, created_at: new Date().toISOString() });
    return { body: null };
  };
  db.rpc.set_notification_type_pref = (b) => {
    state.calls.push(["pref", b.p_key, b.p_enabled]);
    state.prefs = state.prefs.filter((k) => k !== b.p_key);
    if (!b.p_enabled) state.prefs.push(b.p_key);
    return { body: null };
  };
  // Yorum tepki sayıları (docs/history/327-*): başkalarının tepkileri `state.others` + benim tepkilerim `state.commentLikes`.
  state.others = [];
  db.rpc.comment_reaction_counts = (b) => {
    const rows = [...state.others, ...state.commentLikes.map((l) => ({ comment_id: l.comment_id, reaction: l.reaction ?? "love", n: 1 }))].filter((r) => (b.p_ids ?? []).includes(r.comment_id));
    const by = new Map();
    for (const r of rows) by.set(`${r.comment_id}|${r.reaction}`, { target_id: r.comment_id, reaction: r.reaction, n: (by.get(`${r.comment_id}|${r.reaction}`)?.n ?? 0) + r.n });
    state.calls.push(["comment_reaction_counts", (b.p_ids ?? []).length]);
    return { body: [...by.values()] };
  };
  db.rpc.comment_reaction_friends = () => ({ body: [] });
  db.rpc.accept_prompt_edit_suggestion = (b) => { state.calls.push(["accept_suggestion", b.p_suggestion_id, b.p_final_prompt_text]); return { body: null }; };
  db.rpc.reject_prompt_edit_suggestion = (b) => { state.calls.push(["reject_suggestion", b.p_suggestion_id]); return { body: null }; };
  db.extraRoutes = async ({ table, method, q, body, json, rows: rowsOf, route }) => {
    const noContent = () => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    const eq = (v) => (v?.startsWith("eq.") ? v.slice(3) : null);
    const inl = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : null);
    if (table === "notifications" && method === "PATCH") { state.calls.push(["patch_notifications", body]); state.rows.forEach((r) => (r.is_read = true)); return noContent().then(() => true); }
    if (table === "notifications" && method === "DELETE") { state.calls.push(["delete_all"]); state.rows = []; return noContent().then(() => true); }
    if (table === "prompt_comments" && method === "GET") { const ids = inl(q.get("id")) ?? []; return rowsOf(state.comments.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, body: c.body, deleted_at: null, like_count: c.like_count ?? 0, media_kind: c.media_kind ?? null, media_ref: c.media_ref ?? null, media_width: c.media_width ?? null, media_height: c.media_height ?? null, attach_type: c.attach_type ?? null, attach_id: c.attach_id ?? null }))); }
    if (table === "prompt_comments" && method === "POST") {
      const row = { id: `c9000000-0000-4000-8000-${String(++state.seq).padStart(12, "0")}`, body: body.body, parent_id: body.parent_id, like_count: 0, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, rating: null, profiles: { ...U.alice, email: undefined, phone: undefined } };
      state.replies.push({ ...body, id: row.id });
      return json(201, row);
    }
    if (table === "prompt_comments" && method === "DELETE") { state.calls.push(["delete_comment", q.get("id")]); state.replies = state.replies.filter((r) => `eq.${r.id}` !== q.get("id")); return noContent().then(() => true); }
    if (table === "comment_likes" && method === "GET") { const ids = inl(q.get("comment_id")) ?? []; return rowsOf(state.commentLikes.filter((l) => ids.includes(l.comment_id)).map((l) => ({ comment_id: l.comment_id, reaction: l.reaction ?? "love" }))); }
    if (table === "comment_likes" && method === "POST") { state.commentLikes.push({ comment_id: body.comment_id, reaction: body.reaction ?? "love" }); state.calls.push(["like_comment", body.comment_id, body.reaction ?? "love"]); return json(201, {}); }
    if (table === "comment_likes" && method === "PATCH") { const l = state.commentLikes.find((x) => `eq.${x.comment_id}` === q.get("comment_id")); if (l) l.reaction = body.reaction; state.calls.push(["change_reaction", eq(q.get("comment_id")), body.reaction]); return rowsOf(l ? [{ comment_id: l.comment_id }] : []); }
    if (table === "comment_likes" && method === "DELETE") { state.calls.push(["unlike_comment", eq(q.get("comment_id"))]); state.commentLikes = state.commentLikes.filter((l) => `eq.${l.comment_id}` !== q.get("comment_id")); return noContent().then(() => true); }
    if (table === "prompt_edit_suggestions" && method === "GET") return rowsOf([{ id: S1, prompt_id: P1, suggestion_text: "Işığı daha tutarlı yaptım.", proposed_prompt_text: "softbox light, 85mm, white table", status: state.suggestionStatus ?? "pending" }]);
    if (table === "prompts" && method === "GET") return rowsOf([{ id: P1, title: "Gece Şehri · Sinematik", prompt_text: "soft light, white table", status: "published", visibility: "public", community_id: null, deleted_at: null, profiles: { display_name: "Alice" }, prompt_media: [] }]);
    if (table === "follows" && method === "POST") { db.follows.push({ follower_id: body.follower_id, following_id: body.following_id }); state.calls.push(["follow", body.following_id]); return json(201, {}); }
    if (table === "follows" && method === "DELETE") { state.calls.push(["unfollow", eq(q.get("following_id"))]); db.follows = db.follows.filter((f) => `eq.${f.following_id}` !== q.get("following_id")); db.follows.splice(0, db.follows.length, ...db.follows); return noContent().then(() => true); }
    if (table === "notification_mutes" && method === "GET") return rowsOf(state.mutes.map((m) => ({ kind: m.kind, target: m.target, label: m.label, created_at: m.created_at })));
    if (table === "notification_type_prefs" && method === "GET") return rowsOf(state.prefs.map((k) => ({ pref_key: k })));
    return false;
  };
  return state;
}

const row = (id, type, actor, message, href, minutes, extra = {}) => ({ id, type, actor_id: actor?.id ?? null, message, target_href: href, is_read: false, created_at: minutesAgo(minutes), snoozed_until: null, reaction: null, ...extra });
const seedRows = () => [
  row("n1", "comment", U.dave, 'Paylaşımına yorum yaptı: "Işık kontrolü harika"', `/prompts/local?id=${P1}&hl=comment:${C1}`, 2),
  row("n2", "like", U.bob, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, 25, { reaction: "love" }),
  row("n3", "like", U.carol, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, 20, { reaction: "fire" }),
  row("n4", "like", U.amy, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, 10, { reaction: "love" }),
  row("n5", "follow", U.zed, "Seni takip etmeye başladı.", "/profile/real?username=alice", 60),
  row("n6", "edit_suggestion_received", U.carol, 'Promptun için bir düzenleme önerdi: "Işığı daha tutarlı yaptım."', `/prompts/local?id=${P1}&hl=suggestion:${S1}`, 180),
  row("n7", "system", null, 'Promptun "Gece Şehri" 100 kopyalamaya ulaştı.', `/insights/local?id=${P1}`, 1500, { is_read: true }),
  row("n8", "message_request", U.bob, "Sana bir mesaj isteği gönderdi.", `/messages/local?id=${CONV}`, 240),
];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", theme, rows = seedRows(), setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { status: "pending" });
  const state = makeNotifications(db, rows);
  state.comments = [{ id: C1, body: "Işık kontrolü harika. Aynı promptu İstanbul'da denedim, sonuç çok güzel çıktı." }];
  setup?.(db, state);
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await hub.install(context, ME);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DEBUG) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 300)));
  try { await fn({ page, db, state, hub }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ncfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

/** Taklit sunucuya giden istek asenkron: koşul sağlanana kadar kısa aralıkla bekler. */
async function until(fn, message = "koşul gerçekleşmedi", ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  assert.ok(fn(), message);
}
/** İsteğe bağlı ekran görüntüsü: `SHOT_DIR` verilirse alınır (görsel inceleme için; testin sonucunu etkilemez). */
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.waitForTimeout(450).then(() => page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` })); };
const bell = (page) => page.locator("[data-notification-bell]");
const popover = (page) => page.locator("[data-notification-popover]");
const card = (page, scope, type) => scope.locator(`[data-notification-card]`).filter({ has: page.locator(`[data-quick-actions="${type}"]`) });
async function openPopover(page, path = "/") {
  await page.goto(`${BASE}${path}`);
  await bell(page).waitFor();
  await bell(page).click();
  await popover(page).waitFor();
  await popover(page).locator("[data-notification-card]").first().waitFor();
}
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Zil rozeti okunmamış KART sayısını gösterir (8 satır → 5 okunmamış kart), 99+ sınırı", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await bell(page).waitFor();
  await page.locator("[data-bell-badge]").waitFor();
  assert.equal((await page.locator("[data-bell-badge]").textContent()).trim(), "5", "3 beğeni tek kart: comment, like, follow, öneri, mesaj isteği");
  assert.match((await bell(page).getAttribute("aria-label")) ?? "", /5 okunmamış/);
  assert.equal(state.rows.length, 8);
});

await scenario("2. Zil masaüstünde zilin altında panel açar: arkası loşlanmaz, ok zile bağlı, gruplu kart '… ve 1 kişi daha'", async ({ page }) => {
  await openPopover(page);
  const p = popover(page);
  await page.waitForTimeout(400); // açılış animasyonu (ölçek) bitsin
  const box = await p.boundingBox();
  const bb = await bell(page).boundingBox();
  assert.ok(box.y >= bb.y + bb.height - 1, "panel zilin altında");
  assert.ok(Math.abs(box.x + box.width - (bb.x + bb.width)) < 40, "sağ kenarı zile hizalı");
  assert.ok(Math.abs(box.width - 440) <= 1, "440px genişlik");
  const text = await p.textContent();
  assert.match(text, /Amy, Carol ve 1 kişi daha/, "en yeni iki ad + kalan sayı");
  assert.match(text, /promptunu beğendi/);
  assert.match(text, /Dave/, "yorum bildirimi aktörü");
  assert.match(text, /Işık kontrolü harika\. Aynı promptu/, "yorum gövdesi alıntı kutusunda (toplu sorgudan)");
  assert.equal(await p.locator("[data-notification-card]").count(), 6, "6 kart: yorum, beğeni grubu, takip, öneri, mesaj isteği, kilometre taşı");
  assert.match(await p.locator("[data-reaction-summary]").first().textContent(), /2 sevdim · 1 ateş/);
  assert.equal(await page.locator("[data-notification-popover]").evaluate((el) => getComputedStyle(el).position), "fixed");
  assert.equal(await page.locator("div.fixed.inset-0.bg-black\\/40, [data-modal-backdrop]").count(), 0, "loşlaştırma katmanı yok");
  await shot(page, "1-popover");
});

await scenario("3. Esc, dışarı tıklama ve rota değişimi paneli kapatır; Tüm bildirimleri gör sayfaya gider", async ({ page }) => {
  await openPopover(page);
  await page.keyboard.press("Escape");
  await popover(page).waitFor({ state: "detached" });
  await bell(page).click();
  await popover(page).waitFor();
  await page.mouse.click(30, 300);
  await popover(page).waitFor({ state: "detached" });
  await bell(page).click();
  await popover(page).locator("[data-action=see-all]").click();
  await page.waitForURL(/\/notifications/);
  await popover(page).waitFor({ state: "detached" });
});

const picker = (page) => page.locator("[data-reaction-picker]");
await scenario("4. Hızlı beğen: gönderideki emoji seçici açılır (6 hareketli emoji), seçilince düğme tepkinin adı olur, Geri al kaldırır; panel seçiciyle kapanmaz", async ({ page, state }) => {
  await openPopover(page);
  const c = card(page, popover(page), "comment");
  const like = c.locator("[data-action=like] button");
  await like.click();
  await picker(page).waitFor();
  assert.equal(await picker(page).locator("[data-reaction]").count(), 6);
  await picker(page).locator('[data-reaction="fire"]').click();
  await like.filter({ hasText: "Ateş" }).waitFor();
  await popover(page).waitFor();
  assert.deepEqual(state.calls.find((x) => x[0] === "like_comment"), ["like_comment", C1, "fire"]);
  await popover(page).locator("[data-undo-bar=inline]").waitFor();
  assert.match(await popover(page).locator("[data-undo-bar]").textContent(), /Ateş tepkisi verdin/);
  assert.equal(await c.getAttribute("data-unread"), "false", "eylem sonrası kart okundu");
  await popover(page).locator("[data-action=undo]").click();
  await like.filter({ hasText: "Hızlı beğen" }).waitFor();
  assert.ok(state.calls.some((x) => x[0] === "unlike_comment"));
  // Tepki değiştirme: PATCH
  await like.click();
  await picker(page).locator('[data-reaction="love"]').click();
  await like.filter({ hasText: "Sevdim" }).waitFor();
  await like.click();
  await picker(page).locator('[data-reaction="wow"]').click();
  await like.filter({ hasText: "Vay be" }).waitFor();
  assert.deepEqual(state.calls.find((x) => x[0] === "change_reaction"), ["change_reaction", C1, "wow"]);
  // Seçili olana tekrar basmak geri alır; Esc yalnız seçiciyi kapatır, panel kalır.
  await like.click();
  await picker(page).waitFor();
  await page.keyboard.press("Escape");
  await picker(page).waitFor({ state: "detached" });
  await popover(page).waitFor();
  await like.click();
  await picker(page).locator('[data-reaction="wow"]').click();
  await like.filter({ hasText: "Hızlı beğen" }).waitFor();
});

await scenario("5. Yanıtla: satır içi kutu, gönderince yanıt balonu kartta kalır, parent_id yorum, Geri al yanıtı siler", async ({ page, state }) => {
  await openPopover(page);
  const c = card(page, popover(page), "comment");
  await c.locator("[data-action=reply]").click();
  const send = c.locator("[data-action=reply-send]");
  assert.equal(await send.isDisabled(), true, "boş yanıt gönderilemez");
  await c.locator("textarea").fill("Teşekkürler Dave! İstanbul sürümünü görmek isterim.");
  await send.click();
  await c.locator("[data-reply-bubble]").waitFor();
  assert.equal(state.replies.length, 1);
  assert.equal(state.replies[0].parent_id, C1);
  assert.equal(state.replies[0].prompt_id, P1);
  assert.match(await c.locator("[data-reply-bubble]").textContent(), /İstanbul sürümünü/);
  await popover(page).locator("[data-action=undo]").click();
  await c.locator("[data-reply-bubble]").waitFor({ state: "detached" });
  assert.ok(state.calls.some((x) => x[0] === "delete_comment"));
});

await scenario("6. Sen de takip et: düğme 'Takip ediyorsun' olur; Geri al takibi bırakır", async ({ page, state, db }) => {
  await openPopover(page);
  const c = card(page, popover(page), "followBack");
  await c.locator("[data-action=follow]").click();
  await c.locator("[data-action=follow]").filter({ hasText: "Takip ediyorsun" }).waitFor();
  assert.deepEqual(state.calls.find((x) => x[0] === "follow"), ["follow", U.zed.id]);
  assert.ok(db.follows.some((f) => f.follower_id === ME && f.following_id === U.zed.id));
  await popover(page).locator("[data-action=undo]").click();
  await c.locator("[data-action=follow]").filter({ hasText: "Sen de takip et" }).waitFor();
  assert.ok(state.calls.some((x) => x[0] === "unfollow"));
});

await scenario("7. Düzenleme önerisi: −/+ fark önizlemesi, Kabul et önerilen metni aynen uygular, sonuç satırı gelir", async ({ page, state }) => {
  await openPopover(page);
  const c = card(page, popover(page), "suggestion");
  const diff = await c.locator("[data-suggestion-diff]").textContent();
  assert.match(diff, /− soft light, white table/);
  assert.match(diff, /\+ softbox light, 85mm, white table/);
  await c.locator("[data-action=accept]").click();
  await c.locator("[data-suggestion-result=accepted]").waitFor();
  assert.deepEqual(state.calls.find((x) => x[0] === "accept_suggestion"), ["accept_suggestion", S1, "softbox light, 85mm, white table"]);
  assert.equal(await popover(page).locator("[data-undo-bar]").count(), 0, "kabul geri alınamaz: şerit yok");
});

await scenario("8. Öneri reddi ve mesaj isteği kabul/red", async ({ page, state, db }) => {
  await openPopover(page);
  await card(page, popover(page), "suggestion").locator("[data-action=reject]").click();
  await card(page, popover(page), "suggestion").locator("[data-suggestion-result=rejected]").waitFor();
  assert.ok(state.calls.some((x) => x[0] === "reject_suggestion"));
  const m = card(page, popover(page), "messageRequest");
  await m.locator("[data-action=request-accept]").click();
  await m.locator("[data-request-result=accepted]").waitFor();
  assert.ok(db.calls.some((x) => x.method === "PATCH" && x.table === "conversation_members" && x.body?.status === "accepted"));
});

await scenario("9. Kilometre taşı kartı: büyük başlık, İstatistiği gör bağlantısı, Paylaş", async ({ page }) => {
  await openPopover(page);
  const c = card(page, popover(page), "milestone");
  assert.match(await c.textContent(), /Promptun 100 kez kopyalandı/);
  assert.match((await c.locator("[data-action=stats]").getAttribute("href")) ?? "", new RegExp(`/insights/local/?\\?id=${P1}`));
  await c.locator("[data-action=share]").waitFor();
});

await scenario("10. Gerçek zamanlı yeni bildirim listeyi kaydırmaz: '1 yeni' hapı çıkar, basınca yeni kart (Burak … ve 2 kişi) en üstte", async ({ page, state, hub }) => {
  await openPopover(page);
  const before = await popover(page).locator("[data-notification-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-notification-card")));
  state.rows.push(row("n9", "like", U.dave, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, 0, { reaction: "wow" }));
  hub.emitPostgresChange("notifications", "INSERT", { recipient_id: ME, id: "n9" });
  await popover(page).locator("[data-action=show-new]").waitFor();
  assert.match(await popover(page).locator("[data-action=show-new]").textContent(), /1 yeni/);
  const during = await popover(page).locator("[data-notification-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-notification-card")));
  assert.deepEqual(during, before, "liste yeniden dizilmedi");
  await popover(page).locator("[data-action=show-new]").click();
  await popover(page).locator("[data-action=show-new]").waitFor({ state: "detached" });
  const first = popover(page).locator("[data-notification-card]").first();
  assert.match(await first.textContent(), /Dave, Amy ve 2 kişi daha/);
  assert.equal(await first.getAttribute("data-unread"), "true");
});

await scenario("11. Ayrıntı: /notifications?n= bölünmüş gelen kutusu (solda liste, sağda ayrıntı), seçilince kart okundu olur", async ({ page, state }) => {
  await openPopover(page);
  await card(page, popover(page), "comment").locator("[data-action=detail]").click();
  await page.waitForURL(/\/notifications\/?\?n=/);
  assert.equal(await page.locator("[data-notification-page]").getAttribute("data-notification-page"), "split");
  const detail = page.locator("[data-notification-detail]");
  await detail.waitFor();
  await page.waitForFunction(() => /Aynı promptu İstanbul'da denedim/.test(document.querySelector("[data-detail-body]")?.textContent ?? ""));
  assert.equal(await page.locator("[data-notification-row]").count(), 6);
  assert.equal(await page.locator("[data-notification-row][aria-current=true]").count(), 1);
  assert.ok(state.calls.some((x) => x[0] === "mark_read"), "açılışta okundu");
  await detail.locator("[data-inline-reaction-picker]").waitFor();
  assert.equal(await detail.locator("[data-inline-reaction-picker] [data-reaction]").count(), 6, "açık emoji seçici");
  assert.ok((await detail.locator("[data-linked-content=card]").textContent()).includes("Gece Şehri · Sinematik"), "bağlı içerik kartı");
  // Listeden başka bir bildirim seçmek ayrıntıyı değiştirir.
  await page.locator("[data-notification-row]").filter({ hasText: "beğendi" }).click();
  await page.locator("[data-group-members]").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-group-members] [data-member-reaction]").length === 3);
  assert.match(await page.locator("[data-reaction-summary]").first().textContent(), /2 sevdim · 1 ateş/);
  assert.ok(await overflowFree(page));
  await shot(page, "2-split");
});

await scenario("12. Ayrıntıda yorum: hızlı tepki satırı, yanıt kutusu, foto/GIF/ek araç çubuğu", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|n1")}`);
  const detail = page.locator("[data-notification-detail]");
  await detail.waitFor();
  // Seçici AÇIK gelir (gönderideki emoji menüsünün aynısı, 6 hareketli emoji) ve ayrıca açılıp kapanan bir şey yoktur.
  await detail.locator("[data-inline-reaction-picker]").waitFor();
  assert.equal(await detail.locator("[data-inline-reaction-picker] [data-reaction]").count(), 6);
  await detail.locator('[data-inline-reaction-picker] [data-reaction="clap"]').click();
  await detail.locator('[data-inline-reaction-picker] [data-reaction="clap"][aria-current=true]').waitFor();
  await until(() => state.calls.some((x) => x[0] === "like_comment"), "tepki isteği");
  assert.deepEqual(state.calls.find((x) => x[0] === "like_comment"), ["like_comment", C1, "clap"]);
  // Tepki özeti: tepki sayılıyor ve gönderideki gibi "Tepkiler" listesine açılıyor.
  await detail.locator(`[data-reaction-summary="${C1}"]`).waitFor();
  assert.match(await detail.locator(`[data-reaction-summary="${C1}"]`).textContent(), /Tepki verdin/);
  assert.ok((await detail.locator("textarea").count()) >= 1);
  assert.ok((await detail.getByRole("button", { name: /Fotoğraf|GIF|İçerik|photo|content/i }).count()) >= 2, "ek araçları");
  await detail.locator("textarea").fill("Sağ ol!");
  await detail.locator("[data-action=reply-send]").click();
  await detail.locator("[data-reply-bubble]").waitFor();
  assert.equal(state.replies[0].body, "Sağ ol!");
});

await scenario("13. Ayrıntı alt satırı: Sessize al (kişi/içerik), Yarın hatırlat (kart gider, ertelenenler sayılır), Bu tür bildirimleri kapat (onay + geri al)", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|n1")}`);
  const detail = page.locator("[data-notification-detail]");
  await detail.waitFor();
  await detail.locator("[data-action=mute]").click();
  await detail.locator("[data-action=mute-person]").click();
  await until(() => state.calls.some((x) => x[0] === "mute"), "sessize alma RPC'si");
  assert.deepEqual(state.calls.find((x) => x[0] === "mute"), ["mute", "actor", U.dave.id, true]);
  await page.locator("[data-undo-bar]").waitFor();
  await page.locator("[data-action=undo]").click();
  await until(() => state.calls.some((x) => x[0] === "mute" && x[3] === false), "geri al sessize almayı kaldırır");
  await detail.locator("[data-action=mute]").click();
  await detail.locator("[data-action=mute-content]").click();
  await until(() => state.calls.filter((x) => x[0] === "mute" && x[3] === true).length === 2, "içerik sessize alma RPC'si");
  assert.deepEqual(state.calls.filter((x) => x[0] === "mute" && x[3] === true).pop().slice(0, 3), ["mute", "content", `/prompts/local?id=${P1}`], "içerik anahtarı hl= olmadan");
  // Durum biliniyor: içerik sessizde → seçenek "sesini aç"; kişi de sessize alınınca ana düğme "Sesi aç" olur.
  await detail.locator("[data-action=mute]").click();
  await detail.locator("[data-action=unmute-content]").waitFor();
  await detail.locator("[data-action=mute-person]").click();
  await until(() => state.calls.filter((x) => x[0] === "mute" && x[3] === true).length === 3, "kişi yeniden sessize alındı");
  await page.locator("[data-undo-bar]").waitFor();
  await detail.locator("[data-action=unmute]").waitFor();
  assert.match(await detail.locator("[data-action=unmute]").textContent(), /Sesi aç/);
  await detail.locator("[data-action=unmute]").click();
  await detail.locator("[data-action=unmute-person]").click();
  await until(() => state.calls.some((x) => x[0] === "mute" && x[1] === "actor" && x[3] === false && state.calls.filter((y) => y[0] === "mute" && y[1] === "actor").length >= 4), "kişinin sesi açıldı");
  await detail.locator("[data-action=mute]").waitFor();
  // Ertele
  await detail.locator("[data-action=snooze]").click();
  await page.locator('[data-notification-row="n|n1"]').waitFor({ state: "detached" });
  await until(() => state.calls.some((x) => x[0] === "snooze"), "erteleme RPC'si");
  const snooze = state.calls.find((x) => x[0] === "snooze");
  assert.equal(snooze[1], "n|n1");
  const wakeAt = new Date(snooze[2]);
  assert.equal(wakeAt.getHours(), 9, "yarın 09:00");
  assert.ok(wakeAt > new Date());
  // Tür kapat
  await page.locator("[data-notification-row]").filter({ hasText: "takip etmeye" }).click();
  await page.locator("[data-notification-detail] [data-action=type-off]").click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").textContent(), /Yeni takipçiler/);
  await page.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await until(() => state.calls.some((x) => x[0] === "pref"), "tür tercihi RPC'si");
  assert.deepEqual(state.calls.find((x) => x[0] === "pref"), ["pref", "follows", false]);
});

await scenario("14. Süzgeç menüsü sunucuda: Okunmamış · kategori · Ertelenenler; ertelenen kart Ertelenenler'de görünür", async ({ page, state }) => {
  state.rows.find((r) => r.id === "n8").snoozed_until = new Date(Date.now() + 3600e3).toISOString();
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-notification-row]").first().waitFor();
  assert.equal(await page.locator("[data-notification-row]").count(), 5, "ertelenen mesaj isteği yok");
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /^Ertelenenler/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-notification-row]").length === 1);
  assert.match(await page.locator("[data-notification-row]").first().textContent(), /mesaj isteği/i);
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /^Takip/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-notification-row]").length === 1 && /takip/i.test(document.querySelector("[data-notification-row]").textContent));
});

await scenario("15. Silme: kart hemen gider, Geri al geri getirir; süre dolunca sunucuda silinir", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|n6")}`);
  const detail = page.locator("[data-notification-detail]");
  await detail.waitFor();
  await detail.locator("[data-action=delete]").click();
  await page.locator('[data-notification-row="n|n6"]').waitFor({ state: "detached" });
  await page.locator("[data-action=undo]").click();
  await page.locator('[data-notification-row="n|n6"]').waitFor();
  assert.equal(state.calls.filter((x) => x[0] === "delete").length, 0, "geri alınca sunucuda silinmedi");
  await page.locator('[data-notification-row="n|n6"]').click();
  await page.locator("[data-notification-detail] [data-action=delete]").click();
  await page.waitForTimeout(5600);
  assert.ok(state.calls.some((x) => x[0] === "delete" && x[1] === "n|n6"), "5 sn sonra sunucuda silindi");
});

await scenario("16. Tümünü okundu yap: rozet 0, listedeki noktalar kalkar; 'Hepsini sil' onay ister", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-bell-badge]").waitFor();
  await page.locator("[data-action=mark-all-read]").first().click();
  await page.locator("[data-bell-badge]").waitFor({ state: "detached" });
  assert.ok(state.calls.some((x) => x[0] === "patch_notifications"));
  assert.equal(await page.locator('[data-notification-row][data-unread=true]').count(), 0);
  await page.locator("[data-action=clear-all]").click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
});

await scenario("17. Mobil (390): zil panel açmaz, doğrudan sayfaya gider; kartlar genişler; Ayrıntı tam sayfa; geri listeye döner", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  const link = page.locator('a[aria-label*="Bildirimler"]').first();
  await link.waitFor();
  assert.equal(await popover(page).count(), 0);
  await link.click();
  await page.waitForURL(/\/notifications\/?$/);
  assert.equal(await page.locator("[data-notification-page]").getAttribute("data-notification-page"), "list");
  const cards = page.locator("[data-notification-card]");
  await cards.first().waitFor();
  assert.equal(await cards.first().locator("[data-quick-actions]").count(), 1, "ilk kart açık");
  assert.equal(await cards.nth(1).locator("[data-quick-actions]").count(), 0, "diğerleri kapalı");
  await cards.nth(1).locator("button[aria-expanded]").click();
  await cards.nth(1).locator("[data-quick-actions]").waitFor();
  assert.equal(await cards.first().locator("[data-quick-actions]").count(), 0, "tek açık kart");
  await cards.first().locator("button[aria-expanded]").click();
  await shot(page, "3-mobile-list");
  await cards.first().locator("[data-action=detail]").click();
  await page.waitForURL(/\?n=/);
  const detail = page.locator("[data-notification-page=detail] [data-notification-detail]");
  await detail.waitFor();
  assert.ok(await detail.locator("textarea").count() >= 1, "alta sabit yanıt çubuğu");
  assert.ok(await overflowFree(page));
  await detail.locator("[data-action=back]").click();
  await page.waitForURL(/\/notifications\/?$/);
  assert.ok(state.calls.some((x) => x[0] === "mark_read"));
}, { viewport: { width: 390, height: 844 } });

await scenario("18. Mobil detay: açık emoji seçici + ipucu, yanıt kutusu içeriğin akışında (sabit değil) ve alt satırı örtmez, 'Bu tür bildirimleri kapat' onayı sayfanın ÜSTÜNDE açılır, taşma yok", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|n1")}`);
  const detail = page.locator("[data-notification-page=detail]");
  await detail.waitFor();
  await detail.locator('[data-inline-reaction-picker] [data-reaction="love"]').click();
  await detail.locator('[data-inline-reaction-picker] [data-reaction="love"][aria-current=true]').waitFor();
  assert.match(await detail.locator("[data-reaction-hint]").textContent(), /Sevdim tepkisi verdin/);
  await shot(page, "4-mobile-detail");
  // Yanıt kutusu ekrana sabit değil, kaydırılan içeriğin içinde.
  const position = await detail.locator("[data-reply-composer]").evaluate((el) => { let n = el; while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return p + ":" + (n.dataset.notificationPage ?? n.tagName); n = n.parentElement; } return "flow"; });
  assert.match(position, /^(flow|fixed:detail)$/, `yanıt kutusu sabit olmamalı (${position})`);
  await detail.locator("textarea").fill("Mobilden yanıt");
  await detail.locator("[data-action=reply-send]").click();
  await detail.locator("[data-reply-bubble]").waitFor();
  assert.equal(state.replies.length, 1);
  // Alt satır kaydırılınca erişilir ve hiçbir şey onu örtmez.
  const typeOff = detail.locator("[data-action=type-off]");
  await typeOff.evaluate((el) => el.scrollIntoView({ block: "center" })); // kaydırılabilen sayfanın dibinde "Geri al" şeridinin üstünde kalabilmeli
  await page.waitForTimeout(150);
  const covered = await typeOff.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !(t === el || el.contains(t)); });
  assert.equal(covered, false, "Bu tür bildirimleri kapat düğmesi örtülmemeli");
  await typeOff.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(600); // alt kart yukarı kayarak açılır: animasyon bitmeden vuruş denemesi anlamsız
  assert.match(await dialog.textContent(), /Yorumlar ve yanıtlar/);
  const confirm = dialog.getByRole("button", { name: "Kapat", exact: true });
  const hit = await confirm.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === el || el.contains(t); });
  assert.ok(hit, "onay penceresi tam sayfa ayrıntının arkasında kalmamalı (z-index)");
  await confirm.click();
  await until(() => state.calls.some((x) => x[0] === "pref"), "tür tercihi RPC'si");
  assert.deepEqual(state.calls.find((x) => x[0] === "pref"), ["pref", "comments", false]);
  await page.locator("[data-undo-bar]").waitFor();
  assert.match(await page.locator("[data-undo-bar]").textContent(), /Yorumlar ve yanıtlar/);
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 } });

await scenario("28. Yorum tepkileri sayılır: başkalarının tepkisi toplamda, özet ve 'Tepkiler' penceresi tam sayfa ayrıntının ÜSTÜNDE açılır", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|n1")}`);
  const detail = page.locator("[data-notification-page=detail]");
  await detail.waitFor();
  await detail.locator(`[data-reaction-summary="${C1}"]`).waitFor();
  assert.match(await detail.locator(`[data-reaction-summary="${C1}"]`).textContent(), /3 kişi tepki verdi/);
  await detail.locator(`[data-reaction-summary="${C1}"]`).click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  await page.waitForTimeout(600);
  assert.match(await sheet.textContent(), /Tepkiler/);
  const hit = await sheet.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + 40); return el.contains(t); });
  assert.ok(hit, "Tepkiler penceresi ayrıntının arkasında kalmamalı");
  assert.ok(state.calls.some((x) => x[0] === "comment_reaction_counts"), "sayılar toplu RPC'den");
}, {
  viewport: { width: 390, height: 844 },
  setup: (_db, state) => { state.comments[0].like_count = 3; state.others = [{ comment_id: C1, reaction: "fire", n: 2 }, { comment_id: C1, reaction: "love", n: 1 }]; },
});

await scenario("29. Ek önizlemesi: kartta kısa yazı + GIF + içerik eki (2 ek → iki önizleme); ayrıntıda yorumun tamamı; 1 ek → '1 ek var'", async ({ page }) => {
  await openPopover(page);
  const c = card(page, popover(page), "comment");
  assert.equal(await c.locator("[data-comment-extras-strip]").getAttribute("data-comment-extras-strip"), "2");
  assert.equal(await c.locator("[data-extras-label]").count(), 0, "2 ekte yalnız önizlemeler");
  await c.locator('[data-comment-media="gif"]').waitFor();
  await c.locator('[data-comment-attachment="prompt"]').waitFor();
  assert.match(await c.locator("[data-card-quote]").textContent(), /Işık kontrolü harika/);
  await c.locator("[data-action=detail]").click();
  await page.waitForURL(/\/notifications/);
  const detail = page.locator("[data-notification-detail]");
  await detail.waitFor();
  await detail.locator("[data-detail-body]").getByText(/İstanbul'da denedim, sonuç çok güzel çıktı/).waitFor();
  await detail.locator('[data-detail-body] [data-comment-media="gif"]').waitFor();
  await detail.locator('[data-detail-body] [data-comment-attachment="prompt"]').waitFor();
}, {
  setup: (_db, state) => { Object.assign(state.comments[0], { media_kind: "gif", media_ref: "abc12345", attach_type: "prompt", attach_id: P1 }); },
});

await scenario("29b. Tek ek: '1 ek var' etiketi + önizleme; yalnız ekli (yazısız) yorumda kart boş kalmaz", async ({ page }) => {
  await openPopover(page);
  const c = card(page, popover(page), "comment");
  assert.match(await c.locator("[data-extras-label]").textContent(), /1 ek var/);
  assert.equal(await c.locator("[data-card-quote]").count(), 0, "yazısı yok → boş alıntı kutusu çizilmez");
  await c.locator('[data-comment-attachment="prompt"]').waitFor();
}, {
  setup: (_db, state) => { Object.assign(state.comments[0], { body: "", attach_type: "prompt", attach_id: P1 }); },
});

await scenario("30. Kişi ⋮ menüsü (sohbet başlığı = profil menüsüyle aynı bileşen): 'Bu kişiyi sessize al' → 'Sesini aç'; durum bildirim merkeziyle ortak", async ({ page, state }) => {
  const open = async () => {
    await page.goto(`${BASE}/messages/local?id=${CONV}`);
    const menu = page.getByRole("button", { name: "Profil seçenekleri" });
    await menu.waitFor();
    await page.waitForTimeout(800); // menü düğmesi yüklenince yeniden çizilebilir; oturana kadar bekle
    await menu.click();
  };
  await open();
  const item = page.locator("[data-action=profile-mute]");
  await item.waitFor();
  assert.match(await item.textContent(), /Bu kişiyi sessize al/);
  await item.click();
  await until(() => state.calls.some((x) => x[0] === "mute" && x[1] === "actor" && x[3] === true), "sessize alma RPC'si");
  assert.deepEqual(state.calls.find((x) => x[0] === "mute"), ["mute", "actor", U.bob.id, true]);
  // Menü bu kez "Sesini aç" der (durum sunucudan ve yerel mağazadan biliniyor).
  await page.getByRole("button", { name: "Profil seçenekleri" }).click();
  const unmute = page.locator("[data-action=profile-unmute]");
  await unmute.waitFor();
  assert.match(await unmute.textContent(), /Sesini aç/);
  await unmute.click();
  await until(() => state.calls.some((x) => x[0] === "mute" && x[1] === "actor" && x[3] === false), "sesi açma RPC'si");
  // Sayfa yeniden yüklenince (mağaza sıfırlanır) sunucudaki durum yeniden okunur: sessize al → yenile → menü "Sesini aç" der.
  await page.getByRole("button", { name: "Profil seçenekleri" }).click();
  await page.locator("[data-action=profile-mute]").click();
  await until(() => state.mutes.length === 1, "sessize alındı");
  await open();
  await page.locator("[data-action=profile-unmute]").waitFor();
});

await scenario("19. İngilizce: panel cümleleri, gruplu başlık ve eylem etiketleri çevrilmiş", async ({ page }) => {
  await openPopover(page);
  await popover(page).locator("[data-action=like] button").waitFor(); // yorum bilgisi gelince tepki düğmesi çizilir
  const text = await popover(page).textContent();
  assert.match(text, /Amy, Carol and 1 more liked your prompt/);
  assert.match(text, /Quick like/);
  assert.match(text, /Follow back/);
  assert.match(text, /See all notifications/);
  assert.match(text, /Your prompt was copied 100 times/);
  assert.ok(!/Hızlı beğen|Tüm bildirimleri/.test(text), "Türkçe sızıntı yok");
}, { lang: "en" });

await scenario("20. Koyu tema + klavye: J/K kartlar arasında gezinir, E okundu, Esc kapatır", async ({ page, state }) => {
  await openPopover(page);
  const cards = popover(page).locator("[data-notification-card]");
  await cards.first().focus();
  await page.keyboard.press("j");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("data-notification-card"));
  assert.notEqual(second, await cards.first().getAttribute("data-notification-card"));
  await page.keyboard.press("e");
  await page.waitForTimeout(150);
  assert.ok(state.calls.some((x) => x[0] === "mark_read"));
  await page.keyboard.press("k");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-notification-card")), await cards.first().getAttribute("data-notification-card"));
  await page.keyboard.press("Escape");
  await popover(page).waitFor({ state: "detached" });
}, { theme: "dark" });

await scenario("21. Ayarlar → Bildirimler: tür anahtarları, sessize alınanlar (kaldır), ertelenenler; ana listede satır", async ({ page, state }) => {
  state.prefs = ["quotes"];
  state.mutes = [{ kind: "actor", target: U.carol.id, label: "Carol", created_at: new Date().toISOString() }, { kind: "content", target: `/prompts/local?id=${P1}`, label: "Gece Şehri", created_at: new Date().toISOString() }];
  await page.goto(`${BASE}/settings`);
  await page.locator('a[href*="/settings/notifications"]').click();
  await page.waitForURL(/\/settings\/notifications/);
  const switches = page.locator("[data-notification-pref-list] [role=switch]");
  await switches.first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-pref=quotes]')?.getAttribute("aria-checked") === "false");
  assert.equal(await switches.count(), 11);
  assert.equal(await page.locator('[data-pref=quotes]').getAttribute("aria-checked"), "false");
  assert.equal(await page.locator('[data-pref=comments]').getAttribute("aria-checked"), "true");
  await page.locator("[data-pref=comments]").click();
  await page.locator('[data-pref=comments][aria-checked=false]').waitFor();
  assert.deepEqual(state.calls.find((x) => x[0] === "pref"), ["pref", "comments", false]);
  await page.locator("[data-pref=quotes]").click();
  await page.locator('[data-pref=quotes][aria-checked=true]').waitFor();
  assert.equal(await page.locator("[data-mute-list] li").count(), 2);
  await page.locator("[data-mute-list] li").first().getByRole("button").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-mute-list] li").length === 1);
  assert.ok(state.calls.some((x) => x[0] === "mute" && x[3] === false));
});

await scenario("22. Boş durum ve yükleme hatası: bildirim yokken boş metin; RPC hata verirse 'Tekrar dene'", async ({ page, db }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-notification-empty]").waitFor();
  db.rpc.notifications_grouped_page = () => ({ status: 500, body: { message: "boom" } });
  await page.reload();
  await page.getByRole("button", { name: "Tekrar dene" }).waitFor();
}, { rows: [] });


const C1c = "e0000000-0000-4000-8000-0000000000a1";
async function pickView(page, label) {
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: new RegExp(`^${label}`) }).click();
}
const rowCount = (page) => page.locator("[data-notification-row]").count();

await scenario("23. 'Topluluklar' kategorisi topluluk sayfası/sohbeti/gönderisi bildirimlerini toplar; Sistem ve Gönderiler'den çıkarlar (sunucu süzgeci)", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-notification-row]").first().waitFor();
  assert.equal(await rowCount(page), 7, "hepsi ayrı kart");
  await pickView(page, "Topluluklar");
  await page.waitForFunction(() => document.querySelectorAll("[data-notification-row]").length === 4);
  const texts = await page.locator("[data-notification-row]").allTextContents();
  assert.ok(texts.some((x) => /Topluluğa davet edildin/.test(x)) && texts.some((x) => /Eski grup daveti/.test(x)) && texts.some((x) => /katılma isteği/.test(x)));
  await pickView(page, "Sistem");
  await page.waitForFunction(() => document.querySelectorAll("[data-notification-row]").length === 1);
  assert.match(await page.locator("[data-notification-row]").first().textContent(), /Site bakımı/);
  await pickView(page, "Gönderiler");
  await page.waitForFunction(() => document.querySelectorAll("[data-notification-row]").length === 1);
}, {
  rows: [
    row("c1", "system", null, "Topluluğa davet edildin.", `/communities/local?id=${C1c}&tab=feed`, 1),
    row("c2", "like", U.bob, "Topluluk gönderini beğendi.", `/communities/local?id=${C1c}&tab=feed&post=p1&hl=post:p1`, 2),
    row("c3", "system", null, "Topluluğa katılma isteği var.", `/messages/local?id=${C1c}&panel=requests`, 3),
    row("c4", "system", null, "Eski grup daveti.", "/groups?tab=invites", 4),
    row("c5", "like", U.carol, "Promptunu beğendi.", "/prompts/local?id=x1&hl=post:x1", 5),
    row("c6", "message", U.dave, "Sana bir mesaj gönderdi.", "/messages/local?id=dm1&hl=message:m1", 6),
    row("c7", "system", null, "Site bakımı yapılacak.", "/settings", 7),
  ],
});

await scenario("23b. Kategori menüsü İngilizce: 'Communities' ve 'Snoozed' öğeleri", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-section-menu]").click();
  const names = (await page.getByRole("radio").allTextContents()).map((x) => x.replace(/\d+$/, "").trim());
  assert.ok(names.includes("Communities") && names.includes("Snoozed") && names.includes("Unread") && names.includes("All"), names.join("|"));
}, { lang: "en" });

await scenario("24. Haftalık özet İngilizce'de sayılar korunarak çevrilir; Ayrıntı 'Sayfayı aç' ile /insights'a gider; Türkçe aynen", async ({ page }) => {
  await openPopover(page);
  assert.match(await popover(page).textContent(), /Weekly recap: 12 copies, 3 reactions, 2 new followers\./);
  assert.ok(!/Haftalık özet/.test(await popover(page).textContent()));
  await page.goto(`${BASE}/notifications?n=${encodeURIComponent("n|w1")}`);
  const link = page.locator("[data-notification-detail] [data-action=open-target]");
  await link.waitFor();
  assert.match((await link.getAttribute("href")) ?? "", /\/insights/);
}, { lang: "en", rows: [row("w1", "system", null, "Haftalık özet: 12 kopyalama, 3 tepki, 2 yeni takipçi.", "/insights", 1)] });

await scenario("24b. Haftalık özet Türkçe saklandığı gibi görünür", async ({ page }) => {
  await openPopover(page);
  assert.match(await popover(page).textContent(), /Haftalık özet: 5 kopyalama\./);
}, { rows: [row("w2", "system", null, "Haftalık özet: 5 kopyalama.", "/insights", 1)] });

await scenario("25. Tek beğeni kartı verilen tepkiyi rozet olarak gösterir; tepkisiz (eski) beğeni rozetli simgeyi korur", async ({ page }) => {
  await openPopover(page);
  const badge = popover(page).locator('[data-card-avatar=person] [title="Ateş"]');
  await badge.waitFor();
  assert.equal(await popover(page).locator('[data-card-avatar=person] [title="Ateş"]').count(), 1);
  assert.equal(await popover(page).locator("[data-notification-card]").count(), 2);
}, {
  rows: [
    row("r1", "like", U.bob, 'Paylaşımını beğendi: "Neon"', "/prompts/local?id=p1&hl=post:p1", 1, { reaction: "fire" }),
    row("r2", "like", U.carol, 'Paylaşımını beğendi: "Eski"', "/prompts/local?id=p2&hl=post:p2", 2),
  ],
});

await scenario("26. Sayfa sayfa: ilk 30 kart gelir, aşağı inince kendiliğinden sonrakiler eklenir (keyset, tekrar yok); rozet kart sayısı (veritabanından)", async ({ page, db }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-notification-row]").first().waitFor();
  assert.equal(await rowCount(page), 30, "yalnız ilk sayfa çizildi");
  assert.equal((await page.locator("[data-bell-badge]").textContent()).trim(), "74", "okunmamış kart sayısı yüklenen listeden değil sunucudan (75 - açılışta seçili ilk kart okundu)");
  for (let i = 0; i < 30 && (await rowCount(page)) < 75; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
  }
  assert.equal(await rowCount(page), 75);
  const keys = await page.locator("[data-notification-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-notification-row")));
  assert.equal(new Set(keys).size, 75, "hiç tekrar yok");
  const pages = db.calls.filter((c) => c.table === "rpc/notifications_grouped_page");
  assert.equal(pages[0].body.p_before_at, null);
  assert.ok(pages.slice(1).every((c) => c.body.p_before_at && c.body.p_before_key), "sonraki sayfalar keyset imleciyle");
}, { rows: Array.from({ length: 75 }, (_, i) => row(`p${i}`, "comment", U.dave, `Paylaşımına yorum yaptı: "yorum ${i}"`, `/prompts/local?id=${P1}&hl=comment:c${i}`, i + 1)) });

await scenario("27. Hepsini sil: onay penceresi, Vazgeç'te hiçbir şey silinmez, onayda DELETE gider ve liste boşalır; pencere İngilizce", async ({ page, state }) => {
  await page.goto(`${BASE}/notifications`);
  await page.locator("[data-notification-row]").first().waitFor();
  await page.locator("[data-action=clear-all]").click();
  await page.getByRole("dialog").getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(state.calls.filter((x) => x[0] === "delete_all").length, 0);
  await page.locator("[data-action=clear-all]").click();
  await page.getByRole("dialog").getByRole("button", { name: "Tümünü sil" }).click();
  await page.locator("[data-notification-empty]").waitFor();
  assert.equal(state.calls.filter((x) => x[0] === "delete_all").length, 1);
});

await scenario("27b. Hepsini sil penceresi İngilizce", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.getByRole("button", { name: "Delete all notifications" }).click();
  await page.getByRole("dialog").getByText("Delete all notifications?").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Delete all" }).waitFor();
}, { lang: "en" });

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
