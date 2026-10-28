// Space'in tek etkileşim hattı = alıntı (docs/history/241-*; 215'in Space gönderisinin yerini alır): sahibin "Akışta paylaş" alıntısı akışta
// alıntı kartıdır ("paylaştı"), beğeni alıntıya (`quote_id`) gider; alıntı sayfasında Space önizlemesi; Keşfet → Spaces herkese açık liste;
// Space sayfasında beğeni/yorum yok (alıntı sayısı + şikâyet); sahibin anahtarı create_quote / alıntıyı silme (+ yetersiz içerik hatası);
// Oluştur → Space / Var olan içeriği paylaş, genel akışta "alıntılandı" çipi. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (kurallar: supabase/tests/space-posts.sql, quotes.sql).
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

const Q_SPACE = "a0000000-0000-4000-8000-0000000000b1"; // Bob'un kendi Space'ini akışta paylaşan alıntısı

/** Herkese açık Space (Bob'un) + onun akıştaki alıntısı + sahibi ben olan, henüz paylaşılmamış boş Space. */
function world(db) {
  const shared = db.addSpace(1, { owner: U.bob.id, title: "Neon şehir panosu", visibility: "public" });
  for (let n = 1; n <= 3; n += 1) db.addItem(shared.id, { kind: "image", media_url: MEDIA(shared.id, n), media_width: 800, media_height: 600 });
  db.spacePalettes.push({ id: "p1", space_id: shared.id, name: "Neon", colors: ["#ff5fa2", "#1b2a49", "#e86a3c"], position: 0, source: "manual", created_at: "2026-09-21T09:00:00Z", updated_at: "2026-09-21T09:00:00Z" });
  db.addSpace(2, { title: "Benim boş Space'im", visibility: "public" });
}

function feedCard(db, s) {
  const owner = Object.values(U).find((u) => u.id === s.owner_id);
  const images = db.spaceItems.filter((i) => i.space_id === s.id && i.kind === "image");
  return {
    id: s.id, owner_id: s.owner_id, owner_username: owner?.username, owner_display_name: owner?.display_name, owner_avatar_url: null,
    title: s.title, description: s.description, kind: s.kind, visibility: s.visibility, cover_url: null, cover_item_id: null, cover_item_url: null,
    preview_urls: images.map((i) => i.media_url).slice(0, 4), image_count: images.length, prompt_count: 0, note_count: 0, member_count: null,
    my_role: s.owner_id === ME ? "owner" : null, is_favorite: false, last_opened_at: null, created_at: s.created_at, updated_at: s.updated_at, archived_at: s.archived_at,
    palette_colors: db.spacePalettes.find((p) => p.space_id === s.id)?.colors ?? [],
  };
}

const spaceQuoteCard = () => ({
  id: Q_SPACE, author_id: U.bob.id, author_username: U.bob.username, author_display_name: U.bob.display_name, author_avatar_url: null,
  content_type: "space", target_id: SID(1), note: null, like_count: 4, comment_count: 1, created_at: "2026-09-21T09:00:00Z", is_liked: false,
});

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, setup = world } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const state = { feedCalls: [], likes: [], announcedQueries: 0, ownQuote: null, deleted: [] };
  db.rpc.feed_page = (body) => {
    state.feedCalls.push(body);
    const kinds = body.p_kinds;
    const out = [];
    if (!kinds || kinds.includes("quote")) out.push({ kind: "quote", id: Q_SPACE, created_at: "2026-09-21T09:00:00Z", sort_rank: 4 });
    if (!kinds || kinds.includes("prompt")) out.push({ kind: "prompt", id: PROMPT, created_at: "2026-09-20T10:00:00Z", sort_rank: 3 });
    return { body: out };
  };
  db.rpc.quote_feed_cards = (body) => ({ body: body.p_ids.includes(Q_SPACE) ? [spaceQuoteCard()] : [] });
  db.rpc.space_feed_cards = (body) => ({ body: db.spaces.filter((s) => body.p_ids.includes(s.id)).map((s) => feedCard(db, s)) });
  db.rpc.create_quote = (body) => {
    db.calls.push({ method: "RPC", table: "create_quote", body });
    const items = db.spaceItems.filter((i) => i.space_id === body.p_content_id);
    if (body.p_content_type === "space" && (items.length < 3 || !items.some((i) => i.kind === "image"))) return { status: 400, body: { code: "P0001", message: "space_too_empty", details: "", hint: "" } };
    state.ownQuote = "a0000000-0000-4000-8000-0000000000b2";
    return { body: state.ownQuote };
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
  // Sahibin kendi alıntısı (anahtar): GET tek satır ya da boş, DELETE kaydedilir.
  await context.route(/\/rest\/v1\/content_quotes/, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      state.deleted.push(new URL(req.url()).searchParams.get("id")?.replace("eq.", ""));
      const had = state.ownQuote;
      state.ownQuote = null;
      return json(route, had ? { id: had } : null);
    }
    if (req.method() === "GET") {
      const one = (req.headers().accept ?? "").includes("vnd.pgrst.object");
      return json(route, state.ownQuote ? (one ? { id: state.ownQuote } : [{ id: state.ownQuote }]) : one ? null : [], state.ownQuote || !one ? 200 : 406);
    }
    return route.fallback();
  });
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
const openNewest = async (page) => {
  await page.goto(`${BASE}/discover`);
};
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Keşfet 'Tümü': sahibin Space alıntısı alıntı kartıdır — 'paylaştı', Space etiketi, kolaj; beğeni alıntıya (`quote_id`) yazılır, Space'e değil", async ({ page, state }) => {
  await openNewest(page);
  const card = spaceCard(page);
  await card.waitFor();
  await card.getByText("paylaştı").first().waitFor();
  await card.getByText("SPACE", { exact: false }).first().waitFor();
  assert.equal(state.feedCalls.some((c) => (c.p_kinds ?? []).includes("space")), false, "feed_page no longer asks for the space kind");
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "sp-quote-card");
  await card.getByRole("button", { name: /Beğen|Tepki/ }).first().click();
  await page.getByRole("menuitem", { name: /^(Sevdim|Love)/ }).click(); // docs/history/265-*: düğme tepki seçicisini açar
  const end = Date.now() + 4000;
  while (Date.now() < end && state.likes.length === 0) await page.waitForTimeout(100);
  assert.equal(state.likes.length, 1);
  assert.equal(state.likes[0].quote_id, Q_SPACE);
  assert.ok(!state.likes[0].space_id);
});

await scenario("2. Keşfet → Spaces: herkese açık Space listesi (`list_spaces('public')`), kart Space sayfasına gider (Panoyu gez/Paylaş kartta yok); Space kartında beğeni/yorum yok", async ({ page, db, state }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("main article").first().waitFor();
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: "Spaces", exact: true }).click();
  const card = spaceCard(page);
  await card.waitFor();
  assert.ok(rpcCalls(db, "list_spaces").some((c) => c.body.p_filter === "public"));
  assert.equal(state.feedCalls.length === 0 || !state.feedCalls.some((c) => JSON.stringify(c.p_kinds) === JSON.stringify(["space"])), true);
  assert.match((await card.getByRole("link", { name: "Neon şehir panosu" }).first().getAttribute("href")) ?? "", /\/spaces\/local\/?\?id=/);
  assert.equal(await card.getByRole("link", { name: "Panoyu gez" }).count() + (await card.getByRole("button", { name: "Paylaş" }).count()), 0, "no big action / share on the visual card");
  await card.locator("[data-palette-strip]").waitFor();
  assert.equal(await card.getByRole("button", { name: /Beğen|Tepki ver|Tepkin:/ }).count(), 0);
  assert.equal(await page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).count(), 0);
});

await scenario("3. Space sayfası (başkasının herkese açık Space'i): beğeni/yorum/istatistik satırı ve yorum alanı YOK; 'N kez alıntılandı' + Şikâyet", async ({ page, db }) => {
  db.spaces.find((s) => s.id === SID(1)).quote_count = 3;
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.locator("[data-space-actions]").waitFor();
  const footer = page.locator("[data-space-footer]");
  await footer.waitFor();
  await footer.getByText("3 kez alıntılandı").waitFor();
  await footer.getByRole("button", { name: "Şikayet Et" }).waitFor();
  assert.equal(await page.locator("[data-space-engagement]").count(), 0);
  assert.equal(await page.locator("[data-space-comments]").count(), 0);
  assert.equal(await page.locator("[data-space-actions]").getByRole("button", { name: /Beğen|Tepki ver|Tepkin:/ }).count(), 0);
});

await scenario("4. Sahip: Paylaş tek pencere — 'Akışta paylaş' anahtarı; az içerikte sunucu hatası açıklanır, yeterliyse create_quote('space'), kapatınca alıntı silinir; topluluk alıntısı satırı akış hedefi olmadan", async ({ page, db, state }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(2)}`);
  await page.locator("[data-space-actions]").getByRole("button", { name: "Paylaş" }).click();
  await page.locator('[data-share-modal="space"]').waitFor();
  const toggle = page.locator("[data-space-feed-toggle]");
  await toggle.waitFor();
  await toggle.click();
  await page.getByText(/en az 3 öğesi ve 1 görseli/).waitFor();
  assert.equal(rpcCalls(db, "create_quote").length, 1);
  assert.equal(state.ownQuote, null);
  // İçerik eklenince paylaşılır: sahibin KENDİ alıntısı yaratılır.
  for (let n = 4; n <= 6; n += 1) db.addItem(SID(2), { kind: "image", media_url: MEDIA(SID(2), n) });
  await toggle.click();
  let end = Date.now() + 4000;
  while (Date.now() < end && !state.ownQuote) await page.waitForTimeout(100);
  assert.ok(state.ownQuote);
  const last = rpcCalls(db, "create_quote").at(-1).body;
  assert.equal(last.p_content_type, "space");
  assert.equal(last.p_content_id, SID(2));
  await page.locator('[data-space-feed-toggle="on"]').waitFor();
  // Alıntıla satırında akış hedefi yok (yönetim yukarıdaki anahtarda); yalnız topluluklar.
  await page.locator("[data-quote-section]").waitFor();
  await page.locator("[data-quote-section] button").first().click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-quote-section] [data-quote-destination="feed"]').count(), 0);
  await shot(page, "sp-share-modal");
  // Kapatınca alıntı silinir.
  await toggle.click();
  end = Date.now() + 4000;
  while (Date.now() < end && state.ownQuote) await page.waitForTimeout(100);
  assert.equal(state.ownQuote, null);
  assert.equal(state.deleted.length, 1);
});

await scenario("4b. Alıntı sayfası (Space): diğer türlerle AYNI iskelet — Albüm bandı, tek eylem satırı (Panoyu gez + alıntının beğeni/yorum/istatistik/paylaş), 'Hakkında' sütunu, yorumlar; ayrı dar etkileşim bölümü yok", async ({ page, state }) => {
  await page.goto(`${BASE}/quotes/local?id=${Q_SPACE}`);
  const band = page.locator("[data-space-preview]");
  await band.waitFor();
  await band.getByText("Neon şehir panosu").first().waitFor();
  await page.locator("[data-detail-aside]").waitFor();
  await page.getByRole("link", { name: "Panoyu gez" }).first().waitFor();
  assert.match((await page.getByRole("link", { name: "Panoyu gez" }).first().getAttribute("href")) ?? "", /tab=board/);
  assert.match((await page.getByRole("link", { name: /Space'i aç/ }).first().getAttribute("href")) ?? "", /\/spaces\/local\/?\?id=/);
  await page.getByText("paylaştı").first().waitFor();
  assert.equal(await page.locator("section[aria-label='Alıntının yorumları']").count(), 0, "no separate narrow engagement section");
  await page.getByRole("button", { name: /Beğen|Tepki/ }).first().click();
  await page.getByRole("menuitem", { name: /^(Sevdim|Love)/ }).click();
  const end = Date.now() + 4000;
  while (Date.now() < end && state.likes.length === 0) await page.waitForTimeout(100);
  assert.equal(state.likes[0].quote_id, Q_SPACE);
  assert.ok(!state.likes[0].space_id);
  await shot(page, "sp-quote-page");
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
  await page.locator("[data-share-existing] [data-quote-section]").waitFor();
  assert.equal(await overflowFree(page), true);
});

await scenario("6. Genel akış: alıntılanmış içeriğin kartında 'X topluluğunda alıntılandı' çipi (tek toplu sorgu); Space alıntı kartında çip yok", async ({ page, state }) => {
  await openNewest(page);
  const prompt = page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).first();
  await prompt.locator("[data-announced-chip]").waitFor();
  assert.match(await prompt.locator("[data-announced-chip]").innerText(), /Işık Kulübü topluluğunda alıntılandı/);
  await spaceCard(page).waitFor();
  assert.equal(await spaceCard(page).locator("[data-announced-chip]").count(), 0);
  assert.equal(state.announcedQueries, 1, "one batched query for the visible page");
});

await scenario("7. İngilizce + telefon: Space alıntı kartı çevrilmiş, yatay taşma yok", async ({ page }) => {
  await openNewest(page);
  const card = spaceCard(page);
  await card.waitFor();
  await card.getByText("shared").first().waitFor();
  const prompt = page.locator("main article").filter({ hasText: "Duyurulmuş prompt" }).first();
  await prompt.getByText("Quoted in Işık Kulübü").waitFor();
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
