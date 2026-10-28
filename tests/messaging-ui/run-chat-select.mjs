// Mesajlar: WhatsApp tarzı düz liste + ⋯ menüsü + seçim modu (Arşivle · Okundu · Sil) — ağ taklitli, gerçek Supabase'e bağlanmaz.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";

const BASE = "http://localhost:4177/promptly";
const server = await serve(4177);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const cid = (n) => `c0000000-0000-4000-8000-0000000000c${n}`;
const PEOPLE = [U.bob, U.carol, U.dave, U.amy, U.zed, U.erin];
const PHONE = { width: 390, height: 560 };

async function scenario(name, fn, { viewport = PHONE, setup } = {}) {
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/sfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

/** Altı birebir sohbet: Bob 3 okunmamış, Carol 1; Amy arşivde. */
const seed = (db) => {
  PEOPLE.forEach((p, i) => db.addConv(cid(i + 1), p, { texts: ["merhaba", `selam ${p.display_name}`], my: i === 0 ? { unread_count: 3 } : i === 1 ? { unread_count: 1 } : i === 3 ? { archived_at: new Date().toISOString() } : {} }));
};
const rowsOf = (page) => page.locator("[data-conversation-row]:visible");
const names = async (page) => (await rowsOf(page).locator("span.truncate").allInnerTexts()).map((t) => t.trim());
const row = (page, name) => rowsOf(page).filter({ hasText: name }).first();
const openList = async (page) => { await page.goto(`${BASE}/messages`); await rowsOf(page).first().waitFor(); await page.waitForTimeout(250); };
const enterSelect = async (page) => {
  await page.locator("[data-conversations-more]:visible").click();
  await page.locator("[data-conversations-select]").click();
  await page.locator("[data-selection-bar]").waitFor();
};
const bar = (page) => page.locator("[data-selection-bar]");
const memberOf = (db, n) => db.member(cid(n), ME);

await scenario("1. Düz liste: kutusuz satırlar, büyük avatar, iki satırlık önizleme; ⋯ menüsü iki seçenek verir", async ({ page }) => {
  await openList(page);
  assert.equal((await names(page)).length, 5, "arşivdeki Amy hariç beş sohbet");
  const avatar = await rowsOf(page).first().locator("span[style*='width: 56px']").first().boundingBox();
  assert.ok(avatar && Math.round(avatar.width) === 56, "avatar 56px");
  const first = await rowsOf(page).first().boundingBox();
  assert.ok(first.width >= 388, `satır tam genişlikte (${first.width})`);
  await page.locator("[data-conversations-more]:visible").click();
  await page.getByRole("menuitem", { name: "Sohbet seç" }).waitFor();
  await page.getByRole("menuitem", { name: "Tümü okundu" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("menuitem", { name: "Sohbet seç" }).waitFor({ state: "detached" });
}, { setup: seed });

await scenario("2. Sohbet seç: sayaç başlığı, satıra dokunmak yönlendirmez; sabit alt çubuk kaydırınca yerinde kalır, alt menü gizli", async ({ page }) => {
  await openList(page);
  await enterSelect(page);
  await page.locator("[data-selection-header]").getByText("Sohbet seç").waitFor();
  assert.equal(await page.locator("[data-selection-archive]").isDisabled(), true, "seçim yokken pasif");
  await row(page, "Bob").click();
  await row(page, "Carol").click();
  await page.locator("[data-selection-header]").getByText("2 sohbet seçildi").waitFor();
  assert.equal(await row(page, "Bob").getAttribute("aria-checked"), "true");
  assert.equal(await row(page, "Erin").getAttribute("aria-checked"), "false");
  assert.match(page.url(), /\/messages\/?$/, "satıra dokunmak sohbeti açmaz");
  assert.equal(await page.locator("[data-app-nav]").isVisible(), false, "alt uygulama menüsü gizli");
  const place = () => bar(page).evaluate((el) => ({ pos: getComputedStyle(el).position, bottom: Math.round(el.getBoundingClientRect().bottom), h: innerHeight }));
  const before = await place();
  assert.equal(before.pos, "fixed");
  assert.ok(before.h - before.bottom <= 40 && before.bottom <= before.h, `ekranın altında (${JSON.stringify(before)})`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  assert.deepEqual(await place(), before, "kaydırınca yerinde kalır");
  await page.locator("[data-selection-header] button").click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-app-nav]").isVisible(), true, "seçim bitince alt menü döner");
}, { setup: seed });

await scenario("3. Arşivle: seçili sohbetler kendi üyelik satırında arşivlenir, listeden düşer, seçim kapanır", async ({ page, db }) => {
  await openList(page);
  await enterSelect(page);
  await row(page, "Bob").click();
  await row(page, "Dave").click();
  await page.locator("[data-selection-archive]").click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.ok(memberOf(db, 1).archived_at && memberOf(db, 3).archived_at, "ikisi arşivlendi");
  assert.equal(memberOf(db, 2).archived_at, null);
  const left = await names(page);
  assert.ok(!left.includes("Bob") && !left.includes("Dave") && left.includes("Carol"), left.join());
  await page.getByRole("status").filter({ hasText: "2 sohbet arşivlendi" }).waitFor();
}, { setup: seed });

await scenario("4. Okundu: yalnız sayaç sıfırlanır (rozet kalkar), imleç RPC'si çağrılmaz", async ({ page, db }) => {
  await openList(page);
  assert.ok(await row(page, "Bob").getByText("3", { exact: true }).isVisible());
  await enterSelect(page);
  await row(page, "Bob").click();
  await page.locator("[data-selection-read]").click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.deepEqual(db.unreadResets, [cid(1)]);
  assert.equal(db.readCalls.length, 0, "okundu bilgisi karşı tarafa gitmez");
  assert.equal(await row(page, "Bob").getByText("3", { exact: true }).count(), 0);
  assert.ok(await row(page, "Carol").getByText("1", { exact: true }).isVisible(), "seçilmeyen etkilenmez");
}, { setup: seed });

await scenario("5. Sil: önce onay penceresi; Vazgeç hiçbir şeyi değiştirmez, onay listeden kaldırır", async ({ page, db }) => {
  await openList(page);
  await enterSelect(page);
  await row(page, "Zed").click();
  await row(page, "Erin").click();
  await page.locator("[data-selection-delete]").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "2 sohbet listenden kaldırılsın mı?" }).waitFor();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(memberOf(db, 5).deleted_at, null);
  assert.equal(await page.locator("[data-selection-header]").getByText("2 sohbet seçildi").count(), 1, "seçim korunur");
  await page.locator("[data-selection-delete]").click();
  await page.getByRole("dialog").getByRole("button", { name: "Sil", exact: true }).click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.ok(memberOf(db, 5).deleted_at && memberOf(db, 6).deleted_at, "ikisi kişisel listeden kaldırıldı");
  const left = await names(page);
  assert.ok(!left.includes("Zed") && !left.includes("Erin"), left.join());
  assert.equal(db.messages.filter((m) => m.conversation_id === cid(5)).length, 2, "mesajların kendisi silinmez");
}, { setup: seed });

await scenario("6. Sunucu reddederse sessiz başarı yok: sohbetler seçili kalır, hata görünür, liste değişmez", async ({ page, db }) => {
  db.failMemberPatch = true;
  await openList(page);
  await enterSelect(page);
  await row(page, "Bob").click();
  await page.locator("[data-selection-archive]").click();
  await page.getByRole("alert").filter({ hasText: "1 sohbette işlem yapılamadı" }).waitFor();
  assert.equal(await row(page, "Bob").getAttribute("aria-checked"), "true");
  assert.ok((await names(page)).includes("Bob"));
  assert.equal(memberOf(db, 1).archived_at, null);
}, { setup: seed });

await scenario("7. Tümü okundu: okunmamış tüm sohbetler (yalnız gelen kutusu) sıfırlanır; hiç yoksa menü pasif", async ({ page, db }) => {
  await openList(page);
  await page.locator("[data-conversations-more]:visible").click();
  await page.locator("[data-conversations-mark-all]").click();
  await page.getByRole("status").filter({ hasText: "2 sohbet okundu olarak işaretlendi" }).waitFor();
  assert.deepEqual([...db.unreadResets].sort(), [cid(1), cid(2)]);
  await page.locator("[data-conversations-more]:visible").click();
  assert.equal(await page.locator("[data-conversations-mark-all]").isDisabled(), true);
}, { setup: seed });

await scenario("8. Arşivlenenler görünümünde 'Arşivden çıkar' etiketi; seçilenler gelen kutusuna döner", async ({ page, db }) => {
  await openList(page);
  await page.locator("[data-section-menu]:visible").first().click();
  await page.getByRole("radio", { name: /^Arşivlenenler/ }).click();
  await row(page, "Amy").waitFor();
  await enterSelect(page);
  assert.equal((await page.locator("[data-selection-archive]").innerText()).trim(), "Arşivden çıkar");
  await row(page, "Amy").click();
  await page.locator("[data-selection-archive]").click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.equal(memberOf(db, 4).archived_at, null);
}, { setup: seed });

await scenario("9. Masaüstü iki bölmeli panelde çubuk panelin içinde yapışkan (tüm ekrana yayılmaz)", async ({ page }) => {
  await openList(page);
  await enterSelect(page);
  const info = await bar(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { pos: getComputedStyle(el).position, width: Math.round(r.width) };
  });
  assert.equal(info.pos, "sticky");
  assert.ok(info.width < 520, `panel genişliğinde (${info.width})`);
  assert.equal(await page.locator("[data-app-nav]").count() === 0 || !(await page.locator("[data-app-nav]").isVisible()), true);
}, { viewport: { width: 1280, height: 800 }, setup: seed });

await scenario("10. İngilizce: menü, başlık, çubuk ve onay metinleri çevrilmiş", async ({ page, context }) => {
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "en"); } catch {} });
  await openList(page);
  await page.locator("[data-conversations-more]:visible").click();
  await page.getByRole("menuitem", { name: "Select chats" }).waitFor();
  await page.getByRole("menuitem", { name: "Mark all as read" }).waitFor();
  await page.getByRole("menuitem", { name: "Select chats" }).click();
  await row(page, "Bob").click();
  await page.locator("[data-selection-header]").getByText("1 selected").waitFor();
  assert.equal((await page.locator("[data-selection-archive]").innerText()).trim(), "Archive");
  assert.equal((await page.locator("[data-selection-read]").innerText()).trim(), "Read");
  await page.locator("[data-selection-delete]").click();
  await page.getByRole("dialog").getByRole("heading", { name: "Remove 1 selected from your list?" }).waitFor();
}, { setup: seed });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
