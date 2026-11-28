// Detay sayfasının video oynatıcısı (docs/history/484-*): "Minimal" düzen — yerel kontrol çubuğu yok, ortada oynat düğmesi, altta ince ilerleme çizgisi,
// hız · ses · tam ekran satırı, klavye kısayolları, kontrollerin kendiliğinden gizlenmesi. Ağ taklitli; `HTMLMediaElement` taslaklanır
// (süre 24 sn, `currentTime`/`play`/`pause` taklit — gerçek video çözülmez). Gerçek Supabase'e / cihaza / iOS Safari'ye KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { installDetailData, ID, PAGES } from "./detail-fixtures.mjs";

const PORT = 4330;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, ...headers }, body: JSON.stringify(body) });

const profile = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [], is_demo: false });
const thumb = (a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${a}"/><circle cx="320" cy="180" r="90" fill="${b}"/></svg>`)}`;
const VIDEO_ID = "c0000000-0000-4000-8000-0000000000a1";
const VIDEO = {
  id: VIDEO_ID, prompt_id: ID.prompt, media_type: "video", media_url: "https://example.com/out/clip.mp4", thumbnail_url: thumb("#1b2a49", "#e86a3c"), width: 1280, height: 720,
  text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-09-21T09:00:00Z", profiles: profile(U.bob), prompts: null,
};

/** Süresi 24 sn olan, `currentTime` / `play` / `pause` taklitli oynatıcı; tam ekran isteği kaydedilir. */
const MEDIA_STUB = () => {
  const proto = HTMLMediaElement.prototype;
  const states = new WeakMap();
  const state = (el) => {
    let s = states.get(el);
    if (!s) { s = { t: 0, paused: true, timer: 0 }; states.set(el, s); }
    return s;
  };
  window.__plays = [];
  window.__fsCalls = 0;
  Object.defineProperty(proto, "duration", { configurable: true, get() { return 24; } });
  Object.defineProperty(proto, "paused", { configurable: true, get() { return state(this).paused; } });
  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    get() { return state(this).t; },
    set(v) { state(this).t = Number(v); this.dispatchEvent(new Event("seeked")); this.dispatchEvent(new Event("timeupdate")); },
  });
  proto.play = function play() {
    const s = state(this);
    s.paused = false;
    clearInterval(s.timer);
    window.__plays.push({ muted: this.muted, rate: this.playbackRate });
    s.timer = setInterval(() => {
      s.t = Math.min(24, s.t + 0.1 * this.playbackRate);
      this.dispatchEvent(new Event("timeupdate"));
      if (s.t >= 24) { s.paused = true; clearInterval(s.timer); this.dispatchEvent(new Event("pause")); this.dispatchEvent(new Event("ended")); }
    }, 100);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function pause() {
    const s = state(this);
    if (s.paused) return;
    s.paused = true;
    clearInterval(s.timer);
    this.dispatchEvent(new Event("pause"));
  };
  Element.prototype.requestFullscreen = function requestFullscreen() { window.__fsCalls += 1; return Promise.resolve(); };
};

/** The video PROMPT the prompt page shows: its author's own video result (VIDEO, bob) is the output. */
const VIDEO_PROMPT = {
  id: ID.prompt, title: "Yağmurlu neon sokakta yürüyen kedi", description: "d", prompt_text: "Sinematik takip çekimi", tool: null, tools: [], content_type: "video", category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 4, save_count: 0, comment_count: 0, copy_count: 0, quote_count: 0, created_at: "2026-09-20T10:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: profile(U.bob), prompt_media: [{ id: "m1", url: thumb("#1b2a49", "#e86a3c"), width: 1280, height: 720, alt: "Kapak", position: 0 }], prompt_tags: [],
};

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", path = `/results/local?id=${VIDEO_ID}` } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompt_results/, (route) => {
    const accept = route.request().headers().accept ?? "";
    const url = new URL(route.request().url());
    if (url.searchParams.get("id")) return json(route, accept.includes("vnd.pgrst.object") ? VIDEO : [VIDEO]);
    return json(route, [VIDEO], 200, { "content-range": "0-0/1" });
  });
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.searchParams.get("id") !== `eq.${ID.prompt}`) return route.fallback();
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return json(route, single ? VIDEO_PROMPT : [VIDEO_PROMPT]);
  });
  await context.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
  await context.addInitScript(MEDIA_STUB);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + path);
    await page.locator("[data-media-player]").waitFor();
    // The metadata event of a real file: the stub reports 24 s.
    await page.locator("[data-media-player] video").evaluate((el) => el.dispatchEvent(new Event("loadedmetadata")));
    await fn({ page });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/mp-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const player = (page) => page.locator("[data-media-player]");
const video = (page) => page.locator("[data-media-player] video");
const timeText = async (page) => ((await page.locator("[data-player-time]").textContent()) ?? "").replace(/\s+/g, " ").trim();
const videoTime = (page) => video(page).evaluate((el) => el.currentTime);
const fillWidth = (page) => page.locator("[data-player-scrub] > div > div").evaluate((el) => el.getBoundingClientRect().width);
const scrubBox = (page) => page.locator("[data-player-scrub]").boundingBox();

await scenario("1. Yerel kontrol çubuğu yok; ortada oynat düğmesi, altta ince çizgi, süre 0:00 / 0:24", async ({ page }) => {
  assert.equal(await video(page).evaluate((el) => el.hasAttribute("controls")), false, "no native controls");
  assert.equal(await timeText(page), "0:00 / 0:24");
  const big = await page.getByRole("button", { name: "Oynat" }).first().boundingBox();
  const box = await player(page).boundingBox();
  assert.ok(Math.abs(big.x + big.width / 2 - (box.x + box.width / 2)) < 2 && Math.abs(big.y + big.height / 2 - (box.y + box.height / 2)) < 2, "play button in the middle of the picture");
  const track = await page.locator("[data-player-scrub] > div").boundingBox();
  assert.equal(Math.round(track.height), 3, "the line is 3 px at rest");
  assert.ok(Math.abs(track.y + track.height - (box.y + box.height)) < 2, "the line sits on the bottom edge");
  const scrub = await scrubBox(page);
  assert.ok(scrub.height >= 35.9, `hit area ≥ 36px: ${scrub.height}`);
  assert.equal(await page.locator("[data-player-scrub]").getAttribute("role"), "slider");
  assert.equal(await page.locator("[data-player-scrub]").getAttribute("aria-valuemax"), "24");
});

await scenario("2. Düğme/resim oynatır ve durdurur; çizgi ve süre ilerler; çıkan durumda ortadaki düğme geri gelir", async ({ page }) => {
  await page.getByRole("button", { name: "Oynat" }).first().click();
  assert.equal((await page.evaluate(() => window.__plays)).length, 1, "play() called once");
  assert.equal((await page.evaluate(() => window.__plays[0])).muted, false, "starts with sound (the visitor pressed play)");
  await page.waitForTimeout(1600);
  assert.ok((await fillWidth(page)) > 0, "progress line advances");
  assert.notEqual(await timeText(page), "0:00 / 0:24", "time advances");
  assert.equal(await player(page).getAttribute("data-playing"), "true");
  // Tapping the picture pauses.
  await player(page).click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(200);
  assert.equal(await player(page).getAttribute("data-playing"), "false");
  await page.getByRole("button", { name: "Oynat" }).first().waitFor();
});

await scenario("3. Çizgiye basmak sarar (12 sn), üstüne gelince süre balonu çıkar; sürükleme sürekli sarar", async ({ page }) => {
  const b = await scrubBox(page);
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height - 2);
  assert.equal((await page.locator("[data-player-scrub]").textContent())?.trim(), "0:06", "tip shows the time under the pointer");
  // The 150 ms height transition: wait for it instead of a fixed pause.
  await page.waitForFunction(() => Math.round(document.querySelector("[data-player-scrub] > div").getBoundingClientRect().height) === 6);
  const track = await page.locator("[data-player-scrub] > div").boundingBox();
  assert.equal(Math.round(track.height), 6, "the line thickens on hover");
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height - 2);
  assert.ok(Math.abs((await videoTime(page)) - 12) < 0.6, `seeked to ~12: ${await videoTime(page)}`);
  assert.equal(await timeText(page), "0:12 / 0:24");
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height - 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height - 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(Math.abs((await videoTime(page)) - 18) < 0.8, `dragged to ~18: ${await videoTime(page)}`);
  assert.equal(await page.locator("[data-player-scrub]").getAttribute("aria-valuenow"), String(Math.round(await videoTime(page))));
});

await scenario("4. Klavye: K oynatır, ←/→ 5 sn, J/L 10 sn, 5 = yarısı, Home, M sessiz, F tam ekran; düğmedeki Boşluk düğmeyi çalıştırır", async ({ page }) => {
  await player(page).focus();
  await page.keyboard.press("5");
  assert.ok(Math.abs((await videoTime(page)) - 12) < 0.1, "5 jumps to half");
  await page.keyboard.press("ArrowRight");
  assert.ok(Math.abs((await videoTime(page)) - 17) < 0.1, "→ +5");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("j");
  assert.ok(Math.abs((await videoTime(page)) - 2) < 0.1, "← −5 then J −10 (clamped at 2)");
  await page.keyboard.press("l");
  assert.ok(Math.abs((await videoTime(page)) - 12) < 0.1, "L +10");
  await page.keyboard.press("Home");
  assert.equal(await videoTime(page), 0, "Home");
  await page.keyboard.press("End");
  assert.equal(await videoTime(page), 24, "End");
  await page.keyboard.press("k");
  assert.equal(await player(page).getAttribute("data-playing"), "true", "K plays");
  await page.keyboard.press(" ");
  assert.equal(await player(page).getAttribute("data-playing"), "false", "Space pauses");
  await page.keyboard.press("m");
  assert.equal(await video(page).evaluate((el) => el.muted), true, "M mutes");
  assert.equal(await page.locator("[data-player-mute]").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("[data-player-mute]").getAttribute("aria-label"), "Sesi aç");
  await page.keyboard.press("m");
  assert.equal(await video(page).evaluate((el) => el.muted), false);
  await page.keyboard.press("f");
  assert.equal(await page.evaluate(() => window.__fsCalls), 1, "F asks for full screen");
  // A focused button keeps Space for itself: it presses the button, it does not also toggle playback.
  await page.locator("[data-player-mute]").focus();
  await page.keyboard.press(" ");
  assert.equal(await video(page).evaluate((el) => el.muted), true, "Space on the mute button mutes");
  assert.equal(await player(page).getAttribute("data-playing"), "false", "…and did not start playback");
});

await scenario("5. Hız menüsü: seçilen hız oynatıcıya uygulanır (1,5×), seçili satırda işaret, Escape kapatır; tam ekran düğmesi istek gönderir", async ({ page }) => {
  const speed = page.getByRole("button", { name: "Oynatma hızı" });
  assert.equal((await speed.textContent())?.trim(), "1×");
  await speed.click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  const rows = await menu.getByRole("menuitem").allTextContents();
  assert.deepEqual(rows.map((r) => r.trim()), ["0,5×", "0,75×", "Normal", "1,25×", "1,5×", "2×"]);
  await menu.getByRole("menuitem", { name: "1,5×" }).click();
  assert.equal(await video(page).evaluate((el) => el.playbackRate), 1.5);
  assert.equal((await speed.textContent())?.trim(), "1,5×");
  await speed.click();
  assert.equal(await page.getByRole("menu").locator("svg").count(), 1, "only the current speed carries the mark");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Tam ekran" }).click();
  assert.equal(await page.evaluate(() => window.__fsCalls), 1);
});

await scenario("6. Oynarken kontrol satırı bir süre sonra çekilir, fare kıpırdayınca geri gelir; durunca hep görünür", async ({ page }) => {
  await page.getByRole("button", { name: "Oynat" }).first().click();
  await page.mouse.move(5, 5);
  assert.equal(await player(page).getAttribute("data-idle"), "false");
  await page.waitForTimeout(3000);
  assert.equal(await player(page).getAttribute("data-idle"), "true", "controls stepped aside");
  const row = page.locator("[data-player-time]").locator("xpath=..");
  assert.equal(await row.evaluate((el) => getComputedStyle(el).opacity), "0");
  // The thin line stays (it is the only thing left).
  assert.ok((await page.locator("[data-player-scrub] > div").boundingBox()).height >= 3);
  const box = await player(page).boundingBox();
  await page.mouse.move(box.x + 200, box.y + 60);
  await page.waitForTimeout(300);
  assert.equal(await player(page).getAttribute("data-idle"), "false", "moving the pointer brings them back");
  await page.keyboard.press("Escape");
  await player(page).focus();
  await page.keyboard.press("k");
  await page.waitForTimeout(3000);
  assert.equal(await player(page).getAttribute("data-idle"), "false", "paused: controls stay");
});

await scenario("7. Sona gelince durur ve ortadaki düğme geri gelir; tekrar basınca baştan oynar", async ({ page }) => {
  await player(page).focus();
  await page.keyboard.press("9");
  await page.keyboard.press("k");
  await page.waitForFunction(() => document.querySelector("[data-media-player]")?.getAttribute("data-playing") === "false", null, { timeout: 7000 });
  assert.equal(await timeText(page), "0:24 / 0:24");
  await page.getByRole("button", { name: "Oynat" }).first().waitFor();
});

await scenario("8. Telefon (390 px): yatay taşma yok, düğmeler ve çizgi ≥ 36 px", async ({ page }) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, "no horizontal overflow");
  for (const sel of ["[data-player-mute]", "[data-player-fullscreen]", "[data-player-scrub]"]) {
    const b = await page.locator(sel).boundingBox();
    assert.ok(b.height >= 36 && b.width >= 36 || sel === "[data-player-scrub]" && b.height >= 36, `${sel} touch target ${JSON.stringify(b)}`);
  }
  const box = await player(page).boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390.5, `player inside the screen ${JSON.stringify(box)}`);
}, { viewport: { width: 390, height: 844 } });

await scenario("9. İngilizce: etiketler ve hız metni çevrilmiş (1.5×, Full screen, Playback speed)", async ({ page }) => {
  await page.getByRole("button", { name: "Playback speed" }).click();
  await page.getByRole("menuitem", { name: "1.5×" }).click();
  assert.equal((await page.getByRole("button", { name: "Playback speed" }).textContent())?.trim(), "1.5×");
  await page.getByRole("button", { name: "Full screen" }).waitFor();
  await page.getByRole("button", { name: "Turn sound off" }).waitFor();
  await page.getByRole("slider", { name: "Seek" }).waitFor();
  await page.getByRole("button", { name: "Play" }).first().waitFor();
}, { lang: "en" });

await scenario("10. Prompt detay sayfası (local): video promptun çıktısı aynı oynatıcıyla gelir, yerel kontrol yok, oynatır", async ({ page }) => {
  assert.equal(await page.locator("[data-media-player]").count(), 1, "one player on the prompt page");
  assert.equal(await video(page).evaluate((el) => el.hasAttribute("controls")), false, "no native controls");
  assert.equal(await video(page).getAttribute("src"), "https://example.com/out/clip.mp4");
  await shot(page, "player-prompt-paused");
  await page.getByRole("button", { name: "Oynat" }).first().click();
  await page.mouse.move(400, 300);
  await page.keyboard.press("5");
  await page.waitForTimeout(400);
  await shot(page, "player-prompt-playing");
  assert.equal((await page.evaluate(() => window.__plays)).length, 1, "plays");
  await page.keyboard.press("m");
  assert.equal(await player(page).getAttribute("data-playing"), "true");
  const box = await player(page).boundingBox();
  assert.ok(box.width > 200 && box.height > 100, `player has a size ${JSON.stringify(box)}`);
}, { path: PAGES.prompt });

console.log("\n" + results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(failed ? 1 : 0);
