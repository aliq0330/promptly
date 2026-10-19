// Odak Akışı (docs/history/199-*): Ana Sayfa'nın üçüncü görünümü — Kart ↔ Akış geçişi, konum korunması, tür başına slayt,
// gerçek beğeni/kaydet/yorum/paylaş/kopyala bileşenleri, sayfalama, klavye, misafir, mobil/İngilizce/koyu tema (ağ taklitli).
// Gerçek Supabase'e KARŞI DENENMEDİ: `feed_page` + içerik satırları burada taklit edilir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4181/promptly";
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COLORS = [["#6d5bd0", "#f2b8e8"], ["#1b2a49", "#e86a3c"], ["#2a6f6a", "#e9d8a6"], ["#7a3e2e", "#f2d6b3"], ["#203a43", "#2c5364"]];

/** 22 posts: image prompts, a text prompt (no media), a workflow (no cover), a preset (no cover), a request (no media). */
function buildFeed() {
  const prompts = [];
  for (let n = 1; n <= 19; n += 1) {
    const text = n === 2;
    const [a, b] = COLORS[n % COLORS.length];
    prompts.push({
      id: pid(n), title: text ? "Kısa öykü açılışı" : `Görsel prompt ${n}`, description: `Açıklama ${n}`,
      prompt_text: text ? "Bir deniz fenerinde yalnız yaşayan bekçinin {mevsim} gecesi gördüğü ışığı anlatan, 200 kelimelik bir açılış paragrafı yaz." : `cinematic misty landscape number ${n}, volumetric light, {style}`,
      tool: null, tools: ["midjourney"], content_type: text ? "text" : "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
      like_count: 10 + n, save_count: 1, comment_count: n, copy_count: 3, created_at: `2026-10-${String(30 - n).padStart(2, "0")}T10:00:00Z`, show_on_profile: true,
      requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.carol),
      prompt_media: text ? [] : [{ id: `m${n}`, url: svg(a, b), width: 1200, height: 900, alt: "", position: 0 }], prompt_tags: [],
    });
  }
  const workflow = { id: pid(101), creator_id: U.carol.id, title: "Ürün fotoğrafından kampanya görseli", description: "Üç adımlı akış.", cover_url: null, content_types: ["image", "text"], category: null, subcategory: null, tools: [], status: "published", visibility: "public", community_id: null, like_count: 9, save_count: 2, comment_count: 4, created_at: "2026-10-05T10:00:00Z", updated_at: "2026-10-05T10:00:00Z", profiles: author(U.carol), workflow_steps: [{ count: 3 }], workflow_tags: [], workflow_media: [] };
  const preset = { id: pid(201), creator_id: U.carol.id, title: "Sinematik portre ayarı", description: "Yumuşak ışık için hazır parametre seti.", cover_url: null, content_type: "image", category: null, subcategory: null, tools: [], selection: {}, status: "published", visibility: "public", community_id: null, like_count: 6, comment_count: 4, save_count: 1, created_at: "2026-10-04T10:00:00Z", updated_at: "2026-10-04T10:00:00Z", profiles: author(U.carol), preset_tags: [] };
  const request = { id: pid(301), title: "Retro-fütüristik sokak posteri", description: "Neon harfli bir şehir posteri istiyorum.", creative_direction: "Blade Runner estetiği, mor-turuncu tonlar.", preferred_tool: null, tools: [], content_type: "image", category: null, subcategory: null, reference_image_url: null, reference_image_width: null, reference_image_height: null, status: "open", selected_response_prompt_id: null, response_count: 2, like_count: 5, comment_count: 4, created_at: "2026-10-03T10:00:00Z", deleted_at: null, is_draft: false, visibility: "public", community_id: null, profiles: author(U.carol), prompt_request_tags: [], prompt_request_media: [] };
  // Feed order: prompt 1, text prompt 2, workflow, preset, request, then prompts 3…19.
  const order = [["prompt", prompts[0]], ["prompt", prompts[1]], ["workflow", workflow], ["preset", preset], ["request", request], ...prompts.slice(2).map((p) => ["prompt", p])];
  return { prompts, workflow, preset, request, order };
}

async function installFeed(context, db, feed) {
  db.feedCalls = [];
  const tables = { prompts: feed.prompts, workflows: [feed.workflow], presets: [feed.preset], prompt_requests: [feed.request] };
  await context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.replace("/rest/v1/", "");
    const ok = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (table === "rpc/feed_page") {
      const body = JSON.parse(req.postData() || "{}");
      db.feedCalls.push(body);
      const rows = feed.order.map(([kind, row]) => ({ kind, id: row.id, created_at: row.created_at, sort_rank: 0 }));
      const start = body.p_after_id ? rows.findIndex((r) => r.id === body.p_after_id) + 1 : 0;
      return ok(rows.slice(start, start + body.p_limit));
    }
    if (req.method() === "GET" && tables[table] && (url.searchParams.get("id") ?? "").startsWith("in.")) {
      const ids = url.searchParams.get("id").slice(4, -1).split(",").map((s) => s.replace(/"/g, ""));
      return ok(tables[table].filter((row) => ids.includes(row.id)));
    }
    if (table === "prompt_likes" && req.method() === "POST") {
      db.calls.push({ method: "POST", table, body: JSON.parse(req.postData() || "{}") });
      return db.failLike ? ok({ code: "XX000", message: "boom" }, 500) : route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    return route.fallback();
  });
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, theme, reducedMotion, viewMode } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const feed = buildFeed();
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference", permissions: ["clipboard-read", "clipboard-write"] });
  await installMock(context, db, { guest });
  await installFeed(context, db, feed);
  await context.addInitScript(([l, th, vm]) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
      if (th) localStorage.setItem("promptly-theme", th);
      if (vm) localStorage.setItem("promptly-view-mode", vm);
    } catch {}
  }, [lang, theme ?? null, viewMode ?? null]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, feed });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ffail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const layer = (page) => page.locator("[data-focus-feed]");
const slides = (page) => page.locator("[data-focus-feed] [data-slide-index]");
const counter = (page) => layer(page).locator("span[aria-label^='Gönderi'], span[aria-label^='Post']").first();
const openHome = async (page) => { await page.goto(`${BASE}/`); await page.locator("[data-feed-key]").first().waitFor(); await page.waitForTimeout(400); };
const openFeedDesktop = async (page) => { await page.getByRole("group", { name: "Görünüm modu" }).first().getByRole("button", { name: "Akış" }).click(); await slides(page).first().waitFor(); await page.waitForTimeout(500); };
const activeIndex = (page) => counter(page).getAttribute("aria-label").then((s) => Number(/(\d+)/.exec(s)[1]));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await scenario("1. Kart görünümü varsayılan ve değişmedi: katman yok, kartlar var, seçici Kart | Odak | Akış", async ({ page }) => {
  await openHome(page);
  assert.equal(await layer(page).count(), 0);
  assert.ok((await page.locator("[data-feed-key]").count()) >= 18, "card grid renders the first page");
  const group = page.getByRole("group", { name: "Görünüm modu" }).first();
  assert.deepEqual(await group.getByRole("button").allTextContents(), ["Kart", "Odak", "Akış"]);
  assert.equal(await group.getByRole("button", { name: "Kart" }).getAttribute("aria-pressed"), "true");
  await shot(page, "01-cards");
});

await scenario("2. Akış'a geçiş: katman header ile sidebar arasında, ?view=feed, sayaç, sayfa kilitli + inert", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  assert.match(page.url(), /[?&]view=feed/);
  const box = await layer(page).boundingBox();
  assert.equal(box.y, 64, "below the 64px header");
  assert.equal(box.x, 256, "right of the 256px sidebar");
  assert.equal(await counter(page).getAttribute("aria-label"), "Gönderi 1 / 18");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  assert.equal(await page.evaluate(() => document.getElementById("main-content").hasAttribute("inert")), true);
  assert.ok(await page.locator("aside[aria-label]").first().isVisible(), "sidebar still visible");
  // Exactly one stop per post: mandatory snap.
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [role='region']")).scrollSnapType), "y mandatory");
  await shot(page, "02-feed-desktop");
});

await scenario("3. Klavye: ↓ ↓ ↑ ve End/Home gönderiler arasında geçer; kaydırınca etkin gönderi değişir", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(900);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(900);
  assert.equal(await activeIndex(page), 3);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(900);
  assert.equal(await activeIndex(page), 2);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1200);
  assert.equal(await activeIndex(page), 3, "wheel scroll snaps to the next post");
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  assert.equal(await activeIndex(page), 1);
});

await scenario("4. Tür başına sunum: görsel → resim; metin → mono prompt bloğu; workflow → adımlar; hazır ayar; istek → durum + yaratıcı yön", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  const s = (i) => slides(page).nth(i);
  assert.ok((await s(0).locator("img").count()) === 1, "image prompt shows its picture");
  assert.equal(await s(1).locator("img").count(), 0, "text prompt has no fake image");
  assert.match(await s(1).locator(".prompt-text").textContent(), /deniz fenerinde/);
  assert.match(await s(2).textContent(), /Workflow/);
  assert.match(await s(2).textContent(), /3 adım/, "falls back to the real step count");
  assert.match(await s(3).textContent(), /Hazır Ayar/);
  assert.match(await s(4).textContent(), /Açık/);
  assert.match(await s(4).textContent(), /Blade Runner estetiği/);
  assert.equal(await s(4).getByRole("button", { name: /Kaydet|koleksiyon/i }).count(), 0, "a request has no save, as everywhere");
  assert.match(await s(4).locator("a[href*='#request-responses']").getAttribute("href"), /requests\/local/);
  if (SHOTS) for (const name of ["04b-text", "04c-workflow", "04d-preset", "04e-request"]) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(900); await shot(page, name); }
  // Only the active slide and its neighbours mount pictures.
  assert.equal(await slides(page).nth(10).locator("img").count(), 0, "far slide does not load its picture");
});

await scenario("5. Beğeni: gerçek prompt_likes isteği, sayaç artar; hata olursa geri alınır", async ({ page, db }) => {
  await openHome(page);
  await openFeedDesktop(page);
  const like = slides(page).nth(0).getByRole("button", { name: /Beğen/ });
  assert.match(await like.textContent(), /11/);
  await like.click();
  await page.waitForTimeout(500);
  assert.ok(db.calls.some((c) => c.table === "prompt_likes" && c.body.prompt_id === pid(1)), "like persisted through likeContent");
  assert.match(await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).textContent(), /12/);
  db.failLike = true;
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(900);
  await slides(page).nth(1).getByRole("button", { name: /Beğen/ }).click();
  await page.waitForTimeout(700);
  assert.match(await slides(page).nth(1).getByRole("button", { name: /Beğen/ }).textContent(), /12/, "rolled back to 12 after the failed request");
});

await scenario("6. Kaydet → koleksiyon penceresi, Paylaş → paylaşım penceresi (Esc pencereyi kapatır, akışı değil), Yorum → #comments", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  const s0 = slides(page).nth(0);
  await s0.getByRole("button", { name: /Kaydet|koleksiyon/i }).click();
  await page.locator("[aria-modal='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[aria-modal='true']").count(), 0);
  assert.equal(await layer(page).count(), 1, "Escape closed the dialog only");
  await s0.getByRole("button", { name: "Paylaş" }).click();
  await page.locator("[aria-modal='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.match(await s0.getByRole("link", { name: /Yorumlar/ }).getAttribute("href"), new RegExp(`prompts/local/?\\?id=${pid(1)}#comments`));
});

await scenario("7. Promptu incele: tam metin + Kopyala (kullanım sayılır) + ayrıntı bağlantısı", async ({ page, db }) => {
  await openHome(page);
  await openFeedDesktop(page);
  await slides(page).nth(0).getByRole("button", { name: "Promptu incele" }).click();
  const dialog = page.locator("[aria-modal='true']");
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /cinematic misty landscape number 1/);
  await dialog.getByRole("button", { name: "Kopyala" }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "cinematic misty landscape number 1, volumetric light, {style}");
  assert.ok(db.calls.some((c) => c.table === "rpc/record_prompt_copy"), "copy counted via record_prompt_copy");
  assert.match(await dialog.getByRole("link", { name: "Ayrıntıları aç" }).getAttribute("href"), /prompts\/local/);
});

await scenario("8. Sayfalama: sona yaklaşınca aynı feed_page imleciyle sonraki sayfa; sonda 'Hepsini gördün'", async ({ page, db }) => {
  await openHome(page);
  await openFeedDesktop(page);
  assert.equal(db.feedCalls.length, 1);
  await page.keyboard.press("End");
  await page.waitForTimeout(1500);
  assert.equal(db.feedCalls.length, 2, "second page requested");
  assert.ok(db.feedCalls[1].p_after_id, "with the keyset cursor");
  await page.waitForTimeout(600);
  assert.equal(await slides(page).count(), 23, "22 posts + the end slide");
  await page.keyboard.press("End");
  await page.waitForTimeout(1500);
  await layer(page).getByText("Hepsini gördün").waitFor();
});

await scenario("9. Esc → kartlar; ?view kalkar; açık olan gönderinin kartı görünür", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  for (let i = 0; i < 7; i += 1) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(450); }
  await page.waitForTimeout(800);
  const index = await activeIndex(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  assert.equal(await layer(page).count(), 0);
  assert.doesNotMatch(page.url(), /view=/);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await page.evaluate(() => document.getElementById("main-content").hasAttribute("inert")), false);
  const key = await page.evaluate((i) => document.querySelectorAll("[data-feed-key]")[i - 1].dataset.feedKey, index);
  const top = await page.evaluate((k) => document.querySelector(`[data-feed-key="${k}"]`).getBoundingClientRect().top, key);
  assert.ok(top > 40 && top < 200, `card of the open post is at the top (${top})`);
});

await scenario("10. Kartlardan Akış'a: kaydırılmış listede görünen kartın gönderisinden açılır", async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => { const el = document.querySelectorAll("[data-feed-key]")[8]; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); });
  await page.waitForTimeout(500);
  const firstVisible = await page.evaluate(() => [...document.querySelectorAll("[data-feed-key]")].findIndex((el) => { const r = el.getBoundingClientRect(); return r.bottom > 96 && r.top < innerHeight; }));
  assert.ok(firstVisible >= 6, `list is scrolled (${firstVisible})`);
  // DOM click: Playwright would scroll the toolbar back into view first (and with it the list to its top).
  await page.evaluate(() => document.querySelector("[role='group'][aria-label='Görünüm modu'] button[aria-label='Akış']").click());
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await activeIndex(page), firstVisible + 1);
});

await scenario("11. Tercih saklanır: yeniden yüklemede Akış açılır; Akış'ı olmayan liste kart gösterir ve seçicide Akış yoktur", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  await page.reload();
  await slides(page).first().waitFor();
  await page.goto(`${BASE}/prompts`);
  await page.waitForTimeout(1500);
  assert.equal(await layer(page).count(), 0, "/prompts never opens the layer");
  const group = page.getByRole("group", { name: "Görünüm modu" }).first();
  assert.deepEqual(await group.getByRole("button").allTextContents(), ["Kart", "Odak"]);
  assert.equal(await group.getByRole("button", { name: "Kart" }).getAttribute("aria-pressed"), "true");
});

await scenario("12. Misafir: beğeni ortak giriş penceresini açar, istek gönderilmez", async ({ page, db }) => {
  await openHome(page);
  await openFeedDesktop(page);
  await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).click();
  await page.locator("[aria-modal='true']").waitFor();
  assert.equal(db.calls.filter((c) => c.table === "prompt_likes").length, 0);
}, { guest: true });

await scenario("13. Telefon 390px: katman üst bar ile alt menü arasında, Akış düğmesi, yatay taşma yok", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Odak Akışı'nı aç" }).first().click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  const box = await layer(page).boundingBox();
  const nav = await page.locator("nav[data-app-chrome], nav.fixed").last().boundingBox();
  assert.equal(box.y, 64);
  assert.ok(box.y + box.height <= nav.y + 1, `layer ends above the bottom nav (${box.y + box.height} ≤ ${nav.y})`);
  assert.equal(box.width, 390);
  assert.equal(await page.evaluate(() => document.querySelector("[data-focus-feed] [role='region']").scrollWidth <= 390), true, "no sideways overflow");
  const rail = await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).boundingBox();
  assert.ok(rail.x + rail.width <= 390, "rail fits");
  await shot(page, "13-feed-phone");
  await layer(page).getByRole("button", { name: "Kart görünümüne geç" }).click();
  await page.waitForTimeout(400);
  assert.equal(await layer(page).count(), 0);
}, { viewport: { width: 390, height: 844 } });

await scenario("14. İngilizce: etiketler çevrilmiş", async ({ page }) => {
  await openHome(page);
  await page.getByRole("group", { name: "View mode" }).first().getByRole("button", { name: "Feed" }).click();
  await slides(page).first().waitFor();
  assert.equal(await counter(page).getAttribute("aria-label"), "Post 1 of 18");
  assert.ok(await slides(page).nth(0).getByRole("button", { name: "View prompt" }).isVisible());
  assert.ok(await slides(page).nth(0).getByRole("link", { name: "Open details" }).isVisible());
  await shot(page, "14-feed-en");
}, { lang: "en" });

await scenario("15. Koyu tema + hareket azaltma: katman açılır, geçişler kapalı", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [data-slide-index] img")).transitionDuration);
  assert.ok(parseFloat(duration) < 0.01, `no transition (${duration})`);
  await shot(page, "15-feed-dark");
}, { theme: "dark", reducedMotion: true });

await scenario("16. Tablet 820px: katman ikon rayının sağında, seçici bar'da", async ({ page }) => {
  await openHome(page);
  await openFeedDesktop(page);
  const box = await layer(page).boundingBox();
  assert.equal(box.x, 72);
  await shot(page, "16-feed-tablet");
}, { viewport: { width: 820, height: 1100 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
