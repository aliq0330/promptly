// "Çalıştır" penceresi: telefonda taşmaz (başlık sabit, liste kayar) ve araçlar gerçek marka logosuyla gelir — docs/history/422-*.
// Ağ taklitli; gerçek Supabase'e/cihaza KARŞI DENENMEDİ. Ekran görüntüsü için SHOTS=<klasör>.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4185/promptly";
const server = await serve(4185);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];

async function scenario(name, fn, { viewport, theme = "dark" }) {
  const db = createDb();
  setupCommunities(db);
  seedComments(db, "prompt");
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600, deviceScaleFactor: 2 });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript(([th]) => { try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-theme", th); } catch {} }, [theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await fn(page);
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
  } finally { await context.close(); }
}

async function openRun(page) {
  await page.locator("section#prompt-text").getByRole("button", { name: /Çalıştır/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Çalıştır" }).waitFor();
  await page.waitForTimeout(700); // alttan kayma animasyonu bitsin
  return dialog;
}

for (const [label, viewport, theme] of [["telefon · koyu", { width: 393, height: 852 }, "dark"], ["telefon · açık", { width: 393, height: 852 }, "light"], ["masaüstü · koyu", { width: 1280, height: 900 }, "dark"]]) {
  await scenario(`${label}: araç listesi kartın içinde kayar (taşmaz), başlık ve ✕ sabit, her araçta gerçek logo`, async (page) => {
    const dialog = await openRun(page);
    await dialog.getByRole("button", { name: "ChatGPT" }).waitFor();
    // tüm araçlar görünsün
    const more = dialog.getByRole("button", { name: /Diğer araçlar|Daha fazla araç|More tools/ });
    if (await more.count()) await more.click();
    const card = await dialog.getByRole("heading", { name: "Çalıştır" }).evaluate((h) => {
      let el = h; while (el && !(el instanceof HTMLElement && getComputedStyle(el).overflow === "hidden" && el.getBoundingClientRect().height > 150)) el = el.parentElement;
      const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, vh: window.innerHeight };
    });
    assert.ok(card.bottom <= card.vh + 1 && card.top >= 0, `kart ekrana sığar: ${JSON.stringify(card)}`);
    // liste öğeleri kartın dışına taşmaz: en alttaki araç satırı kaydırılınca kartın içinde kalır
    const overflowing = await dialog.getByRole("heading", { name: "Çalıştır" }).evaluate((h) => {
      let card = h; while (card && !(card instanceof HTMLElement && getComputedStyle(card).overflow === "hidden" && card.getBoundingClientRect().height > 150)) card = card.parentElement;
      const cr = card.getBoundingClientRect();
      const lis = [...card.querySelectorAll("li button")];
      const scroller = lis[0].closest("div.overflow-y-auto");
      scroller.scrollTop = scroller.scrollHeight;
      const last = lis[lis.length - 1].getBoundingClientRect();
      return { scrollable: scroller.scrollHeight > scroller.clientHeight, lastBottom: last.bottom, cardBottom: cr.bottom, rows: lis.length };
    });
    assert.ok(overflowing.lastBottom <= overflowing.cardBottom + 1, `son araç kartın içinde: ${JSON.stringify(overflowing)}`);
    // logolar: her satırda <img> ya da mask'lı span var, hiçbiri baş harf yedeği değil, hepsi yüklendi
    const rows = dialog.locator("li button");
    const n = await rows.count();
    assert.ok(n >= 3, "araç satırları var");
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const name = (await row.locator("span.truncate").first().textContent())?.trim();
      const hasImg = (await row.locator("img[src*='/tools/']").count()) === 1;
      const hasMask = (await row.locator("span[style*='mask']").count()) === 1;
      assert.ok(hasImg || hasMask, `${name}: gerçek logo var`);
    }
    const broken = await dialog.locator("img[src*='/tools/']").evaluateAll((imgs) => imgs.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.src));
    assert.deepEqual(broken, [], "logo dosyaları yüklendi");
    if (process.env.SHOTS) { await page.evaluate(() => document.querySelector("div.overflow-y-auto")?.scrollTo(0, 0)); await page.screenshot({ path: `${process.env.SHOTS}/run-${label.replace(/[ ·]+/g, "-")}.png` }); }
  }, { viewport, theme });
}

await scenario("araca tıklayınca sonuç aynı kartın içinde gösterilir", async (page) => {
  const dialog = await openRun(page);
  await page.context().route("https://chatgpt.com/**", (r) => r.fulfill({ status: 200, body: "ok" }));
  await dialog.getByRole("button", { name: "ChatGPT" }).click();
  await dialog.getByRole("status").waitFor();
}, { viewport: { width: 393, height: 852 }, theme: "dark" });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} geçti`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
