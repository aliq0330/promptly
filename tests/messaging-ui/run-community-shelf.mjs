// Topluluklar ana sayfası Hub düzeni (docs/history/379-*; "Topluluklarım" rafı 212-*): bant + sekmeler; Topluluklarım kartları ("N yeni" rozeti, yeni olan önce);
// davet tek satırlık dikkat şeridi; arama "Tüm topluluklar"a sorguyla gider. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (sayaç kuralı: community-unseen.sql).
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

const cardsOf = (page) => page.locator("[data-community-card]");
const cardNames = (page) => cardsOf(page).evaluateAll((els) => els.map((el) => el.querySelector("h3")?.textContent ?? ""));
const optMatcher = (name) => (name instanceof RegExp ? name : new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const tabEl = (page, name) => page.getByRole("tab", { name: optMatcher(name) }).first();
const hasTab = async (page, name) => (await page.getByRole("tab", { name: optMatcher(name) }).count()) > 0;

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

await scenario("1. telefon (Hub düzeni, docs/history/379-*, 474-*): bant (başlık + tam genişlik 'Topluluk oluştur') → sekmeler → kontrol satırı → kart ızgarası; taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await cardsOf(page).first().waitFor();
  // Telefonda başlık üst çubuktadır, bantta gizlidir (docs/history/463-*): konumlar açıklamadan okunur.
  const intro = await page.locator("[data-hub-band] p").boundingBox();
  assert.ok(intro && intro.height > 10, "açıklama görünür");
  const create = await page.locator("[data-create-community]").boundingBox();
  // Stil 2 (docs/history/474-*): telefonda birincil düğme açıklamanın altında tam genişliktir (44 px).
  assert.ok(create.y > intro.y && create.width >= 300 && Math.abs(create.height - 44) < 2, `birincil düğme bantta tam genişlik (${create.width}×${create.height})`);
  await cardsOf(page).first().waitFor();
  const tabsY = (await page.getByRole("tablist").first().boundingBox()).y;
  const cardY = (await cardsOf(page).first().boundingBox()).y;
  assert.ok(intro.y < tabsY && tabsY < cardY, "sıra: bant → sekmeler → kartlar");
  assert.equal(await tabEl(page, "Topluluklarım").getAttribute("aria-selected"), "true", "ilk sekme Topluluklarım varsayılan");
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "1-phone");
});

await scenario("2. Topluluklarım: kartlar, yeni olan önce; 'N yeni' rozeti (99+ kesilir); topluluğa bağlanır; üye olunmayan topluluk YOK", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await cardsOf(page).first().waitFor();
  const names = await cardNames(page);
  assert.deepEqual(names.slice(0, 2), ["Lo-fi Stüdyo", "Kod Promptları"], `yeni gönderisi çok olan önce: ${names}`);
  assert.ok(!names.includes("Anime Çizim"), "üye olunmayan topluluk listede yok");
  assert.equal(await page.locator(`[data-community-card="${id(2)}"]`).getByText("4 yeni").count(), 1);
  assert.equal(await page.locator(`[data-community-card="${id(3)}"]`).getByText("99+ yeni").count(), 1);
  assert.equal(await page.locator(`[data-community-card="${id(1)}"] [data-shelf-unseen]`).count(), 0, "yeni yoksa rozet yok");
  const cover = await page.locator(`[data-community-card="${id(1)}"] > div`).first().boundingBox();
  assert.ok(Math.abs(cover.height - 132) < 1.5, `telefonda kapak 132 px (${cover.height})`);
  const body = await page.locator(`[data-community-card="${id(1)}"] > div`).nth(1).boundingBox();
  assert.ok(Math.abs(body.height - 112) < 1.5, `gövde 112 px (${body.height})`);
  assert.match(await page.locator(`[data-community-card="${id(2)}"] h3 a`).getAttribute("href"), new RegExp(`/communities/local/?\\?id=${id(2)}`));
  await tabEl(page, "Gönderiler").click();
  await page.waitForURL(/tab=posts/);
});

await scenario("3. sayaç alınamazsa kartlar rozetsiz çizilir (hata kutusu yok)", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await cardsOf(page).first().waitFor();
  assert.equal(await page.locator("[data-shelf-unseen]").count(), 0);
  assert.equal(await page.getByText("Topluluklar yüklenemedi.").count(), 0);
}, { unseen: false });

await scenario("4. davet: sekmede sayaç; tek satırlık dikkat şeridi → 'Gör' Davetler bölümünü açar; Davetler'de şerit yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  const notice = page.getByTestId("home-invite-notice");
  await notice.waitFor();
  assert.match(await tabEl(page, /Davet ve başvurular/).innerText(), /2/);
  assert.match(await notice.textContent(), /2 davetin var.*Anime Çizim/s);
  await notice.getByRole("link", { name: "Gör" }).click();
  await page.waitForURL(/tab=invites/);
  assert.equal(await page.getByTestId("home-invite-notice").count(), 0, "Davetler bölümünde şerit tekrar edilmez");
  await shot(page, "4-invites");
}, { invites: 2 });

await scenario("5. arama 'Tüm topluluklar'a sorguyla gider ve sorgu kutuda hazır gelir", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("searchbox").fill("anime");
  await page.getByRole("searchbox").press("Enter");
  await page.waitForURL(/\/communities\/all\/?\?q=anime/);
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((input) => input.value === "anime"));
});

await scenario("6. ziyaretçi: arama/sekme yok, Keşfet listesi + 'Topluluk oluştur' giriş penceresi", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).waitFor();
  assert.equal(await hasTab(page, /Gönderiler/), false);
  await page.getByRole("button", { name: "Topluluk oluştur" }).click();
  await page.getByRole("dialog").waitFor();
}, { guest: true });

await scenario("7. İngilizce + masaüstü: metinler çevrili, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await tabEl(page, "My communities").waitFor();
  await page.getByText("4 new").first().waitFor();
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
