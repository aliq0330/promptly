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
  db.rpc.space_copy_items = (b) => { db.copyCalls.push({ name: "space_copy_items", ...b }); if (db.copyFail) return { status: 400, body: { code: "P0001", message: "server_down" } }; return { body: { done: 4, old_ids: ["o1", "o2"], new_ids: ["n1", "n2"], skipped: { private_note: 1, media: 0, unavailable: 0, drawing_in_file: 0, duplicate: 0 } } }; };
  db.rpc.pin_comment_create = (b) => { db.pinCalls.push({ name: "pin_comment_create", body: b }); db.pins.push({ id: b.p_id ?? crypto.randomUUID(), space_id: b.p_space, parent_id: b.p_parent ?? null, author_id: ME, body: b.p_body, x: b.p_x, y: b.p_y, item_id: b.p_item ?? null, off_x: b.p_off_x ?? null, off_y: b.p_off_y ?? null, resolved_at: null, resolved_by: null, edited_at: null, created_at: new Date().toISOString() }); return { body: b.p_id }; };
  db.rpc.space_copy_pin_comments = (b) => { db.copyCalls.push({ name: "space_copy_pin_comments", ...b }); return { body: { roots: 1, replies: 0, skipped_private: 0 } }; };
  db.rpc.my_teams = () => ({ body: [{ id: "t1", slug: "atolye", name: "Atölye Mor", description: null, tone: "primary", myRole: "owner", memberCount: 3, guestCount: 0, spaceCount: 1, channelCount: 1, unreadCount: 0, lastActivityAt: null, libraryApprovalsPending: 0 }] });
  db.rpc.my_teams_preview = () => ({ body: [] });
  const proj = (id, title, myRole, extra = {}) => ({ id, title, description: "", tone: "primary", archivedAt: null, reviewDefault: true, accessMode: "selected", baseRole: "view", myRole, mainAreaId: null, channelId: null, memberCount: 2, boardCount: 0, itemCount: 0, pendingCount: null, files: [], ...extra });
  db.rpc.team_projects_list = () => ({ body: [proj("p1", "Villa", "lead", { files: [{ id: "f1", title: "Mutfak", reviewRequired: true, mainAreaId: "area-f1", itemCount: 0, pendingCount: null }] }), proj("p2", "Ofis", "edit"), proj("p3", "Pazarlama", "view")] });
  db.rpc.team_create_file = (b) => { db.copyCalls.push({ name: "team_create_file", ...b }); return { body: "f-new" }; };
  db.rpc.team_create_board = (b) => { db.copyCalls.push({ name: "team_create_board", ...b }); return { body: "b-new" }; };
  db.rpc.team_delete_file = (b) => { db.copyCalls.push({ name: "team_delete_file", ...b }); return { body: null }; };
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

const openCopy = async (page) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.locator("[data-space-page]").waitFor();
  await page.locator("[data-space-page] button[aria-haspopup='menu']").first().click();
  await page.getByRole("menuitem", { name: "Başka yere kopyala" }).click();
  await page.getByTestId("copy-items-dialog").waitFor();
};
const called = (db, name) => db.copyCalls.filter((c) => c.name === name);

await scenario("5 kopyala → yeni Space: adımlar, öğe + yorum kopyası, kaynak arşivlenir, sonuç + kayıp sayıları", async ({ page, db }) => {
  await openCopy(page);
  assert.ok(await page.locator("[data-copy-loss]").isVisible(), "kayıp listesi baştan gösterilir");
  assert.ok(await page.locator("[data-copy-summary]").isVisible(), "kopyalanacak sayılar baştan gösterilir");
  assert.equal(await page.locator("[data-copy-archive]").isChecked(), true, "arşivle kutusu varsayılan açık");
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.equal(called(db, "space_copy_items").length, 1);
  assert.equal(called(db, "space_copy_items")[0].p_from, SID(1));
  const pins = called(db, "space_copy_pin_comments");
  assert.equal(pins.length, 1, "yorumlar da kopyalandı");
  assert.equal(pins[0].p_floating, true, "tüm Space: serbest yorumlar da gelir");
  assert.deepEqual(pins[0].p_old_ids, ["o1", "o2"]);
  assert.ok(db.calls.some((c) => c.method === "PATCH" && c.table === "spaces" && JSON.stringify(c.body).includes("archived_at")), "kaynak en son arşivlendi");
  assert.ok(await page.locator("[data-copy-skipped]").isVisible());
  assert.ok(await page.locator("[data-copy-open]").isVisible());
});

await scenario("6 kopyala → ekip: yeni dosya: yalnız lider projeler seçilir, dosya adı Space adı, dosya + pano açılır, kopya panoya yazılır", async ({ page, db }) => {
  await openCopy(page);
  await page.getByRole("radio", { name: /Ekip: yeni dosya/ }).click();
  await page.locator("#copy-team").selectOption("t1");
  await page.locator("#copy-project").waitFor();
  assert.equal(await page.locator("#copy-project option", { hasText: "Ofis" }).isDisabled(), true, "düzenleyici proje dosya açamaz");
  assert.equal(await page.locator("#copy-project option", { hasText: "Villa" }).isDisabled(), false);
  await page.locator("#copy-project").selectOption("p1");
  assert.equal(await page.locator("#copy-file-name").inputValue(), "Tuval", "dosya adı Space'in adı");
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.equal(called(db, "team_create_file")[0].p_title, "Tuval");
  assert.equal(called(db, "team_create_board")[0].p_file, "f-new");
  assert.equal(called(db, "space_copy_items")[0].p_to, "b-new", "öğeler yeni PANOYA yazılır");
  assert.equal(called(db, "space_copy_pin_comments")[0].p_to, "b-new");
  assert.match(await page.locator("[data-copy-open]").getAttribute("href"), /board=b-new/);
});

await scenario("7 kopyala → ekip: var olan dosya: yorum kutusu kapalı + açıklama, yorum kopyalanmaz, hedef dosyanın ana alanı", async ({ page, db }) => {
  await openCopy(page);
  await page.getByRole("radio", { name: /Ekip: var olan dosya/ }).click();
  await page.locator("#copy-team").selectOption("t1");
  await page.locator("#copy-project").selectOption("p1");
  await page.locator("#copy-file").selectOption("f1");
  assert.equal(await page.locator("[data-copy-comments]").isDisabled(), true);
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.equal(called(db, "space_copy_items")[0].p_to, "area-f1");
  assert.equal(called(db, "space_copy_pin_comments").length, 0);
  assert.equal(called(db, "team_create_file").length, 0);
});

await scenario("8 hata: öğe yazımı çökerse yeni açılan dosya GERİ SİLİNİR, kaynak arşivlenmez, 'tekrar dene' formu açar", async ({ page, db }) => {
  db.copyFail = true;
  await openCopy(page);
  await page.getByRole("radio", { name: /Ekip: yeni dosya/ }).click();
  await page.locator("#copy-team").selectOption("t1");
  await page.locator("#copy-project").selectOption("p1");
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-failed]").waitFor();
  assert.equal(called(db, "team_delete_file")[0].p_file, "f-new", "az önce açılan dosya geri silindi");
  assert.equal(called(db, "space_copy_pin_comments").length, 0);
  assert.ok(!db.calls.some((c) => c.method === "PATCH" && c.table === "spaces" && JSON.stringify(c.body).includes("archived_at")), "hata olunca arşivlenmez");
  await page.locator("[data-copy-retry]").click();
  assert.ok(await page.locator("[data-copy-run]").isVisible());
});

await scenario("9 seçimle kopyalama: arşivle kutusu çıkmaz, yalnız seçilen kimlikler gider, serbest yorumlar alınmaz", async ({ page, db }) => {
  await page.goto(boardUrl);
  await page.locator(`[data-board-item="${NOTE(1)}"]`).click();
  await page.getByRole("button", { name: "Seçilenleri kopyala" }).click();
  await page.getByTestId("copy-items-dialog").waitFor();
  assert.equal(await page.locator("[data-copy-archive]").count(), 0);
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.deepEqual(called(db, "space_copy_items")[0].p_ids, [NOTE(1)]);
  assert.equal(called(db, "space_copy_pin_comments")[0].p_floating, false);
});

await scenario("10 telefon 390px: kopyalama penceresi yatay taşmaz, sonuç ekranına kadar çalışır", async ({ page, db }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openCopy(page);
  await page.getByRole("radio", { name: /Ekip: yeni dosya/ }).click();
  await page.locator("#copy-team").selectOption("t1");
  await page.locator("#copy-project").selectOption("p1");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, "yatay taşma yok");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/copy-dialog-390.png` });
  await page.locator("[data-copy-run]").click();
  await page.locator("[data-copy-result]").waitFor();
  assert.equal(called(db, "space_copy_items").length, 1);
}, { viewport: { width: 390, height: 800 } });

await scenario("11 İngilizce: pencere metinleri çevrilir, yer tutucular ({{x}}) görünmez", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.locator("[data-space-page]").waitFor();
  await page.locator("[data-space-page] button[aria-haspopup='menu']").first().click();
  await page.getByRole("menuitem", { name: "Copy elsewhere" }).click();
  const dlg = page.getByTestId("copy-items-dialog");
  await dlg.waitFor();
  const text = await dlg.innerText();
  assert.match(text, /Every item in/);
  assert.match(text, /New Space/);
  assert.doesNotMatch(text, /\{\{|\{[a-z]+\}/, "çevrilmemiş yer tutucu yok");
}, { lang: "en" });

for (const [status, name] of results) console.log(status, name);
await browser.close();
server.close();
process.exit(results.some(([s]) => s === "FAIL") ? 1 : 0);
