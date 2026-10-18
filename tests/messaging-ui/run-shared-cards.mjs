// Sohbette paylaşılan içerik kartları (sahip adı, açıklama, görsel; erişilemeyen içerik) ve yanıt çubuğu/alıntısı (ağ taklitli) — docs/history/195-*.
// Gerçek Supabase'e KARŞI DENENMEDİ; DB tarafı `supabase/tests/engagement-privacy.sql` + mevcut RLS testleridir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { installDetailData, ID } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4179/promptly";
const server = await serve(4179);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const HIDDEN = "99999999-9999-4999-8999-999999999999";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/sfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const shareBody = (kind, title, id) => `${title}\nhttps://aliq0330.github.io/promptly/${kind}/local?id=${id}`;
/** Bob'dan gelen paylaşım mesajları: her tür için okunabilir + (prompt/istek/workflow için) erişilemeyen. */
function seed(db) {
  db.addConv(CONV, U.bob, { texts: [] });
  const add = (patch, body = null) => { db.addMessage(CONV, U.bob.id, body); Object.assign(db.messages.at(-1), patch); return db.messages.at(-1); };
  add({ shared_prompt_id: ID.prompt });
  add({ shared_prompt_id: HIDDEN });
  add({ shared_request_id: ID.request });
  add({ shared_request_id: HIDDEN });
  add({}, shareBody("workflows", "Ürün fotoğrafından kampanya görseli", ID.workflow));
  add({}, shareBody("workflows", "Silinmiş akış", HIDDEN));
  add({}, shareBody("presets", "Sinematik portre ayarı", ID.preset));
}
const cards = (page) => page.locator("[data-shared-card]");
const open = async (page) => { await page.goto(`${BASE}/messages/local?id=${CONV}`); await cards(page).first().waitFor(); await page.waitForTimeout(900); };

await scenario("1. Okunabilir içerik: kart sahibin adını + türü, başlığı, açıklamayı gösterir ve içeriğe bağlanır (prompt · istek · workflow · hazır ayar)", async ({ page }) => {
  await open(page);
  const ready = page.locator("[data-shared-card='ready']");
  assert.equal(await ready.count(), 4, "four readable cards");
  const owners = await page.locator("[data-shared-card='ready'] [data-shared-owner]").allTextContents();
  assert.ok(owners.every((o) => o.includes(" · ")), `owner · type on every card: ${JSON.stringify(owners)}`);
  assert.ok(owners.some((o) => /Prompt$/.test(o)) && owners.some((o) => /İstek$/.test(o)) && owners.some((o) => /Workflow$/.test(o)) && owners.some((o) => /Hazır ayar$/.test(o)), JSON.stringify(owners));
  assert.ok(owners.some((o) => o.startsWith("Carol")), "workflow/preset owner is Carol");
  assert.match(await page.locator("[data-shared-card='ready']", { hasText: "Markalı mekanik klavye tuşları" }).textContent(), /2×2 dizilmiş/, "description snippet");
  assert.match((await page.locator("[data-shared-card='ready']", { hasText: "Markalı mekanik" }).getAttribute("href")) ?? "", /\/prompts\/local\/?\?id=/);
  assert.equal(await page.getByText("Paylaşılan Prompt").count(), 0, "old generic label is gone");
}, { setup: seed });

await scenario("2. Erişilemeyen içerik: 'Yükleniyor…' DEĞİL, 'Sayfa gizli veya kaldırılmış' — bağlantı yok (prompt · istek · workflow)", async ({ page }) => {
  await open(page);
  const hidden = page.locator("[data-shared-card='hidden']");
  assert.equal(await hidden.count(), 3, "three hidden cards");
  for (const text of await hidden.allTextContents()) assert.match(text, /Sayfa gizli veya kaldırılmış/);
  assert.equal(await hidden.locator("a").count(), 0, "a hidden card is not a link");
  assert.equal(await page.getByText("Yükleniyor").count(), 0, "nothing stuck on loading");
}, { setup: seed });

await scenario("3. İngilizce: kartlar ve gizli içerik metni çevrilmiş", async ({ page }) => {
  await open(page);
  assert.match(await page.locator("[data-shared-card='hidden']").first().textContent(), /This page is hidden or has been removed/);
  const owners = await page.locator("[data-shared-card='ready'] [data-shared-owner]").allTextContents();
  assert.ok(owners.some((o) => /Request$/.test(o)) && owners.some((o) => /Preset$/.test(o)), JSON.stringify(owners));
}, { setup: seed, lang: "en" });

const REPLY_SEED = (db) => {
  db.addConv(CONV, U.bob, { texts: [] });
  const add = (sender, patch, body = null) => { db.addMessage(CONV, sender, body); Object.assign(db.messages.at(-1), patch); return db.messages.at(-1); };
  add(U.bob.id, { attachments: [{ path: `${CONV}/foto-1.png`, width: 120, height: 90, mime: "image/png" }] });
  add(U.bob.id, { shared_prompt_id: ID.prompt });
  add(ME, {}, "benim yazım");
  add(U.bob.id, {}, "bob düz metin");
};
const replyTo = async (page, text) => {
  const m = page.locator("[data-message-id]", { hasText: text }).first();
  await m.hover();
  await m.getByRole("button", { name: "Mesaj seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yanıtla", exact: true }).click();
};
const openThread = async (page) => { await page.goto(`${BASE}/messages/local?id=${CONV}`); await page.locator("[data-message-id]").first().waitFor(); await page.waitForTimeout(700); };

await scenario("4. Yanıt çubuğu: kime yanıt verildiği + tek satır özet; fotoğraflı mesajda küçük görsel sağda", async ({ page }) => {
  await openThread(page);
  await replyTo(page, "bob düz metin");
  const bar = page.locator("[data-reply-bar]");
  await bar.waitFor();
  assert.match(await bar.textContent(), /Bob kullanıcısına yanıt veriyorsun/);
  assert.match(await bar.textContent(), /bob düz metin/);
  assert.equal(await bar.locator("[data-reply-thumb]").count(), 0, "text message has no picture");
  await bar.getByRole("button").click();
  assert.equal(await bar.count(), 0, "cancel closes the bar");
}, { setup: REPLY_SEED });

await scenario("4b. Yanıt çubuğu: fotoğraflı mesaj ve paylaşılan prompt görseliyle; kendi mesajıma 'Kendi mesajına'", async ({ page }) => {
  await openThread(page);
  const msgs = page.locator("[data-message-id]");
  await replyTo(page, "benim yazım");
  assert.match(await page.locator("[data-reply-bar]").textContent(), /Kendi mesajına yanıt veriyorsun/);
  // fotoğraflı mesaj (gövdesi yok): ilk mesaj
  const first = msgs.first();
  await first.hover();
  await first.getByRole("button", { name: "Mesaj seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yanıtla", exact: true }).click();
  const bar = page.locator("[data-reply-bar]");
  assert.match(await bar.textContent(), /Bob kullanıcısına yanıt veriyorsun/);
  assert.match(await bar.textContent(), /Bir fotoğraf/);
  await bar.locator("[data-reply-thumb]").waitFor();
  const box = await bar.locator("[data-reply-thumb]").boundingBox();
  assert.ok(box.width <= 44 && box.width >= 36, `small thumbnail (${box.width}px)`);
  // paylaşılan prompt: görseli fixture'dan
  const second = msgs.nth(1);
  await second.hover();
  await second.getByRole("button", { name: "Mesaj seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yanıtla", exact: true }).click();
  assert.match(await bar.textContent(), /Bir prompt/);
  await bar.locator("[data-reply-thumb]").waitFor();
}, { setup: REPLY_SEED });

await scenario("5. Gönderilen yanıtın alıntısı (balon üstü) görsel varsa küçük görselle gelir; yoksa yalnız metin", async ({ page }) => {
  await openThread(page);
  await replyTo(page, "bob düz metin");
  await page.getByPlaceholder("Bir mesaj yaz...").fill("düz yanıt");
  await page.getByPlaceholder("Bir mesaj yaz...").press("Enter");
  await page.locator("[data-message-id]", { hasText: "düz yanıt" }).waitFor();
  // fotoğrafa yanıt
  const first = page.locator("[data-message-id]").first();
  await first.hover();
  await first.getByRole("button", { name: "Mesaj seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yanıtla", exact: true }).click();
  await page.getByPlaceholder("Bir mesaj yaz...").fill("foto yanıtı");
  await page.getByPlaceholder("Bir mesaj yaz...").press("Enter");
  const reply = page.locator("[data-message-id]", { hasText: "foto yanıtı" });
  await reply.waitFor();
  await reply.locator("[data-reply-thumb]").waitFor();
  const plain = page.locator("[data-message-id]", { hasText: "düz yanıt" });
  assert.equal(await plain.locator("[data-reply-thumb]").count(), 0, "text-only quote has no picture");
}, { setup: REPLY_SEED });

await scenario("6. Mobil (390px): kartlar ve yanıt çubuğu taşmaz", async ({ page }) => {
  await open(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
}, { setup: seed, viewport: { width: 390, height: 800 } });

// Kimlik değişimi (docs/history/195-*): hesap değişince / çıkış yapınca önceki kullanıcının bellekteki her kopyası atılır (sayfa baştan yüklenir).
// supabase-js, sekmeler arası oturum olaylarını BroadcastChannel(storageKey) ile alır; test aynı kanala olay yollar.
const broadcast = (page, event, userId) =>
  page.evaluate(([ev, uid]) => {
    const ch = new BroadcastChannel("sb-example-auth-token");
    const session = uid ? { access_token: "x.y.z", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r", user: { id: uid, aud: "authenticated", role: "authenticated", email: "x@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } } : null;
    ch.postMessage({ event: ev, session });
    ch.close();
  }, [event, userId]);
const alive = (page) => page.evaluate(() => window.__alive === 1);

await scenario("7. Hesap değişince: sayfa baştan yüklenir (önceki hesabın içerik önbelleği kalmaz)", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__alive = 1; });
  assert.equal(await alive(page), true);
  await broadcast(page, "SIGNED_IN", U.bob.id);
  await page.waitForFunction(() => window.__alive === undefined, null, { timeout: 8000 });
}, { setup: seed });

await scenario("8. Çıkış yapınca: önceki kullanıcının verisi atılır ve ana sayfaya dönülür", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__alive = 1; });
  await broadcast(page, "SIGNED_OUT", null);
  await page.waitForURL(/\/promptly\/?$/, { timeout: 8000 });
  assert.equal(await alive(page), false, "page was reloaded");
}, { setup: seed });

await scenario("9. Aynı kullanıcının belirteç yenilemesi sayfayı yenilemez", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__alive = 1; });
  await broadcast(page, "TOKEN_REFRESHED", ME);
  await page.waitForTimeout(1500);
  assert.equal(await alive(page), true, "no reload for the same person");
  assert.ok(await cards(page).count() > 0);
}, { setup: seed });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
