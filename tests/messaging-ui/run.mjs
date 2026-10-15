import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";

const BASE = "http://localhost:4173/promptly";
const server = await serve(4173);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const CONV2 = "c0000000-0000-4000-8000-0000000000c2";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup } = {}) {
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/mfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const T = { newChatBtn: "Yeni sohbet başlat" };
const plus = (page) => page.locator(`button[aria-label="${T.newChatBtn}"]:visible`);
const dlg = (page) => page.getByRole("dialog");
const openList = async (page) => { await page.goto(`${BASE}/messages`); await plus(page).first().waitFor(); await page.waitForTimeout(300); };
const openThread = async (page, id = CONV) => { await page.goto(`${BASE}/messages/local?id=${id}`); await page.locator("button[aria-label='Profil seçenekleri']").waitFor(); await page.waitForTimeout(300); };
const menu = async (page) => { await page.locator("button[aria-label='Profil seçenekleri']").click(); };
const menuItem = (page, name) => page.getByRole("menuitem", { name, exact: true });
const names = async (page, section) => dlg(page).locator(`section[aria-label="${section}"] li span.font-semibold`).allInnerTexts();
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const visibleRowNames = async (page) => page.locator("a[href*='/messages/local'][href*='id=']:visible span.font-semibold").allInnerTexts();
const bubbleTexts = async (page) => (await page.locator("[data-message-id]").allInnerTexts()).map((t) => t.split("\n")[0]);
const seedBob = (db, opts = {}) => db.addConv(CONV, U.bob, { texts: ["merhaba", "selam", "nasılsın"], ...opts });

// 1
await scenario("1. Sohbet yokken boş durum 'Sohbet başlat' gösterir ve aynı modalı açar", async ({ page }) => {
  await openList(page);
  await page.locator("p:visible", { hasText: "Henüz sohbetin yok" }).waitFor();
  const btn = page.locator("button:visible", { hasText: "Sohbet başlat" });
  assert.match(await btn.getAttribute("class"), /bg-primary/);
  await btn.click();
  await dlg(page).getByRole("heading", { name: "Yeni sohbet" }).waitFor();
});

// 2
await scenario("2. Sohbetler varken de '+' görünür ve aynı modalı açar", async ({ page }) => {
  await openList(page);
  assert.ok(await plus(page).first().isVisible());
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
  await plus(page).first().click();
  await dlg(page).getByRole("heading", { name: "Yeni sohbet" }).waitFor();
}, { setup: (db) => seedBob(db) });

// 3
await scenario("3. 'Takip ettiklerim': mevcut sohbeti olan önce, sonra alfabetik", async ({ page }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).locator("section[aria-label='Takip ettiklerim'] li").first().waitFor();
  assert.deepEqual(await names(page, "Takip ettiklerim"), ["Bob", "Amy", "Zed"]);
}, { setup: (db) => { seedBob(db); db.follow(U.alice, U.zed); db.follow(U.alice, U.amy); db.follow(U.alice, U.bob); } });

// 4
await scenario("4. 'Etkileşimde bulunduklarım': tekrar yok, takip ettiklerim ayrı kalır", async ({ page }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).locator("section[aria-label='Etkileşimde bulunduklarım'] li").first().waitFor();
  const followed = await names(page, "Takip ettiklerim");
  const inter = await names(page, "Etkileşimde bulunduklarım");
  assert.deepEqual(followed, ["Bob"]);
  assert.deepEqual(inter, ["Carol", "Dave"]);
  assert.equal(new Set([...followed, ...inter]).size, followed.length + inter.length);
}, { setup: (db) => { seedBob(db); db.addConv(CONV2, U.carol, { texts: ["hey"] }); db.follow(U.alice, U.bob); db.follow(U.dave, U.alice); db.follow(U.bob, U.alice); } });

// 5
await scenario("5. Arama takip edilmeyen kullanıcıyı bulur; e-posta/telefon istenmez; sonuç yoksa durum gösterilir", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("erin");
  await dlg(page).locator("section[aria-label='Arama sonuçları'] li", { hasText: "Erin" }).waitFor();
  assert.ok(db.searchSelects.length > 0 && db.searchSelects.every((s) => !/email|phone/i.test(s)), "profile selects never ask for email/phone");
  assert.equal(await dlg(page).getByText("alice", { exact: false }).count(), 0, "self is not offered");
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("zzzz");
  await dlg(page).getByText("Eşleşen kullanıcı bulunamadı.").waitFor();
});

// 6
await scenario("6. Mevcut sohbeti olan kişi seçilince o sohbet açılır, yenisi oluşmaz", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).locator("section[aria-label='Takip ettiklerim'] li", { hasText: "Bob" }).click();
  await page.waitForURL(new RegExp(`messages/local/?\\?id=${CONV}`));
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
  assert.equal(db.conversations.length, 1);
}, { setup: (db) => { seedBob(db); db.follow(U.alice, U.bob); } });

// 7
await scenario("7. Modal kapatılınca ve taslaktan çıkılınca boş sohbet oluşmaz; ilk mesajla oluşur", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).getByRole("button", { name: "Kapat" }).click();
  await dlg(page).waitFor({ state: "detached" });
  assert.equal(db.conversations.length, 0);
  await plus(page).first().click();
  await dlg(page).locator("section[aria-label='Takip ettiklerim'] li", { hasText: "Amy" }).click();
  await page.waitForURL(new RegExp(`messages/local/?\\?to=${U.amy.id}`));
  await page.getByText("Sohbet, ilk mesajını gönderdiğinde başlar.").waitFor();
  assert.equal(db.conversations.length, 0); assert.equal(db.members.length, 0);
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
  await page.goto(`${BASE}/messages`); await plus(page).first().waitFor();
  assert.equal(db.conversations.length, 0);
  // now actually send a first message
  await page.goto(`${BASE}/messages/local?to=${U.amy.id}`);
  const box = page.getByPlaceholder("Bir mesaj yaz...");
  await box.waitFor();
  await box.fill("ilk mesaj");
  await page.getByRole("button", { name: "Mesaj gönder" }).click();
  await page.waitForURL(/messages\/local\/?\?id=/);
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 1);
  assert.equal(calls(db, "messages", "POST").length, 1);
  assert.equal(db.conversations.length, 1);
  assert.equal(db.member(db.conversations[0].id, U.amy.id).status, "pending", "recipient gets a message request (amy doesn't follow alice)");
}, { setup: (db) => db.follow(U.alice, U.amy) });

// 8
await scenario("8. Arşivle yalnızca kendi listeni etkiler; Arşivlenenler'de görünür", async ({ page, db }) => {
  await openThread(page);
  await menu(page);
  await menuItem(page, "Arşivle").click();
  await page.getByText("Sohbet arşivlendi.").waitFor();
  assert.ok(db.member(CONV, ME).archived_at);
  const bobRow = db.member(CONV, U.bob.id);
  assert.deepEqual([bobRow.archived_at, bobRow.deleted_at, bobRow.cleared_at], [null, null, null]);
  assert.equal(db.messages.length, 3);
  await menu(page); await menuItem(page, "Arşivden çıkar").waitFor(); await page.keyboard.press("Escape");
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), [], "gone from inbox");
  await page.locator("button:visible", { hasText: "Arşivlenenler" }).first().click();
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
}, { setup: (db) => seedBob(db) });

// 9
await scenario("9. Arşivden çıkar sohbeti gelen kutusuna döndürür", async ({ page, db }) => {
  await openList(page);
  await page.locator("button:visible", { hasText: "Arşivlenenler" }).first().click();
  await page.locator("button[aria-label='Arşivden çıkar: Bob']:visible").click();
  await page.getByText("Arşivlenmiş sohbetin yok.").waitFor();
  assert.equal(db.member(CONV, ME).archived_at, null);
  await page.locator("button[aria-label='Sohbetlere dön']:visible").click();
  await page.waitForTimeout(200);
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
}, { setup: (db) => seedBob(db, { my: { archived_at: "2026-06-02T00:00:00Z" } }) });

// 9b
await scenario("9b. Arşivdeki sohbette yeni mesaj gelince gelen kutusuna döner", async ({ page, db }) => {
  db.addMessage(CONV, U.bob.id, "yeni mesaj"); // server trigger un-archives
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
  assert.equal(db.member(CONV, ME).archived_at, null);
}, { setup: (db) => seedBob(db, { my: { archived_at: "2026-06-02T00:00:00Z" } }) });

// 10
await scenario("10. Sohbeti sil: yalnızca kendi listen; karşı taraf ve mesajlar silinmez; onay metni dürüst", async ({ page, db }) => {
  await openThread(page);
  await menu(page);
  await menuItem(page, "Sohbeti sil").click();
  const d = dlg(page);
  await d.getByText("Karşı tarafın sohbeti ve mesajları silinmeyecek", { exact: false }).waitFor();
  await d.getByRole("button", { name: "Sohbeti sil" }).click();
  await page.getByText("Sohbet listenden kaldırıldı.").waitFor();
  const mine = db.member(CONV, ME), theirs = db.member(CONV, U.bob.id);
  assert.ok(mine.deleted_at && mine.cleared_at);
  assert.deepEqual([theirs.archived_at, theirs.deleted_at, theirs.cleared_at, theirs.status], [null, null, null, "accepted"]);
  assert.equal(db.messages.length, 3); assert.equal(db.conversations.length, 1); assert.equal(db.members.length, 2);
  assert.equal(calls(db, "conversation_members", "DELETE").length, 0, "no membership row is deleted");
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), []);
  await page.locator("p:visible", { hasText: "Henüz sohbetin yok" }).waitFor();
  // a new message brings it back, showing only the new message
  db.addMessage(CONV, U.bob.id, "geri döndüm");
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
  await openThread(page);
  assert.deepEqual(await bubbleTexts(page), ["geri döndüm"], "only the new message; old history stays hidden");
}, { setup: (db) => seedBob(db) });

// 11
await scenario("11. Mesajları temizle yalnızca kendi görünümünü etkiler; ortak mesajlar durur", async ({ page, db }) => {
  await openThread(page);
  assert.ok((await bubbleTexts(page)).includes("nasılsın"));
  await menu(page);
  await menuItem(page, "Mesajları temizle").click();
  await dlg(page).getByText("Karşı tarafın mesajları silinmeyecek", { exact: false }).waitFor();
  await dlg(page).getByRole("button", { name: "Mesajları temizle" }).click();
  await page.getByText("Mesaj geçmişi senin görünümünden temizlendi.").waitFor();
  assert.deepEqual(await bubbleTexts(page), []);
  const mine = db.member(CONV, ME), theirs = db.member(CONV, U.bob.id);
  assert.equal(mine.cleared_at, db.messages[2].created_at, "clear moment = newest server message time");
  assert.equal(theirs.cleared_at, null);
  assert.equal(db.messages.length, 3);
  assert.equal(mine.deleted_at, null); assert.equal(db.members.length, 2);
  await page.reload(); await page.locator("button[aria-label='Profil seçenekleri']").waitFor(); await page.waitForTimeout(300);
  assert.deepEqual(await bubbleTexts(page), [], "still cleared after reload");
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), ["Bob"], "chat stays in the list");
  assert.equal(await page.locator("a[href*='/messages/local'][href*='id=']:visible", { hasText: "Henüz mesaj yok." }).count(), 1);
  db.addMessage(CONV, U.bob.id, "temizlikten sonra");
  await openThread(page);
  assert.deepEqual(await bubbleTexts(page), ["temizlikten sonra"]);
}, { setup: (db) => seedBob(db) });

// 12
await scenario("12a. Engellediğin kişi listede yok; aramada seçince engelleme mesajı, sohbet açılmaz", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).locator("section li").first().waitFor();
  assert.ok(!(await dlg(page).innerText()).includes("Iblocked"), "blocked person not in default lists");
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("iblocked");
  await dlg(page).locator("section[aria-label='Arama sonuçları'] li", { hasText: "Iblocked" }).click();
  await dlg(page).getByText("Bu kullanıcıyı engelledin, mesaj gönderemezsin.").waitFor();
  assert.match(page.url(), /\/messages\/?$/);
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
}, { setup: (db) => { db.blocks.push({ blocker_id: ME, blocked_id: U.iblocked.id }); db.follow(U.alice, U.iblocked); db.follow(U.alice, U.amy); } });

await scenario("12b. Seni engelleyene mesaj başlatılamaz (genel mesaj, sebep söylenmez); sunucu da reddeder", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("blockedby");
  await dlg(page).locator("section[aria-label='Arama sonuçları'] li", { hasText: "Blockedby" }).click();
  await dlg(page).getByText("Bu kullanıcıya şu anda mesaj gönderemezsin.").waitFor();
  assert.match(page.url(), /\/messages\/?$/);
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
  // typed URL: same generic notice, still nothing created
  await page.goto(`${BASE}/messages/local?to=${U.blockedme.id}`);
  await page.getByText("Bu kullanıcıya şu anda mesaj gönderemezsin.").waitFor();
  assert.equal(db.conversations.length, 0);
  // and the server itself refuses even if the UI were bypassed
  const r = await page.evaluate(async (id) => {
    const res = await fetch("https://example.supabase.co/rest/v1/rpc/start_direct_conversation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ other_user_id: id }) });
    return res.status;
  }, U.blockedme.id);
  assert.equal(r, 400);
  assert.equal(db.conversations.length, 0);
}, { setup: (db) => { db.blocks.push({ blocker_id: U.blockedme.id, blocked_id: ME }); db.follow(U.alice, U.blockedme); } });

await scenario("12c. Var olan sohbette karşı taraf engellediyse gönderim reddedilir, mesaj eklenmez", async ({ page, db }) => {
  await openThread(page);
  await page.getByPlaceholder("Bir mesaj yaz...").fill("deneme");
  await page.getByRole("button", { name: "Mesaj gönder" }).click();
  await page.getByText("Kullanıcı seni engellemiş olabilir", { exact: false }).waitFor();
  assert.equal(db.messages.length, 3);
}, { setup: (db) => { seedBob(db); db.blocks.push({ blocker_id: U.bob.id, blocked_id: ME }); } });

// 13
await scenario("13. Gizlilik: 'yalnızca takip ettiklerimden' kullanıcı listede yok, seçilemez; takip edince yazılabilir", async ({ page, db }) => {
  await openList(page);
  await plus(page).first().click();
  await dlg(page).locator("section[aria-label='Takip ettiklerim'] li", { hasText: "Amy" }).waitFor();
  assert.ok(!(await dlg(page).innerText()).includes("Locked"), "unreachable person is not offered in default lists");
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("locked");
  await dlg(page).locator("section[aria-label='Arama sonuçları'] li", { hasText: "@locked" }).click();
  const generic = await dlg(page).getByText("Bu kullanıcıya şu anda mesaj gönderemezsin.").innerText();
  assert.ok(!/gizli|takip|privacy|block|engel/i.test(generic), "message does not reveal why");
  assert.equal(calls(db, "rpc/start_direct_conversation").length, 0);
  // once locked follows alice, the same pick goes through
  db.follow(U.locked, U.alice);
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("lock");
  await dlg(page).locator("section[aria-label='Arama sonuçları'] li", { hasText: "@locked" }).click();
  await page.waitForURL(new RegExp(`messages/local/?\\?to=${U.locked.id}`));
}, { setup: (db) => { db.follow(U.alice, U.locked); db.follow(U.alice, U.amy); } });

// 14
await scenario("14a. Mesaj isteği: ayrı bölümde, sohbet menüsü yok, Kabul Et çalışır", async ({ page, db }) => {
  await openList(page);
  await page.locator("h2:visible", { hasText: "Mesaj İstekleri" }).waitFor();
  await openThread(page, CONV2);
  await page.getByText("Bu bir mesaj isteği", { exact: false }).waitFor();
  await menu(page);
  assert.equal(await menuItem(page, "Arşivle").count(), 0);
  assert.equal(await menuItem(page, "Sohbeti sil").count(), 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Kabul Et" }).click();
  await page.waitForTimeout(300);
  assert.equal(db.member(CONV2, ME).status, "accepted");
}, { setup: (db) => db.addConv(CONV2, U.carol, { status: "pending", texts: ["selam"] }) });

await scenario("14b. Mesaj isteği: Sil kendi üyeliğini kaldırır (eski akış bozulmadı)", async ({ page, db }) => {
  await openThread(page, CONV2);
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await page.waitForURL(/\/messages\/?$/);
  assert.equal(db.member(CONV2, ME), undefined);
  assert.ok(db.member(CONV2, U.carol.id), "the sender's side is untouched");
  assert.equal(db.messages.length, 1);
}, { setup: (db) => db.addConv(CONV2, U.carol, { status: "pending", texts: ["selam"] }) });

// 15
await scenario("15a. Arşiv isteği başarısız olursa başarı mesajı yok, durum değişmez", async ({ page, db }) => {
  db.failMemberPatch = true;
  await openThread(page);
  await menu(page);
  await menuItem(page, "Arşivle").click();
  await page.getByText("İşlem tamamlanamadı", { exact: false }).waitFor();
  assert.equal(await page.getByText("Sohbet arşivlendi.").count(), 0);
  assert.equal(db.member(CONV, ME).archived_at, null);
  await menu(page); await menuItem(page, "Arşivle").waitFor();
  await page.keyboard.press("Escape");
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
}, { setup: (db) => seedBob(db) });

await scenario("15b. Silme başarısızsa onay penceresi hata gösterir, sohbet listede kalır", async ({ page, db }) => {
  db.failMemberPatch = true;
  await openThread(page);
  await menu(page);
  await menuItem(page, "Sohbeti sil").click();
  await dlg(page).getByRole("button", { name: "Sohbeti sil" }).click();
  await dlg(page).getByRole("alert").waitFor();
  assert.equal(await page.getByText("Sohbet listenden kaldırıldı.").count(), 0);
  assert.equal(db.member(CONV, ME).deleted_at, null);
  await dlg(page).getByRole("button", { name: "Vazgeç" }).click();
  await openList(page);
  assert.deepEqual(await visibleRowNames(page), ["Bob"]);
}, { setup: (db) => seedBob(db) });

await scenario("15c. Çift tıklama tek istek gönderir (eşzamanlı işlem koruması)", async ({ page, db }) => {
  db.patchDelayMs = 500;
  await openThread(page);
  await menu(page);
  await menuItem(page, "Mesajları temizle").click();
  const confirm = dlg(page).getByRole("button", { name: "Mesajları temizle" });
  await confirm.click();
  await confirm.click({ force: true, timeout: 500 }).catch(() => {});
  await page.getByText("Mesaj geçmişi senin görünümünden temizlendi.").waitFor();
  assert.equal(calls(db, "conversation_members", "PATCH").length, 1);
}, { setup: (db) => seedBob(db) });

// 16
for (const [label, viewport] of [["mobil 390x800", { width: 390, height: 800 }], ["masaüstü 1280x900", { width: 1280, height: 900 }]]) {
  await scenario(`16. Yeni sohbet modalı ${label}`, async ({ page }) => {
    await openList(page);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollW <= viewport.width, `no horizontal scroll (${scrollW})`);
    const pb = await plus(page).first().boundingBox();
    assert.ok(pb && pb.x >= 0 && pb.x + pb.width <= viewport.width && pb.width >= 36 && pb.height >= 36, "+ visible, touch-sized, in viewport");
    await plus(page).first().click();
    const d = dlg(page);
    await d.getByRole("heading", { name: "Yeni sohbet" }).waitFor();
    await d.locator("section li").first().waitFor();
    await page.waitForTimeout(500);
    const box = await d.locator("div.flex.max-h-\\[85vh\\]").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.y >= 0 && box.y + box.height <= viewport.height + 1, `panel inside viewport ${JSON.stringify(box)}`);
    if (viewport.width < 640) assert.ok(Math.abs(box.y + box.height - viewport.height) < 2, "docked as a bottom sheet on phones");
    await d.getByPlaceholder("Kullanıcı adı veya isimle ara").fill("am");
    await d.locator("section[aria-label='Arama sonuçları'] li", { hasText: "Amy" }).click();
    await page.waitForURL(new RegExp(`messages/local/?\\?to=${U.amy.id}`));
    await page.getByPlaceholder("Bir mesaj yaz...").waitFor();
  }, { viewport, setup: (db) => { seedBob(db); db.follow(U.alice, U.bob); } });
}

await scenario("17. İngilizce: menü, modal ve boş durum çevrilmiş", async ({ page, context }) => {
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "en"); } catch {} });
  await page.goto(`${BASE}/messages`);
  await page.locator("p:visible", { hasText: "You have no chats yet" }).waitFor();
  await page.locator("button:visible", { hasText: "Start a chat" }).click();
  await dlg(page).getByRole("heading", { name: "New chat" }).waitFor();
  await dlg(page).getByPlaceholder("Search by username or name").waitFor();
});

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
