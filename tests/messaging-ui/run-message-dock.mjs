// Mesajlar dock'u arayüz testleri (ağ taklitli) — docs/history/328-*. Çalıştırma: README.md.
// Büyük ekranda (≥ lg) sağ altta sabit hap + açılır sohbet paneli; telefon/tablet/`/messages`/ziyaretçide dock yok. Gerçek Supabase'e/cihaza karşı denenmedi.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";

const BASE = "http://localhost:4198/promptly";
const server = await serve(4198);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const BOB = "c0000000-0000-4000-8000-0000000000b1";
const CAROL = "c0000000-0000-4000-8000-0000000000b2";
const DAVE = "c0000000-0000-4000-8000-0000000000b3";

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, setup, lang = "tr", theme, guest = false } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, guest ? { guest: true } : undefined);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/dockfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const pill = (page) => page.locator("[data-message-dock-pill]");
const panel = (page) => page.locator("[data-message-dock]");
const row = (page, text) => panel(page).locator("[data-conversation-row]", { hasText: text });
const title = (page) => panel(page).locator("[data-dock-chat-title]");
const seed = (db) => {
  db.addConv(BOB, U.bob, { texts: ["merhaba alice", "selam bob", "nasılsın"] });
  db.addConv(CAROL, U.carol, { texts: ["carol'dan selam"] });
};
// Bob'dan okunmamış mesajlar: ME üyelik satırı (db.members) unread_count.
const withUnread = (db, convId, n) => { db.member(convId, ME).unread_count = n; };
const open = async (page, path = "/") => { await page.goto(`${BASE}${path}`); await pill(page).waitFor(); };
const setup1 = (db) => { seed(db); withUnread(db, BOB, 3); };
const sendChat = async (page, text) => {
  const box = panel(page).getByPlaceholder(/Bir mesaj yaz|Write a message/);
  await box.waitFor();
  await box.fill(text);
  await panel(page).getByRole("button", { name: /Mesaj gönder|Send message/ }).click();
};

await scenario("1. Masaüstü: sağ altta sabit hap + okunmamış SOHBET sayısı; basınca panel sağ altta açılır, sayfa/adres değişmez", async ({ page }) => {
  await open(page);
  const url = page.url();
  assert.equal((await pill(page).locator("[data-dock-badge]").innerText()).trim(), "1", "one unread CHAT (3 unread messages in it)");
  const pr = await pill(page).evaluate((el) => { const r = el.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
  assert.ok(pr.right > 0 && pr.right < 40 && pr.bottom > 0 && pr.bottom < 30, `pill hugs the bottom-right corner ${JSON.stringify(pr)}`);
  await pill(page).click();
  await panel(page).waitFor();
  assert.equal(await pill(page).count(), 0, "pill is replaced by the panel");
  const pn = await panel(page).evaluate((el) => { const r = el.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, h: r.height }; });
  assert.ok(pn.right < 40 && pn.bottom < 30 && pn.w >= 360 && pn.h > 300, `panel is bottom-right ${JSON.stringify(pn)}`);
  assert.equal(page.url(), url, "no navigation");
  await row(page, "Bob").waitFor(); await row(page, "Carol").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "not a modal: nothing dims the page");
  assert.equal(await page.locator("main").first().isVisible(), true);
}, { setup: setup1 });

await scenario("2. Liste → sohbet panelde açılır, mesajlar görünür; yazılan mesaj gerçekten gönderilir; adres değişmez", async ({ page, db }) => {
  await open(page);
  const url = page.url();
  await pill(page).click();
  await row(page, "Bob").click();
  await panel(page).locator("[data-message-id]", { hasText: "nasılsın" }).waitFor();
  assert.match(await title(page).innerText(), /Bob/);
  await sendChat(page, "dock'tan selam");
  await panel(page).locator("[data-message-id]", { hasText: "dock'tan selam" }).waitFor();
  const posted = calls(db, "messages", "POST");
  assert.equal(posted.length, 1, "exactly one message written");
  assert.equal(JSON.stringify(posted[0].body).includes("dock'tan selam"), true);
  assert.equal(page.url(), url, "still on the same page");
  assert.equal(db.member(BOB, ME).unread_count, 0, "chat is read while it is open in the dock");
}, { setup: setup1 });

await scenario("3. Sayfa değişse de panel ve açık sohbet yerinde kalır", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await row(page, "Carol").click();
  await title(page).waitFor();
  await page.locator("a[href$='/discover']:visible, a[href$='/discover/']:visible").first().click();
  await page.waitForURL(/\/discover/);
  await panel(page).waitFor();
  assert.match(await title(page).innerText(), /Carol/, "same chat after navigating");
  await panel(page).locator("[data-message-id]", { hasText: "carol'dan selam" }).waitFor();
}, { setup: setup1 });

await scenario("4. Küçült → hap geri gelir; hap'a basınca kaldığı sohbetten devam eder; geri oku listeye döner", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await row(page, "Bob").click();
  await title(page).waitFor();
  await panel(page).locator("[data-dock-minimize]").click();
  await panel(page).waitFor({ state: "detached" });
  await pill(page).waitFor();
  assert.equal(await pill(page).evaluate((el) => document.activeElement === el), true, "focus returns to the pill");
  await pill(page).click();
  await title(page).waitFor();
  assert.match(await title(page).innerText(), /Bob/);
  await panel(page).locator("[data-dock-back]").click();
  await row(page, "Carol").waitFor();
  assert.equal(await title(page).count(), 0);
}, { setup: setup1 });

await scenario("5. 'Tam sayfada aç': sohbet → /messages/local?id=…, liste → /messages; dock orada yok", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await row(page, "Bob").click();
  await title(page).waitFor();
  await panel(page).locator("[data-dock-expand]").click();
  await page.waitForURL(new RegExp(`/messages/local/?\\?id=${BOB}`));
  await page.locator("[data-message-id]").first().waitFor();
  assert.equal(await pill(page).count(), 0); assert.equal(await panel(page).count(), 0);
  await open(page);
  await pill(page).click();
  await panel(page).locator("[data-dock-expand]").click();
  await page.waitForURL(/\/messages\/?$/);
  assert.equal(await panel(page).count(), 0);
}, { setup: setup1 });

await scenario("6. Üst menüdeki mesaj simgesi (büyük ekran) paneli açar ve kapatır; sayfaya gitmez", async ({ page }) => {
  await open(page);
  const url = page.url();
  const icon = page.locator("[data-header-messages]");
  assert.equal(await icon.evaluate((el) => el.tagName), "BUTTON");
  await icon.click();
  await panel(page).waitFor();
  assert.equal(await icon.getAttribute("aria-expanded"), "true");
  await icon.click();
  await panel(page).waitFor({ state: "detached" });
  await pill(page).waitFor();
  assert.equal(page.url(), url);
}, { setup: setup1 });

await scenario("7. /messages sayfalarında dock yok; üst simge /messages bağlantısı kalır", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-conversation-row]").first().waitFor();
  assert.equal(await pill(page).count(), 0); assert.equal(await panel(page).count(), 0);
  const icon = page.locator("[data-header-messages]");
  assert.equal(await icon.evaluate((el) => el.tagName), "A");
  assert.match(await icon.getAttribute("href"), /\/messages/);
  await page.goto(`${BASE}/messages/local?id=${BOB}`);
  await page.locator("[data-message-id]").first().waitFor();
  assert.equal(await pill(page).count(), 0); assert.equal(await panel(page).count(), 0);
}, { setup: setup1 });

await scenario("8a. Tablet (md, 900px): dock yok; mesaj simgesi eskisi gibi /messages bağlantısı", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const icon = page.locator("[data-header-messages]");
  await icon.waitFor();
  await page.waitForTimeout(500);
  assert.equal(await pill(page).count(), 0);
  assert.equal(await icon.evaluate((el) => el.tagName), "A");
}, { setup: setup1, viewport: { width: 900, height: 800 } });

await scenario("8b. Telefon (390px): dock yok; simgeye basınca /messages sayfası açılır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const icon = page.locator("[data-header-messages]");
  await icon.waitFor();
  await page.waitForTimeout(500);
  assert.equal(await pill(page).count(), 0); assert.equal(await panel(page).count(), 0);
  await icon.click();
  await page.waitForURL(/\/messages\/?$/);
  await page.locator("[data-conversation-row]:visible").first().waitFor();
}, { setup: setup1, viewport: { width: 390, height: 800 } });

await scenario("8c. Eşik: 1024px'te dock var, 1023px'te yok (yeniden boyutlanınca canlı)", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await panel(page).waitFor();
  await page.setViewportSize({ width: 1023, height: 800 });
  await panel(page).waitFor({ state: "detached" });
  assert.equal(await pill(page).count(), 0);
  await page.setViewportSize({ width: 1024, height: 800 });
  await panel(page).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal scroll at the threshold");
}, { setup: setup1, viewport: { width: 1024, height: 800 } });

await scenario("9. Ziyaretçide dock yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(800);
  assert.equal(await pill(page).count(), 0); assert.equal(await panel(page).count(), 0);
}, { setup: setup1, guest: true });

await scenario("10. Mesaj istekleri: şerit görünür → istekler listesi → geri okla gelen kutusu", async ({ page }) => {
  await open(page);
  await pill(page).click();
  const banner = panel(page).locator("[data-dock-requests-banner]");
  await banner.waitFor();
  await banner.click();
  await row(page, "Dave").waitFor();
  assert.equal(await row(page, "Bob").count(), 0, "inbox chats are not in the requests list");
  await panel(page).locator("[data-dock-back]").click();
  await row(page, "Bob").waitFor();
  await banner.waitFor();
}, { setup: (db) => { seed(db); db.addConv(DAVE, U.dave, { status: "pending", texts: ["merhaba, tanışabilir miyiz"], my: { status: "pending" } }); } });

await scenario("11. Arama sohbetleri süzer; eşleşme yoksa boş durum", async ({ page }) => {
  await open(page);
  await pill(page).click();
  const search = panel(page).locator("[data-dock-search]");
  await search.fill("carol");
  await row(page, "Carol").waitFor();
  assert.equal(await row(page, "Bob").count(), 0);
  await search.fill("yokböyleşey");
  await panel(page).getByText("Aramanla eşleşen sohbet yok", { exact: false }).waitFor();
}, { setup: setup1 });

await scenario("12. Yeni sohbet: var olan kişi panelde açılır; yeni kişi → taslak (hiçbir şey oluşmaz) → ilk mesajla sohbet oluşur ve panelde açılır", async ({ page, db }) => {
  await open(page);
  const url = page.url();
  await pill(page).click();
  await panel(page).locator("[data-dock-new-chat]").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("section[aria-label='Takip ettiklerim'] li", { hasText: "Bob" }).click();
  await title(page).waitFor();
  assert.match(await title(page).innerText(), /Bob/, "existing chat opens in the dock, no draft");
  await panel(page).locator("[data-dock-back]").click();
  await panel(page).locator("[data-dock-new-chat]").click();
  await page.getByRole("dialog").locator("section[aria-label='Takip ettiklerim'] li", { hasText: "Amy" }).click();
  await title(page).filter({ hasText: "Amy" }).waitFor();
  await panel(page).getByText("Sohbet, ilk mesajını gönderdiğinde başlar.").waitFor();
  assert.equal(db.conversations.length, 2, "the draft created nothing (only the two seeded chats)");
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
  await sendChat(page, "ilk mesaj dock'tan");
  await panel(page).locator("[data-message-id]", { hasText: "ilk mesaj dock'tan" }).waitFor();
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 1);
  assert.equal(db.conversations.length, 3);
  assert.equal(page.url(), url, "never left the page");
}, { setup: (db) => { setup1(db); db.follow(U.alice, U.amy); db.follow(U.alice, U.bob); } });

await scenario("13. İngilizce: hap ve panel etiketleri çevrilir", async ({ page }) => {
  await open(page);
  assert.match(await pill(page).getAttribute("aria-label"), /Open messages/);
  await pill(page).click();
  assert.equal(await panel(page).getAttribute("aria-label"), "Messages");
  await panel(page).getByRole("button", { name: "Minimize" }).waitFor();
  await panel(page).getByRole("button", { name: "Open the Messages page" }).waitFor();
  await row(page, "Bob").click();
  await panel(page).getByRole("button", { name: "Open chat as a full page" }).waitFor();
}, { setup: setup1, lang: "en" });

await scenario("14. Yazma ekranı açıkken dock gizlenir (data-app-chrome)", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await panel(page).waitFor();
  await page.goto(`${BASE}/requests/new`);
  await page.waitForSelector("html[data-compose-open]");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-message-dock-pill], [data-message-dock]").evaluateAll((els) => els.every((el) => getComputedStyle(el).display === "none")), true, "dock hidden while composing");
}, { setup: setup1 });

await scenario("15. Koyu tema: panel ve hap okunur (token renkleri), sohbet içi taşma yok", async ({ page }) => {
  await open(page);
  await pill(page).click();
  await row(page, "Bob").click();
  await panel(page).locator("[data-message-id]").first().waitFor();
  const bg = await panel(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, "rgb(255, 255, 255)", "panel follows the dark surface token");
  assert.equal(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "no horizontal overflow inside the panel");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { setup: setup1, theme: "dark" });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
