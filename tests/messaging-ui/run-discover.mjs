// Keşfet'in editoryal açılışı (docs/history/451-*; 210/220/227'deki sıkı üstün yerini aldı): görünür başlık + bu haftanın sayıları, gündemdeki
// konular, popüler (haftanın promptu), metin/ses/video, workflow + açık istek, yaratıcılar, yükselen araçlar, Spaces; altında "Tüm paylaşımlar".
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — sayılar/sıralar sunucudan gelir (discover_*, feed_page).
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
const SHOTS = process.env.SHOTS ?? "";

const author = (u, followers = 3) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: followers, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"], ["#3a5a40", "#a3b18a"], ["#5e548e", "#e0b1cb"]];
const CATS = ["photography", "photography", "art_illustration", "product_commercial", "photography", "art_illustration", null, "writing"];
const pid = (i) => `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
function promptRow(i) {
  const [a, b] = COLORS[i % COLORS.length];
  const category = CATS[(i - 1) % CATS.length];
  const text = category === "writing";
  return {
    id: pid(i), title: text ? `Metin prompt ${i}` : `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}, soft light, 85mm, shallow depth of field`, tool: null, tools: [],
    content_type: text ? "text" : "image", category, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 40 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i % 2 ? U.bob : U.carol),
    prompt_media: text ? [] : [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}
const TAG_STATS = (slug, label, n) => ({ slug, label, prompt_usage_count: n, request_usage_count: 0, usage_count: n, created_at: "2026-01-01T00:00:00Z" });

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", trending = true, count = 16 } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1));
  const state = { feedCalls: [] };
  db.rpc.feed_page = (body) => {
    state.feedCalls.push(body);
    const list = rows.filter((r) => (!body.p_category || r.category === body.p_category) && (!body.p_content_type || r.content_type === body.p_content_type));
    return { body: list.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: r.like_count })) };
  };
  db.rpc.discover_weekly_stats = () => ({ body: { prompts: 124, workflows: 18, skills: 6, requests: 9 } });
  db.rpc.discover_trending_topics = () => ({
    body: trending
      ? [{ slug: "sinematik", label: "sinematik", recent_count: 12, previous_count: 4, cover_prompt_id: pid(1) }, { slug: "izometrik", label: "izometrik", recent_count: 7, previous_count: 0, cover_prompt_id: pid(2) }]
      : [],
  });
  db.rpc.discover_rising_tools = () => ({ body: [{ tool_id: "midjourney", total: 42, weeks: [1, 2, 3, 3, 5, 6, 8, 14], growth: 75, sample_ids: [pid(3), pid(4)] }] });
  db.rpc.feed_page_proven = () => ({ body: [{ kind: "prompt", id: pid(5), created_at: rows[4].created_at, sort_rank: 900 }] });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  // Kayıtlar mock'tan SONRA bağlanır: önce bunlar cevaplar.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : [...rows].sort((x, y) => y.like_count - x.like_count);
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([TAG_STATS("portre", "portre", 30), TAG_STATS("logo", "logo", 20)]) }),
  );
  await context.route(/\/rest\/v1\/profiles\?.*order=follower_count/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([author(U.bob, 320), author(U.carol, 210)]) }),
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/dc-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name, fullPage = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }); };

const firstFeedCard = "main [data-discover-all] article:has(a[data-card-link])";

await scenario("0. telefon: görünür başlık + haftanın sayıları; editoryal bölümler sırayla; altında Tüm paylaşımlar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  const h1 = page.getByRole("heading", { level: 1, name: "Keşfet" });
  await page.getByText("Bu hafta 124 yeni prompt, 18 workflow ve 6 Skill paylaşıldı.").waitFor();
  await page.locator("[data-discover-editorial]").waitFor();
  assert.equal(await page.locator("[data-discover-editorial-loading]").count(), 0, "iskelet gitti");
  const h1Box = await h1.boundingBox();
  assert.ok((h1Box?.width ?? 0) > 40, "başlık görünür (sr-only değil)");
  const order = ["Gündemdeki konular", "Popüler promptlar", "Takip edebileceğin yaratıcılar", "Yükselen araçlar", "Tüm paylaşımlar"];
  const ys = [];
  for (const name of order) {
    const box = await page.getByRole("heading", { level: 2, name, exact: true }).first().boundingBox();
    assert.ok(box, `başlık var: ${name}`);
    ys.push(box.y);
  }
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], `sıra ${order.join(" < ")}: ${ys.map(Math.round).join(" < ")}`);
  // Büyüme gerçek sayılardan: 12 vs 4 → +200%, önceki hafta 0 → "Yeni".
  const topics = page.locator("section[aria-label='Gündemdeki konular']");
  assert.match(await topics.textContent(), /#sinematik.*\+%200/s);
  assert.match(await topics.textContent(), /#izometrik.*yeni/s);
  // Haftanın promptu: Kanıtlanmış ilk sıradaki.
  assert.match(await page.locator("section[aria-label='Popüler promptlar']").textContent(), /Haftanın promptu.*Görsel prompt 5/s);
  await page.locator(firstFeedCard).first().waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "0-phone", true);
});

await scenario("1. süzgeç/bölüm seçilince editoryal kalkar, yalnız liste kalır", async ({ page }) => {
  await page.goto(`${BASE}/discover?section=prompts`);
  await page.locator(firstFeedCard).first().waitFor();
  assert.equal(await page.locator("[data-discover-editorial]").count(), 0, "Promptlar bölümünde editoryal yok");
  assert.equal(await page.getByRole("heading", { level: 2, name: "Tüm paylaşımlar" }).count(), 0);
});

await scenario("2. konu kartı etiket sayfasını, araç kartı araç sayfasını açar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  const topic = page.locator("section[aria-label='Gündemdeki konular'] a[href*='tag=']").first();
  await topic.waitFor();
  assert.match(await topic.getAttribute("href"), /\/tags\/local\/?\?tag=sinematik/);
  const tool = page.locator("section[aria-label='Yükselen araçlar'] a[href*='id=']").first();
  assert.match(await tool.getAttribute("href"), /\/tools\/local\/?\?id=midjourney/);
  assert.match(await tool.textContent(), /\+%75/);
});

await scenario("3. trend boşken konu bölümü hiç çizilmez (yer tutucu yok)", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("[data-discover-editorial]").waitFor();
  assert.equal(await page.locator("section[aria-label='Gündemdeki konular']").count(), 0);
}, { trending: false });

await scenario("4. Geri'de editoryal yeniden yüklenmez (3 dk önbellek)", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  const topic = page.locator("section[aria-label='Gündemdeki konular'] a[href*='tag=']").first();
  await topic.waitFor();
  await topic.click();
  await page.waitForURL(/\/tags\/local/);
  await page.goBack();
  await page.waitForURL(/\/discover/);
  assert.equal(await page.locator("[data-discover-editorial-loading]").count(), 0, "geri dönüşte iskelet yok");
  await page.locator("[data-discover-editorial]").waitFor({ timeout: 800 });
});

await scenario("5. İngilizce: başlık, sayı cümlesi ve bölüm adları çevrili", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.getByRole("heading", { level: 1, name: "Discover" }).waitFor();
  await page.getByText("This week 124 new prompts, 18 workflows and 6 Skills were shared.").waitFor();
  await page.getByRole("heading", { level: 2, name: "Trending topics" }).waitFor();
  await page.getByRole("heading", { level: 2, name: "All posts" }).waitFor();
}, { lang: "en" });

await scenario("6. masaüstü: taşma yok; Yükselen sırası menüde", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator(firstFeedCard).first().waitFor();
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return true;
      return false;
    };
    return [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1 && !clipped(el)).slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 90)}`);
  });
  assert.ok(await overflowFree(page), `yatay taşma yok ${wide.join(" | ")}`);
  await shot(page, "6-desktop", true);
}, { viewport: { width: 1280, height: 900 } });

await scenario("7. masaüstü: yan menü 9 giriş (Promptlar/Workflow'lar/Ayar Paketleri/İstekler/Etiketler/Odak/Profil yok), Odak üst çubukta", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator(firstFeedCard).first().waitFor();
  const nav = page.locator("aside[aria-label]:visible nav");
  assert.deepEqual(
    (await nav.getByRole("link").allTextContents()).map((x) => x.trim()),
    // Ekipler (docs/history/350-*) ve Yaratıcı paneli (294-*) sonradan eklendi; Profil «Sen» menüsüne taşındı (387-*).
    ["Ana Sayfa", "Keşfet", "Topluluklar", "Spaces", "Ekipler", "Studio", "Kaydedilenler", "Takip ettiğim kişiler", "Yaratıcı paneli"],
  );
  assert.equal(await nav.locator("a[aria-current='page']").textContent(), "Keşfet");
  assert.equal(await page.locator("header[data-app-header] a[href*='/focus']").count(), 1, "Odak üst çubukta");
}, { viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
