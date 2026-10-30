// Sonuç kartı + İstatistik penceresi (docs/history/281-*) + profildeki "Sonuçlar" bölümü (docs/history/282-*): sonuç kartında yalnız görsel — sol altta yaratıcı, sağ altta tepki düğmesi;
// istatistik penceresinde özet kutuları = sekmeler, tepki dağılımı, tepki rozetli satırlar, yorum balonu. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { installDetailData, ID, PAGES } from "./detail-fixtures.mjs";

const PORT = 4201;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, ...headers }, body: JSON.stringify(body) });

const profile = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [], is_demo: false });
const thumb = (a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${a}"/><circle cx="200" cy="200" r="90" fill="${b}"/></svg>`)}`;
const RESULTS = [
  { id: "c0000000-0000-4000-8000-000000000001", prompt_id: ID.prompt, media_type: "image", thumbnail_url: thumb("#3f6e8c", "#d9e4ee"), text_content: null, tool: "Midjourney", has_modification: true, like_count: 0, created_at: "2026-09-21T10:00:00Z", profiles: profile(U.bob) },
  { id: "c0000000-0000-4000-8000-000000000002", prompt_id: ID.prompt, media_type: "video", thumbnail_url: thumb("#8a5a44", "#f2d2b0"), text_content: null, tool: null, has_modification: false, like_count: 3, created_at: "2026-09-21T09:00:00Z", profiles: profile(U.carol) },
];
const PROFILE_ROWS = [
  { id: RESULTS[0].id, prompt_id: ID.prompt, prompt_title: "Sisli ormanda neon tilki", media_type: "image", thumbnail_url: RESULTS[0].thumbnail_url, text_content: null, tool: "Midjourney", has_modification: true, like_count: 0, created_at: "2026-09-21T10:00:00Z", total_count: 2 },
  { id: "c0000000-0000-4000-8000-000000000009", prompt_id: null, prompt_title: null, media_type: "image", thumbnail_url: thumb("#2b3a67", "#f6c9a0"), text_content: null, tool: null, has_modification: false, like_count: 1, created_at: "2026-09-20T10:00:00Z", total_count: 2 },
];
/** A result whose prompt was deleted, as the detail query returns it (no `prompts` embed). */
const ORPHAN_DETAIL = { id: "c0000000-0000-4000-8000-000000000009", prompt_id: null, media_type: "text", media_url: null, thumbnail_url: null, width: null, height: null, text_content: "Prompt silinmiş bir sonucun metni", tool: null, has_modification: false, modification_summary: null, modified_prompt_text: null, like_count: 1, comment_count: 2, created_at: "2026-09-20T10:00:00Z", profiles: profile(U.bob), prompts: null };
const OWN_PROMPT = {
  id: "b0000000-0000-4000-8000-0000000000e1", title: "Sisli ormanda neon tilki", description: "d", prompt_text: "metin", tool: null, tools: [], content_type: "text", category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 48, save_count: 0, comment_count: 9, copy_count: 0, quote_count: 0, created_at: "2026-02-01T00:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: profile(U.alice), prompt_media: [], prompt_tags: [],
};
/** 13 tepki: 8 sevdim, 3 ateş, 1 vay be, 1 faydalı. */
const STATS = [{ reaction: "love", n: 8 }, { reaction: "fire", n: 3 }, { reaction: "wow", n: 1 }, { reaction: "idea", n: 1 }];
const REACTORS = [
  { u: U.bob, reaction: "fire", created_at: "2026-09-21T10:00:00Z" }, { u: U.carol, reaction: "love", created_at: "2026-09-21T09:00:00Z" },
  { u: U.dave, reaction: "idea", created_at: "2026-09-21T08:00:00Z" },
];
const engager = (u, at, body = null) => ({ actor_id: u.id, actor_username: u.username, actor_display_name: u.display_name, actor_avatar_url: null, actor_follower_count: 1, interacted_at: at, comment_id: body ? "cm" : null, comment_body: body });

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", path = PAGES.prompt, noResults = false, orphanDetail = false, ownPrompts = false, communityPrompt = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { engagerCalls: [], profileCalls: [], countCalls: [] };
  db.rpc.content_engagers = (body) => {
    state.engagerCalls.push(body);
    return { body: body.p_kind === "comments" ? [engager(U.bob, "2026-09-21T10:00:00Z", "Işığı çok iyi yakalamışsın.")] : [engager(U.carol, "2026-09-21T09:00:00Z")] };
  };
  db.rpc.reaction_friends = () => ({ body: [] });
  db.rpc.profile_results = (body) => { state.profileCalls.push(body); return { body: noResults ? [] : PROFILE_ROWS }; };
  db.rpc.profile_result_count = (body) => { state.countCalls.push(body); return { body: noResults ? 0 : PROFILE_ROWS.length }; };
  if (ownPrompts) {
    // alice's own profile lists her prompts (the card menu offers "Sil").
    db.extraRoutes = async (ctx) => (ctx.table === "prompts" && ctx.q.get("author_id") ? ctx.rows([OWN_PROMPT]) : null);
  }
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompt_results/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const accept = req.headers().accept ?? "";
    // The delete dialog's impact read: three newest thumbnails + the total (12).
    if (url.searchParams.get("select") === "thumbnail_url") return json(route, RESULTS.concat(RESULTS[0]).map((r) => ({ thumbnail_url: r.thumbnail_url })).slice(0, 3), 200, { "content-range": "0-2/12" });
    if (url.searchParams.get("id")) {
      const row = orphanDetail ? ORPHAN_DETAIL : RESULTS[0];
      return json(route, accept.includes("vnd.pgrst.object") ? row : [row]);
    }
    return json(route, RESULTS, 200, { "content-range": `0-${RESULTS.length - 1}/${RESULTS.length}` });
  });
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get("select") ?? "";
    if (route.request().method() !== "GET" || url.searchParams.get("id") !== `eq.${OWN_PROMPT.id}`) return route.fallback();
    if (select.startsWith("title")) return json(route, { title: OWN_PROMPT.title, like_count: 48, comment_count: 9, community_id: communityPrompt ? "c0000000-0000-4000-8000-0000000000aa" : null });
    if (select === "community_id") return json(route, { community_id: communityPrompt ? "c0000000-0000-4000-8000-0000000000aa" : null });
    return route.fallback();
  });
  await context.route(/\/rest\/v1\/reaction_stats/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("target_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
    return json(route, ids.flatMap((id) => STATS.map((s) => ({ ...s, target_id: id }))));
  });
  await context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return route.fulfill({ status: 204, body: "" });
    const select = url.searchParams.get("select") ?? "";
    if (select.includes("profiles")) {
      const rows = REACTORS.map((r) => ({ user_id: r.u.id, reaction: r.reaction, created_at: r.created_at, profiles: profile(r.u) }));
      return json(route, rows, 200, { "content-range": `0-${rows.length - 1}/${rows.length}` });
    }
    return json(route, []);
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + path);
    if (path === PAGES.prompt) await page.locator("[data-detail-actions]").waitFor();
    await fn({ page, state, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/rs-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const box = async (locator) => (await locator.boundingBox());
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const openStats = async (page) => {
  await page.locator("[data-detail-actions]").getByRole("button", { name: /İstatistik|statistics/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return dialog;
};

await scenario("1. Sonuç kartı: yalnız görsel — sol altta yaratıcı (@kullanıcı), sağ altta tepki düğmesi; araç / değişiklik / zaman yazısı yok; video köşe rozeti taşır", async ({ page }) => {
  const section = page.getByRole("heading", { name: /Kullanıcı sonuçları/ }).locator("xpath=ancestor::section[1]");
  await section.getByText("@" + U.bob.username).waitFor();
  const card = section.locator("div.group", { has: page.getByText("@" + U.bob.username) }).first();
  const c = await box(card);
  const name = await box(card.getByRole("link", { name: new RegExp("@" + U.bob.username) }));
  const react = await box(card.getByRole("button", { name: /tepki/i }));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/results-desktop.png`, fullPage: true });
  assert.ok(name.x < c.x + c.width / 2 && name.y + name.height > c.y + c.height - 44 && name.y + name.height <= c.y + c.height + 1, `creator bottom-left ${JSON.stringify({ c, name })}`);
  assert.ok(react.x + react.width > c.x + c.width - 16 && react.y + react.height > c.y + c.height - 44 && react.y + react.height <= c.y + c.height + 1, "reaction button bottom-right");
  const text = (await card.textContent()) ?? "";
  assert.ok(!/Midjourney|Değişiklik|önce/.test(text), `no tool / modification / time text on the card: "${text}"`);
  assert.equal(await card.getByRole("button", { name: /tepki/i }).evaluate((el) => /\d/.test(el.textContent ?? "")), false, "a result with 0 reactions shows no number");
  const second = section.locator("div.group", { has: page.getByText("@" + U.carol.username) }).first();
  assert.match((await second.getByRole("button", { name: /tepki/i }).textContent()) ?? "", /3/, "count shown once there are reactions");
  assert.equal(await second.locator("span.absolute.right-2.top-2").count(), 1, "video corner badge");
  assert.equal(await overflowFree(page), true);
});

await scenario("1b. Sonuç kartı telefonda (390px): iki sütun, düğme ve ad kart içinde, taşma yok", async ({ page }) => {
  const section = page.getByRole("heading", { name: /Kullanıcı sonuçları/ }).locator("xpath=ancestor::section[1]");
  await section.getByText("@" + U.bob.username).waitFor();
  const card = section.locator("div.group", { has: page.getByText("@" + U.bob.username) }).first();
  const c = await box(card);
  const react = await box(card.getByRole("button", { name: /tepki/i }));
  assert.ok(react.x >= c.x && react.x + react.width <= c.x + c.width + 1, "reaction button stays inside the card");
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await scenario("2. İstatistik: özet kutuları sekmedir (Tepki seçili), tepki dağılımı çubuğu + emojili sayılar, satırlarda tepki rozeti; Kopyalama kutusu sekme değil", async ({ page }) => {
  const dialog = await openStats(page);
  const tabs = dialog.getByRole("tab");
  assert.equal(await tabs.count(), 3, "Tepki · Yorum · Kaydetme");
  assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
  assert.match((await tabs.first().getAttribute("aria-label")) ?? "", /Tepki verenler 13/);
  await dialog.getByText("Kopyalama").waitFor();
  const mix = dialog.locator("ul li[aria-label]");
  assert.equal(await mix.count(), 4, "one legend entry per reaction given");
  assert.match((await mix.first().getAttribute("aria-label")) ?? "", /Sevdim 8/);
  await dialog.getByText("@" + U.bob.username).waitFor();
  assert.equal(await dialog.getByRole("tabpanel").locator('li img[src*="reactions"]').count(), 3, "each reactor row carries the reaction badge");
  assert.equal(await overflowFree(page), true);
});

await scenario("2b. İstatistik: Yorum sekmesi yorum balonunu gösterir (rozet ve dağılım yok); Kaydetme sekmesi kişi listesi", async ({ page, state }) => {
  const dialog = await openStats(page);
  await dialog.getByRole("tab", { name: /Yorum Yapanlar/ }).click();
  await dialog.getByText("Işığı çok iyi yakalamışsın.").waitFor();
  assert.equal(await dialog.locator("ul li[aria-label]").count(), 0, "mix bar only on the reactions tab");
  assert.equal(await dialog.getByRole("tabpanel").locator('li img[src*="reactions"]').count(), 0, "no reaction badge on comments");
  await dialog.getByRole("tab", { name: /Kaydedenler/ }).click();
  await dialog.getByText("@" + U.carol.username).waitFor();
  assert.deepEqual(state.engagerCalls.map((c) => c.p_kind).sort(), ["comments", "saves"], "likes come from the reactors query, the others from content_engagers");
});

await scenario("2c. İstatistik telefonda (390px): kart %75 yüksekliği aşmaz, dört kutu yan yana sığar, taşma yok; İngilizce etiketler", async ({ page }) => {
  const dialog = await openStats(page);
  await page.waitForTimeout(600); // the sheet slides up
  const panel = dialog.locator("div.flex.flex-col").first();
  const b = await box(panel);
  assert.ok(b.height <= 844 * 0.75 + 1, `sheet height ${b.height}`);
  const tiles = dialog.getByRole("tab");
  const first = await box(tiles.first());
  const last = await box(tiles.last());
  assert.ok(last.x + last.width <= 390, "tiles fit the screen");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stats-390.png` });
  assert.ok(Math.abs(first.y - last.y) < 2, `tiles share one row (${first.y} vs ${last.y})`);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 }, lang: "en" });

const openSection = async (page, key) => {
  const menu = page.locator("[data-profile-controls] [data-section-menu]");
  await menu.waitFor();
  await menu.click();
  await page.locator(`[data-section-option="${key}"]`).click();
};
/** The menu's rows ("Sonuçlar 2"), read with the menu open. */
const sectionRows = async (page) => {
  await page.locator("[data-profile-controls] [data-section-menu]").click();
  const rows = await page.locator("[data-section-option]").evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, " ").trim()));
  await page.keyboard.press("Escape");
  return rows;
};

await scenario("3. Profil: 'Sonuçlar' menüde sayıyla (2); açınca kartlarda promptun adı (yazar adı değil), silinmiş promptun sonucu 'Prompt silindi'; RPC yaratıcıyla çağrılır; karttan sonuç sayfasına gidilir", async ({ page, state }) => {
  await page.locator("[data-profile-controls] [data-section-menu]").waitFor();
  await page.waitForTimeout(300);
  const items = await sectionRows(page);
  assert.ok(items.some((n) => /Sonuçlar\s*2/.test(n)), `menu lists Sonuçlar 2: ${items.join(" | ")}`);
  await openSection(page, "results");
  const grid = page.locator("[data-profile-results]");
  await grid.waitFor();
  assert.equal(await grid.locator("div.group").count(), 2);
  assert.equal(await grid.locator("[data-result-prompt]").first().textContent(), "Sisli ormanda neon tilki", "bottom-left is the prompt's title");
  assert.equal(await grid.getByText("@" + U.bob.username).count(), 0, "no creator name on the profile cards");
  const dead = grid.locator("div.group", { has: page.locator("[data-result-prompt-deleted]") });
  assert.equal(await dead.count(), 1, "the deleted prompt's result");
  await dead.getByText("Prompt silindi").waitFor();
  await dead.getByText("Yalnız sen görürsün").waitFor();
  await shot(page, "profile-results");
  assert.equal(state.profileCalls.at(-1)?.p_creator, U.bob.id, "asked for this person's results");
  assert.equal(state.countCalls.at(-1)?.p_creator, U.bob.id);
  assert.match((await grid.locator("a[aria-label]").first().getAttribute("href")) ?? "", /\/results\/local\/?\?id=/);
  assert.equal(await overflowFree(page), true);
}, { path: `/profile/real?username=${U.bob.username}` });

await scenario("3b. Profil: sonucu olmayan kişinin profilinde 'Sonuçlar' bölümü yok", async ({ page }) => {
  await page.locator("[data-profile-controls] [data-section-menu]").waitFor();
  await page.waitForTimeout(400);
  const items = await sectionRows(page);
  assert.ok(!items.some((n) => /Sonuçlar/.test(n)), `no Sonuçlar for a visitor: ${items.join(" | ")}`);
}, { path: `/profile/real?username=${U.bob.username}`, noResults: true });

await scenario("3c. Kendi profilim: sonuç yokken bölüm görünür ve boş durum prompt keşfetmeye yönlendirir; İngilizce", async ({ page }) => {
  await page.locator("[data-profile-controls] [data-section-menu]").waitFor();
  await openSection(page, "results");
  await page.getByText("Results you share after using a prompt are collected here.").waitFor();
  await page.getByRole("link", { name: /Explore|Keşfet/ }).first().waitFor();
}, { path: `/profile/real?username=${U.alice.username}`, noResults: true, lang: "en" });

await scenario("4. Yetim sonuç sayfası: 'prompt silindi' notu, beğeni / yorum / paylaş yok; metin görünür", async ({ page }) => {
  await page.getByText("Prompt silinmiş bir sonucun metni").first().waitFor();
  await page.locator("[data-result-orphan]").waitFor();
  assert.match((await page.locator("[data-result-orphan]").textContent()) ?? "", /Bu sonucun promptu silindi.*yalnızca sana görünür/);
  assert.equal(await page.locator('[data-detail-actions] button[aria-haspopup="menu"]').count(), 0, "no reaction button");
  assert.equal(await page.locator("#comments").count(), 0, "comments are closed");
  await shot(page, "orphan-detail");
  assert.equal(await page.locator("[data-detail-actions]").getByRole("button", { name: /Paylaş/ }).count(), 0, "no share");
  assert.equal(await overflowFree(page), true);
}, { path: "/results/local?id=c0000000-0000-4000-8000-000000000009", orphanDetail: true });

const openOwnPromptDelete = async (page) => {
  const trigger = page.getByRole("button", { name: /Gönderi seçenekleri|Post options/ }).first();
  await trigger.evaluate((el) => el.scrollIntoView({ block: "start" })); // room for the menu under the card on a phone
  await page.evaluate(() => window.scrollBy(0, -120));
  await trigger.click();
  await page.waitForTimeout(900); // the menu pops in (and a phone's chrome settles after the scroll)
  await page.getByRole("menuitem", { name: "Sil", exact: true }).dispatchEvent("click");
  const dialog = page.locator("[data-delete-prompt-dialog]");
  await dialog.waitFor();
  return dialog;
};

await scenario("5. Prompt silme: onay penceresi sonuçların SİLİNMEDİĞİNİ söyler (12, küçük resimler + '+9'), beğeni/yorum silinir, bildirim notu; Vazgeç silmez, onay DELETE yazar", async ({ page, db }) => {
  await page.getByRole("link", { name: "Sisli ormanda neon tilki" }).first().waitFor();
  const dialog = await openOwnPromptDelete(page);
  await dialog.getByText("«Sisli ormanda neon tilki» kalıcı olarak silinir.").waitFor();
  await dialog.getByText("12 kullanıcı sonucu silinmez").waitFor();
  await dialog.getByText(/«Prompt silindi» notuyla kalır, yalnız sahibine görünür/).waitFor();
  await dialog.getByText("+9").waitFor();
  await dialog.getByText("Promptun 48 beğenisi ve 9 yorumu silinir").waitFor();
  await dialog.getByText(/Sonuç sahiplerine bildirim gider/).waitFor();
  await shot(page, "delete-desktop");
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(db.calls.filter((c) => c.method === "DELETE" && c.table === "prompts").length, 0, "cancel deletes nothing");
  await openOwnPromptDelete(page);
  await page.locator("[data-delete-prompt-confirm]").click();
  await page.waitForTimeout(500);
  assert.equal(db.calls.filter((c) => c.method === "DELETE" && c.table === "prompts").length, 1, "the prompt is deleted");
  assert.equal(db.calls.filter((c) => c.method === "DELETE" && c.table === "prompt_results").length, 0, "results are not deleted by the client");
}, { path: `/profile/real?username=${U.alice.username}`, ownPrompts: true });

await scenario("5b. Prompt silme (topluluğa özgü içerik): sonuçlar da silinir uyarısı; telefonda kart taşmaz", async ({ page }) => {
  await page.getByRole("link", { name: "Sisli ormanda neon tilki" }).first().waitFor();
  const dialog = await openOwnPromptDelete(page);
  await dialog.getByText("12 kullanıcı sonucu da silinir").waitFor();
  assert.equal(await dialog.getByText(/Sonuç sahiplerine bildirim gider/).count(), 0, "no notification note when the results go with the prompt");
  await shot(page, "delete-community-390");
  await page.waitForTimeout(500);
  const b = await box(dialog);
  assert.ok(b.x >= 0 && b.x + b.width <= 390 + 1, `dialog fits the phone (${b.x}+${b.width})`);
  assert.equal(await overflowFree(page), true);
}, { path: `/profile/real?username=${U.alice.username}`, ownPrompts: true, communityPrompt: true, viewport: { width: 390, height: 844 } });

console.log(results.map(([s, n]) => `${s === "PASS" ? "✓" : "✗"} ${n}`).join("\n"));
const failed = results.filter(([s]) => s !== "PASS").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(failed ? 1 : 0);
