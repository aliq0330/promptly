// Konu sayfaları (docs/history/211-*): etiket / kategori / araç sayfası aynı kalıpta (kompakt bant + bölüm balonları + gönderiler),
// araç takibi, gönderideki kategori/araç bağlantıları ve eski arama bağlantılarının yönlendirilmesi. Ağ taklitli; gerçek
// Supabase'e KARŞI DENENMEDİ — süzgeçlerin kendisi sunucu kuralıdır ve supabase/tests/topic-pages.sql'de sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4188/promptly";
const server = await serve(4188);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"]];
const pid = (i) => `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
// i: [kategori, alt kategori, araçlar, etiketler]
const SPEC = {
  1: ["human_character", "character_design", ["midjourney:v7"], ["karakter-tasarimi"]],
  2: ["human_character", "portrait", ["midjourney"], ["karakter-tasarimi"]],
  3: ["photography", null, ["flux"], ["karakter-tasarimi"]],
  4: ["photography", null, ["midjourney"], []],
  5: ["human_character", null, ["flux"], []],
};
function promptRow(i) {
  const [a, b] = COLORS[i % COLORS.length];
  const [category, subcategory, tools, tags] = SPEC[i];
  return {
    id: pid(i), title: `Prompt ${i}`, description: "d", prompt_text: `character sheet number ${i}, soft light`, tool: null, tools,
    content_type: "image", category, subcategory, status: "published", origin_type: "original", request_id: null,
    like_count: 40 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }],
    prompt_tags: tags.map((slug) => ({ tags: { slug, label: "Karakter Tasarımı" } })),
  };
}
const TAG = { slug: "karakter-tasarimi", label: "Karakter Tasarımı", prompt_usage_count: 23, request_usage_count: 0, usage_count: 23, created_at: "2026-01-01T00:00:00Z" };

const matches = (r, body) =>
  (!body.p_tag || SPEC[Number(r.id.slice(-2))][3].includes(body.p_tag)) &&
  (!body.p_tool || r.tools.some((ref) => ref.split(":")[0] === body.p_tool)) &&
  (!body.p_content_type || r.content_type === body.p_content_type) &&
  (!body.p_category || r.category === body.p_category) &&
  (!body.p_subcategory || r.subcategory === body.p_subcategory);

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = [1, 2, 3, 4, 5].map(promptRow);
  const state = { feedCalls: [], countCalls: [], follows: [], followWrites: [] };
  db.rpc.feed_page = (body) => {
    state.feedCalls.push(body);
    const list = rows.filter((r) => matches(r, body));
    return { body: list.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: body.p_order === "popular" ? r.like_count : 0 })) };
  };
  db.rpc.feed_count = (body) => {
    state.countCalls.push(body);
    return { body: rows.filter((r) => matches(r, body)).length };
  };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  // Kayıtlar mock'tan SONRA bağlanır: önce bunlar cevaplar.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => {
    const url = new URL(route.request().url());
    const slug = (url.searchParams.get("slug") ?? "").replace(/^eq\./, "");
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const found = slug === TAG.slug ? TAG : null;
    if (single) return found ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(found) }) : route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(slug ? (found ? [found] : []) : [TAG]) });
  });
  await context.route(/\/rest\/v1\/tool_follows/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.follows.map((tool_id) => ({ tool_id }))) });
    if (req.method() === "POST") {
      const row = JSON.parse(req.postData() || "{}");
      state.followWrites.push(["follow", row]);
      state.follows.unshift(row.tool_id);
      return route.fulfill({ status: 201, body: "" });
    }
    if (req.method() === "DELETE") {
      const id = (new URL(req.url()).searchParams.get("tool_id") ?? "").replace(/^eq\./, "");
      state.followWrites.push(["unfollow", id]);
      state.follows = state.follows.filter((x) => x !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/tp-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name, fullPage = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }); };
const cardTitles = (page) => page.locator("main article:has(a[data-card-link])").evaluateAll((els) => els.map((el) => (el.textContent.match(/Prompt \d/) ?? [""])[0]));

await scenario("1. etiket sayfası: kompakt bant (kolaj başlığın yanında), sayı, Takip Et + Paylaş, bölüm balonları, etiketli gönderiler (p_tag)", async ({ page, state }) => {
  await page.goto(`${BASE}/tags/local?tag=karakter-tasarimi`);
  await page.getByRole("heading", { level: 1, name: "#Karakter Tasarımı" }).waitFor();
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  await page.waitForFunction(() => /3 içerikte kullanıldı/.test(document.querySelector("[data-topic-count]")?.textContent ?? ""));
  const actions = page.locator("[data-topic-actions]");
  await actions.getByRole("button", { name: /Takip Et/ }).waitFor();
  // Bant: kolaj başlığın SOLUNDA (telefonda üstünde değil).
  const art = await page.locator("[data-topic-band] [aria-hidden].grid, [data-topic-band] span[aria-hidden]").first().boundingBox();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  assert.ok(art.x + art.width <= h1.x + 2 && Math.abs(art.y + art.height / 2 - (h1.y + h1.height / 2)) < 60, "kolaj başlığın yanında");
  // Eski sekme/çip satırları yok: bölüm balonları + tek kontrol satırı.
  await page.getByRole("button", { name: "Promptlar" }).first().waitFor();
  assert.equal(await page.getByRole("tab", { name: "Prompt İstekleri" }).count(), 0);
  assert.deepEqual(await cardTitles(page), ["Prompt 1", "Prompt 2", "Prompt 3"]);
  assert.ok(state.feedCalls.some((b) => b.p_tag === "karakter-tasarimi" && b.p_tool === null));
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "1-tag");
});

await scenario("2. kategori sayfası: başlık, tür + kategori, alt kategori bağlantıları; alt kategoriye geçiş; Takip Et YOK, Paylaş var", async ({ page, state }) => {
  await page.goto(`${BASE}/categories/local?type=image&category=human_character`);
  await page.getByRole("heading", { level: 1, name: "İnsan & Karakter" }).waitFor();
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  assert.match(await page.locator("[data-topic-band]").textContent(), /Kategori · Görsel/);
  await page.waitForFunction(() => /3 içerik/.test(document.querySelector("[data-topic-count]")?.textContent ?? ""));
  const actions = page.locator("[data-topic-actions]");
  assert.equal(await actions.getByRole("button", { name: /Takip/ }).count(), 0);
  await actions.getByRole("button", { name: /Paylaş/ }).waitFor();
  assert.deepEqual(await cardTitles(page), ["Prompt 1", "Prompt 2", "Prompt 5"]);
  const subs = page.getByRole("navigation", { name: "Alt kategoriler" });
  assert.equal(await subs.getByRole("link", { name: "Tümü" }).getAttribute("aria-current"), "page");
  await shot(page, "2-category");
  await subs.getByRole("link", { name: "Karakter Tasarımı" }).click();
  await page.waitForURL(/sub=character_design/);
  await page.getByRole("heading", { level: 1, name: "Karakter Tasarımı" }).waitFor();
  assert.match(await page.locator("[data-topic-band]").textContent(), /Görsel · İnsan & Karakter/);
  await page.waitForFunction(() => document.querySelectorAll("main article:has(a[data-card-link])").length === 1);
  assert.deepEqual(await cardTitles(page), ["Prompt 1"]);
  assert.ok(state.feedCalls.some((b) => b.p_category === "human_character" && b.p_subcategory === "character_design"));
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "2-subcategory");
});

await scenario("3. araç sayfası: tüm modelleri kapsar (p_tool), sayı; Takip Et yazar, geri alınır", async ({ page, state }) => {
  await page.goto(`${BASE}/tools/local?id=midjourney`);
  await page.getByRole("heading", { level: 1, name: "Midjourney" }).waitFor();
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  assert.match(await page.locator("[data-topic-band]").textContent(), /Araç · Midjourney/);
  await page.waitForFunction(() => /3 içerikte önerildi/.test(document.querySelector("[data-topic-count]")?.textContent ?? ""));
  assert.deepEqual(await cardTitles(page), ["Prompt 1", "Prompt 2", "Prompt 4"]);
  assert.ok(state.feedCalls.some((b) => b.p_tool === "midjourney" && b.p_tag === null && "p_open_only" in b));
  const actions = page.locator("[data-topic-actions]");
  await actions.getByRole("button", { name: "Takip Et" }).click();
  await actions.getByRole("button", { name: "Takip Ediliyor" }).waitFor();
  assert.deepEqual(state.followWrites[0], ["follow", { user_id: ME, tool_id: "midjourney" }]);
  await actions.getByRole("button", { name: "Takip Ediliyor" }).click();
  await actions.getByRole("button", { name: "Takip Et" }).waitFor();
  assert.deepEqual(state.followWrites[1], ["unfollow", "midjourney"]);
  await shot(page, "3-tool");
});

await scenario("4. misafir: araç Takip Et giriş penceresini açar, hiçbir şey yazılmaz", async ({ page, state }) => {
  await page.goto(`${BASE}/tools/local?id=midjourney`);
  await page.getByRole("heading", { level: 1, name: "Midjourney" }).waitFor();
  await page.locator("[data-topic-actions]").getByRole("button", { name: "Takip Et" }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(state.followWrites.length, 0);
}, { guest: true });

await scenario("5. gönderi sayfası: kategori ve araç bağlantıları kendi sayfalarına gider", async ({ page }) => {
  await page.goto(`${BASE}/prompts/local?id=${pid(1)}`);
  await page.getByRole("heading", { level: 1, name: "Prompt 1" }).waitFor();
  const meta = page.getByTestId("detail-meta");
  const toolLink = meta.getByRole("link", { name: /Midjourney/ }).first();
  assert.match(await toolLink.getAttribute("href"), /\/tools\/local\/?\?id=midjourney$/);
  const catLink = page.getByRole("link", { name: "İnsan & Karakter" }).first();
  assert.match(await catLink.getAttribute("href"), /\/categories\/local\/?\?type=image&category=human_character$/);
  const subLink = page.getByRole("link", { name: "Karakter Tasarımı" }).first();
  assert.match(await subLink.getAttribute("href"), /category=human_character&sub=character_design$/);
  await subLink.click();
  await page.waitForURL(/\/categories\/local/);
  await page.getByRole("heading", { level: 1, name: "Karakter Tasarımı" }).waitFor();
});

await scenario("6. eski arama bağlantıları konu sayfasına yönlenir (arama moduna düşmez)", async ({ page }) => {
  await page.goto(`${BASE}/search?type=image&category=human_character&subcategory=character_design`);
  await page.waitForURL(/\/categories\/local\/?\?type=image&category=human_character&sub=character_design/);
  await page.getByRole("heading", { level: 1, name: "Karakter Tasarımı" }).waitFor();
  await page.goto(`${BASE}/discover?tool=midjourney`);
  await page.waitForURL(/\/tools\/local\/?\?id=midjourney/);
  await page.getByRole("heading", { level: 1, name: "Midjourney" }).waitFor();
});

await scenario("7. bulunamayanlar: bilinmeyen kategori / araç / etiket dürüst boş durum", async ({ page }) => {
  await page.goto(`${BASE}/categories/local?type=image&category=yok-boyle`);
  await page.getByRole("heading", { name: "Kategori bulunamadı" }).waitFor();
  await page.goto(`${BASE}/tools/local?id=yok-boyle`);
  await page.getByRole("heading", { name: "Araç bulunamadı" }).waitFor();
  await page.goto(`${BASE}/tags/local?tag=yok-boyle`);
  await page.getByRole("heading", { name: "Etiket bulunamadı" }).waitFor();
});

await scenario("8. İngilizce: bant ve eylemler çevrili", async ({ page }) => {
  await page.goto(`${BASE}/tools/local?id=midjourney`);
  await page.getByRole("heading", { level: 1, name: "Midjourney" }).waitFor();
  await page.waitForFunction(() => /Recommended in 3 posts/.test(document.querySelector("[data-topic-count]")?.textContent ?? ""));
  assert.match(await page.locator("[data-topic-band]").textContent(), /Tool · Midjourney/);
  await page.goto(`${BASE}/categories/local?type=image&category=human_character`);
  await page.getByRole("heading", { level: 1, name: "Human & Character" }).waitFor();
  assert.match(await page.locator("[data-topic-band]").textContent(), /Category · Image/);
  await page.getByRole("navigation", { name: "Subcategories" }).getByRole("link", { name: "All" }).waitFor();
}, { lang: "en" });

await scenario("9. masaüstü: bant yan yana, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/tags/local?tag=karakter-tasarimi`);
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "9-tag-desktop");
}, { viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
