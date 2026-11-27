// Gönderi ⋮ menüsü + Profilde sabitle (docs/history/480-*): kart ve detay menülerinin satır kümesi (kendi / başkasının gönderisi), gruplar, renkler
// (olumsuz kırmızı, "İlgimi çekiyor" yeşil), telefonda alttan açılan kart, yatay üç nokta, eylemlerin RPC/yazma çağrıları (sabitle, bildirimleri duraklat,
// takip, sessize al, engelle), profilde sabitlenenlerin en üstte raptiyeyle görünmesi. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (kurallar: supabase/tests/profile-pins.sql, content-interest.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { installDetailData, svg } from "./detail-fixtures.mjs";

const PORT = 4330;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const pid = (i) => `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
// 1 = carol'ün (başkasının), 2 = alice'in (kendi), 3 ve 4 = carol'ün, 5 ve 6 = alice'in.
const OWNER = { 1: U.carol, 2: U.alice, 3: U.carol, 4: U.carol, 5: U.alice, 6: U.alice };

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [] });
const promptRow = (i) => ({
  id: pid(i), title: `Gönderi ${i}`, description: "d", prompt_text: `cinematic portrait ${i}`, tool: null, tools: [],
  content_type: "image", category: "photography", subcategory: null, status: "published", origin_type: "original", request_id: null,
  like_count: 3, save_count: 0, comment_count: 0, copy_count: 0, quote_count: 0, created_at: new Date(Date.UTC(2026, 8, 20 - i, 10)).toISOString(), show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: author(OWNER[i]),
  prompt_media: [{ id: `m${i}`, url: svg("#6d5bd0", "#d9d2c3", 1200, 1000), width: 1200, height: 1000, alt: "", position: 0, dominant_color: "#6d5bd0", placeholder: null }],
  prompt_tags: [],
});
const ALL = [1, 2, 3, 4, 5, 6].map(promptRow);

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", pins = [], feed = [1, 2] } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { pins: [...pins], pinCalls: [], muteCalls: [], interestCalls: [], followCalls: [], mutes: [], pinFail: null };
  db.rpc.feed_page = () => ({ body: feed.map((i) => ({ kind: "prompt", id: pid(i), created_at: ALL[i - 1].created_at, sort_rank: 10 - i })) });
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.set_profile_pin = (body) => {
    state.pinCalls.push(body);
    if (state.pinFail) return { status: 400, body: { code: "P0001", message: state.pinFail, details: "", hint: "" } };
    state.pins = state.pins.filter((p) => p.id !== body.p_id);
    if (body.p_pinned) state.pins.unshift({ kind: body.p_kind, id: body.p_id });
    return { body: body.p_pinned };
  };
  db.rpc.set_notification_mute = (body) => {
    state.muteCalls.push(body);
    state.mutes = state.mutes.filter((m) => !(m.kind === body.p_kind && m.target === body.p_target));
    if (body.p_on) state.mutes.push({ kind: body.p_kind, target: body.p_target, label: body.p_label, created_at: new Date().toISOString() });
    return { body: null };
  };
  db.rpc.set_content_interest = (body) => { state.interestCalls.push(body); return { body: body.p_value }; };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const authorEq = (url.searchParams.get("author_id") ?? "").replace("eq.", "");
    let list = ids ? ALL.filter((r) => ids.includes(r.id)) : ALL;
    if (authorEq) list = list.filter((r) => r.profiles.id === authorEq);
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return json(route, single ? list[0] ?? null : list);
  });
  await context.route(/\/rest\/v1\/profile_pins\?/, (route) => {
    const owner = (new URL(route.request().url()).searchParams.get("user_id") ?? "").replace("eq.", "");
    return json(route, state.pins.filter((p) => !p.owner || p.owner === owner).map((p) => ({ prompt_id: p.kind === "prompt" ? p.id : null, request_id: null, workflow_id: null, preset_id: null, skill_id: null, created_at: "2026-09-21T10:00:00Z" })));
  });
  await context.route(/\/rest\/v1\/notification_mutes\?/, (route) => json(route, state.mutes));
  await context.route(/\/rest\/v1\/content_interest\?/, (route) => json(route, []));
  await context.route(/\/rest\/v1\/follows(\?|$)/, (route) => {
    const req = route.request();
    if (req.method() === "POST") { state.followCalls.push(JSON.parse(req.postData() || "{}")); return route.fulfill({ status: 201, body: "" }); }
    if (req.method() === "DELETE") { state.followCalls.push({ removed: true }); return route.fulfill({ status: 204, body: "" }); }
    return json(route, []);
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pm-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const SHOTS = process.env.SHOTS ?? "";
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const MENU_BUTTON = /Gönderi seçenekleri|Post options/;
const cards = (page) => page.locator("[data-flip-key]");
const listCards = (page) => page.locator("main article");
const waitFeed = async (page) => { await cards(page).first().waitFor(); };
const rowNames = async (page) => (await page.locator('[role="menuitem"], [role="menuitemcheckbox"]').allInnerTexts()).map((s) => s.trim());
const rowByName = (page, name) => page.locator('[role="menuitem"], [role="menuitemcheckbox"]').filter({ hasText: new RegExp(`^${name}$`) });
const openCardMenu = async (page, n, list = cards) => { await list(page).nth(n).getByRole("button", { name: MENU_BUTTON }).click(); };
const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error("waitFor timed out"); };

const OTHER_CARD = ["Paylaş", "Space'e ekle", "Koleksiyona ekle", "Dışa aktar", "İstatistik görüntüle", "Düzenleme öner", "Takip et", "İlgimi çekiyor", "İlgimi çekmiyor", "Sessize al", "Engelle", "Şikayet et"];
const OWN_CARD = ["Paylaş", "Space'e ekle", "Koleksiyona ekle", "Dışa aktar", "İstatistik görüntüle", "Düzenle", "Kopyasını oluştur", "Profilde sabitle", "Bildirimleri duraklat", "Sil"];

await scenario("1. Kart ⋮ (telefon): yatay üç nokta, alttan açılan kart; başkasının gönderisinde satırlar mockup sırasında, Bağlantıyı kopyala yok", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  const button = cards(page).first().getByRole("button", { name: MENU_BUTTON });
  assert.equal(await button.getAttribute("data-post-menu-trigger"), "card");
  // Yatay üç nokta: üç daire aynı yükseklikte yan yana (dikey değil).
  const dots = await button.locator("svg path").first().evaluate((el) => { const b = el.getBBox(); return { w: b.width, h: b.height }; });
  assert.ok(dots.w > dots.h * 1.5, `three dots lie horizontally (${JSON.stringify(dots)})`);
  await button.click();
  await page.locator("[data-post-menu-sheet]").waitFor();
  assert.deepEqual(await rowNames(page), OTHER_CARD);
  assert.equal(await page.getByRole("menuitem", { name: /Bağlantıyı kopyala/ }).count(), 0);
  assert.equal(await page.locator("[data-post-menu-sheet] [role=separator]").count(), 4, "beş grup arasında dört ayırıcı");
  await shot(page, "pm-card-phone");
});

await scenario("2. Satır renkleri: olumsuzlar (Sessize al · Engelle · Şikayet et · İlgimi çekmiyor) kırmızı, 'İlgimi çekiyor' yeşil, öbürleri nötr", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 0);
  const color = (name) => rowByName(page, name).evaluate((el) => getComputedStyle(el).color);
  const text = await color("Paylaş");
  const danger = await color("Engelle");
  const positive = await color("İlgimi çekiyor");
  for (const name of ["Sessize al", "Şikayet et", "İlgimi çekmiyor"]) assert.equal(await color(name), danger, `${name} kırmızı`);
  assert.notEqual(danger, text, "kırmızı nötrden farklı");
  assert.notEqual(positive, text, "yeşil nötrden farklı");
  assert.notEqual(positive, danger, "yeşil kırmızıdan farklı");
  assert.equal(await color("Space'e ekle"), text);
});

await scenario("3. Kart ⋮ (masaüstü): açılır panel (alt kart değil), aynı satırlar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 0);
  await page.getByRole("menu").waitFor();
  assert.equal(await page.locator("[data-post-menu-sheet]").count(), 0, "masaüstünde alt kart yok");
  assert.deepEqual(await rowNames(page), OTHER_CARD);
  await page.getByRole("menu").scrollIntoViewIfNeeded();
  await shot(page, "pm-card-desktop");
}, { viewport: { width: 1280, height: 900 } });

await scenario("4. Kendi gönderimin kartı: Düzenle · Kopyasını oluştur · Profilde sabitle · Bildirimleri duraklat · Sil; takip/ilgi/sessize/engel/şikayet yok", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 1);
  assert.deepEqual(await rowNames(page), OWN_CARD);
  const danger = await rowByName(page, "Sil").evaluate((el) => getComputedStyle(el).color);
  assert.notEqual(danger, await rowByName(page, "Paylaş").evaluate((el) => getComputedStyle(el).color));
});

await scenario("5. 'Paylaş' Paylaş penceresini, 'İstatistik görüntüle' istatistik penceresini açar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 0);
  await rowByName(page, "Paylaş").click();
  await page.locator('[data-share-modal="prompt"]').waitFor();
  await page.keyboard.press("Escape");
  await page.locator('[data-share-modal="prompt"]').waitFor({ state: "detached" });
  await openCardMenu(page, 0);
  await rowByName(page, "İstatistik görüntüle").click();
  await page.getByRole("dialog").last().waitFor();
});

await scenario("6. Profilde sabitle: set_profile_pin(prompt, id, true) yazılır, menü 'Sabitlemeyi kaldır' olur; kaldırınca false yazılır", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 1);
  await rowByName(page, "Profilde sabitle").click();
  await waitFor(() => state.pinCalls.length === 1);
  assert.deepEqual(state.pinCalls[0], { p_kind: "prompt", p_id: pid(2), p_pinned: true });
  await page.getByText("Profilinde sabitlendi").waitFor();
  await openCardMenu(page, 1);
  await rowByName(page, "Sabitlemeyi kaldır").click();
  await waitFor(() => state.pinCalls.length === 2);
  assert.equal(state.pinCalls[1].p_pinned, false);
});

await scenario("7. Sabit sınırı (3): sunucu pin_limit derse okunur cümle gösterilir, menü sabit olmamış kalır", async ({ page, state }) => {
  state.pinFail = "pin_limit";
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 1);
  await rowByName(page, "Profilde sabitle").click();
  await page.getByText("Profilinde en çok 3 gönderi sabitleyebilirsin").waitFor();
  await openCardMenu(page, 1);
  await rowByName(page, "Profilde sabitle").waitFor();
});

await scenario("8. Bildirimleri duraklat (kendi gönderim): set_notification_mute(content, içerik adresi) yazılır; menü 'Bildirimleri sürdür' olur", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 1);
  await rowByName(page, "Bildirimleri duraklat").click();
  await waitFor(() => state.muteCalls.length === 1);
  assert.equal(state.muteCalls[0].p_kind, "content");
  assert.equal(state.muteCalls[0].p_target, `/prompts/local?id=${pid(2)}`);
  assert.equal(state.muteCalls[0].p_on, true);
  await page.getByText("Bu gönderinin bildirimleri duraklatıldı").waitFor();
  await openCardMenu(page, 1);
  await rowByName(page, "Bildirimleri sürdür").click();
  await waitFor(() => state.muteCalls.length === 2);
  assert.equal(state.muteCalls[1].p_on, false);
});

await scenario("9. Takip et → takip yazılır, satır 'Takipten çık' (kırmızı) olur; Sessize al → set_notification_mute(actor) ve 'Sesi aç'", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 0);
  await rowByName(page, "Takip et").click();
  await waitFor(() => state.followCalls.length === 1);
  assert.equal(state.followCalls[0].following_id, U.carol.id);
  await openCardMenu(page, 0);
  await rowByName(page, "Takipten çık").waitFor();
  await rowByName(page, "Sessize al").click();
  await waitFor(() => state.muteCalls.length === 1);
  assert.equal(state.muteCalls[0].p_kind, "actor");
  assert.equal(state.muteCalls[0].p_target, U.carol.id);
  await openCardMenu(page, 0);
  await rowByName(page, "Sesi aç").waitFor();
});

await scenario("10. Engelle: onay penceresi sorar; onaylayınca engel yazılır, menü 'Engeli kaldır' olur", async ({ page, db }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 0);
  await rowByName(page, "Engelle").click();
  await page.getByText("Carol engellensin mi?").waitFor();
  assert.equal(db.blocks.length, 0, "onaydan önce engel yok");
  await page.getByRole("button", { name: "Engelle", exact: true }).click();
  await waitFor(() => db.blocks.length === 1);
  assert.equal(db.blocks[0].blocked_id, U.carol.id);
  await openCardMenu(page, 0);
  await rowByName(page, "Engeli kaldır").waitFor();
});

await scenario("11. Detay ⋮: belirgin kenarlıklı 40 px düğme; başkasının promptunda Paylaş…/Takip et/İlgimi çekiyor yok, İlişki haritası İstatistik'ten sonra", async ({ page }) => {
  await page.goto(`${BASE}/prompts/local?id=${pid(1)}`);
  const button = page.locator("[data-detail-menu]").getByRole("button", { name: MENU_BUTTON });
  await button.waitFor();
  assert.equal(await button.getAttribute("data-post-menu-trigger"), "detail");
  const box = await button.boundingBox();
  assert.ok(box.width >= 40 && box.height >= 40, `detay ⋮ düğmesi belirgin (${box.width}x${box.height})`);
  assert.ok(Number.parseFloat(await button.evaluate((el) => getComputedStyle(el).borderTopWidth)) >= 1, "kenarlıklı");
  await button.click();
  await page.locator("[data-post-menu-sheet]").waitFor();
  assert.deepEqual(await rowNames(page), ["Space'e ekle", "Koleksiyona ekle", "Dışa aktar", "İstatistik görüntüle", "İlişki haritasını aç", "Düzenleme öner", "Sessize al", "Engelle", "Şikayet et"]);
  await shot(page, "pm-detail-phone");
});

await scenario("12. Detay ⋮ (kendi promptum): Düzenle · Kopyasını oluştur · Profilde sabitle · Bildirimleri duraklat · Sil", async ({ page }) => {
  await page.goto(`${BASE}/prompts/local?id=${pid(2)}`);
  const button = page.locator("[data-detail-menu]").getByRole("button", { name: MENU_BUTTON });
  await button.waitFor();
  await button.click();
  await page.locator("[data-post-menu-sheet]").waitFor();
  assert.deepEqual(await rowNames(page), ["Space'e ekle", "Koleksiyona ekle", "Dışa aktar", "İstatistik görüntüle", "İlişki haritasını aç", "Düzenle", "Kopyasını oluştur", "Profilde sabitle", "Bildirimleri duraklat", "Sil"]);
});

await scenario("13. Profil: sabitlenen gönderi bölümün en üstünde raptiye işaretiyle; diğerlerinde işaret yok", async ({ page }) => {
  await page.goto(`${BASE}/profile/real?username=${U.carol.username}`);
  await listCards(page).first().waitFor();
  // Sabit gönderi kimlikle ayrıca okunur; geldikten sonra listenin başına geçer.
  await listCards(page).first().locator("[data-pinned-mark]").waitFor();
  const first = listCards(page).first();
  assert.equal(await first.locator("[data-pinned-mark]").count(), 1, "sabit gönderi ilk sırada");
  await first.getByText("Gönderi 4").waitFor();
  assert.equal(await first.locator("[data-pinned-mark]").getAttribute("aria-label"), "Profilde sabit");
  assert.ok((await listCards(page).count()) >= 3, "carol'ün üç gönderisi listelenir");
  await shot(page, "pm-profile-pinned");
}, { pins: [{ kind: "prompt", id: pid(4), owner: U.carol.id }] });

await scenario("14. Kendi profilimde 'Profilde sabitle': gönderi hemen en üste çıkar ve raptiye alır; kaldırınca işaret gider", async ({ page, state }) => {
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await listCards(page).first().waitFor();
  assert.equal(await page.locator("[data-pinned-mark]").count(), 0);
  const last = (await listCards(page).count()) - 1;
  await openCardMenu(page, last, listCards);
  await rowByName(page, "Profilde sabitle").click();
  await waitFor(() => state.pinCalls.length === 1);
  await waitFor(async () => (await page.locator("[data-pinned-mark]").count()) === 1);
  await listCards(page).first().locator("[data-pinned-mark]").waitFor();
  await openCardMenu(page, 0, listCards);
  await rowByName(page, "Sabitlemeyi kaldır").click();
  await waitFor(async () => (await page.locator("[data-pinned-mark]").count()) === 0);
}, { viewport: { width: 1280, height: 900 } });

await scenario("15. Başkasının profilinde kart ⋮: 'İlgimi çekiyor' menüden kendi cevabını yazar (set_content_interest)", async ({ page, state }) => {
  await page.goto(`${BASE}/profile/real?username=${U.carol.username}`);
  await listCards(page).first().waitFor();
  await openCardMenu(page, 0, listCards);
  await rowByName(page, "İlgimi çekiyor").click();
  await waitFor(() => state.interestCalls.length === 1);
  assert.equal(state.interestCalls[0].p_kind, "prompt");
  assert.equal(state.interestCalls[0].p_value, "interested");
});

await scenario("16. İngilizce: menü satırları çevrilmiş", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await openCardMenu(page, 1);
  assert.deepEqual(await rowNames(page), ["Share", "Add to Space", "Add to collection", "Export", "View statistics", "Edit", "Make a copy", "Pin to profile", "Pause notifications", "Delete"]);
}, { lang: "en" });

console.log("");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
