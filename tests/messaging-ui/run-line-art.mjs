// Çizgi sahneler (docs/history/373-*): giriş panelindeki "Meydan", bulunamadı ekranlarındaki "Kayıp prompt", karşılama turundaki
// "Paylaşma anı". Sahne yalnız gerektiği yerde yüklenir, iki dilde etiketlenir, koyu modda geceye döner (pencereler yanar),
// hareketi azalt açıkken tek dinlenme karesidir, dokunuşlar hata vermez ve telefonda taşmaz. Ağ taklitli; gerçek cihazda DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4231;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1440, height: 1000 }, lang = "tr", guest = true, theme = "light", reducedMotion = "no-preference", tourSeen = true } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport, reducedMotion });
  await installMock(context, db, { guest });
  await context.addInitScript(([l, th, seen]) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-theme", th);
      if (seen) localStorage.setItem("promptly-tour-seen", "1");
      else localStorage.removeItem("promptly-tour-seen");
    } catch {}
  }, [lang, theme, tourSeen]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && /line-art/.test(m.text())) errors.push(m.text()); });
  try {
    await fn({ page, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/line-art-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const scene = (page, kind) => page.locator(`[data-line-art="${kind}"]`);
const svgOf = (page, kind) => scene(page, kind).locator("svg");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
/** Highest opacity among the warm window/lamp fills — 0 by day, lit at night. */
const glowLevel = (page, kind) => page.evaluate((k) => {
  const nodes = [...document.querySelectorAll(`[data-line-art="${k}"] svg path, [data-line-art="${k}"] svg circle`)];
  return Math.max(0, ...nodes.filter((n) => /--la-glow/.test(n.getAttribute("style") ?? "")).map((n) => Number(n.getAttribute("opacity") ?? 0)));
}, kind);

await scenario("1 sign-in panel: the Meydan scene loads on a tall desktop window, labelled in Turkish, with its hint", async ({ page }) => {
  await page.goto(BASE + "/login/");
  await svgOf(page, "meydan").waitFor();
  assert.equal(await svgOf(page, "meydan").getAttribute("role"), "img");
  assert.match(await svgOf(page, "meydan").getAttribute("aria-label"), /meydan/i);
  assert.match(await svgOf(page, "meydan").locator("text.hint").textContent(), /güvercinlere dokun/);
  assert.ok(await scene(page, "meydan").isVisible());
  // people walk: the figures' placements change over time (some may be waiting off screen)
  const places = () => svgOf(page, "meydan").locator("g.figure").evaluateAll((ns) => ns.map((n) => n.getAttribute("transform")).join("|"));
  const before = await places();
  await page.waitForTimeout(600);
  assert.notEqual(await places(), before, "the scene is animating");
  await shot(page, "line-art-login");
});

await scenario("2 tapping people, pigeons and the board never throws", async ({ page }) => {
  await page.goto(BASE + "/login/");
  await svgOf(page, "meydan").waitFor();
  await page.waitForTimeout(300);
  for (const sel of ["g.figure", "g.pigeon circle"]) {
    const n = svgOf(page, "meydan").locator(sel).first();
    await n.dispatchEvent("pointerdown");
  }
  const box = await svgOf(page, "meydan").boundingBox();
  for (let i = 0; i < 6; i++) await page.mouse.move(box.x + box.width * (i / 6), box.y + box.height / 2, { steps: 2 });
  await page.waitForTimeout(1200);
});

await scenario("3 a window under 980 px tall keeps the panel for the coverflow: the scene is hidden", async ({ page }) => {
  await page.goto(BASE + "/login/");
  await page.locator("aside").waitFor();
  await page.waitForTimeout(400);
  assert.equal(await scene(page, "meydan").isVisible(), false);
}, { viewport: { width: 1280, height: 960 } });

await scenario("4 not found (detail block): the Kayıp prompt scene with house number 404, English label", async ({ page }) => {
  await page.goto(BASE + "/results/local/");
  await svgOf(page, "lost").waitFor();
  assert.equal(await svgOf(page, "lost").locator("text.plate").textContent(), "404");
  assert.match(await svgOf(page, "lost").getAttribute("aria-label"), /prompt card the wind carries off/);
  await shot(page, "line-art-404-en");
}, { lang: "en" });

await scenario("5 the site 404 page shows the scene above the message and the home link", async ({ page }) => {
  await page.goto(BASE + "/no-such-page-anywhere/");
  await svgOf(page, "lost").waitFor();
  await page.getByRole("link", { name: "Ana Sayfa" }).waitFor();
});

await scenario("6 dark mode is night: pale ink, windows and lamps lit", async ({ page }) => {
  await page.goto(BASE + "/results/local/");
  await svgOf(page, "lost").waitFor();
  await page.waitForTimeout(500);
  const ink = await scene(page, "lost").evaluate((n) => getComputedStyle(n).color);
  const [r] = ink.match(/\d+/g).map(Number);
  assert.ok(r > 200, `pale ink at night (${ink})`);
  assert.ok((await glowLevel(page, "lost")) > 0.5, "a window is lit");
  await shot(page, "line-art-404-dark");
}, { theme: "dark" });

await scenario("7 light mode is day: nothing lit", async ({ page }) => {
  await page.goto(BASE + "/results/local/");
  await svgOf(page, "lost").waitFor();
  await page.waitForTimeout(500);
  assert.equal(await glowLevel(page, "lost"), 0);
});

await scenario("8 reduced motion: a single still frame that does not change", async ({ page }) => {
  await page.goto(BASE + "/results/local/");
  await svgOf(page, "lost").waitFor();
  await page.waitForTimeout(300);
  const fig = svgOf(page, "lost").locator("g.figure").first();
  const a = await fig.getAttribute("transform");
  assert.ok(a, "the still frame is drawn");
  await page.waitForTimeout(800);
  assert.equal(await fig.getAttribute("transform"), a);
}, { reducedMotion: "reduce" });

await scenario("9 welcome tour: the Paylaşma anı scene heads the dialog and stays across steps", async ({ page }) => {
  await page.goto(BASE + "/");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator('[data-line-art="share"] svg').waitFor();
  const svgHandle = await dialog.locator('[data-line-art="share"] svg').elementHandle();
  await dialog.getByRole("button", { name: "İleri" }).click();
  assert.equal(await svgHandle.evaluate((n) => n.isConnected), true, "not remounted on the next step");
  await dialog.getByRole("heading").first().waitFor();
  await page.waitForTimeout(400);
  await shot(page, "line-art-tour");
}, { tourSeen: false });

await scenario("10 phone: the 404 scene fits, no horizontal scroll, the hint stays hidden", async ({ page }) => {
  await page.goto(BASE + "/results/local/");
  await svgOf(page, "lost").waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "line-art-404-phone");
}, { viewport: { width: 375, height: 760 } });

await browser.close();
server.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
