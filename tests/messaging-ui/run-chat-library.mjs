// Sohbet: "+" menüsü (fotoğraf · prompt içe aktar · kütüphaneden paylaş), Space paylaşımı ve Kişi bilgisi paneli — ağ taklitli (docs/history/268-*).
// Gerçek Supabase'e / gerçek telefona KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { installDetailData, ID } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4181/promptly";
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const GROUP = "c0000000-0000-4000-8000-0000000000a1";
const SPACE_ID = "5a000000-0000-4000-8000-000000000001";
const PHONE = { width: 390, height: 800 };

const SPACE_ROW = {
  id: SPACE_ID, owner_id: ME, title: "Sahil moodboard", description: "Sis, kum ve turkuaz tonlar.", kind: "moodboard", visibility: "public", cover_url: null, cover_item_id: null,
  archived_at: null, created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T12:00:00Z", updated_by: null, quote_count: 0, rating_avg: 0, rating_count: 0, comment_count: 0, activity_visibility: "everyone",
};

async function scenario(name, fn, { viewport = PHONE, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  db.ownContent.prompt = [{ id: ID.prompt, title: "Markalı mekanik klavye tuşları", visibility: "public" }, { id: "99999999-9999-4999-8999-0000000000aa", title: "Gizli taslak prompt", visibility: "private" }];
  db.ownContent.workflow = [{ id: ID.workflow, title: "Ürün fotoğrafından kampanya görseli", visibility: "public" }];
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  // Space uçları (setupSpaces, setupCommunities ile aynı `extraRoutes` kancasını kullandığı için burada küçük bir taklit): liste (id, title) + tek satır.
  await context.route(/\/rest\/v1\/spaces\?/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const url = new URL(req.url());
    const select = (url.searchParams.get("select") ?? "").replace(/\s/g, "");
    const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (select === "id,title") return route.fulfill({ status: 200, headers, body: JSON.stringify([{ id: SPACE_ROW.id, title: SPACE_ROW.title }]) });
    const wantsObject = (req.headers().accept ?? "").includes("vnd.pgrst.object");
    const wanted = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
    const found = wanted === SPACE_ROW.id ? SPACE_ROW : null;
    if (wantsObject) return found ? route.fulfill({ status: 200, headers, body: JSON.stringify(found) }) : route.fulfill({ status: 406, headers, body: JSON.stringify({ code: "PGRST116", message: "no rows" }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify(found ? [found] : []) });
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/lfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const seed = (db) => db.addConv(CONV, U.bob, { texts: ["merhaba", "selam"] });
const openThread = async (page, id = CONV) => { await page.goto(`${BASE}/messages/local?id=${id}`); await page.locator("[data-composer-plus]").waitFor(); await page.waitForTimeout(300); };
const plus = (page) => page.locator("[data-composer-plus]");
const openLibrary = async (page, type) => { await plus(page).click(); await page.locator(`[data-attach-library='${type}']`).click(); await page.locator("[data-chat-library]").waitFor(); };
const lastMessage = (db) => db.messages.at(-1);
const send = async (page) => { await page.getByRole("button", { name: "Mesaj gönder" }).click(); };

await scenario("1. '+' alt sayfası: Fotoğraf yükle · Prompt içe aktar · Kütüphaneden paylaş (Prompt · İstek · Workflow · Hazır ayar · Space)", async ({ page }) => {
  await openThread(page);
  await plus(page).click();
  const sheet = page.locator("[data-chat-attach]");
  await sheet.waitFor();
  await sheet.getByText("Fotoğraf yükle").waitFor();
  await sheet.getByText("Prompt içe aktar").waitFor();
  await sheet.getByText("Kütüphaneden paylaş").waitFor();
  assert.deepEqual(await sheet.locator("[data-attach-library]").evaluateAll((els) => els.map((el) => el.getAttribute("data-attach-library"))), ["prompt", "request", "workflow", "preset", "space"]);
}, { setup: seed });

await scenario("2. Fotoğraf yükle: dosya seçiciyi açar (aynı hazırlık hattı)", async ({ page }) => {
  await openThread(page);
  await plus(page).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("[data-attach-photo]").click()]);
  assert.ok(chooser.isMultiple(), "çoklu seçim");
}, { setup: seed });

await scenario("3. Prompt içe aktar: mevcut içe aktarma penceresi açılır (özel taslak olarak)", async ({ page }) => {
  await openThread(page);
  await plus(page).click();
  await page.locator("[data-attach-import]").click();
  await page.getByRole("dialog").getByText(/içe aktar/i).first().waitFor();
}, { setup: seed });

await scenario("4. Kütüphaneden prompt: yalnız herkese açık içerik listelenir; seçip 'Ekle' → mesaja eklenir, gönderince gerçek gömülü içerik (shared_prompt_id)", async ({ page, db }) => {
  await openThread(page);
  await openLibrary(page, "prompt");
  const picker = page.locator("[data-chat-library]");
  await picker.getByText("Markalı mekanik klavye tuşları").waitFor();
  assert.equal(await picker.getByText("Gizli taslak prompt").count(), 0, "özel içerik listelenmez");
  assert.equal(await picker.locator("[data-library-add]").isDisabled(), true, "seçim yokken pasif");
  await picker.locator("[data-library-item]").first().click();
  await picker.locator("[data-library-add]").click();
  await picker.waitFor({ state: "detached" });
  await page.waitForURL(new RegExp(`sharePromptId=${ID.prompt}`));
  await page.getByText(/Markalı mekanik klavye tuşları — /).first().waitFor();
  await send(page);
  await page.locator("[data-shared-card='ready']").first().waitFor();
  assert.equal(lastMessage(db).shared_prompt_id, ID.prompt);
}, { setup: seed });

await scenario("5. Kütüphaneden workflow: sekme değişince liste değişir; gönderilen mesaj başlık + bağlantı bloğudur ve kart olarak çizilir", async ({ page, db }) => {
  await openThread(page);
  await openLibrary(page, "prompt");
  const picker = page.locator("[data-chat-library]");
  await picker.getByRole("tab", { name: "Workflow" }).click();
  await picker.getByText("Ürün fotoğrafından kampanya görseli").waitFor();
  assert.equal(await picker.getByText("Markalı mekanik klavye tuşları").count(), 0, "önceki türün listesi gitti");
  await picker.locator("[data-library-item]").first().click();
  await picker.locator("[data-library-add]").click();
  await page.locator("[data-composer-plus]").waitFor();
  await page.waitForURL(new RegExp(`shareWorkflowId=${ID.workflow}`));
  await page.getByText(/Ürün fotoğrafından kampanya görseli — /).first().waitFor();
  await send(page);
  await page.locator("[data-shared-card='ready']").first().waitFor();
  assert.match(lastMessage(db).body, new RegExp(`^Ürün fotoğrafından kampanya görseli\\nhttps?://.*/workflows/local\\?id=${ID.workflow}$`));
}, { setup: seed });

await scenario("6. Kütüphaneden Space: seçilir, mesaj başlık + Space bağlantısı olarak gider ve Space kartı çizilir", async ({ page, db }) => {
  await openThread(page);
  await openLibrary(page, "space");
  const picker = page.locator("[data-chat-library]");
  await picker.getByText("Sahil moodboard").waitFor();
  await picker.locator("[data-library-item]").first().click();
  await picker.locator("[data-library-add]").click();
  await page.waitForURL(new RegExp(`shareSpaceId=${SPACE_ID}`));
  await page.getByText(/Sahil moodboard — /).first().waitFor();
  await send(page);
  const card = page.locator("[data-shared-card='ready']", { hasText: "Sahil moodboard" });
  await card.waitFor();
  assert.match(lastMessage(db).body, new RegExp(`^Sahil moodboard\\nhttps?://.*/spaces/local\\?id=${SPACE_ID}$`));
  assert.match((await card.locator("a[data-shared-open]").getAttribute("href")) ?? "", /\/spaces\/local\/?\?id=/);
  assert.equal(await card.locator("[data-shared-type]").innerText(), "Space");
  assert.equal(await card.locator("button").count(), 0, "Space kaydedilmez: Kaydet yok");
}, { setup: seed });

await scenario("7. Paylaşımdan vazgeçmek: bannerdaki × ile ek kalkar, sade mesaj gönderilebilir", async ({ page, db }) => {
  await openThread(page);
  const before = db.messages.length;
  await openLibrary(page, "workflow");
  const picker = page.locator("[data-chat-library]");
  await picker.locator("[data-library-item]").first().click();
  await picker.locator("[data-library-add]").click();
  await page.getByText(/Ürün fotoğrafından kampanya görseli — /).first().waitFor();
  await page.getByRole("button", { name: /Paylaşımı iptal/i }).click();
  await page.getByText(/Ürün fotoğrafından kampanya görseli — /).first().waitFor({ state: "detached" });
  assert.equal(db.messages.length, before, "hiçbir şey gönderilmedi");
}, { setup: seed });

await scenario("8. Kişi bilgisi: başlıktaki kişiye dokununca panel; avatar, ad, @kullanıcıadı, Ara/Profil, fotoğraflar, yıldızlı/sabit sayıları", async ({ page, db }) => {
  const row = db.addMessage(CONV, U.bob.id, null);
  row.attachments = [{ path: `${U.bob.id}/a.jpg`, width: 100, height: 100, mime: "image/jpeg" }, { path: `${U.bob.id}/b.jpg`, width: 100, height: 100, mime: "image/jpeg" }];
  await openThread(page);
  await page.locator("[data-contact-open]").click();
  const panel = page.locator("[data-contact-info]");
  await panel.waitFor();
  assert.equal((await panel.locator("[data-contact-name]").innerText()).trim(), "Bob");
  assert.equal((await panel.locator("[data-contact-username]").innerText()).trim(), "@bobby");
  await panel.locator("[data-contact-photo]").first().waitFor();
  assert.equal(await panel.locator("[data-contact-photo]").count(), 2);
  assert.equal((await panel.locator("[data-contact-photo-count]").innerText()).trim(), "2");
  assert.match((await panel.getByRole("link", { name: "Profil" }).getAttribute("href")) ?? "", /\/profile\/real\/?\?username=bobby/);
  assert.equal(await panel.locator("[data-contact-row='starred']").innerText().then((t) => /Yok/.test(t)), true);
  assert.equal(await panel.locator("[data-contact-row='pinned']").innerText().then((t) => /Yok/.test(t)), true);
  const box = await panel.boundingBox();
  assert.ok(box.width >= 388, `telefonda tam ekran (${box.width})`);
}, { setup: seed });

await scenario("9. Kişi bilgisi: görünmeyen mesajın fotoğrafı gösterilmez (temizlenen / benden silinen)", async ({ page, db }) => {
  const old = db.addMessage(CONV, U.bob.id, null);
  old.attachments = [{ path: `${U.bob.id}/old.jpg`, width: 10, height: 10, mime: "image/jpeg" }];
  const hidden = db.addMessage(CONV, U.bob.id, null);
  hidden.attachments = [{ path: `${U.bob.id}/hidden.jpg`, width: 10, height: 10, mime: "image/jpeg" }];
  const shown = db.addMessage(CONV, U.bob.id, null);
  shown.attachments = [{ path: `${U.bob.id}/shown.jpg`, width: 10, height: 10, mime: "image/jpeg" }];
  db.member(CONV, ME).cleared_at = old.created_at;
  (db.hidden ??= []).push({ message_id: hidden.id, user_id: ME });
  await openThread(page);
  await page.locator("[data-contact-open]").click();
  const panel = page.locator("[data-contact-info]");
  await panel.locator("[data-contact-photo]").first().waitFor();
  assert.equal(await panel.locator("[data-contact-photo]").count(), 1, "yalnız görünen mesajın fotoğrafı");
}, { setup: seed });

await scenario("10. Kişi bilgisi: Ara sohbet aramasını açar; fotoğrafa dokununca panel kapanır; Arşivle/Mesajları temizle/Sil onayları ⋮ menüsüyle aynı", async ({ page, db }) => {
  const row = db.addMessage(CONV, U.bob.id, null);
  row.attachments = [{ path: `${U.bob.id}/a.jpg`, width: 10, height: 10, mime: "image/jpeg" }];
  await openThread(page);
  await page.locator("[data-contact-open]").click();
  const panel = page.locator("[data-contact-info]");
  await panel.getByRole("button", { name: "Ara" }).click();
  await panel.waitFor({ state: "detached" });
  await page.locator("[data-conversation-search]").waitFor();
  await page.locator("[data-contact-open]").click();
  await panel.locator("[data-contact-photo]").first().click();
  await panel.waitFor({ state: "detached" });
  await page.locator("[data-contact-open]").click();
  await panel.locator("[data-contact-row='clear']").click();
  await page.getByRole("dialog").getByRole("heading", { name: "Mesajları temizle" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Vazgeç" }).click();
  await panel.locator("[data-contact-row='archive']").click();
  await page.waitForFunction(() => document.querySelector("[data-contact-row='archive']")?.textContent?.includes("Arşivden çıkar"));
  assert.ok(db.member(CONV, ME).archived_at, "arşivlendi");
  await panel.locator("[data-contact-row='delete']").click();
  await page.getByRole("dialog").getByRole("heading", { name: "Sohbeti sil" }).waitFor();
}, { setup: seed });

await scenario("11. Kişi bilgisi: engelle iki adımlı (onay metni), yeniden dokununca engeli kaldırır", async ({ page, db }) => {
  await openThread(page);
  await page.locator("[data-contact-open]").click();
  const panel = page.locator("[data-contact-info]");
  const block = panel.locator("[data-contact-row='block']");
  await block.click();
  await block.getByText("Emin misin? Tekrar tıkla").waitFor();
  assert.equal(db.blocks.length, 0, "ilk dokunuş engellemez");
  await block.click();
  await block.getByText("Engeli kaldır").waitFor();
  assert.equal(db.blocks.length, 1);
}, { setup: seed });

await scenario("12. Grup/topluluk sohbetinde başlık Kişi bilgisi AÇMAZ (grup bilgi penceresi kendi yolunda), '+' menüsü yine var", async ({ page }) => {
  await openThread(page, GROUP);
  assert.equal(await page.locator("[data-contact-open]").count(), 0);
  await plus(page).click();
  await page.locator("[data-attach-library='prompt']").waitFor();
}, { setup: (db) => db.addGroup(GROUP, { name: "Tasarım Atölyesi", visibility: "public", myRole: "owner", members: [[U.bob, "member"]], texts: [[U.bob, "selam"]] }) });

await scenario("13. İngilizce: '+' menüsü, seçici ve Kişi bilgisi çevrilmiş", async ({ page }) => {
  await openThread(page);
  await plus(page).click();
  const sheet = page.locator("[data-chat-attach]");
  await sheet.getByText("Upload a photo").waitFor();
  await sheet.getByText("Import prompts").waitFor();
  await sheet.getByText("Share from your library").waitFor();
  await sheet.locator("[data-attach-library='preset']").click();
  const picker = page.locator("[data-chat-library]");
  await picker.getByRole("heading", { name: "Share from your library" }).waitFor();
  await picker.getByRole("button", { name: "Pick an item" }).waitFor();
  await picker.getByRole("button", { name: "Close" }).click();
  await page.locator("[data-contact-open]").click();
  const panel = page.locator("[data-contact-info]");
  await panel.getByRole("heading", { name: "Contact info" }).waitFor();
  await panel.getByText("Shared photos").waitFor();
  await panel.getByText("Starred messages").waitFor();
}, { setup: seed, lang: "en" });

await scenario("14. Masaüstü: Kişi bilgisi sağdan açılan panel (tam ekran değil); tablet/masaüstü taşma yok", async ({ page }) => {
  await openThread(page);
  await page.locator("[data-contact-open]:visible").first().click();
  const panel = page.locator("[data-contact-info]");
  await panel.waitFor();
  const box = await panel.boundingBox();
  assert.ok(box.width <= 420 && box.x > 600, `sağ panel (${JSON.stringify(box)})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, "yatay taşma yok");
}, { setup: seed, viewport: { width: 1280, height: 860 } });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
