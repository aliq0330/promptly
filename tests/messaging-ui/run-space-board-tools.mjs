// Space panosu araçları (docs/history/263-*): akıllı kılavuzlar (sürüklerken hizaya yakalanma + çizgi), çoğalt / kopyala-yapıştır
// (yalnız not + taslak prompt, aralarındaki oklarla, tek adımda geri al), mini harita (gezinme + tercih), pano içi arama (Ctrl+F),
// İngilizce, izleyici, telefon. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4201;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const NOTE = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, lang = "tr", touch = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await installMock(context, db, {});
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
    try { await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/boardtools-fail-${results.length}.png` }); } catch {}
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
const items = (page) => page.locator("[data-board-item]");
const item = (page, n) => page.locator(`[data-board-item="${NOTE(n)}"]`);
const openBoard = async (page) => { await page.goto(boardUrl); await item(page, 1).waitFor(); };
// Sayfa yüklenirken yerleşim kayabilir (bant, görsel): konum art arda iki ölçümde aynı olana dek beklenir.
const settled = async (locator) => {
  let last = "";
  for (let i = 0; i < 40; i += 1) {
    const box = JSON.stringify(await locator.boundingBox());
    if (box === last) return locator.boundingBox();
    last = box;
    await new Promise((r) => setTimeout(r, 120));
  }
  return locator.boundingBox();
};
const noteRows = (db) => calls(db, "POST", "space_items").flatMap(rowsOf);
function board3(db, over = {}) {
  db.addSpace(1, { title: "Pano", visibility: "private", ...over });
  for (let n = 1; n <= 3; n += 1) db.addItem(SID(1), { id: NOTE(n), kind: "note", title: `Not ${n}`, body: `gövde ${n}`, x: (n - 1) * 400, y: n === 3 ? 150 : 0, w: 220, h: 180, z: n });
}

// ---------------------------------------------------------------- akıllı kılavuzlar
await scenario("1 kılavuz: sürüklerken diğer nesnenin üst kenarına yakalanır, kılavuz çıkar, bırakınca kalkar", async ({ page }) => {
  await openBoard(page);
  const b1 = await settled(item(page, 1));
  const b3 = await settled(item(page, 3));
  await page.mouse.move(b3.x + 60, b3.y + 40);
  await page.mouse.down();
  const targetDy = b1.y - b3.y + 1; // ekranda 1 px aşağıda
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(b3.x + 60, b3.y + 40 + (targetDy * i) / 8);
  assert.ok(await waitFor(async () => (await page.locator('[data-board-guide="y"]').count()) > 0), "yatay kılavuz çıktı");
  await page.mouse.up();
  assert.ok(await waitFor(async () => (await page.locator("[data-board-guide]").count()) === 0), "bırakınca kılavuz kalktı");
  assert.ok(await waitFor(async () => Math.abs((await item(page, 3).boundingBox()).y - b1.y) < 1), "üst kenarlar hizalandı");
}, { setup: (db) => board3(db) });

await scenario("1b kılavuz: Alt basılıyken yakalama yok", async ({ page }) => {
  await openBoard(page);
  const b1 = await settled(item(page, 1));
  const b3 = await settled(item(page, 3));
  await page.keyboard.down("Alt");
  await page.mouse.move(b3.x + 60, b3.y + 40);
  await page.mouse.down();
  const targetDy = b1.y - b3.y + 1;
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(b3.x + 60, b3.y + 40 + (targetDy * i) / 8);
  assert.equal(await page.locator("[data-board-guide]").count(), 0, "Alt: kılavuz yok");
  await page.mouse.up();
  await page.keyboard.up("Alt");
}, { setup: (db) => board3(db) });

// ---------------------------------------------------------------- çoğalt / kopyala-yapıştır
await scenario("2 çoğalt: Çoğalt düğmesi kopyayı + aralarındaki oku yazar; tek adımda geri al / yinele", async ({ page, db }) => {
  await openBoard(page);
  await item(page, 1).click();
  await item(page, 2).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Çoğalt" }).click();
  assert.ok(await waitFor(async () => (await items(page).count()) === 5), "iki kopya geldi");
  const rows = noteRows(db);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.title).sort(), ["Not 1", "Not 2"]);
  assert.ok(rows.every((r) => r.id && ![NOTE(1), NOTE(2)].includes(r.id) && r.group_id == null && r.source_role == null));
  const original = db.spaceItems.find((i) => i.id === NOTE(1));
  assert.equal(rows.find((r) => r.title === "Not 1").x, original.x + 32);
  const arrows = calls(db, "POST", "space_connections").flatMap(rowsOf);
  assert.equal(arrows.length, 1, "kendi aralarındaki ok kopyalandı");
  assert.ok(await waitFor(async () => (await page.locator("[data-connector]").count()) === 2));
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+z");
  assert.ok(await waitFor(async () => (await items(page).count()) === 3), "tek geri alma ikisini de kaldırır");
  await page.keyboard.press("Control+Shift+z");
  assert.ok(await waitFor(async () => (await items(page).count()) === 5), "yinele geri getirir");
}, { setup: (db) => { board3(db); db.addConnection(SID(1), NOTE(1), NOTE(2), { label: "sonra" }); } });

await scenario("2b klavye: Ctrl+D çoğaltır; Ctrl+C / Ctrl+V her yapıştırmada biraz kayık kopya açar", async ({ page, db }) => {
  await openBoard(page);
  await item(page, 2).click();
  await page.keyboard.press("Control+d");
  assert.ok(await waitFor(async () => (await items(page).count()) === 4), "Ctrl+D");
  await item(page, 1).click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  assert.ok(await waitFor(async () => (await items(page).count()) === 5), "ilk yapıştırma");
  await page.keyboard.press("Control+v");
  assert.ok(await waitFor(async () => (await items(page).count()) === 6), "ikinci yapıştırma");
  const pasted = noteRows(db).filter((r) => r.title === "Not 1");
  assert.equal(pasted.length, 2);
  assert.deepEqual(pasted.map((r) => r.x - 0).sort((a, b) => a - b), [32, 64], "her yapıştırma 32 birim daha kayık");
}, { setup: (db) => board3(db) });

await scenario("2c sınır: görsel çoğaltılamaz (düğme yok, Ctrl+D açıklayıcı hata verir); izleyici çoğaltamaz", async ({ page, db }) => {
  await page.goto(boardUrl);
  await page.locator('[data-board-item="bbbbbbbb-0000-4000-8000-000000000001"]').waitFor();
  await page.locator('[data-board-item="bbbbbbbb-0000-4000-8000-000000000001"]').click();
  assert.equal(await page.getByRole("button", { name: "Çoğalt" }).count(), 0);
  await page.keyboard.press("Control+d");
  assert.ok(await page.getByText("Yalnız notlar ve taslak promptlar çoğaltılabilir.").first().isVisible());
  assert.equal(calls(db, "POST", "space_items").length, 0);
}, { setup: (db) => { db.addSpace(1, { title: "Pano", visibility: "private" }); db.addItem(SID(1), { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "image", media_url: "https://example.supabase.co/storage/v1/object/public/space-media/x.jpg", media_width: 800, media_height: 600, x: 0, y: 0, w: 240, h: 180, z: 1 }); } });

await scenario("2d izleyici: Çoğalt düğmesi yok, Ctrl+D hiçbir şey yazmaz", async ({ page, db }) => {
  await openBoard(page);
  await item(page, 1).click();
  assert.equal(await page.getByRole("button", { name: "Çoğalt" }).count(), 0);
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(300);
  assert.equal(calls(db, "POST", "space_items").length, 0);
}, { setup: (db) => board3(db, { owner: U.carol.id, members: [[{ id: ME }, "viewer"]], visibility: "public" }) });

// ---------------------------------------------------------------- mini harita
await scenario("3 mini harita: görünür, görünen alanı gösterir; haritaya basınca pano o yöne kayar; tercih hatırlanır", async ({ page }) => {
  await openBoard(page);
  const map = page.locator("[data-board-minimap]");
  await map.waitFor();
  assert.equal(await page.locator("[data-minimap-view]").count(), 1);
  assert.equal(await map.locator("svg rect").count(), 3 + 1, "üç nesne + görünen alan");
  // Önce yakınlaştır: görünen alan haritada küçülür, sonra haritanın sağ üstüne basmak panoyu oraya götürür.
  await page.getByRole("button", { name: "Yakınlaştır" }).click();
  await page.getByRole("button", { name: "Yakınlaştır" }).click();
  await map.scrollIntoViewIfNeeded();
  const before = await settled(item(page, 1));
  const box = await map.locator("svg").boundingBox();
  await page.mouse.click(box.x + box.width - 14, box.y + 14);
  assert.ok(await waitFor(async () => Math.abs((await item(page, 1).boundingBox()).x - before.x) > 40), "pano kaydı");
  // Tercih: kapat → yenilenince kapalı kalır
  await page.getByRole("button", { name: "Mini harita" }).click();
  assert.equal(await page.locator("[data-board-minimap]").count(), 0);
  await page.reload();
  await item(page, 1).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-board-minimap]").count(), 0, "tercih hatırlandı");
}, { setup: (db) => board3(db) });

// ---------------------------------------------------------------- arama
await scenario("4 arama: Ctrl+F açar, sonucu seçip ortalar, Enter sonrakine geçer; sonuç yoksa söyler; Esc kapatır", async ({ page }) => {
  await openBoard(page);
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+f");
  const search = page.locator("[data-board-search]");
  await search.waitFor();
  await search.getByRole("textbox").fill("gövde 2");
  assert.equal((await page.locator("[data-search-count]").innerText()).trim(), "1/1");
  await search.getByRole("textbox").press("Enter");
  assert.ok(await waitFor(async () => (await page.locator("[data-board-selection]").count()) === 1), "bulunan nesne seçildi");
  const canvas = await page.locator("[data-board-canvas]").boundingBox();
  const found = await item(page, 2).boundingBox();
  assert.ok(Math.abs(found.x + found.width / 2 - (canvas.x + canvas.width / 2)) < 12, "görünümün ortasında");
  await search.getByRole("textbox").fill("Not");
  assert.equal((await page.locator("[data-search-count]").innerText()).trim(), "1/3");
  await search.getByRole("textbox").press("Enter");
  await search.getByRole("textbox").press("Enter");
  assert.equal((await page.locator("[data-search-count]").innerText()).trim(), "2/3");
  await search.getByRole("textbox").fill("zzz");
  assert.ok((await page.locator("[data-search-count]").innerText()).includes("Sonuç yok"));
  await search.getByRole("textbox").press("Escape");
  assert.equal(await page.locator("[data-board-search]").count(), 0, "Esc kapatır");
}, { setup: (db) => board3(db) });

await scenario("4b arama: araç çubuğundaki düğme açar; izleyici de arayabilir", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: /Panoda ara/ }).click();
  await page.locator("[data-board-search]").waitFor();
  await page.locator("[data-board-search]").getByRole("textbox").fill("Not 3");
  assert.equal((await page.locator("[data-search-count]").innerText()).trim(), "1/1");
}, { setup: (db) => board3(db, { owner: U.carol.id, members: [[{ id: ME }, "viewer"]], visibility: "public" }) });

// ---------------------------------------------------------------- İngilizce ve telefon
await scenario("5 İngilizce: çoğalt, mini harita, arama ve kısayol etiketleri çevrilir", async ({ page }) => {
  await openBoard(page);
  await item(page, 1).click();
  await page.getByRole("button", { name: "Duplicate" }).waitFor();
  await page.getByRole("button", { name: "Minimap" }).waitFor();
  await page.getByRole("button", { name: /Search the board/ }).click();
  assert.equal(await page.getByPlaceholder("Search the board…").count(), 1);
  await page.getByPlaceholder("Search the board…").fill("qqq");
  assert.ok((await page.locator("[data-search-count]").innerText()).includes("No results"));
}, { lang: "en", setup: (db) => board3(db) });

await scenario("6 telefon: mini harita gizli, arama çubuğu ve pano taşmaz", async ({ page }) => {
  await openBoard(page);
  assert.equal(await page.locator("[data-board-minimap]").isVisible(), false, "telefonda mini harita yok");
  await page.getByRole("button", { name: /Panoda ara/ }).click();
  await page.locator("[data-board-search]").waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
}, { viewport: { width: 390, height: 800 }, touch: true, setup: (db) => board3(db) });

await browser.close();
server.close();
for (const [status, name] of results) console.log(status === "PASS" ? "✓" : "✗", name);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
