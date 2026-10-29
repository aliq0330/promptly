// Tepkiler (docs/history/265-*): beğeni düğmesi altı tepkilik seçiciyi açar (Telegram emojileri), seçilen emoji düğmede görünür ve efekti oynar,
// "Sen, Bob ve 12 kişi tepki verdi" özeti + "Tepkiler" sayfası (sekmeler, kim ne verdi), tepki değiştirme (PATCH) / kaldırma (DELETE) / `love`
// sütunsuz yazılır, ziyaretçi giriş penceresi, İngilizce, telefon düzeni, hareketi azalt. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (kurallar ve RLS: supabase/tests/reactions.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { installDetailData, ID, PAGES } from "./detail-fixtures.mjs";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
const FEED_PROMPT = "b0000000-0000-4000-8000-000000000001";

const profile = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [], is_demo: false });
const feedPromptRow = () => ({
  id: FEED_PROMPT, title: "Ay ışığında bekleyen kitsune", description: "d", prompt_text: "cinematic portrait, soft light", tool: null, tools: [],
  content_type: "text", category: "writing", subcategory: null, status: "published", origin_type: "original", request_id: null,
  like_count: 13, save_count: 0, comment_count: 0, copy_count: 0, quote_count: 0, created_at: "2026-09-20T10:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: profile(U.carol), prompt_media: [], prompt_tags: [],
});

/** 13 tepki: 8 sevdim, 3 ateş, 1 vay be, 1 faydalı (beğeni sayacı 13); Bob (takip edilen) ateş vermiş. */
const BASE_STATS = [
  { target_id: ID.prompt, reaction: "love", n: 8 }, { target_id: ID.prompt, reaction: "fire", n: 3 },
  { target_id: ID.prompt, reaction: "wow", n: 1 }, { target_id: ID.prompt, reaction: "idea", n: 1 },
];
const REACTORS = [
  { u: U.bob, reaction: "fire", created_at: "2026-09-21T10:00:00Z" }, { u: U.carol, reaction: "love", created_at: "2026-09-21T09:00:00Z" },
  { u: U.dave, reaction: "love", created_at: "2026-09-21T08:00:00Z" }, { u: U.amy, reaction: "fire", created_at: "2026-09-21T07:00:00Z" },
];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, reducedMotion = false, mine = null } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { mine, likeCalls: [], patchCalls: [], deleteCalls: [], reactorCalls: [], statsCalls: [], friendsCalls: [] };
  db.rpc.reaction_friends = (body) => {
    state.friendsCalls.push(body);
    return { body: (body.p_ids ?? []).map((id) => ({ target_id: id, user_id: U.bob.id, reaction: "fire", username: U.bob.username, display_name: U.bob.display_name, avatar_url: null })) };
  };
  db.rpc.feed_page = () => ({ body: [{ kind: "prompt", id: FEED_PROMPT, created_at: "2026-09-20T10:00:00Z", sort_rank: 13 }] });
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.searchParams.get("id") === `eq.${ID.prompt}`) return route.fallback();
    const row = feedPromptRow();
    return json(route, (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
  });
  await context.route(/\/rest\/v1\/reaction_stats/, (route) => {
    state.statsCalls.push(route.request().url());
    const total = (id) => BASE_STATS.filter((s) => s.target_id === ID.prompt).map((s) => ({ ...s, target_id: id })).map((s) => ({ ...s, n: s.n + (state.mine === s.reaction ? 1 : 0) }));
    const ids = (new URL(route.request().url()).searchParams.get("target_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
    return json(route, ids.flatMap((id) => total(id)));
  });
  await context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "POST") {
      state.likeCalls.push(JSON.parse(req.postData() || "{}"));
      state.mine = JSON.parse(req.postData() || "{}").reaction ?? "love";
      return route.fulfill({ status: 201, body: "" });
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      state.patchCalls.push({ body, query: url.search });
      state.mine = body.reaction;
      return json(route, { id: "like-1" });
    }
    if (method === "DELETE") {
      state.deleteCalls.push(url.search);
      state.mine = null;
      return route.fulfill({ status: 204, body: "" });
    }
    const select = url.searchParams.get("select") ?? "";
    if (select.includes("profiles")) {
      state.reactorCalls.push(url.search);
      const only = (url.searchParams.get("reaction") ?? "").replace("eq.", "");
      const rows = REACTORS.filter((r) => !only || r.reaction === only).map((r) => ({ user_id: r.u.id, reaction: r.reaction, created_at: r.created_at, profiles: profile(r.u) }));
      if (state.mine && (!only || only === state.mine)) rows.unshift({ user_id: ME, reaction: state.mine, created_at: "2026-09-22T10:00:00Z", profiles: profile(U.alice) });
      return json(route, rows, 200, { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
    }
    // Viewer's own reaction: `select=<target>_id,reaction&user_id=eq.<me>`.
    return json(route, state.mine ? [{ prompt_id: ID.prompt, reaction: state.mine }, { prompt_id: FEED_PROMPT, reaction: state.mine }] : []);
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/rx-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const waitFor = async (cond, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await new Promise((resolve) => setTimeout(resolve, 100));
};
const openDetail = async (page) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.locator("[data-detail-actions]").waitFor();
};
/** Detay sayfasının tepki düğmesi (eylem çubuğundaki ilk menü düğmesi) ve seçici. */
const reactButton = (page) => page.locator('[data-detail-actions] button[aria-haspopup="menu"]').first();
const menu = (page) => page.getByRole("menu");
const summary = (page) => page.locator(`[data-reaction-summary="${ID.prompt}"]`);
/** Özet metni sayılar/arkadaşlar yüklenince oturur: eşleşene kadar bekler. */
const summaryHas = (page, id, re) => page.waitForFunction(([sid, source]) => new RegExp(source).test(document.querySelector(`[data-reaction-summary=\"${sid}\"]`)?.textContent ?? ""), [id, re.source], { timeout: 6000 });
const effectSvg = (page) => page.locator("[data-reaction-effects] svg");

await scenario("1. Detay: kalbe dokunuş YALNIZ seçiciyi açar (hiçbir şey seçili değil, beğeni yazılmaz, sayaç 13); Ateş seçilince POST `reaction: fire` + emoji + Telegram efekti", async ({ page, state }) => {
  await openDetail(page);
  await summaryHas(page, ID.prompt, /Bob ve 12 kişi tepki verdi/);
  assert.equal(state.statsCalls.length >= 1 && state.friendsCalls.length >= 1, true, "per-reaction counts and followed people were read");
  assert.match((await reactButton(page).getAttribute("aria-label")) ?? "", /^Tepki ver \(13 tepki\)/);
  await reactButton(page).click();
  await menu(page).waitFor();
  await page.waitForTimeout(300);
  assert.equal(state.likeCalls.length, 0, "opening the picker likes nothing");
  const labels = await menu(page).getByRole("menuitem").allInnerTexts();
  assert.deepEqual(labels.map((l) => l.trim()), ["Sevdim", "Ateş", "Vay be", "Alkış", "Komik", "Faydalı"], "no 'remove' row while nothing is given");
  assert.equal(await menu(page).locator('[aria-current="true"]').count(), 0, "nothing is selected");
  assert.equal(await reactButton(page).locator("img").count(), 0, "the heart stays a heart");
  assert.match(await reactButton(page).innerText(), /13/);
  await menu(page).getByRole("menuitem", { name: "Ateş" }).click();
  await waitFor(() => state.likeCalls.length > 0);
  assert.equal(state.likeCalls.length, 1);
  assert.equal(state.likeCalls[0].reaction, "fire");
  assert.equal(state.likeCalls[0].prompt_id, ID.prompt);
  assert.equal(await menu(page).count(), 0, "picker closed after choosing");
  assert.match((await reactButton(page).locator("img").getAttribute("src")) ?? "", /\/promptly\/reactions\/fire\.svg$/);
  assert.match(await reactButton(page).innerText(), /14/);
  await effectSvg(page).first().waitFor({ timeout: 6000 });
  // The burst leaves from the emoji on the button (its origin sits at 78% / 50% of Telegram's effect canvas) and is at most 156 px (60% of the old 260).
  const effectBox = await page.locator("[data-reaction-effects] > div").first().boundingBox();
  assert.ok(effectBox && effectBox.width <= 156.5 && effectBox.height <= 156.5, `effect is at most 156 px (got ${effectBox?.width})`);
  const iconBox = await reactButton(page).locator("img").boundingBox();
  const dx = effectBox.x + effectBox.width * 0.78 - (iconBox.x + iconBox.width / 2);
  const dy = effectBox.y + effectBox.height * 0.5 - (iconBox.y + iconBox.height / 2);
  assert.ok(Math.hypot(dx, dy) < 6, `burst origin is on the button emoji (off by ${Math.round(Math.hypot(dx, dy))} px)`);
  await summaryHas(page, ID.prompt, /Sen, Bob ve 12 kişi tepki verdi/);
  await shot(page, "rx-effect");
  await page.waitForFunction(() => document.querySelectorAll("[data-reaction-effects] svg").length === 0, null, { timeout: 8000 });
});

await scenario("2. Detay: tepki seçilir, değiştirilir (PATCH); tepki varken dokunuş seçiciyi açar (yeni istek yok), seçili olan tepkiye TEKRAR basmak siler (DELETE, sayaç 13, kalp geri gelir)", async ({ page, state }) => {
  await openDetail(page);
  await reactButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Faydalı" }).click();
  await waitFor(() => state.likeCalls.length > 0);
  assert.equal(state.likeCalls[0].reaction, "idea");
  await reactButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Vay be" }).click();
  await waitFor(() => state.patchCalls.length > 0);
  assert.deepEqual(state.patchCalls[0].body, { reaction: "wow" });
  assert.match((await reactButton(page).locator("img").getAttribute("src")) ?? "", /wow\.svg$/);
  assert.match(await reactButton(page).innerText(), /14/);
  await reactButton(page).click();
  const current = menu(page).getByRole("menuitem", { name: "Vay be" });
  await current.waitFor();
  assert.equal(await current.getAttribute("aria-current"), "true", "the current reaction is highlighted");
  assert.equal(state.likeCalls.length, 1, "touching a reacted button never likes again");
  assert.equal(state.deleteCalls.length, 0, "…and never removes");
  await current.click();
  await waitFor(() => state.deleteCalls.length > 0);
  assert.equal(state.deleteCalls.length, 1);
  assert.match(await reactButton(page).innerText(), /13/);
  assert.equal(await reactButton(page).locator("img").count(), 0, "the heart is back");
  await summaryHas(page, ID.prompt, /Bob ve 12 kişi/);
});

await scenario("3. Seçiciyi kapatmak hiçbir şey yazmaz: kalbe dokun, Esc → beğeni yok, sayaç 13, kalp kalp", async ({ page, state }) => {
  await openDetail(page);
  await reactButton(page).click();
  await menu(page).waitFor();
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });
  await page.waitForTimeout(300);
  assert.equal(state.likeCalls.length, 0);
  assert.equal(state.deleteCalls.length, 0);
  assert.match(await reactButton(page).innerText(), /13/);
  assert.equal(await reactButton(page).locator("img").count(), 0, "still a plain heart");
});

await scenario("4. 'Kim ne tepki verdi': özete dokununca Tepkiler sayfası — toplam, sekmeler (Tümü 13 · 8 · 3 · 1 · 1), kişi + @kullanıcı + zaman + tepkisi; sekme süzgeci sunucuya gider", async ({ page, state }) => {
  await openDetail(page);
  await summary(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Tepkiler", { exact: true }).waitFor();
  await dialog.getByText("13 tepki").waitFor();
  const tabs = await dialog.getByRole("tab").allInnerTexts();
  assert.deepEqual(tabs.map((t) => t.trim()), ["Tümü 13", "8", "3", "1", "1"]);
  await dialog.locator("[data-reactor]").first().waitFor();
  assert.equal(await dialog.locator("[data-reactor]").count(), 4);
  const bob = dialog.locator('[data-reactor="bobby"]');
  assert.match(await bob.innerText(), /Bob/);
  assert.match(await bob.innerText(), /@bobby/);
  assert.match(await bob.innerText(), /Ateş/, "the row names the reaction");
  await dialog.getByRole("tab", { name: /Ateş 3/ }).click();
  await waitFor(() => state.reactorCalls.some((q) => q.includes("reaction=eq.fire")));
  assert.ok(state.reactorCalls.some((q) => q.includes("reaction=eq.fire")), "the tab filters on the server");
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-reactor]').length === 2);
  assert.equal(await dialog.getByText("Sevdim", { exact: true }).count(), 0);
  await shot(page, "rx-sheet");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
});

await scenario("5. Sayfadaki kendi satırım: tepki verince listede 'Sen' etiketli satır çıkar ve oradan kaldırılır", async ({ page, state }) => {
  await openDetail(page);
  await reactButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Alkış" }).click();
  await waitFor(() => state.patchCalls.length > 0);
  await summary(page).click();
  const dialog = page.getByRole("dialog");
  const mine = dialog.locator('[data-reactor="alice"]');
  await mine.waitFor();
  assert.match(await mine.innerText(), /Sen/);
  await mine.getByRole("button", { name: "Tepkimi kaldır" }).click();
  await waitFor(() => state.deleteCalls.length > 0);
  assert.equal(state.deleteCalls.length, 1);
  await mine.waitFor({ state: "detached" });
}, { mine: null });

await scenario("6. Ana Sayfa/Keşfet kartı: aynı düğme (kartta Kopyala/Çalıştır ve tepki özeti yok); dokunuş seçiciyi açar, Komik seçilince POST `reaction: haha` ve efekt", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  const card = page.locator("main article").filter({ hasText: "Ay ışığında bekleyen kitsune" }).first();
  await card.waitFor();
  assert.equal(await card.getByRole("button", { name: /Kopyala|Çalıştır|Studio/ }).count(), 0, "no big primary action on a card");
  const button = card.locator('[data-card-actions] button[aria-haspopup="menu"]').first();
  assert.equal(await card.locator("[data-reaction-summary]").count(), 0, "the visual card has no reaction summary (detail page only)");
  await button.click();
  await menu(page).waitFor();
  assert.equal(state.likeCalls.length, 0, "opening the picker likes nothing");
  await menu(page).getByRole("menuitem", { name: "Komik" }).click();
  await waitFor(() => state.likeCalls.length > 0);
  assert.equal(state.likeCalls[0].prompt_id, FEED_PROMPT);
  assert.equal(state.likeCalls[0].reaction, "haha");
  await effectSvg(page).first().waitFor({ timeout: 6000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-reaction-effects] svg").length === 0, null, { timeout: 8000 });
  await card.scrollIntoViewIfNeeded();
  await shot(page, "rx-card");
});

await scenario("7. Ziyaretçi: düğme seçici yerine giriş penceresini açar, hiçbir şey yazılmaz; özet yine görünür", async ({ page, state }) => {
  await openDetail(page);
  await summary(page).waitFor();
  assert.match(await summary(page).innerText(), /13 kişi tepki verdi/, "a guest follows nobody: just the count");
  await page.locator('[data-detail-actions] button[aria-haspopup="dialog"]').first().click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await menu(page).count(), 0);
  assert.equal(state.likeCalls.length, 0);
}, { guest: true });

await scenario("8. Hareketi azalt: efekt hiç çalışmaz, emoji düğmede sabit kalır; tepki yine kaydedilir", async ({ page, state }) => {
  await openDetail(page);
  await reactButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Ateş" }).click();
  await waitFor(() => state.patchCalls.length > 0);
  assert.equal(state.likeCalls.length, 1);
  await page.waitForTimeout(1200);
  assert.equal(await effectSvg(page).count(), 0);
  assert.match((await reactButton(page).locator("img").getAttribute("src")) ?? "", /fire\.svg$/);
}, { reducedMotion: true });

await scenario("9. Önceden tepki vermiş kişi: düğme kendi emojisini gösterir, dokunuş yalnız seçiciyi açar (istek yok), 'Tepkini kaldır' var; klavyeyle açılır, ← → gezer, Esc kapatır", async ({ page, state }) => {
  await openDetail(page);
  await page.waitForFunction(() => document.querySelector('[data-detail-actions] button[aria-haspopup="menu"] img'));
  assert.match((await reactButton(page).locator("img").getAttribute("src")) ?? "", /idea\.svg$/);
  await reactButton(page).focus();
  await page.keyboard.press("Enter");
  await menu(page).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem", "focus moves into the picker");
  await page.keyboard.press("ArrowRight");
  const focusedAfter = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert.ok(focusedAfter && focusedAfter.length > 0);
  assert.equal(await menu(page).getByRole("menuitem", { name: "Tepkini kaldır" }).count(), 1);
  assert.equal(state.likeCalls.length + state.patchCalls.length + state.deleteCalls.length, 0, "opening the picker of a reacted button writes nothing");
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });
}, { mine: "idea" });

await scenario("10. İngilizce: seçici ve özet çevrilmiş", async ({ page }) => {
  await openDetail(page);
  await summaryHas(page, ID.prompt, /Bob and 12 others reacted/);
  assert.match((await reactButton(page).getAttribute("aria-label")) ?? "", /React \(13 reactions\)/);
  await reactButton(page).click();
  const labels = await menu(page).getByRole("menuitem").allInnerTexts();
  assert.deepEqual(labels.map((l) => l.trim()), ["Love", "Fire", "Wow", "Applause", "Funny", "Useful"]);
}, { lang: "en" });

await scenario("11. Telefon: seçici ekrana sığar (yatay taşma yok), Tepkiler sayfası ekranın en çok %75'i ve başlık + sekmeler sabit", async ({ page }) => {
  await openDetail(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await reactButton(page).scrollIntoViewIfNeeded();
  await reactButton(page).click();
  const box = await menu(page).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `picker inside the screen (${JSON.stringify(box)})`);
  assert.equal(await overflowFree(page), true);
  await shot(page, "rx-mobile-picker");
  await page.keyboard.press("Escape");
  await summary(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-reactor]").first().waitFor();
  const panel = await dialog.locator("> div").first().boundingBox();
  assert.ok(panel && panel.height <= 844 * 0.75 + 1, `sheet ≤ 75% of the screen (${panel?.height})`);
  assert.equal(await overflowFree(page), true);
  await shot(page, "rx-mobile-sheet");
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
