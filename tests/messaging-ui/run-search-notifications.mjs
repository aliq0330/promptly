// Bildirimler → "Topluluklar" sekmesi ve aramanın Tümü · Gönderiler · Kişiler · Topluluklar sekmeleri (docs/history/205-*), ağ taklitli.
// Gerçek Supabase'e KARŞI DENENMEDİ; tamamen kapalı topluluğun aramada hiç çıkmaması sunucu kuralıdır (`search_communities`, communities.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

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
  await context.route(/\/rest\/v1\/notifications(\?|$)/, (route) => {
    if (route.request().method() !== "GET") { (db.notifWrites ??= []).push({ method: route.request().method(), url: route.request().url() }); return route.fulfill({ status: 204, body: "" }); }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(notifications) });
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/snfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const n = (id, type, message, href, minutes = 1) => ({ id, type, message, target_href: href, is_read: false, created_at: new Date(Date.now() - minutes * 60000).toISOString(), actor: null });
const NOTIFS = [
  n("n1", "system", "Topluluğa davet edildin.", `/communities/local?id=${C1}&tab=feed`),
  n("n2", "like", "Topluluk gönderini beğendi.", `/communities/local?id=${C1}&tab=feed&post=p1&hl=post:p1`, 2),
  n("n3", "system", "Topluluğa katılma isteği var.", `/messages/local?id=${C1}&panel=requests`, 3),
  n("n4", "system", "Eski grup daveti.", "/groups?tab=invites", 4),
  n("n5", "like", "Promptunu beğendi.", "/prompts/local?id=x1&hl=post:x1", 5),
  n("n6", "message", "Sana bir mesaj gönderdi.", "/messages/local?id=dm1&hl=message:m1", 6),
  n("n7", "system", "Site bakımı yapılacak.", "/settings", 7),
];
const rowTexts = (page) => page.locator("main li, main [data-notification-id]").allTextContents();
async function pick(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(150);
  return (await page.locator("main").textContent()) ?? "";
}

await scenario("1. Bildirimler: 'Topluluklar' sekmesi topluluk sayfası/sohbeti/gönderisi bildirimlerini toplar; Sistem ve Gönderiler'den çıkarlar", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.getByText("Site bakımı yapılacak.").waitFor();
  const chips = await page.locator("main button").allTextContents();
  const order = ["Tümü", "Gönderiler", "İstekler", "Takip", "Mesajlar", "Topluluklar", "Sistem"].map((label) => chips.findIndex((c) => c.trim() === label));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `chip order: ${chips.join(" | ")}`);
  let text = await pick(page, "Topluluklar");
  for (const m of ["Topluluğa davet edildin.", "Topluluk gönderini beğendi.", "Topluluğa katılma isteği var.", "Eski grup daveti."]) assert.ok(text.includes(m), `community tab has: ${m}`);
  for (const m of ["Promptunu beğendi.", "Sana bir mesaj gönderdi.", "Site bakımı yapılacak."]) assert.ok(!text.includes(m), `community tab lacks: ${m}`);
  text = await pick(page, "Sistem");
  assert.ok(text.includes("Site bakımı yapılacak.") && !text.includes("Topluluğa davet edildin.") && !text.includes("katılma isteği"), "system keeps only non-community notices");
  text = await pick(page, "Gönderiler");
  assert.ok(text.includes("Promptunu beğendi.") && !text.includes("Topluluk gönderini beğendi."), "posts lose the community post like");
  text = await pick(page, "Mesajlar");
  assert.ok(text.includes("Sana bir mesaj gönderdi.") && !text.includes("katılma isteği"), "direct messages stay in Messages");
  text = await pick(page, "Tümü");
  assert.ok(NOTIFS.every((x) => text.includes(x.message)), "Tümü still has everything");
}, { notifications: NOTIFS });

await scenario("1b. Bildirimler (İngilizce): sekme 'Communities'", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.getByRole("button", { name: "Communities", exact: true }).click();
  await page.getByText("Topluluğa davet edildin.").waitFor();
}, { lang: "en", notifications: NOTIFS });

const seedCommunities = (db) => {
  db.addCommunity(C1, { name: "Atölye Bir", members: [[U.bob, "admin"]], myRole: "none" });
  db.addCommunity(C2, { name: "Atölye Kapalı", visibility: "restricted", members: [[U.bob, "admin"]], myRole: "none" });
  db.addCommunity(C3, { name: "Atölye Gizli", visibility: "private", members: [[U.bob, "admin"]], myRole: "none" });
};
const searchBox = (page) => page.getByRole("combobox").first();

await scenario("2. Arama: Tümü'nde Topluluklar bölümü (tamamen kapalı yok); Topluluklar sekmesi kartları + adres ?tab=; Gönderiler'de topluluk yok, sıralama var", async ({ page, db }) => {
  await page.goto(`${BASE}/search`);
  await searchBox(page).fill("Atölye");
  const tabs = page.getByRole("tablist", { name: "Arama sonuçları" });
  await tabs.waitFor();
  assert.deepEqual((await tabs.getByRole("tab").allTextContents()).map((s) => s.trim()), ["Tümü", "Gönderiler", "Kişiler", "Topluluklar"]);
  const list = page.locator("[data-search-communities]");
  await list.waitFor();
  const names = await list.locator("h2").allTextContents();
  assert.deepEqual(names.map((s) => s.trim()).sort(), ["Atölye Bir", "Atölye Kapalı"], "public + restricted, never private");
  assert.equal(db.calls.filter((c) => c.table === "search_communities").length >= 1, true);
  await tabs.getByRole("tab", { name: "Topluluklar" }).click();
  assert.match(page.url(), /[?&]tab=communities/);
  await list.waitFor();
  assert.equal(await page.getByRole("button", { name: "İlgili" }).count(), 0, "no post sort on the communities tab");
  await list.getByRole("button", { name: /katıl/i }).first().waitFor();
  await tabs.getByRole("tab", { name: "Gönderiler" }).click();
  assert.equal(await page.locator("[data-search-communities]").count(), 0, "no communities under posts");
  await page.getByRole("button", { name: "İlgili" }).waitFor();
  await tabs.getByRole("tab", { name: "Tümü" }).click();
  assert.ok(!/[?&]tab=/.test(page.url()), "Tümü leaves the address clean");
}, { setup: seedCommunities });

await scenario("3. Arama: Kişiler sekmesi yalnız kişiler; ?tab=people ile açılır", async ({ page }) => {
  await page.goto(`${BASE}/search?q=bob&tab=people`);
  const tabs = page.getByRole("tablist", { name: "Arama sonuçları" });
  await tabs.waitFor();
  assert.equal(await tabs.getByRole("tab", { name: "Kişiler" }).getAttribute("aria-selected"), "true");
  await page.getByRole("link", { name: /Bob/ }).first().waitFor();
  assert.equal(await page.locator("[data-search-communities]").count(), 0);
}, { setup: seedCommunities });

await scenario("4. Arama: yalnız filtre (metin yok) → Kişiler/Topluluklar sekmesinde açıklama, istek yok", async ({ page, db }) => {
  await page.goto(`${BASE}/search?type=image`);
  const tabs = page.getByRole("tablist", { name: "Arama sonuçları" });
  await tabs.waitFor();
  await tabs.getByRole("tab", { name: "Topluluklar" }).click();
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
  const tabs = page.getByRole("tablist", { name: "Search results" });
  await tabs.waitFor();
  assert.deepEqual((await tabs.getByRole("tab").allTextContents()).map((s) => s.trim()), ["All", "Posts", "People", "Communities"]);
  await page.locator("[data-search-communities]").waitFor();
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 844 }, setup: seedCommunities });

await scenario("7. Keşfet: arama kutusuna yazınca aynı sekmeler; boşaltınca Keşfet içeriği geri gelir", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await searchBox(page).fill("Atölye");
  await page.getByRole("tablist", { name: "Arama sonuçları" }).waitFor();
  await page.locator("[data-search-communities]").waitFor();
  await searchBox(page).fill("");
  await page.getByRole("tablist", { name: "Keşfet bölümleri" }).waitFor();
  assert.equal(await page.getByRole("tablist", { name: "Arama sonuçları" }).count(), 0);
}, { setup: seedCommunities });

await scenario("7. Bildirimler: ✕ düğmesi onay penceresi açar; Vazgeç'te hiçbir şey silinmez, Tümünü sil'de DELETE gider ve liste boşalır", async ({ page, db }) => {
  await page.goto(`${BASE}/notifications`);
  const clear = page.getByRole("button", { name: "Tüm bildirimleri sil" });
  await clear.waitFor();
  await clear.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Tüm bildirimler silinsin mi?").waitFor();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(await dialog.count(), 0, "dialog closed");
  assert.equal((db.notifWrites ?? []).length, 0, "nothing deleted on cancel");
  await clear.click();
  await page.getByRole("dialog").getByRole("button", { name: "Tümünü sil" }).click();
  await page.getByText(/henüz bildirim|bildirim yok/i).first().waitFor();
  const del = (db.notifWrites ?? []).filter((w) => w.method === "DELETE");
  assert.equal(del.length, 1, "one bulk DELETE");
  assert.match(del[0].url, /recipient_id=eq\./, "scoped to the user's own rows");
  assert.ok(!del[0].url.includes("id=eq.n"), "not row by row");
  assert.equal(await clear.isDisabled(), true, "button disabled when empty");
}, { notifications: NOTIFS });

await scenario("8. Bildirimler: tümünü silme penceresi İngilizce", async ({ page }) => {
  await page.goto(`${BASE}/notifications`);
  await page.getByRole("button", { name: "Delete all notifications" }).click();
  await page.getByRole("dialog").getByText("Delete all notifications?").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Delete all" }).waitFor();
}, { lang: "en", notifications: NOTIFS });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
