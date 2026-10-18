// Oluşturma ekranlarının paylaşım alanı: "Nerede paylaşmak istiyorsun?" hedef seçici (ağ taklitli) — docs/history/197-*.
// Gerçek Supabase'e KARŞI DENENMEDİ. Topluluk RPC'leri `mock-communities.mjs`'te.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4193/promptly";
const server = await serve(4193);
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
const selector = (page) => page.locator("[data-share-destination]");
const publish = (page) => page.locator("[data-create-form-actions] [data-action=publish]");
const draft = (page) => page.locator("[data-create-form-actions] [data-action=save-draft]");
const visibility = (page) => page.locator("[data-visibility-switch] [role=switch]");
const openForm = async (page, url = "/requests/new") => { await page.goto(`${BASE}${url}`); await selector(page).waitFor(); await page.waitForTimeout(400); };
const openPicker = async (page) => { await selector(page).click(); await page.getByRole("listbox").waitFor(); await page.waitForTimeout(350); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const fillRequest = async (page) => {
  await page.locator("#request-title").fill("Hedef seçici isteği");
  await page.locator("#request-description").fill("Bu isteğin hedef seçiciyle gönderildiğini sınayan yeterince uzun açıklama");
};

await scenario("1. Varsayılan hedef 'Genel akış': etiket + seçici paylaşım alanında; görünürlük ve 'Taslağa kaydet' var, topluluk bandı yok", async ({ page }) => {
  await openForm(page);
  await page.getByText("Nerede paylaşmak istiyorsun?").first().waitFor();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
  assert.match(await selector(page).textContent(), /Genel akış/);
  await visibility(page).waitFor();
  await draft(page).waitFor();
  assert.equal(await page.locator("[data-community-context]").count(), 0);
});

await scenario("2. Seçici: Genel akış önce, sonra YALNIZ üyesi olunan ve kapatılmamış topluluklar (ad + logo); dış ve kapatılmış yok", async ({ page }) => {
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
  assert.equal(await page.getByRole("option").nth(0).getAttribute("aria-selected"), "true");
});

await scenario("3. Topluluk seçilince ad + logo görünür; içerik topluluğa özgü olur (görünürlük/taslak kalkar, bant çıkar) ve yayın `community_id` ile kaydedilir", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  assert.equal(await selector(page).getAttribute("data-share-destination"), A);
  assert.match(await selector(page).textContent(), /Açık Topluluk/);
  assert.match(await selector(page).textContent(), /Herkese açık topluluk/);
  await page.locator("[data-community-context]").waitFor();
  assert.equal(await visibility(page).count(), 0, "visibility is not a choice for community content");
  assert.equal(await draft(page).count(), 0, "community content can't be a draft");
  assert.equal(await page.locator("#request-title").inputValue(), "Hedef seçici isteği", "typed content survives choosing a destination");
  await publish(page).click();
  await page.waitForURL(/communities\/local\/?\?id=.*shared=1/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.community_id, A);
});

await scenario("4. Topluluktan Genel akış'a dönünce eski davranış geri gelir: görünürlük + taslak var, bant yok, yayın `community_id` göndermez; yazılan içerik korunur", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.locator("[data-community-context]").waitFor();
  await openPicker(page);
  await page.locator("[data-destination-option='feed']").click();
  await page.locator("[data-community-context]").waitFor({ state: "detached" });
  await visibility(page).waitFor();
  await draft(page).waitFor();
  assert.equal(await page.locator("#request-title").inputValue(), "Hedef seçici isteği");
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.ok(!inserted[0].body.community_id);
});

await scenario("4b. Kapalı topluluk seçilince ipucu 'Yalnızca üyeler görür'", async ({ page }) => {
  await openForm(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${B}']`).click();
  assert.match(await selector(page).textContent(), /Kapalı Topluluk/);
  assert.match(await selector(page).textContent(), /Yalnızca üyeler görür/);
});

await scenario("5. Yalnız yönetimin paylaşabildiği topluluk: 'Paylaş' pasif + açıklama; Genel akış'a dönünce yeniden etkin", async ({ page }) => {
  await openForm(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${C}']`).click();
  await page.locator("[data-share-blocked]").waitFor();
  assert.match(await page.locator("[data-share-blocked]").textContent(), /Yalnızca yönetim kadrosu içerik paylaşabilir/);
  assert.equal(await publish(page).isDisabled(), true);
  await openPicker(page);
  await page.locator("[data-destination-option='feed']").click();
  await page.locator("[data-share-blocked]").waitFor({ state: "detached" });
  assert.equal(await publish(page).isDisabled(), false);
});

await scenario("6. Topluluk sayfasından gelen bağlantı (?community=): seçici o topluluğu ad + logoyla gösterir; Genel akış'a çevrilebilir; aynı seçici her tür formunda var", async ({ page }) => {
  await openForm(page, `/requests/new?community=${A}`);
  await page.waitForFunction((id) => document.querySelector("[data-share-destination]")?.getAttribute("data-share-destination") === id, A);
  await page.waitForFunction(() => /Açık Topluluk/.test(document.querySelector("[data-share-destination]")?.textContent ?? ""));
  await openPicker(page);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
  await visibility(page).waitFor();
  for (const url of ["/create?mode=prompt", "/workflows/create", "/presets/create"]) {
    await openForm(page, url);
    assert.equal(await selector(page).getAttribute("data-share-destination"), "feed", url);
  }
});

await scenario("7. Hiç topluluğu olmayan kullanıcı: boş durum + 'Topluluk bul'; Genel akış yine seçilebilir", async ({ page }) => {
  await openForm(page);
  await openPicker(page);
  await page.locator("[data-destination-empty]").waitFor();
  assert.match((await page.locator("[data-destination-empty] a").getAttribute("href")) ?? "", /\/communities\/all/);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await selector(page).getAttribute("data-share-destination"), "feed");
}, { setup: () => {} });

await scenario("8. Mobil (390px): seçici tam genişlik, ≥44px, liste alt sayfa gibi, yatay taşma yok", async ({ page }) => {
  await openForm(page);
  const sel = await selector(page).boundingBox();
  assert.ok(sel.width > 300 && sel.height >= 44, `(${sel.width}x${sel.height})`);
  assert.equal(await overflowFree(page), true);
  await openPicker(page);
  assert.ok((await page.getByRole("listbox").boundingBox()).width <= 390);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 800 } });

await scenario("9. İngilizce: etiket, varsayılan hedef ve ipuçları çevrilmiş", async ({ page }) => {
  await openForm(page);
  await page.getByText("Where do you want to share?").first().waitFor();
  assert.match(await selector(page).textContent(), /Main feed/);
  await selector(page).click();
  await page.getByText("My communities").waitFor();
  await page.locator(`[data-destination-option='${B}']`).click();
  assert.match(await selector(page).textContent(), /Visible to members only/);
}, { lang: "en" });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
