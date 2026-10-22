// Tek paylaşım + Space gönderisi (docs/history/215-*): akışta Space kartı (beğeni yedinci hedef), Keşfet → Spaces, Space sayfasında
// etkileşim + yorumlar, sahibin "Akışta gönderi olarak paylaş" anahtarı (set_space_shared + hata), Oluştur → Space / Var olan içeriği
// paylaş, genel akışta "duyuruldu" çipi. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (kurallar: supabase/tests/space-posts.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID, MEDIA } from "./mock-spaces.mjs";
import { installDetailData, svg } from "./detail-fixtures.mjs";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const COMMUNITY = "c0000000-0000-4000-8000-000000000001";
const PROMPT = "b0000000-0000-4000-8000-000000000001";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [] });
const promptRow = () => ({
  id: PROMPT, title: "Duyurulmuş prompt", description: "d", prompt_text: "cinematic photo, soft light", tool: null, tools: [],
  content_type: "image", category: "photography", subcategory: null, status: "published", origin_type: "original", request_id: null,
  like_count: 3, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-09-20T10:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: author(U.bob),
  prompt_media: [{ id: "m1", url: svg("#6d5bd0", "#d9d2c3", 1200, 1000), width: 1200, height: 1000, alt: "", position: 0, dominant_color: "#6d5bd0", placeholder: null }],
  prompt_tags: [],
});

/** Herkese açık, akışta paylaşılmış Space (Bob'un) + sahibi ben olan, henüz paylaşılmamış Space. */
function world(db) {
  const shared = db.addSpace(1, { owner: U.bob.id, title: "Neon şehir panosu", visibility: "public" });
  Object.assign(shared, { shared_at: "2026-09-21T09:00:00Z", like_count: 4, comment_count: 1 });
  for (let n = 1; n <= 3; n += 1) db.addItem(shared.id, { kind: "image", media_url: MEDIA(shared.id, n), media_width: 800, media_height: 600 });
  db.spacePalettes.push({ id: "p1", space_id: shared.id, name: "Neon", colors: ["#ff5fa2", "#1b2a49", "#e86a3c"], position: 0, source: "manual", created_at: "2026-09-21T09:00:00Z", updated_at: "2026-09-21T09:00:00Z" });
  const mine = db.addSpace(2, { title: "Benim boş Space'im", visibility: "public" });
  Object.assign(mine, { shared_at: null, like_count: 0, comment_count: 0 });
}

function feedCard(db, s) {
  const owner = Object.values(U).find((u) => u.id === s.owner_id);
  const images = db.spaceItems.filter((i) => i.space_id === s.id && i.kind === "image");
  return {
    id: s.id, owner_id: s.owner_id, owner_username: owner?.username, owner_display_name: owner?.display_name, owner_avatar_url: null,
    title: s.title, description: s.description, kind: s.kind, visibility: s.visibility, cover_url: null, cover_item_id: null, cover_item_url: null,
    preview_urls: images.map((i) => i.media_url).slice(0, 4), image_count: images.length, prompt_count: 0, note_count: 0, member_count: null,
    my_role: s.owner_id === ME ? "owner" : null, is_favorite: false, last_opened_at: null, created_at: s.created_at, updated_at: s.updated_at, archived_at: s.archived_at,
    shared_at: s.shared_at, like_count: s.like_count, comment_count: s.comment_count,
    palette_colors: db.spacePalettes.find((p) => p.space_id === s.id)?.colors ?? [],
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, setup = world } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const state = { feedCalls: [], likes: [], announcedQueries: 0 };
  db.rpc.feed_page = (body) => {
    state.feedCalls.push(body);
    const kinds = body.p_kinds;
    const out = [];
    if (!kinds || kinds.includes("space")) for (const s of db.spaces.filter((x) => x.shared_at)) out.push({ kind: "space", id: s.id, created_at: s.shared_at, sort_rank: s.like_count });
    if (!kinds || kinds.includes("prompt")) out.push({ kind: "prompt", id: PROMPT, created_at: "2026-09-20T10:00:00Z", sort_rank: 3 });
    return { body: out };
  };
  db.rpc.space_feed_cards = (body) => ({ body: db.spaces.filter((s) => body.p_ids.includes(s.id)).map((s) => feedCard(db, s)) });
  db.rpc.set_space_shared = (body) => {
    db.calls.push({ method: "RPC", table: "set_space_shared", body });
    const s = db.spaces.find((x) => x.id === body.p_space_id);
    const items = db.spaceItems.filter((i) => i.space_id === s.id);
    if (body.p_shared && (items.length < 3 || !items.some((i) => i.kind === "image"))) return { status: 400, body: { code: "P0001", message: "space_too_empty", details: "", hint: "" } };
    s.shared_at = body.p_shared ? s.shared_at ?? "2026-09-22T10:00:00Z" : null;
    return { body: s.shared_at };
  };
  db.rpc.community_cards = (body) => ({ body: (body.p_ids ?? []).includes(COMMUNITY) ? [{ id: COMMUNITY, name: "Işık Kulübü", description: "", avatar_url: null, category: "photography", visibility: "public", member_count: 3, member_limit: 500, rules: null, rules_required: false, rules_version: 1 }] : [] });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  // Mock'tan SONRA bağlananlar önce cevaplar.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => (route.request().method() === "GET" ? json(route, (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? promptRow() : [promptRow()]) : route.fallback()));
  await context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.likes.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 201, body: "" });
    }
    return json(route, []);
  });
  await context.route(/\/rest\/v1\/prompt_comments\?/, (route) => (route.request().method() === "GET" ? json(route, []) : route.fallback()));
  await context.route(/\/rest\/v1\/community_posts\?/, (route) => {
    const url = route.request().url();
    if (!url.includes("kind=eq.application")) return route.fallback();
    state.announcedQueries += 1;
    return json(route, url.includes(PROMPT) ? [{ community_id: COMMUNITY, prompt_id: PROMPT, request_id: null, workflow_id: null, preset_id: null, space_id: null }] : []);
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/sp-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const rpcCalls = (db, name) => db.calls.filter((c) => c.method === "RPC" && c.table === name);
const spaceCard = (page) => page.locator("main article").filter({ hasText: "Neon şehir panosu" }).first();
/** Oturumlu Ana Sayfa "Sana özel" ile açılır (Space orada yok): "En yeni" balonuna geçilir. */
const openNewest = async (page, label = "En yeni") => {
  await page.goto(`${BASE}/`);
  const bubble = page.getByRole("button", { name: label, exact: true }).first();
  await bubble.waitFor();
  await bubble.evaluate((el) => el.click());
};
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Ana Sayfa: paylaşılmış Space aynı Albüm kartıyla akışta — kolaj, palet çizgisi, 'Panoyu gez', sayaçlar; beğeni yedinci hedefe (`space_id`) yazılır", async ({ page, state }) => {
  await openNewest(page);
  const card = spaceCard(page);
  await card.waitFor();
  await card.getByText("SPACE", { exact: false }).first().waitFor();
  await card.locator("[data-palette-strip]").waitFor();
  assert.match((await card.getByRole("link", { name: "Panoyu gez" }).getAttribute("href")) ?? "", /\/spaces\/local\/?\?id=.*tab=board/);
  await card.getByText("4").first().waitFor();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "sp-home-card");
  await card.getByRole("button", { name: /Beğen/ }).first().click();
  await page.waitForFunction(() => true);
  const end = Date.now() + 4000;
  while (Date.now() < end && state.likes.length === 0) await page.waitForTimeout(100);
  assert.equal(state.likes.length, 1);
  assert.equal(state.likes[0].space_id, SID(1));
  assert.ok(!state.likes[0].prompt_id);
});

await scenario("2. Keşfet → Spaces bölümü: `feed_page` yalnız `space` türüyle çağrılır, tür çipleri çizilmez, yalnız Space kartı gelir", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("main article").first().waitFor();
  await page.locator("main").getByRole("button", { name: "Spaces", exact: true }).first().evaluate((el) => el.click());
  const end = Date.now() + 4000;
  while (Date.now() < end && !state.feedCalls.some((c) => c.p_kinds?.[0] === "space")) await page.waitForTimeout(100);
  assert.ok(state.feedCalls.some((c) => JSON.stringify(c.p_kinds) === JSON.stringify(["space"])));
  await spaceCard(page).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).count(), 0);
});

await scenario("3. Space sayfası (akışta paylaşılmış, ziyaretçi değil üye de değil): Beğeni · Yorum · İstatistik eylem satırında, yorum alanı + Şikâyet; panoda yorum yok", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.locator("[data-space-engagement]").waitFor();
  await page.locator("[data-space-comments]").waitFor();
  await page.locator("#comments").getByRole("button", { name: "Şikayet Et" }).first().waitFor();
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-space-comments]").count(), 0);
});

await scenario("4. Sahip: Paylaş tek pencere — 'Akışta gönderi olarak paylaş' anahtarı; az içerikte sunucu hatası açıklanır, yeterli içerikte set_space_shared(true)", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(2)}`);
  await page.locator("[data-space-actions]").getByRole("button", { name: "Paylaş" }).click();
  await page.locator('[data-share-modal="space"]').waitFor();
  const toggle = page.locator("[data-space-feed-toggle]");
  await toggle.waitFor();
  await toggle.click();
  await page.getByText(/en az 3 öğe ve 1 görsel/).waitFor();
  assert.equal(rpcCalls(db, "set_space_shared").length, 1);
  assert.equal(db.spaces.find((s) => s.id === SID(2)).shared_at, null);
  // İçerik eklenince paylaşılır.
  for (let n = 4; n <= 6; n += 1) db.addItem(SID(2), { kind: "image", media_url: MEDIA(SID(2), n) });
  await toggle.click();
  const end = Date.now() + 4000;
  while (Date.now() < end && !db.spaces.find((s) => s.id === SID(2)).shared_at) await page.waitForTimeout(100);
  assert.ok(db.spaces.find((s) => s.id === SID(2)).shared_at);
  assert.equal(rpcCalls(db, "set_space_shared").at(-1).body.p_shared, true);
  // Duyur satırı ve "Kendin için" bölümü aynı pencerede.
  await page.locator("[data-announce-section]").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "sp-share-modal");
});

await scenario("5. Oluştur menüsü: 'Space' karosu Spaces'te oluşturma penceresini açar; 'Var olan içeriği paylaş' seçici + duyur satırı", async ({ page }) => {
  await page.goto(`${BASE}/create`);
  await page.locator("[data-create-option=space]").click();
  await page.waitForURL(/\/spaces\/?$/);
  await page.getByRole("dialog").waitFor();
  await page.goto(`${BASE}/create`);
  await page.locator("[data-create-share-existing]").click();
  await page.locator("[data-share-existing]").waitFor();
  await page.getByRole("tab", { name: "Space" }).click().catch(() => page.getByRole("button", { name: "Space", exact: true }).click());
  await page.locator("[data-share-existing-item]").first().waitFor();
  await page.locator("[data-share-existing-item]").first().click();
  await page.locator("[data-share-existing] [data-announce-section]").waitFor();
  assert.equal(await overflowFree(page), true);
});

await scenario("6. Genel akış: duyurulmuş içeriğin kartında 'X topluluğunda duyuruldu' çipi (tek toplu sorgu); duyurulmamış Space kartında çip yok", async ({ page, state }) => {
  await openNewest(page);
  const prompt = page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).first();
  await prompt.locator("[data-announced-chip]").waitFor();
  assert.match(await prompt.locator("[data-announced-chip]").innerText(), /Işık Kulübü topluluğunda duyuruldu/);
  await spaceCard(page).waitFor();
  assert.equal(await spaceCard(page).locator("[data-announced-chip]").count(), 0);
  assert.equal(state.announcedQueries, 1, "one batched query for the visible page");
});

await scenario("7. İngilizce + telefon: Space kartı ve Spaces bölümü çevrilmiş, yatay taşma yok", async ({ page }) => {
  await openNewest(page, "Newest");
  const card = spaceCard(page);
  await card.waitFor();
  await card.getByRole("link", { name: "Browse board" }).waitFor();
  const prompt = page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).first();
  await prompt.getByText("Announced in Işık Kulübü").waitFor();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "sp-mobile-card");
  assert.equal(await overflowFree(page), true);
}, { lang: "en", viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
