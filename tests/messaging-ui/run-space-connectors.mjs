// Space panosu okları (docs/history/262-*): çizim (öğe taşınınca ok takip eder), Ok çiz aracı (iki nesneye dokun / klavye C / seçimi
// bağla), seçili ok çubuğu (etiket, çizgi, ok başı, yol, renk, yönü çevir, sil), geri al / yinele, öğe silinince oklar, izleyici,
// yinelenen çift, sınır hatası, İngilizce, telefonda taşma yok. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (kural: space-connections.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const NOTE = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, lang = "tr", guest = false, touch = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await installMock(context, db, { guest });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/connectors-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const calls = (db, method, table) => db.calls.filter((c) => c.method === method && c.table === table);
const rowsOf = (call) => (Array.isArray(call.body) ? call.body : [call.body]);
const waitFor = async (check, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const boardUrl = `${BASE}/spaces/local?id=${SID(1)}&tab=board`;
function board3(db, over = {}) {
  db.addSpace(1, { title: "Pano", visibility: "private", ...over });
  for (let n = 1; n <= 3; n += 1) db.addItem(SID(1), { id: NOTE(n), kind: "note", title: `Not ${n}`, body: `gövde ${n}`, x: (n - 1) * 400, y: 0, w: 220, h: 180, z: n });
}
const item = (page, n) => page.locator(`[data-board-item="${NOTE(n)}"]`);
const connectors = (page) => page.locator("[data-connector]");
const openBoard = async (page) => { await page.goto(boardUrl); await item(page, 1).waitFor(); };
const bar = (page) => page.locator("[data-board-connection-bar]");
const toolBtn = (page) => page.getByRole("button", { name: /Ok çiz \(C\)|Draw arrow \(C\)/ });

await scenario("1 çizim: var olan ok yolu, ok başları ve etiketiyle çizilir", async ({ page }) => {
  await openBoard(page);
  assert.equal(await connectors(page).count(), 1);
  assert.equal(await connectors(page).first().locator("polygon").count(), 2, "iki uçta ok");
  assert.ok((await page.locator("[data-connector-label]").innerText()).includes("sonra"));
  assert.ok((await connectors(page).first().locator("path").first().getAttribute("d")).startsWith("M"));
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra", arrow: "both" }); } });

await scenario("2 araç: Ok çiz → iki nesneye dokun → bağlantı kurulur, ok seçili çubukla açılır", async ({ page, db }) => {
  await openBoard(page);
  await toolBtn(page).click();
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("Okun başlayacağı"));
  await item(page, 1).click();
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("okun varacağı"), "ikinci nesneyi bekler");
  await item(page, 2).click();
  await connectors(page).first().waitFor();
  const posts = calls(db, "POST", "space_connections");
  assert.equal(posts.length, 1);
  const row = rowsOf(posts[0])[0];
  assert.equal(row.from_item_id, NOTE(1));
  assert.equal(row.to_item_id, NOTE(2));
  assert.equal(row.arrow, "end");
  assert.equal(row.space_id, SID(1));
  await bar(page).waitFor();
  assert.equal(await connectors(page).count(), 1);
}, { setup: board3 });

await scenario("2b araç: klavye C aracı açar/kapatır; Esc bekleyen başlangıcı bırakır", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("c");
  await page.locator("[data-board-connect-hint]").waitFor();
  await item(page, 1).click();
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("okun varacağı"));
  await page.keyboard.press("Escape");
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("başlayacağı"), "başlangıç bırakıldı, araç açık");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-board-connect-hint]").count(), 0, "ikinci Esc aracı kapatır");
}, { setup: board3 });

await scenario("2c araç: aynı nesneye iki kez dokunmak bekleyeni bırakır; boş alan da", async ({ page, db }) => {
  await openBoard(page);
  await toolBtn(page).click();
  await item(page, 1).click();
  await item(page, 1).click();
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("başlayacağı"));
  assert.equal(calls(db, "POST", "space_connections").length, 0);
}, { setup: board3 });

await scenario("3 çubuk: etiket, çizgi stili, ok başı, yol, renk, yönü çevir sunucuya yazılır", async ({ page, db }) => {
  await openBoard(page);
  await page.locator("[data-connector-label]").click();
  await bar(page).waitFor();
  await page.getByLabel("Ok etiketi").fill("üret");
  await page.getByLabel("Ok etiketi").press("Enter");
  await waitFor(() => calls(db, "PATCH", "space_connections").length >= 1);
  assert.equal(calls(db, "PATCH", "space_connections")[0].body.label, "üret");
  assert.ok(await waitFor(async () => (await page.locator("[data-connector-label]").innerText()).includes("üret")), "etiket çizgide güncellenir");

  await bar(page).getByRole("button", { name: "Çizgi" }).click();
  await page.getByRole("menuitem", { name: /Kesikli/ }).click();
  await waitFor(() => calls(db, "PATCH", "space_connections").some((c) => c.body.line_style === "dashed"));
  assert.ok(await waitFor(async () => (await connectors(page).first().locator("path[stroke-dasharray]").count()) > 0), "kesikli çizgi çizilir");

  await bar(page).getByRole("button", { name: "Ok başı" }).click();
  await page.getByRole("menuitem", { name: /Yok/ }).click();
  await waitFor(() => calls(db, "PATCH", "space_connections").some((c) => c.body.arrow === "none"));
  assert.ok(await waitFor(async () => (await connectors(page).first().locator("polygon").count()) === 0), "ok başı yok");

  await bar(page).getByRole("button", { name: "Yol" }).click();
  await page.getByRole("menuitem", { name: /Dirsekli/ }).click();
  await waitFor(() => calls(db, "PATCH", "space_connections").some((c) => c.body.route === "elbow"));
  assert.ok(await waitFor(async () => /H.*V.*H/.test((await connectors(page).first().locator("path[fill=none]").last().getAttribute("d")) ?? "")), "dirsekli yol");

  await bar(page).getByRole("radio", { name: "Kırmızı" }).click();
  await waitFor(() => calls(db, "PATCH", "space_connections").some((c) => c.body.color === "danger"));

  await bar(page).getByRole("button", { name: "Yönü çevir" }).click();
  await waitFor(() => calls(db, "PATCH", "space_connections").some((c) => c.body.from_item_id === NOTE(2)));
  const flip = calls(db, "PATCH", "space_connections").find((c) => c.body.from_item_id === NOTE(2)).body;
  assert.equal(flip.to_item_id, NOTE(1));
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra" }); } });

await scenario("4 sil + geri al + yinele (aynı kimlikle)", async ({ page, db }) => {
  await openBoard(page);
  await page.locator("[data-connector-label]").click();
  await bar(page).getByRole("button", { name: "Oku sil" }).click();
  await waitFor(() => calls(db, "DELETE", "space_connections").length === 1);
  assert.ok(await waitFor(async () => (await connectors(page).count()) === 0), "ok çizimden kalkar");
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+z");
  await connectors(page).first().waitFor();
  const posts = calls(db, "POST", "space_connections");
  assert.equal(posts.length, 1, "geri alma ok'u yeniden ekler");
  assert.equal(rowsOf(posts[0])[0].id, db.spaceConnections[0].id, "aynı kimlik");
  assert.equal(rowsOf(posts[0])[0].label, "sonra", "etiket korunur");
  await page.keyboard.press("Control+Shift+z");
  await waitFor(() => calls(db, "DELETE", "space_connections").length === 2);
  assert.ok(await waitFor(async () => (await connectors(page).count()) === 0));
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra" }); } });

await scenario("4b Delete tuşu seçili oku siler", async ({ page, db }) => {
  await openBoard(page);
  await page.locator("[data-connector-label]").click();
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Delete");
  await waitFor(() => calls(db, "DELETE", "space_connections").length === 1);
  assert.equal(await connectors(page).count(), 0);
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "x" }); } });

await scenario("5 takip: öğe sürüklenince ok yolu değişir (konum saklanmaz)", async ({ page, db }) => {
  await openBoard(page);
  const before = await connectors(page).first().locator("path").first().getAttribute("d");
  const box = await item(page, 2).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + i * 20);
  await page.mouse.up();
  const after = await connectors(page).first().locator("path").first().getAttribute("d");
  assert.notEqual(before, after, "yol yeni konuma göre yeniden hesaplandı");
  assert.equal(calls(db, "PATCH", "space_connections").length, 0, "ok satırına konum yazılmaz");
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2)); } });

await scenario("6 seçimi bağla: iki ya da üç nesne zincirlenir; bağlı çift atlanır", async ({ page, db }) => {
  await openBoard(page);
  await item(page, 1).click();
  await item(page, 2).click({ modifiers: ["Shift"] });
  await item(page, 3).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Seçilenleri ok ile bağla" }).click();
  await waitFor(() => calls(db, "POST", "space_connections").length === 1);
  const rows = rowsOf(calls(db, "POST", "space_connections")[0]);
  assert.equal(rows.length, 1, "ilk çift zaten bağlıydı: yalnız ikinci çift eklendi");
  assert.equal(rows[0].from_item_id, NOTE(2));
  assert.equal(rows[0].to_item_id, NOTE(3));
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2)); } });

await scenario("6b yinelenen çift: zaten bağlı uyarısı, yeni istek yok", async ({ page, db }) => {
  await openBoard(page);
  await toolBtn(page).click();
  await item(page, 2).click();
  await item(page, 1).click();
  const alert = page.getByTestId("space-board").getByRole("alert");
  await alert.waitFor();
  assert.ok((await alert.innerText()).includes("zaten bağlı"));
  assert.equal(calls(db, "POST", "space_connections").length, 0);
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2)); } });

await scenario("7 öğe silinince oku da gider; geri alınca ok da döner", async ({ page, db }) => {
  await openBoard(page);
  await item(page, 1).click();
  await page.getByRole("button", { name: "Kaldır" }).click();
  await waitFor(() => connectors(page).count().then((n) => n === 0));
  assert.equal(await connectors(page).count(), 0);
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+z");
  await item(page, 1).waitFor();
  await connectors(page).first().waitFor();
  assert.equal(db.spaceConnections.length, 1, "ok geri geldi");
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "x" }); } });

await scenario("8 izleyici: oklar görünür, araç yok, seçilince düzenleme denetimleri yok", async ({ page }) => {
  await openBoard(page);
  assert.equal(await connectors(page).count(), 1);
  assert.equal(await toolBtn(page).count(), 0, "Ok çiz aracı yok");
  await page.locator("[data-connector-label]").click();
  await bar(page).waitFor();
  assert.equal(await page.getByLabel("Ok etiketi").count(), 0);
  assert.equal(await bar(page).getByRole("button", { name: "Oku sil" }).count(), 0);
}, { setup: (db) => { db.addSpace(1, { title: "Başkasının", owner: U.carol.id, visibility: "public", members: [[{ id: ME }, "viewer"]] }); for (let n = 1; n <= 2; n += 1) db.addItem(SID(1), { id: NOTE(n), kind: "note", title: `Not ${n}`, x: (n - 1) * 400, y: 0, w: 220, h: 180, z: n }); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra" }); } });

await scenario("9 sınır hatası okunur söylenir", async ({ page, db }) => {
  await openBoard(page);
  db.spaceFail.connectionLimit = true;
  await toolBtn(page).click();
  await item(page, 1).click();
  await item(page, 2).click();
  const alert = page.getByTestId("space-board").getByRole("alert");
  await alert.waitFor();
  assert.ok((await alert.innerText()).includes("1000"));
}, { setup: board3 });

await scenario("10 İngilizce: araç, ipucu ve çubuk çevrilir", async ({ page }) => {
  await openBoard(page);
  await toolBtn(page).click();
  assert.ok((await page.locator("[data-board-connect-hint]").innerText()).includes("Pick the object"));
  await page.keyboard.press("Escape");
  await page.locator("[data-connector-label]").click();
  await page.getByLabel("Arrow label").waitFor();
  await bar(page).getByRole("button", { name: "Reverse direction" }).waitFor();
}, { lang: "en", setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "then" }); } });

await scenario("11 telefon: pano ve çubuk taşmaz; dokunmayla oku seç", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-connector-label]").tap();
  await bar(page).waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 800 }, touch: true, setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra" }); } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
  if (status === "FAIL") failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
