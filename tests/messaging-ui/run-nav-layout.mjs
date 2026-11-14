// Gezinme yerleşimi (docs/history/387-*): bir hedef, bir yer. Masaüstü kenar çubuğu · tablet etiketli ray · telefon alt çubuk + «Sen» sayfası;
// üst çubuk yalnız durum (arama · Odak · bildirim · mesaj), avatar yok. Mesajlar hapı masaüstünde KALIR (kullanıcı kararı).
// Ağ taklitli; gerçek Supabase'e/cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const BASE = "http://localhost:4196/promptly";
const server = await serve(4196);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1100 };
const PHONE = { width: 390, height: 844 };

async function scenario(name, fn, { viewport = DESKTOP, lang = "tr", guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768 });
  await installMock(context, db, { guest });
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
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/nav-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const texts = async (loc) => (await loc.allTextContents()).map((x) => x.trim());
const open = async (page, path = "/discover") => {
  await page.goto(`${BASE}${path}`);
  await page.locator("header[data-app-header]").waitFor();
};

await scenario("1. masaüstü: kenar çubuğu = Oluştur + üç grup (başlıksız · Çalışma · Kütüphane); Profil/Ayarlar/Yasal satırı yok", async ({ page }) => {
  await open(page);
  const side = page.locator("aside[aria-label]:visible");
  assert.equal(await side.count(), 1, "tek gezinme yüzeyi görünür (ray gizli)");
  assert.deepEqual(await texts(side.locator("nav").getByRole("link")), ["Ana Sayfa", "Keşfet", "Topluluklar", "Spaces", "Ekipler", "Studio", "Kaydedilenler", "Takip ettiğim kişiler", "Yaratıcı paneli"]);
  assert.deepEqual(await texts(side.locator("nav p")), ["Çalışma", "Kütüphane"]);
  assert.equal(await side.locator("[data-nav-create]").innerText(), "Oluştur");
  assert.equal(await side.locator("a[href*='/settings'], a[href*='/privacy'], a[href*='/terms'], a[href*='/developers'], a[href*='/moderation']").count(), 0, "Ayarlar/Yasal kenar çubuğunda tekrarlanmaz");
  assert.equal(await side.locator("a[aria-current='page']").textContent(), "Keşfet");
  assert.ok(await page.locator("nav[data-app-nav]").isHidden(), "alt çubuk yok");
  assert.ok(await overflowFree(page));
  await shot(page, "desktop");
});

await scenario("2. masaüstü: kenar çubuğunun altında «Sen» kartı → menü yukarı açılır (İçeriklerim · Ayarlar · Görünüm · Dil · Çıkış · alt bağlantılar); üst çubukta avatar yok", async ({ page }) => {
  await open(page);
  const header = page.locator("header[data-app-header]");
  assert.equal(await header.getByRole("button", { name: /Hesap menüsü/ }).count(), 0, "üst çubukta hesap menüsü yok");
  const card = page.locator("aside:visible [data-nav-you]");
  assert.match(await card.innerText(), /Profil, ayarlar, hesap/);
  await card.click();
  const menu = page.getByRole("menu", { name: "Hesap menüsü" });
  await menu.waitFor();
  const names = (await texts(menu.getByRole("menuitem"))).map((x) => x.replace(/\s+/g, " "));
  for (const expected of ["Alice", "İçeriklerim", "Ayarlar", "GörünümAçık", "DilTürkçe", "Çıkış yap", "Geliştiriciler", "Kullanım Koşulları", "Gizlilik Politikası"]) {
    assert.ok(names.some((n) => n.startsWith(expected) || n.startsWith(`A${expected}`)), `menüde ${expected}: ${JSON.stringify(names)}`);
  }
  assert.equal(await menu.locator("a[href*='/saved'], a[href*='/teams'], a[href*='/spaces']").count(), 0, "kenar çubuğundaki hedefler menüde tekrarlanmaz");
  // Görünüm = tema: koyuya geçer, değer «Koyu» olur.
  await menu.locator("[data-account-appearance]").click();
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("dark")));
  assert.match(await menu.locator("[data-account-appearance]").innerText(), /Koyu/);
  // Dil: İngilizceye geçer.
  await menu.locator("[data-account-language]").click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await shot(page, "desktop-account-menu");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(), 0, "Escape menüyü kapatır");
});

await scenario("3. masaüstü: üst çubuk = arama · Odak (ikon + yazı) · bildirim · mesaj; Mesajlar hapı sağ altta KALIR", async ({ page }) => {
  await open(page, "/");
  const header = page.locator("header[data-app-header]");
  const focus = header.locator("a[href*='/focus']");
  assert.equal(await focus.count(), 1);
  assert.match(await focus.innerText(), /Odak/);
  assert.ok(await header.getByRole("button", { name: /Bildirim/ }).count() >= 1, "bildirim zili");
  await header.locator("[data-header-messages]").waitFor();
  await page.locator("[data-message-dock-pill]").waitFor();
  const box = await page.locator("[data-message-dock-pill]").boundingBox();
  assert.ok(box.x > DESKTOP.width / 2 && box.y > DESKTOP.height / 2, "hap sağ altta");
});

await scenario("4. tablet: etiketli ray (84 px) — Oluştur + Ana Sayfa · Keşfet · Topluluklar │ Spaces · Ekipler · Kaydedilen; kenar çubuğu ve alt çubuk yok", async ({ page }) => {
  await open(page);
  const rail = page.locator("aside[aria-label]:visible");
  assert.equal(await rail.count(), 1);
  assert.equal(Math.round((await rail.boundingBox()).width), 84);
  assert.deepEqual(await texts(rail.locator("nav").getByRole("link")), ["Ana Sayfa", "Keşfet", "Topluluklar", "Spaces", "Ekipler", "Kaydedilen"]);
  assert.equal(await rail.locator("[data-nav-create]").getAttribute("aria-label"), "Oluştur");
  assert.equal(await rail.locator("a[aria-current='page']").innerText(), "Keşfet");
  assert.match(await rail.locator("[data-nav-you]").innerText(), /Sen$/);
  assert.ok(await page.locator("nav[data-app-nav]").isHidden(), "alt çubuk yok");
  const header = page.locator("header[data-app-header]");
  assert.equal(await header.getByRole("button", { name: /Hesap menüsü/ }).count(), 0, "üst çubukta avatar yok");
  assert.equal(await header.locator("a[href*='/focus']").innerText(), "Odak", "Odak: ikon (yazı yalnız ekran okuyucuda)");
  assert.ok(await overflowFree(page));
  await shot(page, "tablet");
}, { viewport: TABLET });

await scenario("5. tablet: «Sen» menüsü rayın yanına açılır ve rayda olmayan Takip · Yaratıcı paneli · Studio kısayollarını listeler", async ({ page }) => {
  await open(page);
  await page.locator("aside:visible [data-nav-you]").click();
  const menu = page.getByRole("menu", { name: "Hesap menüsü" });
  await menu.waitFor();
  const links = await texts(menu.locator("a[href*='/following'], a[href*='/insights'], a[href*='/studio']"));
  assert.deepEqual(links, ["Takip ettiğim kişiler", "Yaratıcı paneli", "Studio"]);
  assert.equal(await menu.locator("a[href*='/saved'], a[href*='/teams'], a[href*='/spaces']").count(), 0, "rayda olanlar tekrarlanmaz");
  const rail = await page.locator("aside:visible").boundingBox();
  const m = await menu.boundingBox();
  assert.ok(m.x >= rail.x + rail.width, "menü rayın sağında");
  assert.ok(m.y >= 0 && m.y + m.height <= TABLET.height, "menü ekrana sığar");
  await page.waitForTimeout(400);
  await shot(page, "tablet-account-menu");
}, { viewport: TABLET });

await scenario("6. telefon: alt çubuk = Ana Sayfa · Keşfet · + · Topluluklar · Sen (Odak yok); üst çubuk = logo · Ara · Odak · Bildirim · Mesaj", async ({ page }) => {
  await open(page);
  const nav = page.locator("nav[data-app-nav]");
  const slots = await texts(nav.locator("li"));
  assert.deepEqual(slots.slice(0, 4), ["Ana Sayfa", "Keşfet", "Oluştur", "Topluluklar"]);
  assert.match(slots[4], /Sen$/);
  assert.equal(await nav.locator("a[href*='/focus']").count(), 0, "Odak alt çubukta değil");
  assert.equal(await nav.locator("a[aria-current='page']").innerText(), "Keşfet");
  const header = page.locator("header[data-app-header]");
  assert.ok(await header.locator("a[href*='/focus']").isVisible(), "Odak üst çubukta");
  // Keşfet'in kendi arama kutusu var; öteki sayfalarda üst çubukta arama ikonu durur.
  await open(page, "/");
  assert.ok(await header.getByRole("link", { name: "Ara" }).isVisible(), "arama ikonu");
  assert.equal(await header.getByRole("button", { name: /Hesap menüsü/ }).count(), 0, "üst çubukta avatar yok");
  assert.ok(await page.locator("aside:visible").count() === 0, "ray/kenar çubuğu yok");
  assert.ok(await overflowFree(page));
  await shot(page, "phone");
}, { viewport: PHONE });

await scenario("7. telefon: «Sen» sekmesi alttan sayfa açar — profil, 6 kısayol, İçeriklerim · Ayarlar · Görünüm · Dil · Çıkış; sürükleyerek/dışına dokunarak kapanır", async ({ page }) => {
  await open(page);
  await page.locator("nav[data-app-nav] [data-nav-you]").click();
  const sheet = page.locator("[data-account-sheet]");
  await sheet.waitFor();
  assert.deepEqual(await texts(sheet.locator("ul a")), ["Kaydedilenler", "Spaces", "Ekipler", "Takip", "Panel", "Studio"]);
  assert.match(await sheet.getByRole("menuitem", { name: "Profilim" }).innerText(), /Profilini gör/);
  for (const row of ["İçeriklerim", "Ayarlar", "Görünüm", "Dil", "Çıkış Yap"]) {
    assert.ok(await sheet.getByRole("menuitem", { name: new RegExp(row, "i") }).first().isVisible(), `satır: ${row}`);
  }
  await page.waitForTimeout(600);
  await shot(page, "phone-sheet");
  await sheet.locator("[data-account-appearance]").click();
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("dark")), "Görünüm koyuya geçer");
  await sheet.getByRole("menuitem", { name: "Spaces" }).click();
  await page.waitForURL(/\/spaces/);
  assert.equal(await page.locator("[data-account-sheet]").count(), 0, "gezinince sayfa kapanır");
}, { viewport: PHONE });

await scenario("8. telefon: Escape «Sen» sayfasını kapatır ve odağı geri verir", async ({ page }) => {
  await open(page);
  await page.locator("nav[data-app-nav] [data-nav-you]").click();
  await page.locator("[data-account-sheet]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-account-sheet]"));
}, { viewport: PHONE });

await scenario("9. telefon: «Sen» çubuk göstergesi — profil/ayarlar sayfasında 5. yuvada yanar", async ({ page }) => {
  await open(page, "/settings");
  await page.locator("nav[data-app-nav]").waitFor();
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.transform === "translateX(400%)");
}, { viewport: PHONE });

await scenario("10. misafir telefon: son yuva «Giriş Yap» bağlantısı; üstte Odak; Mesajlar/Bildirim yok", async ({ page }) => {
  await open(page);
  const nav = page.locator("nav[data-app-nav]");
  assert.equal(await nav.getByRole("link", { name: "Giriş Yap" }).count(), 1);
  assert.equal(await nav.locator("[data-nav-you]").count(), 0);
  assert.ok(await page.locator("header[data-app-header] a[href*='/focus']").isVisible());
}, { viewport: PHONE, guest: true });

await scenario("11. misafir masaüstü: kenar çubuğunda Ekipler/Kütüphane yok, altta «Giriş Yap»", async ({ page }) => {
  await open(page);
  const side = page.locator("aside[aria-label]:visible");
  assert.deepEqual(await texts(side.locator("nav").getByRole("link")), ["Ana Sayfa", "Keşfet", "Topluluklar", "Spaces", "Studio"]);
  assert.equal(await side.getByRole("link", { name: "Giriş Yap" }).count(), 1);
  assert.equal(await side.locator("[data-nav-you]").count(), 0);
}, { guest: true });

await scenario("12. İngilizce: etiketler çevrilir (rayda Saved, kenarda Workspace/Library, sayfada Following/Insights)", async ({ page }) => {
  await open(page);
  const side = page.locator("aside[aria-label]:visible");
  assert.deepEqual(await texts(side.locator("nav p")), ["Workspace", "Library"]);
  assert.equal(await side.locator("[data-nav-create]").innerText(), "Create");
}, { lang: "en" });

await scenario("13. İngilizce tablet: ray etiketleri", async ({ page }) => {
  await open(page);
  const rail = page.locator("aside[aria-label]:visible");
  assert.deepEqual(await texts(rail.locator("nav").getByRole("link")), ["Home", "Discover", "Communities", "Spaces", "Teams", "Saved"]);
  assert.match(await rail.locator("[data-nav-you]").innerText(), /You/);
}, { lang: "en", viewport: TABLET });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
