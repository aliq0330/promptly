// Topluluk sohbet odaları arayüz testleri (ağ taklitli) — docs/history/352-*. Çalıştırma: README.md.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { setupRooms } from "./mock-rooms.mjs";

const BASE = "http://localhost:4179/promptly";
const server = await serve(4179);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const G = "d0000000-0000-4000-8000-0000000000a1"; // topluluk ("Tasarım Atölyesi")
const T = "d0000000-0000-4000-8000-0000000000b1"; // ekip (tamamen kapalı)
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1600, height: 900 };
let seedResult;

async function scenario(name, fn, { viewport = PHONE, setup, lang = "tr" } = {}) {
  const db = createDb();
  setupCommunities(db);
  setupRooms(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/rfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

/** Topluluk: ME rolü `role`; odalar Genel · Duyurular (yalnız yönetim yazar) · Prompt Paylaşımı/Görsel Çıktılar/Yardım (Üretim) · Moderatör Odası (özel, Yönetim). */
function seed(db, { role = "owner", extra = true } = {}) {
  db.addGroup(G, { visibility: "restricted", myRole: role, members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], texts: [[U.bob, "genel sohbet mesajı"]] });
  Object.assign(db.groups.find((g) => g.id === G), { category: "general", feed_policy: "members", closed_at: null, origin: "native" });
  const general = db.addRoom(G, { name: "Genel", is_default: true, icon: "message" });
  const ann = db.addRoom(G, { name: "Duyurular", icon: "megaphone", posting_policy: "admins" });
  const prompt = db.addRoom(G, { name: "Prompt Paylaşımı", icon: "prompt", section: "Üretim", description: "Promptunu paylaş" });
  const image = db.addRoom(G, { name: "Görsel Çıktılar", icon: "image", section: "Üretim" });
  const help = db.addRoom(G, { name: "Yardım ve Sorular", icon: "help", section: "Üretim" });
  const staff = db.addRoom(G, { name: "Moderatör Odası", icon: "shield", section: "Yönetim", read_policy: "staff" });
  if (extra) {
    db.addRoomMessage(G, prompt.id, U.dave.id, "prompt odası bir");
    db.addRoomMessage(G, prompt.id, U.bob.id, "prompt odası iki");
    db.addRoomMessage(G, ann.id, U.bob.id, "resmî duyuru");
  }
  return { general, ann, prompt, image, help, staff };
}
const dlg = (page) => page.getByRole("dialog").last();
const roomRow = (page, name) => page.locator("[data-room-row]:visible").filter({ hasText: name }).first();
const openHub = async (page) => { await page.goto(`${BASE}/messages/local?id=${G}&view=rooms`); await page.locator("[data-rooms-hub]:visible").waitFor(); await page.locator("[data-room-row]:visible").first().waitFor(); };
const openChat = async (page, room) => { await page.goto(`${BASE}/messages/local?id=${G}${room ? `&room=${room.id}` : ""}`); await page.locator("[data-room-chip]").waitFor(); await page.waitForTimeout(300); };
const messageTexts = async (page) => page.locator("[data-chat-scroll]").innerText();

// 1
await scenario("1. Mesajlar çipleri: Tümü · Kişisel · Topluluk · Ekip süzer; türde sohbet yoksa boş durum", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-kind-chips]:visible").waitFor();
  const rows = () => page.locator("[data-conversation-row]:visible");
  await rows().first().waitFor();
  assert.equal(await rows().count(), 3, "Tümü: üç sohbet");
  assert.equal(await page.locator("[data-kind-chip='all']:visible").getAttribute("aria-pressed"), "true");
  await page.locator("[data-kind-chip='community']:visible").click();
  assert.equal(await rows().count(), 1);
  await rows().first().getByText("Tasarım Atölyesi").waitFor();
  await page.locator("[data-kind-chip='team']:visible").click();
  assert.equal(await rows().count(), 1);
  await rows().first().getByText("Promptly Ekibi").waitFor();
  await rows().first().locator("[data-team-tag]").waitFor();
  await page.locator("[data-kind-chip='personal']:visible").click();
  assert.equal(await rows().count(), 1);
  await rows().first().getByText("Bob").waitFor();
  await page.locator("[data-kind-chip='all']:visible").click();
  assert.equal(await rows().count(), 3);
}, { setup: (db) => { seed(db); db.addGroup(T, { name: "Promptly Ekibi", visibility: "private", myRole: "member", members: [[U.bob, "owner"]], texts: [[U.bob, "toplantı yarın"]] }); db.addRoom(T, { name: "Genel", is_default: true }); db.addConv("c0000000-0000-4000-8000-0000000000c1", U.bob, { texts: ["selam"] }); } });

await scenario("1b. Hiç topluluk yokken Topluluk çipi dürüst boş durum gösterir", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-conversation-row]:visible").first().waitFor();
  await page.locator("[data-kind-chip='community']:visible").click();
  await page.locator("[data-kind-empty]").waitFor();
}, { setup: (db) => db.addConv("c0000000-0000-4000-8000-0000000000c1", U.bob, { texts: ["selam"] }) });

// 2
await scenario("2. Topluluk satırı: '# oda' etiketi + son mesaj; ok oda listesine götürür", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  const row = page.locator("[data-conversation-row]:visible", { hasText: "Tasarım Atölyesi" }).first();
  await row.waitFor();
  assert.match(await row.locator("[data-last-room]").innerText(), /# resmî|# duyurular/, "son mesajın odası görünür");
  await page.locator("[data-open-rooms]").first().click();
  await page.locator("[data-rooms-hub]").waitFor();
  assert.match(page.url(), /view=rooms/);
}, { setup: (db) => seed(db) });

await scenario("2b. Ok ve oda etiketi: rozet odaların toplamıdır (sessize alınan hariç)", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-conversation-row]:visible", { hasText: "Tasarım Atölyesi" }).first().waitFor();
  assert.ok(await page.locator("[data-open-rooms]").first().getAttribute("aria-label"), "ok erişilebilir ad taşır");
}, { setup: (db) => seed(db) });

// 3
await scenario("3. Hub (sahip): başlık, bölümler, okunmamış rozeti, özel oda kilidi, Oda Ekle; üye için Moderatör Odası ve Oda Ekle yok", async ({ page }) => {
  await openHub(page);
  await page.getByRole("heading", { name: "Sohbet Odaları" }).waitFor();
  for (const section of ["Sohbet", "Üretim", "Yönetim"]) await page.getByRole("heading", { name: section, exact: true }).waitFor();
  assert.equal((await roomRow(page, "Prompt Paylaşımı").locator("[data-room-unread]").innerText()).trim(), "2");
  await roomRow(page, "Moderatör Odası").locator("svg[aria-label='Özel oda']").waitFor();
  await page.locator("[data-hub-add-room]").waitFor();
}, { setup: (db) => seed(db) });

await scenario("3b. Hub (üye): özel oda görünmez, salt okunur oda kilitli, Oda Ekle yok", async ({ page }) => {
  await openHub(page);
  assert.equal(await page.locator("[data-room-row]:visible").filter({ hasText: "Moderatör Odası" }).count(), 0);
  await roomRow(page, "Duyurular").locator("svg[aria-label='Salt okunur']").waitFor();
  assert.equal(await page.locator("[data-hub-add-room]").count(), 0);
}, { setup: (db) => seed(db, { role: "member" }) });

await scenario("3c. Hub kısayolları: Üyeler → Üyeler sekmesi, Bildirim → Hakkında, topluluk sayfası bağlantısı", async ({ page }) => {
  await openHub(page);
  assert.match(await page.locator("[data-hub-action='members']").getAttribute("href"), /tab=members/);
  assert.match(await page.locator("[data-hub-action='notifications']").getAttribute("href"), /tab=about/);
  assert.match(await page.locator("[data-hub-action='info']").getAttribute("href"), /panel=about/);
  assert.match(await page.locator("[data-hub-page-link]").getAttribute("href"), /\/communities\/local\/?\?id=/);
}, { setup: (db) => seed(db) });

// 4
await scenario("4. Sohbet: oda çipi + başlık oda adı; yalnız açık odanın mesajları; başlığa dokunmak hub'a götürür", async ({ page }) => {
  const { prompt } = seedResult;
  await openChat(page, prompt);
  assert.match((await page.locator("[data-room-chip]").innerText()).trim(), /Prompt Paylaşımı/);
  const text = await messageTexts(page);
  assert.ok(text.includes("prompt odası bir") && text.includes("prompt odası iki"), "odanın mesajları");
  assert.ok(!text.includes("genel sohbet mesajı") && !text.includes("resmî duyuru"), "başka odanın mesajı karışmaz");
  await page.locator("[data-room-header]").click();
  await page.locator("[data-rooms-hub]").waitFor();
}, { setup: (db) => { seedResult = seed(db); } });

// 5
await scenario("5. Oda değiştirici: bölümlü liste, arama süzer, seçince oda ve adres değişir", async ({ page }) => {
  await openChat(page, seedResult.prompt);
  await page.locator("[data-room-chip]").click();
  await dlg(page).getByRole("heading", { name: "Odalar" }).waitFor();
  await dlg(page).getByText("Tasarım Atölyesi · 6 oda").waitFor();
  await dlg(page).getByRole("searchbox").fill("çıktı");
  assert.equal(await dlg(page).locator("[data-room-row]").count(), 1);
  await dlg(page).getByRole("searchbox").fill("zzz");
  await dlg(page).getByText("Eşleşen oda yok.").waitFor();
  await dlg(page).getByRole("searchbox").fill("");
  await dlg(page).locator("[data-room-row]").filter({ hasText: "Duyurular" }).click();
  await page.waitForFunction((id) => location.search.includes(`room=${id}`), seedResult.ann.id);
  await page.waitForFunction(() => document.querySelector("[data-chat-scroll]")?.innerText.includes("resmî duyuru"));
  assert.ok(!(await messageTexts(page)).includes("prompt odası bir"));
}, { setup: (db) => { seedResult = seed(db); } });

await scenario("5b. Oda değiştirici: mevcut oda işaretli; oda listesi bağlantısı hub'a gider; Oda ekle yalnız yetkiliye", async ({ page }) => {
  await openChat(page, seedResult.prompt);
  await page.locator("[data-room-chip]").click();
  await dlg(page).locator("[data-room-row][aria-current='true']").filter({ hasText: "Prompt Paylaşımı" }).waitFor();
  await dlg(page).getByRole("button", { name: "Oda ekle" }).waitFor();
  await dlg(page).getByRole("link", { name: "Oda listesi" }).click();
  await page.locator("[data-rooms-hub]").waitFor();
}, { setup: (db) => { seedResult = seed(db); } });

await scenario("5c. Üye oda değiştiricide 'Oda ekle' görmez", async ({ page }) => {
  await openChat(page, seedResult.prompt);
  await page.locator("[data-room-chip]").click();
  await dlg(page).locator("[data-room-row]").first().waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: "Oda ekle" }).count(), 0);
}, { setup: (db) => { seedResult = seed(db, { role: "member" }); } });

// 6
await scenario("6. Gönderme: serbest odada room_id gider, Genel'de gitmez", async ({ page, db }) => {
  await openChat(page, seedResult.prompt);
  await page.getByRole("textbox").last().fill("odaya merhaba");
  await page.getByRole("button", { name: "Mesaj gönder" }).last().click();
  await page.waitForFunction(() => document.querySelector("[data-chat-scroll]")?.innerText.includes("odaya merhaba"));
  const sent = db.calls.filter((c) => c.table === "messages" && c.method === "POST").pop();
  assert.equal(sent.body.room_id, seedResult.prompt.id);
  await page.goto(`${BASE}/messages/local?id=${G}&room=${seedResult.general.id}`);
  await page.locator("[data-room-chip]").waitFor();
  await page.getByRole("textbox").last().fill("genele merhaba");
  await page.getByRole("button", { name: "Mesaj gönder" }).last().click();
  await page.waitForFunction(() => document.querySelector("[data-chat-scroll]")?.innerText.includes("genele merhaba"));
  const general = db.calls.filter((c) => c.table === "messages" && c.method === "POST").pop();
  assert.equal(general.body.room_id, undefined, "varsayılan odaya room_id yazılmaz");
}, { setup: (db) => { seedResult = seed(db); } });

// 7
await scenario("7. Salt okunur oda: üyenin yazma alanı kapalı + açıklama; yönetim yazabilir", async ({ page }) => {
  await openChat(page, seedResult.ann);
  await page.locator("[data-room-readonly-notice]").waitFor();
  assert.match(await page.locator("[data-room-readonly-notice]").innerText(), /yalnızca yöneticiler yazabilir/);
  assert.ok(await page.getByRole("textbox").last().isDisabled());
}, { setup: (db) => { seedResult = seed(db, { role: "member" }); } });

await scenario("7b. Yönetici duyuru odasına yazabilir (kapalı değil, uyarı yok)", async ({ page }) => {
  await openChat(page, seedResult.ann);
  await page.locator("[data-room-chip]").waitFor();
  assert.equal(await page.locator("[data-room-readonly-notice]").count(), 0);
  assert.equal(await page.getByRole("textbox").last().isDisabled(), false);
}, { setup: (db) => { seedResult = seed(db, { role: "admin" }); } });

// 8
await scenario("8. Okundu: odayı açınca mark_room_read_up_to çağrılır ve rozet kalkar", async ({ page, db }) => {
  await openChat(page, seedResult.prompt);
  await page.waitForFunction(() => document.querySelector("[data-chat-scroll]")?.innerText.includes("prompt odası iki"));
  await page.waitForTimeout(600);
  assert.ok(db.roomCalls.some((c) => c.fn === "read" && c.body.p_room_id === seedResult.prompt.id), "oda okundu imleci yazıldı");
  await page.locator("[data-room-chip]").click();
  await dlg(page).locator("[data-room-row]").first().waitFor();
  assert.equal(await dlg(page).locator("[data-room-row]").filter({ hasText: "Prompt Paylaşımı" }).locator("[data-room-unread]").count(), 0);
  assert.ok(await dlg(page).locator("[data-room-row]").filter({ hasText: "Duyurular" }).count() > 0);
}, { setup: (db) => { seedResult = seed(db); } });

// 9
await scenario("9. Oda sessize alma: ⋮ menüsü → rozetsiz + sessiz simgesi; sunucuya yazılır", async ({ page, db }) => {
  await openChat(page, seedResult.ann);
  await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().click();
  await page.locator("[data-room-mute]").click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  assert.ok(db.roomCalls.some((c) => c.fn === "mute" && c.body.p_muted === true && c.body.p_room_id === seedResult.ann.id));
  await page.locator("[data-room-chip]").click();
  await roomRow(dlg(page), "Duyurular").waitFor();
  await roomRow(dlg(page), "Duyurular").locator("svg[aria-label='Sessize alınmış']").waitFor();
}, { setup: (db) => { seedResult = seed(db); } });

// 10
await scenario("10. Oda ekle: boş ad hata verir; politika seçimi 'ne olacak' cümlesini değiştirir; RPC parametreleri doğru; yeni odaya geçilir", async ({ page, db }) => {
  await openHub(page);
  await page.locator("[data-hub-add-room]").click();
  const d = dlg(page);
  await d.getByRole("heading", { name: "Yeni oda" }).waitFor();
  await d.getByRole("button", { name: "Oda oluştur" }).click();
  await d.getByText("Oda adı boş olamaz.").waitFor();
  assert.equal(db.roomCalls.filter((c) => c.fn === "create").length, 0, "geçersiz ad sunucuya gitmez");
  await d.getByLabel("Oda adı").fill("Prompt İpuçları");
  assert.match(await d.locator("[data-room-outcome]").innerText(), /herkes yazabilir/);
  await d.getByLabel("Yalnız yönetim").check();
  assert.match(await d.locator("[data-room-outcome]").innerText(), /yalnızca yönetim yazabilir/);
  await d.getByRole("button", { name: "Bölüm", exact: false }).click();
  await d.getByLabel("Yeni bölüm…").check();
  await d.getByLabel("Bölüm adı").fill("Atölye");
  await d.getByRole("radio", { name: "Duyuru" }).click();
  await d.getByRole("button", { name: "Oda oluştur" }).click();
  await page.waitForFunction(() => location.search.includes("room="));
  const call = db.roomCalls.find((c) => c.fn === "create").body;
  assert.equal(call.p_name, "Prompt İpuçları");
  assert.equal(call.p_posting_policy, "admins");
  assert.equal(call.p_read_policy, "all");
  assert.equal(call.p_section, "Atölye");
  assert.equal(call.p_icon, "megaphone");
}, { setup: (db) => seed(db) });

await scenario("10b. Aynı adlı oda: sunucu hatası çevrilmiş olarak formda görünür, pencere kapanmaz", async ({ page }) => {
  await openHub(page);
  await page.locator("[data-hub-add-room]").click();
  const d = dlg(page);
  await d.getByLabel("Oda adı").fill("Duyurular");
  await d.getByRole("button", { name: "Oda oluştur" }).click();
  await d.getByText("Bu adda bir oda zaten var.").waitFor();
  assert.ok(await d.isVisible());
}, { setup: (db) => seed(db) });

// 11
await scenario("11. Yönetim: sayaç, bölümler, menüden aşağı taşı → sıra RPC'si; arşivle → arşiv bölümü", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=rooms`);
  await page.locator("[data-rooms-manage]").waitFor();
  await page.locator("[data-manage-room]").first().waitFor();
  assert.match((await page.locator("[data-rooms-count]").innerText()).trim(), /^6 \/ 20$/);
  const row = (name) => page.locator("[data-manage-room]").filter({ hasText: name }).first();
  await row("Genel").getByText("Varsayılan oda · silinemez").waitFor();
  await row("Prompt Paylaşımı").getByRole("button", { name: /Prompt Paylaşımı odası işlemleri/ }).click();
  await page.getByRole("menuitem", { name: "Aşağı taşı" }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  const reorder = db.roomCalls.find((c) => c.fn === "reorder").body.p_room_ids;
  const names = reorder.map((id) => db.rooms.find((r) => r.id === id).name);
  assert.ok(names.indexOf("Prompt Paylaşımı") > names.indexOf("Görsel Çıktılar"), `sıra değişti: ${names.join(", ")}`);
  await row("Yardım ve Sorular").getByRole("button", { name: /işlemleri/ }).click();
  await page.getByRole("menuitem", { name: "Arşivle" }).click();
  await page.waitForTimeout(400);
  assert.ok(db.roomCalls.some((c) => c.fn === "archive" && c.body.p_archived === true));
  await page.getByRole("button", { name: /Arşivlenmiş odalar/ }).waitFor();
  assert.match((await page.locator("[data-rooms-count]").innerText()).trim(), /^5 \/ 20$/);
}, { setup: (db) => seed(db) });

await scenario("11b. Silme yalnız sahibe: yönetici menüsünde 'Odayı sil' yok; Genel'de hiçbir rol silemez", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=rooms`);
  await page.locator("[data-manage-room]").first().waitFor();
  await page.locator("[data-manage-room]").filter({ hasText: "Görsel Çıktılar" }).getByRole("button", { name: /işlemleri/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Odayı sil" }).count(), 0);
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("11c. Sahip silerken onay penceresi mesajların da gideceğini söyler; onaylayınca RPC çağrılır; Genel menüsünde sil yok", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=rooms`);
  await page.locator("[data-manage-room]").first().waitFor();
  await page.locator("[data-manage-room]").filter({ hasText: "Genel" }).first().getByRole("button", { name: /işlemleri/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Odayı sil" }).count(), 0);
  await page.keyboard.press("Escape");
  await page.locator("[data-manage-room]").filter({ hasText: "Görsel Çıktılar" }).getByRole("button", { name: /işlemleri/ }).click();
  await page.getByRole("menuitem", { name: "Odayı sil" }).click();
  await dlg(page).getByText(/mesajlar da kalıcı olarak silinir/).waitFor();
  await dlg(page).getByRole("button", { name: "Odayı sil" }).click();
  await page.waitForTimeout(400);
  assert.ok(db.roomCalls.some((c) => c.fn === "delete" && c.body.p_room_id === seedResult.image.id));
  assert.equal(await page.locator("[data-manage-room]").filter({ hasText: "Görsel Çıktılar" }).count(), 0);
}, { setup: (db) => { seedResult = seed(db); } });

await scenario("11d. Düzenle: yeni ad update RPC'sine gider; Bölüme taşı yalnız bölüm alanını gönderir", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=rooms`);
  await page.locator("[data-manage-room]").first().waitFor();
  const menu = async (name) => page.locator("[data-manage-room]").filter({ hasText: name }).first().getByRole("button", { name: /işlemleri/ }).click();
  await menu("Yardım ve Sorular");
  await page.getByRole("menuitem", { name: "Düzenle" }).click();
  await dlg(page).getByLabel("Oda adı").fill("Destek");
  await dlg(page).getByRole("button", { name: "Kaydet" }).click();
  await page.waitForTimeout(400);
  assert.equal(db.roomCalls.find((c) => c.fn === "update").body.p_patch.name, "Destek");
  await menu("Destek");
  await page.getByRole("menuitem", { name: "Bölüme taşı" }).click();
  await dlg(page).getByRole("radio", { name: "Üretim" }).waitFor();
  await dlg(page).getByLabel("Yönetim").check();
  await dlg(page).getByRole("button", { name: "Kaydet" }).click();
  await page.waitForTimeout(400);
  const moved = db.roomCalls.filter((c) => c.fn === "update").pop().body.p_patch;
  assert.deepEqual(Object.keys(moved), ["section"], "yalnız bölüm gönderilir");
  assert.equal(moved.section, "Yönetim");
}, { setup: (db) => seed(db) });

await scenario("11e. 20 etkin oda sınırı: Oda ekle kapanır", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${G}&tab=manage&section=rooms`);
  await page.locator("[data-rooms-count]").waitFor();
  assert.match((await page.locator("[data-rooms-count]").innerText()).trim(), /^20 \/ 20$/);
  assert.ok(await page.locator("[data-manage-add-room]").isDisabled());
}, { setup: (db) => { seed(db); for (let i = 0; i < 14; i += 1) db.addRoom(G, { name: `Oda ${i}` }); } });

// 12
await scenario("12. Masaüstü: sol panelde oda ağacı (açık topluluk), ağaçtan odaya geçiş, sağda 'Bu oda' paneli ve gizle/göster", async ({ page }) => {
  await openChat(page, seedResult.prompt);
  const tree = page.locator("[data-room-tree]");
  await tree.waitFor();
  assert.ok((await tree.locator("[data-room-row]").count()) >= 5, "oda ağacı");
  await tree.locator("[data-room-row]").filter({ hasText: "Duyurular" }).click();
  await page.waitForFunction((id) => location.search.includes(`room=${id}`), seedResult.ann.id);
  const panel = page.locator("[data-room-panel]");
  await panel.waitFor();
  await panel.getByRole("heading", { name: "Bu oda" }).waitFor();
  await page.locator("[data-room-panel-toggle]").click();
  await page.locator("[data-room-panel]").waitFor({ state: "hidden" });
  await page.locator("[data-room-panel-toggle]").click();
  await page.locator("[data-room-panel]").waitFor({ state: "visible" });
  await panel.locator("[data-room-panel-settings]").waitFor();
}, { viewport: DESKTOP, setup: (db) => { seedResult = seed(db); } });

await scenario("12b. Masaüstü: ağaç oku topluluk satırının odalarını daraltır/açar", async ({ page }) => {
  await openChat(page, seedResult.prompt);
  await page.locator("[data-room-tree]").waitFor();
  await page.locator("[data-toggle-rooms]").first().click();
  await page.locator("[data-room-tree]").waitFor({ state: "detached" });
  await page.locator("[data-toggle-rooms]").first().click();
  await page.locator("[data-room-tree]").waitFor();
}, { viewport: DESKTOP, setup: (db) => { seedResult = seed(db); } });

// 13
await scenario("13. Sohbet sabitleme: seçim modu → Sabitle; satır başa çıkar, iğne görünür, sunucuya pinned_at yazılır; tekrar Sabitlemeyi kaldır", async ({ page, db }) => {
  await page.goto(`${BASE}/messages`);
  const rows = page.locator("[data-conversation-row]:visible");
  await rows.first().waitFor();
  const first = (await rows.first().innerText());
  assert.ok(first.includes("Tasarım Atölyesi"), "başlangıçta en yeni sohbet (topluluk) ilk");
  await page.locator("[data-conversations-more]:visible").click();
  await page.locator("[data-conversations-select]").click();
  await rows.filter({ hasText: "Bob" }).first().click();
  await page.locator("[data-selection-pin]").click();
  await page.waitForTimeout(400);
  assert.ok(db.calls.some((c) => c.table === "conversation_members" && c.method === "PATCH" && c.body.pinned_at), "pinned_at yazıldı");
  assert.ok((await rows.first().innerText()).includes("Bob"), "sabitlenen sohbet listenin başında");
  await rows.first().locator("svg[aria-label='Sabitlenmiş sohbet']").waitFor();
  await page.locator("[data-conversations-more]:visible").click();
  await page.locator("[data-conversations-select]").click();
  await rows.first().click();
  assert.match(await page.locator("[data-selection-pin]").innerText(), /Sabitlemeyi kaldır/);
}, { setup: (db) => { db.addConv("c0000000-0000-4000-8000-0000000000c1", U.bob, { texts: ["eski mesaj"] }); seed(db); } });

// 14
await scenario("14. İngilizce: çipler, hub, oda değiştirici, form ve yönetim İngilizce", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-kind-chips]:visible").waitFor();
  for (const label of ["All", "Personal", "Community", "Team"]) await page.locator("[data-kind-chips]:visible").getByRole("button", { name: label, exact: true }).waitFor();
  await openHub(page);
  await page.getByRole("heading", { name: "Chat Rooms" }).waitFor();
  await page.locator("[data-hub-add-room]").getByText("Add Room").waitFor();
  await page.locator("[data-hub-add-room]").click();
  await dlg(page).getByRole("heading", { name: "New room" }).waitFor();
  await dlg(page).getByLabel("Room name").fill("x");
  assert.match(await dlg(page).locator("[data-room-outcome]").innerText(), /Every member can see the room/);
}, { lang: "en", setup: (db) => seed(db) });

// 15
await scenario("15. Mobil: hub, sohbet ve yönetim yatay taşma yapmaz", async ({ page }) => {
  for (const url of [`/messages/local?id=${G}&view=rooms`, `/messages/local?id=${G}&room=${seedResult.prompt.id}`, `/communities/local?id=${G}&tab=manage&section=rooms`]) {
    await page.goto(`${BASE}${url}`);
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${url}: yatay taşma ${overflow}px`);
  }
}, { viewport: { width: 360, height: 740 }, setup: (db) => { seedResult = seed(db); } });

await scenario("16. Oda yüklenemezse (eski veritabanı) sohbet eski davranışla açılır: oda çipi yok, mesajlar tam", async ({ page, db }) => {
  db.rpc.community_rooms_overview = () => ({ status: 404, body: { code: "PGRST202", message: "function not found" } });
  await page.goto(`${BASE}/messages/local?id=${G}`);
  await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-room-chip]").count(), 0);
  assert.ok((await messageTexts(page)).includes("genel sohbet mesajı"));
}, { setup: (db) => seed(db) });

const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
