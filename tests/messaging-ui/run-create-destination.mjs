// Oluşturma ekranlarının yayın adımı: "Kim görsün?" (Herkese açık / Sadece ben / Sadece bir topluluk) + "Topluluklarda da duyur" +
// "ne olacak" cümlesi (ağ taklitli) — docs/history/197-*, 215-*.
// Gerçek Supabase'e KARŞI DENENMEDİ. Topluluk RPC'leri `mock-communities.mjs`'te.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = `http://localhost:${process.env.PORT ?? 4193}/promptly`;
const server = await serve(Number(process.env.PORT ?? 4193));
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
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/scfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const field = (page) => page.locator("[data-audience-field]");
const option = (page, key) => page.locator(`[data-audience-option='${key}']`);
const summary = (page) => page.locator("[data-publish-summary]");
const publish = (page) => page.locator("[data-create-form-actions] [data-action=publish]");
const draft = (page) => page.locator("[data-create-form-actions] [data-action=save-draft]");
const openForm = async (page, url = "/requests/new") => { await page.goto(`${BASE}${url}`); await field(page).waitFor(); await page.waitForTimeout(400); };
const openPicker = async (page) => { await option(page, "community").click(); await page.getByRole("listbox").waitFor(); await page.waitForTimeout(350); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const fillRequest = async (page) => {
  await page.locator("#request-title").fill("Hedef seçici isteği");
  await page.locator("#request-description").fill("Bu isteğin hedef seçiciyle gönderildiğini sınayan yeterince uzun açıklama");
};

await scenario("1. Varsayılan: 'Kim görsün?' üç seçenek, Herkese açık seçili; cümle akışı anlatır; taslak + 'Topluluklarda da duyur' var", async ({ page }) => {
  await openForm(page);
  await page.getByText("Kim görsün?").first().waitFor();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
  assert.equal(await page.locator("[data-audience-option]").count(), 3);
  assert.equal(await option(page, "public").getAttribute("aria-checked"), "true");
  assert.match(await summary(page).innerText(), /Herkes görebilecek: Ana Sayfa'da, Keşfet'te ve profilinde/);
  await draft(page).waitFor();
  await page.locator("[data-publish-announce-toggle]").waitFor();
  assert.equal(await page.locator("[data-visibility-switch]").count(), 0, "the old switch is gone: one place decides who sees it");
});

await scenario("2. 'Sadece ben': cümle değişir, duyuru satırı kalkar, yayın private gönderir; Herkese açık'a dönünce public", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await option(page, "private").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "private");
  assert.match(await summary(page).innerText(), /Yalnızca sen göreceksin/);
  assert.equal(await page.locator("[data-publish-announce-toggle]").count(), 0);
  await draft(page).waitFor();
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.visibility, "private");
  assert.ok(!inserted[0].body.community_id);
});

await scenario("3. Topluluk seçici: Genel akış önce, sonra YALNIZ üyesi olunan ve kapatılmamış topluluklar; dış ve kapatılmış yok", async ({ page }) => {
  await openForm(page);
  await openPicker(page);
  await page.waitForFunction(() => document.querySelectorAll("[data-destination-option]").length >= 4);
  const names = await page.getByRole("option").allTextContents();
  assert.match(names[0], /Genel akış/);
  const joined = names.join("|");
  assert.match(joined, /Açık Topluluk/);
  assert.match(joined, /Kapalı Topluluk/);
  assert.match(joined, /Yönetim Alanı/);
  assert.doesNotMatch(joined, /Dış Topluluk/);
  assert.doesNotMatch(joined, /Kapatılmış Topluluk/);
});

await scenario("4. Topluluk seçilince seçenek adını gösterir; içerik topluluğa özgü (taslak + duyuru yok, cümle söyler) ve `community_id` ile kaydedilir", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  assert.equal(await field(page).getAttribute("data-audience-field"), "community");
  assert.match(await option(page, "community").textContent(), /Açık Topluluk/);
  assert.match(await summary(page).innerText(), /Açık Topluluk topluluğuna ait olacak/);
  assert.equal(await draft(page).count(), 0, "community content can't be a draft");
  assert.equal(await page.locator("[data-publish-announce-toggle]").count(), 0);
  assert.equal(await page.locator("#request-title").inputValue(), "Hedef seçici isteği", "typed content survives choosing a destination");
  await publish(page).click();
  await page.waitForURL(/communities\/local\/?\?id=.*shared=1/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.community_id, A);
});

await scenario("5. Topluluktan Herkese açık'a dönünce eski davranış: taslak + duyuru var, yayın `community_id` göndermez; yazılan içerik korunur", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.waitForFunction(() => document.querySelector("[data-audience-field]")?.getAttribute("data-audience-field") === "community");
  await option(page, "public").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
  await draft(page).waitFor();
  await page.locator("[data-publish-announce-toggle]").waitFor();
  assert.equal(await page.locator("#request-title").inputValue(), "Hedef seçici isteği");
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.ok(!inserted[0].body.community_id);
  assert.equal(inserted[0].body.visibility, "public");
});

await scenario("6. Yalnız yönetimin paylaşabildiği topluluk: 'Paylaş' pasif + açıklama; Herkese açık'a dönünce yeniden etkin", async ({ page }) => {
  await openForm(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${C}']`).click();
  await page.locator("[data-share-blocked]").waitFor();
  assert.match(await page.locator("[data-share-blocked]").textContent(), /Yalnızca yönetim kadrosu içerik paylaşabilir/);
  assert.equal(await publish(page).isDisabled(), true);
  await option(page, "public").click();
  await page.locator("[data-share-blocked]").waitFor({ state: "detached" });
  assert.equal(await publish(page).isDisabled(), false);
});

await scenario("7. Topluluk sayfasından gelen bağlantı (?community=): topluluk seçili gelir; Herkese açık'a çevrilebilir; aynı alan her tür formunda var", async ({ page }) => {
  await openForm(page, `/requests/new?community=${A}`);
  await page.waitForFunction(() => document.querySelector("[data-audience-field]")?.getAttribute("data-audience-field") === "community");
  await page.waitForFunction(() => /Açık Topluluk/.test(document.querySelector("[data-audience-option='community']")?.textContent ?? ""));
  await option(page, "public").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
  for (const url of ["/create?mode=prompt", "/workflows/create", "/presets/create"]) {
    await openForm(page, url);
    assert.equal(await field(page).getAttribute("data-audience-field"), "public", url);
    assert.equal(await page.locator("[data-audience-option]").count(), 3, url);
  }
});

await scenario("8. Topluluklarda da duyur: iki topluluk + not seçilir, cümle sayıyı söyler; yayından SONRA her biri için share_to_community; kısmi hata dürüstçe raporlanır", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await page.locator("[data-publish-announce-toggle]").click();
  await page.locator("[data-announce-picker]").waitFor();
  // Kapatılmış topluluk seçilemez.
  assert.equal(await page.locator(`[data-announce-community='${D}'] input`).isDisabled(), true);
  await page.locator(`[data-announce-community='${A}']`).click();
  await page.locator(`[data-announce-community='${C}']`).click();
  await page.locator("[data-announce-note]").fill("Yeni isteğim");
  assert.match(await summary(page).innerText(), /2 toplulukta duyurulacak/);
  if (process.env.SHOTS) { await field(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOTS}/cd-publish-step.png`, fullPage: true }); }
  assert.equal(calls(db, "share_to_community").length, 0, "nothing is announced before the content exists");
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const shared = calls(db, "share_to_community");
  assert.equal(shared.length, 2);
  const inserted = calls(db, "prompt_requests", "POST")[0].body;
  assert.ok(shared.every((c) => c.body.p_content_type === "request" && c.body.p_content_id === inserted.id && c.body.p_note === "Yeni isteğim"));
  assert.deepEqual(shared.map((c) => c.body.p_group_id).sort(), [A, C].sort());
  const report = page.locator("[data-announce-report]");
  await report.waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cd-report.png` });
  assert.match(await report.innerText(), /Duyuruldu: Açık Topluluk/);
  assert.match(await report.innerText(), /Şu topluluklarda duyurulamadı/);
  assert.match(await report.innerText(), /Yönetim Alanı/);
  assert.equal(db.posts.filter((p) => p.kind === "application").length, 1);
  await report.getByRole("button", { name: "Kapat" }).click();
  await report.waitFor({ state: "detached" });
});

await scenario("9. Hiç topluluğu olmayan kullanıcı: seçicide boş durum + 'Topluluk bul'; duyuru satırı da boş durumu söyler", async ({ page }) => {
  await openForm(page);
  await page.locator("[data-publish-announce-toggle]").click();
  await page.getByText("Henüz bir topluluğa üye değilsin.").waitFor();
  await openPicker(page);
  await page.locator("[data-destination-empty]").waitFor();
  assert.match((await page.locator("[data-destination-empty] a").getAttribute("href")) ?? "", /\/communities\/all/);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
}, { setup: () => {} });

await scenario("10. Mobil (390px): seçenekler tam genişlik, ≥44px, yatay taşma yok", async ({ page }) => {
  await openForm(page);
  for (const key of ["public", "private", "community"]) {
    const box = await option(page, key).boundingBox();
    assert.ok(box.width > 300 && box.height >= 44, `${key} (${box.width}x${box.height})`);
  }
  await page.locator("[data-publish-announce-toggle]").click();
  await page.locator("[data-announce-picker]").waitFor();
  assert.equal(await overflowFree(page), true);
  await openPicker(page);
  assert.ok((await page.getByRole("listbox").boundingBox()).width <= 390);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 800 } });

await scenario("11. İngilizce: başlık, seçenekler, cümle ve duyuru satırı çevrilmiş", async ({ page }) => {
  await openForm(page);
  await page.getByText("Who can see it?").first().waitFor();
  assert.match(await option(page, "public").textContent(), /Public/);
  assert.match(await option(page, "private").textContent(), /Only me/);
  assert.match(await option(page, "community").textContent(), /Only a community/);
  assert.match(await summary(page).innerText(), /Everyone can see it/);
  await page.getByText("Also announce in communities").waitFor();
  await openPicker(page);
  await page.getByText("My communities").waitFor();
  await page.locator(`[data-destination-option='${B}']`).click();
  assert.match(await summary(page).innerText(), /It will belong to Kapalı Topluluk/);
}, { lang: "en" });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
