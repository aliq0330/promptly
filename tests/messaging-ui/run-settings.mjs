// Ayarlar ana listesi + alt sayfaları (docs/history/318-*): /settings = kategori satırları; /settings/{account,privacy,preferences,developer,legal,danger} = ayrıntı.
// Ağ taklitli; gerçek Supabase'e / claude.ai'a KARŞI DENENMEDİ. Sınananlar: ana liste, her satırın doğru alt sayfaya gitmesi, "← Ayarlar" dönüşü, hesap formlarının istemci doğrulaması,
// gizlilik seçimi, tercih (dil), yasal bağlantılar, hesap silme düğmesinin kilidi, Geliştirici sayfasının güncel rehberi (adres, "Oturum açma yok", Bearer uyarısı), iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4208;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const MCP_ME = "https://example.supabase.co/functions/v1/mcp/me";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", path = "/settings/" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  db.rpc.list_my_api_tokens = () => ({ body: [] });
  db.rpc.list_my_oauth_grants = () => ({ body: [] });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` }).catch(() => {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + path);
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/settings-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const hub = (page) => page.getByRole("navigation", { name: "Ayar bölümleri" });
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

await scenario("1 the hub is a short list: six categories with a one-line description each, no forms; sign-out below", async ({ page }) => {
  await page.getByRole("heading", { name: "Ayarlar", level: 1 }).waitFor();
  const rows = [
    ["Hesap", "/settings/account", /Kullanıcı adı, e-posta ve şifre/],
    ["Gizlilik", "/settings/privacy", /kimin mesaj atabileceği/],
    ["Tercihler", "/settings/preferences", /Görünüm, dil/],
    ["Geliştirici", "/settings/developer", /Claude, ChatGPT/],
    ["Yasal", "/settings/legal", /Kullanım Koşulları ve Gizlilik/],
    ["Tehlikeli bölge", "/settings/danger", /Geri alınamayan/],
  ];
  for (const [title, href, hint] of rows) {
    const link = hub(page).getByRole("link", { name: new RegExp(`^${title}`) });
    assert.match(await link.getAttribute("href"), new RegExp(`${href}/?$`), title);
    assert.match(await link.innerText(), hint, title);
  }
  assert.equal(await page.locator("form").count(), 0, "the hub itself has no forms");
  await page.getByRole("button", { name: "Çıkış yap" }).waitFor();
  await shot(page, "settings-hub");
});

await scenario("2 every row opens its own sub-page with a title and a back link that returns to the hub", async ({ page }) => {
  for (const [row, title] of [["Hesap", "Hesap"], ["Gizlilik", "Gizlilik"], ["Tercihler", "Tercihler"], ["Geliştirici", "Geliştirici"], ["Yasal", "Yasal"], ["Tehlikeli bölge", "Tehlikeli bölge"]]) {
    await hub(page).getByRole("link", { name: new RegExp(`^${row}`) }).click();
    await page.getByRole("heading", { name: title, level: 1 }).waitFor();
    await page.locator("[data-settings-back]").click();
    await page.waitForURL(/\/settings\/?$/);
    await page.getByRole("heading", { name: "Ayarlar", level: 1 }).waitFor();
  }
});

await scenario("3 account: username, email and password cards; a mismatching password is refused in the browser", async ({ page }) => {
  await page.getByRole("heading", { name: "Kullanıcı adı", level: 3 }).waitFor();
  await page.getByRole("heading", { name: "E-posta değiştir", level: 3 }).waitFor();
  await page.getByRole("heading", { name: "Şifre değiştir", level: 3 }).waitFor();
  await page.getByLabel("Yeni şifre", { exact: true }).fill("abcdef1");
  await page.getByLabel(/Yeni şifre \(tekrar\)|Yeni şifreyi doğrula|Yeni şifre tekrar/).fill("abcdef2");
  await page.getByRole("button", { name: "Şifreyi güncelle" }).click();
  await page.getByText(/eşleşmiyor/).waitFor();
}, { path: "/settings/account/" });

await scenario("4 privacy: message permission + blocked users; the blocked page goes back to Privacy", async ({ page }) => {
  await page.getByRole("heading", { name: "Mesaj izni", level: 3 }).waitFor().catch(async () => { await page.locator("input[name=message-privacy]").first().waitFor(); });
  await page.locator("input[name=message-privacy]").first().waitFor();
  const blocked = page.getByRole("link", { name: /Engellenen/ }).first();
  assert.match(await blocked.getAttribute("href"), /\/settings\/blocked\/?$/);
  await blocked.click();
  await page.waitForURL(/\/settings\/blocked\/?$/);
  const back = page.getByRole("link", { name: "Ayarlara dön" });
  assert.match(await back.getAttribute("href"), /\/settings\/privacy\/?$/);
}, { path: "/settings/privacy/" });

await scenario("5 preferences: appearance, language (switching to English relabels the page), tour", async ({ page }) => {
  await page.getByRole("heading", { name: "Tercihler", level: 1 }).waitFor();
  await page.locator("input[name=language]").nth(1).check();
  await page.getByRole("heading", { name: "Preferences", level: 1 }).waitFor();
}, { path: "/settings/preferences/" });

await scenario("6 legal: both rows lead to the public pages", async ({ page }) => {
  const rows = page.locator("section[aria-labelledby=settings-legal]");
  assert.match(await rows.getByRole("link", { name: /Kullanım Koşulları/ }).getAttribute("href"), /\/terms\/?$/);
  assert.match(await rows.getByRole("link", { name: /Gizlilik Politikası/ }).getAttribute("href"), /\/privacy\/?$/);
}, { path: "/settings/legal/" });

await scenario("7 danger: deleting the account stays locked until the username is typed", async ({ page }) => {
  const button = page.getByRole("button", { name: "Hesabımı kalıcı olarak sil" });
  await button.waitFor();
  assert.equal(await button.isDisabled(), true);
}, { path: "/settings/danger/" });

await scenario("8 developer: the guide is current — address to copy, 'Oturum açma yok', header name, Bearer warning; keys + connected apps + docs link below", async ({ page, db }) => {
  const guide = page.locator("[data-dev-connect]");
  await guide.waitFor();
  await guide.getByText("Anahtarla (önerilen)").waitFor();
  await guide.locator("pre", { hasText: new RegExp(`^${MCP_ME.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }).waitFor();
  await guide.getByText(/«Oturum açma yok»/).waitFor();
  await guide.locator("pre", { hasText: /^Authorization$/ }).waitFor();
  await guide.locator("pre", { hasText: /^Bearer pmt_/ }).waitFor();
  await guide.getByText(/«Bearer» kelimesini ve ardındaki boşluğu unutma/).waitFor();
  await guide.getByText("Hesabınla giriş (OAuth) — deneysel").waitFor();
  await page.getByRole("heading", { name: "Anahtarlarım", level: 3 }).waitFor();
  await page.locator("[data-api-keys]").waitFor();
  await page.getByRole("heading", { name: "Bağlı uygulamalar" }).waitFor();
  assert.match(await page.getByRole("link", { name: /Geliştirici belgeleri/ }).first().getAttribute("href"), /\/developers\/?$/);
  assert.equal(await page.getByText(/henüz yayında değil/).count(), 0, "no stale preview note");
  assert.ok(!(await page.locator("body").innerText()).match(/pmt_[A-Za-z0-9_-]{43}/), "no real-looking key on the page");
  void db;
  await shot(page, "settings-developer");
}, { path: "/settings/developer/" });

await scenario("9 developer: the address copy button copies the personal MCP address", async ({ page }) => {
  await page.getByRole("button", { name: /Kopyala: .*(adres|address)/i }).first().click().catch(async () => { await page.locator("[data-dev-copy]").first().click(); });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), MCP_ME);
}, { path: "/settings/developer/" });

await scenario("10 English: hub and developer guide use English labels", async ({ page }) => {
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: /^Developer/ }).click();
  await page.getByRole("heading", { name: "Developer", level: 1 }).waitFor();
  await page.getByText("With a key (recommended)").waitFor();
  await page.getByText(/Don't forget the word “Bearer”/).waitFor();
  await page.getByText("Sign in with your account (OAuth) — experimental").waitFor();
}, { lang: "en" });

await scenario("11 phone: the hub and the developer page do not overflow sideways", async ({ page }) => {
  await page.getByRole("heading", { name: "Ayarlar", level: 1 }).waitFor();
  assert.ok(await overflowFree(page));
  await page.goto(BASE + "/settings/developer/");
  await page.locator("[data-dev-connect]").waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "settings-developer-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("12 an old #settings-developer link still opens the hub (no crash)", async ({ page }) => {
  await page.getByRole("heading", { name: "Ayarlar", level: 1 }).waitFor();
}, { path: "/settings/#settings-developer" });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
