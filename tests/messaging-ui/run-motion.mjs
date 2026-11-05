// Hareketli ikonlar ve çıkış animasyonları (docs/history/335-*): mobil alt menü — üstteki çizgi sekmeler arasında kayar, ikon YALNIZ sekme aktif
// olunca oynar (sayfa açılışında değil), "+" menü açılınca dönüp ✕ olur; hareketi azalt açıkken de çalışır; Space/Kaydet gibi ayrıntı
// animasyonları görsel olduğu için burada yalnız yapısal sözleşme sınanır. Ağ taklitli; gerçek cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const BASE = "http://localhost:4187/promptly";
const server = await serve(4187);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, reducedMotion = "no-preference" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  db.rpc.feed_page = () => ({ body: [] });
  db.rpc.for_you_page = () => ({ body: [] });
  const context = await browser.newContext({ viewport, reducedMotion });
  await installMock(context, db);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("promptly-language", "tr");
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
  } finally {
    await context.close();
  }
}

const nav = (page) => page.locator("nav[data-app-nav]");
const indicatorX = (page) => nav(page).locator("[data-nav-indicator]").evaluate((el) => el.style.transform);

await scenario("1. alt menü: sayfa açılışında hiçbir ikon oynamaz; çizgi Ana Sayfa'da", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await nav(page).waitFor();
  assert.equal(await nav(page).locator(".mi-play").count(), 0, "no icon plays on first paint");
  assert.equal(await indicatorX(page), "translateX(0%)");
});

await scenario("2. alt menü: Keşfet'e geçince çizgi kayar ve yalnız pusula oynar", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await nav(page).waitFor();
  await nav(page).getByRole("link", { name: "Keşfet" }).click();
  await page.waitForURL(/\/discover/);
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.transform === "translateX(100%)");
  assert.equal(await nav(page).locator(".mi-compass.mi-play").count(), 1, "compass plays");
  assert.equal(await nav(page).locator(".mi-home.mi-play").count(), 0, "home does not");
  // Aynı sekmeye tekrar basınca yeniden oynamaz (aktif olmadı).
  await nav(page).getByRole("link", { name: "Keşfet" }).click();
  await page.waitForTimeout(100);
  assert.equal(await nav(page).locator(".mi-compass.mi-play").count(), 1);
});

await scenario("3. alt menü: '+' menüyü açınca ✕ olur, kapatınca geri döner", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await nav(page).waitFor();
  const plus = nav(page).locator("[data-nav-create] svg.mi-plus");
  assert.equal(await plus.getAttribute("data-open"), "false");
  await nav(page).locator("[data-nav-create]").click();
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] svg.mi-plus")?.getAttribute("data-open") === "true");
  const rotated = await plus.evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(rotated, "none", "the plus is rotated");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] svg.mi-plus")?.getAttribute("data-open") === "false");
});

await scenario("4. hareketi azalt: geçiş yine çalışır, animasyon süreleri ~0", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await nav(page).waitFor();
  await nav(page).getByRole("link", { name: "Keşfet" }).click();
  await page.waitForURL(/\/discover/);
  const d = await nav(page).locator(".mi-compass .mi-needle").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  assert.ok(d < 0.05, `animation duration collapsed (${d}s)`);
  assert.equal(await indicatorX(page), "translateX(100%)");
}, { reducedMotion: "reduce" });

await scenario("5. masaüstü: alt menü yok, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(300);
  assert.equal(await nav(page).isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
}, { viewport: { width: 1280, height: 900 } });

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(passed === results.length ? 0 : 1);
