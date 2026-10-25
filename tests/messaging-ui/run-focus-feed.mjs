// Odak (`/focus`, docs/history/199-*): tam ekran, dikey, tek gönderi/ekran — Ana Sayfa'da Akış seçeneği YOK (Kart | Izgara),
// üst çubuktaki (md+) ve telefonda alt menüdeki Odak girişi, üst/alt/yan menünün gizlenmesi, tür başına slayt, video/ses oynatma (yazarın
// yüklediği çıktı), Medya süzgeci, gerçek beğeni/kaydet/yorum/paylaş/kopyala, sayfalama, klavye, kapatma, misafir, mobil/İngilizce/açık tema.
// Gerçek Supabase'e KARŞI DENENMEDİ: `feed_page`, içerik ve `prompt_results` satırları burada taklit edilir; medya oynatma
// `HTMLMediaElement.play/pause` taslağıyla sınanır (gerçek video/ses çözülmez).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const BASE = "http://localhost:4181/promptly";
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COLORS = [["#6d5bd0", "#f2b8e8"], ["#1b2a49", "#e86a3c"], ["#2a6f6a", "#e9d8a6"], ["#7a3e2e", "#f2d6b3"], ["#203a43", "#2c5364"]];
const base = { tool: null, tools: ["midjourney"], category: null, subcategory: null, status: "published", origin_type: "original", request_id: null, save_count: 1, copy_count: 3, show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.carol), prompt_tags: [] };

/** 24 posts: image prompts, a text prompt, a workflow / preset / request without pictures, a video prompt (poster + output), an audio prompt (output only). */
function buildFeed() {
  const prompts = [];
  for (let n = 1; n <= 19; n += 1) {
    const text = n === 2;
    const [a, b] = COLORS[n % COLORS.length];
    prompts.push({
      ...base, id: pid(n), title: text ? "Kısa öykü açılışı" : `Görsel prompt ${n}`, description: `Açıklama ${n}`,
      prompt_text: text ? "Bir deniz fenerinde yalnız yaşayan bekçinin {mevsim} gecesi gördüğü ışığı anlatan, 200 kelimelik bir açılış paragrafı yaz." : `cinematic misty landscape number ${n}, volumetric light, {style}`,
      content_type: text ? "text" : "image", like_count: 10 + n, comment_count: n, created_at: `2026-10-${String(30 - n).padStart(2, "0")}T10:00:00Z`,
      prompt_media: text ? [] : [{ id: `m${n}`, url: svg(a, b), width: 1200, height: 900, alt: "", position: 0 }],
    });
  }
  const video = { ...base, id: pid(51), title: "Neon şehirde drone çekimi", description: "Gece, yağmur, neon.", prompt_text: "slow drone shot over a neon city at night, rain", content_type: "video", like_count: 4, comment_count: 1, created_at: "2026-10-02T10:00:00Z", prompt_media: [{ id: "mv", url: svg("#111827", "#7c3aed", 900, 1600), width: 900, height: 1600, alt: "", position: 0 }] };
  const audio = { ...base, id: pid(52), title: "Lo-fi yağmur döngüsü", description: "Sakin bir döngü.", prompt_text: "lo-fi beat with rain ambience, 80 bpm", content_type: "audio", like_count: 2, comment_count: 0, created_at: "2026-10-01T10:00:00Z", prompt_media: [] };
  prompts.push(video, audio);
  const workflow = { id: pid(101), creator_id: U.carol.id, title: "Ürün fotoğrafından kampanya görseli", description: "Üç adımlı akış.", cover_url: null, content_types: ["image", "text"], category: null, subcategory: null, tools: [], status: "published", visibility: "public", community_id: null, like_count: 9, save_count: 2, comment_count: 4, created_at: "2026-10-05T10:00:00Z", updated_at: "2026-10-05T10:00:00Z", profiles: author(U.carol), workflow_steps: [{ count: 3 }], workflow_tags: [], workflow_media: [] };
  const preset = { id: pid(201), creator_id: U.carol.id, title: "Sinematik portre ayarı", description: "Yumuşak ışık için hazır parametre seti.", cover_url: null, content_type: "image", category: null, subcategory: null, tools: [], selection: {}, status: "published", visibility: "public", community_id: null, like_count: 6, comment_count: 4, save_count: 1, created_at: "2026-10-04T10:00:00Z", updated_at: "2026-10-04T10:00:00Z", profiles: author(U.carol), preset_tags: [] };
  const request = { id: pid(301), title: "Retro-fütüristik sokak posteri", description: "Neon harfli bir şehir posteri istiyorum.", creative_direction: "Blade Runner estetiği, mor-turuncu tonlar.", preferred_tool: null, tools: [], content_type: "image", category: null, subcategory: null, reference_image_url: null, reference_image_width: null, reference_image_height: null, status: "open", selected_response_prompt_id: null, response_count: 2, like_count: 5, comment_count: 4, created_at: "2026-10-03T10:00:00Z", deleted_at: null, is_draft: false, visibility: "public", community_id: null, profiles: author(U.carol), prompt_request_tags: [], prompt_request_media: [] };
  // Order: prompt 1, text prompt 2, workflow, preset, request, video, audio, then prompts 3…19.
  const order = [["prompt", prompts[0]], ["prompt", prompts[1]], ["workflow", workflow], ["preset", preset], ["request", request], ["prompt", video], ["prompt", audio], ...prompts.slice(2, 19).map((p) => ["prompt", p])];
  const outputs = {
    [video.id]: { id: "r-video", prompt_id: video.id, media_type: "video", media_url: "https://example.com/out/neon.mp4", thumbnail_url: null, width: null, height: null, text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-10-02T11:00:00Z", profiles: author(U.carol), prompts: null },
    [audio.id]: { id: "r-audio", prompt_id: audio.id, media_type: "audio", media_url: "https://example.com/out/rain.mp3", thumbnail_url: null, width: null, height: null, text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-10-01T11:00:00Z", profiles: author(U.carol), prompts: null },
  };
  return { prompts, workflow, preset, request, video, audio, order, outputs };
}

/** Comments on prompt 1: three top-level, the second with two replies (Instagram-like thread in the sheet). */
function seedFocusComments(db) {
  const c = (id, who, body, minutes, extra = {}) => ({ id, prompt_id: pid(1), author: who, body, like_count: 0, created_at: `2026-10-18T10:${String(minutes).padStart(2, "0")}:00Z`, ...extra });
  db.focusComments = [
    c("c0000000-0000-4000-8000-000000000001", U.bob, "Yapay zeka ile yapılmış kesin", 1, { like_count: 535 }),
    c("c0000000-0000-4000-8000-000000000002", U.dave, "Işık harika olmuş", 2, { like_count: 44 }),
    c("c0000000-0000-4000-8000-000000000003", U.carol, "Teşekkürler!", 3, { parent_id: "c0000000-0000-4000-8000-000000000002" }),
    c("c0000000-0000-4000-8000-000000000004", U.bob, "Katılıyorum", 4, { parent_id: "c0000000-0000-4000-8000-000000000002" }),
    c("c0000000-0000-4000-8000-000000000005", U.amy ?? U.bob, "Promptu denedim, çok iyi çıktı", 5),
  ];
}

async function installFeed(context, db, feed) {
  db.feedCalls = [];
  seedFocusComments(db);
  const tables = { prompts: feed.prompts, workflows: [feed.workflow], presets: [feed.preset], prompt_requests: [feed.request] };
  await context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.replace("/rest/v1/", "");
    const object = (req.headers().accept ?? "").includes("vnd.pgrst.object");
    const ok = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/1" }, body: JSON.stringify(body) });
    if (table === "rpc/feed_page") {
      const body = JSON.parse(req.postData() || "{}");
      db.feedCalls.push(body);
      const rows = feed.order.map(([kind, row]) => ({ kind, id: row.id, created_at: row.created_at, sort_rank: 0 }));
      const start = body.p_after_id ? rows.findIndex((r) => r.id === body.p_after_id) + 1 : 0;
      return ok(rows.slice(start, start + body.p_limit));
    }
    // Ana Sayfa'nın oturumlu varsayılanı "Sana özel" (docs/history/209-*): aynı içerik, nedensiz (popüler) — Odak'ın `feedCalls` sayımına girmez.
    if (table === "rpc/for_you_page") {
      const body = JSON.parse(req.postData() || "{}");
      const rows = feed.order.map(([kind, row], i) => ({ kind, id: row.id, created_at: row.created_at, sort_rank: 1000 - i, reason_kind: "popular", reason_ref: null }));
      const start = body.p_after_id ? rows.findIndex((r) => r.id === body.p_after_id) + 1 : 0;
      return ok(rows.slice(start, start + body.p_limit));
    }
    if (req.method() === "GET" && tables[table] && (url.searchParams.get("id") ?? "").startsWith("in.")) {
      const ids = url.searchParams.get("id").slice(4, -1).split(",").map((s) => s.replace(/"/g, ""));
      return ok(tables[table].filter((row) => ids.includes(row.id)));
    }
    if (table === "prompt_results" && req.method() === "GET") {
      const byPrompt = (url.searchParams.get("prompt_id") ?? "").replace("eq.", "");
      const byId = (url.searchParams.get("id") ?? "").replace("eq.", "");
      db.calls.push({ method: "GET", table, body: { byPrompt, byId } });
      if (byPrompt) return ok(feed.outputs[byPrompt] ? [feed.outputs[byPrompt]] : []);
      const row = Object.values(feed.outputs).find((r) => r.id === byId);
      return object ? (row ? ok(row) : ok(null)) : ok(row ? [row] : []);
    }
    if (table === "prompt_comments") {
      const cols = (c) => ({ id: c.id, body: c.body, parent_id: c.parent_id ?? null, like_count: c.like_count ?? 0, created_at: c.created_at, edited_at: null, deleted_at: null, profiles: author(c.author) });
      if (req.method() === "GET") {
        const pidEq = (url.searchParams.get("prompt_id") ?? "").replace("eq.", "");
        return ok(db.focusComments.filter((c) => c.prompt_id === pidEq).map(cols));
      }
      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        db.calls.push({ method: "POST", table, body });
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), author: U.alice ?? U.bob, ...body };
        db.focusComments.push(row);
        return ok(object ? cols(row) : [cols(row)], 201);
      }
    }
    if (table === "comment_likes" && req.method() === "POST") {
      db.calls.push({ method: "POST", table, body: JSON.parse(req.postData() || "{}") });
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    if (table === "prompt_likes" && req.method() === "POST") {
      db.calls.push({ method: "POST", table, body: JSON.parse(req.postData() || "{}") });
      return db.failLike ? ok({ code: "XX000", message: "boom" }, 500) : route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    return route.fallback();
  });
}

/** Records play()/pause() on every media element and fires the matching events (no real decoding in the test browser). */
const MEDIA_STUB = () => {
  window.__media = [];
  const proto = HTMLMediaElement.prototype;
  proto.play = function play() {
    window.__media.push({ op: "play", tag: this.tagName, muted: this.muted, src: this.currentSrc || this.getAttribute("src") });
    Object.defineProperty(this, "paused", { configurable: true, get: () => false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function pause() {
    window.__media.push({ op: "pause", tag: this.tagName, src: this.currentSrc || this.getAttribute("src") });
    Object.defineProperty(this, "paused", { configurable: true, get: () => true });
    this.dispatchEvent(new Event("pause"));
  };
};

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, theme, reducedMotion } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const feed = buildFeed();
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference", permissions: ["clipboard-read", "clipboard-write"] });
  await installMock(context, db, { guest });
  await installFeed(context, db, feed);
  await context.addInitScript(MEDIA_STUB);
  await context.addInitScript(([l, th]) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
      if (th) localStorage.setItem("promptly-theme", th);
    } catch {}
  }, [lang, theme ?? null]);
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

const stage = (page) => page.locator("[data-focus-feed]");
const slides = (page) => page.locator("[data-focus-feed] [data-slide-index]");
const counter = (page) => stage(page).locator("span[aria-label^='Gönderi'], span[aria-label^='Post']").first();
const openFocus = async (page) => { await page.goto(`${BASE}/focus`); await slides(page).first().waitFor(); await page.waitForTimeout(500); };
const activeIndex = (page) => counter(page).getAttribute("aria-label").then((s) => Number(/(\d+)/.exec(s)[1]));
const step = async (page, key = "ArrowDown", times = 1) => { for (let i = 0; i < times; i += 1) { await page.keyboard.press(key); await page.waitForTimeout(650); } await page.waitForTimeout(300); };
const media = (page) => page.evaluate(() => window.__media);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await scenario("1. Ana Sayfa değişmedi: Akış seçeneği yok, seçici Kart | Izgara; üst çubukta Odak (yan menüde yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  assert.equal(await stage(page).count(), 0);
  // Kart | Izgara tek simge düğmesidir (docs/history/237-*): kart görünümünde "Izgara'ya geç" der, listede tek tane var.
  assert.equal(await page.locator("[data-view-toggle='card']").count() >= 1, true, "Kart | Izgara simgesi sekme satırında");
  const link = page.locator("header[data-app-header] a[href*='/focus']");
  assert.equal(await link.count(), 1, "header has Odak");
  assert.equal(await page.locator("aside[aria-label] a[href*='/focus']").count(), 0, "sidebar no longer lists Odak (docs/history/227-*)");
  assert.match(await link.textContent(), /Odak/);
});

await scenario("2. Üst çubuktan Odak: tam ekran, üst/yan menü gizli, koyu sahne, sayfa kilitli, başlık", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  assert.match(page.url(), /\/focus/);
  const box = await stage(page).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1280, 900]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("header[data-app-chrome]")).visibility), "hidden");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("aside[data-app-chrome]")).visibility), "hidden");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  assert.equal(await stage(page).evaluate((el) => el.classList.contains("dark")), true);
  assert.equal(await counter(page).getAttribute("aria-label"), "Gönderi 1 / 18");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [role='region']")).scrollSnapType), "y mandatory");
  assert.match(await page.title(), /Odak/);
  await shot(page, "02-focus-desktop");
});

await scenario("3. Klavye ve tekerlek: ↓ ↓ ↑, Home; tek durak", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowDown", 2);
  assert.equal(await activeIndex(page), 3);
  await step(page, "ArrowUp");
  assert.equal(await activeIndex(page), 2);
  await page.mouse.move(640, 500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1200);
  assert.equal(await activeIndex(page), 3);
  await step(page, "Home");
  assert.equal(await activeIndex(page), 1);
});

await scenario("4. Tür başına: görsel / metin (mono blok) / workflow / hazır ayar / istek; uzak slayt medya yüklemez", async ({ page }) => {
  await openFocus(page);
  const s = (i) => slides(page).nth(i);
  assert.equal(await s(0).locator("img").count(), 1);
  assert.equal(await s(1).locator("img").count(), 0);
  assert.match(await s(1).locator(".prompt-text").textContent(), /deniz fenerinde/);
  assert.match(await s(2).textContent(), /3 adım/);
  assert.match(await s(3).textContent(), /Hazır Ayar/);
  assert.match(await s(4).textContent(), /Açık/);
  assert.match(await s(4).textContent(), /Blade Runner/);
  assert.equal(await s(4).getByRole("button", { name: /Kaydet|koleksiyon/i }).count(), 0);
  assert.equal(await s(10).locator("img").count(), 0, "far slide does not load its picture");
  if (SHOTS) for (const [i, name] of [[1, "04b-text"], [4, "04e-request"]]) { await step(page, "Home"); await step(page, "ArrowDown", i); await shot(page, name); }
});

await scenario("5. Video: yazarın çıktısı oynar (sessiz), ses açılır, geçince durur; yalnız etkin/yakın gönderi sorgulanır", async ({ page, db, feed }) => {
  await openFocus(page);
  assert.equal(db.calls.filter((c) => c.table === "prompt_results").length, 0, "no output lookup far from the video");
  await step(page, "ArrowDown", 5);
  assert.equal(await activeIndex(page), 6);
  const video = slides(page).nth(5).locator("video");
  await video.waitFor({ state: "attached" });
  assert.equal(await video.getAttribute("src"), "https://example.com/out/neon.mp4");
  const plays = (await media(page)).filter((m) => m.op === "play" && m.tag === "VIDEO");
  assert.ok(plays.length >= 1 && plays.at(-1).muted === true, `video autoplays muted: ${JSON.stringify(plays)}`);
  await stage(page).getByRole("button", { name: "Sesi aç" }).click();
  await page.waitForTimeout(300);
  assert.equal(await video.evaluate((el) => el.muted), false, "sound on");
  await shot(page, "05-video");
  await step(page, "ArrowDown");
  assert.ok((await media(page)).some((m) => m.op === "pause" && m.tag === "VIDEO"), "video paused when leaving");
  assert.ok(db.calls.some((c) => c.table === "prompt_results" && c.body.byPrompt === feed.video.id));
});

await scenario("6. Ses: sessizken kendiliğinden çalmaz; oynat düğmesi çalar ve sesi açar", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowDown", 6);
  assert.equal(await activeIndex(page), 7);
  const slide = slides(page).nth(6);
  await slide.locator("audio").waitFor({ state: "attached" });
  assert.equal((await media(page)).filter((m) => m.op === "play" && m.tag === "AUDIO").length, 0, "no silent audio autoplay");
  await slide.getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(300);
  assert.ok((await media(page)).some((m) => m.op === "play" && m.tag === "AUDIO"));
  assert.ok(await stage(page).getByRole("button", { name: "Sesi kapat" }).isVisible(), "sound switched on by the tap");
  await shot(page, "06-audio");
});

await scenario("7. Medya süzgeci: metin/workflow/hazır ayar/istek düşer, görsel + video + ses kalır", async ({ page }) => {
  await openFocus(page);
  await stage(page).getByRole("button", { name: /Medya/ }).click();
  await page.waitForTimeout(700);
  const texts = await slides(page).allTextContents();
  assert.ok(!texts.some((t) => /Kısa öykü açılışı|Ürün fotoğrafından|Sinematik portre|Retro-fütüristik/.test(t)), "structure-only posts are filtered out");
  assert.ok(texts.some((t) => /Neon şehirde drone/.test(t)) && texts.some((t) => /Lo-fi yağmur/.test(t)), "video and audio stay");
  assert.equal(await stage(page).getByRole("button", { name: /Medya/ }).getAttribute("aria-pressed"), "true");
});

await scenario("8. Beğeni gerçek istekle, hata olursa geri alınır", async ({ page, db }) => {
  await openFocus(page);
  await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).click();
  await page.waitForTimeout(500);
  assert.ok(db.calls.some((c) => c.table === "prompt_likes" && c.body.prompt_id === pid(1)));
  assert.match(await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).textContent(), /12/);
  db.failLike = true;
  await step(page);
  await slides(page).nth(1).getByRole("button", { name: /Beğen/ }).click();
  await page.waitForTimeout(700);
  assert.match(await slides(page).nth(1).getByRole("button", { name: /Beğen/ }).textContent(), /12/, "rolled back");
});

await scenario("9. Kaydet / Paylaş pencereleri (Esc yalnız pencereyi kapatır), Yorum → #comments, Promptu incele + Kopyala", async ({ page, db }) => {
  await openFocus(page);
  const s0 = slides(page).nth(0);
  await s0.getByRole("button", { name: /Kaydet|koleksiyon/i }).click();
  await page.locator("[aria-modal='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await stage(page).count(), 1, "Escape closed the dialog, not Odak");
  await s0.getByRole("button", { name: "Paylaş" }).click();
  await page.locator("[aria-modal='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await s0.getByRole("button", { name: /Yorumları aç/ }).getAttribute("aria-haspopup"), "dialog", "comments open in place (scenarios 18–23)");
  await s0.getByRole("button", { name: "Promptu incele" }).click();
  const dialog = page.locator("[aria-modal='true']");
  await dialog.getByRole("button", { name: "Kopyala" }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "cinematic misty landscape number 1, volumetric light, {style}");
  assert.ok(db.calls.some((c) => c.table === "rpc/record_prompt_copy"));
});

await scenario("10. Sayfalama: keyset imleciyle ikinci sayfa, sonda 'Hepsini gördün'", async ({ page, db }) => {
  await openFocus(page);
  await step(page, "End");
  await page.waitForTimeout(1200);
  assert.equal(db.feedCalls.length, 2);
  assert.ok(db.feedCalls[1].p_after_id);
  assert.equal(await slides(page).count(), 25, "24 posts + end slide");
  await step(page, "End");
  await page.waitForTimeout(800);
  await stage(page).getByText("Hepsini gördün").waitFor();
});

await scenario("11. Kapat (X) ve Esc: geldiği sayfaya döner, menüler ve kaydırma geri gelir", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(800);
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForURL(/\/discover/);
  await page.waitForTimeout(400);
  assert.equal(await stage(page).count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("header[data-app-chrome]")).visibility), "visible");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/discover/);
});

await scenario("12. Kapatıp yeniden açınca bu oturumda son açık gönderiden devam eder", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(400);
  await step(page, "ArrowDown", 3);
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForTimeout(800);
  assert.doesNotMatch(page.url(), /\/focus/);
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await activeIndex(page), 4, "back on the post last open");
});

await scenario("13. Misafir: beğeni giriş penceresi açar; Takip sekmesi giriş ister", async ({ page, db }) => {
  await openFocus(page);
  await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).click();
  await page.locator("[aria-modal='true']").waitFor();
  assert.equal(db.calls.filter((c) => c.table === "prompt_likes").length, 0);
  await page.keyboard.press("Escape");
  await stage(page).getByRole("tab", { name: /Takip/ }).click();
  await stage(page).getByRole("link", { name: "Giriş Yap" }).waitFor();
}, { guest: true });

await scenario("14. Telefon 390px: alt menüde Profil yerine Odak; ekranı kaplar, alt/üst menü gizli, ray ekranda", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  const nav = page.locator("nav[data-app-chrome]");
  const labels = (await nav.locator("li").allTextContents()).map((s) => s.trim());
  assert.deepEqual(labels, ["Ana Sayfa", "Keşfet", "Oluştur", "Topluluklar", "Odak"]);
  await nav.getByRole("link", { name: "Odak" }).click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(600);
  const box = await stage(page).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav[data-app-chrome]")).visibility), "hidden");
  const slide = await slides(page).nth(0).boundingBox();
  assert.deepEqual([slide.width, slide.height], [390, 844], "a post is the whole screen");
  const like = await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).boundingBox();
  assert.ok(like.x + like.width <= 390 && like.y + like.height <= 844);
  assert.equal(await page.evaluate(() => document.querySelector("[data-focus-feed] [role='region']").scrollWidth <= 390), true);
  await shot(page, "14-focus-phone");
  await step(page);
  await shot(page, "14b-focus-phone-text");
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav[data-app-chrome]")).visibility), "visible");
}, { viewport: { width: 390, height: 844 } });

await scenario("15. İngilizce", async ({ page }) => {
  await openFocus(page);
  assert.equal(await counter(page).getAttribute("aria-label"), "Post 1 of 18");
  assert.ok(await stage(page).getByRole("button", { name: "Close Focus" }).isVisible());
  assert.ok(await stage(page).getByRole("button", { name: /Media/ }).isVisible());
  assert.ok(await slides(page).nth(0).getByRole("button", { name: "View prompt" }).isVisible());
}, { lang: "en" });

await scenario("16. Açık temada da koyu sahne; hareket azaltmada geçiş yok", async ({ page }) => {
  await openFocus(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false, "site stays light");
  const lum = await stage(page).evaluate((el) => { const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number); return (r + g + b) / 3; });
  assert.ok(lum < 40, `stage is dark (${lum})`);
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [data-slide-index] img")).transitionDuration);
  assert.ok(parseFloat(duration) < 0.01, duration);
}, { theme: "light", reducedMotion: true });

await scenario("17. Tablet 820px: kart + yan ray, tam ekran", async ({ page }) => {
  await openFocus(page);
  const box = await stage(page).boundingBox();
  assert.deepEqual([box.x, box.width], [0, 820]);
  await shot(page, "17-focus-tablet");
}, { viewport: { width: 820, height: 1100 } });

const sheet = (page) => page.locator("[data-focus-comments]");
const openComments = async (page, index = 0) => {
  await slides(page).nth(index).getByRole("button", { name: /Yorumları aç|Open comments/ }).click();
  await sheet(page).waitFor();
  await page.waitForTimeout(500);
};

await scenario("18. Yorumlar (telefon): alttan açılır, gönderi yukarıda küçülür ve menüler çekilir; liste Instagram düzeninde", async ({ page }) => {
  await openFocus(page);
  assert.match(await slides(page).nth(0).getByRole("button", { name: /Yorumları aç/ }).textContent(), /1/);
  await openComments(page);
  const box = await sheet(page).boundingBox();
  assert.ok(box.y > 844 * 0.3 && box.y < 844 * 0.4, `sheet starts around 35% (${box.y})`);
  assert.equal(Math.round(box.y + box.height), 844, "sheet reaches the bottom");
  const transform = await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [role='region']").parentElement).transform);
  assert.notEqual(transform, "none", "the post moves (and shrinks only if it must) into the space above the sheet");
  // Albüm (docs/history/203-*): the album art is fitted whole into the free area above the sheet.
  const art = await slides(page).nth(0).locator("[data-album-art]").boundingBox();
  assert.ok(art.y >= 0 && art.y + art.height <= box.y + 1, `art above the sheet (${JSON.stringify(art)}, sheet ${box.y})`);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] button[aria-label=\"Odak'ı kapat\"]").parentElement).opacity), "0", "top bar steps aside");
  assert.equal(await sheet(page).getByRole("heading").textContent(), "Yorumlar · 5");
  const text = await sheet(page).textContent();
  assert.match(text, /bob/);
  assert.match(text, /Yapay zeka ile yapılmış kesin/);
  assert.match(text, /535/, "comment like count on the right");
  assert.match(text, /2 yanıtı göster/);
  assert.equal(await sheet(page).getByRole("group", { name: "Hızlı emoji" }).getByRole("button").count(), 8);
  await shot(page, "18-comments-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("19. Yorum yaz: emoji ekle + gönder → gerçek istek, listeye ve sayaca düşer", async ({ page, db }) => {
  await openFocus(page);
  await openComments(page);
  const input = sheet(page).getByRole("textbox", { name: "Bunun hakkında ne düşünüyorsun?" });
  await input.fill("Harika ");
  await sheet(page).getByRole("button", { name: "🔥 ekle" }).click();
  assert.equal(await input.inputValue(), "Harika 🔥");
  await sheet(page).getByRole("button", { name: "Gönder" }).click();
  await page.waitForTimeout(700);
  const post = db.calls.find((c) => c.table === "prompt_comments" && c.method === "POST");
  assert.ok(post && post.body.prompt_id === pid(1) && post.body.body === "Harika 🔥" && post.body.parent_id === null, JSON.stringify(post));
  assert.match(await sheet(page).textContent(), /Harika 🔥/);
  assert.equal(await sheet(page).getByRole("heading").textContent(), "Yorumlar · 6");
  assert.equal(await input.inputValue(), "");
  await sheet(page).getByRole("button", { name: "Yorumları kapat" }).click();
  await page.waitForTimeout(400);
  assert.match(await slides(page).nth(0).getByRole("button", { name: /Yorumları aç/ }).textContent(), /2/, "rail count follows");
}, { viewport: { width: 390, height: 844 } });

await scenario("20. Yanıtla: tek kutu yanıta döner (@ad), gönderilen yanıt üst yoruma bağlanır; yanıtlar açılır/kapanır", async ({ page, db }) => {
  await openFocus(page);
  await openComments(page);
  await sheet(page).getByRole("button", { name: "2 yanıtı göster" }).click();
  assert.match(await sheet(page).textContent(), /Teşekkürler!/);
  const row = sheet(page).locator("[data-comment-id='c0000000-0000-4000-8000-000000000001']");
  await row.getByRole("button", { name: "Yanıtla" }).first().click();
  await sheet(page).getByText("@bobby kişisine yanıt veriyorsun").waitFor();
  const input = sheet(page).getByRole("textbox", { name: "Bunun hakkında ne düşünüyorsun?" });
  assert.equal(await input.inputValue(), "@bobby ");
  await input.press("End");
  await input.type("bence de");
  await input.press("Enter");
  await page.waitForTimeout(700);
  const post = db.calls.find((c) => c.table === "prompt_comments" && c.method === "POST");
  assert.equal(post.body.parent_id, "c0000000-0000-4000-8000-000000000001");
  assert.equal(post.body.body, "@bobby bence de");
  assert.equal(await sheet(page).getByText(/kişisine yanıt veriyorsun/).count(), 0, "reply mode ends after sending");
}, { viewport: { width: 390, height: 844 } });

await scenario("21. Yorum beğenisi gerçek istekle; kapatma yolları: üstteki gönderiye dokun, aşağı sürükle, Esc", async ({ page, db }) => {
  await openFocus(page);
  await openComments(page);
  const row = sheet(page).locator("[data-comment-id='c0000000-0000-4000-8000-000000000002']");
  await row.getByRole("button", { name: /Beğen/ }).last().click();
  await page.waitForTimeout(400);
  assert.ok(db.calls.some((c) => c.table === "comment_likes" && c.body.comment_id === "c0000000-0000-4000-8000-000000000002"));
  assert.match(await row.textContent(), /45/);
  await page.mouse.click(195, 120);
  await page.waitForTimeout(400);
  assert.equal(await sheet(page).count(), 0, "tap on the post above closes");
  const transform = await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [role='region']").parentElement).transform);
  assert.ok(transform === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(transform), `post back to full size: ${transform}`);
  await openComments(page);
  const handle = await sheet(page).getByRole("heading").boundingBox();
  await page.mouse.move(handle.x + 10, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 10, handle.y + 80, { steps: 4 });
  await page.mouse.move(handle.x + 10, handle.y + 200, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert.equal(await sheet(page).count(), 0, "drag down closes");
  await openComments(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await sheet(page).count(), 0, "Esc closes the sheet");
  assert.equal(await stage(page).count(), 1, "…but not Odak");
}, { viewport: { width: 390, height: 844 } });

await scenario("22. Misafir: yorumları okur; yazma/yanıt/emoji giriş penceresini açar", async ({ page, db }) => {
  await openFocus(page);
  await openComments(page);
  assert.match(await sheet(page).textContent(), /Yapay zeka ile yapılmış kesin/);
  assert.equal(await sheet(page).getByRole("textbox").count(), 0);
  await sheet(page).getByRole("button", { name: "Yorum yapmak için giriş yap" }).click();
  await page.locator("[aria-modal='true'][aria-labelledby]").nth(1).waitFor();
  assert.equal(db.calls.filter((c) => c.table === "prompt_comments" && c.method === "POST").length, 0);
}, { viewport: { width: 390, height: 844 }, guest: true });

await scenario("23. Masaüstü: yorumlar sağda panel, gönderi küçülmez yana kayar; İngilizce", async ({ page }) => {
  await openFocus(page);
  await slides(page).nth(0).getByRole("button", { name: /Open comments/ }).click();
  await sheet(page).waitFor();
  await page.waitForTimeout(500);
  const box = await sheet(page).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [860, 0, 420, 900]);
  assert.equal(await sheet(page).getByRole("heading").textContent(), "Comments · 5");
  assert.ok(await sheet(page).getByRole("textbox", { name: "What do you think about this?" }).isVisible());
  const content = await page.evaluate(() => document.querySelector("[data-focus-feed] [role='region']").parentElement.getBoundingClientRect().width);
  assert.equal(content, 860);
  await shot(page, "23-comments-desktop");
}, { lang: "en" });

await scenario("24. Spaces (docs/history/213-*): Odak'taki gönderi 'Space'e ekle' ile görseline başvurarak eklenir", async ({ page, db, feed }) => {
  setupSpaces(db);
  db.addSpace(1, { title: "Manzara fikirleri" });
  await page.route(`https://example.supabase.co/rest/v1/prompts?**`, (route) => {
    const url = new URL(route.request().url());
    const id = (url.searchParams.get("id") ?? "").replace("eq.", "");
    const row = feed.prompts.find((p) => p.id === id);
    if (route.request().method() !== "GET" || !row || !(url.searchParams.get("id") ?? "").startsWith("eq.")) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(row) });
  });
  await page.goto(`${BASE}/focus`);
  await slides(page).first().waitFor();
  await page.locator("[data-focus-add-to-space]").first().click();
  const modal = page.getByTestId("add-to-space");
  await modal.locator('[data-add-space="Manzara fikirleri"]').click();
  await page.getByTestId("add-to-space-submit").click();
  await page.getByTestId("add-to-space-done").waitFor();
  const added = db.spaceItems.filter((i) => i.space_id === SID(1));
  assert.equal(added.length, 1);
  assert.equal(added[0].kind, "image");
  assert.equal(added[0].prompt_id, feed.prompts[0].id);
});

await scenario("25. Spaces: Ana Sayfa kartının ⋮ menüsünden 'Space'e ekle' — penceredeki tıklamalar kartı AÇMAZ", async ({ page, db, feed }) => {
  setupSpaces(db);
  db.addSpace(1, { title: "Kart testi" });
  await page.route(`https://example.supabase.co/rest/v1/prompts?**`, (route) => {
    const url = new URL(route.request().url());
    const id = (url.searchParams.get("id") ?? "").replace("eq.", "");
    const row = feed.prompts.find((p) => p.id === id);
    if (route.request().method() !== "GET" || !row || !(url.searchParams.get("id") ?? "").startsWith("eq.")) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(row) });
  });
  await page.goto(`${BASE}/`);
  const card = page.locator("article").first();
  await card.waitFor();
  await card.getByRole("button", { name: "Gönderi seçenekleri" }).click();
  await page.locator("[data-add-to-space]").first().click();
  const modal = page.getByTestId("add-to-space");
  await modal.getByRole("textbox").first().click();
  await modal.locator('[data-add-space="Kart testi"]').click();
  await page.getByTestId("add-to-space-submit").click();
  await page.getByTestId("add-to-space-done").waitFor();
  await page.getByTestId("add-to-space-done").getByRole("button", { name: "Kapat" }).click();
  await page.waitForTimeout(400);
  assert.equal(new URL(page.url()).pathname, "/promptly/", "kart açılmadı, sayfada kaldı");
  assert.equal(db.spaceItems.filter((i) => i.space_id === SID(1)).length, 1);
});

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
