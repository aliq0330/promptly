// "İlgimi çekiyor / çekmiyor" (docs/history/275-*): Sana özel + Keşfet'te arada çıkan "Bu gönderi ilgini çekiyor mu?" kartı ve her kartın ⋮
// menüsündeki iki cevap. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — cevabın sıralamaya etkisi sunucu kuralıdır ve
// supabase/tests/content-interest.sql'de sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4188/promptly";
const server = await serve(4188);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"]];
const pid = (i) => `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
const OWN = 2; // 2. gönderi izleyenin kendisinin
function promptRow(i) {
  const [a, b] = COLORS[i % COLORS.length];
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: null, tools: [],
    content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 40 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i === OWN ? U.alice : i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, count = 16, answers = {}, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1));
  // `answers`: önceden kayıtlı cevaplar (prompt kimliği → değer); `rpcCalls`: set_content_interest çağrıları; `fail`: RPC hata verir.
  const state = { rpcCalls: [], answers: { ...answers }, fail: false, followingCalls: 0 };
  db.rpc.feed_page = (body) => {
    if (body.p_scope === "following") state.followingCalls += 1;
    return { body: rows.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: r.like_count })) };
  };
  db.rpc.for_you_page = () => ({
    body: rows.map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i, reason_kind: "popular", reason_ref: null })),
  });
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.set_content_interest = (body) => {
    state.rpcCalls.push(body);
    if (state.fail) return { status: 400, body: { message: "boom" } };
    if (body.p_value === null) delete state.answers[body.p_id];
    else state.answers[body.p_id] = body.p_value;
    return { body: body.p_value };
  };
  setup?.({ db, rows, state });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/content_interest\?/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("prompt_id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    const found = ids.filter((id) => state.answers[id]).map((id) => ({ prompt_id: id, value: state.answers[id] }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(found) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await context.route(/\/rest\/v1\/profiles\?.*order=follower_count/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([author(U.bob), author(U.carol)]) }),
  );
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state, rows });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/in-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const cell = (page, n) => page.locator("[data-flip-key]").nth(n);
const menuButton = (page, n) => cell(page, n).getByRole("button", { name: /Gönderi seçenekleri|Post options/ });
const waitFeed = async (page) => { await page.locator("[data-flip-key]").first().waitFor(); };

// 1 — Sana özel: kart yalnız 7. gönderinin altında
await scenario("1. Sana özel: 'Bu gönderi ilgini çekiyor mu?' yalnız 7. gönderinin altında (16 gönderide bir kart); iki düğme + ✕", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.locator("[data-interest-prompt]").first().waitFor();
  assert.equal(await page.locator("[data-interest-prompt]").count(), 1);
  const inSeventh = cell(page, 6).locator("[data-interest-prompt]");
  assert.equal(await inSeventh.count(), 1, "kart 7. gönderide");
  await inSeventh.getByText("Bu gönderi ilgini çekiyor mu?").waitFor();
  await inSeventh.getByRole("button", { name: "İlgimi çekmiyor" }).waitFor();
  await inSeventh.getByRole("button", { name: "İlgimi çekiyor" }).waitFor();
  await inSeventh.getByRole("button", { name: "Kapat" }).waitFor();
  await inSeventh.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, "1-strip");
  assert.equal(await overflowFree(page), true);
});

// 2 — "ilgimi çekiyor": RPC + teşekkür + kaybolma
await scenario("2. kartta 'İlgimi çekiyor' → set_content_interest(prompt, interested); teşekkür görünür, ~2 sn sonra kart kaybolur, gönderi yerinde kalır", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = cell(page, 6).locator("[data-interest-prompt]");
  await strip.getByRole("button", { name: "İlgimi çekiyor" }).click();
  await page.locator("[data-interest-thanks]").waitFor();
  await page.getByText("Cevabın Sana özel akışını ayarlar.").waitFor();
  assert.deepEqual(state.rpcCalls, [{ p_kind: "prompt", p_id: pid(7), p_value: "interested" }]);
  await shot(page, "2-thanks");
  await page.locator("[data-interest-thanks]").waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0);
  assert.equal(await page.locator("[data-flip-key]").count(), 16, "gönderi listeden çıkmaz");
});

// 3 — "ilgimi çekmiyor" (Sana özel): kart küçülür, Geri al
await scenario("3. kartta 'İlgimi çekmiyor' (Sana özel) → gönderi 'daha az göstereceğiz' notuna dönüşür; 'Geri al' RPC'ye null yollar ve gönderi döner", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 6).locator("[data-interest-prompt]").getByRole("button", { name: "İlgimi çekmiyor" }).click();
  await page.locator("[data-interest-hidden]").waitFor();
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0);
  assert.deepEqual(state.rpcCalls, [{ p_kind: "prompt", p_id: pid(7), p_value: "not_interested" }]);
  await page.getByText("Bunun gibi gönderileri daha az göstereceğiz").waitFor();
  await shot(page, "3-hidden");
  await page.getByRole("button", { name: "Geri al" }).click();
  await page.locator("[data-interest-hidden]").waitFor({ state: "detached" });
  assert.deepEqual(state.rpcCalls[1], { p_kind: "prompt", p_id: pid(7), p_value: null });
  await page.getByText("Görsel prompt 7").first().waitFor({ state: "attached" });
});

// 4 — ⋮ menüsü
await scenario("4. Sana özel ⋮ menüsü: iki cevap var; 'İlgimi çekmiyor' gönderiyi gizler, 'Geri al' döndürür; seçili olan işaretli, tekrar basınca geri alınır", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await menuButton(page, 0).click();
  const yes = page.getByRole("menuitemcheckbox", { name: "İlgimi çekiyor" });
  const no = page.getByRole("menuitemcheckbox", { name: "İlgimi çekmiyor" });
  await yes.waitFor();
  await no.waitFor();
  assert.equal(await yes.getAttribute("aria-checked"), "false");
  await page.evaluate(() => window.scrollBy(0, 220));
  await page.waitForTimeout(300);
  await shot(page, "4-menu");
  await yes.click();
  assert.deepEqual(state.rpcCalls[0], { p_kind: "prompt", p_id: pid(1), p_value: "interested" });
  assert.equal(await page.locator("[data-interest-hidden]").count(), 0, "'çekiyor' gönderiyi gizlemez");
  await menuButton(page, 0).click();
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "İlgimi çekiyor" }).getAttribute("aria-checked"), "true", "seçili olan işaretli");
  await page.getByRole("menuitemcheckbox", { name: "İlgimi çekiyor" }).click();
  assert.deepEqual(state.rpcCalls[1], { p_kind: "prompt", p_id: pid(1), p_value: null }, "seçiliye tekrar basmak geri alır");
  await menuButton(page, 0).click();
  await page.getByRole("menuitemcheckbox", { name: "İlgimi çekmiyor" }).click();
  await page.locator("[data-interest-hidden]").waitFor();
  assert.deepEqual(state.rpcCalls[2], { p_kind: "prompt", p_id: pid(1), p_value: "not_interested" });
});

// 5 — kendi gönderi
await scenario("5. kendi gönderinde menüde cevap satırı yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await menuButton(page, OWN - 1).click();
  await page.getByRole("menu").waitFor();
  assert.equal(await page.getByRole("menuitemcheckbox").count(), 0);
});

// 6 — hata geri alınır
await scenario("6. RPC hata verirse cevap geri alınır (gönderi gizlenmez) ve kısa bir uyarı çıkar", async ({ page, state }) => {
  state.fail = true;
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await menuButton(page, 0).click();
  await page.getByRole("menuitemcheckbox", { name: "İlgimi çekmiyor" }).click();
  await page.getByText("Cevabın kaydedilemedi. Tekrar dene.").waitFor();
  await page.locator("[data-interest-hidden]").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-flip-key]").count(), 16);
});

// 7 — ✕ kartı bir süre kapatır
await scenario("7. ✕ kartı kapatır ve bir süre (6 sa) hiçbir listede çıkmaz", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await cell(page, 6).locator("[data-interest-prompt]").getByRole("button", { name: "Kapat" }).click();
  await page.locator("[data-interest-prompt]").waitFor({ state: "detached" });
  const until = Number(await page.evaluate(() => localStorage.getItem("promptly-interest-card-paused-until")));
  assert.ok(until > Date.now() + 5 * 3600_000 && until < Date.now() + 7 * 3600_000, "duraklatma damgası ~6 sa");
  await page.reload();
  await waitFeed(page);
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0, "yenilemede de çıkmaz");
  await menuButton(page, 0).click();
  await page.getByRole("menuitemcheckbox", { name: "İlgimi çekiyor" }).waitFor();
});

// 8 — Takip Ettiklerim'de yok
await scenario("8. Takip Ettiklerim'de kart da menü cevabı da yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.getByRole("tab", { name: "Takip Ettiklerim" }).click();
  await page.locator("[data-flip-key]").first().waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0);
  await menuButton(page, 0).click();
  await page.getByRole("menu").waitFor();
  assert.equal(await page.getByRole("menuitemcheckbox").count(), 0);
});

// 9 — Keşfet
await scenario("9. Keşfet: kart 7. gönderide; menüde iki cevap; 'İlgimi çekmiyor' gönderiyi GİZLEMEZ (Keşfet sıralaması değişmez), seçili işaretlenir", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await cell(page, 6).locator("[data-interest-prompt]").waitFor();
  assert.equal(await page.locator("[data-interest-prompt]").count(), 1);
  await menuButton(page, 0).click();
  await page.getByRole("menuitemcheckbox", { name: "İlgimi çekmiyor" }).click();
  assert.deepEqual(state.rpcCalls[0], { p_kind: "prompt", p_id: pid(1), p_value: "not_interested" });
  assert.equal(await page.locator("[data-interest-hidden]").count(), 0, "Keşfet'te gönderi yerinde kalır");
  assert.equal(await page.locator("[data-flip-key]").count(), 16);
  await menuButton(page, 0).click();
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "İlgimi çekmiyor" }).getAttribute("aria-checked"), "true");
  await shot(page, "9-discover");
});

await scenario("10. Keşfet: daha önce cevaplanmış gönderi menüde seçili gelir ve ona kart sorulmaz", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0, "7. gönderi zaten cevaplanmış: kart yok");
  await menuButton(page, 6).click();
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "İlgimi çekiyor" }).getAttribute("aria-checked"), "true");
}, { answers: { [pid(7)]: "interested" } });

// 11 — misafir
await scenario("11. misafir: Keşfet'te kart da menü cevabı da yok", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await waitFeed(page);
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-interest-prompt]").count(), 0);
  await menuButton(page, 0).click();
  await page.getByRole("menu").waitFor();
  assert.equal(await page.getByRole("menuitemcheckbox").count(), 0);
}, { guest: true });

// 12 — İngilizce + masaüstü
await scenario("12. İngilizce: kart ve menü İngilizce; masaüstünde yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = cell(page, 6).locator("[data-interest-prompt]");
  await strip.getByText("Is this post interesting to you?").waitFor();
  await strip.getByRole("button", { name: "Interested", exact: true }).waitFor();
  await strip.getByRole("button", { name: "Not interested" }).waitFor();
  await menuButton(page, 0).click();
  await page.getByRole("menuitemcheckbox", { name: "Not interested" }).waitFor();
  assert.equal(await overflowFree(page), true);
}, { lang: "en", viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
