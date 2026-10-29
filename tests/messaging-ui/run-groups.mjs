// Topluluk sohbeti arayüz testleri (ağ taklitli) — docs/history/172-*. Çalıştırma: README.md.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4174/promptly";
const server = await serve(4174);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const G = "d0000000-0000-4000-8000-0000000000a1";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme } = {}) {
  const db = createDb();
  setupCommunities(db); // topluluk sayfası uçları (üye listesi, istatistik…): yönetim işleri artık topluluk sayfasındadır
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

// Bölüm menüsü (docs/history/231-*, 232-*): sekmeler artık tek "Akış ▾ / Gönderiler ▾" menüsünün seçenekleridir.
const SECTION_OPTION = "[data-section-option]";
const optMatcher = (name) => (name instanceof RegExp ? name : new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const menuIsOpen = async (page) => (await page.locator(SECTION_OPTION).count()) > 0;
const menuOpen = async (page) => { if (!(await menuIsOpen(page))) { await page.locator("[data-section-menu]").first().click(); await page.locator(SECTION_OPTION).first().waitFor(); } };
const menuClose = async (page) => { if (await menuIsOpen(page)) { await page.keyboard.press("Escape"); await page.locator(SECTION_OPTION).first().waitFor({ state: "detached" }).catch(() => undefined); } };
const menuOption = (page, name) => page.locator(SECTION_OPTION).filter({ hasText: optMatcher(name) }).first();
const optionText = async (page, name) => { await menuOpen(page); const text = await menuOption(page, name).innerText(); await menuClose(page); return text; };
const tabIsActive = async (page, name) => { await menuOpen(page); const active = (await menuOption(page, name).getAttribute("aria-checked")) === "true"; await menuClose(page); return active; };

const dlg = (page) => page.getByRole("dialog").last();
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const openThread = async (page, id = G) => { await page.goto(`${BASE}/messages/local?id=${id}`); await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().waitFor(); await page.waitForTimeout(300); };
// Sohbet bilgi penceresi artık sekmesiz, kompakt bir panel (docs/community-system.md): başlığı beklenir.
const openInfo = async (page) => { await page.locator("button[aria-haspopup='dialog'][aria-label*='topluluk bilgisini aç'], button[aria-haspopup='dialog'][aria-label*='Open info']").first().click(); await dlg(page).locator("#group-info-title").waitFor(); };
// Kişi/ayar yönetimi topluluk sayfasındadır: `tab` ve `section` adres parametreleri.
const openCommunity = async (page, tab, section) => { await page.goto(`${BASE}/communities/local?id=${G}${tab ? `&tab=${tab}` : ""}${section ? `&section=${section}` : ""}`); await page.locator("h1").first().waitFor(); await page.waitForTimeout(300); };
const tabNames = async (page, index = 0) => page.getByRole("tablist").nth(index).getByRole("tab").allInnerTexts().then((list) => list.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()));
const seed = (db, opts = {}) => {
  db.addGroup(G, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], texts: [[U.bob, "merhaba topluluk"], [U.dave, "selam"]], ...opts });
  Object.assign(db.groups.find((g) => g.id === G), { category: "general", feed_policy: "members", rules: null, rules_required: false, closed_at: null, origin: "native", post_count: 0 });
};

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
await scenario("3. Üye: bilgi penceresi kompakt (sekme yok): topluluk bağlantısı, bildirim, sohbet, üyeler (salt okunur), ayrılma; yönetim yok", async ({ page }) => {
  await openThread(page); await openInfo(page);
  assert.equal(await dlg(page).getByRole("tab").count(), 0, "no tab strip: the panel is not a second community page");
  await dlg(page).locator("[data-info-community-link]").waitFor();
  await dlg(page).getByRole("button", { name: "Sessize al" }).waitFor();
  await dlg(page).getByRole("button", { name: "Ara", exact: true }).waitFor();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).waitFor();
  for (const hidden of ["Sohbet ayarları", "Davet", "Katılım istekleri", "Topluluk ayarlarını aç"]) assert.equal(await dlg(page).getByText(hidden, { exact: false }).count(), 0, `a plain member never sees "${hidden}" here`);
  assert.equal(await dlg(page).locator("[data-info-requests-link]").count(), 0);
  await dlg(page).locator("button[aria-controls='info-members-panel']").click();
  await dlg(page).locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await dlg(page).locator("button[aria-label^='Bob için işlemler']").count(), 0, "a plain member has no row actions");
  assert.equal(await dlg(page).getByText("Yönetici", { exact: true }).count() >= 1, true, "role badges are shown");
}, { setup: (db) => seed(db) });

// 4
await scenario("4. Moderatör: katılım istekleri topluluk sayfasında (Üyeler → sayaçlı bölüm); kabul/ret RPC'si çağrılır ve liste güncellenir; sohbet penceresinde yalnız kısa yol", async ({ page, db }) => {
  await openThread(page);
  await page.locator("[data-community-link-badge]").filter({ hasText: "2" }).waitFor();
  await openInfo(page);
  await dlg(page).locator("[data-info-requests-link]").getByText("2 bekleyen katılım isteği").waitFor();
  assert.equal(await dlg(page).getByRole("tab").count(), 0, "no request list inside the chat panel");
  assert.equal(await dlg(page).locator("ul[aria-label='Bekleyen katılım istekleri']").count(), 0);
  await dlg(page).locator("[data-info-requests-link]").click();
  await page.waitForURL(/communities\/local\/?\?id=.*tab=members.*section=requests/);
  const items = page.locator("ul[aria-label='Bekleyen katılım istekleri'] li");
  await items.first().waitFor();
  assert.deepEqual(await tabNames(page, 0), ["Üyeler", "Katılım istekleri"]);
  assert.equal(await items.count(), 2);
  await page.getByText("Topluluğa girmek istiyorum").waitFor();
  await page.getByRole("button", { name: "Erin isteğini kabul et" }).dblclick();
  await page.getByText("Erin topluluğa kabul edildi.").waitFor();
  assert.equal(calls(db, "rpc/decide_chat_group_join_request").length, 1, "double click sends one request");
  await page.getByRole("button", { name: "Zed isteğini reddet" }).click();
  await page.getByText("Bekleyen istek yok").waitFor();
  assert.deepEqual(db.requests.map((r) => r.status).sort(), ["accepted", "rejected"]);
}, {
  setup: (db) => {
    seed(db, { myRole: "moderator", members: [[U.bob, "admin"], [U.dave, "member"]], pending: 2 });
    db.requests.push({ id: "e0000000-0000-4000-8000-000000000001", group_id: G, user_id: U.erin.id, message: "Topluluğa girmek istiyorum", status: "pending", created_at: db.stamp() }, { id: "e0000000-0000-4000-8000-000000000002", group_id: G, user_id: U.zed.id, message: null, status: "pending", created_at: db.stamp() });
  },
});

// 5
await scenario("5. Admin (topluluk Yönet → Ayarlar): kapalı→açık onay metni birebir; sonuç özeti ve güncel üye sayısı", async ({ page, db }) => {
  await openCommunity(page, "manage", "settings");
  await page.getByRole("radio", { name: /^Herkese açık/ }).click();
  const confirm = dlg(page);
  await confirm.getByText("Topluluğu herkese açık yaptığında, güvenlik kurallarına uygun tüm bekleyen katılım istekleri otomatik olarak kabul edilecek ve uygun kullanıcılar topluluğa katılacak").waitFor();
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
  await openCommunity(page, "manage", "settings");
  await page.getByRole("radio", { name: /^Herkese açık/ }).click();
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
await scenario("9. Üye topluluktan ayrılır (bilgi penceresi): sohbetten de çıkacağı yazar, onay ister, çift tık tek istek, sohbet kapanır ve listeden gider", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByText(/sohbetten de çıkarırsın/).waitFor();
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

await scenario("9b. Başlık menüsündeki 'Topluluktan ayrıl' bilgi penceresini açmadan doğrudan onay ister; 'Listemden kaldır' ayrı bir işlemdir (topluluktan ayrılmaz)", async ({ page, db }) => {
  await openThread(page);
  await page.locator("button[aria-label='Topluluk seçenekleri']").click();
  await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("heading", { name: /topluluğundan ayrılsın mı/ }).waitFor();
  assert.equal(await page.locator("#group-info-title").count(), 0, "no info panel in between");
  await dlg(page).getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 0);
  assert.ok(db.member(G, ME), "cancelling keeps the membership");
  await page.locator("button[aria-label='Topluluk seçenekleri']").click();
  await page.getByRole("menuitem", { name: "Listemden kaldır" }).waitFor();
}, { setup: (db) => seed(db) });

// 10
await scenario("10. Sahip, başka üye varken ayrılamaz: devretmeye yönlendirilir (ayrıl düğmesi yok) → topluluk sayfasındaki Üyeler", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByText("Topluluğun sahibisin. Ayrılmadan önce sahipliği başka bir üyeye devretmelisin.").waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).count(), 0);
  await dlg(page).getByRole("button", { name: "Üyelere git ve devret" }).click();
  await page.waitForURL(/communities\/local\/?\?id=.*tab=members/);
  await page.locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 0);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

// 15
await scenario("15. İngilizce: bilgi penceresi çevrilmiş (topluluk bağlantısı, sohbet ayarları bölümü)", async ({ page }) => {
  await openThread(page, G); await openInfo(page);
  await dlg(page).getByText("Community page", { exact: true }).waitFor();
  await dlg(page).getByRole("button", { name: "Search", exact: true }).waitFor();
  await dlg(page).getByRole("button", { name: "Mute" }).waitFor();
  await dlg(page).getByRole("button", { name: "Chat settings" }).click();
  await dlg(page).locator("#chat-posting-title").waitFor();
  await dlg(page).getByRole("button", { name: "Leave community" }).waitFor();
}, { lang: "en", setup: (db) => seed(db, { myRole: "admin" }) });

// 16
for (const [label, viewport, theme] of [["mobil 390x800", { width: 390, height: 800 }, undefined], ["mobil koyu tema", { width: 390, height: 800 }, "dark"], ["tablet 820x1100", { width: 820, height: 1100 }, undefined]]) {
  await scenario(`16. Düzen (${label}): topluluk sohbeti ve bilgi penceresi taşmaz, dokunma hedefleri ≥ 36px`, async ({ page }) => {
    await openThread(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal page scroll (${overflow}px)`);
    await openInfo(page);
    await page.waitForTimeout(600); // açılış animasyonu bitsin
    const panel = await dlg(page).locator("[data-community-info]").first().boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y >= 0 && panel.y + panel.height <= viewport.height + 1, `panel inside viewport ${JSON.stringify(panel)}`);
    const close = await dlg(page).getByRole("button", { name: "Kapat" }).first().boundingBox();
    assert.ok(close.width >= 36 && close.height >= 36, "close button is touch-sized");
    for (const panelId of ["info-members-panel", "info-settings-panel"]) { await dlg(page).locator(`button[aria-controls='${panelId}']`).click(); await page.waitForTimeout(250); }
    const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over2 <= 1, `no horizontal page scroll with the modal open (${over2}px)`);
    if (theme === "dark") assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
    // Topluluk sayfası da aynı üç genişlikte taşmaz.
    await openCommunity(page);
    const over3 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over3 <= 1, `community page overflows horizontally (${over3}px)`);
  }, { viewport, theme, setup: (db) => seed(db, { myRole: "admin", pending: 3 }) });
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
await scenario("19. Üyeler (topluluk sayfası): owner rol değiştirir (onaylı), çıkarır + yasaklar (onaylı), sahipliği devreder; satır işlemleri yetkiye göre", async ({ page, db }) => {
  await openCommunity(page, "members");
  await page.locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await page.locator("button[aria-label^='Alice için işlemler'], button[aria-label^='Sen için işlemler']").count(), 0, "no actions on yourself");
  // rol: Dave (üye) → moderatör
  await page.getByRole("button", { name: "Dave için işlemler" }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Normal üye yap" }).count(), 0, "already a regular member");
  await page.getByRole("menuitem", { name: "Moderatör yap" }).click();
  await page.getByRole("heading", { name: "Dave için rol değiştirilsin mi?" }).waitFor();
  await page.getByRole("button", { name: "Onayla" }).dblclick();
  await page.getByText("Dave için rol güncellendi.").waitFor();
  assert.equal(db.member(G, U.dave.id).role, "moderator");
  assert.equal(calls(db, "rpc/set_chat_group_member_role").length, 1);
  // çıkar + yasakla
  await page.getByRole("button", { name: "Carol için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Topluluktan çıkar" }).click();
  await page.getByRole("heading", { name: "Carol topluluktan çıkarılsın mı?" }).waitFor();
  await page.getByRole("checkbox", { name: /Tekrar katılmasını engelle/ }).check();
  await page.getByRole("button", { name: "Çıkar ve yasakla" }).click();
  await page.getByText("Carol çıkarıldı ve yasaklandı.").waitFor();
  assert.equal(calls(db, "rpc/remove_chat_group_member")[0].body.p_ban, true);
  assert.equal(db.member(G, U.carol.id), undefined);
  // sahiplik devri
  await page.getByRole("button", { name: "Bob için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Sahipliği devret" }).click();
  await page.getByRole("button", { name: "Devret" }).click();
  await page.getByText("Sahiplik Bob kişisine devredildi.").waitFor();
  assert.equal(db.member(G, U.bob.id).role, "owner");
  assert.equal(db.member(G, ME).role, "admin");
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("19b. Admin: başka yöneticiye ve sahibe işlem menüsü yok; moderatöre yalnızca üye yap", async ({ page }) => {
  await openCommunity(page, "members");
  await page.locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await page.locator("button[aria-label='Bob için işlemler']").count(), 0, "owner: no menu");
  assert.equal(await page.locator("button[aria-label='Erin için işlemler']").count(), 0, "other admin: no menu");
  await page.getByRole("button", { name: "Carol için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Normal üye yap" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Yönetici yap" }).count(), 0, "an admin can't create admins");
  assert.equal(await page.getByRole("menuitem", { name: "Sahipliği devret" }).count(), 0, "only the owner transfers");
}, { setup: (db) => seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.erin, "admin"], [U.carol, "moderator"], [U.dave, "member"]] }) });

await scenario("19c. Sohbet bilgi penceresindeki üye listesi salt okunur: owner için bile rol/çıkarma menüsü yok; 'topluluk sayfasında yönet' bağlantısı var", async ({ page }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).locator("button[aria-controls='info-members-panel']").click();
  await dlg(page).locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await dlg(page).locator("button[aria-label*='için işlemler']").count(), 0, "no member management inside the chat panel");
  await dlg(page).getByRole("link", { name: /Üyeleri topluluk sayfasında yönet/ }).click();
  await page.waitForURL(/communities\/local\/?\?id=.*tab=members/);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

// 20
await scenario("20. Davetler (Üyeler → Davet): takip ettiklerim'de üyeler görünmez, aramada 'Zaten üye' yazar ve seçilemez; gönderim; bağlantı yalnızca bir kez gösterilir", async ({ page, db }) => {
  await openCommunity(page, "members", "invites");
  assert.deepEqual(await tabNames(page, 0), ["Üyeler", "Katılım istekleri", "Davet"]);
  await page.getByRole("checkbox", { name: /Amy/ }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /Dave/ }).count(), 0, "members never appear in the followed list");
  await page.getByPlaceholder("Kullanıcı adı veya isimle ara").fill("dave");
  const dave = page.getByRole("checkbox", { name: /Dave/ });
  await dave.waitFor();
  await dave.getByText("Zaten üye").waitFor();
  assert.equal(await dave.isDisabled(), true, "a member can't be selected");
  await page.getByPlaceholder("Kullanıcı adı veya isimle ara").fill("");
  await page.getByRole("checkbox", { name: /Amy/ }).click();
  await page.getByRole("button", { name: "Davet gönder (1)" }).dblclick();
  await page.getByText("1 davet gönderildi, 0 kişi atlandı.").waitFor();
  assert.equal(calls(db, "rpc/invite_to_chat_group").length, 1);
  assert.deepEqual(calls(db, "rpc/invite_to_chat_group")[0].body.p_user_ids, [U.amy.id]);
  await page.getByText("Bekleyen davetler (1)").waitFor();
  await page.getByRole("button", { name: "Bağlantı oluştur" }).click();
  const input = page.getByRole("textbox", { name: "Davet bağlantıları" });
  await input.waitFor();
  assert.match(await input.inputValue(), /\/communities\/join#ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-xyzab$/);
  await page.getByText("Bu bağlantı yalnızca şimdi gösterilir").waitFor();
}, { setup: (db) => { seed(db, { myRole: "admin" }); db.follow(U.alice, U.amy); db.follow(U.alice, U.dave); } });

// 21
await scenario("21. Topluluk ayarları (Yönet → Ayarlar): yalnızca değişen alanlar gönderilir; boş ad kaydedilemez; sohbet ayarları burada DEĞİL; sahip silme için topluluk adını yazmalı", async ({ page, db }) => {
  await openCommunity(page, "manage", "settings");
  const basic = page.locator("section[aria-labelledby='settings-basic-title']");
  const save = basic.getByRole("button", { name: "Kaydet", exact: true });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  assert.equal(await basic.getByText("Kim mesaj yazabilir", { exact: true }).count(), 0, "who-can-post is a CHAT setting, not a community setting");
  await basic.getByText(/Sohbetle ilgili ayarlar/).waitFor();
  await basic.getByRole("link", { name: "Sohbet ayarlarını aç" }).waitFor();
  await page.getByLabel("Topluluk adı").fill("   ");
  await page.getByText("Topluluk adı boş olamaz.").waitFor();
  await save.click({ force: true });
  assert.equal(calls(db, "rpc/update_chat_group").length, 0, "invalid name never reaches the server");
  await page.getByLabel("Topluluk adı").fill("Yeni Ad");
  await save.click();
  await page.getByText("Topluluk ayarları kaydedildi.").waitFor();
  const patch = calls(db, "rpc/update_chat_group")[0].body.p_patch;
  assert.deepEqual(Object.keys(patch).sort(), ["name"]);
  await page.getByRole("button", { name: "Topluluğu sil" }).click();
  await dlg(page).getByRole("heading", { name: "Topluluk silinsin mi?" }).waitFor();
  const confirmBtn = dlg(page).getByRole("button", { name: "Topluluğu sil" });
  assert.equal(await confirmBtn.isDisabled(), true, "needs the group name typed");
  await dlg(page).getByLabel(/Onaylamak için topluluk adını yaz/).fill("Yeni Ad");
  assert.equal(await confirmBtn.isDisabled(), false);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("21b. Sohbet ayarları (bilgi penceresi): kim yazabilir kaydedilir ve yalnızca posting_policy gider", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Sohbet ayarları" }).click();
  const save = dlg(page).getByRole("button", { name: "Kaydet", exact: true });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await dlg(page).getByRole("radio", { name: /Yalnızca yöneticiler/ }).check();
  await save.click();
  await page.getByText("Topluluk ayarları kaydedildi.").waitFor();
  const patch = calls(db, "rpc/update_chat_group")[0].body.p_patch;
  assert.deepEqual(patch, { posting_policy: "admins" });
  assert.equal(db.groups[0].posting_policy, "admins");
}, { setup: (db) => seed(db, { myRole: "admin" }) });

// 23
await scenario("23. Owner · sohbet ayarları: geçmiş görünürlüğü + üye sabitleme bilgi penceresinde; yalnızca değişenler kaydedilir; rol yetkileri burada YOK", async ({ page, db }) => {
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Sohbet ayarları" }).click();
  await dlg(page).getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).waitFor();
  assert.equal(await dlg(page).getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).count(), 0, "role permissions are a COMMUNITY setting");
  const save = dlg(page).getByRole("button", { name: "Sahip ayarlarını kaydet" });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await dlg(page).getByRole("radio", { name: /Görsün/ }).check();
  await save.dblclick();
  await page.getByText("Sahip ayarları kaydedildi.").waitFor();
  const sent = calls(db, "rpc/update_chat_group_owner_settings");
  assert.equal(sent.length, 1, "double click sends one request");
  assert.deepEqual(sent[0].body.p_patch, { history_visible: true });
  assert.equal(db.groups[0].history_visible, true);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("23c. Owner · topluluk yetkileri (Yönet → Ayarlar): rol yetkileri burada; yalnızca değişenler kaydedilir; varsayılana dön", async ({ page, db }) => {
  await openCommunity(page, "manage", "settings");
  await page.getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).count(), 0, "history visibility is a CHAT setting");
  const save = page.getByRole("button", { name: "Sahip ayarlarını kaydet" });
  assert.equal(await save.isDisabled(), true, "nothing changed yet");
  await page.getByRole("switch", { name: "Moderatör: Topluluk ayarlarını düzenleme" }).click();
  await page.getByRole("switch", { name: "Yönetici: Üye yasaklama" }).click();
  assert.equal(await page.getByRole("switch", { name: /Moderatör: Rol atama/ }).count(), 0, "moderators can't be given role assignment");
  await save.dblclick();
  await page.getByText("Sahip ayarları kaydedildi.").waitFor();
  const sent = calls(db, "rpc/update_chat_group_owner_settings");
  assert.equal(sent.length, 1, "double click sends one request");
  assert.deepEqual(sent[0].body.p_patch, { role_permissions: { admin: { ban_members: false }, moderator: { edit_settings: true } } });
  assert.equal(db.groups[0].role_permissions.moderator.edit_settings, true);
  assert.equal(db.groups[0].role_permissions.moderator.manage_requests, true, "untouched flags are kept");
  await page.getByRole("button", { name: "Varsayılan yetkilere dön" }).click();
  await save.click();
  await page.waitForTimeout(300);
  assert.equal(calls(db, "rpc/update_chat_group_owner_settings").length, 2);
  assert.equal(db.groups[0].role_permissions.admin.ban_members, true);
  assert.equal(db.groups[0].role_permissions.moderator.edit_settings, false);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("23b. Owner değilse sahip ayarları ve tehlikeli bölge görünmez (admin): ne topluluk sayfasında ne sohbet penceresinde", async ({ page }) => {
  await openCommunity(page, "manage", "settings");
  await page.getByLabel("Topluluk adı").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Topluluğu sil" }).count(), 0);
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Sohbet ayarları" }).click();
  await dlg(page).locator("#chat-posting-title").waitFor();
  assert.equal(await dlg(page).getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).count(), 0);
}, { setup: (db) => seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.carol, "moderator"], [U.dave, "member"]] }) });

// 24
await scenario("24. Yetkiye göre: moderatöre ayar yetkisi verilince topluluk Ayarlar'ı (görünürlük ve sahip bölümleri yok) ve sohbet penceresinde 'Sohbet ayarları' (yalnız kim yazabilir) açılır", async ({ page }) => {
  await openCommunity(page, "manage");
  // Yönetim bölümleri ikinci menüdür (docs/history/235-*).
  await page.locator("[data-section-menu]").nth(1).click();
  assert.deepEqual((await page.getByRole("radiogroup", { name: "Yönetim bölümleri" }).getByRole("radio").allInnerTexts()).map((t) => t.split("\n")[0].trim()), ["Ayarlar", "Moderasyon"]);
  await page.getByRole("radio", { name: "Ayarlar" }).click();
  await page.getByLabel("Topluluk adı").waitFor();
  assert.equal(await page.getByRole("radio", { name: /^Herkese açık/ }).count(), 0, "no visibility without that permission");
  assert.equal(await page.getByRole("heading", { name: "Yönetici ve moderatör yetkileri" }).count(), 0);
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Sohbet ayarları" }).click();
  await dlg(page).locator("#chat-posting-title").waitFor();
  assert.equal(await dlg(page).getByRole("heading", { name: "Yeni üyeler önceki mesajları görsün mü?" }).count(), 0, "history is owner-only");
}, { setup: (db) => { seed(db, { myRole: "moderator", members: [[U.bob, "owner"], [U.dave, "member"]] }); db.groups[0].role_permissions.moderator.edit_settings = true; } });

await scenario("24b. Başvuru yönetimi moderatörden alınınca Üyeler'de istek bölümü, başlık rozeti ve pencere kısa yolu kalkar", async ({ page }) => {
  await openCommunity(page, "members", "requests");
  await page.locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await page.getByRole("tab", { name: /Katılım istekleri/ }).count(), 0);
  assert.equal(await page.locator("[data-pending-requests]").count(), 0);
  await openThread(page);
  assert.equal(await page.locator("[data-community-link-badge]").count(), 0, "no count badge without the capability");
  await openInfo(page);
  assert.equal(await dlg(page).locator("[data-info-requests-link]").count(), 0);
}, { setup: (db) => { seed(db, { myRole: "moderator", members: [[U.bob, "owner"], [U.dave, "member"]], pending: 2 }); db.groups[0].role_permissions.moderator.manage_requests = false; } });

await scenario("24c. Admin: yasak yetkisi alınınca çıkarma penceresinde 'engelle' seçeneği çıkmaz", async ({ page }) => {
  await openCommunity(page, "members");
  await page.getByRole("button", { name: "Dave için işlemler" }).click();
  await page.getByRole("menuitem", { name: "Topluluktan çıkar" }).click();
  await page.getByRole("heading", { name: "Dave topluluktan çıkarılsın mı?" }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /Tekrar katılmasını engelle/ }).count(), 0);
}, { setup: (db) => { seed(db, { myRole: "admin", members: [[U.bob, "owner"], [U.dave, "member"]] }); db.groups[0].role_permissions.admin.ban_members = false; } });

// 25 — topluluk sayfası ↔ sohbet bütünleşmesi
await scenario("25. Eski/bildirim bağlantısı ?panel=requests topluluk sayfasındaki istek listesine yönlenir (sohbet penceresi açılmaz)", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${G}&panel=requests`);
  await page.waitForURL(/communities\/local\/?\?id=.*tab=members.*section=requests/);
  await page.locator("ul[aria-label='Bekleyen katılım istekleri'] li").first().waitFor();
  assert.equal(await page.locator("#group-info-title").count(), 0);
}, { setup: (db) => { seed(db, { myRole: "moderator", members: [[U.bob, "admin"], [U.dave, "member"]], pending: 1 }); db.requests.push({ id: "e0000000-0000-4000-8000-000000000001", group_id: G, user_id: U.erin.id, message: null, status: "pending", created_at: db.stamp() }); } });

await scenario("25b. ?panel=settings sohbet ayarlarını bilgi penceresinde açar; ?panel=members üyeleri açık başlatır", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${G}&panel=settings`);
  await dlg(page).locator("#group-info-title").waitFor();
  await dlg(page).locator("#chat-posting-title").waitFor();
}, { setup: (db) => seed(db, { myRole: "admin" }) });

await scenario("26. Topluluk sayfası: yetkiliye başlıkta 'N bekleyen istek' kısayolu + Üyeler sekmesinde sayaç; üyeye ve 0 istekte hiçbiri yok", async ({ page, db }) => {
  await openCommunity(page);
  const chip = page.locator("[data-community-actions] [data-pending-requests]");
  await chip.getByText("2 bekleyen istek").waitFor();
  assert.match(await optionText(page, /Üyeler/), /2/, "pending count on the Üyeler section");
  assert.equal(await tabIsActive(page, "Akış"), true, "the feed stays the landing tab");
  await chip.click();
  await page.waitForURL(/tab=members.*section=requests/);
  await page.locator("ul[aria-label='Bekleyen katılım istekleri'] li").first().waitFor();
  await page.getByRole("button", { name: "Erin isteğini kabul et" }).click();
  await page.getByText("Erin topluluğa kabul edildi.").waitFor();
  assert.equal(calls(db, "rpc/decide_chat_group_join_request").length, 1);
}, { setup: (db) => { seed(db, { myRole: "admin", members: [[U.dave, "member"]], pending: 2 }); db.requests.push({ id: "e0000000-0000-4000-8000-000000000001", group_id: G, user_id: U.erin.id, message: null, status: "pending", created_at: db.stamp() }, { id: "e0000000-0000-4000-8000-000000000002", group_id: G, user_id: U.zed.id, message: null, status: "pending", created_at: db.stamp() }); } });

await scenario("26b. Sıradan üye ve istek yokken: başlıkta kısayol, sayaç ve sohbet rozeti çizilmez", async ({ page }) => {
  await openCommunity(page);
  assert.equal(await page.locator("[data-pending-requests]").count(), 0);
  await openThread(page);
  assert.equal(await page.locator("[data-community-link-badge]").count(), 0);
}, { setup: (db) => seed(db, { myRole: "member", pending: 3 }) });

await scenario("27. Topluluk ↔ sohbet geçişi: başlıktaki 'Sohbeti aç' sohbeti, bilgi sayfasındaki 'Topluluk sayfası' karosu topluluk sayfasını açar", async ({ page }) => {
  await openCommunity(page);
  await page.locator("[data-community-actions] a[data-open-chat]").click();
  await page.waitForURL(/messages\/local\/?\?id=/);
  await openInfo(page);
  await dlg(page).locator("[data-info-community-link]").click();
  await page.waitForURL(/communities\/local\/?\?id=/);
  assert.equal(await tabIsActive(page, "Akış"), true);
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("28. Hakkında: kişiye özel tercihler (topluluk bildirim düzeyi + sohbeti sessize al + ayrıl) topluluk sayfasında; sessize alma bilgi penceresiyle AYNI durumu değiştirir", async ({ page, db }) => {
  await openCommunity(page, "about");
  await page.getByRole("radiogroup", { name: "Topluluk bildirimleri" }).waitFor();
  await page.getByRole("switch", { name: /Topluluğu sessize al/ }).click();
  await page.getByText("Topluluk sessize alındı.").waitFor();
  assert.ok(db.member(G, ME).muted_at, "mute is stored on MY membership row");
  await openThread(page); await openInfo(page);
  await dlg(page).getByRole("button", { name: "Sesi aç" }).waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: "Sesi aç" }).getAttribute("aria-pressed"), "true", "the chat panel reflects the same mute");
}, { setup: (db) => seed(db, { myRole: "member" }) });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
