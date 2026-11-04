// Yorum tepkileri (docs/history/327-*), ağ taklitli arayüz testi: prompt sayfasındaki yorum dizisi GÖNDERİDEKİ tepki sistemini kullanır — kalbe dokununca altı hareketli
// emojili seçici açılır, seçilen emoji kalbin yerine geçer, sayı toplamdır, en çok verilen emojiler küçük yığın olarak görünür ve "Tepkiler" penceresini açar.
// Gerçek Supabase'e / gerçek cihaza KARŞI DENENMEDİ; sayıların SQL doğrulaması supabase/tests/comment-reaction-counts.sql'dedir.
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   CHROMIUM_PATH=… node tests/messaging-ui/run-comment-reactions.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { ID, PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const PORT = 4208;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*" }, contentType: "application/json", body: JSON.stringify(body) });
const pub = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: null, website: null, follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [] });
const eqv = (v) => (v?.startsWith("eq.") ? v.slice(3) : null);

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  seedComments(db, "prompt");
  // state.others: başkalarının tepkileri (yorum kimliği → { tepki: sayı }); state.mine: benim tepkilerim (yorum kimliği → tepki)
  const state = { others: {}, mine: new Map(), calls: [], counts: {}, sheetQueries: 0 };
  setup?.(db, state);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  const totalOf = (id) => Object.values(state.others[id] ?? {}).reduce((a, b) => a + b, 0) + (state.mine.has(id) ? 1 : 0);
  await context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const q = url.searchParams;
    const table = url.pathname.split("/").pop();
    const method = req.method();
    const body = method === "POST" || method === "PATCH" ? JSON.parse(req.postData() || "{}") : null;
    if (table === "prompt_comments" && method === "GET" && q.get("parent_id") === "is.null") {
      const list = db.comments.filter((c) => c.prompt_id === ID.prompt && !c.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return json(route, list.map((c) => ({ id: c.id, body: c.body, parent_id: null, like_count: totalOf(c.id), created_at: c.created_at, edited_at: null, deleted_at: null, rating: null, media_kind: null, media_ref: null, media_width: null, media_height: null, attach_type: null, attach_id: null, profiles: pub(Object.values(U).find((u) => u.id === c.author_id)) })));
    }
    if (table === "comment_likes") {
      if (method === "GET" && q.get("comment_id")?.startsWith("in.(")) {
        const ids = q.get("comment_id").slice(4, -1).split(",").map((s) => s.replace(/"/g, ""));
        return json(route, ids.filter((id) => state.mine.has(id)).map((id) => ({ comment_id: id, reaction: state.mine.get(id) })));
      }
      if (method === "GET") { state.sheetQueries += 1; return json(route, []); }
      if (method === "POST") { state.mine.set(body.comment_id, body.reaction ?? "love"); state.calls.push(["like", body.comment_id, body.reaction ?? "love"]); return json(route, {}, 201); }
      if (method === "PATCH") { const id = eqv(q.get("comment_id")); state.mine.set(id, body.reaction); state.calls.push(["change", id, body.reaction]); return json(route, { comment_id: id }); }
      if (method === "DELETE") { const id = eqv(q.get("comment_id")); state.mine.delete(id); state.calls.push(["unlike", id]); return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); }
    }
    if (table === "comment_reaction_counts") {
      const rows = [];
      for (const id of body.p_ids ?? []) {
        const merged = { ...(state.others[id] ?? {}) };
        if (state.mine.has(id)) merged[state.mine.get(id)] = (merged[state.mine.get(id)] ?? 0) + 1;
        for (const [reaction, n] of Object.entries(merged)) rows.push({ target_id: id, reaction, n });
      }
      state.calls.push(["counts", (body.p_ids ?? []).length]);
      return json(route, rows);
    }
    if (table === "comment_reaction_friends") return json(route, []);
    return route.fallback();
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.locator("#comments").waitFor();
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/crfail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const section = (page) => page.locator("#comments");
const nodeOf = (page, i) => section(page).locator("[data-comment-reactions]").nth(i);
const picker = (page) => page.locator("[data-reaction-picker]");
const firstId = (db) => db.comments.filter((c) => c.prompt_id === ID.prompt).sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id;

await scenario("1. Her yorumun tepki düğmesi gönderidekiyle aynı: dokununca altı emojili seçici açılır; seçilen emoji kalbin yerine geçer ve POST reaction taşır", async ({ page, db, state }) => {
  await nodeOf(page, 0).waitFor();
  assert.equal(await section(page).locator("[data-comment-reactions]").count(), 3, "ilk üç yorum görünür");
  await nodeOf(page, 0).locator("button").first().click();
  await picker(page).waitFor();
  if (process.env.SHOT_DIR) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOT_DIR}/comment-picker.png` }); }
  assert.equal(await picker(page).locator("[data-reaction]").count(), 6);
  await picker(page).locator('[data-reaction="fire"]').click();
  await picker(page).waitFor({ state: "detached" });
  const id = firstId(db);
  await until(() => state.calls.some((c) => c[0] === "like"), "tepki isteği");
  assert.deepEqual(state.calls.find((c) => c[0] === "like"), ["like", id, "fire"]);
  // Kalp yerine seçilen emoji (poster) ve toplam sayı 1.
  await nodeOf(page, 0).locator('img[src*="fire"]').first().waitFor();
  assert.match(await nodeOf(page, 0).locator("button").first().textContent(), /1/);
  // Değiştir ve geri al.
  await nodeOf(page, 0).locator("button").first().click();
  await picker(page).locator('[data-reaction="wow"]').click();
  await until(() => state.calls.some((c) => c[0] === "change"), "tepki değiştirme");
  assert.deepEqual(state.calls.find((c) => c[0] === "change"), ["change", id, "wow"]);
  await nodeOf(page, 0).locator("button").first().click();
  await picker(page).locator('[data-reaction="wow"]').click();
  await until(() => state.calls.some((c) => c[0] === "unlike"), "tepki geri alma");
});

await scenario("2. Tepkiler SAYILIR: başkalarının tepkileri toplamda, en çok verilen emojiler yığında; yığın 'Tepkiler' penceresini açar", async ({ page, state }) => {
  await nodeOf(page, 0).waitFor();
  const first = nodeOf(page, 0);
  assert.match(await first.locator("button").first().textContent(), /5/, "toplam 3 sevdim + 2 ateş");
  await first.locator("[data-comment-reaction-stack]").waitFor();
  if (process.env.SHOT_DIR) { await first.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/comment-thread.png` }); }
  assert.equal(await first.locator("[data-comment-reaction-stack] img").count(), 2, "iki farklı tepki → iki emoji");
  assert.equal(await nodeOf(page, 1).locator("[data-comment-reaction-stack]").count(), 0, "tepkisiz yorumda yığın yok");
  assert.ok(state.calls.filter((c) => c[0] === "counts").length >= 1);
  assert.equal(state.calls.filter((c) => c[0] === "counts").reduce((n, c) => n + c[1], 0) >= 1, true);
  await first.locator("[data-comment-reaction-stack]").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Tepkiler/);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
}, {
  setup: (db, state) => {
    const id = db.comments.filter((c) => c.prompt_id === ID.prompt).sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id;
    state.others[id] = { love: 3, fire: 2 };
  },
});

await scenario("3. Oturum açan kişinin kendi tepkisi sayfa açılınca görünür (seçili emoji) ve aynı yorumda toplam ona göre", async ({ page, db }) => {
  await nodeOf(page, 0).waitFor();
  await nodeOf(page, 0).locator('img[src*="clap"]').first().waitFor();
  assert.match(await nodeOf(page, 0).locator("button").first().textContent(), /1/);
  void db;
}, { setup: (db, state) => { state.mine.set(db.comments.filter((c) => c.prompt_id === ID.prompt).sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id, "clap"); } });

await scenario("4. Mobil (390): seçici ekrana sığar, yorum satırında taşma yok; İngilizce etiketler", async ({ page }) => {
  await nodeOf(page, 0).waitFor();
  await nodeOf(page, 0).locator("button").first().click();
  await picker(page).waitFor();
  const box = await picker(page).boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 + 1, `seçici ekrana sığmalı (${JSON.stringify(box)})`);
  assert.match(await picker(page).textContent(), /Love/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "yatay taşma yok");
}, { viewport: { width: 390, height: 800 }, lang: "en" });

async function until(fn, message = "koşul gerçekleşmedi", ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  assert.ok(fn(), message);
}

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.filter(([s]) => s === "PASS").length}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(results.every(([s]) => s === "PASS") ? 0 : 1);
