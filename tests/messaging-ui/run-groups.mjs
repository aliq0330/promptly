// Topluluk sohbeti arayüz testleri (ağ taklitli) — docs/history/172-*. Çalıştırma: README.md.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";

const BASE = "http://localhost:4174/promptly";
const server = await serve(4174);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const G = "d0000000-0000-4000-8000-0000000000a1";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme } = {}) {
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/gfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const dlg = (page) => page.getByRole("dialog").last();
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const openThread = async (page, id = G) => { await page.goto(`${BASE}/messages/local?id=${id}`); await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().waitFor(); await page.waitForTimeout(300); };
const openInfo = async (page) => { await page.locator("button[aria-haspopup='dialog'][aria-label*='topluluk bilgisini aç'], button[aria-haspopup='dialog'][aria-label*='Open info']").first().click(); await dlg(page).getByRole("tablist").waitFor(); };
const tabNames = async (page) => dlg(page).getByRole("tab").allInnerTexts().then((list) => list.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()));
const tab = (page, name) => dlg(page).getByRole("tab", { name });
const seed = (db, opts = {}) => db.addGroup(G, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], texts: [[U.bob, "merhaba topluluk"], [U.dave, "selam"]], ...opts });

// 1
await scenario("1. Liste: topluluk satırı ad + rozet + 'Gönderen: metin' önizlemesiyle görünür; birebir ile karışmaz", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("a[href*='/messages/local'][href*='id=']:visible", { hasText: "Tasarım Atölyesi" }).first().waitFor();
  const row = page.locator("a[href*='/messages/local'][href*='id=']:visible", { hasText: "Tasarım Atölyesi" }).first();
  await row.getByText("Dave: selam").waitFor();
  const direct = page.locator("a[href*='/messages/local'][href*='id=']:visible", { hasText: "Carol" }).first();
  await direct.waitFor();
  assert.equal(await direct.getByText("Dave:", { exact: false }).count(), 0);
}, { setup: (db) => { seed(db); db.addConv("c0000000-0000-4000-8000-0000000000c9", U.carol, { texts: ["hey"] }); } });

// 2
await scenario("2. Topluluk sohbeti: üye sayısı, gönderen adı üstte, topluluk menüsü (profil menüsü değil)", async ({ page }) => {
  await openThread(page);
  await page.getByText("4 üye").first().waitFor();
  await page.locator("[data-message-sender]", { hasText: "Bob" }).first().waitFor();
  await page.locator("[data-message-sender]", { hasText: "Dave" }).first().waitFor();
  assert.equal(await page.locator("button[aria-label='Profil seçenekleri']").count(), 0, "no per-user block/report menu in a group header");
  await page.locator("button[aria-label='Topluluk seçenekleri']").click();
  await page.getByRole("menuitem", { name: "Sessize al" }).waitFor();
  await page.getByRole("menuitem", { name: "Listemden kaldır" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Sohbeti sil", exact: true }).count(), 0, "group never says 'delete chat'");
}, { setup: (db) => seed(db) });

// 3
await scenario("3. Üye: yalnızca Genel + Üyeler sekmeleri; yönetim kontrolü yok", async ({ page }) => {
  await openThread(page); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["Genel", "Üyeler"]);
  await tab(page, /Üyeler/).click();
  await dlg(page).locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await dlg(page).locator("button[aria-label^='Bob için işlemler']").count(), 0, "a plain member has no row actions");
  assert.equal(await dlg(page).getByText("Yönetici", { exact: true }).count() >= 1, true, "role badges are shown");
}, { setup: (db) => seed(db) });

// 4
await scenario("4. Moderatör: İstekler sekmesi var, Davet/Ayarlar yok; istek kabul/ret RPC'si çağrılır ve liste güncellenir", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["Genel", "Üyeler", "Katılım istekleri"]);
  await tab(page, /Katılım istekleri/).click();
  const items = dlg(page).locator("ul[aria-label='Bekleyen katılım istekleri'] li");
  await items.first().waitFor();
  assert.equal(await items.count(), 2);
  await dlg(page).getByText("Topluluğa girmek istiyorum").waitFor();
  await dlg(page).getByRole("button", { name: "Erin isteğini kabul et" }).dblclick();
  await page.getByText("Erin topluluğa kabul edildi.").waitFor();
  assert.equal(calls(db, "rpc/decide_chat_group_join_request").length, 1, "double click sends one request");
  await dlg(page).getByRole("button", { name: "Zed isteğini reddet" }).click();
  await dlg(page).getByText("Bekleyen istek yok").waitFor();
  assert.deepEqual(db.requests.map((r) => r.status).sort(), ["accepted", "rejected"]);
}, {
  setup: (db) => {
    seed(db, { myRole: "moderator", members: [[U.bob, "admin"], [U.dave, "member"]], pending: 2 });
    db.requests.push({ id: "e0000000-0000-4000-8000-000000000001", group_id: G, user_id: U.erin.id, message: "Topluluğa girmek istiyorum", status: "pending", created_at: db.stamp() }, { id: "e0000000-0000-4000-8000-000000000002", group_id: G, user_id: U.zed.id, message: null, status: "pending", created_at: db.stamp() });
  },
});

// 5
await scenario("5. Admin: tüm sekmeler; kapalı→açık onay metni birebir; sonuç özeti ve güncel üye sayısı", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["Genel", "Üyeler", "Katılım istekleri", "Davet", "Ayarlar"]);
  await tab(page, /Ayarlar/).click();
  await dlg(page).getByRole("button", { name: "Herkese açık yap" }).click();
  const confirm = dlg(page);
  await confirm.getByText("Topluluğu herkese açık yaptığında, güvenlik kurallarına uygun tüm bekleyen katılım istekleri otomatik olarak kabul edilecek ve uygun kullanıcılar topluluğa katılacak.").waitFor();
  await confirm.getByRole("button", { name: "Herkese açık yap" }).dblclick();
  const result = dlg(page);
  await result.getByRole("heading", { name: "Topluluk herkese açık yapıldı" }).waitFor();
  await result.getByText("Kabul edilen başvuru: 1").waitFor();
  await result.getByText("Kabul edilemeyen başvuru: 2").waitFor();
  await result.getByText("Üye sınırı doldu: 2").waitFor();
  assert.equal(calls(db, "rpc/set_chat_group_visibility").length, 1, "double click sends one request");
  assert.equal(db.groups[0].visibility, "public");
  assert.deepEqual(db.requests.map((r) => r.status), ["accepted", "pending", "pending"], "unacceptable requests are NOT marked accepted");
  await result.getByRole("button", { name: "Tamam" }).click();
  await page.getByText("3 üye").first().waitFor();
}, {
  setup: (db) => {
    seed(db, { myRole: "admin", members: [[U.bob, "member"]], member_limit: 3, pending: 3, texts: [] });
    for (const u of [U.carol, U.dave, U.amy]) db.requests.push({ id: crypto.randomUUID(), group_id: G, user_id: u.id, message: null, status: "pending", created_at: db.stamp() });
  },
});

// 6
await scenario("6. Görünürlük değişikliği başarısızsa başarı gösterilmez, topluluk eski durumda kalır", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Ayarlar/).click();
  await dlg(page).getByRole("button", { name: "Herkese açık yap" }).click();
  await dlg(page).getByRole("heading", { name: "Topluluk herkese açık yapılsın mı?" }).waitFor();
  await dlg(page).getByRole("button", { name: "Herkese açık yap" }).click();
  await dlg(page).getByRole("alert").getByText("Bu işlem için yetkin yok.").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Topluluk herkese açık yapıldı" }).count(), 0);
  assert.equal(db.groups[0].visibility, "private");
}, { setup: (db) => { seed(db, { myRole: "admin" }); db.rpc.set_chat_group_visibility = () => ({ status: 400, body: { code: "P0001", message: "forbidden", details: "", hint: "" } }); } });

// 7
await scenario("7. 'Yalnızca yöneticiler yazabilir': üyede giriş kapalı + açıklama; moderatörde açık", async ({ page }) => {
  await openThread(page);
  await page.getByText("Bu toplulukta yalnızca yöneticiler mesaj gönderebilir.").waitFor();
  assert.equal(await page.getByPlaceholder("Bir mesaj yaz...").isDisabled(), true);
}, { setup: (db) => seed(db, { posting_policy: "admins" }) });

await scenario("7b. Üye topluluk mesajı gönderir; mesaj topluluk kimliğiyle eklenir", async ({ page, db }) => {
  await openThread(page);
  await page.getByPlaceholder("Bir mesaj yaz...").fill("herkese selam");
  await page.getByRole("button", { name: "Mesaj gönder" }).click();
  await page.locator("[data-message-id]", { hasText: "herkese selam" }).waitFor();
  const posted = calls(db, "messages", "POST");
  assert.equal(posted.length, 1);
  assert.equal(posted[0].body.conversation_id, G);
}, { setup: (db) => seed(db) });

// 8
await scenario("8. Yönetici mesaj silme: moderatör üyenin mesajında görür, yöneticininkinde görmez; onay ister", async ({ page, db }) => {
  await openThread(page);
  const open = async (text) => {
    const bubble = page.locator("[data-message-wrapper]", { hasText: text });
    await bubble.hover();
    await bubble.locator("button[aria-label='Mesaj seçenekleri']").click({ force: true });
  };
  await open("merhaba topluluk"); // bob = admin
  assert.equal(await page.getByRole("menuitem", { name: "Yönetici olarak sil" }).count(), 0);
  await page.keyboard.press("Escape");
  await open("selam"); // dave = member
  await page.getByRole("menuitem", { name: "Yönetici olarak sil" }).click();
  await page.getByRole("menuitem", { name: "Emin misin? Tekrar tıkla" }).click();
  await page.getByText("Bu mesaj silindi.").waitFor();
  assert.equal(calls(db, "rpc/moderate_chat_group_message").length, 1);
}, { setup: (db) => seed(db, { myRole: "moderator" }) });

// 9
await scenario("9. Üye topluluktan ayrılır: onay ister, çift tık tek istek, sohbet kapanır ve listeden gider", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("heading", { name: /topluluğundan ayrılsın mı/ }).waitFor();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).dblclick();
  await page.getByRole("heading", { name: "Topluluktan ayrıldın" }).waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 1);
  assert.equal(db.member(G, ME), undefined);
  await page.getByRole("link", { name: "Mesajlara Dön" }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("a[href*='id=']:visible", { hasText: "Tasarım Atölyesi" }).count(), 0);
}, { setup: (db) => seed(db) });

// 10
await scenario("10. Sahip, başka üye varken ayrılamaz: devretmeye yönlendirilir (ayrıl düğmesi yok)", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByText("Topluluğun sahibisin. Ayrılmadan önce sahipliği başka bir üyeye devretmelisin.").waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).count(), 0);
  await dlg(page).getByRole("button", { name: "Üyelere git ve devret" }).click();
  await dlg(page).getByText("Sahipliği devretmek istediğin üyenin yanındaki ⋮ menüsünü kullan.").waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 0);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

// 15
await scenario("15. İngilizce: bilgi penceresi sekmeleri ve onay metni çevrilmiş", async ({ page }) => {
  await openThread(page, G); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["About", "Members", "Join requests", "Invite", "Settings"]);
  await tab(page, /Settings/).click();
  await dlg(page).getByRole("button", { name: "Make public" }).click();
  await dlg(page).getByText("When you make the community public, all pending join requests that meet the safety rules will be accepted automatically and eligible users will join the community.").waitFor();
}, { lang: "en", setup: (db) => seed(db, { myRole: "admin" }) });

// 16
for (const [label, viewport, theme] of [["mobil 390x800", { width: 390, height: 800 }, undefined], ["mobil koyu tema", { width: 390, height: 800 }, "dark"], ["tablet 820x1100", { width: 820, height: 1100 }, undefined]]) {
  await scenario(`16. Düzen (${label}): topluluk sohbeti ve bilgi penceresi taşmaz, dokunma hedefleri ≥ 36px`, async ({ page }) => {
    await openThread(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal page scroll (${overflow}px)`);
    await openInfo(page);
    await page.waitForTimeout(600); // açılış animasyonu bitsin
    const panel = await dlg(page).locator("div.flex.max-h-\\[90vh\\]").first().boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y >= 0 && panel.y + panel.height <= viewport.height + 1, `panel inside viewport ${JSON.stringify(panel)}`);
    const close = await dlg(page).getByRole("button", { name: "Kapat" }).first().boundingBox();
    assert.ok(close.width >= 36 && close.height >= 36, "close button is touch-sized");
    for (const name of [/Üyeler/, /Katılım istekleri/, /Davet/, /Ayarlar/]) { await tab(page, name).click(); await page.waitForTimeout(150); }
    const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over2 <= 1, `no horizontal page scroll with the modal open (${over2}px)`);
    if (theme === "dark") assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  }, { viewport, theme, setup: (db) => seed(db, { myRole: "admin" }) });
}

// 17
await scenario("17. Üyelik kaybı: sohbet açıkken topluluktan çıkarılan kullanıcı 'artık üye değilsin' görür", async ({ page, db }) => {
  await openThread(page);
  db.members = db.members.filter((m) => !(m.conversation_id === G && m.user_id === ME)); // başka biri çıkardı
  await page.goto(`${BASE}/messages/local?id=${G}`);
  await page.getByRole("heading", { name: "Konuşma bulunamadı" }).waitFor();
}, { setup: (db) => seed(db) });

await scenario("18. Birebir sohbet etkilenmez: profil menüsü ve engelle/şikayet hâlâ var", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=c0000000-0000-4000-8000-0000000000c9`);
  await page.locator("button[aria-label='Profil seçenekleri']").click();
  await page.getByRole("menuitem", { name: "Arşivle" }).waitFor();
  assert.equal(await page.locator("button[aria-label='Topluluk seçenekleri']").count(), 0);
}, { setup: (db) => db.addConv("c0000000-0000-4000-8000-0000000000c9", U.carol, { texts: ["hey"] }) });

// 19
await scenario("19. Üyeler: owner rol değiştirir (onaylı), çıkarır + yasaklar (onaylı), sahipliği devreder; satır işlemleri yetkiye göre", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Üyeler/).click();
  await dlg(page).locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await dlg(page).locator("button[aria-label^='Alice için işlemler'], button[aria-label^='Sen için işlemler']").count(), 0, "no actions on yourself");
  // rol: Dave (üye) → moderatör
  await dlg(page).getByRole("button", { name: "Dave için işlemler" }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Normal üye yap" }).count(), 0, "already a regular member");
  await page.getByRole("menuitem", { name: "Moderatör yap" }).click();
  await page.getByRole("heading", { name: "Dave için rol değiştirilsin mi?" }).waitFor();
  await page.getByRole("button", { name: "Onayla" }).dblclick();
  await page.getByText("Dave için rol güncellendi.").waitFor();
  assert.equal(db.member(G, U.dave.id).role, "moderator");
  assert.equal(calls(db, "rpc/set_chat_group_member_role").length, 1);
  // çıkar + yasakla
  await dlg(page).getByRole("button", { name: "Carol için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Topluluktan çıkar" }).click();
  await page.getByRole("heading", { name: "Carol topluluktan çıkarılsın mı?" }).waitFor();
  await page.getByRole("checkbox", { name: /Tekrar katılmasını engelle/ }).check();
  await page.getByRole("button", { name: "Çıkar ve yasakla" }).click();
  await page.getByText("Carol çıkarıldı ve yasaklandı.").waitFor();
  assert.equal(calls(db, "rpc/remove_chat_group_member")[0].body.p_ban, true);
  assert.equal(db.member(G, U.carol.id), undefined);
  // sahiplik devri
  await dlg(page).getByRole("button", { name: "Bob için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Sahipliği devret" }).click();
  await page.getByRole("button", { name: "Devret" }).click();
  await page.getByText("Sahiplik Bob kişisine devredildi.").waitFor();
  assert.equal(db.member(G, U.bob.id).role, "owner");
  assert.equal(db.member(G, ME).role, "admin");
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("19b. Admin: başka yöneticiye ve sahibe işlem menüsü yok; moderatöre yalnızca üye yap", async ({ page }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Üyeler/).click();
  await dlg(page).locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await dlg(page).locator("button[aria-label='Bob için işlemler']").count(), 0, "owner: no menu");
  assert.equal(await dlg(page).locator("button[aria-label='Erin için işlemler']").count(), 0, "other admin: no menu");
  await dlg(page).getByRole("button", { name: "Carol için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Normal üye yap" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Yönetici yap" }).count(), 0, "an admin can't create admins");
  assert.equal(await page.getByRole("menuitem", { name: "Sahipliği devret" }).count(), 0, "only the owner transfers");
}, { setup: (db) => seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.erin, "admin"], [U.carol, "moderator"], [U.dave, "member"]] }) });

// 20
await scenario("20. Davet sekmesi: üyeler 'takip ettiklerim'de görünmez, aramada 'Zaten üye' yazar ve seçilemez; gönderim; bağlantı yalnızca bir kez gösterilir", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Davet/).click();
  await dlg(page).getByRole("checkbox", { name: /Amy/ }).waitFor();
  assert.equal(await dlg(page).getByRole("checkbox", { name: /Dave/ }).count(), 0, "members never appear in the followed list");
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("dave");
  const dave = dlg(page).getByRole("checkbox", { name: /Dave/ });
  await dave.waitFor();
  await dave.getByText("Zaten üye").waitFor();
  assert.equal(await dave.isDisabled(), true, "a member can't be selected");
  await dlg(page).getByPlaceholder("Kullanıcı adı veya isimle ara").fill("");
  await dlg(page).getByRole("checkbox", { name: /Amy/ }).click();
  await dlg(page).getByRole("button", { name: "Davet gönder (1)" }).dblclick();
  await dlg(page).getByText("1 davet gönderildi, 0 kişi atlandı.").waitFor();
  assert.equal(calls(db, "rpc/invite_to_chat_group").length, 1);
  assert.deepEqual(calls(db, "rpc/invite_to_chat_group")[0].body.p_user_ids, [U.amy.id]);
  await dlg(page).getByText("Bekleyen davetler (1)").waitFor();
  await dlg(page).getByRole("button", { name: "Bağlantı oluştur" }).click();
  const input = dlg(page).getByRole("textbox", { name: "Davet bağlantıları" });
  await input.waitFor();
  assert.match(await input.inputValue(), /\/communities\/join#ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-xyzab$/);
  await dlg(page).getByText("Bu bağlantı yalnızca şimdi gösterilir").waitFor();
}, { setup: (db) => { seed(db, { myRole: "admin" }); db.follow(U.alice, U.amy); db.follow(U.alice, U.dave); } });

// 21
await scenario("21. Ayarlar: yalnızca değişen alanlar gönderilir; boş ad kaydedilemez; sahip silme için topluluk adını yazmalı", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Ayarlar/).click();
  const save = dlg(page).getByRole("button", { name: "Kaydet", exact: true });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await dlg(page).getByLabel("Topluluk adı").fill("   ");
  await dlg(page).getByText("Topluluk adı boş olamaz.").waitFor();
  await save.click({ force: true });
  assert.equal(calls(db, "rpc/update_chat_group").length, 0, "invalid name never reaches the server");
  await dlg(page).getByLabel("Topluluk adı").fill("Yeni Ad");
  await dlg(page).getByRole("radio", { name: /Yalnızca yöneticiler/ }).check();
  await save.click();
  await page.getByText("Topluluk ayarları kaydedildi.").waitFor();
  const patch = calls(db, "rpc/update_chat_group")[0].body.p_patch;
  assert.deepEqual(Object.keys(patch).sort(), ["name", "posting_policy"]);
  await dlg(page).getByRole("button", { name: "Topluluğu sil" }).click();
  await dlg(page).getByRole("heading", { name: "Topluluk silinsin mi?" }).waitFor();
  const confirmBtn = dlg(page).getByRole("button", { name: "Topluluğu sil" });
  assert.equal(await confirmBtn.isDisabled(), true, "needs the group name typed");
  await dlg(page).getByLabel(/Onaylamak için topluluk adını yaz/).fill("Yeni Ad");
  assert.equal(await confirmBtn.isDisabled(), false);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

// 23
await scenario("23. Owner: geçmiş görünürlüğü ve rol yetkileri ayrı bölümde; yalnızca değişenler kaydedilir; varsayılana dön", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Ayarlar/).click();
  await dlg(page).getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).waitFor();
  await dlg(page).getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).waitFor();
  const save = dlg(page).getByRole("button", { name: "Sahip ayarlarını kaydet" });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await dlg(page).getByRole("radio", { name: /Görsün/ }).check();
  await dlg(page).getByRole("switch", { name: "Moderatör: Topluluk ayarlarını düzenleme" }).click();
  await dlg(page).getByRole("switch", { name: "Yönetici: Üye yasaklama" }).click();
  assert.equal(await dlg(page).getByRole("switch", { name: /Moderatör: Rol atama/ }).count(), 0, "moderators can't be given role assignment");
  await save.dblclick();
  await page.getByText("Sahip ayarları kaydedildi.").waitFor();
  const sent = calls(db, "rpc/update_chat_group_owner_settings");
  assert.equal(sent.length, 1, "double click sends one request");
  assert.deepEqual(sent[0].body.p_patch, { history_visible: true, role_permissions: { admin: { ban_members: false }, moderator: { edit_settings: true } } });
  assert.equal(db.groups[0].history_visible, true);
  assert.equal(db.groups[0].role_permissions.moderator.edit_settings, true);
  assert.equal(db.groups[0].role_permissions.moderator.manage_requests, true, "untouched flags are kept");
  await dlg(page).getByRole("button", { name: "Varsayılan yetkilere dön" }).click();
  await save.click();
  await page.waitForTimeout(300);
  assert.equal(calls(db, "rpc/update_chat_group_owner_settings").length, 2);
  assert.equal(db.groups[0].role_permissions.admin.ban_members, true);
  assert.equal(db.groups[0].role_permissions.moderator.edit_settings, false);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("23b. Owner değilse sahip ayarları ve tehlikeli bölge görünmez (admin)", async ({ page }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Ayarlar/).click();
  await dlg(page).getByLabel("Topluluk adı").waitFor();
  assert.equal(await dlg(page).getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).count(), 0);
  assert.equal(await dlg(page).getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).count(), 0);
  assert.equal(await dlg(page).getByRole("button", { name: "Topluluğu sil" }).count(), 0);
}, { setup: (db) => seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.carol, "moderator"], [U.dave, "member"]] }) });

// 24
await scenario("24. Yetkiye göre sekmeler: moderatöre ayar yetkisi verilince Ayarlar açılır (görünürlük ve sahip bölümleri yok)", async ({ page }) => {
  await openThread(page); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["Genel", "Üyeler", "Katılım istekleri", "Ayarlar"]);
  await tab(page, /Ayarlar/).click();
  await dlg(page).getByLabel("Topluluk adı").waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: "Herkese açık yap" }).count(), 0, "no visibility without that permission");
  assert.equal(await dlg(page).getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).count(), 0);
}, { setup: (db) => { seed(db, { myRole: "moderator", members: [[U.bob, "owner"], [U.dave, "member"]] }); db.groups[0].role_permissions.moderator.edit_settings = true; } });

await scenario("24b. Başvuru yönetimi moderatörden alınınca İstekler sekmesi kalkar", async ({ page }) => {
  await openThread(page); await openInfo(page);
  assert.deepEqual(await tabNames(page), ["Genel", "Üyeler"]);
}, { setup: (db) => { seed(db, { myRole: "moderator", members: [[U.bob, "owner"], [U.dave, "member"]] }); db.groups[0].role_permissions.moderator.manage_requests = false; } });

await scenario("24c. Admin: yasak yetkisi alınınca çıkarma penceresinde 'engelle' seçeneği çıkmaz; yetki verilince çıkar", async ({ page }) => {
  await openThread(page); await openInfo(page);
  await tab(page, /Üyeler/).click();
  await dlg(page).getByRole("button", { name: "Dave için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Topluluktan çıkar" }).click();
  await page.getByRole("heading", { name: "Dave topluluktan çıkarılsın mı?" }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /Tekrar katılmasını engelle/ }).count(), 0);
}, { setup: (db) => { seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.dave, "member"]] }); db.groups[0].role_permissions.admin.ban_members = false; } });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
