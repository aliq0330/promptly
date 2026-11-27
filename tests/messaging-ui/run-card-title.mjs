// Akış gönderisi (docs/history/477-*, "A"): görselin ALTINDA tür · araç etiketi + zaman, başlık ve iki satırlık özet; görselin üstünde yazı yok;
// "@kullanıcı · zaman" yalnız ekran okuyucuya; çok görselli kartın "+N" çipi sol üstte; telefonda görsel en çok kare. Ağ taklitli; gerçek Supabase'e / cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4190/promptly";
const server = await serve(4190);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"]];
const pid = (i) => `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
const OWN = 2; // 2. gönderi izleyenin kendisinin
function promptRow(i) {
  const [a, b] = COLORS[i % COLORS.length];
  const extra = i === 3 ? [{ id: "m3b", url: svg(b, a, 1200, 1000), width: 1200, height: 1000, alt: "ikinci", position: 1, dominant_color: b, placeholder: svg(b, a, 24, 20) }] : [];
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: i === 1 ? "GPT Image 1" : null, tools: [],
    content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 40 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i === OWN ? U.alice : i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }, ...extra],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, count = 16, answers = {}, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1));
  // `answers`: önceden kayıtlı cevaplar (prompt kimliği → değer); `rpcCalls`: set_content_interest çağrıları; `fail`: RPC hata verir.
  const state = { rpcCalls: [], answers: { ...answers }, fail: false, followingCalls: 0 };
  db.rpc.feed_page = (body) => {
    if (body.p_scope === "following") state.followingCalls += 1;
    return { body: rows.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: r.like_count })) };
  };
  db.rpc.for_you_page = () => ({
    body: rows.map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i, reason_kind: "popular", reason_ref: null })),
  });
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.set_content_interest = (body) => {
    state.rpcCalls.push(body);
    if (state.fail) return { status: 400, body: { message: "boom" } };
    if (body.p_value === null) delete state.answers[body.p_id];
    else state.answers[body.p_id] = body.p_value;
    return { body: body.p_value };
  };
  setup?.({ db, rows, state });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/content_interest\?/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("prompt_id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    const found = ids.filter((id) => state.answers[id]).map((id) => ({ prompt_id: id, value: state.answers[id] }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(found) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await context.route(/\/rest\/v1\/profiles\?.*order=follower_count/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([author(U.bob), author(U.carol)]) }),
  );
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state, rows });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/in-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const cell = (page, n) => page.locator("[data-flip-key]").nth(n);
const menuButton = (page, n) => cell(page, n).getByRole("button", { name: /Gönderi seçenekleri|Post options/ });
const waitFeed = async (page) => { await page.locator("[data-flip-key]").first().waitFor(); };

const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const textOf = (loc) => loc.evaluate((el) => (el.innerText ?? "").replace(/\s+/g, " ").trim());

await scenario("1. telefon: tür · araç + zaman, başlık ve özet görselin ALTINDA; görselin üstünde yazı yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const media = await rect(cell(page, 0).locator("[data-card-media]"));
  const title = cell(page, 0).getByRole("link", { name: "Görsel prompt 1" });
  await title.waitFor();
  const t = await rect(title);
  assert.ok(t.w > 40 && t.t >= media.b - 1, "başlık görselin altında");
  const card = await textOf(cell(page, 0));
  assert.match(card, /Görsel Prompt\s*·\s*GPT Image 1/i, "tür + araç etiketi");
  const mediaText = await textOf(cell(page, 0).locator("[data-card-media]"));
  assert.ok(!/Görsel prompt 1|GPT Image 1/.test(mediaText), "görselin üstünde başlık/araç yazısı yok");
  const summary = cell(page, 0).locator("[data-card-summary]");
  await summary.waitFor();
  assert.equal(await textOf(summary), "d", "özet açıklamadan gelir");
  assert.equal(await cell(page, 0).locator("p.sr-only").first().evaluate((el) => el.getBoundingClientRect().width <= 1), true, "@kullanıcı · zaman görünür değil (yalnız ekran okuyucu)");
  const color = await title.evaluate((el) => getComputedStyle(el.closest("h2")).color);
  assert.notEqual(color, "rgb(255, 255, 255)", "başlık görselin dışında, normal metin rengi");
  const radius = await cell(page, 0).locator("[data-card-media]").evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  assert.equal(radius, "12px", "görsel köşesi 12 px");
  await shot(page, "1-post");
});

await scenario("2. çok görselli kartın '+N' çipi görselin sol üstünde ve hep görünür", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const chip = cell(page, 2).getByText("+1").first();
  await chip.waitFor();
  const media = await rect(cell(page, 2).locator("[data-card-media]"));
  const c = await rect(chip);
  assert.ok(c.t - media.t < 20 && c.l - media.l < 20, "çip sol üstte");
  assert.equal(await chip.evaluate((el) => getComputedStyle(el).opacity), "1");
});

await scenario("3. masaüstü: üzerine gelince düzen oynamaz, yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const before = await rect(cell(page, 0).getByRole("link", { name: "Görsel prompt 1" }));
  const box = await rect(cell(page, 0).locator("[data-card-media]"));
  await page.mouse.move(box.l + box.w / 2, Math.min(box.t + box.h / 3, 600));
  await page.waitForTimeout(300);
  assert.deepEqual(await rect(cell(page, 0).getByRole("link", { name: "Görsel prompt 1" })), before, "hover düzeni oynatmaz");
  assert.equal(await overflowFree(page), true);
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(600);
  await shot(page, "3-desktop");
}, { viewport: { width: 1280, height: 900 } });

await scenario("4. İngilizce: kicker'da araç ve başlık görünür", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  assert.match(await textOf(cell(page, 0)), /GPT Image 1/i);
  await cell(page, 0).getByRole("link", { name: "Görsel prompt 1" }).waitFor();
}, { lang: "en" });

const tall = ({ rows }) => {
  rows[0].prompt_media[0] = { ...rows[0].prompt_media[0], width: 900, height: 1200 };
};

await scenario("5. telefon: uzun (3:4) görsel en çok kare kırpılır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const media = await rect(cell(page, 0).locator("[data-card-media]"));
  assert.ok(media.h <= media.w + 1, `görsel kare ya da daha alçak (${Math.round(media.w)}×${Math.round(media.h)})`);
}, { setup: tall });

await scenario("6. masaüstü: aynı uzun görsel kendi oranında kalır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const media = await rect(cell(page, 0).locator("[data-card-media]"));
  assert.ok(media.h > media.w * 1.1, `görsel dikey kalır (${Math.round(media.w)}×${Math.round(media.h)})`);
}, { viewport: { width: 1280, height: 900 }, setup: tall });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
