// "Kullanım Koşulları güncellendi" bandı + yasal bağlantılar (docs/history/300-*): koşullar yürürlüğe girmeden önce hesap açmış oturumlu kullanıcıya bir kez
// çıkan kapatılabilir kart ("Tamam" ya da "Koşulları oku" = görüldü, /terms'i açmak da okumak sayılır, yeniden yüklemede dönmez), yürürlükten sonra açılan hesaba
// ve ziyaretçiye ÇIKMAZ, telefonda alt menünün üstünde taşmadan durur, yazma ekranı/hikâye açıkken gizlenir, İngilizce; ve Terms/Privacy bağlantıları
// (geniş kenar çubuğu, Ayarlar → Yasal, telefonda hesap menüsü). Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const PORT = 4202;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const ORIGINAL_CREATED_AT = U.alice.created_at;
const KEY = "promptly-terms-notice";
const VERSION = "2026-11-01";
const DELAY = 3600; // bant 2,5 sn gecikmeyle çıkar
// Bağlantılar basePath ve sondaki eğik çizgiyle çözülür (/promptly/terms/).
const TERMS_HREF = /\/terms\/?$/;
const PRIVACY_HREF = /\/privacy\/?$/;

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, createdAt = null } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  U.alice.created_at = createdAt ?? ORIGINAL_CREATED_AT;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.addInitScript(([l]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, [lang]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/legal-fail-${results.length}.png` }); } catch {}
  } finally {
    U.alice.created_at = ORIGINAL_CREATED_AT;
    await context.close();
  }
}

const notice = (page) => page.locator("[data-terms-notice]");
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
/** Bandın görünüp görünmediğini gecikmeyi aşacak kadar bekleyip denetler. */
async function expectNoNotice(page) {
  await page.waitForTimeout(DELAY);
  assert.equal(await notice(page).count(), 0, "no notice");
}

await scenario("1 existing account: the notice appears after a short delay with title, body and two actions", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await page.getByRole("heading", { name: "Ayarlar" }).first().waitFor();
  await page.waitForTimeout(800);
  assert.equal(await notice(page).count(), 0, "not instantly: a short delay so it never fights the first paint");
  await notice(page).waitFor();
  const text = await notice(page).innerText();
  assert.match(text, /Kullanım Koşulları güncellendi/);
  assert.match(text, /yeniden kullanma, atıf ve API\/MCP/);
  assert.match(await notice(page).getByRole("link", { name: "Koşulları oku" }).getAttribute("href"), TERMS_HREF);
  await notice(page).getByRole("button", { name: "Tamam" }).waitFor();
  assert.equal(await stored(page), null, "nothing is stored until the person reacts");
  await shot(page, "legal-notice-desktop");
});

await scenario("2 'Tamam' hides it, remembers the version, and it stays gone after a reload", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await notice(page).waitFor();
  await notice(page).getByRole("button", { name: "Tamam" }).click();
  assert.equal(await notice(page).count(), 0);
  assert.equal(await stored(page), VERSION);
  await page.reload();
  await page.getByRole("heading", { name: "Ayarlar" }).first().waitFor();
  await expectNoNotice(page);
});

await scenario("3 'Koşulları oku' opens the terms, marks the version seen, and the notice does not come back", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await notice(page).waitFor();
  await notice(page).getByRole("link", { name: "Koşulları oku" }).click();
  await page.waitForURL(/\/promptly\/terms\/?$/);
  await page.getByRole("heading", { name: "Kullanım Koşulları" }).first().waitFor();
  assert.equal(await stored(page), VERSION);
  assert.match(await page.locator("main").innerText(), /Başkalarının içeriklerini kullanma ve atıf/, "the new section is on the page");
  await page.goto(BASE + "/settings/");
  await expectNoNotice(page);
});

await scenario("4 opening the terms page by itself counts as reading it", async ({ page }) => {
  await page.goto(BASE + "/terms/");
  await page.getByRole("heading", { name: "Kullanım Koşulları" }).first().waitFor();
  await page.waitForTimeout(DELAY);
  assert.equal(await notice(page).count(), 0, "never shown on the terms page itself");
  assert.equal(await stored(page), VERSION);
  await page.goto(BASE + "/settings/");
  await expectNoNotice(page);
});

await scenario("5 an account created after the terms took effect never sees the notice", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await page.getByRole("heading", { name: "Ayarlar" }).first().waitFor();
  await expectNoNotice(page);
}, { createdAt: "2026-11-02T10:00:00Z" });

await scenario("6 a visitor (no account) never sees the notice", async ({ page }) => {
  await page.goto(BASE + "/login/");
  await page.waitForTimeout(DELAY);
  assert.equal(await notice(page).count(), 0);
}, { guest: true });

await scenario("7 English texts", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await notice(page).waitFor();
  const text = await notice(page).innerText();
  assert.match(text, /Terms of Use updated/);
  assert.match(text, /reusing other people's prompts, attribution and API\/MCP access/);
  await notice(page).getByRole("link", { name: "Read the terms" }).waitFor();
  await notice(page).getByRole("button", { name: "Got it" }).waitFor();
}, { lang: "en" });

await scenario("8 phone: the card sits above the bottom nav, inside the screen, without horizontal overflow", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await notice(page).waitFor();
  const geometry = await page.evaluate(() => {
    const card = document.querySelector("[data-terms-notice]").getBoundingClientRect();
    const nav = [...document.querySelectorAll("nav[data-app-chrome], [data-app-chrome]")].find((el) => el.tagName === "NAV" && getComputedStyle(el).position === "fixed" && !el.hasAttribute("data-terms-notice"));
    const navTop = nav ? nav.getBoundingClientRect().top : null;
    return { left: card.left, right: card.right, top: card.top, bottom: card.bottom, vw: innerWidth, vh: innerHeight, navTop };
  });
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.vw, `inside horizontally: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.vh, "inside vertically");
  assert.ok(geometry.navTop !== null, "the bottom nav exists");
  assert.ok(geometry.bottom <= geometry.navTop + 0.5, `card (${geometry.bottom}) does not overlap the bottom nav (${geometry.navTop})`);
  assert.ok(await overflowFree(page), "no horizontal overflow");
  await shot(page, "legal-notice-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("9 hidden while the compose screen or the story viewer is open (shared chrome rules)", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await notice(page).waitFor();
  await page.evaluate(() => document.documentElement.setAttribute("data-compose-open", ""));
  assert.equal(await notice(page).evaluate((el) => getComputedStyle(el).display), "none", "compose open → hidden");
  await page.evaluate(() => { document.documentElement.removeAttribute("data-compose-open"); document.documentElement.setAttribute("data-story-open", ""); });
  assert.equal(await notice(page).evaluate((el) => getComputedStyle(el).visibility), "hidden", "story open → hidden");
  await page.evaluate(() => document.documentElement.removeAttribute("data-story-open"));
  assert.equal(await notice(page).evaluate((el) => getComputedStyle(el).visibility), "visible", "and it comes back");
});

await scenario("10 desktop: terms and privacy links in the wide sidebar (also for a visitor)", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  const side = page.locator("aside[data-app-chrome]");
  await side.getByRole("link", { name: "Kullanım Koşulları" }).waitFor();
  assert.match(await side.getByRole("link", { name: "Kullanım Koşulları" }).getAttribute("href"), TERMS_HREF);
  assert.match(await side.getByRole("link", { name: "Gizlilik Politikası" }).getAttribute("href"), PRIVACY_HREF);
  await shot(page, "legal-sidebar");
});

await scenario("10b visitor on desktop also finds them in the sidebar (a public page inside the shell)", async ({ page }) => {
  await page.goto(BASE + "/privacy/");
  const side = page.locator("aside[data-app-chrome]");
  await side.getByRole("link", { name: "Gizlilik Politikası" }).waitFor();
}, { guest: true });

await scenario("11 settings: the 'Yasal' sub-page has both rows", async ({ page }) => {
  await page.goto(BASE + "/settings/legal/");
  await page.getByRole("heading", { name: "Yasal", level: 1 }).waitFor();
  const group = page.locator("section[aria-labelledby=settings-legal]");
  const terms = group.getByRole("link", { name: /Kullanım Koşulları/ });
  assert.match(await terms.getAttribute("href"), TERMS_HREF);
  assert.match(await terms.innerText(), /yeniden kullanım ve atıf kuralları/);
  assert.match(await group.getByRole("link", { name: /Gizlilik Politikası/ }).getAttribute("href"), PRIVACY_HREF);
  await group.getByRole("link", { name: /Kullanım Koşulları/ }).click();
  await page.waitForURL(/\/terms\/?$/);
});

await scenario("12 phone: the account menu has a 'Yasal' group with both links", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  const menu = page.getByRole("menu", { name: "Hesap menüsü" });
  await menu.getByRole("group", { name: "Yasal" }).waitFor();
  assert.match(await menu.getByRole("menuitem", { name: "Kullanım Koşulları" }).getAttribute("href"), TERMS_HREF);
  assert.match(await menu.getByRole("menuitem", { name: "Gizlilik Politikası" }).getAttribute("href"), PRIVACY_HREF);
  assert.ok(await overflowFree(page));
  await shot(page, "legal-account-menu");
  await menu.getByRole("menuitem", { name: "Gizlilik Politikası" }).click();
  await page.waitForURL(/\/privacy\/?$/);
  assert.equal(await page.getByRole("menu").count(), 0, "menu closes on navigation");
}, { viewport: { width: 390, height: 844 } });

await scenario("13 the English menus and settings use English labels", async ({ page }) => {
  await page.goto(BASE + "/settings/legal/");
  await page.getByRole("heading", { name: "Legal", level: 1 }).waitFor();
  await page.locator("section[aria-labelledby=settings-legal]").getByRole("link", { name: /Terms of Use/ }).waitFor();
  await page.locator("aside[data-app-chrome]").getByRole("link", { name: "Privacy Policy" }).waitFor();
}, { lang: "en" });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
