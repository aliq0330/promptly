// Telefonda ekran klavyesi açıkken sohbet paneli GÖRÜNÜR ALANA oturur (docs/history/332-*): başlık görünür alanın tepesinde,
// yazma alanı tam altında (klavyeyle arasında boşluk yok), son mesaj görünür; klavye kapanınca panel CSS'ine döner. Yeni sohbet
// taslağı da aynı kancayı kullanır; tablette (md+) panele dokunulmaz. Klavye `visualViewport` değerleri değiştirilerek taklit edilir —
// gerçek iOS Safari klavyesi bu ortamda açılamaz, DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const BASE = "http://localhost:4192/promptly";
const server = await serve(4192);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const SHOTS = process.env.SHOTS ?? "";
const TEXTS = Array.from({ length: 24 }, (_, i) => `mesaj ${i + 1}`);

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, path = `/messages/local?id=${CONV}` } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { texts: TEXTS });
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  await installMock(context, db, { signedIn: ME });
  await hub.install(context, ME);
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-terms-notice", "2026-11-02"); } catch {} });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}${path}`);
    await page.locator("form textarea").waitFor();
    await page.waitForTimeout(400);
    await fn({ page });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ckfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

/** Klavye taklidi: görünür alan `height` px'e iner ve `offsetTop` px aşağı kayar (iOS sayfayı kaydırır). null = klavye kapanır. */
async function keyboard(page, frame) {
  await page.evaluate((f) => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, "height", { configurable: true, get: () => (f ? f.height : window.innerHeight) });
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => (f ? f.offsetTop : 0) });
    vv.dispatchEvent(new Event("resize"));
  }, frame);
  await page.waitForTimeout(150);
}
const composerBox = (page) => page.locator("form").filter({ has: page.locator("textarea") }).boundingBox();
const backButton = (page) => page.getByRole("button", { name: "Mesaj listesine dön" }).first();
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await scenario("1. Klavye + iOS sayfayı kaydırdı: başlık görünür alanın tepesinde, yazma alanı tam altında; kapanınca eski hâl", async ({ page }) => {
  await keyboard(page, { height: 420, offsetTop: 200 });
  const form = await composerBox(page);
  assert.ok(Math.abs(form.y + form.height - 620) <= 1, `yazma alanının altı = görünür alanın altı (620): ${Math.round(form.y + form.height)}`);
  const back = await backButton(page).boundingBox();
  assert.ok(back.y >= 200 && back.y < 280, `başlık görünür alanda: ${Math.round(back.y)}`);
  const last = await page.locator("[data-message-id]", { hasText: "mesaj 24" }).first().boundingBox();
  assert.ok(last.y + last.height <= form.y + 1 && last.y >= 200, `son mesaj görünür: ${Math.round(last.y)}`);
  await keyboard(page, null);
  const after = await composerBox(page);
  assert.ok(Math.abs(after.y + after.height - 844) <= 1, `klavye kapanınca ekranın altı: ${Math.round(after.y + after.height)}`);
  assert.equal(await page.locator("[data-chat-scroll]").evaluate((el) => el.closest(".fixed")?.style.top ?? "x"), "", "satır içi stil temizlendi");
});

await scenario("2. Sayfa kaydırılmadan küçülen görünür alan (iOS 26 yüzen çubuk): yazma alanı ile klavye arasında boşluk yok", async ({ page }) => {
  await keyboard(page, { height: 450, offsetTop: 0 });
  const form = await composerBox(page);
  assert.ok(Math.abs(form.y + form.height - 450) <= 1, `yazma alanının altı 450: ${Math.round(form.y + form.height)}`);
  const back = await backButton(page).boundingBox();
  assert.ok(back.y >= 0 && back.y < 80, "başlık tepede");
  await shot(page, "chat-keyboard");
});

await scenario("3. Adres çubuğu oynaması (küçük fark) klavye sayılmaz: panel olduğu gibi", async ({ page }) => {
  await keyboard(page, { height: 844 - 80, offsetTop: 0 });
  const form = await composerBox(page);
  assert.ok(Math.abs(form.y + form.height - 844) <= 1, `yerinde: ${Math.round(form.y + form.height)}`);
});

await scenario("4. Yeni sohbet taslağı da görünür alana oturur", async ({ page }) => {
  await keyboard(page, { height: 400, offsetTop: 150 });
  const form = await composerBox(page);
  assert.ok(Math.abs(form.y + form.height - 550) <= 1, `yazma alanının altı 550: ${Math.round(form.y + form.height)}`);
  const back = await backButton(page).boundingBox();
  assert.ok(back.y >= 150 && back.y < 230, `başlık görünür alanda: ${Math.round(back.y)}`);
}, { path: `/messages/local?to=${U.bob.id}` });

await scenario("5. Tablet (md+): panel fixed değil, klavye değerleri ona dokunmaz", async ({ page }) => {
  const before = await composerBox(page);
  await keyboard(page, { height: 500, offsetTop: 100 });
  const after = await composerBox(page);
  assert.equal(Math.round(after.y), Math.round(before.y), "yerinde");
}, { viewport: { width: 900, height: 1100 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
