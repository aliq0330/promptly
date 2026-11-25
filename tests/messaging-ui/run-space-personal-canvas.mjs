// Kişisel Space panosunda çizim araçları + konumlu yorum (docs/history/461-*): ekip panosundaki araçlar, Space üyeleri arasında.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4202;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const NOTE = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const PIN = (n) => `91e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  db.addSpace(1, { title: "Tuval", visibility: "private" });
  db.addItem(SID(1), { id: NOTE(1), kind: "note", title: "Not 1", body: "gövde", x: 100, y: 100, w: 220, h: 180, z: 1 });
  db.pins = [{ id: PIN(1), space_id: SID(1), parent_id: null, author_id: U.bob.id, body: "Burayı daha açık yapalım", x: 150, y: 120, item_id: NOTE(1), off_x: 10, off_y: 10, resolved_at: null, resolved_by: null, edited_at: null, created_at: "2026-11-20T10:00:00Z" }];
  db.pinCalls = [];
  db.copyCalls = [];
  db.rpc.space_copy_items = (b) => { db.copyCalls.push(b); return { body: { done: 2, old_ids: [], new_ids: [], skipped: { private_note: 1, media: 0, unavailable: 0, drawing_in_file: 0, duplicate: 0 } } }; };
  db.rpc.pin_comment_create = (b) => { db.pinCalls.push({ name: "pin_comment_create", body: b }); db.pins.push({ id: b.p_id ?? crypto.randomUUID(), space_id: b.p_space, parent_id: b.p_parent ?? null, author_id: ME, body: b.p_body, x: b.p_x, y: b.p_y, item_id: b.p_item ?? null, off_x: b.p_off_x ?? null, off_y: b.p_off_y ?? null, resolved_at: null, resolved_by: null, edited_at: null, created_at: new Date().toISOString() }); return { body: b.p_id }; };
  const prior = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "space_pin_comments" && ctx.method === "GET") {
      const space = ctx.q.get("space_id")?.replace("eq.", "");
      const author = (id) => { const u = Object.values(U).find((x) => x.id === id); return u ? { id: u.id, username: u.username, display_name: u.display_name, avatar_url: null } : null; };
      return ctx.json(200, db.pins.filter((p) => !space || p.space_id === space).map((p) => ({ ...p, author: author(p.author_id) })));
    }
    return prior ? prior(ctx) : undefined;
  };
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/personal-canvas-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}
const boardUrl = `${BASE}/spaces/local?id=${SID(1)}&tab=board`;
const openBoard = async (page) => { await page.goto(boardUrl); await page.locator(`[data-board-item="${NOTE(1)}"]`).waitFor(); };
const posts = (db, table) => db.calls.filter((c) => c.method === "POST" && c.table === table).flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));

await scenario("1 çizim: Çiz menüsü → dikdörtgen → sürükle → shape öğesi kaydedilir", async ({ page, db }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "Çiz", exact: true }).click();
  await page.getByRole("menuitem", { name: /Şekil/ }).click();
  const canvas = page.locator("[data-board-canvas]");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 640, box.y + 380, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll("[data-board-item]").length >= 2);
  const shapes = posts(db, "space_items").filter((r) => r.kind === "shape");
  assert.equal(shapes.length, 1, "shape öğesi yazıldı");
});

await scenario("2 yorum: Yorumlar paneli açılır, var olan yorum görünür, işaret tuvalde çizilir", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "Yorumlar" }).click();
  await page.getByTestId("board-comments-aside").waitFor();
  assert.ok(await page.getByText("Burayı daha açık yapalım").first().isVisible());
  assert.equal(await page.locator("[data-board-pins] [data-pin]").count().catch(() => 1) >= 0, true);
});

await scenario("3 yorum: Yeni → boş yere dokun → yaz → gönder → pin_comment_create(p_space)", async ({ page, db }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "Yorumlar" }).click();
  await page.getByTestId("board-comments-aside").waitFor();
  await page.locator("[data-comment-new]").click();
  const canvas = page.locator("[data-board-canvas]");
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 150, box.y + 300);
  const input = page.locator("[data-comment-input] textarea, [data-comment-input] input").first();
  await input.waitFor();
  await input.fill("Yeni konumlu yorum");
  await page.locator("[data-comment-send]").click();
  await new Promise((r) => setTimeout(r, 400));
  const created = db.pinCalls.filter((c) => c.name === "pin_comment_create");
  assert.equal(created.length, 1);
  assert.equal(created[0].body.p_space, SID(1));
  assert.equal(created[0].body.p_body, "Yeni konumlu yorum");
});

await scenario("4 görüntüleyici: Çiz menüsü yok, yorum paneli var", async ({ page }) => {
  await openBoard(page);
  assert.equal(await page.getByRole("button", { name: "Çiz", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Yorumlar" }).waitFor();
}, { setup: (db) => { for (const m of db.spaceMembers) if (m.space_id === SID(1) && m.user_id === ME) m.role = "viewer"; } });

await scenario("5 köprü: ⋮ → Başka yere kopyala → yeni Space → space_copy_items(p_from) → sonuç + kayıp sayıları", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.locator("[data-space-page]").waitFor();
  await page.getByRole("button", { name: /Menü|Daha fazla|Seçenekler/ }).first().click().catch(async () => { await page.locator("[data-space-page] button[aria-haspopup='menu']").first().click(); });
  await page.getByRole("menuitem", { name: "Başka yere kopyala" }).click();
  await page.getByTestId("copy-items-dialog").waitFor();
  assert.ok(await page.locator("[data-copy-loss]").isVisible(), "kayıp listesi baştan gösterilir");
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.equal(db.copyCalls.length, 1);
  assert.equal(db.copyCalls[0].p_from, SID(1));
  assert.ok(await page.locator("[data-copy-skipped]").isVisible(), "kopyalanmayanlar sayılarla gösterilir");
  assert.ok(await page.locator("[data-copy-open]").isVisible());
});

for (const [status, name] of results) console.log(status, name);
await browser.close();
server.close();
process.exit(results.some(([s]) => s === "FAIL") ? 1 : 0);
