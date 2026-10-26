// Yatay şeritler masaüstünde fareyle gezilir (`ScrollRow` + `useHorizontalScroll`, docs/history/219-*) — ağ taklitli. Gerçek fareye/trackpad'e KARŞI DENENMEDİ
// (Playwright'ın sentetik fare/tekerlek olayları). Profildeki koleksiyon halkaları ve profil sekmeleri üzerinden sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4196/promptly";
const server = await serve(4196);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const COLLECTIONS = Array.from({ length: 14 }, (_, i) => ({
  id: `c1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  name: `Koleksiyon ${i + 1}`,
  visibility: "public",
  item_count: 3,
  follower_count: 0,
  is_default: false,
}));
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));

function withCollections(db, owner) {
  db.extraRoutes = async ({ table, q, rows }) => {
    const name = q.get("username")?.replace(/^eq\./, "");
    if (table === "profiles" && name) return rows(Object.values(U).filter((u) => u.username === name).map(pubOf));
    if (table === "collections") return rows(COLLECTIONS.map((c) => ({ ...c, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(owner) })));
    if (table === "collection_items") return rows([]);
    return null;
  };
}

async function scenario(name, fn, { viewport = { width: 900, height: 800 }, mobile = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext(mobile ? { viewport, isMobile: true, hasTouch: true } : { viewport });
  await installMock(context, db, {});
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "tr"); } catch {} });
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/hsfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

// Hikâye + koleksiyon grupları TEK şeritte kayar (docs/history/243-*): kaydıran öğe şeridin kendisi.
const ringsRow = (page) => page.locator("[data-profile-rail]");
const left = (loc) => loc.evaluate((el) => el.scrollLeft);
/** Sentetik tekerlek: dönen `defaultPrevented` sayfaya bırakılıp bırakılmadığını söyler. */
const wheel = (loc, deltaY) =>
  loc.evaluate((el, dy) => {
    const event = new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, deltaY);
async function openProfile(page, db) {
  withCollections(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await ringsRow(page).locator("a").first().waitFor();
}

await scenario("1. masaüstü: tekerlek halka şeridini yatay kaydırır; uçta sayfaya bırakır", async ({ page, db }) => {
  await openProfile(page, db);
  const row = ringsRow(page);
  assert.equal(await row.evaluate((el) => el.scrollWidth > el.clientWidth), true, "the strip overflows at this width");
  assert.equal(await left(row), 0);
  assert.equal(await wheel(row, 150), true, "wheel is taken over while the row can still move");
  assert.ok((await left(row)) > 100, "scrolled sideways");
  assert.equal(await wheel(row, -150), true);
  assert.equal(await left(row), 0);
  assert.equal(await wheel(row, -150), false, "at the start an upward wheel goes to the page");
  await row.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  assert.equal(await wheel(row, 150), false, "at the end a downward wheel goes to the page");
  assert.equal(await wheel(row, -150), true, "…but the other way still moves the row");
});

await scenario("2. masaüstü: fareyle sürükleme kaydırır, sürükleme bağlantıyı açmaz; düz tıklama açar", async ({ page, db }) => {
  await openProfile(page, db);
  const row = ringsRow(page);
  const first = row.locator("a").first();
  const box = await first.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + 30, { steps: 8 });
  assert.equal(await row.evaluate((el) => "dragging" in el.dataset), true, "marked as dragging");
  await page.mouse.up();
  assert.ok((await left(row)) > 80, "the drag moved the row");
  assert.equal(await row.evaluate((el) => "dragging" in el.dataset), false);
  assert.ok(!page.url().includes("/collections/"), "a drag does not open the collection");
  const second = row.locator("a").nth(2);
  const box2 = await second.boundingBox();
  await page.mouse.click(box2.x + 30, box2.y + 30);
  await page.waitForURL(/\/collections\/local\/?\?id=/);
});

await scenario("3. masaüstü: üzerine gelince ok düğmeleri; ok bastıkça kayar, uçta kaybolur", async ({ page, db }) => {
  await openProfile(page, db);
  const row = ringsRow(page);
  const next = page.getByRole("button", { name: "Sağa kaydır" });
  const prev = page.getByRole("button", { name: "Sola kaydır" });
  assert.equal(await prev.count(), 0, "nothing hidden on the left at the start");
  await row.hover();
  await next.waitFor();
  assert.equal(await row.evaluate((el) => "fadeNext" in el.dataset && !("fadePrev" in el.dataset)), true, "fade only on the side with content");
  await next.click();
  await page.waitForFunction(() => document.querySelector("[data-profile-rail]").scrollLeft > 150);
  await prev.waitFor();
  for (let i = 0; i < 8 && (await next.count()) > 0; i += 1) { await next.click(); await page.waitForTimeout(450); }
  assert.equal(await next.count(), 0, "the right arrow is gone at the end");
});

await scenario("4. profil bölümleri: dar masaüstünde dört sekme + 'Daha fazla' menüsü açılıp seçilir, yatay taşma yok (docs/history/243-*)", async ({ page, db }) => {
  withCollections(db, U.bob);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  const menu = page.locator("[data-section-menu]");
  await menu.waitFor();
  assert.equal(await page.getByRole("tablist", { name: "Profil bölümleri" }).getByRole("tab").count(), 4, "dört içerik sekmesi");
  await menu.click();
  const options = page.getByRole("radiogroup", { name: "Profil bölümleri" }).getByRole("radio");
  assert.ok((await options.count()) >= 2, "kalan bölümler menüde");
  await options.last().click();
  assert.match(await menu.textContent(), /Hakkında/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "yatay taşma yok");
});

await scenario("5. telefon (dokunmatik): tekerlek ele geçirilmez, ok düğmesi çizilmez", async ({ page, db }) => {
  await openProfile(page, db);
  const row = ringsRow(page);
  assert.equal(await wheel(row, 150), false, "touch devices keep native scrolling");
  assert.equal(await page.getByRole("button", { name: "Sağa kaydır" }).isVisible(), false, "no arrow on a phone");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
}, { viewport: { width: 390, height: 844 }, mobile: true });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
