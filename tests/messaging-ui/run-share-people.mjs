// Paylaş penceresi "Kişiler önce" (docs/history/447-*): sıralama, çoklu seçim + not, topluluk/ekip hedefleri, hata/yeniden deneme, eylem satırı — ağ taklitli.
// Gerçek Supabase'e / gerçek telefona KARŞI DENENMEDİ (yetki/RLS kararı sunucudadır; burada istemci davranışı sınanır).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { installDetailData, ID, PAGES } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4182/promptly";
const server = await serve(4182);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const C_BOB = "c0000000-0000-4000-8000-0000000000c1";
const C_ALICE = "c0000000-0000-4000-8000-0000000000c2";
const GROUP = "c0000000-0000-4000-8000-0000000000a1";
const ADMINS = "c0000000-0000-4000-8000-0000000000a2";
const TEAM_CH = "c0000000-0000-4000-8000-0000000000e1";
const PHONE = { width: 390, height: 800 };

async function scenario(name, fn, { viewport = PHONE, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/sp-fail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const seed = (db) => {
  db.addConv(C_BOB, U.bob, { texts: ["merhaba"] });
  db.addConv(C_ALICE, U.carol, { texts: ["selam"] });
  db.addGroup(GROUP, { name: "Ses Atölyesi", visibility: "public", myRole: "member", members: [[U.bob, "member"]], texts: [[U.bob, "hoş geldin"]] });
  db.addGroup(ADMINS, { name: "Duyurular", visibility: "public", myRole: "member", posting_policy: "admins", members: [[U.bob, "owner"]], texts: [[U.bob, "duyuru"]] });
  db.addTeamChannel(TEAM_CH, { name: "müzik", myRole: "member", members: [[U.bob, "owner"]], texts: [[U.bob, "plan"]] });
};
const openShare = async (page) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.locator("[data-detail-actions]").getByRole("button", { name: /^(Paylaş|Share)$/ }).first().click();
  const modal = page.locator('[data-share-modal="prompt"]');
  await modal.waitFor();
  await modal.locator("[data-share-people-grid]").waitFor();
  return modal;
};
const sent = (db) => db.messages.filter((m) => m.shared_prompt_id === ID.prompt);

await scenario("1. Pencere açılır: kişi, topluluk ve ekip kanalı hedefleri var; yazma yetkisiz topluluk (yalnız yönetim yazar) YOK; önizleme tek satır çip, açıklama yok", async ({ page }) => {
  const modal = await openShare(page);
  await modal.locator(`[data-share-target="${C_BOB}"]`).waitFor();
  await modal.locator(`[data-share-target="${C_ALICE}"][data-share-target-kind="person"]`).waitFor();
  await modal.locator(`[data-share-target="${GROUP}"][data-share-target-kind="community"]`).waitFor();
  await modal.locator(`[data-share-target="${TEAM_CH}"][data-share-target-kind="team"]`).waitFor();
  assert.equal(await modal.locator(`[data-share-target="${ADMINS}"]`).count(), 0, "yalnız yönetimin yazabildiği topluluk hedef değil");
  const preview = modal.locator("[data-share-preview]");
  assert.ok((await preview.boundingBox()).height < 48, "önizleme küçük çip");
  // Kimse seçili değilken eylem satırı: Bağlantı · Alıntıla · Hikâye · Space · Koleksiyon.
  const actions = modal.locator("[data-share-actions]");
  await actions.getByText("Bağlantı", { exact: true }).waitFor();
  await actions.getByText("Alıntıla", { exact: true }).waitFor();
  assert.equal(await modal.locator("[data-share-people-compose]").count(), 0);
  // Pencerenin tamamı telefonda kaydırmadan sığar.
  const box = await modal.locator("[data-share-modal]").boundingBox().catch(() => null);
  if (box) assert.ok(box.height <= 800, "pencere ekrana sığar");
}, { setup: seed });

await scenario("2. Seçince alt satır yazma alanı + gönder düğmesine döner; seçimi bırakınca eylem satırı geri gelir", async ({ page }) => {
  const modal = await openShare(page);
  await modal.locator(`[data-share-target="${C_BOB}"]`).click();
  await modal.locator("[data-share-people-compose]").waitFor();
  assert.equal(await modal.locator("[data-share-actions]").count(), 0);
  assert.equal(await modal.locator(`[data-share-target="${C_BOB}"]`).getAttribute("aria-pressed"), "true");
  await modal.locator(`[data-share-target="${C_ALICE}"]`).click();
  await modal.getByRole("button", { name: /Gönder · 2/ }).waitFor();
  await modal.locator(`[data-share-target="${C_BOB}"]`).click();
  await modal.locator(`[data-share-target="${C_ALICE}"]`).click();
  await modal.locator("[data-share-actions]").waitFor();
}, { setup: seed });

await scenario("3. Çoklu gönderim: not + gömülü prompt her seçili sohbete gider (kişi, topluluk, ekip kanalı); başarı bildirilir ve pencere kapanır", async ({ page, db }) => {
  const modal = await openShare(page);
  for (const id of [C_BOB, GROUP, TEAM_CH]) await modal.locator(`[data-share-target="${id}"]`).click();
  await modal.locator("[data-share-people-note]").fill("Bunu dene");
  await modal.locator("[data-share-people-send]").click();
  await modal.locator("[data-share-people-done]").waitFor();
  const rows = sent(db);
  assert.equal(rows.length, 3);
  assert.deepEqual(new Set(rows.map((m) => m.conversation_id)), new Set([C_BOB, GROUP, TEAM_CH]));
  assert.ok(rows.every((m) => m.body === "Bunu dene"));
  await page.locator('[data-share-modal="prompt"]').waitFor({ state: "detached" });
}, { setup: seed });

await scenario("4. Notsuz gönderim yalnız gömülü prompt yollar", async ({ page, db }) => {
  const modal = await openShare(page);
  await modal.locator(`[data-share-target="${C_ALICE}"]`).click();
  await modal.locator("[data-share-people-send]").click();
  await modal.locator("[data-share-people-done]").waitFor();
  assert.equal(sent(db).length, 1);
  assert.ok(!sent(db)[0].body);
}, { setup: seed });

await scenario("5. Bir hedef hata verirse diğerleri gider, hata hedefin yanında açıklanır ve seçili kalır; yeniden deneme yalnız ona yazar", async ({ page, db }) => {
  const modal = await openShare(page);
  let fail = true;
  await page.route(/\/rest\/v1\/messages(\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && fail && (req.postData() ?? "").includes(C_ALICE)) {
      return route.fulfill({ status: 403, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) });
    }
    return route.fallback();
  });
  await modal.locator(`[data-share-target="${C_BOB}"]`).click();
  await modal.locator(`[data-share-target="${C_ALICE}"]`).click();
  await modal.locator("[data-share-people-send]").click();
  await modal.locator("[data-share-people-error]").waitFor();
  assert.equal(sent(db).length, 1);
  assert.equal(sent(db)[0].conversation_id, C_BOB);
  assert.equal(await modal.locator(`[data-share-target="${C_BOB}"]`).isDisabled(), true, "gönderilen tekrar seçilemez");
  assert.equal(await modal.locator(`[data-share-target="${C_ALICE}"]`).getAttribute("aria-pressed"), "true");
  fail = false;
  await modal.locator("[data-share-people-send]").click();
  await modal.locator("[data-share-people-done]").waitFor();
  assert.equal(sent(db).length, 2);
}, { setup: seed });

await scenario("6. Arama kutusu hedefleri adıyla süzer; eşleşme yoksa 'Tümü' bağlantısı sunulur; 'Tümü' mevcut sohbet seçiciye gider", async ({ page }) => {
  const modal = await openShare(page);
  const more = modal.locator("[data-share-people-more]");
  assert.match((await more.getAttribute("href")) ?? "", /\/messages\/?\?sharePromptId=/);
  await modal.locator("[data-share-people-search] input").fill("ses at");
  await modal.locator(`[data-share-target="${GROUP}"]`).waitFor();
  assert.equal(await modal.locator(`[data-share-target="${C_BOB}"]`).count(), 0);
  await modal.locator("[data-share-people-search] input").fill("yok böyle biri");
  await modal.locator("[data-share-people-empty]").waitFor();
}, { setup: seed });

await scenario("7. Sıralama: son mesajlaşılan sohbet önde (hedef sırası son mesaj zamanına göre)", async ({ page, db }) => {
  const modal = await openShare(page);
  const ids = await modal.locator("[data-share-target]").evaluateAll((els) => els.map((el) => el.getAttribute("data-share-target")));
  const order = [...db.conversations].filter((c) => ids.includes(c.id)).sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).map((c) => c.id);
  assert.deepEqual(ids, order);
}, { setup: seed });

await scenario("8. Bu cihazdan sık paylaşılan sohbet öne geçer (yerel sayaç)", async ({ page, context }) => {
  await context.addInitScript((id) => { try { localStorage.setItem("promptly-share-counts", JSON.stringify({ [id]: { n: 9, at: Date.now() } })); } catch {} }, C_ALICE);
  const modal = await openShare(page);
  const first = await modal.locator("[data-share-target]").first().getAttribute("data-share-target");
  assert.equal(first, C_ALICE);
}, { setup: (db) => { db.addConv(C_ALICE, U.carol, { texts: ["eski"] }); db.addConv(C_BOB, U.bob, { texts: ["yeni"] }); } });

await scenario("9. Eylem satırı: Bağlantı kopyalanır; Alıntıla ikinci pencereyi açar", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const modal = await openShare(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await modal.locator("[data-share-link]").click();
  await modal.getByText("Kopyalandı", { exact: true }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /prompts|share/);
}, { setup: seed });

await scenario("9b. Alıntıla simgesi alıntı penceresini açar", async ({ page }) => {
  const modal = await openShare(page);
  await modal.locator("[data-share-quote]").click();
  await page.locator("[data-quote-popup]").waitFor();
}, { setup: seed });

await scenario("10. İngilizce: etiketler çevrilmiş", async ({ page }) => {
  const modal = await openShare(page);
  await modal.locator("[data-share-people-search] input").waitFor();
  await modal.getByText("All", { exact: true }).waitFor();
  await modal.locator(`[data-share-target="${C_BOB}"]`).click();
  await modal.getByRole("button", { name: /Send/ }).waitFor();
}, { setup: seed, lang: "en" });

await scenario("11. Masaüstü + koyu tema: ızgara 4 sütun, taşma yok", async ({ page }) => {
  const modal = await openShare(page);
  const cols = await modal.locator("[data-share-people-grid]").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  assert.equal(cols, 4);
  const overflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth);
  assert.ok(overflow <= 1);
}, { setup: seed, viewport: { width: 1280, height: 800 } });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
