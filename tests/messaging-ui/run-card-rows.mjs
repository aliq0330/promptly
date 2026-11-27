// Yatay satır (docs/history/477-*, "D"): İçeriklerim ve profil listeleri kart değil SATIR çizer — solda kare görsel, sağda kicker + başlık + özet;
// kutusuz, alt çizgili; kendi kütüphanede "Yayında" rozeti + "Düzenle" düğmesi, profilde yazar satırı yok. Ağ taklitli; gerçek Supabase'e / cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4207/promptly";
const server = await serve(4207);
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
  const extra = i === 3 ? [{ id: "m3b", url: svg(b, a, 1200, 1000), width: 1200, height: 1000, alt: "ikinci", position: 1, dominant_color: b, placeholder: svg(b, a, 24, 20) }] : [];
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: i === 1 ? "GPT Image 1" : null, tools: [],
    content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 40 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i === OWN ? U.alice : i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: a, placeholder: svg(a, b, 24, 20) }, ...extra],
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

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const own = ({ rows }) => { for (const r of rows) r.profiles = author(U.alice); };
const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const rowOf = (page, n) => page.locator("main article:has(a[data-card-link])").nth(n);

await scenario("1. İçeriklerim: satır düzeni — solda kare görsel, sağda başlık; alt çizgi; 'Yayında' + 'Düzenle'", async ({ page }) => {
  await page.goto(`${BASE}/my-content`);
  const row = rowOf(page, 0);
  await row.waitFor();
  await page.waitForTimeout(700);
  const media = await rect(row.locator("[data-card-media]"));
  assert.ok(Math.abs(media.w - media.h) <= 1.5, `görsel kare (${Math.round(media.w)}×${Math.round(media.h)})`);
  const title = await rect(row.getByRole("link", { name: /Görsel prompt/ }).first());
  assert.ok(title.l >= media.r - 1, "başlık görselin SAĞINDA");
  assert.ok(title.t < media.b, "başlık görselle aynı yükseklikte başlar");
  assert.equal(await row.evaluate((el) => getComputedStyle(el).borderBottomWidth), "1px", "satırın alt çizgisi var");
  assert.equal(await row.evaluate((el) => getComputedStyle(el).boxShadow), "none", "kutu/gölge yok");
  await row.getByText("Yayında", { exact: true }).waitFor();
  const edit = row.locator("[data-card-edit]");
  await edit.waitFor();
  assert.match(await edit.getAttribute("href"), /\/create\/?\?edit=/, "Düzenle düğmesi düzenleme adresine gider");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, "yatay taşma yok");
  await shot(page, "rows-mycontent");
}, { viewport: { width: 1280, height: 900 }, setup: own });

await scenario("2. İçeriklerim (telefon): görsel 104 px, satır sığar", async ({ page }) => {
  await page.goto(`${BASE}/my-content`);
  const row = rowOf(page, 0);
  await row.waitFor();
  await page.waitForTimeout(700);
  const media = await rect(row.locator("[data-card-media]"));
  assert.ok(media.w >= 100 && media.w <= 108, `telefonda 104 px (${Math.round(media.w)})`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, "yatay taşma yok");
  await shot(page, "rows-mycontent-phone");
}, { setup: own });

await scenario("3. Profil: satırda yazar satırı yok; kicker + başlık + özet var", async ({ page }) => {
  await page.goto(`${BASE}/profile/real?username=alice`);
  const row = rowOf(page, 0);
  await row.waitFor();
  await page.waitForTimeout(700);
  const text = (await row.innerText()).replace(/\s+/g, " ");
  assert.ok(!/Bob|Carol|Alice/.test(text), `yazar adı satırda yok (${text})`);
  assert.equal(await row.locator("[data-card-actions]").count(), 1, "sayaçlar var");
  assert.equal(await row.locator("[data-card-edit]").count(), 0, "başkasının/profil listesinde Düzenle yok");
  await shot(page, "rows-profile");
}, { viewport: { width: 1280, height: 900 } });

await scenario("4. Arama: sonuçlar satırdır, eşleşen sözcük başlıkta işaretlenir", async ({ page }) => {
  await page.goto(`${BASE}/discover?q=prompt`);
  const row = rowOf(page, 0);
  await row.waitFor();
  await page.waitForTimeout(700);
  const media = await rect(row.locator("[data-card-media]"));
  const title = await rect(row.getByRole("link", { name: /Görsel/ }).first());
  assert.ok(title.l >= media.r - 1, "arama sonucu SATIR: başlık görselin sağında");
  const marked = await row.locator("mark").first().innerText();
  assert.equal(marked.toLowerCase(), "prompt", "eşleşen sözcük işaretli");
  await shot(page, "rows-search");
}, {
  viewport: { width: 1280, height: 900 },
  setup: ({ db, rows }) => {
    db.rpc.search_content = () => ({ body: rows.slice(0, 3).map((r, i) => ({ id: r.id, sort_rank: 10 - i, created_at: r.created_at })) });
  },
});

await scenario("5. İçeriklerim: sosyal sayaçların yerine kopyalama + kaydedilme sayaçları", async ({ page }) => {
  await page.goto(`${BASE}/my-content`);
  const row = rowOf(page, 0);
  await row.waitFor();
  const metrics = row.locator("[data-row-metrics]");
  await metrics.waitFor();
  await metrics.getByTitle("Kopyalama").waitFor();
  await metrics.getByTitle("Kaydedilme").waitFor();
}, { viewport: { width: 1280, height: 900 }, setup: own });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
