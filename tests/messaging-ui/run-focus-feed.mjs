// Odak (`/focus`, docs/history/199-*, 238-*): tam ekran, YATAY kaydırmalı (küçük resim şeridi + komşu kartlar), tek gönderi/ekran — Ana Sayfa'da Akış seçeneği YOK (Kart | Izgara),
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
      const rows = feed.order.filter(([kind]) => !body.p_kinds || body.p_kinds.includes(kind)).map(([kind, row]) => ({ kind, id: row.id, created_at: row.created_at, sort_rank: 0 }));
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
// `all` (varsayılan): "Medya" süzgeci kapatılır, eski senaryolar tam 24 gönderilik listeyle çalışır; `all: false` = açılışın kendisi (Medya açık).
const openFocus = async (page, { all = true } = {}) => {
  await page.goto(`${BASE}/focus`);
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  if (all) {
    await (await menuItem(page, /Medya|Media/)).click();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
};
const activeIndex = (page) => counter(page).getAttribute("aria-label").then((s) => Number(/(\d+)/.exec(s)[1]));
const step = async (page, key = "ArrowRight", times = 1) => { for (let i = 0; i < times; i += 1) { await page.keyboard.press(key); await page.waitForTimeout(650); } await page.waitForTimeout(300); };
const media = (page) => page.evaluate(() => window.__media);
// Üst çubuktaki ⋮ menüsü (docs/history/238-*): Medya süzgeci + ses anahtarı. Kapalıysa açar, öğeyi döndürür.
const menuItem = async (page, name) => {
  const item = stage(page).getByRole("menuitemcheckbox", { name });
  if (!(await item.isVisible())) await stage(page).getByRole("button", { name: /Odak seçenekleri|Focus options/ }).click();
  return item;
};
// Üst çubuğun tek süzgeç çipi (docs/history/245-*): tür + kaynak. Menüyü açar, öğeyi seçer.
const filterChip = (page) => stage(page).getByRole("button", { name: /Odak süzgeci|Focus filter/ });
const pickFilter = async (page, name) => {
  await filterChip(page).click();
  await stage(page).getByRole("menuitemradio", { name }).click();
  await page.waitForTimeout(900);
};

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
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("header[data-app-chrome]")).display), "none");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("aside[data-app-chrome]")).display), "none");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  assert.equal(await stage(page).evaluate((el) => el.classList.contains("dark")), true);
  // iOS Safari kendi çubuklarını BELGENİN moduna göre boyar (docs/history/246-*, 247-*): açık temada da Odak açıkken site gerçekten koyu moddadır.
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "the whole site is dark while Odak is open");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "dark", "document color-scheme is dark while Odak is open");
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-theme")), null, "the saved theme preference is untouched");
  assert.equal(await counter(page).getAttribute("aria-label"), "Gönderi 1 / 16", "Medya açık: görselsiz metin promptu ve workflow düşer (18 satırdan 2 eksik)");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [role='region']")).scrollSnapType), "x mandatory");
  assert.match(await page.title(), /Odak/);
  await shot(page, "02-focus-desktop");
});

await scenario("3. Klavye: → → ←, Home gönderiler arasında; tek durak", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowRight", 2);
  assert.equal(await activeIndex(page), 3);
  await step(page, "ArrowLeft");
  assert.equal(await activeIndex(page), 2);
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
  if (SHOTS) for (const [i, name] of [[1, "04b-text"], [4, "04e-request"]]) { await step(page, "Home"); await step(page, "ArrowRight", i); await shot(page, name); }
});

await scenario("5. Video: yazarın çıktısı oynar (sessiz), ses açılır, geçince durur; yalnız etkin/yakın gönderi sorgulanır", async ({ page, db, feed }) => {
  await openFocus(page);
  assert.equal(db.calls.filter((c) => c.table === "prompt_results").length, 0, "no output lookup far from the video");
  await step(page, "ArrowRight", 5);
  assert.equal(await activeIndex(page), 6);
  const video = slides(page).nth(5).locator("video");
  await video.waitFor({ state: "attached" });
  assert.equal(await video.getAttribute("src"), "https://example.com/out/neon.mp4");
  const plays = (await media(page)).filter((m) => m.op === "play" && m.tag === "VIDEO");
  assert.ok(plays.length >= 1 && plays.at(-1).muted === true, `video autoplays muted: ${JSON.stringify(plays)}`);
  await (await menuItem(page, "Sesi aç")).click();
  await page.waitForTimeout(300);
  assert.equal(await video.evaluate((el) => el.muted), false, "sound on");
  await shot(page, "05-video");
  await step(page, "ArrowRight");
  assert.ok((await media(page)).some((m) => m.op === "pause" && m.tag === "VIDEO"), "video paused when leaving");
  assert.ok(db.calls.some((c) => c.table === "prompt_results" && c.body.byPrompt === feed.video.id));
});

await scenario("6. Ses: sessizken kendiliğinden çalmaz; oynat düğmesi çalar ve sesi açar", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowRight", 6);
  assert.equal(await activeIndex(page), 7);
  const slide = slides(page).nth(6);
  await slide.locator("audio").waitFor({ state: "attached" });
  assert.equal((await media(page)).filter((m) => m.op === "play" && m.tag === "AUDIO").length, 0, "no silent audio autoplay");
  await slide.getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(300);
  assert.ok((await media(page)).some((m) => m.op === "play" && m.tag === "AUDIO"));
  assert.ok(await (await menuItem(page, "Sesi kapat")).isVisible(), "sound switched on by the tap");
  await shot(page, "06-audio");
});

await scenario("7. Medya süzgeci AÇIK başlar: görselsiz metin promptu + workflow düşer; hazır ayar, istek, video, ses kalır; kapatınca hepsi gelir", async ({ page }) => {
  await openFocus(page, { all: false });
  const texts = await slides(page).allTextContents();
  assert.ok(!texts.some((t) => /Kısa öykü açılışı|Ürün fotoğrafından/.test(t)), "text prompt and picture-less workflow are filtered out by default");
  assert.ok(texts.some((t) => /Sinematik portre/.test(t)) && texts.some((t) => /Retro-fütüristik/.test(t)), "preset and request stay without a picture");
  assert.ok(texts.some((t) => /Neon şehirde drone/.test(t)) && texts.some((t) => /Lo-fi yağmur/.test(t)), "video and audio stay");
  assert.equal(await (await menuItem(page, /Medya/)).getAttribute("aria-checked"), "true");
  await (await menuItem(page, /Medya/)).click();
  await page.waitForTimeout(700);
  const all = await slides(page).allTextContents();
  assert.ok(all.some((t) => /Kısa öykü açılışı/.test(t)) && all.some((t) => /Ürün fotoğrafından/.test(t)), "turning Medya off brings them back");
  assert.equal(await (await menuItem(page, /Medya/)).getAttribute("aria-checked"), "false");
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
  await s0.getByRole("button", { name: "Bilgi" }).click();
  await page.locator("[data-focus-info]").waitFor();
  await page.locator("[data-focus-info]").getByRole("button", { name: "Promptu incele" }).click();
  const dialog = page.getByRole("dialog", { name: "Görsel prompt 1" });
  await dialog.waitFor();
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
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("header[data-app-chrome]")).display), "flex");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false, "light theme: the site comes back to light on close");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light", "…and so does the document scheme");
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
  await step(page, "ArrowRight", 3);
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
  await pickFilter(page, "Takip Ettiklerim");
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
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav[data-app-chrome]")).display), "none", "the bottom nav is out of the layout, not just hidden (docs/history/247-*)");
  const slide = await slides(page).nth(0).boundingBox();
  assert.deepEqual([slide.x, slide.width, slide.height], [24, 342, 844], "a post is a full-height card, 24px in from each edge");
  const next = await slides(page).nth(1).boundingBox();
  assert.ok(next.x < 390 && next.x > 366, `the next card peeks in (${next.x})`);
  assert.equal(await stage(page).locator("[data-focus-strip] button").count() > 5, true, "thumbnail strip");
  const like = await slides(page).nth(0).getByRole("button", { name: /Beğen/ }).boundingBox();
  assert.ok(like.x + like.width <= 390 && like.y + like.height <= 844);
  await step(page);
  await shot(page, "14b-focus-phone-text");
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav[data-app-chrome]")).display), "block");
  await shot(page, "14-focus-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("15. İngilizce", async ({ page }) => {
  await openFocus(page);
  assert.equal(await counter(page).getAttribute("aria-label"), "Post 1 of 18");
  assert.ok(await stage(page).getByRole("button", { name: "Close Focus" }).isVisible());
  assert.ok(await (await menuItem(page, /Media/)).isVisible());
  await page.keyboard.press("Escape");
  await slides(page).nth(0).getByRole("button", { name: "Info" }).click();
  assert.ok(await page.locator("[data-focus-info]").getByRole("button", { name: "View prompt" }).isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await filterChip(page).click();
  assert.deepEqual(await stage(page).getByRole("menuitemradio").allInnerTexts(), ["All", "Prompts", "Requests", "Workflows", "Presets", "Newest", "Following"]);
}, { lang: "en" });

await scenario("16. Açık temada da koyu sahne; hareket azaltmada geçiş yok", async ({ page }) => {
  await openFocus(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "the site goes dark while Odak is open (docs/history/247-*)");
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
  await slides(page).nth(0).getByRole("button", { name: "Bilgi" }).click();
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

await scenario("26. Küçük resim şeridi (docs/history/238-*): etkin olan halkalı + ortada, dokununca o gönderiye gider, gönderi değişince şerit akar; yalnız ±14 küçük resim bağlanır", async ({ page }) => {
  await openFocus(page);
  const thumbs = stage(page).locator("[data-focus-strip] button");
  assert.equal(await thumbs.count(), 15, "active 0: indices 0…14 mounted");
  assert.equal(await thumbs.nth(0).getAttribute("aria-current"), "true");
  const first = await thumbs.nth(0).boundingBox();
  assert.ok(Math.abs(first.x + first.width / 2 - 640) < 3, `active thumbnail centred (${first.x})`);
  await thumbs.nth(3).click();
  await page.waitForTimeout(900);
  assert.equal(await activeIndex(page), 4, "tapping a thumbnail goes to that post");
  assert.equal(await stage(page).locator("[data-focus-strip] button[aria-current]").getAttribute("aria-label"), "Sinematik portre ayarı");
  const moved = await stage(page).locator("[data-focus-strip] button[aria-current]").boundingBox();
  assert.ok(Math.abs(moved.x + moved.width / 2 - 640) < 3, "strip followed the post");
  await step(page, "End");
  await page.waitForTimeout(500);
  assert.ok((await thumbs.count()) <= 29, "window stays small on a long feed");
  await shot(page, "26-strip");
});

await scenario("27. Yana kaydırma: yatay kaydırma bir sonraki kartı etkin yapar (komşular soluk); ⋮ menüsünde Esc yalnız menüyü kapatır", async ({ page }) => {
  await openFocus(page);
  const region = page.locator("[data-focus-feed] [role='region']");
  const op = (i) => slides(page).nth(i).evaluate((el) => getComputedStyle(el).opacity);
  assert.equal(await op(0), "1");
  assert.ok(Number(await op(1)) < 0.6, "neighbour dimmed");
  await region.evaluate((el) => el.scrollBy({ left: 600, behavior: "instant" }));
  await page.waitForTimeout(900);
  assert.equal(await activeIndex(page), 2, "a sideways swipe moves on");
  await stage(page).getByRole("button", { name: "Odak seçenekleri" }).click();
  await stage(page).getByRole("menuitemcheckbox", { name: "Medya" }).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await stage(page).getByRole("menu").count(), 0, "Esc closed the menu");
  assert.equal(await stage(page).count(), 1, "…not Odak");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  assert.equal(await stage(page).count(), 0, "a second Esc closes Odak");
});

const swipeVertical = (page, from, to) => page.locator("[data-focus-feed] [data-channel-area]").evaluate((el, [y0, y1]) => {
  const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 7, clientX: 200, clientY: y, bubbles: true, isPrimary: true }));
  fire("pointerdown", y0); fire("pointermove", (y0 + y1) / 2); fire("pointermove", y1); fire("pointerup", y1);
}, [from, to]);
await scenario("28. Süzgeç menüsü (docs/history/245-*): üstte tek 'Tümü · En yeni' çipi, tür + kaynak yazıyla; nokta/kapsül yok; yukarı kaydırma = Bilgi; her tür kendi sunucu sorgusu", async ({ page, db }) => {
  await openFocus(page, { all: false });
  assert.equal(await stage(page).locator("nav[aria-label='Odak bölümleri']").count(), 0, "no dots down the edge");
  assert.equal(await stage(page).locator("[role='tablist']").count(), 0, "no two-feed capsule");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Tümü · En yeni");
  assert.equal(db.feedCalls.at(-1).p_kinds, null, "Tümü = every kind");
  assert.equal(db.feedCalls.at(-1).p_scope, "all");
  await filterChip(page).click();
  assert.equal(await stage(page).getByRole("menuitemradio").count(), 7, "5 types + 2 sources");
  assert.equal(await stage(page).getByRole("menuitemradio", { name: "Tümü" }).getAttribute("aria-checked"), "true");
  assert.equal(await stage(page).getByRole("menuitemradio", { name: "En yeni" }).getAttribute("aria-checked"), "true");
  await shot(page, "28-filter-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await stage(page).getByRole("menu").count(), 0, "Esc closes the menu first");
  assert.equal(await stage(page).count(), 1, "…not Odak");
  await pickFilter(page, "Promptlar");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Promptlar · En yeni");
  assert.deepEqual(db.feedCalls.at(-1).p_kinds, ["prompt"]);
  const types = await slides(page).evaluateAll((els) => els.slice(0, -1).map((e) => /PROMPT|Prompt/.test(e.textContent)));
  assert.ok(types.every(Boolean), "only prompts in the Prompt type");
  await pickFilter(page, "Workflow'lar");
  assert.deepEqual(db.feedCalls.at(-1).p_kinds, ["workflow"]);
  await pickFilter(page, "Takip Ettiklerim");
  assert.equal(db.feedCalls.at(-1).p_scope, "following", "the source is the same menu");
  assert.deepEqual(db.feedCalls.at(-1).p_kinds, ["workflow"], "…and the type stays");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Workflow'lar · Takip Ettiklerim");
  await pickFilter(page, "Tümü");
  await pickFilter(page, "En yeni");
  assert.equal(db.feedCalls.at(-1).p_kinds, null);
  assert.equal(db.feedCalls.at(-1).p_scope, "all");
  // Vertical moves no longer change the type: the wheel and ↓ do nothing, a touch swipe up / ↑ open Bilgi.
  await page.mouse.move(640, 450);
  await page.mouse.wheel(0, 300);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-focus-info]").count(), 0, "the wheel / ↓ do not open anything");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Tümü · En yeni", "…and do not change the type");
  await page.keyboard.press("ArrowUp");
  await page.locator("[data-focus-info]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-focus-info]").count(), 0);
  await swipeVertical(page, 280, 500);
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-focus-info]").count(), 0, "a swipe down does nothing");
  await swipeVertical(page, 500, 280);
  await page.locator("[data-focus-info]").waitFor();
  assert.match(await page.locator("[data-focus-info]").textContent(), /Görsel prompt 1|Açıklama 1/, "a swipe up opens the info of the active post");
  const thumb = await stage(page).locator("[data-focus-strip] button").first().boundingBox();
  assert.ok(thumb.width <= 40.5, `the thumbnails are small (${thumb.width}px wide)`);
});

await scenario("29. Görselsiz istek ve hazır ayar: görselin yerinde kendi metni / parametre özeti; Prompt bölümünde Medya açıkken yalnız görselli/oynatılan promptlar", async ({ page }) => {
  await openFocus(page, { all: false });
  const request = slides(page).filter({ hasText: "Retro-fütüristik sokak posteri" }).first();
  const art = request.locator("[data-album-art]");
  assert.match(await art.textContent(), /Neon harfli bir şehir posteri istiyorum/);
  assert.match(await art.textContent(), /Blade Runner/);
  assert.match(await art.textContent(), /Açık/);
  assert.equal(await request.getByRole("link", { name: "Yanıtla", exact: true }).count(), 0, "no big button on the slide's face");
  assert.equal(await request.getByRole("link", { name: /Ayrıntıları aç/ }).count(), 0);
  const preset = slides(page).filter({ hasText: "Sinematik portre ayarı" }).first();
  assert.match(await preset.locator("[data-album-art]").textContent(), /Hazır Ayar/);
  // Yanıtla (open request) is in the Bilgi sheet now.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  await request.getByRole("button", { name: "Bilgi" }).click();
  await page.locator("[data-focus-info]").waitFor();
  assert.equal(await page.locator("[data-focus-info]").getByRole("link", { name: "Yanıtla", exact: true }).count(), 1, "Yanıtla lives in the info sheet");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await pickFilter(page, "Promptlar");
  const titles = await slides(page).evaluateAll((els) => els.slice(0, -1).map((e) => e.querySelector("h2")?.textContent));
  assert.ok(!titles.includes("Kısa öykü açılışı"), "the text prompt stays out while Medya is on");
  assert.ok(titles.includes("Neon şehirde drone çekimi"));
  await (await menuItem(page, /Medya/)).click();
  await page.waitForTimeout(700);
  assert.ok((await slides(page).evaluateAll((els) => els.map((e) => e.querySelector("h2")?.textContent))).includes("Kısa öykü açılışı"), "Medya off: the text prompt is back");
}, { viewport: { width: 390, height: 844 } });

await scenario("30. Bilgi: gönderide yalnız özet; Bilgi açınca alttan sayfa (yorumla aynı — görsel küçülür, üst çubuk çekilir), Esc yalnız sayfayı kapatır", async ({ page }) => {
  await openFocus(page);
  const slide = slides(page).nth(0);
  assert.equal(await slide.getByText("Açıklama 1").count(), 0, "the description is not on the slide's face");
  assert.equal(await slide.getByRole("button", { name: "Kopyala" }).count(), 0, "no big Kopyala on the face");
  assert.equal(await slide.getByRole("link", { name: /Ayrıntıları aç/ }).count(), 0, "no big Ayrıntıları aç on the face");
  await slide.getByRole("button", { name: "Bilgi" }).click();
  const info = page.locator("[data-focus-info]");
  await info.waitFor();
  await page.waitForTimeout(500);
  assert.match(await info.textContent(), /Açıklama 1/);
  assert.equal(await info.getByRole("link", { name: /Ayrıntıları aç/ }).count(), 1);
  assert.ok((await info.getByRole("button", { name: "Kopyala" }).count()) >= 1, "Kopyala is in the info sheet (prompt block)");
  const box = await info.boundingBox();
  const art = await slide.locator("[data-album-art]").boundingBox();
  assert.ok(art.y >= 0 && art.y + art.height <= box.y + 1, `art above the sheet (${JSON.stringify(art)} / ${box.y})`);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] button[aria-label=\"Odak'ı kapat\"]").parentElement).opacity), "0", "top bar steps aside");
  await shot(page, "30-info-phone");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await info.count(), 0);
  assert.equal(await stage(page).count(), 1, "…not Odak");
  await slide.getByRole("button", { name: /Yorumları aç/ }).click();
  await sheet(page).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await info.count(), 0, "one sheet at a time");
}, { viewport: { width: 390, height: 844 } });

await scenario("31. Koyu temada Odak: site zaten koyu, kapatınca koyu kalır, kayıtlı tercih değişmez", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "dark theme to start with");
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForURL(/\/discover/);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "a dark visitor stays dark after Odak");
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-theme")), "dark");
}, { theme: "dark" });

await scenario("32. Açık temada Odak: açıkken TÜM site koyu moda geçer, kapatınca (X ve Esc) eski açık haline döner; kayıtlı tercih 'light' kalır", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(800);
  const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
  assert.equal(await dark(), false, "light theme to start with");
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  assert.equal(await dark(), true, "dark while Odak is open");
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForURL(/\/discover/);
  await page.waitForTimeout(500);
  assert.equal(await dark(), false, "back to light after X");
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  assert.equal(await dark(), true);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/discover/);
  await page.waitForTimeout(500);
  assert.equal(await dark(), false, "back to light after Esc");
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-theme")), "light", "the saved preference never changed");
}, { theme: "light" });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
