// Kartlarda video/ses kendiliğinden oynar: ekranın ortasına en yakın kart oynar (aynı anda yalnız biri), kartın ortasında
// durdur/başlat düğmesi (dokunuşu yazıyı açmaz), ilerleme çubuğu/sayacı YOK, hareketi azalt isteyende yalnız düğme. Odak'ta da aynı düğme + ilerleme yok,
// ses gönderisi kendiliğinden (sesle) başlar. Ağ taklitli; `HTMLMediaElement.play/pause` taslaklanır (`refuseSound`: ilk dokunuştan önce sesli oynatmayı reddeder) (gerçek video/ses çözülmez);
// gerçek Supabase'e / cihaza / iOS Safari'ye KARŞI DENENMEDİ (tarayıcı politikası sese kendiliğinden izin vermeyebilir — o durumda düğme bekler).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4195/promptly";
const server = await serve(4195);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (i) => `c0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
const base = { description: "d", tool: null, tools: [], category: null, subcategory: null, status: "published", origin_type: "original", request_id: null, like_count: 3, save_count: 0, comment_count: 0, copy_count: 0, show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, prompt_tags: [] };

/** 1 görsel, 2 video, 3 ses, 4 video, 5 ses … (kareler: telefonda her kart ≈ ekranın yarısı). */
function row(i) {
  const type = i === 1 ? "image" : i % 2 === 0 ? "video" : "audio";
  const cover = { id: `m${i}`, url: svg("#1b2a49", "#e86a3c", 800, 800), width: 800, height: 800, alt: `Kapak ${i}`, position: 0, dominant_color: "#1b2a49", placeholder: svg("#1b2a49", "#e86a3c", 24, 24) };
  return { ...base, id: pid(i), title: `${type === "image" ? "Görsel" : type === "video" ? "Video" : "Ses"} prompt ${i}`, prompt_text: `text ${i}`, content_type: type, created_at: new Date(Date.now() - i * 3600_000).toISOString(), profiles: author(i % 2 ? U.bob : U.carol), prompt_media: [cover] };
}
const output = (r) => ({ id: `r-${r.id}`, prompt_id: r.id, media_type: r.content_type, media_url: `https://example.com/out/${r.id}.${r.content_type === "video" ? "mp4" : "mp3"}`, thumbnail_url: null, width: null, height: null, text_content: null, tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 0, comment_count: 0, created_at: "2026-10-02T11:00:00Z", profiles: r.profiles, prompts: null });

/** play()/pause() kaydı + olaylar; `window.__media` içinde sıra. `refuseSound` = sesli oynatmayı reddeden tarayıcı. */
const MEDIA_STUB = (refuseSound) => {
  window.__media = [];
  window.__gesture = false;
  addEventListener("pointerdown", () => (window.__gesture = true), true);
  const proto = HTMLMediaElement.prototype;
  proto.play = function play() {
    if (refuseSound && !this.muted && !window.__gesture) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    window.__media.push({ op: "play", tag: this.tagName, muted: this.muted, src: this.getAttribute("src") });
    Object.defineProperty(this, "paused", { configurable: true, get: () => false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function pause() {
    window.__media.push({ op: "pause", tag: this.tagName, src: this.getAttribute("src") });
    Object.defineProperty(this, "paused", { configurable: true, get: () => true });
    this.dispatchEvent(new Event("pause"));
  };
};

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, reducedMotion = false, refuseSound = false, count = 12 } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => row(i + 1));
  const outputs = Object.fromEntries(rows.filter((r) => r.content_type !== "image").map((r) => [r.id, output(r)]));
  db.rpc.feed_page = () => ({ body: rows.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 1 })) });
  db.rpc.for_you_page = () => ({ body: rows.map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i, reason_kind: "popular", reason_ref: null })) });
  db.rpc.trending_tags = () => ({ body: [] });
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await installMock(context, db, {});
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/prompt_results\?/, (route) => {
    const url = new URL(route.request().url());
    const byPrompt = (url.searchParams.get("prompt_id") ?? "").replace("eq.", "");
    const byId = (url.searchParams.get("id") ?? "").replace("eq.", "");
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const hit = byPrompt ? outputs[byPrompt] : Object.values(outputs).find((o) => o.id === byId);
    const body = single ? hit ?? null : hit ? [hit] : [];
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await context.route(/\/rest\/v1\/profiles\?.*order=follower_count/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
  await context.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
  await context.addInitScript(MEDIA_STUB, refuseSound);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("promptly-language", "tr");
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, rows });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ca-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const cell = (page, n) => page.locator("[data-flip-key]").nth(n);
const ops = (page) => page.evaluate(() => window.__media.slice());
const waitFeed = async (page) => { await page.locator("[data-flip-key]").first().waitFor(); };
/** Bir kartı ekranın dikey ortasına getirir. */
const center = async (page, n) => {
  await cell(page, n).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(700);
};
/** Şu an oynayan (son işlemi "play" olan) kaynaklar. */
const playingSrcs = (list) => {
  const last = new Map();
  for (const m of list) last.set(m.src, m.op);
  return [...last].filter(([, op]) => op === "play").map(([src]) => src);
};

await scenario("1. video kartı ekranın ortasındayken sessiz oynar; ortada durdur düğmesi, ilerleme çubuğu/sayacı yok", async ({ page, rows }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await center(page, 1); // 2. gönderi = video
  const video = cell(page, 1).locator("video");
  await video.waitFor({ state: "attached" });
  assert.equal(await video.getAttribute("src"), `https://example.com/out/${rows[1].id}.mp4`);
  const list = await ops(page);
  assert.ok(list.some((m) => m.op === "play" && m.tag === "VIDEO" && m.muted === true), `video autoplays muted: ${JSON.stringify(list)}`);
  const button = cell(page, 1).getByRole("button", { name: "Duraklat" });
  await button.waitFor({ state: "attached" });
  const box = await button.boundingBox();
  const media = await cell(page, 1).locator("[data-card-media]").boundingBox();
  assert.ok(Math.abs(box.x + box.width / 2 - (media.x + media.width / 2)) < 2 && Math.abs(box.y + box.height / 2 - (media.y + media.height / 2)) < 2, "düğme resmin tam ortasında");
  assert.equal(await cell(page, 1).locator("[role='progressbar'], progress, input[type='range']").count(), 0, "ilerleme çubuğu / sayaç yok");
  assert.equal(await cell(page, 1).locator("video").evaluate((el) => el.hasAttribute("controls")), false, "yerel kontrol çubuğu yok");
});

await scenario("2. düğme durdurur/başlatır ve yazıyı AÇMAZ; resmin başka yerine dokunmak yine açar", async ({ page, rows }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await center(page, 1);
  const url = page.url();
  await cell(page, 1).getByRole("button", { name: "Duraklat" }).click({ force: true });
  await page.waitForTimeout(300);
  assert.equal(page.url(), url, "düğme sayfayı açmadı");
  assert.equal((await ops(page)).at(-1).op, "pause", "durdu");
  await cell(page, 1).getByRole("button", { name: "Oynat" }).waitFor();
  await cell(page, 1).getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(300);
  assert.equal((await ops(page)).at(-1).op, "play", "yeniden başladı");
  assert.equal(page.url(), url);
  // Elle durdurulan kart, ekranda kaldığı sürece kendiliğinden yeniden başlamaz.
  await cell(page, 1).getByRole("button", { name: "Duraklat" }).click({ force: true });
  await page.waitForTimeout(600);
  assert.equal((await ops(page)).at(-1).op, "pause");
  // Başlık bağlantısı hâlâ detaya götürür.
  await cell(page, 1).getByRole("link", { name: rows[1].title }).click();
  await page.waitForURL(/\/prompts\/local\/?\?id=/);
});

await scenario("3. aynı anda yalnız bir kart oynar: kaydırınca öncekiler durur, ortadaki başlar", async ({ page, rows }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await center(page, 1); // video
  let playing = playingSrcs(await ops(page));
  assert.deepEqual(playing, [`https://example.com/out/${rows[1].id}.mp4`]);
  await center(page, 2); // ses
  playing = playingSrcs(await ops(page));
  assert.deepEqual(playing, [`https://example.com/out/${rows[2].id}.mp3`], `yalnız ses oynar: ${JSON.stringify(await ops(page))}`);
  const audio = (await ops(page)).filter((m) => m.op === "play" && m.tag === "AUDIO").at(-1);
  assert.equal(audio.muted, false, "ses sesli başlar");
  await center(page, 3); // video
  playing = playingSrcs(await ops(page));
  assert.deepEqual(playing, [`https://example.com/out/${rows[3].id}.mp4`]);
});

await scenario("4. görsel kartı oynatma düğmesi taşımaz; uzaktaki video çıktısını hiç yüklemez", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  assert.equal(await cell(page, 0).getByRole("button", { name: /Oynat|Duraklat/ }).count(), 0);
  assert.equal(await cell(page, 11).locator("video, audio").count(), 0, "uzak kart medya öğesi kurmaz");
});

await scenario("5. tarayıcı sesi reddederse ses kartı düğmede bekler; düğmeyle çalar", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await center(page, 2);
  assert.equal((await ops(page)).filter((m) => m.tag === "AUDIO" && m.op === "play").length, 0, "sesli oynatma reddedildi");
  await cell(page, 2).getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(300);
  assert.ok((await ops(page)).some((m) => m.tag === "AUDIO" && m.op === "play" && m.muted === false), "dokunuştan sonra sesle çalar");
}, { refuseSound: true });

await scenario("6. hareketi azalt: kendiliğinden oynamaz, düğme oynatır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await center(page, 1);
  assert.equal((await ops(page)).filter((m) => m.op === "play").length, 0, "kendiliğinden oynamadı");
  await cell(page, 1).getByRole("button", { name: "Oynat" }).click();
  await page.waitForTimeout(300);
  assert.ok((await ops(page)).some((m) => m.op === "play" && m.tag === "VIDEO"));
}, { reducedMotion: true });

await scenario("7. masaüstü: iki sütunlu akışta yalnız ekran ortasına en yakın kart oynar", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.waitForTimeout(500);
  await center(page, 1);
  const playing = playingSrcs(await ops(page));
  assert.ok(playing.length <= 1, `en çok bir kart oynar: ${JSON.stringify(playing)}`);
}, { viewport: { width: 1280, height: 900 } });

console.log("\n" + results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(failed ? 1 : 0);
