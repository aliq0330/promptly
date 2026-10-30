// Prompt oluşturma tam ekran stüdyo düzeni (docs/history/286-*): solda kayan form, sağda (lg+) sabit canlı önizleme (kart, kopyalanacak metin,
// değerler); telefonda sağ sütun yerine klavye üstü dock (tek satır önizleme + değişken çipleri), önizleme sayfası ve alt çubuk (Taslak | Paylaş).
// Ağ taklitli. Gerçek Supabase'e / gerçek klavyeye / iOS Safari'ye KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = `http://localhost:${process.env.PORT ?? 4197}/promptly`;
const server = await serve(Number(process.env.PORT ?? 4197));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/psfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const openForm = async (page) => { await page.goto(`${BASE}/create?mode=prompt`); await page.locator("[data-compose-studio]").waitFor(); await page.locator("#prompt-title").waitFor(); await page.waitForTimeout(400); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Masaüstü: tam ekran iki sütun — sol form kayar, sağ 408px sabit önizleme; sayfanın kendisi kaymaz", async ({ page }) => {
  await openForm(page);
  const aside = await page.locator("[data-compose-aside]").boundingBox();
  assert.ok(aside && Math.abs(aside.width - 408) <= 1, `aside is 408px wide (${aside?.width})`);
  const scroller = await page.locator("[data-compose-scroll]").evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, canScroll: el.scrollHeight > el.clientHeight }));
  assert.equal(scroller.overflowY, "auto");
  assert.equal(scroller.canScroll, true, "the form is longer than the screen");
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, "the page itself does not scroll");
  for (const sel of ["[data-live-card]", "[data-live-text]", "[data-compose-close]", "[data-compose-draft]", "[data-compose-publish]"]) await page.locator(sel).first().waitFor();
  const cover = await page.locator("[data-live-card] [data-card-media]").boundingBox();
  assert.ok(cover && Math.abs(cover.height - 210) <= 2, `the card cover is 210px tall (${cover?.height})`);
  assert.equal(await page.locator("[data-compose-dock]").isVisible(), false, "no dock on desktop");
  assert.equal(await overflowFree(page), true);
});

await scenario("2. Masaüstü: başlık ve prompt metni sağdaki karta/metne anında yansır; sağdaki 'Yeni' değişken penceresini açar", async ({ page }) => {
  await openForm(page);
  await page.locator("#prompt-title").fill("Kış sabahı İstanbul");
  await page.locator("[data-live-card]").getByText("Kış sabahı İstanbul").first().waitFor();
  await page.locator("#prompt-text").fill("sinematik bir sokak fotoğrafı");
  await page.locator("[data-live-text]").getByText("sinematik bir sokak fotoğrafı").waitFor();
  assert.match(await page.locator("[data-editor-stats]").innerText(), /29 karakter/);
  await page.locator("[data-testid=live-add-variable]").click();
  await page.getByRole("dialog").waitFor();
});

await scenario("3. Masaüstü: eksik alanla Paylaş soluk ama basılır — hatalar alanların altında ve 'Kim görsün?'te 'Düzelt' ile çıkar", async ({ page }) => {
  await openForm(page);
  assert.equal(await page.locator("[data-publish-problem]").count(), 0, "no errors before the first attempt");
  await page.locator("[data-compose-publish]").click();
  await page.locator("[data-field-error]").first().waitFor();
  await page.locator("[data-publish-problem=title]").waitFor();
  await page.locator("[data-publish-problem=description]").waitFor();
  await page.locator("[data-publish-problem=title]").click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "prompt-title");
});

await scenario("4. Masaüstü: isteğe bağlı ayrıntılar satır içinde açılır (kenarlıksız satırlar); Kim görsün? seçenekleri alt yazılı", async ({ page }) => {
  await openForm(page);
  const rows = await page.locator("[data-form-row]").evaluateAll((els) => els.map((el) => el.getAttribute("data-form-row")));
  assert.deepEqual(rows, ["tool", "category", "tags", "dna", "references"]);
  await page.locator("[data-form-row=category] button").first().click();
  await page.locator("[data-form-row=category] [data-taxonomy-type]").first().waitFor();
  await page.locator("[data-audience-option=public]").scrollIntoViewIfNeeded();
  assert.match(await page.locator("[data-audience-option=public]").innerText(), /Herkese açık[\s\S]*Ana Sayfa, Keşfet ve aramada görünür/);
  assert.equal(await page.locator("[data-announce-picker] [role=checkbox]").getAttribute("aria-checked"), "false");
  await page.locator("[data-announce-picker] [role=checkbox]").click();
  assert.equal(await page.locator("[data-announce-picker] [role=checkbox]").getAttribute("aria-checked"), "true");
});

await scenario("5. Telefon (390px): sağ sütun yok, alt çubukta Taslak | Paylaş; yatay taşma yok", async ({ page }) => {
  await openForm(page);
  assert.equal(await page.locator("[data-compose-aside]").isVisible(), false, "no right column on a phone");
  await page.locator("[data-compose-bar]").waitFor();
  await page.locator("[data-compose-bar-draft]").waitFor();
  await page.locator("[data-compose-bar-publish]").waitFor();
  assert.equal(await page.locator("[data-compose-draft]").isVisible(), false, "the top bar keeps only ✕ and Paylaş");
  assert.equal(await overflowFree(page), true);
});

await scenario("6. Telefon: prompt metnine odaklanınca alt çubuk yerini önizleme satırı + değişken çiplerine bırakır; satıra dokununca önizleme sayfası açılır ve Bitti kapatır", async ({ page }) => {
  await openForm(page);
  await page.locator("#prompt-text").click();
  await page.locator("[data-compose-dock-editing]").waitFor();
  assert.equal(await page.locator("[data-compose-bar]").count(), 0, "the bar is replaced while writing");
  await page.locator("[data-compose-dock-new]").waitFor();
  await page.locator("[data-compose-dock-preview]").click();
  await page.locator("[data-preview-sheet]").waitFor();
  await page.locator("[data-preview-sheet] [data-live-card]").waitFor();
  await page.locator("[data-preview-sheet] [data-live-text]").waitFor();
  assert.equal(await overflowFree(page), true);
  await page.locator("[data-testid=preview-sheet-done]").click();
  await page.locator("[data-preview-sheet]").waitFor({ state: "detached" });
  await page.locator("[data-compose-bar]").waitFor();
}, { viewport: { width: 390, height: 844 } });

await scenario("7. İngilizce: bölüm ve yardımcı metinler çevrilmiş", async ({ page }) => {
  await openForm(page);
  await page.getByText("Generation settings").first().waitFor();
  await page.getByText("How it looks in the feed").waitFor();
  await page.getByText("Text that gets copied").waitFor();
  await page.getByText("Shown on Home, Discover and search").waitFor();
  await page.getByRole("button", { name: /From catalog/ }).waitFor();
  await page.getByRole("button", { name: /Help from image/ }).waitFor();
}, { lang: "en" });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
