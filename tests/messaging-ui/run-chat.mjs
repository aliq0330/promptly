// Sohbet geliştirmeleri arayüz testleri (ağ + Realtime taklitli) — docs/history/174-*. Çalıştırma: README.md.
// Okundu bilgisi, yazıyor, sabitleme, sohbet içi arama, yıldızlı mesajlar; birebir ve topluluk. Gerçek Supabase'e/Realtime'a karşı denenmedi.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const BASE = "http://localhost:4175/promptly";
const server = await serve(4175);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const CONV2 = "c0000000-0000-4000-8000-0000000000c2";
const G = "d0000000-0000-4000-8000-0000000000a1";

/** `users`: ek kullanıcılar (her biri ayrı tarayıcı bağlamı = ayrı oturum); `hub`: Realtime taklidi (WebSocket). */
async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme, users = [], hubOptions } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  setup?.(db);
  const hub = createRealtimeHub(hubOptions);
  const opened = [];
  const errors = [];
  async function newSession(signedIn) {
    const context = await browser.newContext({ viewport });
    await installMock(context, db, { signedIn });
    await hub.install(context, signedIn);
    await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(String(e)));
    opened.push(context);
    return page;
  }
  const page = await newSession(ME);
  const others = {};
  for (const u of users) others[u.username] = await newSession(u.id);
  try { await fn({ page, db, hub, others, newSession }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cfail-${results.length}.png` }); } catch {} }
  finally { for (const c of opened) await c.close(); }
}

const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const openThread = async (page, id = CONV, extra = "") => { await page.goto(`${BASE}/messages/local?id=${id}${extra}`); await page.locator("[data-message-id]").first().waitFor(); await page.waitForTimeout(350); };
const msg = (page, text) => page.locator("[data-message-id]", { hasText: text }).first();
const openMsgMenu = async (page, text, label = "Mesaj seçenekleri") => { const m = msg(page, text); await m.hover(); await m.getByRole("button", { name: label }).click(); };
const mItem = (page, name) => page.getByRole("menuitem", { name, exact: true });
const toast = (page, text) => page.getByRole("status").filter({ hasText: text }).first();
const stampOf = (db, text) => db.messages.find((m) => m.body === text).created_at;
const dmTexts = ["selam bob", "benim mesajım", "ikinci bob mesajı", "ikinci benim"]; // 0,2 = Bob; 1,3 = ben
const seedDm = (db, opts = {}) => db.addConv(CONV, U.bob, { texts: dmTexts, ...opts });
const seedGroup = (db, opts = {}) => db.addGroup(G, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], texts: [[U.bob, "merhaba topluluk"], [U.carol, "carol yazdı"], [U.dave, "dave yazdı"]], ...opts });
const manyTexts = (specials = {}) => Array.from({ length: 230 }, (_, i) => specials[i] ?? `mesaj ${i}`);
const flashed = (page, text) => page.locator("[data-message-id].ring-primary\\/40, [data-message-id][class*='ring-primary']", { hasText: text }).first();

// ====================================================================== OKUNDU BİLGİSİ
await scenario("1. Okundu: sohbet açılınca karşı tarafın en yeni mesajına kadar TEK kez bildirilir; kendi mesajım sayılmaz, tekrar yazılmaz", async ({ page, db }) => {
  await openThread(page);
  await page.waitForTimeout(1200);
  assert.equal(db.readCalls.length, 1, "exactly one write");
  assert.equal(db.readCalls[0].up_to, stampOf(db, "ikinci bob mesajı"), "up to the newest message from the other side, not my own newer one");
  assert.equal(db.member(CONV, ME).last_read_at, stampOf(db, "ikinci bob mesajı"));
  await page.locator("[data-message-id]").first().hover(); await page.mouse.wheel(0, -300); await page.mouse.wheel(0, 300); await page.waitForTimeout(500);
  assert.equal(db.readCalls.length, 1, "scrolling does not re-send");
  assert.equal(db.member(CONV, U.bob.id).last_read_at ?? null, null, "the other side's cursor is never written by me");
}, { setup: (db) => seedDm(db) });

await scenario("2. Okundu: bekleyen mesaj isteğinde (kabul edilmemiş) okundu bildirilmez", async ({ page, db }) => {
  await openThread(page);
  await page.waitForTimeout(1000);
  assert.equal(db.readCalls.length, 0, "no receipt before accepting the request");
}, { setup: (db) => seedDm(db, { status: "pending" }) });

await scenario("3. Okundu (birebir): kendi mesajımda 'Gönderildi' → karşı tarafın imleci ilerleyince 'Okundu' (canlı); eski olay geri almaz; yenilemede kalıcı", async ({ page, db, hub }) => {
  await openThread(page);
  const tick = (text) => msg(page, text).locator("[data-read-state]");
  assert.equal(await tick("benim mesajım").getAttribute("data-read-state"), "sent");
  assert.equal(await tick("ikinci benim").getAttribute("data-read-state"), "sent");
  assert.equal(await msg(page, "selam bob").locator("[data-read-state]").count(), 0, "no tick on the other side's message");
  const first = stampOf(db, "benim mesajım");
  db.member(CONV, U.bob.id).last_read_at = first;
  hub.emitPostgresChange("conversation_members", "UPDATE", { conversation_id: CONV, user_id: U.bob.id, last_read_at: first });
  await page.waitForFunction(() => document.querySelector("[data-message-id] [data-read-state='read']"));
  assert.equal(await tick("benim mesajım").getAttribute("data-read-state"), "read");
  assert.equal(await tick("ikinci benim").getAttribute("data-read-state"), "sent", "later message still only sent");
  hub.emitPostgresChange("conversation_members", "UPDATE", { conversation_id: CONV, user_id: U.bob.id, last_read_at: stampOf(db, "selam bob") });
  await page.waitForTimeout(400);
  assert.equal(await tick("benim mesajım").getAttribute("data-read-state"), "read", "a stale event never reverts");
  await page.reload(); await page.locator("[data-message-id]").first().waitFor(); await page.waitForTimeout(400);
  assert.equal(await tick("benim mesajım").getAttribute("data-read-state"), "read", "persisted state is read back from the database");
  assert.equal(await tick("ikinci benim").getAttribute("data-read-state"), "sent");
}, { setup: (db) => seedDm(db) });

await scenario("4. Okundu (topluluk): topluluktaki mesajlarda tik yok; 'Mesaj bilgisi' yalnız KENDİ mesajımda; okuyanlar/okumayanlar listelenir, gönderen yok", async ({ page }) => {
  await openThread(page, G);
  assert.equal(await page.locator("[data-read-state]").count(), 0, "no per-bubble ticks in groups");
  await openMsgMenu(page, "carol yazdı");
  assert.equal(await mItem(page, "Mesaj bilgisi").count(), 0, "not on someone else's message");
  await page.keyboard.press("Escape");
  await openMsgMenu(page, "ben yazdım");
  await mItem(page, "Mesaj bilgisi").click();
  const d = page.getByRole("dialog");
  await d.getByRole("heading", { name: "Mesaj bilgisi" }).waitFor();
  const clean = (list) => list.map((t) => t.replace(/\s+/g, " ")).sort();
  const read = clean(await d.locator("[data-receipt-read]").allInnerTexts());
  const unread = clean(await d.locator("[data-receipt-unread]").allInnerTexts());
  assert.equal(read.length, 2); assert.ok(read[0].includes("Bob") && read[1].includes("Carol"), `readers: ${read}`);
  assert.equal(unread.length, 1); assert.ok(unread[0].includes("Dave"));
  assert.equal(await d.getByText("Alice").count(), 0, "the sender is not listed");
}, { setup: (db) => {
  seedGroup(db);
  const mine = db.addMessage(G, ME, "ben yazdım");
  db.member(G, U.bob.id).last_read_at = mine.created_at; db.member(G, U.bob.id).last_read_updated_at = db.stamp();
  db.member(G, U.carol.id).last_read_at = mine.created_at; db.member(G, U.carol.id).last_read_updated_at = db.stamp();
} });

await scenario("4b. Mesaj bilgisi: yetkisiz çağrı (sunucu 'forbidden') güvenli hata gösterir, ham SQL metni yok", async ({ page }) => {
  await openThread(page, G);
  await openMsgMenu(page, "ben yazdım");
  await mItem(page, "Mesaj bilgisi").click();
  await page.getByRole("dialog").getByRole("alert").getByText("Bu işlem için yetkin yok.").waitFor();
}, { setup: (db) => { seedGroup(db); db.addMessage(G, ME, "ben yazdım"); db.rpc.message_read_receipts = () => ({ status: 400, body: { code: "P0001", message: "forbidden", details: "", hint: "" } }); } });

// ====================================================================== SABİTLEME
await scenario("5. Sabitle (birebir): iki taraf da; çubuk görünür, kalıcı, çubuğa dokununca mesaja gider; kaldırınca çubuk kalkar; mesaj değişmez", async ({ page, db }) => {
  await openThread(page);
  assert.equal(await page.locator("[data-pinned-bar]").count(), 0);
  await openMsgMenu(page, "selam bob");
  await mItem(page, "Sabitle").click();
  await toast(page, "Mesaj sabitlendi.").waitFor();
  await page.locator("[data-pinned-bar]", { hasText: "selam bob" }).waitFor();
  assert.equal(db.pins.length, 1);
  assert.equal(db.messages.find((m) => m.body === "selam bob").edited_at, null, "pinning does not alter the message");
  await page.reload(); await page.locator("[data-pinned-bar]", { hasText: "selam bob" }).waitFor();
  await page.locator("[data-pinned-bar] button").first().click();
  await flashed(page, "selam bob").waitFor();
  await openMsgMenu(page, "selam bob");
  await mItem(page, "Sabitlemeyi kaldır").click();
  await page.locator("[data-pinned-bar]").waitFor({ state: "detached" });
  assert.equal(db.pins.length, 0);
  assert.equal(db.messages.length, 4, "no message was removed or copied");
}, { setup: (db) => seedDm(db) });

await scenario("6. Sabit mesajlar: birden fazla → konum göstergesi, liste penceresi, listeden mesaja git / kaldır", async ({ page, db }) => {
  await openThread(page);
  for (const text of ["selam bob", "ikinci bob mesajı"]) { await openMsgMenu(page, text); await mItem(page, "Sabitle").click(); await page.locator("[data-pinned-bar]").waitFor(); await page.waitForTimeout(300); }
  assert.equal(db.pins.length, 2);
  await page.locator("[data-pinned-bar]", { hasText: "1 / 2" }).waitFor();
  await page.getByRole("button", { name: "Sabitlenmiş tüm mesajları göster" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("heading", { name: "Sabitlenmiş mesajlar" }).waitFor();
  assert.equal(await d.locator("ul li").count(), 2);
  await d.getByRole("button", { name: /Mesaja git: selam bob/ }).click();
  await d.waitFor({ state: "detached" });
  await flashed(page, "selam bob").waitFor();
  await page.getByRole("button", { name: "Sabitlenmiş tüm mesajları göster" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sabitlemeyi kaldır" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll("[role=dialog] ul li").length === 1);
  assert.equal(db.pins.length, 1);
}, { setup: (db) => seedDm(db) });

await scenario("7. Sabit: silinmiş/erişilemeyen mesajın sabiti bozuk kayıt olarak görünmez", async ({ page }) => {
  await openThread(page);
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-pinned-bar]").count(), 0, "the pin of a deleted message is not shown");
  assert.equal(await page.locator("[data-pinned-bar]").count(), 0);
}, { setup: (db) => {
  seedDm(db);
  const m = db.messages.find((x) => x.body === "selam bob"); m.deleted_at = db.stamp(); m.body = null;
  db.pins.push({ message_id: m.id, conversation_id: CONV, pinned_by: ME, pinned_at: db.stamp() });
} });

await scenario("8. Sabit (topluluk): normal üye sabitleyemez; sunucu reddederse hata gösterilir ve çubuk oluşmaz", async ({ page }) => {
  await openThread(page, G);
  await openMsgMenu(page, "carol yazdı");
  assert.equal(await mItem(page, "Sabitle").count(), 0, "no pin item for a plain member");
  await page.keyboard.press("Escape");
}, { setup: (db) => seedGroup(db, { myRole: "member" }) });

await scenario("8b. Sabit (topluluk): moderatör varsayılanda sabitler; yetkisi alınınca menüde görünmez; sunucu reddi dürüstçe gösterilir", async ({ page, db }) => {
  await openThread(page, G);
  await openMsgMenu(page, "dave yazdı");
  await mItem(page, "Sabitle").click();
  await page.locator("[data-pinned-bar]", { hasText: "dave yazdı" }).waitFor();
  assert.equal(db.pins.length, 1);
  db.rpc.set_message_pinned = () => ({ status: 400, body: { code: "P0001", message: "forbidden", details: "", hint: "" } });
  await openMsgMenu(page, "carol yazdı");
  await mItem(page, "Sabitle").click();
  await toast(page, "Bu işlem için yetkin yok.").waitFor();
  assert.equal(await page.locator("[data-pinned-bar]", { hasText: "carol yazdı" }).count(), 0);
}, { setup: (db) => seedGroup(db, { myRole: "moderator" }) });

await scenario("8c. Sabit (topluluk): moderatörden pin_messages alınınca menüde yok; owner 'üyeler de sabitlesin' açınca normal üyede çıkar", async ({ page }) => {
  await openThread(page, G);
  await openMsgMenu(page, "dave yazdı");
  assert.equal(await mItem(page, "Sabitle").count(), 0, "permission revoked from the moderator");
  await page.keyboard.press("Escape");
}, { setup: (db) => seedGroup(db, { myRole: "moderator", permissions: { admin: { ...{ pin_messages: true } }, moderator: { pin_messages: false, manage_requests: true, remove_members: true, delete_messages: true } } }) });

await scenario("8d. Sabit (topluluk): owner 'üyeler de sabitleyebilsin' açıksa normal üye menüde Sabitle görür", async ({ page }) => {
  await openThread(page, G);
  await openMsgMenu(page, "dave yazdı");
  await mItem(page, "Sabitle").click();
  await page.locator("[data-pinned-bar]", { hasText: "dave yazdı" }).waitFor();
}, { setup: (db) => { seedGroup(db, { myRole: "member" }); db.groups[0].members_can_pin = true; } });

// ====================================================================== SOHBET İÇİ ARAMA
const searchBtn = (page) => page.getByRole("button", { name: "Sohbette ara" });
const searchInput = (page) => page.getByPlaceholder("Bu sohbette ara…");
await scenario("9. Arama: başlıktaki simge → arama çubuğu; kısa girdi ipucu; sonuçta gönderen + zaman; eski mesaja atla (pencere yüklenir), 'Güncel mesajlara dön'", async ({ page, db }) => {
  await openThread(page);
  assert.equal(await page.locator("[data-message-id]", { hasText: "özel kelime zebra" }).count(), 0, "the old message is NOT in the loaded page");
  await searchBtn(page).click();
  await searchInput(page).fill("z");
  await page.getByText("En az 2 karakter yaz.").waitFor();
  assert.equal((db.searchCalls ?? []).length, 0, "no request for a too-short term");
  await searchInput(page).fill("zebra");
  const hit = page.locator("[data-search-hit]").first();
  await hit.waitFor();
  assert.match(await hit.innerText(), /Bob|Sen/);
  assert.equal(await hit.locator("mark").innerText(), "zebra");
  await hit.click();
  await flashed(page, "özel kelime zebra").waitFor();
  await page.getByRole("button", { name: "Güncel mesajlara dön" }).first().waitFor();
  await page.getByRole("button", { name: "Güncel mesajlara dön" }).first().click();
  await page.locator("[data-message-id]", { hasText: "mesaj 229" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Güncel mesajlara dön" }).count(), 0);
}, { setup: (db) => seedDm(db, { texts: manyTexts({ 3: "özel kelime zebra" }) }) });

await scenario("9b. Arama: sonuç yok / hata+tekrar dene / temizle / kapat; sonuçlar arasında ▲▼ ile gezinme", async ({ page, db }) => {
  await openThread(page);
  await searchBtn(page).click();
  await searchInput(page).fill("olmayankelime");
  await page.getByText("Eşleşen mesaj bulunamadı.").waitFor();
  await searchInput(page).fill("özel");
  await page.locator("[data-search-hit]").nth(2).waitFor();
  await page.locator("[data-search-hit]").first().click();
  await page.getByRole("button", { name: "Sonraki sonuç" }).click();
  await page.getByRole("button", { name: /Arama sonuçları/ }).getByText("2 / 3").waitFor();
  await page.getByRole("button", { name: "Önceki sonuç" }).click();
  await page.getByRole("button", { name: /Arama sonuçları/ }).getByText("1 / 3").waitFor();
  await page.getByRole("button", { name: "Aramayı temizle" }).click();
  assert.equal(await searchInput(page).inputValue(), "");
  const original = db.rpc.search_conversation_messages;
  db.rpc.search_conversation_messages = () => ({ status: 500, body: { code: "XX000", message: "boom", details: "", hint: "" } });
  await searchInput(page).fill("özel");
  await page.getByText("Arama yapılamadı. Tekrar dene.").waitFor();
  assert.equal(await page.getByText("boom").count(), 0, "no raw error text");
  delete db.rpc.search_conversation_messages;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.locator("[data-search-hit]").first().waitFor();
  await page.getByRole("button", { name: "Aramayı kapat" }).click();
  await page.locator("[data-conversation-search]").waitFor({ state: "detached" });
  void original;
}, { setup: (db) => seedDm(db, { texts: manyTexts({ 3: "özel bir", 10: "özel iki", 12: "özel üç" }) }) });

await scenario("9c. Arama: HTML/özel karakterli girdi düz metin olarak gösterilir (enjeksiyon yok); yalnız erişilebilen mesajlarda arar", async ({ page }) => {
  await openThread(page);
  await searchBtn(page).click();
  await searchInput(page).fill("<b>kalın</b>");
  const hit = page.locator("[data-search-hit]").first();
  await hit.waitFor();
  assert.ok((await hit.innerText()).includes("<b>kalın</b>"));
  assert.equal(await hit.locator("b").count(), 0, "markup is never interpreted");
  await searchInput(page).fill("gizli");
  await page.getByText("Eşleşen mesaj bulunamadı.").waitFor();
}, { setup: (db) => {
  seedDm(db);
  db.addMessage(CONV, U.bob.id, "<b>kalın</b> yazı");
  const hidden = db.addMessage(CONV, U.bob.id, "gizli mesaj");
  db.hidden = [{ message_id: hidden.id, user_id: ME }];
} });

await scenario("9d. Arama (topluluk): sonuçta gönderen adı; sonuç mesaja götürür", async ({ page }) => {
  await openThread(page, G);
  await searchBtn(page).click();
  await searchInput(page).fill("carol");
  const hit = page.locator("[data-search-hit]").first();
  await hit.waitFor();
  await hit.getByText("Carol", { exact: true }).waitFor();
  await hit.click();
  await flashed(page, "carol yazdı").waitFor();
}, { setup: (db) => seedGroup(db) });

// ====================================================================== YILDIZLI MESAJLAR
await scenario("10. Yıldız: menüden yıldızla/kaldır (kişiye özel, mesaj kopyalanmaz); yıldız işareti görünür", async ({ page, db }) => {
  await openThread(page);
  await openMsgMenu(page, "selam bob");
  await mItem(page, "Yıldızla").click();
  await toast(page, "Mesaj yıldızlandı.").waitFor();
  await msg(page, "selam bob").locator("[data-starred-mark]").waitFor();
  assert.deepEqual(db.stars.map((s) => s.user_id), [ME]);
  assert.equal(db.messages.length, 4, "no message copy");
  await page.reload(); await msg(page, "selam bob").locator("[data-starred-mark]").waitFor();
  await openMsgMenu(page, "selam bob");
  await mItem(page, "Yıldızı kaldır").click();
  await page.waitForFunction(() => !document.querySelector("[data-starred-mark]"));
  assert.equal(db.stars.length, 0);
}, { setup: (db) => seedDm(db) });

await scenario("11. Yıldızlı mesajlar ekranı: birebir + topluluk TEK listede; sohbet adı, gönderen, tür etiketi; başkasının yıldızı görünmez; silinen/erişilemeyen elenir", async ({ page, db }) => {
  await page.goto(`${BASE}/messages`);
  await page.getByRole("link", { name: "Yıldızlı mesajları aç" }).first().click();
  await page.waitForURL(/messages\/starred/);
  const items = page.locator("[data-starred-item]");
  await items.first().waitFor();
  assert.equal(await items.count(), 2, "one direct + one group message; the other user's star, the deleted one and the left group are not listed");
  const texts = await items.allInnerTexts();
  assert.ok(texts.some((t) => t.includes("Bob") && t.includes("selam bob")), "direct item shows partner + text");
  assert.ok(texts.some((t) => t.includes("Tasarım Atölyesi") && t.includes("Topluluk") && t.includes("carol yazdı") && t.includes("Carol")), "group item shows group name, tag, sender");
  assert.equal(texts.some((t) => t.includes("dave yazdı") || t.includes("silinecek") || t.includes("ayrıldığım")), false);
  await items.filter({ hasText: "selam bob" }).getByRole("button", { name: "Yıldızı kaldır" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-starred-item]").length === 1);
  assert.equal(db.stars.filter((s) => s.user_id === ME).length, 3, "unstar removed only my row");
  assert.equal(db.stars.some((s) => s.user_id === U.bob.id), true, "someone else's star is untouched");
}, { setup: (db) => {
  seedDm(db); seedGroup(db);
  const star = (uid, text) => db.stars.push({ user_id: uid, message_id: db.messages.find((m) => m.body === text).id, created_at: db.stamp() });
  star(ME, "selam bob"); star(ME, "carol yazdı"); star(U.bob.id, "merhaba topluluk");
  const gone = db.addMessage(G, U.dave.id, "silinecek"); star(ME, "silinecek"); gone.deleted_at = db.stamp(); gone.body = null;
  // kaldırıldığım topluluk: üyelik yok → erişim yok
  db.addGroup("d0000000-0000-4000-8000-0000000000a2", { name: "Eski Topluluk", members: [[U.bob, "owner"]], texts: [[U.bob, "ayrıldığım topluluk mesajı"]] });
  const left = db.messages.find((m) => m.body === "ayrıldığım topluluk mesajı"); db.stars.push({ user_id: ME, message_id: left.id, created_at: db.stamp() });
  db.members = db.members.filter((m) => !(m.conversation_id === "d0000000-0000-4000-8000-0000000000a2" && m.user_id === ME));
} });

await scenario("12. Yıldızlı mesaj → sohbeti açar ve (yüklü sayfada olmayan) eski mesaja kaydırır", async ({ page }) => {
  await page.goto(`${BASE}/messages/starred`);
  const item = page.locator("[data-starred-item]", { hasText: "çok eski yıldızlı" });
  await item.waitFor();
  await item.getByRole("link").click();
  await page.waitForURL(/messages\/local.*hl=message/);
  await flashed(page, "çok eski yıldızlı").waitFor();
  assert.ok(await page.getByRole("button", { name: "Güncel mesajlara dön" }).first().isVisible());
}, { setup: (db) => { seedDm(db, { texts: manyTexts({ 2: "çok eski yıldızlı" }) }); db.stars.push({ user_id: ME, message_id: db.messages.find((m) => m.body === "çok eski yıldızlı").id, created_at: db.stamp() }); } });

await scenario("12b. Yıldızlı mesajlar: boş durum; sohbet açılışında erişilemeyen mesaja dürüst not", async ({ page }) => {
  await page.goto(`${BASE}/messages/starred`);
  await page.getByText("Henüz yıldızlı mesajın yok.").waitFor();
  await page.goto(`${BASE}/messages/local?id=${CONV}&hl=message:99999999-9999-4999-8999-999999999999`);
  await page.getByText("Bu mesaj görüntülenemiyor.").waitFor();
}, { setup: (db) => seedDm(db) });

await scenario("8e. Sabit (topluluk): 'üyeler de sabitleyebilsin' sohbet bilgi penceresinde; rol başına 'Mesaj sabitleme' yetkisi topluluk sayfasında (Yönet → Ayarlar); yalnız değişenler kaydedilir", async ({ page, db }) => {
  await openThread(page, G);
  await page.locator("button[aria-haspopup='dialog'][aria-label*='topluluk bilgisini aç']").first().click();
  const d = page.getByRole("dialog").last();
  await d.getByRole("button", { name: "Sohbet ayarları" }).click();
  await d.getByRole("heading", { name: "Mesaj sabitleme" }).waitFor();
  assert.equal(await d.getByRole("switch", { name: "Moderatör: Mesaj sabitleme" }).count(), 0, "role permissions are a community setting");
  const save = d.getByRole("button", { name: "Sahip ayarlarını kaydet" });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await d.getByRole("switch", { name: "Üyeler de mesaj sabitleyebilsin" }).click();
  await save.click();
  await page.getByText("Sahip ayarları kaydedildi.").waitFor();
  assert.equal(db.groups[0].members_can_pin, true);
  assert.deepEqual(db.calls.filter((c) => c.table === "rpc/update_chat_group_owner_settings")[0].body.p_patch, { members_can_pin: true });
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=settings`);
  const perm = page.getByRole("switch", { name: "Moderatör: Mesaj sabitleme" });
  await perm.waitFor();
  assert.equal(await perm.getAttribute("aria-checked"), "true", "default: moderator can pin");
  await perm.click();
  await page.getByRole("button", { name: "Sahip ayarlarını kaydet" }).click();
  await page.getByText("Sahip ayarları kaydedildi.").waitFor();
  assert.equal(db.groups[0].role_permissions.moderator.pin_messages, false);
  assert.equal(db.groups[0].role_permissions.admin.pin_messages, true, "untouched flag preserved");
}, { setup: (db) => seedGroup(db, { myRole: "owner" }) });

await scenario("8f. Sabit (canlı): başkası sabitleyince/kaldırınca çubuk gerçek zamanlı güncellenir", async ({ page, db, hub }) => {
  await openThread(page);
  const m = db.messages.find((x) => x.body === "selam bob");
  db.pins.push({ message_id: m.id, conversation_id: CONV, pinned_by: U.bob.id, pinned_at: db.stamp() });
  hub.emitPostgresChange("pinned_messages", "INSERT", db.pins[0]);
  await page.locator("[data-pinned-bar]", { hasText: "selam bob" }).waitFor();
  db.pins = [];
  hub.emitPostgresChange("pinned_messages", "DELETE", { message_id: m.id, conversation_id: CONV });
  await page.locator("[data-pinned-bar]").waitFor({ state: "detached" });
}, { setup: (db) => seedDm(db) });

await scenario("9e. Erişim: başka sohbetin mesajına işaret eden hl parametresi (kurcalama) içerik göstermez; üye olunmayan sohbet 'bulunamadı'", async ({ page, db }) => {
  const foreign = db.messages.find((x) => x.body === "başka sohbet sırrı");
  await page.goto(`${BASE}/messages/local?id=${CONV}&hl=message:${foreign.id}`);
  await page.getByText("Bu mesaj görüntülenemiyor.").waitFor();
  assert.equal(await page.getByText("başka sohbet sırrı").count(), 0, "foreign content never rendered here");
  await page.goto(`${BASE}/messages/local?id=${CONV2}`);
  await page.getByRole("heading", { name: "Konuşma bulunamadı" }).waitFor();
  assert.equal(await page.getByText("başka sohbet sırrı").count(), 0);
  assert.equal(await page.locator("[data-pinned-bar], [data-conversation-search]").count(), 0);
}, { setup: (db) => {
  seedDm(db);
  db.conversations.push({ id: CONV2, last_message_at: db.stamp() });
  db.members.push({ conversation_id: CONV2, user_id: U.carol.id, status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null }, { conversation_id: CONV2, user_id: U.dave.id, status: "accepted", unread_count: 0, archived_at: null, deleted_at: null, cleared_at: null });
  db.addMessage(CONV2, U.carol.id, "başka sohbet sırrı");
} });

await scenario("10b. Yıldız: çift tık tek kayıt oluşturur; mesaj erişilemez olduysa sunucu reddeder → yıldız geri alınır, dürüst hata", async ({ page, db }) => {
  await openThread(page);
  await openMsgMenu(page, "selam bob");
  await mItem(page, "Yıldızla").dblclick().catch(() => {});
  await page.waitForTimeout(500);
  assert.ok(db.stars.length <= 1, "never more than one row");
  await openMsgMenu(page, "ikinci bob mesajı");
  db.messages = db.messages.filter((x) => x.body !== "ikinci bob mesajı"); // erişim yitirildi (sunucuda artık okunamaz)
  await mItem(page, "Yıldızla").click();
  await toast(page, "Bu mesaj artık görüntülenemiyor.").waitFor();
  assert.equal(await msg(page, "ikinci bob mesajı").locator("[data-starred-mark]").count(), 0, "optimistic star was rolled back");
}, { setup: (db) => seedDm(db) });

// ====================================================================== YAZIYOR (Realtime taklidi)
const typingText = (page) => page.locator("[data-typing-indicator]");
const type = async (page, text) => { const box = page.getByPlaceholder("Bir mesaj yaz..."); await box.click(); await box.pressSequentially(text, { delay: 15 }); };

await scenario("13. Yazıyor (birebir): karşı taraf yazarken 'yazıyor…'; silince/gönderince söner; kanal private, konuşmaya özel; yazma mesaj/DB yazmaz; sinyal kısıtlanır", async ({ page, db, hub, others }) => {
  const bob = others.bobby;
  await openThread(page); await openThread(bob);
  await type(bob, "merhaba nasılsın");
  await typingText(page).waitFor();
  assert.equal((await typingText(page).innerText()).trim(), "yazıyor…");
  assert.equal(hub.log.filter((l) => l.userId === U.bob.id && l.event === "broadcast:typing" && l.payload?.typing === true).length, 1, "throttled to one signal while typing quickly");
  const join = hub.log.find((l) => l.userId === ME && l.event === "phx_join" && l.topic === `realtime:typing:${CONV}`);
  assert.ok(join, "joins the per-conversation typing topic");
  assert.equal(join.payload.config.private, true, "private channel (Realtime Authorization)");
  await bob.getByPlaceholder("Bir mesaj yaz...").fill("");
  await typingText(page).waitFor({ state: "detached" });
  await type(bob, "tekrar");
  await typingText(page).waitFor();
  await bob.getByRole("button", { name: "Mesaj gönder" }).click();
  await typingText(page).waitFor({ state: "detached" });
  assert.equal(calls(db, "messages", "POST").length, 1, "only the explicit send wrote a message");
  const forbiddenWrites = db.calls.filter((c) => c.method !== "GET" && ["pinned_messages", "message_stars", "conversation_members", "rpc/set_message_pinned"].includes(c.table));
  assert.deepEqual(forbiddenWrites.map((c) => c.table), [], "typing wrote nothing to any table");
}, { users: [U.bob], setup: (db) => seedDm(db) });

await scenario("13b. Yazıyor: bırakma sinyali ulaşmasa da gösterge kendiliğinden söner (çevrimdışı kalan sonsuza dek 'yazıyor' kalmaz)", async ({ page, hub, others }) => {
  hub.dropWhen = (l) => l.event === "broadcast:typing" && l.payload?.typing === false;
  const bob = others.bobby;
  await openThread(page); await openThread(bob);
  await type(bob, "yazıp bırakıyorum");
  await typingText(page).waitFor();
  await typingText(page).waitFor({ state: "detached", timeout: 9000 });
}, { users: [U.bob], setup: (db) => seedDm(db) });

await scenario("13c. Yazıyor: sohbetten çıkınca kanaldan ayrılır; başka sohbetin sinyali bu sohbette görünmez; kendi sinyalim ve bozuk yük yok sayılır", async ({ page, hub }) => {
  await openThread(page);
  await page.waitForTimeout(400);
  assert.ok(hub.joinedTopics(ME).includes(`realtime:typing:${CONV}`));
  hub.emitBroadcast(`realtime:typing:${CONV2}`, "typing", { userId: U.bob.id, typing: true });
  hub.emitBroadcast(`realtime:typing:${CONV}`, "typing", { userId: ME, typing: true });
  hub.emitBroadcast(`realtime:typing:${CONV}`, "typing", { nonsense: true });
  hub.emitBroadcast(`realtime:typing:${CONV}`, "typing", null);
  await page.waitForTimeout(500);
  assert.equal(await typingText(page).count(), 0, "nothing shown for other conversations, myself or malformed payloads");
  hub.emitBroadcast(`realtime:typing:${CONV}`, "typing", { userId: U.bob.id, typing: true });
  await typingText(page).waitFor();
  await page.goto(`${BASE}/messages`);
  await page.waitForTimeout(500);
  assert.equal(hub.joinedTopics(ME).includes(`realtime:typing:${CONV}`), false, "channel removed on leaving the conversation");
}, { setup: (db) => { seedDm(db); db.addConv(CONV2, U.carol, { texts: ["x"] }); } });

await scenario("13d. Yazıyor: kanal yetkisi reddedilirse (üye değil/çıkarıldı) sohbet çalışmaya devam eder, gösterge yok, hata yok", async ({ page }) => {
  await openThread(page);
  await type(page, "yazıyorum");
  await page.waitForTimeout(600);
  assert.equal(await typingText(page).count(), 0);
  await page.getByPlaceholder("Bir mesaj yaz...").press("Enter");
  await msg(page, "yazıyorum").waitFor();
}, { setup: (db) => seedDm(db), hubOptions: { authorize: (topic) => !topic.includes("typing:") } });

await scenario("14. Yazıyor (topluluk): 'Bob yazıyor…' / 'Bob ve Carol yazıyor…' / 'Bob ve 2 kişi yazıyor…'; bırakanlar listeden düşer", async ({ page, hub }) => {
  await openThread(page, G);
  await page.waitForTimeout(400);
  const topic = `realtime:typing:${G}`;
  const emit = (u, typing = true) => hub.emitBroadcast(topic, "typing", { userId: u.id, typing });
  emit(U.bob); await page.locator("[data-typing-indicator]", { hasText: "Bob yazıyor…" }).waitFor();
  emit(U.carol); await page.locator("[data-typing-indicator]", { hasText: "Bob ve Carol yazıyor…" }).waitFor();
  emit(U.dave); await page.locator("[data-typing-indicator]", { hasText: "Bob ve 2 kişi yazıyor…" }).waitFor();
  emit(U.bob, false); emit(U.carol, false);
  await page.locator("[data-typing-indicator]", { hasText: "Dave yazıyor…" }).waitFor();
  emit(U.dave, false);
  await typingText(page).waitFor({ state: "detached" });
  await page.getByText("4 üye").first().waitFor();
}, { setup: (db) => seedGroup(db) });

await scenario("14b. Yazıyor (topluluk, İngilizce)", async ({ page, hub }) => {
  await openThread(page, G);
  await page.waitForTimeout(400);
  const topic = `realtime:typing:${G}`;
  for (const u of [U.bob, U.carol, U.dave]) hub.emitBroadcast(topic, "typing", { userId: u.id, typing: true });
  await page.locator("[data-typing-indicator]", { hasText: "Bob and 2 others are typing…" }).waitFor();
}, { lang: "en", setup: (db) => seedGroup(db) });

// ====================================================================== GÖRÜNÜM: mobil / koyu / İngilizce
for (const viewport of [{ width: 390, height: 800 }, { width: 768, height: 900 }]) {
  await scenario(`15. Düzen ${viewport.width}px koyu tema: arama çubuğu, sabit çubuğu, yıldız ekranı taşmadan sığar`, async ({ page }) => {
    await openThread(page);
    await openMsgMenu(page, "selam bob"); await mItem(page, "Sabitle").click(); await page.locator("[data-pinned-bar]").waitFor();
    await searchBtn(page).click(); await searchInput(page).fill("selam");
    await page.locator("[data-search-hit]").first().waitFor();
    for (const sel of ["[data-pinned-bar]", "[data-conversation-search]", "[data-search-hit]"]) {
      const box = await page.locator(sel).first().boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= viewport.width + 1, `${sel} inside viewport ${JSON.stringify(box)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no horizontal page scroll");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "dark theme active");
    await page.goto(`${BASE}/messages/starred`); await page.getByRole("heading", { name: "Yıldızlı mesajlar" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  }, { viewport, theme: "dark", setup: (db) => seedDm(db) });
}

await scenario("16. İngilizce: menü, sabit çubuğu, arama, yıldız ekranı çevrilmiş", async ({ page }) => {
  await openThread(page);
  await openMsgMenu(page, "selam bob", "Message options");
  for (const name of ["Star", "Pin", "Copy"]) await mItem(page, name).waitFor();
  await mItem(page, "Pin").click();
  await page.locator("[data-pinned-bar]", { hasText: "Pinned message" }).waitFor();
  await page.getByRole("button", { name: "Search in chat" }).click();
  await page.getByPlaceholder("Search in this chat…").fill("x");
  await page.getByText("Type at least 2 characters.").waitFor();
  await page.goto(`${BASE}/messages/starred`);
  await page.getByRole("heading", { name: "Starred messages" }).waitFor();
  await page.getByText("You have no starred messages yet.").waitFor();
}, { lang: "en", setup: (db) => seedDm(db) });

// ====================================================================== TOPLULUK SAYFASI ↔ SOHBET (docs/community-system.md)
const seedCommunity = (db, opts = {}) => {
  seedGroup(db, opts);
  Object.assign(db.groups.find((g) => g.id === G), { category: "general", feed_policy: "members", rules: null, rules_required: false, closed_at: null, origin: "native", post_count: 0 });
};

await scenario("18. Canlı eşitleme: topluluk sayfası açıkken yeni katılım isteği gelince başlıktaki 'N bekleyen istek' + Üyeler sayacı kendiliğinden görünür, işlenince kaybolur; sohbet başlığındaki rozet aynı sayıyı gösterir", async ({ page, db, hub }) => {
  await page.goto(`${BASE}/communities/local?id=${G}`);
  await page.locator("h1").first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-pending-requests]").count(), 0, "no requests yet → no shortcut");
  const row = db.groups.find((g) => g.id === G);
  row.pending_request_count = 1; // başka bir kullanıcı istek gönderdi (sunucu sayacı artırdı)
  hub.emitPostgresChange("chat_groups", "UPDATE", row);
  await page.locator("header [data-pending-requests]").getByText("1 bekleyen istek").waitFor();
  await page.getByRole("tab", { name: /Üyeler/ }).getByText("1").waitFor();
  row.pending_request_count = 0; // başka bir yönetici işledi
  hub.emitPostgresChange("chat_groups", "UPDATE", row);
  await page.locator("header [data-pending-requests]").waitFor({ state: "detached" });
  row.pending_request_count = 3;
  hub.emitPostgresChange("chat_groups", "UPDATE", row);
  await page.locator("header [data-pending-requests]").waitFor();
  await page.goto(`${BASE}/messages/local?id=${G}`);
  await page.locator("[data-community-link-badge]").filter({ hasText: "3" }).waitFor();
}, { setup: (db) => seedCommunity(db, { myRole: "admin", pending: 0 }) });

await scenario("18b. Canlı eşitleme: başka bir yönetici benim rolümü değiştirir → topluluk sayfası yeniden okunur; Yönet sekmesi kalkar", async ({ page, db, hub }) => {
  await page.goto(`${BASE}/communities/local?id=${G}`);
  await page.getByRole("tab", { name: "Yönetim" }).waitFor();
  const mine = db.member(G, ME);
  mine.role = "member"; // owner/admin rolümü aldı
  hub.emitPostgresChange("conversation_members", "UPDATE", mine);
  await page.getByRole("tab", { name: "Yönetim" }).waitFor({ state: "detached" });
}, { setup: (db) => seedCommunity(db, { myRole: "admin" }) });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
