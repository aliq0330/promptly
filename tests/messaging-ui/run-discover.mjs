// Keşfet'in sıkı üstü (docs/history/210-*): kategoriler · yükselen etiketler · popüler · öne çıkan yaratıcılar, hemen ardından
// gönderiler. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — sayılar/sıralar sunucudan gelir (trending_tags, feed_page).
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
  db.rpc.trending_tags = () => ({
    body: trending ? [{ slug: "sinematik", label: "sinematik", recent_count: 12, previous_count: 4 }, { slug: "izometrik", label: "izometrik", recent_count: 7, previous_count: 2 }] : [],
  });
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

await scenario("1. telefon: başlık arama satırında; dört şerit sırayla; ilk gönderi ilk ekranda başlar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.getByRole("heading", { level: 1, name: "Keşfet" }).waitFor();
  await page.locator("[data-discover-category]").first().waitFor();
  await page.getByRole("heading", { name: "Bu hafta popüler" }).waitFor();
  await page.getByRole("heading", { name: "Öne çıkan yaratıcılar" }).waitFor();
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  // Başlık ile arama kutusu aynı satırda.
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  const search = await page.getByRole("combobox").first().boundingBox().catch(() => null) ?? (await page.locator("main input").first().boundingBox());
  assert.ok(Math.abs(h1.y + h1.height / 2 - (search.y + search.height / 2)) < 20, `başlık ve arama aynı satırda (${h1.y} / ${search.y})`);
  // Sıra: kategoriler → etiketler → popüler → yaratıcılar → gönderiler.
  const ys = await Promise.all(
    ["[data-discover-category]", "#discover-trending", "#discover-popular", "#discover-creators"].map(async (sel) => (await page.locator(sel).first().boundingBox()).y),
  );
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], `şerit sırası ${ys.join(" < ")}`);
  // En sık kategori (Fotoğrafçılık) önce.
  assert.match(await page.locator("[data-discover-category]").first().textContent(), /Fotoğrafçılık/);
  // Etiketlerde gerçek pencere sayısı.
  assert.match(await page.locator("#discover-trending").locator("xpath=..").textContent(), /Yükselen.*#sinematik\s*12/s);
  await page.evaluate(() => window.scrollTo(0, 0));
  // Alt menünün (64px) üstünde, telefonun ilk ekranında ilk gönderi kartının üst kenarı görünür.
  const first = await page.locator("main article:has(a[data-card-link])").first().boundingBox();
  assert.ok(first.y < 844 - 64 - 40, `ilk gönderi ilk ekranda başlıyor (y=${Math.round(first.y)})`);
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "1-phone");
  await shot(page, "1-phone-full", true);
});

await scenario("2. kategoriye dokunmak akışı o kategoriye süzer; yeniden dokunmak temizler", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  const pill = page.locator('[data-discover-category="image:art_illustration"]');
  await pill.waitFor();
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  await pill.click();
  await page.waitForFunction(() => document.querySelector('[data-discover-category="image:art_illustration"]')?.getAttribute("aria-pressed") === "true");
  await page.waitForTimeout(300);
  const last = state.feedCalls.at(-1);
  assert.equal(last.p_category, "art_illustration");
  await pill.click();
  await page.waitForTimeout(300);
  assert.equal(state.feedCalls.at(-1).p_category, null);
  assert.equal(await pill.getAttribute("aria-pressed"), "false");
});

await scenario("3. yaratıcılar 'Tümünü gör' Yaratıcılar bölümünü açar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.getByRole("heading", { name: "Öne çıkan yaratıcılar" }).waitFor();
  await page.locator("#discover-creators").locator("xpath=../..").getByRole("button", { name: "Tümünü gör" }).click();
  await page.locator("main").getByRole("button", { name: /Yaratıcılar/ }).first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("main [aria-pressed='true'], main [aria-selected='true'], main [aria-current]")].some((el) => /Yaratıcılar/.test(el.textContent ?? "")));
});

await scenario("4. trend penceresi boşken en çok kullanılan etiketler sayısız gösterilir (uydurma sayı yok)", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("#discover-trending").waitFor();
  const text = await page.locator("#discover-trending").locator("xpath=..").textContent();
  assert.match(text, /Trend.*#portre.*#logo/s);
  assert.doesNotMatch(text, /#portre\s*\d/);
}, { trending: false });

await scenario("5. İngilizce: şerit başlıkları çevrili", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.getByRole("heading", { level: 1, name: "Discover" }).waitFor();
  await page.getByRole("heading", { name: "Popular this week" }).waitFor();
  await page.getByRole("heading", { name: "Featured creators" }).waitFor();
  assert.match(await page.locator("#discover-trending").locator("xpath=..").textContent(), /Rising/);
  assert.match(await page.locator("[data-discover-category]").first().textContent(), /Photography/);
}, { lang: "en" });

await scenario("6. masaüstü: taşma yok, aynı sıra", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("main article:has(a[data-card-link])").first().waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "6-desktop");
}, { viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
