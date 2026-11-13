// Yorum sıralaması · sabit yorum · "N yeni yorum" · "Yazar" rozeti (docs/history/385-*) — ağ taklitli arayüz testi.
// Gerçek Supabase'e / gerçek cihaza KARŞI DENENMEDİ. Veritabanı kuralları: supabase/tests/comment-pin.sql.
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   CHROMIUM_PATH=… node tests/messaging-ui/run-comment-order.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { ID, PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const PORT = 4231;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", signedIn = ME, setup, clock = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  seedComments(db, "prompt");
  setup?.(db);
  const state = { commentUrls: [], newCount: 0 };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { signedIn });
  await installDetailData(context);
  // "N yeni yorum" yoklaması: HEAD + count=exact; sayıyı test belirler.
  await context.route("https://example.supabase.co/rest/v1/prompt_comments**", async (route) => {
    const req = route.request();
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-range": `*/${state.newCount}` }, body: "" });
    if (req.method() === "GET") state.commentUrls.push(req.url());
    return route.fallback();
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  if (clock) await page.clock.install();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.locator("#comments").waitFor();
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cofail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const section = (page) => page.locator("#comments");
const names = async (page) => (await section(page).locator("[data-comment-id]").allTextContents()).map((t) => /(Deniz|Elif|Selin|Mert|Yeni)/.exec(t)?.[1]);
// Tablet/masaüstü: satır içi çipler; telefon: SectionMenu alt sayfası (docs/history/385-*).
const isPhone = (page) => (page.viewportSize()?.width ?? 1280) < 640;
const sortTrigger = (page) => section(page).locator("[data-section-menu]:visible");
const pick = async (page, key) => {
  if (isPhone(page)) { await sortTrigger(page).click(); await page.locator(`[data-section-option='${key}']`).click(); }
  else await section(page).locator(`[data-sort-chip='${key}']`).click();
};
const showAll = async (page) => { const b = section(page).getByRole("button", { name: /Tümünü gör|View all/ }); if (await b.count()) await b.click(); };
/** Liste yeniden yüklenirken geçici boş kalabilir: ilk yorum beklenen olana dek yokla. */
const firstIs = async (page, who) => { for (let i = 0; i < 100; i++) { if ((await names(page))[0] === who) return; await page.waitForTimeout(50); } assert.equal((await names(page))[0], who); };
const find = (db, who) => db.comments.find((c) => c.body.startsWith(who));

await scenario("1. varsayılan sıra EN YENİ: ilk üç yorum en yeniler, 'Tümünü gör' en eskiyi sona açar", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.deepEqual(await names(page), ["Mert", "Selin", "Elif"]);
  await showAll(page);
  assert.deepEqual(await names(page), ["Mert", "Selin", "Elif", "Deniz"]);
  assert.equal(await section(page).locator("[data-sort-chip='newest'][aria-pressed='true']").count(), 1, "En yeni çipi seçili");
  assert.equal(await page.locator("[data-section-option]").count(), 0, "masaüstünde açılır kutu/pencere yok");
});

await scenario("2. sıralama menüsü: En eski ve En beğenilen sunucuya sıralama olarak gider, liste yeniden dizilir", async ({ page, state }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await showAll(page);
  await pick(page, "oldest");
  await page.getByText(/Deniz:/).first().waitFor();
  assert.deepEqual(await names(page), ["Deniz", "Elif", "Selin", "Mert"]);
  assert.ok(state.commentUrls.some((u) => /order=pinned_at\.desc\.nullslast%2Ccreated_at\.asc%2Cid\.asc/.test(u)), "En eski: created_at.asc, sabit başta");
  await pick(page, "liked");
  await firstIs(page, "Elif");
  assert.ok(state.commentUrls.some((u) => /like_count\.desc/.test(u)), "En beğenilen: like_count.desc");
  await pick(page, "newest");
  await firstIs(page, "Mert");
}, { setup: (db) => { find(db, "Elif").like_count = 9; find(db, "Deniz").like_count = 2; } });

await scenario("3. içerik sahibi yorumu sabitler: en üste çıkar, etiket görünür, sayfa yenilenince de başta; sabitlemeyi kaldırınca eski yerine döner", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await showAll(page);
  const deniz = section(page).locator("[data-comment-id]", { hasText: "Deniz:" });
  await deniz.locator("[data-comment-pin]").click();
  await page.locator("[data-comment-pinned]").waitFor();
  assert.deepEqual(await names(page), ["Deniz", "Mert", "Selin", "Elif"]);
  assert.equal(db.calls.filter((c) => c.table === "set_comment_pinned").length, 1);
  assert.equal(find(db, "Deniz").pinned_at !== null, true);
  // Sayfa yenilenince sunucu sırası (sabit önce) geri gelir
  await page.reload();
  await page.locator("#comments").waitFor();
  await page.getByText(/Deniz:/).first().waitFor();
  assert.equal((await names(page))[0], "Deniz", "sabit yorum yenilemeden sonra da başta");
  await showAll(page);
  // En eski sıralamada da başta kalır; ikinci yorumu sabitlemek ilkini düşürür (hedef başına tek)
  await section(page).locator("[data-comment-id]", { hasText: "Selin:" }).locator("[data-comment-pin]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-comment-pinned]").length === 1);
  assert.equal((await names(page))[0], "Selin");
  assert.equal(find(db, "Deniz").pinned_at, null, "önceki sabit kalktı");
  await section(page).locator("[data-comment-id]", { hasText: "Selin:" }).locator("[data-comment-pin]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-comment-pinned]").length === 0);
  assert.equal((await names(page))[0], "Mert");
}, { signedIn: U.carol.id });

await scenario("4. sahip olmayan 'Sabitle' görmez; sabit yorum etiketiyle başta durur; yazarın yorumunda 'Yazar' rozeti var", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-comment-pin]").count(), 0, "yorum yazarı / okuyucu sabitleyemez");
  assert.equal(await section(page).locator("[data-comment-pinned]").count(), 1);
  assert.equal((await names(page))[0], "Deniz");
  await pick(page, "newest");
  assert.equal((await names(page))[0], "Deniz", "sabit hangi sıralamada olursa olsun başta");
  const own = section(page).locator("[data-comment-id]", { hasText: "Yeni:" });
  assert.ok(await own.getByText("Yazar", { exact: true }).count() === 1, "içerik sahibinin yorumunda Yazar rozeti");
  assert.equal(await section(page).locator("[data-comment-id]", { hasText: "Mert:" }).getByText("Yazar", { exact: true }).count(), 0);
  void db;
}, { setup: (db) => { find(db, "Deniz").pinned_at = "2026-09-25T10:00:00Z"; db.comments.push({ id: crypto.randomUUID(), body: "Yeni: Prompt sahibinin kendi yorumu", author_id: U.carol.id, prompt_id: ID.prompt, parent_id: null, created_at: "2026-09-24T10:00:00Z" }); } });

await scenario("5. sabitleme hata verirse geri alınır ve hata görünür", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await showAll(page);
  await section(page).locator("[data-comment-id]", { hasText: "Deniz:" }).locator("[data-comment-pin]").click();
  await page.getByText(/Yalnızca ana yorumlar|Yorumu yalnızca içeriğin sahibi|Yorum sabitlenemedi|sabitle/i).first().waitFor();
  assert.equal(await section(page).locator("[data-comment-pinned]").count(), 0, "iyimser sabit geri alındı");
  assert.equal((await names(page))[0], "Mert");
  void db;
}, { signedIn: U.carol.id, setup: (db) => { db.pinError = "pin_not_allowed"; } });

await scenario("6. 'N yeni yorum' hapı: 45 sn'de yoklanır, sayı varsa görünür, tıklayınca liste yeniden yüklenir", async ({ page, db, state }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-new-comments]").count(), 0, "başta yok");
  state.newCount = 2;
  db.comments.push({ id: crypto.randomUUID(), body: "Yeni: Sonradan gelen yorum", author_id: U.erin.id, prompt_id: ID.prompt, parent_id: null, created_at: "2026-10-01T10:00:00Z" });
  await page.clock.fastForward(46000);
  const pill = section(page).locator("[data-new-comments]");
  await pill.waitFor();
  assert.match(await pill.textContent(), /2 yeni yorum/);
  state.newCount = 0;
  await pill.click();
  await page.getByText(/Yeni: Sonradan gelen/).first().waitFor();
  assert.equal((await names(page))[0], "Yeni", "yeni yorum en üstte");
  assert.equal(await section(page).locator("[data-new-comments]").count(), 0, "hap kayboldu");
}, { clock: true });

await scenario("7. İngilizce: sıralama çipleri ve sabit yorum etiketi çevrilmiş", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-sort-chip='newest']").textContent(), "Newest");
  assert.equal(await section(page).locator("[data-sort-chip='liked']").textContent(), "Top");
  assert.equal(await section(page).locator("[data-sort-chip='oldest']").textContent(), "Oldest");
  assert.match(await section(page).locator("[data-comment-pinned]").textContent(), /Pinned comment/);
}, { lang: "en", setup: (db) => { find(db, "Deniz").pinned_at = "2026-09-25T10:00:00Z"; } });

await scenario("7b. tablet (768): çipler satır içi, açılır kutu yok", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-sort-chip]:visible").count(), 3);
  assert.equal(await section(page).locator("[data-section-menu]:visible").count(), 0, "tablette menü düğmesi yok");
  await pick(page, "oldest");
  await page.getByText(/Deniz:/).first().waitFor();
  assert.equal(await page.locator("[data-section-option]").count(), 0);
}, { viewport: { width: 768, height: 1000 } });

await scenario("8. telefon: sıralama menüsü alt sayfa olarak açılır, seçenek seçilince kapanır; yatay taşma yok", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-sort-chip]:visible").count(), 0, "telefonda çip satırı yok");
  await sortTrigger(page).click();
  const options = page.locator("[data-section-option]");
  await options.first().waitFor();
  assert.equal(await options.count(), 3);
  await options.nth(2).click();
  await page.getByText(/Deniz:/).first().waitFor();
  assert.equal(await options.count(), 0, "sayfa kapandı");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "taşma yok");
}, { viewport: { width: 390, height: 800 } });

await browser.close();
server.close?.();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
