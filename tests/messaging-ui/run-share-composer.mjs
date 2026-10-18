// Ana Sayfa paylaşım bestecisi: "Nerede paylaşmak istiyorsun?" hedef seçici + "Paylaşım oluştur" (ağ taklitli) — docs/history/197-*.
// Gerçek Supabase'e KARŞI DENENMEDİ. Topluluk RPC'leri `mock-communities.mjs`'te.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4192/promptly";
const server = await serve(4192);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), C = id(3), D = id(4), E = id(5);

function world(db) {
  db.addCommunity(A, { name: "Açık Topluluk", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(B, { name: "Kapalı Topluluk", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(C, { name: "Yönetim Alanı", visibility: "public", myRole: "member", feedPolicy: "admins", members: [[U.bob, "owner"]] });
  db.addCommunity(D, { name: "Kapatılmış Topluluk", visibility: "public", myRole: "member", closed: true, members: [[U.bob, "owner"]] });
  db.addCommunity(E, { name: "Dış Topluluk", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] });
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup = world } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/scfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const composer = (page) => page.getByRole("region", { name: "Paylaşım oluştur" });
const selector = (page) => page.locator("[data-share-destination]");
const createBtn = (page) => page.locator("[data-create-share]");
const open = async (page) => { await page.goto(`${BASE}/`); await selector(page).waitFor(); await page.waitForTimeout(500); };
const openPicker = async (page) => { await selector(page).click(); await page.getByRole("listbox").waitFor(); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Varsayılan hedef 'Genel akış': etiket, seçici ve 'Paylaşım oluştur' normal oluşturma ekranına gider", async ({ page }) => {
  await open(page);
  await page.getByText("Nerede paylaşmak istiyorsun?").first().waitFor();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
  assert.match(await selector(page).textContent(), /Genel akış/);
  const href = (await createBtn(page).getAttribute("href")) ?? "";
  assert.match(href, /\/create\/?$/, `general feed → plain create (${href})`);
  assert.equal(await createBtn(page).getAttribute("data-create-share"), "ready");
});

await scenario("2. Seçici: Genel akış önce, sonra YALNIZ üyesi olunan ve kapatılmamış topluluklar (ad + logo); dış ve kapatılmış yok", async ({ page }) => {
  await open(page);
  await openPicker(page);
  const options = page.getByRole("option");
  await options.nth(0).waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-destination-option]").length >= 4);
  const names = await options.allTextContents();
  assert.match(names[0], /Genel akış/);
  const joined = names.join("|");
  assert.match(joined, /Açık Topluluk/);
  assert.match(joined, /Kapalı Topluluk/);
  assert.match(joined, /Yönetim Alanı/);
  assert.doesNotMatch(joined, /Dış Topluluk/, "a community the viewer is not in is not offered");
  assert.doesNotMatch(joined, /Kapatılmış Topluluk/, "a closed (read-only) community cannot receive posts");
  assert.equal(await options.nth(0).getAttribute("aria-selected"), "true", "Genel akış is the selected one");
  assert.equal(await page.locator(`[data-destination-option='${A}'] img, [data-destination-option='${A}'] [class*='rounded-full']`).count() > 0, true, "logo (avatar) shown per community");
});

await scenario("3. Topluluk seçilince: ad + logo görünür, seçici kapanır; 'Paylaşım oluştur' ?community= ile o topluluğa hazırlar ve tür seçimi bağlamı taşır", async ({ page }) => {
  await open(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  assert.equal(await selector(page).getAttribute("data-share-destination"), A);
  assert.match(await selector(page).textContent(), /Açık Topluluk/);
  assert.match(await selector(page).textContent(), /Herkese açık topluluk/);
  assert.ok((await selector(page).locator("span.inline-flex, img").count()) > 0, "logo slot rendered");
  const href = (await createBtn(page).getAttribute("href")) ?? "";
  assert.match(href, new RegExp(`/create/?\\?community=${A}$`));
  await createBtn(page).click();
  await page.waitForURL(new RegExp(`/create/?\\?community=${A}`));
  // tür seçim ekranı topluluk bağlamını her türe taşır
  const links = await page.locator("a[href*='community=']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  assert.ok(links.length >= 4, `the four content types carry the community (${links.length})`);
  assert.ok(links.every((l) => l.includes(`community=${A}`)));
});

await scenario("3b. Kapalı topluluk seçilince ipucu 'Yalnızca üyeler görür'; Genel akış'a dönünce 'Herkese açık'", async ({ page }) => {
  await open(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${B}']`).click();
  assert.match(await selector(page).textContent(), /Kapalı Topluluk/);
  assert.match(await selector(page).textContent(), /Yalnızca üyeler görür/);
  await openPicker(page);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
  assert.match(await selector(page).textContent(), /Herkese açık/);
});

await scenario("4. Yalnız yönetimin paylaşabildiği topluluk: düğme pasif + açıklama; Genel akış'a dönünce yeniden etkin", async ({ page }) => {
  await open(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${C}']`).click();
  await page.locator("[data-share-blocked]").waitFor();
  assert.match(await page.locator("[data-share-blocked]").textContent(), /Yalnızca yönetim kadrosu içerik paylaşabilir/);
  assert.equal(await createBtn(page).getAttribute("data-create-share"), "blocked");
  assert.equal(await createBtn(page).isDisabled(), true);
  await openPicker(page);
  await page.locator("[data-destination-option='feed']").click();
  await page.locator("[data-share-blocked]").waitFor({ state: "detached" });
  assert.equal(await createBtn(page).getAttribute("data-create-share"), "ready");
});

await scenario("5. Hiç topluluğu olmayan kullanıcı: boş durum + 'Topluluk bul'; Genel akış yine seçilebilir", async ({ page }) => {
  await open(page);
  await openPicker(page);
  await page.locator("[data-destination-empty]").waitFor();
  assert.match(await page.locator("[data-destination-empty]").textContent(), /Henüz üyesi olduğun bir topluluk yok/);
  assert.match((await page.locator("[data-destination-empty] a").getAttribute("href")) ?? "", /\/communities\/all/);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
}, { setup: () => {} });

await scenario("6. Mobil (390px): seçici ve düğme tam genişlik/alt alta, liste alt sayfa gibi açılır, yatay taşma yok", async ({ page }) => {
  await open(page);
  const sel = await selector(page).boundingBox();
  const btn = await createBtn(page).boundingBox();
  assert.ok(sel.width > 300 && btn.width > 300, `full width (${sel.width}, ${btn.width})`);
  assert.ok(btn.y > sel.y + sel.height - 1, "button sits below the selector on a phone");
  assert.ok(sel.height >= 44, "touch target ≥ 44px");
  assert.equal(await overflowFree(page), true);
  await openPicker(page);
  const box = await page.getByRole("listbox").boundingBox();
  assert.ok(box.width <= 390, "list fits the screen");
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 800 } });

await scenario("7. İngilizce: etiket, varsayılan hedef, düğme ve ipuçları çevrilmiş", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await selector(page).waitFor();
  await page.getByText("Where do you want to share?").first().waitFor();
  assert.match(await selector(page).textContent(), /Main feed/);
  assert.match(await createBtn(page).textContent(), /Create post/);
  await selector(page).click();
  await page.getByText("My communities").waitFor();
  await page.locator(`[data-destination-option='${B}']`).click();
  assert.match(await selector(page).textContent(), /Visible to members only/);
}, { lang: "en" });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
