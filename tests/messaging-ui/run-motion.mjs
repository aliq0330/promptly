// Hareketli ikonlar ve çıkış animasyonları (docs/history/335-*): mobil alt menü — üstteki çizgi sekmeler arasında kayar, ikon YALNIZ sekme aktif
// olunca oynar (sayfa açılışında değil), "+" menü açılınca dönüp ✕ olur; hareketi azalt açıkken de çalışır; Space/Kaydet gibi ayrıntı
// animasyonları görsel olduğu için burada yalnız yapısal sözleşme sınanır. Ağ taklitli; gerçek cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4187/promptly";
const server = await serve(4187);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const CARD = { id: "b0000000-0000-4000-8000-000000000001", title: "Görsel prompt 1", description: "d", prompt_text: "cinematic photo", tool: null, tools: [], content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null, like_count: 3, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-10-11T10:00:00Z", show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.bob), prompt_media: [{ id: "m1", url: svg("#6d5bd0", "#d9d2c3", 1200, 900), width: 1200, height: 900, alt: "a", position: 0, dominant_color: "#6d5bd0", placeholder: svg("#6d5bd0", "#d9d2c3", 24, 18) }], prompt_tags: [] };

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, reducedMotion = "no-preference", cards = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const feed = cards ? [{ kind: "prompt", id: CARD.id, created_at: CARD.created_at, sort_rank: 1, reason_kind: "popular", reason_ref: null }] : [];
  db.rpc.feed_page = () => ({ body: feed });
  db.rpc.for_you_page = () => ({ body: feed });
  const context = await browser.newContext({ viewport, reducedMotion });
  await installMock(context, db);
  if (cards) {
    await context.route(/\/rest\/v1\/prompts\?/, (route) => (route.request().method() !== "GET" ? route.fallback() : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([CARD]) })));
  }
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

// Kartlardaki `CARD_SAVE_CLASS` (`[&>span]:hidden`) düğmenin doğrudan <span> çocuğunu gizler: yer imi ikonunun kökü <span> olduğunda kartta Kaydet GÖRÜNMEZ oldu (335 sonrası regresyon).
await scenario("6. kartta Kaydet ikonu görünür (sayı gizli, ikon değil); kaydedilmemiş yer imi dolu değil", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const save = page.locator("article button[aria-pressed]").first();
  await save.waitFor();
  const box = await save.locator(".mi-bm").boundingBox();
  assert.ok(box && box.width >= 12 && box.height >= 12, `bookmark has size (${JSON.stringify(box)})`);
  assert.equal(await save.locator(".mi-bm").getAttribute("data-filled"), "false");
  const clip = await save.locator(".mi-bm-fill").evaluate((el) => getComputedStyle(el).clipPath);
  assert.match(clip, /inset\(100%/, "the fill is clipped away while unsaved");
}, { cards: true });

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(passed === results.length ? 0 : 1);
