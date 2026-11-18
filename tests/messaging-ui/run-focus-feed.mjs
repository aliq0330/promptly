// Odak (`/focus`, docs/history/199-*, 436-*): tam ekran, DİKEY kaydırmalı (A "Sahne": her gönderi bir ekran) + prompt kartı (C: şerit → yarım → tam,
// masaüstünde yan panel), değişken doldurma (şeritte değer çipleri, sahnede seçici, kartta alanlar), görselsiz sahneler (metin / istek / ayar paketi /
// workflow), sonuç görselleri (yatay), video/ses oynatma (yazarın yüklediği çıktı), "Yalnız görselliler" süzgeci (varsayılan KAPALI), gerçek
// beğeni/kaydet/yorum/paylaş/kopyala, sayfalama, klavye, kapatma, misafir, mobil/İngilizce/açık tema.
// Gerçek Supabase'e KARŞI DENENMEDİ: `feed_page`, içerik ve `prompt_results` satırları burada taklit edilir; medya oynatma
// `HTMLMediaElement.play/pause` taslağıyla sınanır (gerçek video/ses çözülmez).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:4181/promptly";
const server = process.env.BASE_URL ? { close() {} } : await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";
// The "Skills" post type is listed only in a build with NEXT_PUBLIC_SKILLS_ENABLED=true (docs/history/406-*).
const SKILLS_ON = process.env.NEXT_PUBLIC_SKILLS_ENABLED === "true";

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
      prompt_text: text ? "Bir deniz fenerinde yalnız yaşayan bekçinin {mevsim} gecesi gördüğü ışığı {ton} bir dille anlatan, 200 kelimelik bir açılış paragrafı yaz." : `cinematic misty landscape number ${n}, volumetric light, {style}`,
      content_type: text ? "text" : "image", like_count: 10 + n, comment_count: n, created_at: `2026-10-${String(30 - n).padStart(2, "0")}T10:00:00Z`,
      prompt_media: text ? [] : n === 1
        ? [0, 1, 2].map((k) => ({ id: `m${n}-${k}`, url: svg(COLORS[(n + k) % COLORS.length][0], COLORS[(n + k) % COLORS.length][1]), width: 1200, height: 900, alt: "", position: k }))
        : [{ id: `m${n}`, url: svg(a, b), width: 1200, height: 900, alt: "", position: 0 }],
    });
  }
  const video = { ...base, id: pid(51), title: "Neon şehirde drone çekimi", description: "Gece, yağmur, neon.", prompt_text: "slow drone shot over a neon city at night, rain", content_type: "video", like_count: 4, comment_count: 1, created_at: "2026-10-02T10:00:00Z", prompt_media: [{ id: "mv", url: svg("#111827", "#7c3aed", 900, 1600), width: 900, height: 1600, alt: "", position: 0 }] };
  const audio = { ...base, id: pid(52), title: "Lo-fi yağmur döngüsü", description: "Sakin bir döngü.", prompt_text: "lo-fi beat with rain ambience, 80 bpm", content_type: "audio", like_count: 2, comment_count: 0, created_at: "2026-10-01T10:00:00Z", prompt_media: [] };
  prompts.push(video, audio);
  const workflow = { id: pid(101), creator_id: U.carol.id, title: "Ürün fotoğrafından kampanya görseli", description: "Üç adımlı akış.", cover_url: null, content_types: ["image", "text"], category: null, subcategory: null, tools: [], status: "published", visibility: "public", community_id: null, like_count: 9, save_count: 2, comment_count: 4, created_at: "2026-10-05T10:00:00Z", updated_at: "2026-10-05T10:00:00Z", profiles: author(U.carol), workflow_steps: [{ count: 3 }], workflow_tags: [], workflow_media: [] };
  const preset = { id: pid(201), creator_id: U.carol.id, title: "Sinematik portre ayarı", description: "Yumuşak ışık için hazır parametre seti.", cover_url: null, content_type: "image", category: null, subcategory: null, tools: [], selection: { lens: "35mm", angle: "low_angle" }, status: "published", visibility: "public", community_id: null, like_count: 6, comment_count: 4, save_count: 1, created_at: "2026-10-04T10:00:00Z", updated_at: "2026-10-04T10:00:00Z", profiles: author(U.carol), preset_tags: [] };
  const request = { id: pid(301), title: "Retro-fütüristik sokak posteri", description: "Neon harfli bir şehir posteri istiyorum.", creative_direction: "Blade Runner estetiği, mor-turuncu tonlar.", preferred_tool: null, tools: [], content_type: "image", category: null, subcategory: null, reference_image_url: null, reference_image_width: null, reference_image_height: null, status: "open", selected_response_prompt_id: null, response_count: 2, like_count: 5, comment_count: 4, created_at: "2026-10-03T10:00:00Z", deleted_at: null, is_draft: false, visibility: "public", community_id: null, profiles: author(U.carol), prompt_request_tags: [], prompt_request_media: [] };
  // Order: prompt 1, text prompt 2, workflow, preset, request, video, audio, then prompts 3…19.
  const order = [["prompt", prompts[0]], ["prompt", prompts[1]], ["workflow", workflow], ["preset", preset], ["request", request], ["prompt", video], ["prompt", audio], ...prompts.slice(2, 19).map((p) => ["prompt", p])];
  const outputs = {
    [video.id]: { id: "r-video", prompt_id: video.id, media_type: "video", media_url: "https://example.com/out/neon.mp4", thumbnail_url: null, width: null, height: null, text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-10-02T11:00:00Z", profiles: author(U.carol), prompts: null },
    [audio.id]: { id: "r-audio", prompt_id: audio.id, media_type: "audio", media_url: "https://example.com/out/rain.mp3", thumbnail_url: null, width: null, height: null, text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-10-01T11:00:00Z", profiles: author(U.carol), prompts: null },
  };
  const steps = [
    { id: "ws1", position: 0, title: "Ürün fotoğrafını incele", description: "", instructions: "", step_type: "prompt", prompt_id: null, request_id: null, inputs: [], outputs: [] },
    { id: "ws2", position: 1, title: "Kampanya metnini yaz", description: "", instructions: "", step_type: "prompt", prompt_id: null, request_id: null, inputs: [], outputs: [] },
    { id: "ws3", position: 2, title: "Görseli üret", description: "", instructions: "", step_type: "prompt", prompt_id: null, request_id: null, inputs: [], outputs: [] },
  ];
  const vrow = (id, promptId, name, def, extra = {}) => ({ id, prompt_id: promptId, name, default_value: def, description: null, sort_order: 0, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", type: "text", options: [], config: {}, ...extra });
  const variables = {
    [pid(1)]: [vrow("va1", pid(1), "style", "cinematic")],
    [pid(2)]: [
      vrow("va2", pid(2), "mevsim", "kış", { type: "select", options: [{ label: "Yaz", value: "yaz" }, { label: "Kış", value: "kış" }, { label: "Sonbahar", value: "sonbahar" }] }),
      vrow("va3", pid(2), "ton", "", { sort_order: 1 }),
    ],
  };
  return { prompts, workflow, preset, request, video, audio, order, outputs, variables, steps };
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
      // A database without the 17-argument form (migration not applied yet): PostgREST answers PGRST202 for the unknown signature.
      if (db.noMediaRpc && body.p_has_media) return ok({ code: "PGRST202", message: "Could not find the function public.feed_page" }, 404);
      // `p_has_media` (docs/history/254-*): the database applies Odak's "Medya" rule — a prompt with a picture or a video / audio type, a workflow with a
      // picture, every request and preset (the SQL itself is tested in supabase/tests/feed-page-media.sql).
      const hasMedia = ([kind, row]) => (kind === "prompt" ? row.prompt_media.length > 0 || row.content_type === "video" || row.content_type === "audio" : kind === "workflow" ? row.workflow_media.length > 0 : true);
      const rows = feed.order.filter(([kind]) => !body.p_kinds || body.p_kinds.includes(kind)).filter((entry) => !body.p_has_media || hasMedia(entry)).filter(([kind, row]) => !body.p_content_type || (kind === "workflow" ? row.content_types.includes(body.p_content_type) : row.content_type === body.p_content_type)).map(([kind, row]) => ({ kind, id: row.id, created_at: row.created_at, sort_rank: 0 }));
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
    if (table === "workflows" && req.method() === "GET" && (url.searchParams.get("id") ?? "").startsWith("eq.")) return object ? ok(feed.workflow) : ok([feed.workflow]);
    if (table === "workflow_steps" && req.method() === "GET") return ok(feed.steps);
    if (table === "prompt_variables" && req.method() === "GET") {
      const forPrompt = (url.searchParams.get("prompt_id") ?? "").replace("eq.", "");
      db.calls.push({ method: "GET", table, body: { forPrompt } });
      return ok(feed.variables[forPrompt] ?? []);
    }
    if (table === "rpc/prompt_works_state") {
      const body = JSON.parse(req.postData() || "{}");
      db.calls.push({ method: "POST", table, body });
      return ok(body.p_prompt_id === pid(1) ? [{ yes_count: 128, no_count: 9, my_vote: null, can_vote: true }] : [{ yes_count: 0, no_count: 0, my_vote: null, can_vote: false }]);
    }
    if (table === "prompt_versions" && req.method() === "GET") return ok([]);
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

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, theme, reducedMotion, noMediaRpc = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  db.noMediaRpc = noMediaRpc;
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
  if (process.env.DEBUG_CONSOLE) page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 700)); });
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
// "Yalnız görselliler" (docs/history/436-*) KAPALI açılır: görselsiz metin promptu / workflow da akışta, kendi sahnesiyle. `mediaOnly: true` = anahtarı açar.
const openFocus = async (page, { mediaOnly = false } = {}) => {
  await page.goto(`${BASE}/focus`);
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  if (mediaOnly) {
    await (await menuItem(page, /Yalnız görselliler|Only with pictures/)).click();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
};
// Etkin gönderi = dikey sütunun durduğu ekran (docs/history/436-*); 1 tabanlı (eski sayaç gibi).
const SCROLLER = "[data-focus-feed] [role='region']";
const activeIndex = (page) => page.evaluate((sel) => { const el = document.querySelector(sel); return Math.round(el.scrollTop / el.clientHeight) + 1; }, SCROLLER);
const jump = async (page, n) => { await page.evaluate(([sel, i]) => { const el = document.querySelector(sel); el.scrollTo({ top: i * el.clientHeight, behavior: "instant" }); }, [SCROLLER, n]); await page.waitForTimeout(500); };
const slide = (page, n) => page.locator(`[data-focus-feed] [data-slide-index='${n}']`);
const sheetEl = (page) => page.locator("[data-focus-sheet]");
const openCard = async (page, n = 0) => { await slide(page, n).locator("[data-focus-peek-open]").click(); await page.locator("[data-focus-sheet]").waitFor(); await page.waitForTimeout(450); };
// Sürükleme (docs/history/437-*): başlık tutamağından; `slow` = parmak gibi yavaş (hız kararı etkilemez), `flick` = hızlı fırlatma.
const dragGrabber = async (page, dy, { flick = false } = {}) => {
  const g = await page.locator("[data-focus-sheet-grabber]").boundingBox();
  const x = g.x + 100;
  const y = g.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x, y + (dy * i) / steps);
    if (!flick) await page.waitForTimeout(35);
  }
  await page.mouse.up();
  await page.waitForTimeout(550);
};
const sheetState = (page) => sheetEl(page).getAttribute("data-focus-sheet-state");
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const step = async (page, key = "ArrowDown", times = 1) => { for (let i = 0; i < times; i += 1) { await page.keyboard.press(key); await page.waitForTimeout(650); } await page.waitForTimeout(300); };
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
  await stage(page).getByRole("menuitemradio", { name }).first().click();
  await page.waitForTimeout(900);
};

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const likeBtn = (loc) => loc.getByRole("button", { name: /Beğen|Tepki/ }).first();

await scenario("1. Ana Sayfa: Akış seçeneği yok, Kart | Izgara seçici YOK, yazma çubuğu YOK; üst çubukta Odak (yan menüde yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  assert.equal(await stage(page).count(), 0);
  assert.equal(await page.locator("[data-view-toggle]").count(), 0, "Kart | Izgara simgesi kaldırıldı");
  const link = page.locator("header[data-app-header] a[href*='/focus']");
  assert.equal(await link.count(), 1, "header has Odak");
  assert.equal(await page.locator("aside[aria-label] a[href*='/focus']").count(), 0, "sidebar no longer lists Odak (docs/history/227-*)");
  assert.match(await link.textContent(), /Odak/);
}, { viewport: { width: 1280, height: 900 } });

await scenario("2. Masaüstü açılış: tam ekran, menüler DOM'da yok, koyu sahne, dikey yakalamalı sütun, kapalı 'Yalnız görselliler' (süzgeçsiz ilk istek)", async ({ page, db }) => {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => { window.__spaMarker = 1; });
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(500);
  assert.match(page.url(), /\/focus/);
  assert.equal(await page.evaluate(() => window.__spaMarker), undefined, "the header link LOADS the page (docs/history/249-*)");
  const box = await stage(page).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 1440, 900]);
  assert.equal(await page.locator("[data-app-chrome]").count(), 0, "no app bars in the DOM on /focus");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  assert.equal(await stage(page).evaluate((el) => el.classList.contains("dark")), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "the whole site is dark while Odak is open");
  assert.equal(await counter(page).getAttribute("aria-label"), "Gönderi 1 / 18", "ilk sayfa 18 gönderi (görselsizler dahil)");
  assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).scrollSnapType, SCROLLER), "y mandatory");
  assert.equal(db.feedCalls[0].p_has_media, undefined, "Yalnız görselliler kapalı: süzgeçsiz ilk istek (docs/history/436-*)");
  assert.match(await page.title(), /Odak/);
  await shot(page, "02-focus-desktop");
}, { viewport: { width: 1440, height: 900 } });

await scenario("3. Klavye: ↓ ↓ ↑ Home End / j k gönderiler arasında; tek durak", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowDown", 2);
  assert.equal(await activeIndex(page), 3);
  await step(page, "ArrowUp");
  assert.equal(await activeIndex(page), 2);
  await step(page, "j");
  assert.equal(await activeIndex(page), 3);
  await step(page, "k");
  assert.equal(await activeIndex(page), 2);
  await step(page, "Home");
  assert.equal(await activeIndex(page), 1);
  await step(page, "PageDown");
  assert.equal(await activeIndex(page), 2);
});

await scenario("4. Sahneler: görsel (3 sonuç, yatay) / metin (mono + dokunulur değişken çipleri) / workflow (adım zinciri) / ayar paketi (parametre listesi) / istek; uzak gönderi medya yüklemez", async ({ page }) => {
  await openFocus(page);
  const s0 = slide(page, 0);
  assert.equal(await s0.getAttribute("data-focus-tone"), null, "a picture fronts it");
  assert.equal(await s0.locator("[data-result-image] img").count(), 3, "all three results");
  assert.equal((await s0.locator("[data-results-chip]").innerText()).replace(/\s+/g, " ").trim(), "1/3 sonuç");
  assert.equal(await s0.locator("[data-results-row]").getAttribute("data-count"), "3");
  // Sideways swipe pages through the results; the chip follows.
  await s0.locator("[data-results-row]").evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: "instant" }));
  await page.waitForTimeout(300);
  assert.match(await s0.locator("[data-results-chip]").innerText(), /2\/3 sonuç/);
  await jump(page, 1);
  const text = slide(page, 1);
  assert.equal(await text.getAttribute("data-focus-tone"), "text");
  assert.match(await text.locator(".prompt-text").first().textContent(), /deniz fenerinde/);
  await page.waitForTimeout(500);
  assert.equal(await text.locator("[data-focus-token]").count(), 2, "mevsim + ton");
  assert.equal(await text.locator("[data-focus-token='mevsim']").textContent(), "kış", "the default value is shown");
  assert.equal(await text.locator("[data-focus-token='ton']").textContent(), "{ton}", "an empty variable shows its slot");
  await jump(page, 2);
  const flow = slide(page, 2);
  assert.equal(await flow.getAttribute("data-focus-tone"), "workflow");
  await flow.locator("[data-focus-chain] li").first().waitFor();
  assert.equal(await flow.locator("[data-focus-chain] li").count(), 3);
  assert.match(await flow.locator("[data-focus-chain]").textContent(), /Kampanya metnini yaz/);
  await jump(page, 3);
  const preset = slide(page, 3);
  assert.equal(await preset.getAttribute("data-focus-tone"), "preset");
  assert.ok((await preset.locator("[data-focus-params] dt").count()) >= 2, "parameter rows");
  await jump(page, 4);
  const request = slide(page, 4);
  assert.equal(await request.getAttribute("data-focus-tone"), "request");
  assert.match(await request.textContent(), /Neon harfli bir şehir posteri/);
  assert.match(await request.textContent(), /Blade Runner/);
  assert.match(await request.textContent(), /Açık/);
  assert.equal(await slide(page, 10).locator("img").count(), 0, "far slides do not load pictures");
  await shot(page, "04-scenes");
});

await scenario("5. Video: yazarın çıktısı oynar (sessiz), rayda ses düğmesi, geçince durur; yalnız etkin/yakın gönderi sorgulanır", async ({ page, db, feed }) => {
  await openFocus(page);
  assert.equal(db.calls.filter((c) => c.table === "prompt_results").length, 0, "no output lookup far from the video");
  await jump(page, 5);
  assert.equal(await activeIndex(page), 6);
  const video = slide(page, 5).locator("video");
  await video.waitFor({ state: "attached" });
  assert.equal(await video.getAttribute("src"), "https://example.com/out/neon.mp4");
  const plays = (await media(page)).filter((m) => m.op === "play" && m.tag === "VIDEO");
  assert.ok(plays.length >= 1 && plays.at(-1).muted === true, `video autoplays muted: ${JSON.stringify(plays)}`);
  await slide(page, 5).locator("[data-focus-sound]").click();
  await page.waitForTimeout(300);
  assert.equal(await video.evaluate((el) => el.muted), false, "sound on via the rail's button");
  assert.ok(await (await menuItem(page, "Sesi kapat")).isVisible(), "the ⋮ menu shows the same switch");
  await page.keyboard.press("Escape");
  await shot(page, "05-video");
  await jump(page, 6);
  assert.ok((await media(page)).some((m) => m.op === "pause" && m.tag === "VIDEO"), "video paused when leaving");
  assert.ok(db.calls.some((c) => c.table === "prompt_results" && c.body.byPrompt === feed.video.id));
});

await scenario("6. Ses: etkin olunca kendiliğinden (sesle) çalar ve sesi açar; ortadaki düğme durdurur/başlatır; ilerleme çubuğu yok", async ({ page }) => {
  await openFocus(page);
  await jump(page, 6);
  assert.equal(await activeIndex(page), 7);
  const s = slide(page, 6);
  await s.locator("audio").waitFor({ state: "attached" });
  await page.waitForTimeout(300);
  const plays = (await media(page)).filter((m) => m.op === "play" && m.tag === "AUDIO");
  assert.ok(plays.length >= 1 && plays.at(-1).muted === false, `audio autoplays with its sound: ${JSON.stringify(plays)}`);
  assert.ok(await (await menuItem(page, "Sesi kapat")).isVisible(), "sound switched on by the audio post starting");
  await page.keyboard.press("Escape");
  assert.equal(await s.locator("[class*='bottom-0'][class*='h-0.5']").count(), 0, "no progress line on the slide");
  await s.getByRole("button", { name: "Duraklat" }).click({ force: true });
  await page.waitForTimeout(200);
  assert.equal((await media(page)).at(-1).op, "pause");
  await s.getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(200);
  assert.equal((await media(page)).at(-1).op, "play");
  await shot(page, "06-audio");
});

await scenario("7. 'Yalnız görselliler' KAPALI başlar: metin promptu + görselsiz workflow akışta; açınca sunucu p_has_media ister, düşerler; kapatınca geri gelirler", async ({ page, db }) => {
  await openFocus(page);
  const texts = await slides(page).allTextContents();
  assert.ok(texts.some((t) => /Kısa öykü açılışı/.test(t)) && texts.some((t) => /Ürün fotoğrafından/.test(t)), "picture-less posts are in by default");
  assert.equal(await (await menuItem(page, /Yalnız görselliler/)).getAttribute("aria-checked"), "false");
  await (await menuItem(page, /Yalnız görselliler/)).click();
  await page.waitForTimeout(900);
  assert.equal(db.feedCalls.at(-1).p_has_media, true);
  const only = await slides(page).allTextContents();
  assert.ok(!only.some((t) => /Kısa öykü açılışı|Ürün fotoğrafından/.test(t)), "turned on: they drop out");
  assert.ok(only.some((t) => /Sinematik portre/.test(t)) && only.some((t) => /Neon şehirde drone/.test(t)), "preset / request / video stay");
  assert.equal(await (await menuItem(page, /Yalnız görselliler/)).getAttribute("aria-checked"), "true");
  await (await menuItem(page, /Yalnız görselliler/)).click();
  await page.waitForTimeout(900);
  assert.equal(db.feedCalls.at(-1).p_has_media, undefined, "off again: the plain form");
  assert.ok((await slides(page).allTextContents()).some((t) => /Kısa öykü açılışı/.test(t)));
});

await scenario("8. Beğeni gerçek istekle, hata olursa geri alınır", async ({ page, db }) => {
  await openFocus(page);
  await likeBtn(slide(page, 0)).click();
  await page.getByRole("menuitem", { name: "Sevdim" }).click(); // docs/history/265-*: düğme tepki seçicisini açar
  await page.waitForTimeout(500);
  assert.ok(db.calls.some((c) => c.table === "prompt_likes" && c.body.prompt_id === pid(1)));
  assert.match(await likeBtn(slide(page, 0)).textContent(), /12/);
  db.failLike = true;
  await jump(page, 1);
  await likeBtn(slide(page, 1)).click();
  await page.getByRole("menuitem", { name: "Sevdim" }).click();
  await page.waitForTimeout(700);
  assert.match(await likeBtn(slide(page, 1)).textContent(), /12/, "rolled back");
});

await scenario("9. Rayda: Kaydet tek dokunuş (pencere yok), Paylaş penceresi (Esc yalnız pencereyi kapatır), Yorum düğmesi kartı Yorumlar sekmesinde TAM açar", async ({ page }) => {
  await openFocus(page);
  const s0 = slide(page, 0);
  await s0.getByRole("button", { name: /Kaydet|koleksiyon/i }).click();
  await page.locator("[data-save-toast]").waitFor();
  assert.equal(await page.locator("[aria-modal='true']").count(), 0, "Kaydet pencere açmaz — koleksiyona eklemek ayrı adım");
  assert.equal(await stage(page).count(), 1, "Odak açık kalır");
  await s0.getByRole("button", { name: "Paylaş" }).click();
  await page.locator("[aria-modal='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await stage(page).count(), 1);
  await s0.getByRole("button", { name: /Yorumları aç/ }).click();
  await sheetEl(page).waitFor();
  await page.waitForTimeout(450);
  assert.equal(await sheetState(page), "full");
  assert.equal(await page.getByRole("tab", { name: /Yorumlar/ }).getAttribute("aria-selected"), "true");
  assert.match(await sheetEl(page).textContent(), /Yapay zeka ile yapılmış kesin/);
});

await scenario("10. Sayfalama: keyset imleciyle ikinci sayfa, sonda 'Hepsini gördün'", async ({ page, db }) => {
  await openFocus(page);
  await step(page, "End");
  await page.waitForTimeout(1200);
  assert.equal(db.feedCalls[0].p_has_media, undefined);
  assert.ok(db.feedCalls.at(-1).p_after_id, "the last request is the keyset continuation");
  assert.equal(db.feedCalls.filter((c) => c.p_after_id).length, 1, "the second page is asked for exactly once");
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
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false, "light theme: the site comes back to light on close");
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/discover/);
}, { viewport: { width: 1280, height: 900 } });

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
}, { viewport: { width: 1280, height: 900 } });

await scenario("13. Misafir: beğeni giriş penceresi açar; Takip sekmesi giriş ister; metin promptu yine kopyalanır", async ({ page, db }) => {
  await openFocus(page);
  await likeBtn(slide(page, 0)).click();
  await page.locator("[aria-modal='true']").waitFor();
  assert.equal(db.calls.filter((c) => c.table === "prompt_likes").length, 0);
  await page.keyboard.press("Escape");
  await pickFilter(page, "Takip Ettiklerim");
  await stage(page).getByRole("link", { name: "Giriş Yap" }).waitFor();
}, { guest: true });

await scenario("14. Telefon: ekranı kaplar, alt/üst menü DOM'da yok; ray + yazar/başlık + prompt şeridi ekranda; dikey yakalama", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  const nav = page.locator("nav[data-app-chrome]");
  const labels = (await nav.locator("li").allTextContents()).map((s) => s.trim());
  assert.deepEqual(labels.slice(0, 4), ["Ana Sayfa", "Keşfet", "Oluştur", "Topluluklar"]);
  assert.match(labels[4], /Sen$/, "son yuva «Sen»");
  const focusLink = page.locator("header[data-app-header]").getByRole("link", { name: "Odak" });
  assert.equal(await focusLink.getAttribute("href"), "/promptly/focus/", "a plain link, not next/link");
  await focusLink.click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(700);
  const box = await stage(page).boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844]);
  assert.equal(await page.locator("nav[data-app-chrome]").count(), 0, "the bottom nav is not in the DOM on /focus (docs/history/248-*)");
  const s0 = await slide(page, 0).boundingBox();
  assert.deepEqual([s0.x, s0.y, s0.width, s0.height], [0, 0, 390, 844], "a post is one full screen");
  const rail = await likeBtn(slide(page, 0)).boundingBox();
  assert.ok(rail.x + rail.width <= 390 && rail.y + rail.height <= 844 && rail.x > 300, `the rail sits on the right edge (${rail.x})`);
  const peek = await slide(page, 0).locator("[data-focus-peek]").boundingBox();
  assert.ok(Math.abs(peek.y + peek.height - 844) < 1 && peek.height > 70 && peek.height < 130, `the strip sits at the screen's foot (${JSON.stringify(peek)})`);
  assert.equal(await stage(page).locator("[data-focus-strip]").count(), 0, "no thumbnail strip any more");
  assert.equal(await stage(page).locator("[data-focus-panel]").count(), 0, "no side panel on a phone");
  await shot(page, "14-focus-phone");
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav[data-app-chrome]")).display), "block");
});

await scenario("15. İngilizce", async ({ page }) => {
  await openFocus(page);
  assert.ok(await stage(page).getByRole("button", { name: "Close Focus" }).isVisible());
  assert.ok(await (await menuItem(page, /Only with pictures/)).isVisible());
  await page.keyboard.press("Escape");
  await openCard(page, 0);
  assert.match(await sheetEl(page).textContent(), /Prompt Text/);
  assert.ok(await sheetEl(page).getByRole("button", { name: /Fill and copy/ }).isVisible());
  assert.ok(await sheetEl(page).getByRole("link", { name: /Try in Studio/ }).isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await filterChip(page).click();
  assert.deepEqual(await stage(page).getByRole("menuitemradio").allInnerTexts(), ["All", "Prompts", "Requests", "Workflows", "Presets", ...(SKILLS_ON ? ["Skills"] : []), "All", "Image", "Text", "Audio", "Video", "Newest", "Following"]);
}, { lang: "en" });

await scenario("16. Açık temada da koyu sahne; hareket azaltmada geçiş yok", async ({ page }) => {
  await openFocus(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "the site goes dark while Odak is open (docs/history/247-*)");
  const lum = await stage(page).evaluate((el) => { const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number); return (r + g + b) / 3; });
  assert.ok(lum < 40, `stage is dark (${lum})`);
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] [data-slide-index] img")).transitionDuration);
  assert.ok(parseFloat(duration) < 0.01, duration);
}, { theme: "light", reducedMotion: true });

const FILLED_TEXT_2 = "Bir deniz fenerinde yalnız yaşayan bekçinin kış gecesi gördüğü ışığı  bir dille anlatan, 200 kelimelik bir açılış paragrafı yaz.";

await scenario("17. Prompt şeridi: tek satır prompt + değişken sayısı + Kopyala (panel açmadan, doldurulmuş hâliyle, kullanım sayılır); metin sahnesinde değer çipleri; her türün kendi büyük düğmesi", async ({ page, db, feed }) => {
  await openFocus(page);
  const peek = slide(page, 0).locator("[data-focus-peek]");
  await page.waitForTimeout(500);
  assert.match(await peek.textContent(), /Prompt/);
  assert.match(await peek.textContent(), /1 değişken/);
  assert.match(await peek.textContent(), /cinematic misty landscape number 1, volumetric light, cinematic/, "the filled prompt as one line");
  await peek.locator("[data-focus-peek-action='copy'] button").click();
  await page.waitForTimeout(400);
  assert.equal(await clipboard(page), "cinematic misty landscape number 1, volumetric light, cinematic", "copies the FILLED prompt (default value substituted)");
  assert.ok(db.calls.some((c) => c.table === "rpc/record_prompt_copy"), "a copy counts a use");
  assert.equal(await sheetEl(page).count(), 0, "copying needs no card");
  await jump(page, 1);
  const textPeek = slide(page, 1).locator("[data-focus-peek]");
  assert.match(await textPeek.textContent(), /Değişkenler/);
  assert.match(await textPeek.textContent(), /mevsim: kış/);
  assert.match(await textPeek.textContent(), /ton: boş/, "an empty variable says so");
  await textPeek.locator("[data-focus-peek-action='copy'] button").click();
  await page.waitForTimeout(300);
  assert.equal(await clipboard(page), FILLED_TEXT_2);
  await jump(page, 2);
  assert.equal(await slide(page, 2).locator("[data-focus-peek-action]").getAttribute("data-focus-peek-action"), "runWorkflow");
  assert.match(await slide(page, 2).locator("[data-focus-peek-action]").getAttribute("href"), /run=1/);
  await jump(page, 3);
  assert.match(await slide(page, 3).locator("[data-focus-peek-action]").getAttribute("href"), new RegExp(`/studio/?\\?preset=${feed.preset.id}`));
  await jump(page, 4);
  assert.match(await slide(page, 4).locator("[data-focus-peek-action]").getAttribute("href"), new RegExp(`/create/?\\?answerRequest=${feed.request.id}`));
  assert.match(await slide(page, 4).locator("[data-focus-peek]").textContent(), /2 yanıt/);
});

await scenario("18. Yarım kart (docs/history/437-*): şeride dokununca YERDEN KOPUK %75'lik yüzen kart (altta %3 boşluk, yanlardan 10px, dört köşe yuvarlak), arkada karartı, sahne küçülmez; sekmeler hep görünür; başlık, prompt, değişken alanı, büyük eylem", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  await openCard(page, 0);
  assert.equal(await sheetState(page), "half");
  const box = await sheetEl(page).boundingBox();
  assert.ok(Math.abs(box.height - 844 * 0.75) < 2, `a 75% card (${JSON.stringify(box)})`);
  assert.ok(Math.abs(box.y + box.height - 844 * 0.97) < 2, `floating: 3% above the bottom edge (${JSON.stringify(box)})`);
  assert.ok(Math.abs(box.x - 10) < 1 && Math.abs(box.width - 370) < 1, `10px in from each side (${JSON.stringify(box)})`);
  assert.notEqual(await sheetEl(page).evaluate((el) => getComputedStyle(el).borderBottomLeftRadius), "0px", "all four corners are round");
  const art = await slide(page, 0).locator("[data-album-art]").boundingBox();
  assert.ok(art.height > 840 && art.y === 0, `the scene stays full behind the card (${art.height})`);
  const scrim = page.locator("[data-focus-scrim]");
  assert.equal(await scrim.evaluate((el) => el.style.opacity), "1", "dimmed scrim behind the card");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-slide-index='0'] [data-focus-peek]")).opacity), "0", "the strip steps aside");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] button[aria-label=\"Odak'ı kapat\"]").parentElement).opacity), "1", "the top bar stays on the half card");
  assert.deepEqual(await sheetEl(page).getByRole("tab").allInnerTexts().then((all) => all.map((x) => x.replace(/\s+/g, " ").trim())), ["Prompt", "Yorumlar 1", "Sonuçlar"], "tabs are on the half card too");
  assert.match(await sheetEl(page).locator("[data-focus-card-header]").textContent(), /Görsel prompt 1/);
  assert.ok(await sheetEl(page).getByRole("button", { name: "Kapat" }).isVisible(), "the ✕");
  assert.match(await sheetEl(page).locator("[data-focus-works]").textContent(), /Kanıtlanmış · %93/, "the works tally from the real RPC: 128 of 137");
  assert.match(await sheetEl(page).locator("[data-focus-prompt-block]").textContent(), /cinematic misty landscape number 1/);
  assert.equal(await sheetEl(page).locator("#pv-va1").inputValue(), "cinematic");
  assert.ok(await sheetEl(page).getByRole("button", { name: "Doldurup kopyala" }).isVisible());
  assert.ok(await sheetEl(page).getByRole("link", { name: "Studio'da dene" }).isVisible());
  assert.match(await sheetEl(page).getByRole("link", { name: "Studio'da dene" }).getAttribute("href"), new RegExp(`/studio/?\\?prompt=${pid(1)}`));
  assert.equal(await sheetEl(page).locator("[data-focus-action-bar]").getByRole("button", { name: /Beğen|Tepki/ }).count(), 1, "Beğeni + Kaydet beside the big action");
  await shot(page, "18-half");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  assert.equal(await sheetEl(page).count(), 0, "Esc closes the card, Odak stays");
  assert.equal(await stage(page).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-focus-peek-open")), true, "focus returns to the strip button");
  // The scrim and the ✕ close it too.
  await openCard(page, 0);
  await page.mouse.click(195, 60);
  await page.waitForTimeout(500);
  assert.equal(await sheetEl(page).count(), 0, "a tap on the dimmed scrim closes");
  await openCard(page, 0);
  await sheetEl(page).getByRole("button", { name: "Kapat" }).click();
  await page.waitForTimeout(500);
  assert.equal(await sheetEl(page).count(), 0, "✕ closes");
});

await scenario("19. Kart durumları: başlıktan yukarı sürükle → %90 (üstte %7, ayrıntılar açılır); yavaş aşağı → yarım; hızlı aşağı/yarımdan aşağı → kapalı; küçük sürükleme karar vermez; sekmeye dokunmak sekmeyi seçer", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  await openCard(page, 0);
  await dragGrabber(page, -120);
  assert.equal(await sheetState(page), "full");
  const box = await sheetEl(page).boundingBox();
  assert.ok(Math.abs(box.height - 844 * 0.9) < 2 && Math.abs(box.y + box.height - 844 * 0.97) < 2, `a 90% card, still 3% off the edge (${JSON.stringify(box)})`);
  assert.deepEqual(await sheetEl(page).getByRole("tab").allInnerTexts().then((all) => all.map((x) => x.replace(/\s+/g, " ").trim())), ["Prompt", "Yorumlar 1", "Sonuçlar"], "no Sürümler tab: the prompt has no versions");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-focus-feed] button[aria-label=\"Odak'ı kapat\"]").parentElement).opacity), "0", "top bar steps aside on the large card");
  const text = await sheetEl(page).textContent();
  assert.match(text, /Çalıştı mı\?/, "the works vote is in the card");
  assert.match(text, /Midjourney/, "tool row");
  assert.ok(await sheetEl(page).getByRole("link", { name: /Ayrıntıları aç/ }).isVisible());
  await shot(page, "19-full");
  await dragGrabber(page, 100);
  assert.equal(await sheetState(page), "half", "a slow pull down from large settles on half");
  assert.ok(Math.abs((await sheetEl(page).boundingBox()).height - 844 * 0.75) < 2);
  await dragGrabber(page, 300, { flick: true });
  assert.equal(await sheetEl(page).count(), 0, "dragged down from half = closed");
  await openCard(page, 0);
  await dragGrabber(page, 20);
  assert.equal(await sheetState(page), "half", "a small slow drag decides nothing");
  await sheetEl(page).getByRole("tab", { name: /Sonuçlar/ }).click();
  assert.equal(await sheetEl(page).getByRole("tab", { name: /Sonuçlar/ }).getAttribute("aria-selected"), "true", "a tap on a tab selects it (no drag)");
  assert.equal(await sheetState(page), "half");
});

await scenario("20. Kartta değişken alanı: yazdıkça prompt canlı güncellenir; şerit satırı, Kopyala ve 'Varsayılanlara dön' aynı değeri kullanır", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  await openCard(page, 0);
  await sheetEl(page).locator("#pv-va1").fill("noir");
  await page.waitForTimeout(300);
  assert.match(await sheetEl(page).locator("[data-focus-prompt-block]").textContent(), /volumetric light, noir/);
  await sheetEl(page).getByRole("button", { name: "Doldurup kopyala" }).click();
  await page.waitForTimeout(300);
  assert.equal(await clipboard(page), "cinematic misty landscape number 1, volumetric light, noir");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.match(await slide(page, 0).locator("[data-focus-peek]").textContent(), /volumetric light, noir/, "the strip shows the same value");
  await openCard(page, 0);
  await sheetEl(page).getByRole("button", { name: "Varsayılanlara dön" }).click();
  await page.waitForTimeout(300);
  assert.equal(await sheetEl(page).locator("#pv-va1").inputValue(), "cinematic");
});

await scenario("21. Sahnede doldurma: değişken çipine dokun → seçici; seçim sahnede canlı yazılır, 'Sonraki alan', Tamam; şerit çipleri ve Kopyala aynı değerler", async ({ page }) => {
  await openFocus(page);
  await jump(page, 1);
  await page.waitForTimeout(500);
  const s1 = slide(page, 1);
  await s1.locator("[data-focus-token='mevsim']").click();
  const picker = page.locator("[data-focus-picker]");
  await picker.waitFor();
  await page.waitForTimeout(350);
  assert.equal(await page.locator("[data-focus-feed]").getAttribute("data-sheet"), "fill");
  assert.match(await s1.textContent(), /1 \/ 2 alan/, "progress in the scene's label");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("[data-slide-index='1'] [data-focus-peek]")).opacity), "0", "strip / rail step aside while picking");
  await picker.getByText("Yaz", { exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await s1.locator("[data-focus-token='mevsim']").textContent(), "yaz", "the words update live");
  await shot(page, "21-picker");
  await picker.getByRole("button", { name: "Sonraki alan: ton" }).click();
  await page.waitForTimeout(300);
  assert.match(await picker.textContent(), /\{ton\}/);
  await picker.locator("input").fill("teknik");
  await page.waitForTimeout(300);
  assert.equal(await s1.locator("[data-focus-token='ton']").textContent(), "teknik");
  assert.match(await s1.textContent(), /2 \/ 2 alan/);
  await picker.getByRole("button", { name: "Tamam" }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-focus-picker]").count(), 0);
  assert.equal(await page.locator("[data-focus-feed]").getAttribute("data-sheet"), null);
  assert.match(await s1.locator("[data-focus-peek]").textContent(), /mevsim: yaz/);
  assert.match(await s1.locator("[data-focus-peek]").textContent(), /ton: teknik/);
  await s1.locator("[data-focus-peek-action='copy'] button").click();
  await page.waitForTimeout(300);
  assert.equal(await clipboard(page), "Bir deniz fenerinde yalnız yaşayan bekçinin yaz gecesi gördüğü ışığı teknik bir dille anlatan, 200 kelimelik bir açılış paragrafı yaz.");
  // The same values are in the card's fields.
  await openCard(page, 1);
  assert.equal(await sheetEl(page).locator("#pv-va3").inputValue(), "teknik");
  // Esc closes the picker, not Odak.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await s1.locator("[data-focus-token='ton']").click();
  await page.locator("[data-focus-picker]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-focus-picker]").count(), 0);
  assert.equal(await stage(page).count(), 1);
});

await scenario("22. Yorumlar sekmesi: liste Instagram düzeninde; yorum yaz (emoji + gönder → gerçek istek, listeye ve sekme sayısına düşer); Yanıtla tek kutuyu yanıta çevirir", async ({ page, db }) => {
  await openFocus(page);
  await slide(page, 0).getByRole("button", { name: /Yorumları aç/ }).click();
  await sheetEl(page).waitFor();
  await page.waitForTimeout(500);
  const comments = page.locator("[data-focus-comments]");
  const text = await comments.textContent();
  assert.match(text, /bob/);
  assert.match(text, /Yapay zeka ile yapılmış kesin/);
  assert.match(text, /535/, "comment like count on the right");
  assert.match(text, /2 yanıtı göster/);
  assert.equal(await comments.getByRole("group", { name: "Hızlı emoji" }).getByRole("button").count(), 8);
  const input = comments.getByRole("textbox", { name: "Bunun hakkında ne düşünüyorsun?" });
  await input.fill("Harika ");
  await comments.getByRole("button", { name: "🔥 ekle" }).click();
  assert.equal(await input.inputValue(), "Harika 🔥");
  await comments.getByRole("button", { name: "Gönder" }).click();
  await page.waitForTimeout(700);
  const post = db.calls.find((c) => c.table === "prompt_comments" && c.method === "POST");
  assert.ok(post && post.body.prompt_id === pid(1) && post.body.body === "Harika 🔥" && post.body.parent_id === null, JSON.stringify(post));
  assert.match(await comments.textContent(), /Harika 🔥/);
  assert.equal(await input.inputValue(), "");
  assert.match((await page.getByRole("tab", { name: /Yorumlar/ }).innerText()).replace(/\s+/g, " "), /Yorumlar 2/, "the tab count follows");
  await comments.getByRole("button", { name: "2 yanıtı göster" }).click();
  const row = comments.locator("[data-comment-id='c0000000-0000-4000-8000-000000000001']");
  await row.getByRole("button", { name: "Yanıtla" }).first().click();
  await comments.getByText("@bobby kişisine yanıt veriyorsun").waitFor();
  assert.equal(await input.inputValue(), "@bobby ");
  await input.press("End");
  await input.type("bence de");
  await input.press("Enter");
  await page.waitForTimeout(700);
  const reply = db.calls.filter((c) => c.table === "prompt_comments" && c.method === "POST").at(-1);
  assert.equal(reply.body.parent_id, "c0000000-0000-4000-8000-000000000001");
  assert.equal(reply.body.body, "@bobby bence de");
  // Esc: a reply in progress first, then the card.
  await row.getByRole("button", { name: "Yanıtla" }).first().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await sheetEl(page).count(), 1, "Esc cancels the reply first");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await sheetEl(page).count(), 0);
});

await scenario("23. Misafir: yorumları okur; yazma/emoji giriş penceresini açar", async ({ page, db }) => {
  await openFocus(page);
  await slide(page, 0).getByRole("button", { name: /Yorumları aç/ }).click();
  await sheetEl(page).waitFor();
  await page.waitForTimeout(500);
  assert.match(await page.locator("[data-focus-comments]").textContent(), /Yapay zeka ile yapılmış kesin/);
  await page.locator("[data-focus-comments]").getByRole("button", { name: "Yorum yapmak için giriş yap" }).click();
  await page.locator("[aria-modal='true']").nth(1).waitFor();
  assert.equal(db.calls.filter((c) => c.table === "prompt_comments" && c.method === "POST").length, 0);
}, { guest: true });

await scenario("24. Sonuçlar sekmesi: prompt'un kullanıcı sonuçları bölümü kartın içinde; Çalıştı mı? yarım kartta da görünür (docs/history/437-*)", async ({ page, db }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  await openCard(page, 0);
  assert.ok(await sheetEl(page).getByText("Çalıştı mı?").isVisible(), "the vote is on the half card too");
  await sheetEl(page).getByRole("button", { name: "Doldurup kopyala" }).click();
  await page.waitForTimeout(700);
  assert.ok(await sheetEl(page).getByText("Çalıştı mı?").isVisible(), "…and stays after copying");
  assert.ok(db.calls.some((c) => c.table === "rpc/prompt_works_state"));
  await dragGrabber(page, -120);
  await page.getByRole("tab", { name: "Sonuçlar" }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.getByRole("tab", { name: "Sonuçlar" }).getAttribute("aria-selected"), "true");
  assert.ok(db.calls.some((c) => c.table === "prompt_results" && c.method === "GET"), "the results section loads");
  assert.equal(await sheetEl(page).locator("[data-focus-action-bar]").count(), 1, "the big action stays");
});

await scenario("25. İstek kartı: İstek + Yorumlar sekmeleri; Yanıtla büyük eylem; Ayrıntıları aç / Space'e ekle satırları", async ({ page, feed }) => {
  await openFocus(page);
  await jump(page, 4);
  await openCard(page, 4);
  assert.equal(await sheetState(page), "half");
  assert.match(await sheetEl(page).textContent(), /Neon harfli bir şehir posteri/);
  assert.match(await sheetEl(page).textContent(), /Blade Runner/);
  const reply = sheetEl(page).locator("[data-focus-action-bar]").getByRole("link", { name: "Yanıtla" });
  assert.match(await reply.getAttribute("href"), new RegExp(`/create/?\\?answerRequest=${feed.request.id}`));
  assert.ok(await sheetEl(page).getByRole("link", { name: /Ayrıntıları aç/ }).isVisible(), "the ways on are there even on the half card");
  await dragGrabber(page, -120);
  assert.deepEqual(await page.getByRole("tab").allInnerTexts().then((all) => all.map((s) => s.replace(/\s+/g, " ").trim())), ["Prompt İsteği", "Yorumlar 4"]);
  await shot(page, "25-request-card");
});

await scenario("26. Çıktısız/görselsiz gönderilerde kart: workflow adımları + 'Adım adım çalıştır'; ayar paketi parametreleri + 'Bir promptla dene'", async ({ page }) => {
  await openFocus(page);
  await jump(page, 2);
  await openCard(page, 2);
  assert.match(await sheetEl(page).locator("[data-focus-card-scroll]").textContent(), /Üç adımlı akış/);
  assert.ok(await sheetEl(page).locator("[data-focus-action-bar]").getByRole("link", { name: "Adım adım çalıştır" }).isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await jump(page, 3);
  await openCard(page, 3);
  assert.ok(await sheetEl(page).locator("[data-focus-action-bar]").getByRole("link", { name: "Bir promptla dene" }).isVisible());
  assert.match(await sheetEl(page).locator("[data-focus-card-scroll]").textContent(), /Yumuşak ışık için hazır parametre seti/);
});

await scenario("27. Paylaş / Space'e ekle: Odak'taki gönderi 'Space'e ekle' ile (kartın Ayrıntılar satırı) görseline başvurarak eklenir", async ({ page, db, feed }) => {
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
  await page.waitForTimeout(500);
  await openCard(page, 0);
  await dragGrabber(page, -120);
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

await scenario("28. Süzgeç menüsü (docs/history/245-*): üstte tek 'Tümü · En yeni' çipi; her tür kendi sunucu sorgusu; kart açıkken süzgeç çipi karartının altındadır", async ({ page, db }) => {
  await openFocus(page);
  assert.equal(await stage(page).locator("[role='tablist']").count(), 0, "no capsule while no card is open");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Tümü · En yeni");
  assert.equal(db.feedCalls.at(-1).p_kinds, null);
  await filterChip(page).click();
  assert.equal(await stage(page).getByRole("menuitemradio").count(), 12 + (SKILLS_ON ? 1 : 0), "5 (+ Skills) post types + 5 content types + 2 sources");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await stage(page).getByRole("menu").count(), 0, "Esc closes the menu first");
  assert.equal(await stage(page).count(), 1, "…not Odak");
  await openCard(page, 0);
  await page.mouse.click(195, 60);
  await page.waitForTimeout(500);
  assert.equal(await sheetEl(page).count(), 0, "the scrim covers the filter chip: a tap there closes the card instead of opening the menu");
  await pickFilter(page, "Promptlar");
  assert.deepEqual(db.feedCalls.at(-1).p_kinds, ["prompt"]);
  await pickFilter(page, "Workflow'lar");
  assert.deepEqual(db.feedCalls.at(-1).p_kinds, ["workflow"]);
  await pickFilter(page, "Takip Ettiklerim");
  assert.equal(db.feedCalls.at(-1).p_scope, "following", "the source is the same menu");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Workflow'lar · Takip Ettiklerim");
  await pickFilter(page, "Tümü");
  await pickFilter(page, "En yeni");
  assert.equal(db.feedCalls.at(-1).p_kinds, null);
});

await scenario("29. İçerik türü süzgeci (docs/history/305-*): Video seçilince sunucuya p_content_type gider, çip etiketi güncellenir; Tümü süzgeci kaldırır", async ({ page, db }) => {
  await openFocus(page);
  await pickFilter(page, "Video");
  assert.equal(db.feedCalls.at(-1).p_content_type, "video");
  assert.equal((await filterChip(page).innerText()).replace(/\s+/g, " ").trim(), "Tümü · Video · En yeni");
  await filterChip(page).click();
  await stage(page).getByRole("menuitemradio", { name: "Tümü" }).nth(1).click();
  await page.waitForTimeout(900);
  assert.equal(db.feedCalls.at(-1).p_content_type ?? null, null, "Tümü süzgeci kaldırır");
});

await scenario("30. Migration henüz yoksa (17 argümanlı feed_page bilinmiyor): 'Yalnız görselliler' açılınca istek süzgeçsiz yinelenir, süzgeç istemcide uygulanır", async ({ page, db }) => {
  await openFocus(page);
  await (await menuItem(page, /Yalnız görselliler/)).click();
  await page.waitForTimeout(1200);
  const only = await slides(page).allTextContents();
  assert.ok(!only.some((t) => /Kısa öykü açılışı|Ürün fotoğrafından/.test(t)), "client-side filtering still hides picture-less posts");
  assert.ok(only.some((t) => /Neon şehirde drone/.test(t)));
  assert.ok(db.feedCalls.some((c) => c.p_has_media === true), "the new form was tried first");
}, { noMediaRpc: true });

await scenario("31. Koyu temada Odak: site zaten koyu, kapatınca koyu kalır, kayıtlı tercih değişmez", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  await stage(page).getByRole("button", { name: "Odak'ı kapat" }).first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "stays dark");
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-theme")), "dark");
}, { theme: "dark", viewport: { width: 1280, height: 900 } });

await scenario("32. Açık temada Odak: açıkken TÜM site koyu moda geçer, kapatınca eski açık haline döner; kayıtlı tercih 'light' kalır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator("article").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false);
  await page.locator("header[data-app-header] a[href*='/focus']").click();
  await slides(page).first().waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-theme")), "light");
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/$|\/promptly\/?$/);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false, "back to light");
}, { theme: "light", viewport: { width: 1280, height: 900 } });

await scenario("33. Masaüstü: sahne ortada 4:5 kart + sağda 440px kalıcı panel (başlık, Beğeni·Yorum·Kaydet·Paylaş satırı, sekmeler, prompt, alanlar, Çalıştı mı?, Doldurup kopyala + Studio'da dene); alt eylem çubuğunda Beğeni YOK", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  const art = await slide(page, 0).locator("[data-album-art]").boundingBox();
  assert.ok(Math.abs(art.width / art.height - 0.8) < 0.02, `the scene is a 4:5 card (${art.width}x${art.height})`);
  const panel = page.locator("[data-focus-panel]");
  const pb = await panel.boundingBox();
  assert.ok(Math.abs(pb.width - 440) < 1 && Math.abs(pb.x + pb.width - 1440) < 1, `a 440px side panel (${JSON.stringify(pb)})`);
  assert.ok(Math.abs(art.x + art.width / 2 - (1440 - 440) / 2) < 3, "the card is centred in the room beside the panel");
  assert.equal(await page.locator("[data-focus-feed] [data-slide-index='0'] [data-focus-peek]").evaluate((el) => getComputedStyle(el).display), "none", "no strip on desktop");
  assert.equal(await sheetEl(page).count(), 0, "no sheet on desktop");
  assert.match(await panel.textContent(), /Görsel prompt 1/);
  assert.match(await panel.textContent(), /Kanıtlanmış · %93/);
  assert.equal(await panel.locator("[data-focus-panel-actions] button").count() >= 4, true, "Beğeni · Yorum · Kaydet · Paylaş row");
  assert.deepEqual(await panel.getByRole("tab").allInnerTexts().then((all) => all.map((s) => s.replace(/\s+/g, " ").trim())), ["Prompt", "Yorumlar 1", "Sonuçlar"]);
  assert.match(await panel.textContent(), /Çalıştı mı\?/);
  assert.ok(await panel.getByRole("button", { name: "Doldurup kopyala" }).isVisible());
  assert.ok(await panel.getByRole("link", { name: "Studio'da dene" }).isVisible());
  assert.equal(await panel.locator("[data-focus-action-bar]").getByRole("button", { name: /Beğen|Tepki/ }).count(), 0, "Beğeni is in the panel's row, not twice");
  assert.ok((await slide(page, 0).locator("[data-focus-feed] [data-results-chip]").count()) >= 0);
  assert.match(await slide(page, 0).locator("[data-results-chip]").innerText(), /1\/3 sonuç/);
  assert.match(await stage(page).locator("[data-focus-keys]").textContent(), /↑ ↓ gönderi/);
  await shot(page, "33-desktop-panel");
  // Panel follows the active post and starts on its own tab.
  await panel.getByRole("tab", { name: /Yorumlar/ }).click();
  await page.waitForTimeout(500);
  assert.match(await panel.textContent(), /Yapay zeka ile yapılmış kesin/);
  await step(page, "j");
  assert.match(await panel.textContent(), /Kısa öykü açılışı/, "the panel shows the new active post");
  assert.equal(await panel.getByRole("tab", { name: "Prompt" }).getAttribute("aria-selected"), "true", "…back on its main tab");
}, { viewport: { width: 1440, height: 900 } });

await scenario("34. Masaüstü klavye + düğmeler: ← → sonuçları gezer (‹ › düğmeleri aynı), ↑ ↓ gönderiler, P paneli gizler/gösterir, C doldurulmuş promptu kopyalar", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  const chip = slide(page, 0).locator("[data-results-chip]");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  assert.match(await chip.innerText(), /2\/3 sonuç/);
  await stage(page).getByRole("button", { name: "Sonraki sonuç" }).click();
  await page.waitForTimeout(600);
  assert.match(await chip.innerText(), /3\/3 sonuç/);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  assert.match(await chip.innerText(), /3\/3 sonuç/, "stops at the end");
  await stage(page).getByRole("button", { name: "Önceki sonuç" }).click();
  await page.waitForTimeout(600);
  assert.match(await chip.innerText(), /2\/3 sonuç/);
  await page.keyboard.press("c");
  await page.waitForTimeout(400);
  assert.equal(await clipboard(page), "cinematic misty landscape number 1, volumetric light, cinematic");
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-focus-panel]").count(), 0, "P hides the panel");
  const wide = await slide(page, 0).locator("[data-album-art]").boundingBox();
  assert.ok(Math.abs(wide.x + wide.width / 2 - 720) < 3, "the card centres on the whole width");
  await stage(page).getByRole("button", { name: "Paneli göster" }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-focus-panel]").count(), 1, "…and the edge button brings it back");
  await page.locator("[data-focus-panel]").getByRole("button", { name: "Paneli gizle" }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-focus-panel]").count(), 0);
  await stage(page).getByRole("button", { name: "Sonraki gönderi" }).click();
  await page.waitForTimeout(800);
  assert.equal(await activeIndex(page), 2, "↓ button steps to the next post");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  assert.equal(await activeIndex(page), 2, "← → on a post without results do nothing");
}, { viewport: { width: 1440, height: 900 } });

await scenario("35. Masaüstü: metin sahnesindeki değişken çipine dokunmak paneli açıp o alana odaklanır (seçici yalnız telefonda)", async ({ page }) => {
  await openFocus(page);
  await step(page, "ArrowDown");
  await page.waitForTimeout(500);
  await page.keyboard.press("p");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-focus-panel]").count(), 0);
  await slide(page, 1).locator("[data-focus-token='ton']").click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-focus-panel]").count(), 1, "the panel opens");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "pv-va3", "…on the field of that variable");
  assert.equal(await page.locator("[data-focus-picker]").count(), 0);
  await page.keyboard.type("resmî");
  await page.waitForTimeout(300);
  assert.equal(await slide(page, 1).locator("[data-focus-token='ton']").textContent(), "resmî");
}, { viewport: { width: 1440, height: 900 } });

await scenario("36. Telefon: panel kısayolu P kartı açar/kapatır; açıkken ↑ ↓ gönderi değiştirmez", async ({ page }) => {
  await openFocus(page);
  await page.waitForTimeout(500);
  await page.keyboard.press("p");
  await page.locator("[data-focus-sheet]").waitFor();
  await page.waitForTimeout(450);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  assert.equal(await activeIndex(page), 1, "the card is a dialog: keys do not move the feed behind it");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.equal(await sheetEl(page).count(), 0);
  assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).overflowY, SCROLLER), "auto", "the column scrolls again");
});

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
