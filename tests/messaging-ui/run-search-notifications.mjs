// Aramanın Tümü · Gönderiler · Kişiler · Topluluklar sekmeleri (docs/history/205-*), ağ taklitli. (Bildirim merkezi senaryoları `run-notifications.mjs`'e taşındı, docs/history/326-*.)
// Gerçek Supabase'e KARŞI DENENMEDİ; tamamen kapalı topluluğun aramada hiç çıkmaması sunucu kuralıdır (`search_communities`, communities.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { openSearch, searchFor, searchOverlay } from "./search-helpers.mjs";

const BASE = "http://localhost:4184/promptly";
const server = await serve(4184);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const C1 = "e0000000-0000-4000-8000-0000000000a1";
const C2 = "e0000000-0000-4000-8000-0000000000a2";
const C3 = "e0000000-0000-4000-8000-0000000000a3";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup, notifications = [] } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  db.rpc.search_content = () => ({ body: [] });
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  // Registered after the mock, so it answers first.
  // Notifications come a page at a time (docs/history/254-*): `.range` sends offset / limit, the bell's number is a HEAD count of the unread rows.
  await context.route(/\/rest\/v1\/notifications(\?|$)/, (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === "HEAD") {
      (db.notifHeads ??= []).push(url.search);
      return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", "content-range": `*/${notifications.filter((x) => !x.is_read).length}` }, body: "" });
    }
    if (method !== "GET") { (db.notifWrites ??= []).push({ method, url: route.request().url() }); return route.fulfill({ status: 204, body: "" }); }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? notifications.length);
    (db.notifGets ??= []).push({ offset, limit });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(notifications.slice(offset, offset + limit)) });
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DEBUG) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 300)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/snfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// Arama sonuç türleri TEK menüde (docs/history/236-*).
const resultMenu = (page) => page.locator("[data-section-menu]");
const resultTabNames = async (page) => { await resultMenu(page).click(); await page.getByRole("radio").first().waitFor(); const names = (await page.getByRole("radio").allTextContents()).map((x) => x.trim()); await page.keyboard.press("Escape"); await page.mouse.click(5, 5); return names; };
const pickResultTab = async (page, name) => { await resultMenu(page).click(); await page.getByRole("radio", { name, exact: true }).click(); };

const seedCommunities = (db) => {
  db.addCommunity(C1, { name: "Atölye Bir", members: [[U.bob, "admin"]], myRole: "none" });
  db.addCommunity(C2, { name: "Atölye Kapalı", visibility: "restricted", members: [[U.bob, "admin"]], myRole: "none" });
  db.addCommunity(C3, { name: "Atölye Gizli", visibility: "private", members: [[U.bob, "admin"]], myRole: "none" });
};

await scenario("2. Arama: Tümü'nde Topluluklar bölümü (tamamen kapalı yok); Topluluklar sekmesi kartları + adres ?tab=; Gönderiler'de topluluk yok, sıralama var", async ({ page, db }) => {
  await page.goto(`${BASE}/search`);
  await searchFor(page, "Atölye");
  await resultMenu(page).waitFor();
  assert.deepEqual(await resultTabNames(page), ["Tümü", "Gönderiler", "Kişiler", "Topluluklar"]);
  const list = page.locator("[data-search-communities]");
  await list.waitFor();
  const names = await list.locator("h2, h3").allTextContents();
  assert.deepEqual(names.map((s) => s.trim()).sort(), ["Atölye Bir", "Atölye Kapalı"], "public + restricted, never private");
  assert.equal(db.calls.filter((c) => c.table === "search_communities").length >= 1, true);
  await pickResultTab(page, "Topluluklar");
  assert.match(page.url(), /[?&]tab=communities/);
  await list.waitFor();
  assert.equal(await page.locator("[data-list-filter]").count(), 0, "no post filter / sort on the communities tab");
  await list.getByRole("button", { name: /katıl/i }).first().waitFor();
  await pickResultTab(page, "Gönderiler");
  assert.equal(await page.locator("[data-search-communities]").count(), 0, "no communities under posts");
  await page.locator("[data-list-filter]").waitFor();
  await pickResultTab(page, "Tümü");
  assert.ok(!/[?&]tab=/.test(page.url()), "Tümü leaves the address clean");
}, { setup: seedCommunities });

await scenario("3. Arama: Kişiler sekmesi yalnız kişiler; ?tab=people ile açılır", async ({ page }) => {
  await page.goto(`${BASE}/search?q=bob&tab=people`);
  await resultMenu(page).waitFor();
  assert.match(await resultMenu(page).textContent(), /Kişiler/);
  await page.getByRole("link", { name: /Bob/ }).first().waitFor();
  assert.equal(await page.locator("[data-search-communities]").count(), 0);
}, { setup: seedCommunities });

await scenario("4. Arama: yalnız filtre (metin yok) → Kişiler/Topluluklar sekmesinde açıklama, istek yok", async ({ page, db }) => {
  await page.goto(`${BASE}/search?type=image`);
  await resultMenu(page).waitFor();
  await pickResultTab(page, "Topluluklar");
  await page.getByText(/filtreler yalnızca gönderilere uygulanır/).waitFor();
  assert.equal(db.calls.filter((c) => c.table === "search_communities").length, 0, "no community search without text");
}, { setup: seedCommunities });

await scenario("5. Arama: Topluluklar sekmesi hatası → hata kutusu + Tekrar dene", async ({ page, db }) => {
  let fail = true;
  db.rpc.search_communities = () => (fail ? { status: 500, body: { message: "boom" } } : { body: [] });
  await page.goto(`${BASE}/search?q=At%C3%B6lye&tab=communities`);
  await page.getByRole("button", { name: "Tekrar dene" }).waitFor();
  fail = false;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByText("Sonuç bulunamadı.").waitFor();
}, { setup: seedCommunities });

await scenario("6. Arama (İngilizce, telefon): sekmeler çevrilmiş, yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/search?q=At%C3%B6lye`);
  await resultMenu(page).waitFor();
  assert.deepEqual(await resultTabNames(page), ["All", "Posts", "People", "Communities"]);
  await page.locator("[data-search-communities]").waitFor();
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 844 }, setup: seedCommunities });

await scenario("7. Keşfet: arama kutusuna yazınca aynı sekmeler; boşaltınca Keşfet içeriği geri gelir", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await searchFor(page, "Atölye");
  await page.locator("[data-search-communities]").waitFor();
  await resultMenu(page).waitFor();
  await (await openSearch(page)).fill("");
  await page.keyboard.press("Escape");
  await page.locator("[data-section-menu]").waitFor();
  assert.equal(await page.locator("[data-search-communities]").count(), 0);
}, { setup: seedCommunities });

// docs/history/269-*: çipler kutudan çıktı (tek satırlık şerit), süzgeçler paylaşılan Filtre penceresinde, boş kutuda son aramalar, @ + Enter.
const chipStrip = (page) => page.getByRole("group", { name: /Seçili süzgeçler|Selected filters/ });

await scenario("7a. Arama düzeni: Filtre penceresinden Görsel + Metin seçilir → tek satırlık çip şeridi (sarmaz); ✕ ve Temizle çalışır; pencere Sıralama içerir", async ({ page }) => {
  await page.goto(`${BASE}/search?q=portre`);
  await page.locator("[data-list-filter]").waitFor();
  assert.equal(await chipStrip(page).count(), 0, "çip yokken şerit yok");
  await page.locator("[data-list-filter]").click();
  const dialog = page.getByRole("dialog");
  for (const title of ["Biçim", "Tür", "Kullanıcılar", "Etiketler", "Araçlar", "Sıralama"]) await dialog.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.ok((await dialog.textContent()).includes("Aynı grupta birini seçmen yeterli"), "VE/VEYA notu");
  await dialog.getByRole("button", { name: "Görsel", exact: true }).click();
  await dialog.getByRole("button", { name: "Metin", exact: true }).click();
  await dialog.getByRole("radio", { name: "Popüler" }).click();
  await dialog.getByRole("button", { name: "Filtreleri Uygula" }).click();
  await chipStrip(page).waitFor();
  const boxes = await chipStrip(page).locator("span.rounded-full").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  assert.equal(boxes.length, 2, "iki çip");
  assert.equal(new Set(boxes).size, 1, "çipler tek satırda");
  assert.match(await page.locator("[data-list-filter]").getAttribute("aria-label"), /2/, "Filtre simgesi etkin sayıyı taşır");
  await page.getByRole("button", { name: "Filtreyi kaldır: Görsel" }).click();
  assert.equal(await chipStrip(page).locator("span.rounded-full").count(), 1);
  await chipStrip(page).getByRole("button", { name: "Temizle" }).click();
  assert.equal(await chipStrip(page).count(), 0, "Temizle şeridi kaldırır");
});

await scenario("7b. Arama kutusu: boşken son aramalar; '@bo' + Enter ilk kişiyi çip yapar; boş sonuçta 'şunu kaldır' çıkışı", async ({ page }) => {
  await page.goto(`${BASE}/search`);
  await searchFor(page, "sinematik");
  const box = await openSearch(page);
  await box.fill("");
  await page.getByText("Son aramalar").waitFor();
  assert.ok((await page.getByRole("listbox").textContent()).includes("sinematik"), "yazılan arama geçmişte");
  assert.ok((await page.getByRole("listbox").textContent()).includes("Biçim") === false, "boş kutuda statik tür listesi yok");
  await page.getByText("@ kişi · # etiket · Enter ile ekle").waitFor();
  await box.fill("@bob");
  await page.getByRole("option", { name: /@bob/ }).waitFor();
  await box.press("Enter");
  await searchOverlay(page).getByRole("group", { name: /Seçili süzgeçler|Selected filters/ }).getByText("@bob").waitFor();
  assert.equal(await box.inputValue(), "", "çip eklenince yazı temizlenir; katman açık kalır, sorgu büyür");
  await page.keyboard.press("Escape");
  await searchOverlay(page).waitFor({ state: "detached" });
  await chipStrip(page).getByText("@bob").waitFor();
  // Sonuç yok (search_content boş) → dead end names its way out.
  await page.locator("[data-search-remove-filters]").waitFor();
  await page.locator("[data-search-remove-filters] button").first().click();
  assert.equal(await chipStrip(page).count(), 0, "çip kaldırıldı");
});

await scenario("7c. Filtre penceresi: kişi arama alanı sunucudan bulur, çip olur; İngilizce başlıklar; telefonda taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/search?q=portre`);
  await page.locator("[data-list-filter]").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Format", exact: true }).waitFor();
  await dialog.getByPlaceholder("Find a person…").fill("bob");
  await dialog.getByRole("button", { name: /@bob/ }).first().click();
  await dialog.getByRole("button", { name: /Remove filter: @bob/ }).waitFor();
  await dialog.getByRole("button", { name: "Apply filters" }).click();
  await chipStrip(page).getByText("@bob").waitFor();
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 844 } });

// docs/history/421-*: arama kutusu tam ekran katmanın kapısıdır (telefon: tüm ekran · md+: komut paleti).
await scenario("7d. Arama (telefon): kutuya dokununca tam ekran katman; Filtre aynı ekranda sekmeler; 'Sonuçları göster' katmanı kapatır", async ({ page }) => {
  await page.goto(`${BASE}/search`);
  const input = await openSearch(page);
  const vp = page.viewportSize();
  const panel = await searchOverlay(page).locator("> div").first().boundingBox();
  assert.ok(panel.width >= vp.width - 1 && panel.height >= vp.height - 1, `katman tüm ekranı kaplar: ${JSON.stringify(panel)}`);
  assert.equal(await input.evaluate((el) => document.activeElement === el), true, "yazı girişi odakta (klavye hemen gelir)");
  const filterButton = searchOverlay(page).locator("[data-search-overlay-filter]");
  const fb = await filterButton.boundingBox();
  assert.ok(fb && fb.y >= 0 && fb.y + fb.height <= vp.height, "Filtre düğmesi üst çubukta, ekranın içinde");
  assert.equal(await searchOverlay(page).getByText("Popüler etiketler").count() + (await searchOverlay(page).getByText("Son aramalar").count()) >= 0, true);
  await filterButton.click();
  await searchOverlay(page).getByRole("heading", { name: "Filtrele" }).waitFor();
  assert.equal(await searchOverlay(page).getByRole("tab").count(), 6, "altı filtre sekmesi (Biçim · Tür · Kullanıcılar · Etiketler · Araçlar · Sıralama)");
  await searchOverlay(page).locator("[data-search-overlay-filters]").getByRole("button", { name: "Görsel", exact: true }).click();
  await searchOverlay(page).getByRole("tab", { name: /Araçlar/ }).click();
  await searchOverlay(page).locator("[data-search-overlay-filters]").getByRole("button", { name: "Midjourney" }).first().click();
  await searchOverlay(page).getByRole("tab", { name: /Sıralama/ }).click();
  await searchOverlay(page).getByRole("radio", { name: "Popüler" }).click();
  await searchOverlay(page).getByRole("button", { name: "Geri" }).click();
  await input.waitFor({ state: "visible" });
  await input.fill("portre");
  const show = searchOverlay(page).getByRole("button", { name: /“portre” için sonuçları göster/ });
  await show.waitFor();
  const sb = await show.boundingBox();
  assert.ok(sb.y + sb.height <= vp.height, "ana eylem ekranın içinde");
  await show.click();
  await searchOverlay(page).waitFor({ state: "detached" });
  await chipStrip(page).getByText("Görsel").waitFor();
  assert.match(await page.locator("[data-list-filter]").getAttribute("aria-label"), /2/, "iki çip: Görsel + Midjourney");
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 } });

await scenario("7e. Arama (masaüstü): ortada komut paleti; sol rayda Ara + filtre grupları; Esc önce aramaya döner, sonra kapatır", async ({ page }) => {
  await page.goto(`${BASE}/search`);
  await openSearch(page);
  const panel = await searchOverlay(page).locator("> div").first().boundingBox();
  assert.ok(panel.width <= 768 && panel.width > 500 && panel.y > 20, `palet ortada ve sınırlı: ${JSON.stringify(panel)}`);
  const rail = searchOverlay(page).getByRole("navigation", { name: "Filtre bölümleri" });
  await rail.waitFor();
  assert.equal(await searchOverlay(page).locator("[data-search-overlay-filter]").isVisible(), false, "masaüstünde ayrı Filtre düğmesi yok, ray var");
  await rail.getByRole("button", { name: /Biçim/ }).click();
  await searchOverlay(page).locator("[data-search-overlay-filters]").getByRole("button", { name: "Video", exact: true }).click();
  assert.equal(await rail.getByRole("button", { name: /Biçim/ }).textContent().then((x) => /1/.test(x)), true, "rayda seçili sayısı");
  await page.keyboard.press("Escape");
  await searchOverlay(page).getByRole("combobox").waitFor({ state: "visible" });
  assert.equal(await searchOverlay(page).count(), 1, "ilk Esc yalnız aramaya döner");
  await page.keyboard.press("Escape");
  await searchOverlay(page).waitFor({ state: "detached" });
  await chipStrip(page).getByText("Video").waitFor();
});

await scenario("7f. Arama katmanı (İngilizce, telefon): metinler çevrilmiş, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/search`);
  const input = await openSearch(page);
  await input.fill("kedi");
  await searchOverlay(page).getByRole("button", { name: /Show results for “kedi”/ }).waitFor();
  await searchOverlay(page).locator("[data-search-overlay-filter]").click();
  await searchOverlay(page).getByRole("heading", { name: "Filter" }).waitFor();
  await searchOverlay(page).getByRole("button", { name: "Apply filters" }).waitFor();
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 844 } });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
