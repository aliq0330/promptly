// Oluştur menüsü + yazma ekranı + son kontrol penceresi (docs/history/216-*; önce 197-*, 215-*): "+" menüsü, yazma ekranında
// uygulama menülerinin kalkması, "Paylaş" → son kontrol ("Kim görsün?" Herkese açık / Sadece ben / Bir topluluk, "Topluluklarda da
// duyur", "ne olacak" cümlesi, eksikler), ✕ → "Taslak olarak kaydedilsin mi?". Ağ taklitli.
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
const sheet = (page) => page.locator("[data-publish-sheet]");
const field = (page) => page.locator("[data-audience-field]");
const option = (page, key) => page.locator(`[data-audience-option='${key}']`);
const summary = (page) => page.locator("[data-publish-summary]");
const publish = (page) => page.locator("[data-publish-sheet] [data-action=publish]");
const draft = (page) => page.locator("[data-publish-sheet] [data-action=save-draft]");
const openForm = async (page, url = "/requests/new") => { await page.goto(`${BASE}${url}`); await page.locator("[data-compose]").waitFor(); await page.waitForTimeout(400); };
const openSheet = async (page) => { await page.locator("[data-compose-publish]").click(); await sheet(page).waitFor(); await page.waitForTimeout(250); };
const openPicker = async (page) => { await option(page, "community").click(); await page.getByRole("listbox").waitFor(); await page.waitForTimeout(350); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const fillRequest = async (page) => {
  await page.locator("#request-title").fill("Hedef seçici isteği");
  await page.locator("#request-description").fill("Bu isteğin hedef seçiciyle gönderildiğini sınayan yeterince uzun açıklama");
};

await scenario("1. Yazma ekranı: uygulama menüleri kalkar, üstte ✕ · başlık · Paylaş; Paylaş son kontrolü açar: üç seçenek, Herkese açık seçili, cümle, Taslak ve duyuru", async ({ page }) => {
  await openForm(page);
  assert.equal(await page.locator("[data-app-chrome]:visible").count(), 0, "header, sidebar and bottom nav are gone while composing");
  await page.locator("[data-compose-close]").waitFor();
  await page.getByRole("heading", { level: 1, name: "Yeni istek" }).waitFor();
  await openSheet(page);
  await page.getByText("Kim görsün?").first().waitFor();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
  assert.equal(await page.locator("[data-audience-option]").count(), 3);
  assert.equal(await option(page, "public").getAttribute("aria-checked"), "true");
  assert.match(await summary(page).innerText(), /Herkes görebilecek: Ana Sayfa'da, Keşfet'te ve profilinde/);
  await draft(page).waitFor();
  await page.locator("[data-announce-picker]").waitFor();
  assert.equal(await page.locator("[data-visibility-switch]").count(), 0, "one place decides who sees it");
});

await scenario("2. Eksikler: başlık/açıklama yokken son kontrol onları listeler ve Paylaş pasif; eksiğe dokununca pencere kapanır, alana odaklanır", async ({ page }) => {
  await openForm(page);
  await openSheet(page);
  await page.locator("[data-publish-problem=title]").waitFor();
  await page.locator("[data-publish-problem=description]").waitFor();
  assert.equal(await publish(page).isDisabled(), true);
  await page.locator("[data-publish-problem=title]").click();
  await sheet(page).waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.id === "request-title");
  await fillRequest(page);
  await openSheet(page);
  assert.equal(await page.locator("[data-publish-problem]").count(), 0);
  assert.equal(await publish(page).isDisabled(), false);
});

await scenario("3. 'Sadece ben': cümle değişir, duyuru kalkar, yayın private gönderir", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openSheet(page);
  await option(page, "private").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "private");
  assert.match(await summary(page).innerText(), /Yalnızca sen göreceksin/);
  assert.equal(await page.locator("[data-announce-picker]").count(), 0);
  await draft(page).waitFor();
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.visibility, "private");
  assert.ok(!inserted[0].body.community_id);
});

await scenario("4. Topluluk seçici: Genel akış önce, sonra YALNIZ üyesi olunan ve kapatılmamış topluluklar; dış ve kapatılmış yok", async ({ page }) => {
  await openForm(page);
  await openSheet(page);
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

await scenario("5. Topluluk seçilince ad görünür; içerik topluluğa özgü (Taslak + duyuru yok, cümle söyler) ve `community_id` ile kaydedilir", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openSheet(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.getByRole("listbox").waitFor({ state: "detached" });
  assert.equal(await field(page).getAttribute("data-audience-field"), "community");
  assert.match(await page.locator("[data-audience-community]").textContent(), /Açık Topluluk/);
  assert.match(await summary(page).innerText(), /Açık Topluluk topluluğuna ait olacak/);
  assert.equal(await draft(page).count(), 0, "community content can't be a draft");
  assert.equal(await page.locator("[data-announce-picker]").count(), 0);
  await publish(page).click();
  await page.waitForURL(/communities\/local\/?\?id=.*shared=1/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.community_id, A);
});

await scenario("6. Topluluktan Herkese açık'a dönünce: Taslak + duyuru geri gelir, yayın `community_id` göndermez; pencere kapanıp açılınca seçim ve yazılan içerik korunur", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openSheet(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${A}']`).click();
  await page.waitForFunction(() => document.querySelector("[data-audience-field]")?.getAttribute("data-audience-field") === "community");
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  await page.locator("[data-compose-audience]").getByText("Açık Topluluk").waitFor();
  await openSheet(page);
  assert.equal(await field(page).getAttribute("data-audience-field"), "community", "the choice survives closing the sheet");
  await option(page, "public").click();
  await draft(page).waitFor();
  await page.locator("[data-announce-picker]").waitFor();
  assert.equal(await page.locator("#request-title").inputValue(), "Hedef seçici isteği");
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.ok(!inserted[0].body.community_id);
  assert.equal(inserted[0].body.visibility, "public");
});

await scenario("7. Yalnız yönetimin paylaşabildiği topluluk: Paylaş pasif + açıklama; Herkese açık'a dönünce yeniden etkin", async ({ page }) => {
  await openForm(page);
  await fillRequest(page);
  await openSheet(page);
  await openPicker(page);
  await page.locator(`[data-destination-option='${C}']`).click();
  await page.locator("[data-share-blocked]").waitFor();
  assert.match(await page.locator("[data-share-blocked]").textContent(), /Yalnızca yönetim kadrosu içerik paylaşabilir/);
  assert.equal(await publish(page).isDisabled(), true);
  await option(page, "public").click();
  await page.locator("[data-share-blocked]").waitFor({ state: "detached" });
  assert.equal(await publish(page).isDisabled(), false);
});

await scenario("8. Topluluk sayfasından gelen bağlantı (?community=): topluluk seçili gelir, Herkese açık'a çevrilebilir; aynı kabuk ve son kontrol Prompt, Workflow ve Hazır ayar'da", async ({ page }) => {
  await openForm(page, `/requests/new?community=${A}`);
  await page.locator("[data-compose-audience]").getByText("Açık Topluluk").waitFor();
  await openSheet(page);
  assert.equal(await field(page).getAttribute("data-audience-field"), "community");
  await option(page, "public").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
  for (const url of ["/create?mode=prompt", "/workflows/create", "/presets/create"]) {
    await openForm(page, url);
    assert.equal(await page.locator("[data-app-chrome]:visible").count(), 0, url);
    await openSheet(page);
    assert.equal(await field(page).getAttribute("data-audience-field"), "public", url);
    assert.equal(await page.locator("[data-audience-option]").count(), 3, url);
  }
});

await scenario("9. Topluluklarda da duyur: iki topluluk + not, cümle sayıyı söyler; yayından SONRA her biri için share_to_community; kısmi hata dürüstçe raporlanır", async ({ page, db }) => {
  await openForm(page);
  await fillRequest(page);
  await openSheet(page);
  await page.locator(`[data-announce-community='${A}']`).waitFor();
  assert.equal(await page.locator(`[data-announce-community='${D}']`).isDisabled(), true, "a closed community can't be picked");
  await page.locator(`[data-announce-community='${A}']`).click();
  await page.locator(`[data-announce-community='${C}']`).click();
  await page.locator("[data-announce-note]").fill("Yeni isteğim");
  assert.match(await summary(page).innerText(), /2 toplulukta duyurulacak/);
  assert.equal(calls(db, "share_to_community").length, 0, "nothing is announced before the content exists");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cd-publish-sheet.png` });
  await publish(page).click();
  await page.waitForURL(/requests\/local/);
  const shared = calls(db, "share_to_community");
  assert.equal(shared.length, 2);
  const inserted = calls(db, "prompt_requests", "POST")[0].body;
  assert.ok(shared.every((c) => c.body.p_content_type === "request" && c.body.p_content_id === inserted.id && c.body.p_note === "Yeni isteğim"));
  assert.deepEqual(shared.map((c) => c.body.p_group_id).sort(), [A, C].sort());
  const report = page.locator("[data-announce-report]");
  await report.waitFor();
  assert.match(await report.innerText(), /Duyuruldu: Açık Topluluk/);
  assert.match(await report.innerText(), /Şu topluluklarda duyurulamadı/);
  assert.match(await report.innerText(), /Yönetim Alanı/);
  assert.equal(db.posts.filter((p) => p.kind === "application").length, 1);
  await report.getByRole("button", { name: "Kapat" }).click();
  await report.waitFor({ state: "detached" });
});

await scenario("10. ✕: değişiklik yoksa doğrudan çıkılır; yazılmışsa 'Taslak olarak kaydedilsin mi?' — Taslağa kaydet taslağı yazıp çıkar, Yazmaya devam et kalır", async ({ page, db }) => {
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(300);
  await openForm(page);
  await page.locator("[data-compose-close]").click();
  await page.waitForURL(/\/discover/);
  await openForm(page);
  await page.locator("#request-title").fill("Yarım kalan istek");
  await page.locator("[data-compose-close]").click();
  await page.locator("[data-compose-leave]").waitFor();
  await page.locator("[data-leave-continue]").click();
  await page.locator("[data-compose-leave]").waitFor({ state: "detached" });
  assert.equal(await page.locator("#request-title").inputValue(), "Yarım kalan istek");
  await page.locator("[data-compose-close]").click();
  await page.locator("[data-leave-save]").click();
  await page.waitForURL((url) => !url.pathname.includes("/requests/new"));
  const drafts = calls(db, "prompt_requests", "POST");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].body.is_draft, true);
  assert.equal(drafts[0].body.title, "Yarım kalan istek");
});

await scenario("11. '+' menüsü: alt menünün '+'sı alttan menü açar (Prompt, İstek, Hikâye, Workflow, Hazır ayar, Space, Var olan içeriği paylaş); Prompt yazma ekranına götürür", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("[data-nav-create]:visible").first().click();
  await page.locator("[data-create-menu]").waitFor();
  for (const key of ["prompt", "request", "story", "workflow", "preset", "space"]) await page.locator(`[data-create-option=${key}]`).waitFor();
  await page.locator("[data-create-share-existing]").waitFor();
  assert.equal(await overflowFree(page), true);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cd-menu.png` });
  await page.locator("[data-create-option=prompt]").click();
  await page.waitForURL(/\/create\/?\?mode=prompt/);
  await page.locator("#prompt-title").waitFor();
}, { viewport: { width: 390, height: 844 } });

await scenario("12. Hiç topluluğu olmayan kullanıcı: seçicide boş durum + 'Topluluk bul'; duyuru satırı boş durumu söyler", async ({ page }) => {
  await openForm(page);
  await openSheet(page);
  await page.getByText("Henüz bir topluluğa üye değilsin.").waitFor();
  await openPicker(page);
  await page.locator("[data-destination-empty]").waitFor();
  assert.match((await page.locator("[data-destination-empty] a").getAttribute("href")) ?? "", /\/communities\/all/);
  await page.locator("[data-destination-option='feed']").click();
  assert.equal(await field(page).getAttribute("data-audience-field"), "public");
}, { setup: () => {} });

await scenario("13. Mobil (390px): araç çubuğu altta ve görünür, seçenekler ≥44px, yatay taşma yok", async ({ page }) => {
  await openForm(page);
  const bar = await page.locator("[data-compose-toolbar]").boundingBox();
  assert.ok(bar && bar.y + bar.height >= 844 - 2, `toolbar docks to the bottom (${JSON.stringify(bar)})`);
  await fillRequest(page);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cd-compose.png` });
  await openSheet(page);
  for (const key of ["public", "private", "community"]) {
    const box = await option(page, key).boundingBox();
    assert.ok(box.height >= 44, `${key} (${box.width}x${box.height})`);
  }
  assert.equal(await overflowFree(page), true);
  await openPicker(page);
  assert.ok((await page.getByRole("listbox").boundingBox()).width <= 390);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await scenario("14. İngilizce: yazma ekranı, son kontrol ve ✕ penceresi çevrilmiş", async ({ page }) => {
  await openForm(page);
  await page.getByRole("heading", { level: 1, name: "New request" }).waitFor();
  await openSheet(page);
  await page.getByText("Before you share").waitFor();
  await page.getByText("Who can see it?").first().waitFor();
  assert.match(await option(page, "public").textContent(), /Public/);
  assert.match(await option(page, "private").textContent(), /Only me/);
  assert.match(await option(page, "community").textContent(), /A community/);
  assert.match(await summary(page).innerText(), /Everyone can see it/);
  await page.getByText("Also announce in communities").waitFor();
  await page.locator("[data-publish-problem=title]").getByText(/title/i).waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#request-title").fill("Draft");
  await page.locator("[data-compose-close]").click();
  await page.getByText("Save as a draft?").waitFor();
}, { lang: "en" });

await scenario("15. Prompt yazma ekranı örnekteki gibi: solda avatar, kutusuz mono metin (Şablon/Değişken satırı yok), görsel şeridi; araç çubuğu Görsel · Etiket · Araç · Kategori · Değişken · Gelişmiş; Değişken ekleme yüzeyini, Gelişmiş hazır ayar + görselden yardım satırlarını açar", async ({ page }) => {
  await openForm(page, "/create?mode=prompt");
  await page.locator("[data-compose-body]").waitFor();
  assert.equal(await page.locator("[data-insert-trigger]:visible").count(), 0, "no 'Değişken ekle' bar inside the text");
  assert.equal(await page.locator("[data-image-help]:visible").count(), 0, "vision help is not inline");
  await page.locator("[data-image-picker=strip]").waitFor();
  const tools = await page.locator("[data-compose-tool]").evaluateAll((els) => els.map((el) => el.getAttribute("data-compose-tool")));
  assert.deepEqual(tools, ["image", "tags", "tool", "category", "variable", "advanced"]);
  await page.locator("#prompt-text").fill("cinematic portrait of a fox");
  await page.locator("[data-compose-tool=variable]").click();
  await page.locator("#insert-picker-title").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-compose-tool=advanced]").click();
  await page.locator("[data-compose-sheet=advanced] [data-advanced-row=extra]").waitFor();
  await page.locator("[data-compose-sheet=advanced] [data-advanced-row=vision]").click();
  await page.locator("[data-compose-sheet=vision] [data-image-help]").waitFor();
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
