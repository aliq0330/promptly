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
  // Gezinme yüzeyleri (ray · kenar çubuğu · alt çubuk) hidrasyondan sonra çizilir: hepsi DOM'a girene kadar bekle (soğuk açılışta sayım erken okunuyordu).
  await page.locator("aside[data-app-chrome]").first().waitFor({ state: "attached" });
  await page.locator("nav[data-app-nav]").waitFor({ state: "attached" });
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
  await header.getByRole("button", { name: /Bildirim/ }).first().waitFor();
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

await scenario("6. telefon: alt çubuk = Ana Sayfa · Odak · Mesajlar · Bildirimler · Keşfet; üst çubuk = logo + sayfa adı + avatar (arama/Odak/zil/mesaj üstte yok)", async ({ page }) => {
  await open(page);
  const nav = page.locator("nav[data-app-nav]");
  await nav.locator("li").first().waitFor();
  assert.deepEqual(await texts(nav.locator("li span.truncate")), ["Ana Sayfa", "Odak", "Mesajlar", "Bildirimler", "Keşfet"]);
  assert.equal(await nav.locator("a[aria-current='page']").innerText(), "Keşfet");
  assert.equal(await nav.locator("[data-nav-create], [data-nav-you]").count(), 0, "Oluştur ve Sen alt çubukta değil");
  const header = page.locator("header[data-app-header]");
  assert.equal(await header.locator("[data-header-title]").innerText(), "Keşfet", "üst çubukta sayfanın adı");
  assert.ok(await header.locator("[data-header-you]").isVisible(), "avatar sağda");
  for (const hidden of ["a[href*='/focus']", "[data-header-messages]", "[data-notification-bell], a[href*='/notifications']", "a[aria-label='Ara']"]) {
    assert.equal(await header.locator(`${hidden}:visible`).count(), 0, `üst çubukta görünmez: ${hidden}`);
  }
  // Ana Sayfa'da başlık «Ana Sayfa», avatar sağda.
  await open(page, "/");
  assert.equal(await header.locator("[data-header-title]").innerText(), "Ana Sayfa");
  const you = await header.locator("[data-header-you]").boundingBox();
  assert.ok(you.x + you.width > PHONE.width - 24, `avatar sağ kenarda (${Math.round(you.x + you.width)})`);
  assert.ok(await page.locator("aside:visible").count() === 0, "ray/kenar çubuğu yok");
  assert.ok(await overflowFree(page));
  await shot(page, "phone");
}, { viewport: PHONE });

await scenario("7. telefon: avatar alttan «Sen» sayfası açar — profil, 7 kısayol (Topluluklar dahil), İçeriklerim · Ayarlar · Görünüm · Dil · Çıkış; gezinince kapanır", async ({ page }) => {
  await open(page);
  await page.locator("header[data-app-header] [data-header-you]").click();
  const sheet = page.locator("[data-account-sheet]");
  await sheet.waitFor();
  assert.deepEqual(await texts(sheet.locator("ul a")), ["Kaydedilenler", "Spaces", "Topluluklar", "Ekipler", "Takip", "Panel", "Studio"]);
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

await scenario("8. telefon: Escape «Sen» sayfasını kapatır", async ({ page }) => {
  await open(page);
  await page.locator("header[data-app-header] [data-header-you]").click();
  await page.locator("[data-account-sheet]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-account-sheet]"));
}, { viewport: PHONE });

await scenario("9. telefon: alt çubuk çizgisi — Ana Sayfa 1., Mesajlar 3. (200%), Keşfet 5. yuvada; yuvası olmayan sayfada (Ayarlar) görünmez", async ({ page }) => {
  const indicator = () => page.locator("nav[data-app-nav] [data-nav-indicator]").evaluate((el) => [el.style.transform, el.style.opacity]);
  await open(page, "/");
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.transform === "translateX(0%)");
  await open(page, "/discover");
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.transform === "translateX(400%)");
  await open(page, "/messages");
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.transform === "translateX(200%)");
  await open(page, "/settings");
  await page.waitForFunction(() => document.querySelector("nav[data-app-nav] [data-nav-indicator]")?.style.opacity === "0");
  assert.equal((await indicator())[1], "0");
}, { viewport: PHONE });

await scenario("10. misafir telefon: aynı beş yuva; Mesajlar/Bildirimler giriş penceresi açar; üstte avatar yok, Giriş Yap menüsü var", async ({ page }) => {
  await open(page);
  const nav = page.locator("nav[data-app-nav]");
  await nav.locator("li").first().waitFor();
  assert.deepEqual(await texts(nav.locator("li span.truncate")), ["Ana Sayfa", "Odak", "Mesajlar", "Bildirimler", "Keşfet"]);
  assert.equal(await page.locator("[data-header-you]").count(), 0, "misafirde avatar yok");
  await nav.getByRole("button", { name: "Mesajlar" }).click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Giriş/);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.ok(await page.locator("header[data-app-header] button[aria-label='Hesap menüsü'], header[data-app-header] [aria-haspopup='menu']").first().isVisible(), "giriş/kayıt menüsü üstte");
}, { viewport: PHONE, guest: true });

await scenario("10b. telefon: mavi «+» hub'ı YALNIZ Ana Sayfa, Keşfet ve kendi profilinde; başka sayfada ve başkasının profilinde yok", async ({ page }) => {
  const hub = page.locator("[data-create-hub]");
  for (const path of ["/", "/discover", "/profile/real?username=alice"]) {
    await open(page, path);
    await hub.waitFor({ timeout: 6000 });
    const box = await hub.boundingBox();
    const navBox = await page.locator("nav[data-app-nav]").boundingBox();
    assert.ok(box.x + box.width <= PHONE.width - 8 && box.x > PHONE.width / 2, `${path}: hub sağda`);
    assert.ok(box.y + box.height <= navBox.y, `${path}: hub alt çubuğun üstünde`);
    assert.ok(box.width >= 44 && box.height >= 44, `${path}: dokunma hedefi`);
  }
  for (const path of ["/communities", "/saved", "/settings", "/messages", "/profile/real?username=bob"]) {
    await open(page, path);
    await page.waitForTimeout(500);
    assert.equal(await hub.count(), 0, `${path}: hub yok`);
  }
  // Hub Oluştur menüsünü açar.
  await open(page, "/");
  await hub.click();
  await page.locator("[data-create-menu]").waitFor();
}, { viewport: PHONE });

await scenario("10c. telefon: sayfa adı üst çubukta — Mesajlar, Topluluklar, Kaydedilenler; başlığı olmayan rotada logo yazısı", async ({ page }) => {
  const header = page.locator("header[data-app-header]");
  for (const [path, title] of [["/messages", "Mesajlar"], ["/communities", "Topluluklar"], ["/saved", "Kaydedilenler"]]) {
    await open(page, path);
    assert.equal(await header.locator("[data-header-title]").innerText(), title, path);
  }
  await open(page, "/prompts/local?id=nope");
  assert.equal(await header.locator("[data-header-title]").count(), 0, "başlıksız rotada sayfa adı yok");
  assert.ok(await header.locator("[data-header-brand]").isVisible(), "logo bağlantısı durur");
}, { viewport: PHONE });

await scenario("10d. telefon: üst çubuk sayfa adını yazıyorsa sayfanın kendi aynı başlığı gizli (çift başlık yok); masaüstünde sayfa başlığı durur (docs/history/463-*)", async ({ page }) => {
  const header = page.locator("header[data-app-header]");
  const routes = ["/", "/discover", "/communities", "/spaces", "/teams", "/saved", "/messages", "/settings", "/following", "/followers", "/my-content", "/insights", "/studio", "/tags", "/communities/all", "/profile/edit"];
  const dupes = [];
  for (const path of routes) {
    await open(page, path);
    await page.waitForTimeout(500);
    const title = (await header.locator("[data-header-title]").count()) ? (await header.locator("[data-header-title]").innerText()).trim() : null;
    if (!title) continue;
    const visible = await page.evaluate((t) => [...document.querySelectorAll("main h1, main h2")].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && el.textContent.trim() === t).length, title);
    if (visible > 0) dupes.push(`${path}: «${title}» ×${visible}`);
  }
  assert.deepEqual(dupes, [], "sayfada üst çubukla aynı görünür başlık kalmamalı");
}, { viewport: PHONE });

await scenario("10e. masaüstü: aynı sayfalarda sayfanın kendi başlığı GÖRÜNÜR (yalnız telefonda gizlenir)", async ({ page }) => {
  for (const [path, title] of [["/discover", "Keşfet"], ["/settings", "Ayarlar"], ["/my-content", "İçeriklerim"]]) {
    await open(page, path);
    await page.locator("main h1", { hasText: title }).first().waitFor({ state: "visible" });
  }
});

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
