// Ayarlar → Geliştirici → "Chrome uzantısı" kartı (docs/history/429-*): indirme bağlantısı gerçek zip'e gider, sürüm uzantının manifestinden gelir,
// yükleme adımları ve kullanım/gizlilik metinleri, kopyalanabilir chrome://extensions adresi, "Bağlı uygulamalar" bağlantısı, iki dil, telefonda taşma yok.
// Ağ taklitli; uzantının KENDİSİ gerçek Chromium'da promptly-extension/tests/e2e/run.mjs ile sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4312;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const manifest = JSON.parse(fs.readFileSync(new URL("../../promptly-extension/manifest.json", import.meta.url), "utf8"));

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` }).catch(() => {});
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + "/settings/developer/");
    await page.locator("[data-extension-card]").waitFor();
    await fn({ page, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/extension-card-fail-${results.length}.png`, fullPage: true }); } catch {}
  } finally { await context.close(); }
}

const card = (page) => page.locator("[data-extension-card]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

await scenario("1 card: title, lead, version from the extension's own manifest, five install steps", async ({ page }) => {
  await page.getByRole("heading", { name: "Chrome uzantısı" }).waitFor();
  await page.getByText(/Henüz Chrome Web Store'da yok/).waitFor();
  await card(page).getByText(`Sürüm ${manifest.version} · Chrome 127 veya üstü`).waitFor();
  assert.equal(await card(page).locator("ol > li").count(), 5);
  await card(page).getByText(/Paketlenmemiş öğe yükle/).waitFor();
  await card(page).getByText(/Geliştirici modu/).first().waitFor();
  await shot(page, "extension-card");
});

await scenario("2 the download link points at a real zip that contains the extension (manifest + background + popup, no tests)", async ({ page }) => {
  const link = card(page).locator("[data-extension-download]");
  const href = await link.getAttribute("href");
  assert.ok(href.endsWith("/promptly/downloads/promptly-extension.zip"), href);
  assert.ok(await link.evaluate((a) => a.hasAttribute("download")));
  const res = await page.request.get(new URL(href, BASE).toString());
  assert.equal(res.status(), 200);
  const body = await res.body();
  assert.equal(body.subarray(0, 2).toString(), "PK", "a zip file");
  const text = body.toString("latin1");
  for (const name of ["promptly-extension/manifest.json", "promptly-extension/background.js", "promptly-extension/popup/popup.html", "promptly-extension/content/overlay.js"]) assert.ok(text.includes(name), `zip has ${name}`);
  assert.ok(!text.includes("promptly-extension/tests/"), "no tests in the zip");
});

await scenario("3 chrome://extensions is a copyable block (Chrome pages cannot be linked) and copies to the clipboard", async ({ page }) => {
  await card(page).getByText("chrome://extensions", { exact: true }).waitFor();
  assert.equal(await card(page).locator("a[href^='chrome:']").count(), 0, "never a chrome:// link");
  await card(page).getByRole("button", { name: /Kopyala: chrome:\/\/extensions/ }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "chrome://extensions");
});

await scenario("4 usage + privacy: save, image, palette, slash, browse, run, context, vote; no password, drafts only, no standing site access, revoke link", async ({ page }) => {
  for (const re of [/Kaydet: bir sayfada metin seç/, /Görsel: bir görsele sağ tıkla/, /Palet: yazdığın yerde/, /Slash: bir sitede/, /Gezinme: uzantı simgesine/, /Çalıştır: bir promptta/, /Yan panel bağlamı:/, /Oy ve sonuç:/]) await card(page).getByText(re).waitFor();
  await card(page).getByText(/Şifreni uzantı görmez/).waitFor();
  await card(page).getByText(/yalnız özel taslak ekler/).waitFor();
  await card(page).getByText(/Hiçbir sitede kalıcı erişimi yoktur/).waitFor();
  await card(page).getByText(/sayfaya yüklenen kod ona ulaşamaz/).waitFor();
  await card(page).getByRole("link", { name: "Bağlı uygulamalar" }).click();
  await page.waitForFunction(() => location.hash === "#bagli-uygulamalar");
  assert.ok(await page.locator("#bagli-uygulamalar").isVisible());
});

await scenario("5 English: every block is translated and the placeholders are filled", async ({ page }) => {
  await page.getByRole("heading", { name: "Chrome extension" }).waitFor();
  await card(page).getByText(`Version ${manifest.version} · Chrome 127 or later`).waitFor();
  await card(page).getByRole("link", { name: /Download the extension/ }).waitFor();
  await card(page).getByText(/Click Load unpacked/).waitFor();
  await card(page).getByText(/The extension never sees your password/).waitFor();
  const text = await card(page).innerText();
  assert.ok(!/\{\{?\w+\}\}?/.test(text), "no unfilled {placeholder}");
  assert.ok(!/devSettings\./.test(text), "no raw translation keys");
}, { lang: "en" });

await scenario("6 phone: the card does not overflow sideways", async ({ page }) => {
  assert.ok(await overflowFree(page));
  await shot(page, "extension-card-phone");
}, { viewport: { width: 390, height: 844 } });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
