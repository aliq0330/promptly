// Ana Sayfa → Sana özel kaydırırken "daha fazla yükle" sırasında kartların kaymaması (docs/history/276-*): FLIP yeniden dizilme animasyonu
// yalnız sıra gerçekten değişince çalışır; kaydırma ya da sayfa eklenmesi onu tetiklemez. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4189/promptly";
const server = await serve(4189);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"]];
const pid = (i) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
function promptRow(i) {
  const [a, b] = COLORS[i % COLORS.length];
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: null, tools: [],
    content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: i % 3 ? 1000 : 1500, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, count = 60 } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1));
  const state = { pages: 0 };
  // Sayfa sayfa (18'er): imleç = bir önceki sayfanın son sırası.
  db.rpc.for_you_page = (body) => {
    const start = body.p_after_id ? rows.findIndex((r) => r.id === body.p_after_id) + 1 : 0;
    state.pages += 1;
    return { body: rows.slice(start, start + 18).map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 1000 - (start + i), reason_kind: "popular", reason_ref: null })) };
  };
  db.rpc.feed_page = () => ({ body: [] });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list) });
  });
  await context.route(/\/rest\/v1\/content_interest\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await context.addInitScript(() => {
    try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-tour-seen", "1"); } catch {}
    // Kartlara uygulanan her `transform` animasyonunu say (yeniden dizilme animasyonu = FLIP).
    window.__flip = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      try {
        if (this.hasAttribute && this.hasAttribute("data-flip-key")) window.__flip += 1;
      } catch {}
      return original.call(this, keyframes, options);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
  } finally {
    await context.close();
  }
}

const cells = (page) => page.locator("[data-flip-key]");
const flips = (page) => page.evaluate(() => window.__flip);
async function scrollUntilPages(page, state, pages) {
  for (let i = 0; i < 30 && state.pages < pages; i += 1) {
    await page.evaluate(() => window.scrollBy(0, 1400));
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(900);
}

await scenario("1. kaydırırken sonraki sayfa yüklenince kartlara yeniden dizilme (FLIP) animasyonu uygulanmaz", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await cells(page).first().waitFor();
  assert.equal(await flips(page), 0, "ilk çizimde animasyon yok");
  await scrollUntilPages(page, state, 3);
  assert.ok(state.pages >= 3, `en az 3 sayfa yüklendi (${state.pages})`);
  assert.ok((await cells(page).count()) > 36, "liste büyüdü");
  assert.equal(await flips(page), 0, "kaydırma + sayfa ekleme kartları kaydırmamalı");
});

await scenario("2. kaydırma sırasında kartların sayfadaki (belge) konumu yerinde kalır: önceki kartlar sayfa eklenince oynamaz", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await cells(page).first().waitFor();
  const docTop = (n) => cells(page).nth(n).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(500);
  const before = [await docTop(2), await docTop(8), await docTop(14)];
  await scrollUntilPages(page, state, 2);
  const after = [await docTop(2), await docTop(8), await docTop(14)];
  assert.deepEqual(after.map(Math.round), before.map(Math.round), "ilk sayfadaki kartlar yeni sayfa eklenince yer değiştirmedi");
});

await scenario("3. masaüstü (2 sütun): sayfa eklenince önceki sayfanın kartları sütun değiştirmez", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await cells(page).first().waitFor();
  const pos = (n) => cells(page).nth(n).evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + window.scrollY)]; });
  const before = [await pos(0), await pos(5), await pos(11), await pos(17)];
  await scrollUntilPages(page, state, 3);
  const after = [await pos(0), await pos(5), await pos(11), await pos(17)];
  assert.deepEqual(after, before, "ilk sayfanın kartları aynı sütunda ve aynı yerde");
}, { viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
