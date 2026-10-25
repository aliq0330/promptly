// Topluluklar ana sayfası Albüm düzeni (docs/history/212-*): görünür başlık yok, üstte arama + "+"; "Topluluklarım"
// rafı (kare kapaklar, "N yeni" rozeti, yeni olan önce); bölüm balonları (davet sayacı balonda); Gönderiler'de tek satırlık davet
// kartı; arama "Tüm topluluklar"a sorguyla gider. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (sayaç kuralı: community-unseen.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4191/promptly";
const server = await serve(4191);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, invites = 0, unseen = true } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  db.addCommunity(id(1), { name: "Karakter Atölyesi", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(2), { name: "Kod Promptları", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(3), { name: "Lo-fi Stüdyo", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(4), { name: "Anime Çizim", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] });
  db.addPost(id(1), { title: "Portal açan karakter" });
  db.addPost(id(2), { title: "PR açıklaması" });
  for (let i = 0; i < invites; i += 1) {
    db.invitations.push({ id: `f0000000-0000-4000-8000-00000000000${i + 1}`, group_id: id(4), invitee_id: ME, inviter_id: U.bob.id, status: "pending", created_at: db.stamp(), expires_at: "2099-01-01T00:00:00Z" });
  }
  db.rpc.my_community_unseen_counts = () => (unseen ? { body: [{ community_id: id(2), unseen: 4 }, { community_id: id(3), unseen: 120 }] } : { status: 500, body: { message: "boom" } });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/csfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shelf = (page) => page.getByTestId("my-communities-shelf");
const shelfNames = (page) => shelf(page).locator("[data-shelf-community]").evaluateAll((els) => els.map((el) => el.querySelector("span.truncate")?.textContent ?? ""));
// Bölüm menüsü (docs/history/231-*, 232-*): sekmeler artık tek "Akış ▾ / Gönderiler ▾" menüsünün seçenekleridir.
const SECTION_OPTION = "[data-section-option]";
const optMatcher = (name) => (name instanceof RegExp ? name : new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const menuIsOpen = async (page) => (await page.locator(SECTION_OPTION).count()) > 0;
const menuOpen = async (page) => { if (!(await menuIsOpen(page))) { await page.locator("[data-section-menu]").first().click(); await page.locator(SECTION_OPTION).first().waitFor(); } };
const menuClose = async (page) => { if (await menuIsOpen(page)) { await page.keyboard.press("Escape"); await page.locator(SECTION_OPTION).first().waitFor({ state: "detached" }).catch(() => undefined); } };
const menuOption = (page, name) => page.locator(SECTION_OPTION).filter({ hasText: optMatcher(name) }).first();
const hasTab = async (page, name) => { if ((await page.locator("[data-section-menu]").count()) === 0) return false; await menuOpen(page); const found = (await page.locator(SECTION_OPTION).filter({ hasText: optMatcher(name) }).count()) > 0; await menuClose(page); return found; };
const optionText = async (page, name) => { await menuOpen(page); const text = await menuOption(page, name).innerText(); await menuClose(page); return text; };

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await scenario("1. telefon: büyük görünür başlık; menü + simgeler + '+' tek kontrol satırı; raf, gönderiler sırayla (docs/history/232-*)", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  const h1 = await page.getByRole("heading", { level: 1, name: "Topluluklar" }).boundingBox();
  assert.ok(h1 && h1.height > 30, "başlık görünür ve büyük");
  const menu = await page.locator("[data-section-menu]").boundingBox();
  const search = await page.getByRole("button", { name: "Ara", exact: true }).boundingBox();
  const create = await page.getByRole("button", { name: "Topluluk oluştur" }).boundingBox();
  assert.ok(Math.abs(menu.y + menu.height / 2 - (create.y + create.height / 2)) < 6, "menü ve '+' aynı satırda");
  assert.ok(Math.abs(search.y + search.height / 2 - (create.y + create.height / 2)) < 6, "arama simgesi de aynı satırda");
  await shelf(page).waitFor();
  await page.locator("[data-home-post]").first().waitFor();
  const shelfY = (await shelf(page).boundingBox()).y;
  const postY = (await page.locator("[data-home-post]").first().boundingBox()).y;
  assert.ok(menu.y < shelfY && shelfY < postY, "sıra: kontrol satırı → raf → gönderiler");
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "1-phone");
});

await scenario("2. raf: 4:3 kapaklar, yeni olan önce; 'N yeni' rozeti (99+ kesilir); topluluğa bağlanır; üye olunmayan topluluk YOK", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await shelf(page).waitFor();
  const names = await shelfNames(page);
  assert.deepEqual(names.slice(0, 2), ["Lo-fi Stüdyo", "Kod Promptları"], `yeni gönderisi çok olan önce: ${names}`);
  assert.ok(!names.includes("Anime Çizim"), "üye olunmayan topluluk rafta yok");
  assert.equal(await shelf(page).locator(`[data-shelf-community="${id(2)}"]`).getByText("4 yeni").count(), 1);
  assert.equal(await shelf(page).locator(`[data-shelf-community="${id(3)}"]`).getByText("99+ yeni").count(), 1);
  assert.equal(await shelf(page).locator(`[data-shelf-community="${id(1)}"] [data-shelf-unseen]`).count(), 0, "yeni yoksa rozet yok");
  const cover = await shelf(page).locator(`[data-shelf-community="${id(1)}"]`).locator("xpath=./span[1]").boundingBox();
  assert.ok(Math.abs(cover.width / cover.height - 4 / 3) < 0.05, "kapak 4:3");
  assert.match(await shelf(page).locator(`[data-shelf-community="${id(2)}"]`).getAttribute("href"), new RegExp(`/communities/local/?\\?id=${id(2)}`));
  await shelf(page).getByRole("link", { name: "Tümünü gör" }).click();
  await page.waitForURL(/tab=mine/);
});

await scenario("3. sayaç alınamazsa raf rozetsiz çizilir (hata kutusu yok)", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await shelf(page).waitFor();
  assert.equal(await shelf(page).locator("[data-shelf-unseen]").count(), 0);
  assert.equal(await page.getByText("Topluluklar yüklenemedi.").count(), 0);
}, { unseen: false });

await scenario("4. davet: menüde sayaç + nokta; Gönderiler'de tek satırlık kart → 'Gör' Davetler bölümünü açar; Davetler'de kart yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.locator("[data-section-dot]").waitFor();
  assert.match(await optionText(page, /Davet ve başvurular/), /2/);
  const notice = page.getByTestId("home-invite-notice");
  await notice.waitFor();
  assert.match(await notice.textContent(), /2 davetin var.*Anime Çizim/s);
  await notice.getByRole("link", { name: "Gör" }).click();
  await page.waitForURL(/tab=invites/);
  assert.equal(await page.getByTestId("home-invite-notice").count(), 0, "Davetler bölümünde kart tekrar edilmez");
  await shot(page, "4-invites");
}, { invites: 2 });

await scenario("5. arama 'Tüm topluluklar'a sorguyla gider ve sorgu kutuda hazır gelir", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await page.getByRole("searchbox").fill("anime");
  await page.getByRole("searchbox").press("Enter");
  await page.waitForURL(/\/communities\/all\/?\?q=anime/);
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((input) => input.value === "anime"));
});

await scenario("6. ziyaretçi: arama/raf/balon yok, Keşfet listesi + 'Topluluk oluştur' giriş penceresi", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).waitFor();
  assert.equal(await shelf(page).count(), 0);
  assert.equal(await hasTab(page, /Gönderiler/), false);
  await page.getByRole("button", { name: "Topluluk oluştur" }).click();
  await page.getByRole("dialog").waitFor();
}, { guest: true });

await scenario("7. İngilizce + masaüstü: metinler çevrili, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await shelf(page).getByRole("heading", { name: "My communities" }).waitFor();
  await shelf(page).getByText("4 new").waitFor();
  await page.getByTestId("home-invite-notice").getByText("You're invited").waitFor();
  await page.getByTestId("home-invite-notice").getByRole("link", { name: "View" }).waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "7-desktop-en");
}, { lang: "en", invites: 1, viewport: { width: 1280, height: 900 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
