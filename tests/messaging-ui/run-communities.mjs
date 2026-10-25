// Topluluk arayüz testleri (ağ taklitli) — docs/history/175-*. Çalıştırma: README.md.
// Gerçek Supabase'e/Realtime'a bağlanmaz: mock.mjs + mock-communities.mjs PostgREST'in kullanılan kısmını bellekte taklit eder.
// SQL/RLS doğrulaması `supabase/tests/communities.sql`'dir; burası arayüzün çağrılarını, durumlarını, erişim kapılarını ve i18n'i sınar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4175/promptly";
const server = await serve(4175);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const C1 = "e0000000-0000-4000-8000-0000000000a1";
const C2 = "e0000000-0000-4000-8000-0000000000a2";
const C3 = "e0000000-0000-4000-8000-0000000000a3";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme, guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

// Bölüm menüsü (docs/history/231-*, 232-*): sekmeler artık tek "Akış ▾ / Gönderiler ▾" menüsünün seçenekleridir.
const SECTION_OPTION = "[data-section-option]";
const optMatcher = (name) => (name instanceof RegExp ? name : new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const menuIsOpen = async (page) => (await page.locator(SECTION_OPTION).count()) > 0;
const menuOpen = async (page) => { if (!(await menuIsOpen(page))) { await page.locator("[data-section-menu]").first().click(); await page.locator(SECTION_OPTION).first().waitFor(); } };
const menuClose = async (page) => { if (await menuIsOpen(page)) { await page.keyboard.press("Escape"); await page.locator(SECTION_OPTION).first().waitFor({ state: "detached" }).catch(() => undefined); } };
const menuOption = (page, name) => page.locator(SECTION_OPTION).filter({ hasText: optMatcher(name) }).first();
const pickTab = async (page, name) => { await menuOpen(page); await menuOption(page, name).click(); };
const hasTab = async (page, name) => { if ((await page.locator("[data-section-menu]").count()) === 0) return false; await menuOpen(page); const found = (await page.locator(SECTION_OPTION).filter({ hasText: optMatcher(name) }).count()) > 0; await menuClose(page); return found; };
const waitTab = async (page, name) => { for (let i = 0; i < 40; i += 1) { if (await hasTab(page, name)) return; await page.waitForTimeout(150); } assert.fail(`section "${name}" never appeared`); };
const waitNoTab = async (page, name) => { for (let i = 0; i < 40; i += 1) { if (!(await hasTab(page, name))) return; await page.waitForTimeout(150); } assert.fail(`section "${name}" never went away`); };
const tabIsActive = async (page, name) => { await menuOpen(page); const active = (await menuOption(page, name).getAttribute("aria-checked")) === "true"; await menuClose(page); return active; };
const tabNames = async (page) => { if ((await page.locator("[data-section-menu]").count()) === 0) return []; await menuOpen(page); const names = (await page.locator(SECTION_OPTION).allInnerTexts()).map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()); await menuClose(page); return names; };

// Yönetim bölümleri (Özet · Ayarlar · Duyurular · Moderasyon · İşlem geçmişi) topluluk menüsünün ALTINDAKİ ikinci menüdür (docs/history/235-*).
const manageMenu = (page) => page.locator("[data-section-menu]").nth(1);
const pickManage = async (page, name) => { await manageMenu(page).click(); await page.getByRole("radio", { name: new RegExp("^" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click(); };
const manageNames = async (page) => { await manageMenu(page).click(); const names = (await page.getByRole("radiogroup", { name: /Yönetim bölümleri|Management sections/ }).getByRole("radio").allInnerTexts()).map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()); await page.keyboard.press("Escape"); await page.mouse.click(5, 5); return names; };
const dlg = (page) => page.getByRole("dialog").last();
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const open = async (page, id, tab) => { await page.goto(`${BASE}/communities/local?id=${id}${tab ? `&tab=${tab}` : ""}`); await page.locator("h1").first().waitFor(); await page.waitForTimeout(250); };
const seed = (db, opts = {}) => db.addCommunity(C1, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], ...opts });
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// 1
await scenario("1. Tüm topluluklar: tamamen kapalı topluluk listelenmez; kartta üye sayısı, kategori ve görünürlük; ana sayfa sekmeleri yenidir", async ({ page }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("heading", { name: "Tüm topluluklar", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Prompt Atölyesi" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Gizli Kulüp" }).count(), 0, "private communities are never listed");
  const card = page.locator("li", { hasText: "Prompt Atölyesi" }).first();
  await card.getByText("Görsel", { exact: true }).waitFor();
  await card.getByText("Herkese açık").waitFor();
  await card.getByText("4 üye").waitFor();
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Topluluklar", level: 1 }).waitFor();
  assert.deepEqual(await tabNames(page), ["Gönderiler", "Keşfet", "Davet ve başvurular"]);
  assert.equal(await page.getByRole("tab", { name: "Kaydedilenler" }).count(), 0, "the save feature is gone");
}, { setup: (db) => { db.addCommunity(C2, { name: "Prompt Atölyesi", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"], [U.dave, "member"], [U.amy, "member"]] }); db.addCommunity(C3, { name: "Gizli Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] }); } });

// 2
await scenario("2. Tüm topluluklar: arama ve kategori süzgeci sunucuya iletilir; boş sonuç ve hata/yeniden dene durumları", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("heading", { name: "Görsel Topluluk" }).waitFor();
  await page.getByRole("heading", { name: "Ses Topluluğu" }).waitFor();
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.getByRole("heading", { name: "Görsel Topluluk" }).waitFor({ state: "detached" });
  assert.ok(calls(db, "browse_communities", "RPC").some((c) => c.body.p_category === "audio"));
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await page.getByPlaceholder("Topluluk, konu veya etiket ara…").fill("zzzz");
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
  assert.ok(calls(db, "browse_communities", "RPC").some((c) => c.body.p_query === "zzzz"), "typing a query uses the browse RPC (public + restricted communities)");
  let fail = true;
  db.rpc.browse_communities = () => (fail ? { status: 500, body: { message: "boom" } } : { body: [] });
  await page.getByPlaceholder("Topluluk, konu veya etiket ara…").fill("yeni");
  await page.getByText("Topluluklar yüklenemedi.").waitFor();
  fail = false;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
}, { setup: (db) => { db.addCommunity(C2, { name: "Görsel Topluluk", category: "image", myRole: "none", members: [[U.bob, "owner"]] }); db.addCommunity(C3, { name: "Ses Topluluğu", category: "audio", myRole: "none", members: [[U.bob, "owner"]] }); } });

// 3
await scenario("3. Katıl (kural yok): tek istek, kabul bayrağı yok; topluluk sayfasına gider ve üye olur", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("button", { name: "Açık Topluluk topluluğuna katıl" }).dblclick();
  await page.locator("li", { hasText: "Açık Topluluk" }).getByRole("button", { name: /Katıldın/ }).waitFor();
  const made = calls(db, "join_community", "RPC");
  assert.equal(made.length, 1, "double click sends one request");
  assert.equal(made[0].body.p_accept_rules, false);
  assert.ok(db.member(C2, ME));
  assert.match(page.url(), /\/communities\/all\/?$/, "joining from a card keeps you on the list");
}, { setup: (db) => db.addCommunity(C2, { name: "Açık Topluluk", myRole: "none", members: [[U.bob, "owner"]] }) });

// 4
await scenario("4. Katıl (kurallar zorunlu): kural metni gösterilir, onay kutusu işaretlenmeden katılınamaz; kabulle p_accept_rules=true", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("button", { name: "Kurallı Topluluk topluluğuna katıl" }).click();
  const d = dlg(page);
  await d.getByText("Kural 1: nazik ol").waitFor();
  const confirm = d.getByRole("button", { name: "Kabul et ve katıl" });
  assert.equal(await confirm.isDisabled(), true, "disabled until the checkbox is ticked");
  assert.equal(calls(db, "join_community", "RPC").length, 0);
  await d.getByRole("checkbox").check();
  await confirm.click();
  await page.locator("li", { hasText: "Kurallı Topluluk" }).getByRole("button", { name: /Katıldın/ }).waitFor();
  assert.equal(calls(db, "join_community", "RPC")[0].body.p_accept_rules, true);
  assert.ok(db.member(C2, ME));
}, { setup: (db) => db.addCommunity(C2, { name: "Kurallı Topluluk", myRole: "none", rules: "Kural 1: nazik ol", rulesRequired: true, members: [[U.bob, "owner"]] }) });

// 5
await scenario("5. Davetler: kabul edilince topluluğa gidilir (kurallı davette önce kurallar onaylanır); reddet tek istek", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=invites`);
  await page.getByRole("heading", { name: "Davetli Topluluk" }).waitFor();
  await page.getByText("Bob davet etti").first().waitFor();
  await page.locator("li", { hasText: "Reddedilecek" }).getByRole("button", { name: "Reddet" }).click();
  await page.getByText("Davet reddedildi.").waitFor();
  assert.equal(calls(db, "respond_community_invitation", "RPC")[0].body.p_accept, false);
  await page.locator("li", { hasText: "Davetli Topluluk" }).getByRole("button", { name: "Kabul et" }).click();
  await dlg(page).getByText("Kural: saygılı ol").waitFor();
  await dlg(page).getByRole("checkbox").check();
  await dlg(page).getByRole("button", { name: "Kabul et ve katıl" }).click();
  await page.waitForURL(/communities\/local\/?\?id=/);
  const accepted = calls(db, "respond_community_invitation", "RPC").find((c) => c.body.p_accept);
  assert.equal(accepted.body.p_accept_rules, true);
  assert.ok(db.member(C2, ME));
}, {
  setup: (db) => {
    db.addCommunity(C2, { name: "Davetli Topluluk", visibility: "private", myRole: "none", rules: "Kural: saygılı ol", rulesRequired: true, members: [[U.bob, "owner"]] });
    db.addCommunity(C3, { name: "Reddedilecek", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
    db.invitations.push({ id: "f0000000-0000-4000-8000-000000000001", group_id: C2, invitee_id: ME, inviter_id: U.bob.id, status: "pending", created_at: db.stamp(), expires_at: "2099-01-01T00:00:00Z" });
    db.invitations.push({ id: "f0000000-0000-4000-8000-000000000002", group_id: C3, invitee_id: ME, inviter_id: U.bob.id, status: "pending", created_at: db.stamp(), expires_at: "2099-01-01T00:00:00Z" });
  },
});

// 6
await scenario("6. Başvurularım: yalnız kendi bekleyen başvurum; geri çekilir", async ({ page, db }) => {
  db.rpc.cancel_chat_group_join_request = (b) => { db.requests = db.requests.filter((r) => r.id !== b.p_request_id); return { body: null }; };
  await page.goto(`${BASE}/communities?tab=requests`);
  await page.getByText("Kapalı Kulüp").waitFor();
  assert.equal(await page.getByText("Başkasının").count(), 0, "other people's requests never show");
  await page.getByRole("button", { name: "Başvuruyu iptal et" }).click();
  await page.getByText("Bekleyen başvurun yok").waitFor();
}, {
  setup: (db) => {
    db.addCommunity(C2, { name: "Kapalı Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
    db.requests.push({ id: "f0000000-0000-4000-8000-000000000010", group_id: C2, user_id: ME, message: null, status: "pending", created_at: db.stamp() });
    db.requests.push({ id: "f0000000-0000-4000-8000-000000000011", group_id: C2, user_id: U.dave.id, message: "Başkasının", status: "pending", created_at: db.stamp() });
  },
});

// 7
await scenario("7. Üyesi olduklarım · Yönettiklerim: kapsamlar ayrı; karttaki 'Katıldın ▼' menüsünden ayrılınca kart listeden kalkar", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=mine`);
  await page.getByRole("heading", { name: "Üye Olduğum" }).waitFor();
  await page.getByRole("heading", { name: "Yönettiğim" }).waitFor();
  await page.goto(`${BASE}/communities?tab=managed`);
  await page.getByRole("heading", { name: "Yönettiğim" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Üye Olduğum" }).count(), 0, "plain membership is not 'managed'");
  await page.goto(`${BASE}/communities?tab=mine`);
  const card = page.locator("li", { hasText: "Üye Olduğum" });
  await card.getByRole("button", { name: /Üye Olduğum üyelik menüsü/ }).click();
  await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).click();
  await page.getByRole("heading", { name: "Üye Olduğum", exact: true }).waitFor({ state: "detached" });
  assert.equal(calls(db, "rpc/leave_chat_group").length, 1);
  assert.equal(db.member(C2, ME), undefined);
}, { setup: (db) => { db.addCommunity(C2, { name: "Üye Olduğum", myRole: "member", members: [[U.bob, "owner"]] }); db.addCommunity(C3, { name: "Yönettiğim", myRole: "admin", members: [[U.bob, "owner"]] }); } });

// 8
await scenario("8. Topluluk oluştur: boş ad → hata ve istek yok; geçerli → tek istek (çift tık) tüm alanlarla, topluluk sayfasına gider", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const d = dlg(page);
  await d.getByRole("heading", { name: "Topluluk oluştur" }).waitFor();
  await d.getByLabel("Topluluk adı").fill("   ");
  await d.getByRole("button", { name: "Topluluğu oluştur" }).click();
  await d.getByText("Topluluk adı boş olamaz.").waitFor();
  assert.equal(calls(db, "create_community", "RPC").length, 0);
  await d.getByLabel("Topluluk adı").fill("  Prompt Kulübü  ");
  await d.getByLabel("Açıklama (opsiyonel)").fill("Haftalık paylaşımlar");
  await d.getByLabel("Kategori").selectOption("workflow");
  await d.getByRole("radio", { name: /Herkese açık|Açık/ }).first().check();
  await d.getByLabel("Topluluk kuralları").fill("Saygılı ol.");
  await d.getByLabel(/Katılmadan önce kuralları kabul etmek/).check();
  await d.getByRole("button", { name: "Topluluğu oluştur" }).dblclick();
  await page.waitForURL(/communities\/local\/?\?id=/);
  const made = calls(db, "create_community", "RPC");
  assert.equal(made.length, 1, "double submit sends one request");
  assert.equal(made[0].body.p_name, "Prompt Kulübü");
  assert.equal(made[0].body.p_category, "workflow");
  assert.equal(made[0].body.p_rules, "Saygılı ol.");
  assert.equal(made[0].body.p_rules_required, true);
  assert.equal(calls(db, "create_chat_group", "RPC").length, 0, "the old standalone-group RPC is never called from the UI");
  await page.getByRole("heading", { name: "Prompt Kulübü", level: 1 }).waitFor();
});

await scenario("8b. Kurallar kabul zorunluyken kural metni boşsa oluşturulamaz", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const d = dlg(page);
  await d.getByLabel("Topluluk adı").fill("X Topluluk");
  await d.getByLabel(/Katılmadan önce kuralları kabul etmek/).check();
  await d.getByRole("button", { name: "Topluluğu oluştur" }).click();
  await d.getByText(/Kurallar en fazla 5000 karakter olabilir/).waitFor();
  assert.equal(calls(db, "create_community", "RPC").length, 0);
});

// 9
await scenario("9. Owner: beş sekme (Akış ilk, Sohbet sekme DEĞİL); başlıkta kategori, görünürlük, rol, açıklama; sohbet düğmesi", async ({ page }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Akış", "Etkinlikler", "Üyeler", "Hakkında ve kurallar", "Yönetim"]);
  assert.equal(await tabIsActive(page, "Akış"), true, "the feed is the landing tab");
  assert.equal(await page.getByRole("tab", { name: "Sohbet" }).count(), 0, "chat is an action in the header, not a tab");
  assert.equal(await page.getByRole("tab", { name: "Genel bakış" }).count(), 0, "the overview tab is gone");
  await page.locator("header, [data-community-actions]").getByText("Görsel", { exact: true }).waitFor();
  await page.locator("header, [data-community-actions]").getByText("Sahip", { exact: true }).waitFor();
  await page.locator("header [data-community-description]").waitFor();
  await page.locator("[data-community-actions] a", { hasText: "Sohbeti aç" }).waitFor();
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("10. Üye: Yönetim sekmesi yok; durum 'Üyesin' görünür", async ({ page }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Akış", "Etkinlikler", "Üyeler", "Hakkında ve kurallar"]);
  await page.locator("header, [data-community-actions]").getByRole("button", { name: /Katıldın/ }).waitFor();
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=manage`);
  await waitTab(page, "Akış");
  assert.equal(await hasTab(page, "Yönetim"), false, "forged ?tab=manage falls back for a plain member");
  // Sıradan üye kişi yönetimini görmez: Üyeler yalnız liste (istek/davet bölümü yok), zorlanan ?section=requests de sızdırmaz.
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=members&section=requests`);
  await page.locator("ul[aria-label='Topluluk üyeleri'] li").first().waitFor();
  assert.equal(await page.getByRole("tab", { name: /Katılım istekleri/ }).count(), 0);
  assert.equal(await page.locator("ul[aria-label='Bekleyen katılım istekleri']").count(), 0);
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("10b. Moderatör: Yönet yalnız yetkisi olan bölüm (moderasyon); katılım istekleri Üyeler sekmesinde (sayaçlı)", async ({ page }) => {
  await open(page, C1, "manage");
  await manageMenu(page).waitFor();
  assert.deepEqual(await manageNames(page), ["Moderasyon"]);
  assert.equal(await page.getByRole("tab", { name: /Katılım istekleri/ }).count(), 0, "requests are not under Manage any more");
  await pickTab(page, /Üyeler/);
  await page.getByRole("tab", { name: /Katılım istekleri/ }).waitFor();
  const sub = await page.getByRole("tablist").first().getByRole("tab").allInnerTexts();
  assert.deepEqual(sub.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()), ["Üyeler", "Katılım istekleri"]);
}, { setup: (db) => seed(db, { myRole: "moderator" }) });

// 11
await scenario("11. Üye olmayan, açık topluluk: salt-okunur sekmeler (Üyeler yok) + başlıkta Katıl düğmesi", async ({ page, db }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Akış", "Etkinlikler", "Hakkında ve kurallar"]);
  assert.equal(await page.getByRole("region", { name: "Üyelik durumu" }).count(), 0, "no duplicate join strip: the single join button lives in the header");
  await page.locator("header, [data-community-actions]").getByRole("button", { name: /topluluğuna katıl$/ }).click();
  await waitTab(page, "Üyeler");
  await page.locator("header, [data-community-actions]").getByRole("button", { name: /Katıldın/ }).waitFor();
  assert.equal(calls(db, "join_community", "RPC")[0].body.p_accept_rules, false);
}, { setup: (db) => seed(db, { myRole: "none" }) });

await scenario("11b. Kapalı topluluk, yalnız davetli: içerik/sohbet/üye listesi yok, yalnız davet kartı; kabul edince açılır", async ({ page, db }) => {
  await open(page, C1);
  assert.equal(await page.locator("[data-section-menu]").count(), 0, "no content tabs for a non-member of a private community");
  await page.getByText("Bob seni bu topluluğa davet etti").waitFor();
  await page.getByRole("button", { name: "Kabul et" }).click();
  await waitTab(page, "Akış");
  assert.ok(db.member(C1, ME));
}, { setup: (db) => { seed(db, { myRole: "none", visibility: "private" }); db.invitations.push({ id: "f0000000-0000-4000-8000-000000000003", group_id: C1, invitee_id: ME, inviter_id: U.bob.id, status: "pending", created_at: db.stamp(), expires_at: "2099-01-01T00:00:00Z" }); } });

await scenario("11c. Erişimi olmayan kapalı topluluk: 'bulunamadı' (varlığı sızmaz)", async ({ page, db }) => {
  db.groups = db.groups.map((g) => g); // satır var ama RLS taklidi: üye/davetli değilse okunamaz
  const original = db.groups.find((g) => g.id === C1);
  db.groups = db.groups.filter((g) => g.id !== C1);
  await page.goto(`${BASE}/communities/local?id=${C1}`);
  await page.getByText("Topluluk bulunamadı").waitFor();
  assert.ok(original);
}, { setup: (db) => seed(db, { myRole: "none", visibility: "private" }) });

await scenario("12. Kapatılmış topluluk: salt-okunur uyarısı; akışta paylaş düğmesi yok; owner yeniden açabilir", async ({ page, db }) => {
  await open(page, C1);
  await page.getByText(/Bu topluluk kapatılmış: salt-okunur/).waitFor();
  await page.locator("header, [data-community-actions]").getByText("Kapatıldı", { exact: true }).waitFor();
  await pickTab(page, "Akış");
  assert.equal(await page.getByRole("button", { name: "Gönderi oluştur" }).count(), 0);
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=manage&section=settings`);
  await page.getByRole("button", { name: "Yeniden aç" }).click();
  await dlg(page).getByRole("button", { name: "Yeniden aç" }).click();
  await page.getByText("Topluluk yeniden açıldı.").waitFor();
  assert.equal(db.groups.find((g) => g.id === C1).closed_at, null);
}, { setup: (db) => seed(db, { myRole: "owner", closed: true }) });

// 13 — akış
await scenario("13. Akış: sabit + normal gönderi; içerik kartı ve not görünür; erişilemeyen içerik yer tutucu gösterir", async ({ page }) => {
  await open(page, C1, "feed");
  await page.getByText("Sabit içerik").first().waitFor();
  await page.getByText("Normal içerik").first().waitFor();
  await page.getByText("Önemli not").waitFor();
  await page.getByText(/Bu içerik artık görüntülenemiyor/).waitFor();
  await page.getByText("bir prompt paylaştı").first().waitFor();
}, { setup: (db) => { seed(db, { myRole: "owner" }); db.addPost(C1, { title: "Sabit içerik", pinned: true, note: "Önemli not" }); db.addPost(C1, { title: "Normal içerik" }); db.addPost(C1, { title: "x", gone: true }); } });

await scenario("13b. Paylaş: yalnız KENDİ herkese açık içerikler listelenir (özel olan yok); seçip paylaşınca tek istek; aynı içerik tekrar paylaşılamaz", async ({ page, db }) => {
  await open(page, C1, "feed");
  await page.getByRole("button", { name: "Gönderi oluştur" }).click();
  await dlg(page).getByRole("button", { name: /Mevcut içeriğe başvur/ }).click();
  const d = dlg(page);
  await d.getByText("Açık Prompt").waitFor();
  assert.equal(await d.getByText("Özel Prompt").count(), 0, "private content is never offered");
  await d.getByRole("radio").first().check();
  await d.getByLabel(/Not/).fill("Denemeni bekliyorum");
  await d.getByRole("button", { name: "Paylaş", exact: true }).dblclick();
  await page.getByText("İçerik toplulukta paylaşıldı.").waitFor();
  const shared = calls(db, "share_to_community", "RPC");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].body.p_content_type, "prompt");
  assert.equal(shared[0].body.p_note, "Denemeni bekliyorum");
  await page.getByRole("button", { name: "Gönderi oluştur" }).click();
  await dlg(page).getByRole("button", { name: /Mevcut içeriğe başvur/ }).click();
  await dlg(page).getByRole("radio").first().check();
  await dlg(page).getByRole("button", { name: "Paylaş", exact: true }).click();
  await dlg(page).getByText("Bu içerik bu toplulukta zaten paylaşılmış.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.ownContent.prompt.push({ id: "aaaaaaaa-0000-4000-8000-000000000001", title: "Açık Prompt", visibility: "public" }, { id: "aaaaaaaa-0000-4000-8000-000000000002", title: "Özel Prompt", visibility: "private" }); } });

await scenario("13c. Paylaşma politikası 'yalnız kadro': üyede düğme yok + açıklama; kadroda var", async ({ page }) => {
  await open(page, C1, "feed");
  await page.getByText("Bu akışta yalnızca yönetim kadrosu paylaşım yapabilir.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Gönderi oluştur" }).count(), 0);
}, { setup: (db) => seed(db, { myRole: "member", feedPolicy: "admins" }) });

await scenario("13d. Gönderi menüsü: yazar kendi gönderisini kaldırır (içerik silinmez); başkasında 'bildir' var, 'kaldır' yok (üye)", async ({ page, db }) => {
  await open(page, C1, "feed");
  const mine = page.locator("li", { hasText: "Benim gönderim" }).first();
  await mine.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Gönderimi kaldır" }).click();
  await dlg(page).getByRole("button", { name: "Sil" }).click();
  await page.getByText("Gönderi kaldırıldı.").first().waitFor();
  assert.equal(calls(db, "delete_community_post", "RPC").length, 1);
  const theirs = page.locator("li", { hasText: "Başkasının gönderisi" }).first();
  await theirs.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Topluluk yöneticilerine bildir" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: /Gönderiyi kaldır \(yönetici\)/ }).count(), 0);
  await page.getByRole("menuitem", { name: "Topluluk yöneticilerine bildir" }).click();
  await dlg(page).getByLabel("Neden?").fill("Uygunsuz içerik");
  await dlg(page).getByRole("button", { name: "Bildir" }).click();
  await page.getByText("Bildirimin yöneticilere iletildi.").waitFor();
  assert.equal(calls(db, "report_community_content", "RPC")[0].body.p_kind, "post");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Benim gönderim" }); db.addPost(C1, { author: U.bob, title: "Başkasının gönderisi" }); } });

await scenario("13e. Moderatör: başkasının gönderisini sebeple kaldırır; sabitleme sınırı hatası gösterilir", async ({ page, db }) => {
  await open(page, C1, "feed");
  const row = page.locator("li", { hasText: "Kaldırılacak" }).first();
  await row.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: /Gönderiyi kaldır \(yönetici\)/ }).click();
  await dlg(page).getByLabel(/Sebep/).fill("spam");
  await dlg(page).getByRole("button", { name: "Kaldır" }).click();
  await page.getByText("Gönderi kaldırıldı.").first().waitFor();
  assert.equal(calls(db, "moderate_community_post", "RPC")[0].body.p_reason, "spam");
  const pinRow = page.locator("li", { hasText: "Sabitlenecek" }).first();
  await pinRow.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Akışın başına sabitle" }).click();
  await page.getByText("En fazla 3 öğe sabitlenebilir. Önce birini kaldır.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "moderator" }); db.addPost(C1, { author: U.dave, title: "Kaldırılacak" }); db.addPost(C1, { author: U.dave, title: "Sabitlenecek" }); for (let i = 0; i < 3; i++) db.addPost(C1, { author: U.dave, title: `Zaten sabit ${i}`, pinned: true }); } });

// 14 — duyurular
await scenario("14. Duyuru: Yönet → Duyurular'dan yayınla (sohbette de), listede görünür; düzenle; sil. Akış özetinde yönetim düğmesi yok", async ({ page, db }) => {
  await open(page, C1, "manage&section=announcements");
  await page.getByRole("button", { name: "Duyuru yayınla" }).click();
  const d = dlg(page);
  await d.getByLabel("Başlık").fill("Haftalık buluşma");
  await d.getByLabel("Duyuru metni").fill("Cuma 20:00");
  await d.getByLabel(/Sohbette de bağlantılı duyuru/).check();
  await d.getByRole("button", { name: "Duyuru yayınla" }).dblclick();
  await page.getByText("Duyuru yayınlandı.").waitFor();
  const made = calls(db, "publish_community_announcement", "RPC");
  assert.equal(made.length, 1);
  assert.deepEqual([made[0].body.p_title, made[0].body.p_post_to_chat, made[0].body.p_notify], ["Haftalık buluşma", true, true]);
  assert.ok(db.messages.some((m) => m.announcement_id && m.body === "Haftalık buluşma"), "linked chat message exists");
  await page.getByRole("heading", { name: "Haftalık buluşma" }).waitFor();
  await page.getByRole("button", { name: "Düzenle" }).click();
  await dlg(page).getByLabel("Başlık").fill("Haftalık buluşma (güncel)");
  await dlg(page).getByRole("button", { name: "Kaydet" }).click();
  await page.getByText("Duyuru güncellendi.").waitFor();
  await page.getByRole("button", { name: "Sil" }).click();
  await dlg(page).getByRole("button", { name: "Sil" }).click();
  await page.getByText("Henüz duyuru yok.").waitFor();
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("14b. Üye duyuruyu akışın üstündeki özette okur ama yayınlama/düzenleme/silme kontrolleri görünmez; duyuru yoksa özet hiç çizilmez", async ({ page }) => {
  await open(page, C1);
  await page.getByRole("heading", { name: "Mevcut duyuru" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Duyuru yayınla" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Düzenle" }).count(), 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.announcements.push({ id: "11111111-aaaa-4000-8000-000000000001", community_id: C1, author_id: U.bob.id, title: "Mevcut duyuru", body: "Gövde", pinned: true, created_at: db.stamp(), edited_at: null }); } });

// 15 — etkinlikler
await scenario("15. Etkinlik: oluştur (saat dilimi duvar saati → doğru ISO an), cevap ver (Katılacağım/Belki; tekrar tıkla = geri al), iptal et", async ({ page, db }) => {
  await open(page, C1, "events");
  await page.getByRole("button", { name: "Etkinlik oluştur" }).first().click();
  const d = dlg(page);
  await d.getByLabel("Etkinlik adı").fill("Canlı yayın");
  await d.getByLabel("Saat dilimi").selectOption("Europe/Istanbul");
  const future = new Date(Date.now() + 3 * 86400000);
  const local = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, "0")}-${String(future.getUTCDate()).padStart(2, "0")}T19:30`;
  await d.getByLabel("Başlangıç").fill(local);
  await d.getByLabel(/Çevrim içi bağlantı/).fill("https://example.com/live");
  await d.getByRole("button", { name: "Etkinlik oluştur" }).click();
  await page.getByText("Etkinlik oluşturuldu.").waitFor();
  const made = calls(db, "create_community_event", "RPC")[0].body;
  assert.equal(made.p_timezone, "Europe/Istanbul");
  assert.equal(made.p_starts_at, `${local.slice(0, 10)}T16:30:00.000Z`, "19:30 İstanbul = 16:30 UTC");
  await page.getByRole("heading", { name: "Canlı yayın" }).waitFor();
  await page.getByRole("button", { name: "Katılacağım" }).click();
  await page.getByText("1 katılacak · 0 belki").waitFor();
  await page.getByRole("button", { name: "Belki" }).click();
  await page.getByText("0 katılacak · 1 belki").waitFor();
  await page.getByRole("button", { name: "Belki" }).click();
  await page.getByText("0 katılacak · 0 belki").waitFor();
  await page.getByRole("button", { name: "Etkinliği iptal et" }).click();
  await dlg(page).getByRole("button", { name: "Etkinliği iptal et" }).click();
  await page.getByText("Etkinlik iptal edildi.").first().waitFor();
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("15b. Etkinlik formu: geçmiş başlangıç ve bozuk bağlantı sunucuya gitmeden reddedilir", async ({ page, db }) => {
  await open(page, C1, "events");
  await page.getByRole("button", { name: "Etkinlik oluştur" }).first().click();
  const d = dlg(page);
  await d.getByLabel("Etkinlik adı").fill("Geçmiş");
  await d.getByLabel("Başlangıç").fill("2020-01-01T10:00");
  await d.getByLabel(/Çevrim içi bağlantı/).fill("javascript:alert(1)");
  await d.getByRole("button", { name: "Etkinlik oluştur" }).click();
  await d.getByText("Başlangıç gelecekte olmalı ve bitiş başlangıçtan sonra olmalı.").waitFor();
  await d.getByText("Geçerli bir http(s) bağlantısı gir.").waitFor();
  assert.equal(calls(db, "create_community_event", "RPC").length, 0);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("15c. Etkinlik: üye cevap verir ama oluşturma/iptal kontrolü yok; geçmiş sekmesi; iptal edilene cevap verilemez", async ({ page }) => {
  await open(page, C1, "events");
  await page.getByRole("heading", { name: "Yaklaşan Etkinlik" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Etkinlik oluştur" }).count(), 0);
  const cancelled = page.locator("li", { hasText: "İptal Edilmiş" });
  await cancelled.getByText("İptal edildi", { exact: true }).waitFor();
  assert.equal(await cancelled.getByRole("button", { name: "Katılacağım" }).count(), 0);
  await page.getByRole("tab", { name: "Geçmiş" }).click();
  await page.getByRole("heading", { name: "Eski Etkinlik" }).waitFor();
}, {
  setup: (db) => {
    seed(db, { myRole: "member" });
    const base = { community_id: C1, description: null, ends_at: null, timezone: "UTC", location: null, online_url: null, going_count: 0, maybe_count: 0, rsvps: {} };
    db.events.push({ ...base, id: "22222222-aaaa-4000-8000-000000000001", title: "Yaklaşan Etkinlik", starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), status: "scheduled" });
    db.events.push({ ...base, id: "22222222-aaaa-4000-8000-000000000002", title: "İptal Edilmiş", starts_at: new Date(Date.now() + 6 * 86400000).toISOString(), status: "cancelled" });
    db.events.push({ ...base, id: "22222222-aaaa-4000-8000-000000000003", title: "Eski Etkinlik", starts_at: new Date(Date.now() - 20 * 86400000).toISOString(), status: "scheduled" });
  },
});

// 16 — hakkında
await scenario("16. Hakkında: kurallar + kabul zorunluluğu etkisi; güncel sürüm kabul edilmediyse genel bakışta uyarı, kabul edince kalkar", async ({ page, db }) => {
  await open(page, C1);
  await page.getByText("Topluluk kuralları güncellendi").waitFor();
  await page.getByRole("button", { name: "Kuralları oku" }).click();
  await page.getByText("Yeni üyelerin kuralları kabul etmesi zorunludur.").waitFor();
  await page.getByText("Kural 1: nazik ol").waitFor();
  await page.getByRole("button", { name: "Kuralları kabul et" }).click();
  await page.getByText("Güncel kuralları kabul ettin.").waitFor();
  assert.equal(calls(db, "accept_community_rules", "RPC").length, 1);
}, { setup: (db) => seed(db, { myRole: "member", rules: "Kural 1: nazik ol", rulesRequired: true }) });

await scenario("16b. Bildirim tercihi: Tümü / Yalnızca önemli / Sessiz kendi üyelik satırına yazılır; süreli sessize alma", async ({ page, db }) => {
  await open(page, C1, "about");
  await page.getByRole("radio", { name: /Yalnızca önemli/ }).check();
  await page.getByText("Bildirim tercihin kaydedildi.").waitFor();
  assert.equal(db.member(C1, ME).notify_level, "important");
  await page.getByRole("button", { name: "Süreli sessize al" }).click();
  await page.getByRole("button", { name: "8 saat" }).click();
  await page.getByText(/tarihine kadar sessizde|Muted until|\d/).first().waitFor();
  assert.ok(db.member(C1, ME).notify_muted_until, "temporary mute stored");
  assert.ok(new Date(db.member(C1, ME).notify_muted_until) > new Date());
  const patches = calls(db, "conversation_members", "PATCH");
  assert.ok(patches.every((c) => !("role" in c.body)), "only the preference columns are written");
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("16c. Ayrılma: onay ister, çift tık tek istek, topluluklar sayfasına döner", async ({ page, db }) => {
  await open(page, C1, "about");
  await page.getByRole("button", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).dblclick();
  await page.waitForURL(/\/communities\/?$/);
  assert.equal(calls(db, "rpc/leave_chat_group").length, 1);
  assert.equal(db.member(C1, ME), undefined);
}, { setup: (db) => seed(db, { myRole: "member" }) });

// 17 — yönetim
await scenario("17. Yönetim · Özet: gerçek veriden sayılar, gizlilik notu; admin görür", async ({ page, db }) => {
  await open(page, C1, "manage");
  await page.getByRole("heading", { name: "Topluluk özeti" }).waitFor();
  await page.getByText("Sayılar gerçek kayıtlardan toplulaştırılarak hesaplanır.").waitFor();
  await page.getByText("Toplam üye").waitFor();
  await page.getByText("340").first().waitFor();
  assert.equal(calls(db, "community_stats", "RPC")[0].body.p_days, 30);
  await page.getByRole("tab", { name: "90 gün" }).click();
  await page.waitForTimeout(300);
  assert.ok(calls(db, "community_stats", "RPC").some((c) => c.body.p_days === 90));
  assert.equal(await page.locator("[role=img][aria-label*='toplam']").count(), 3, "three daily charts (new members, posts, messages) with accessible totals");
}, { setup: (db) => seed(db, { myRole: "admin" }) });

await scenario("17b. Yönetim · Moderasyon kuyruğu: reddet / içeriği kaldır; karar kuyruğu 'Kapanan'a taşır", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Moderasyon");
  await page.getByText("Uygunsuz içerik").first().waitFor();
  await page.getByRole("button", { name: "Reddet" }).first().click();
  await dlg(page).getByRole("button", { name: "Reddet" }).click();
  await page.getByText("Uygunsuz içerik").first().waitFor({ state: "detached" }).catch(() => undefined);
  const first = calls(db, "resolve_community_report", "RPC")[0].body;
  assert.equal(first.p_action, "dismiss");
  await page.getByRole("button", { name: "İçeriği kaldır" }).first().click();
  await dlg(page).getByRole("button", { name: "İçeriği kaldır" }).click();
  await page.getByText("Bekleyen rapor yok.").waitFor();
  assert.equal(calls(db, "resolve_community_report", "RPC")[1].body.p_action, "remove");
  await page.getByRole("tab", { name: "Kapanan" }).click();
  await page.getByText("Reddedildi").waitFor();
}, {
  setup: (db) => {
    seed(db, { myRole: "admin" });
    const post = db.addPost(C1, { author: U.dave, title: "Raporlanan içerik" });
    const other = db.addPost(C1, { author: U.dave, title: "İkinci içerik" });
    for (const [pid, reason] of [[post.id, "Uygunsuz içerik"], [other.id, "Spam gibi"]]) db.reports.push({ id: crypto.randomUUID(), community_id: C1, reporter_id: U.carol.id, target_kind: "post", post_id: pid, message_id: null, target_user_id: U.dave.id, reason, status: "open", resolution: null, created_at: db.stamp(), resolved_at: null });
  },
});

await scenario("17c. Yönetim · Ayarlar: yalnızca değişen alanlar gönderilir; kapatma onaylıdır; geçmiş sekmesi işlemleri listeler", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Ayarlar");
  await page.getByLabel("Kategori").selectOption("learning");
  await page.getByRole("tabpanel").getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.getByText("Ayarlar kaydedildi.").waitFor();
  assert.deepEqual(calls(db, "update_community", "RPC")[0].body.p_patch, { category: "learning" });
  await page.getByRole("button", { name: "Topluluğu kapat" }).click();
  await dlg(page).getByText("Tüm üyelere bildirim gider.").waitFor();
  await dlg(page).getByRole("button", { name: "Topluluğu kapat" }).click();
  await page.getByText("Topluluk kapatıldı.").waitFor();
  assert.equal(calls(db, "close_community", "RPC").length, 1);
  await pickManage(page, "İşlem geçmişi");
  await page.getByText("Bir gönderiyi akıştan kaldırdı").waitFor();
}, { setup: (db) => { seed(db, { myRole: "owner" }); db.audit.push({ id: crypto.randomUUID(), group_id: C1, action: "post_removed", actor_id: U.bob.id, target_user_id: U.dave.id, details: {}, created_at: db.stamp() }); } });

await scenario("17d. Yönetim · Kurallar: owner kural metnini ve kabul zorunluluğunu değiştirir (edit_rules); metin boşken kabul zorunlu kaydedilemez", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Ayarlar");
  await page.getByLabel("Topluluk kuralları").fill("");
  await page.getByLabel(/Katılmadan önce kuralları kabul etmek/).check();
  await page.getByRole("tabpanel").getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.getByText(/kabul zorunluysa kural metni boş bırakılamaz/).waitFor();
  assert.equal(calls(db, "update_community", "RPC").length, 0);
  await page.getByLabel("Topluluk kuralları").fill("Yeni kural");
  await page.getByRole("tabpanel").getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.getByText("Ayarlar kaydedildi.").waitFor();
  assert.deepEqual(calls(db, "update_community", "RPC")[0].body.p_patch, { rules: "Yeni kural", rules_required: true });
}, { setup: (db) => seed(db, { myRole: "owner" }) });

// 18 — sohbet entegrasyonu
await scenario("18. Sohbet: başlıktaki 'Sohbeti aç' Mesajlar çalışma alanına gider; sohbet başlığında topluluğa bağlantı var; eski ?tab=chat bağlantısı sohbete yönlenir", async ({ page }) => {
  await open(page, C1, "chat");
  await page.waitForURL(/messages\/local\/?\?id=/);
  await page.goBack();
  await page.waitForTimeout(300);
  await open(page, C1);
  await page.locator("header, [data-community-actions]").getByRole("link", { name: "Sohbeti aç" }).click();
  await page.waitForURL(/messages\/local\/?\?id=/);
  await page.getByRole("link", { name: "Topluluk sayfasına git" }).click();
  await page.waitForURL(/communities\/local\/?\?id=/);
}, { setup: (db) => seed(db, { myRole: "member", texts: [[U.bob, "Merhaba topluluk"]] }) });

await scenario("18b. Sohbette duyuru mesajı kart olarak çizilir ve duyuruya bağlanır; başkasının mesajı 'topluluk yöneticilerine bildir' sunar", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${C1}`);
  const card = page.locator("[data-announcement-card]");
  await card.waitFor();
  await card.getByText("Haftalık buluşma").waitFor();
  assert.match(await card.getAttribute("href"), /communities\/local\/?\?id=/);
  await page.getByText("normal mesaj").last().hover();
  await page.getByRole("button", { name: "Mesaj seçenekleri" }).last().click();
  await page.getByRole("menuitem", { name: "Topluluk yöneticilerine bildir" }).click();
  await dlg(page).getByLabel("Neden?").fill("Hakaret içeriyor");
  await dlg(page).getByRole("button", { name: "Bildir" }).click();
  await page.getByText("Bildirimin yöneticilere iletildi.").waitFor();
  const report = calls(db, "report_community_content", "RPC")[0].body;
  assert.equal(report.p_kind, "message");
  assert.ok(db.messages.some((m) => m.announcement_id));
}, { setup: (db) => { seed(db, { myRole: "member" }); const m = db.addMessage(C1, U.bob.id, "Haftalık buluşma"); m.announcement_id = "11111111-aaaa-4000-8000-000000000009"; db.addMessage(C1, U.dave.id, "normal mesaj"); } });

// 19 — geçiş / eski rotalar / mesajlar
await scenario("19. Eski rotalar: /groups?tab=invites → /communities?tab=invites; /groups → /communities; eski davet bağlantısı /groups/join#… çalışır", async ({ page, db }) => {
  await page.goto(`${BASE}/groups?tab=invites`);
  await page.waitForURL(/\/communities\/?\?tab=invites/);
  await page.goto(`${BASE}/groups`);
  await page.waitForURL(/\/communities\/?$/);
  await page.goto(`${BASE}/groups/join#${TOKEN}`);
  await page.getByRole("heading", { name: "Gizli Atölye" }).waitFor();
  await page.getByText("Bu topluluk kapalı: isteğin gönderilir ama bir yönetici kabul edene kadar üye olmazsın.").waitFor();
  await page.getByLabel(/Yöneticilere not/).fill("Merhaba");
  await page.getByRole("button", { name: "Katılma isteği gönder" }).dblclick();
  await page.getByText("Katılma isteğin gönderildi. Bir yönetici kabul ederse bildirim alırsın.").waitFor();
  assert.equal(calls(db, "join_community_via_link", "RPC").length, 1);
  assert.equal(db.member(C2, ME), undefined, "a request does not make anyone a member");
  assert.equal(db.requests.length, 1);
}, { setup: (db) => { db.addCommunity(C2, { name: "Gizli Atölye", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] }); db.groups.find((g) => g.id === C2).link_token = TOKEN; } });

await scenario("19b. Davet bağlantısı: kurallar sayfada görünür; kabul zorunluysa onay kutusu işaretlenmeden gönderilemez; geçersiz token hiçbir bilgi vermez", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/join#${TOKEN}`);
  await page.getByText("Kural: sessiz ol").waitFor();
  const submit = page.getByRole("button", { name: "Katılma isteği gönder" });
  assert.equal(await submit.isDisabled(), true);
  await page.getByRole("checkbox").check();
  await submit.click();
  await page.getByText("Katılma isteğin gönderildi. Bir yönetici kabul ederse bildirim alırsın.").waitFor();
  assert.equal(calls(db, "join_community_via_link", "RPC")[0].body.p_accept_rules, true);
  await page.goto("about:blank");
  await page.goto(`${BASE}/communities/join#BozukBozukBozukBozukBozukBozuk123`);
  await page.getByText("Bağlantı geçersiz", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Gizli Atölye" }).count(), 0, "an invalid link reveals nothing about any community");
}, { setup: (db) => { db.addCommunity(C2, { name: "Gizli Atölye", visibility: "private", myRole: "none", rules: "Kural: sessiz ol", rulesRequired: true, members: [[U.bob, "owner"]] }); db.groups.find((g) => g.id === C2).link_token = TOKEN; } });

await scenario("20. Mesajlar: 'Yeni sohbet' penceresinde 'Topluluklar' kısayolu var, 'Yeni grup' (bağımsız grup oluşturma) yok; liste başlığında Topluluklar bağlantısı", async ({ page, db }) => {
  await page.goto(`${BASE}/messages`);
  // Mesajlar menüsünde "Topluluk sohbetleri" satırı Topluluklar'a götürür (docs/history/234-*).
  await page.locator("[data-section-menu]:visible").first().click();
  await page.getByRole("radio", { name: "Topluluklara git" }).waitFor();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await page.locator("button[aria-label='Yeni sohbet başlat']:visible").first().click();
  await dlg(page).getByRole("link", { name: /Topluluklar — keşfet, katıl ve oluştur/ }).waitFor();
  assert.equal(await dlg(page).getByRole("button", { name: /Yeni topluluk|Yeni grup/ }).count(), 0, "no standalone group creation from Messages");
  assert.equal(calls(db, "create_chat_group", "RPC").length, 0);
});

await scenario("21. Birebir sohbet etkilenmez: profil menüsü, engelle/şikayet hâlâ var; topluluk kısayolu yalnız grup sohbetinde", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=c0000000-0000-4000-8000-0000000000c9`);
  await page.locator("button[aria-label='Profil seçenekleri']").waitFor();
  assert.equal(await page.getByRole("link", { name: "Topluluk sayfasına git" }).count(), 0);
}, { setup: (db) => db.addConv("c0000000-0000-4000-8000-0000000000c9", U.carol, { texts: ["hey"] }) });

// 22 — i18n / görünüm
await scenario("22. İngilizce: Topluluklar sayfası, detay sekmeleri, rapor/duyuru/etkinlik metinleri çevrilmiş", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Communities", level: 1 }).waitFor();
  assert.deepEqual(await tabNames(page), ["Posts", "Discover", "Managed", "Invitations & requests"]); // seed: owner → Managed tab visible
  await page.goto(`${BASE}/communities/all`);
  await page.getByPlaceholder("Search communities, topics or tags…").waitFor();
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Feed", "Events", "Members", "About & rules", "Manage"]);
  await page.locator("header, [data-community-actions]").getByRole("link", { name: "Open chat" }).waitFor();
  await open(page, C1, "manage&section=announcements");
  await page.getByRole("button", { name: "Publish announcement" }).waitFor();
  await pickTab(page, "Events");
  await page.getByRole("button", { name: "Create event" }).first().click();
  await dlg(page).getByLabel("Time zone").waitFor();
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await pickTab(page, "About & rules");
  await page.getByRole("heading", { name: "Community notifications" }).waitFor();
  await page.getByText("Important only").waitFor();
}, { lang: "en", setup: (db) => seed(db, { myRole: "owner" }) });

for (const [label, viewport, theme] of [["mobil 390x800", { width: 390, height: 800 }, undefined], ["mobil koyu tema", { width: 390, height: 800 }, "dark"], ["tablet 820x1100", { width: 820, height: 1100 }, undefined]]) {
  await scenario(`23. Düzen (${label}): liste, detay ve akış yatay taşmaz; sekme çubuğu kaydırılabilir; temel düğmeler ≥ 36px`, async ({ page }) => {
    await page.goto(`${BASE}/communities`);
    await page.getByText("Normal içerik").first().waitFor();
    assert.ok(await overflowFree(page), "communities home overflows horizontally");
    await open(page, C1);
    assert.ok(await overflowFree(page), "detail overflows horizontally");
    await pickTab(page, "Akış");
    await page.getByText("Normal içerik").first().waitFor();
    assert.ok(await overflowFree(page), "feed overflows horizontally");
    const heights = await page.locator("button:visible, a[class*='h-']:visible").evaluateAll((els) => els.slice(0, 40).map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.ok(heights.filter((h) => h > 0 && h < 28).length === 0, `tiny tap targets: ${heights.filter((h) => h > 0 && h < 28)}`);
  }, { viewport, theme, setup: (db) => { seed(db, { myRole: "member", name: "Prompt Atölyesi" }); db.addPost(C1, { title: "Normal içerik" }); } });
}


// 24 — üç görünürlük düzeyi, tek üyelik düğmesi, arama ve öneriler (docs/history/176-*)
const joinBtn = (scope) => scope.getByRole("button", { name: /topluluğuna katıl$/ });
const requestBtn = (scope) => scope.getByRole("button", { name: /topluluğuna katılma isteği gönder$/ });
const SEARCH = "Topluluk, konu veya etiket ara…"; // Tüm topluluklar (oturumlu)
const GUEST_SEARCH = "Topluluk ara (kapalı olanlar da çıkar)…"; // ziyaretçinin herkese açık listesi

await scenario("24. Başlıktaki tek üyelik düğmesi: Katıl → Katıldın ▼ → 'Topluluktan ayrıl' (onaylı, tek istek) → yeniden Katıl; 'Kaydet' düğmesi yok", async ({ page, db }) => {
  await open(page, C1);
  const head = page.locator("header, [data-community-actions]");
  assert.equal(await page.getByRole("button", { name: /^Kaydet(ildi)?$/ }).count(), 0, "the save button is gone");
  await joinBtn(head).click();
  const joined = head.getByRole("button", { name: /Katıldın/ });
  await joined.waitFor();
  await waitTab(page, "Üyeler");
  await joined.click();
  await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).dblclick();
  await joinBtn(head).waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 1, "double click sends one leave request");
  assert.equal(db.member(C1, ME), undefined);
  await waitNoTab(page, "Üyeler");
}, { setup: (db) => seed(db, { myRole: "none" }) });

await scenario("24b. Sahip 'Katıldın ▼' menüsünde ayrılamaz: öğe devre dışı ve neden yazar", async ({ page, db }) => {
  await open(page, C1);
  await page.locator("header, [data-community-actions]").getByRole("button", { name: /üyelik menüsü/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).isDisabled(), true);
  await page.getByText("Sahipsin: ayrılmadan önce sahipliği başka bir üyeye devret.").waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 0);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

const visibilitySetup = (db) => {
  db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
  db.addCommunity(C2, { name: "Kapalı Atölye", visibility: "restricted", category: "audio", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
  db.addCommunity(C3, { name: "Hayalet Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
};

await scenario("25. Tüm topluluklar: kapalı topluluk listelenir (Kapalı rozeti, içerik notu, 'istek gönder'), tamamen kapalı hiçbir yerde yok; aramada da yok", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("heading", { name: "Açık Atölye" }).waitFor();
  await page.getByRole("heading", { name: "Kapalı Atölye" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Hayalet Kulüp" }).count(), 0, "fully closed communities are not listed");
  await page.getByPlaceholder(SEARCH).fill("atölye");
  await page.waitForTimeout(700); // arama gecikmesi (300 ms) + sonuç
  const card = page.locator("li", { hasText: "Kapalı Atölye" });
  await card.waitFor();
  await card.getByText("Kapalı", { exact: true }).waitFor();
  await card.getByText("Kapalı topluluk: içerik yalnızca üyelere açık.").waitFor();
  await requestBtn(card).waitFor();
  await joinBtn(page.locator("li", { hasText: "Açık Atölye" })).waitFor();
  assert.ok(calls(db, "browse_communities", "RPC").some((c) => c.body.p_query === "atölye"));
  await page.getByPlaceholder(SEARCH).fill("hayalet");
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Hayalet Kulüp" }).count(), 0, "fully closed communities never show up in search");
}, { setup: visibilitySetup });

await scenario("25b. Kapalı topluluğa aramadan istek: tek istek, 'İstek gönderildi ▼', menüden geri çekilince yeniden 'İstek gönder'", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByPlaceholder(SEARCH).fill("kapalı");
  await page.waitForTimeout(700);
  const card = page.locator("li", { hasText: "Kapalı Atölye" });
  await requestBtn(card).dblclick();
  const sent = card.getByRole("button", { name: /İstek gönderildi/ });
  await sent.waitFor();
  await page.getByText("Katılma isteğin “Kapalı Atölye” yöneticilerine gönderildi.").waitFor();
  const made = calls(db, "request_join_community", "RPC");
  assert.equal(made.length, 1, "double click sends one request");
  assert.equal(made[0].body.p_accept_rules, false);
  assert.equal(db.requests.filter((r) => r.group_id === C2 && r.status === "pending").length, 1);
  assert.equal(calls(db, "join_community", "RPC").length, 0, "a private community is never joined directly");
  await sent.click();
  await page.getByRole("menuitem", { name: "İsteği geri çek" }).click();
  await requestBtn(card).waitFor();
  assert.equal(calls(db, "cancel_chat_group_join_request", "RPC").length, 1);
  assert.equal(db.requests.filter((r) => r.group_id === C2 && r.status === "pending").length, 0);
}, { setup: visibilitySetup });

await scenario("25c. Kapalı + kurallı topluluk: kural metni okunur, onay kutusu işaretlenmeden istek gitmez; kabulle p_accept_rules=true", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByPlaceholder(SEARCH).fill("kapalı");
  await page.waitForTimeout(700); // arama sonucu gelmeden pencere açılırsa liste yenilenirken kapanır
  await requestBtn(page.locator("li", { hasText: "Kapalı Atölye" })).click();
  const d = dlg(page);
  await d.getByText("Kural: nazik ol").waitFor();
  const confirm = d.getByRole("button", { name: "Kabul et ve istek gönder" });
  assert.equal(await confirm.isDisabled(), true);
  assert.equal(calls(db, "request_join_community", "RPC").length, 0);
  await d.getByRole("checkbox").check();
  await confirm.click();
  await page.locator("li", { hasText: "Kapalı Atölye" }).getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  assert.equal(calls(db, "request_join_community", "RPC")[0].body.p_accept_rules, true);
}, { setup: (db) => { visibilitySetup(db); const g = db.groups.find((x) => x.id === C2); Object.assign(g, { rules: "Kural: nazik ol", rules_required: true }); } });

await scenario("25d. Kapalı topluluk sayfası (üye değil): sekme yok, içerik yok, 'bu topluluk kapalı' açıklaması + başlıkta 'İstek gönder'; istek sonrası bekliyor durumu", async ({ page }) => {
  await open(page, C2);
  assert.equal(await page.locator("[data-section-menu]").count(), 0, "no content tabs before membership");
  await page.getByText("Bu topluluk kapalı", { exact: true }).waitFor();
  await page.locator("header, [data-community-actions]").getByText("Kapalı", { exact: true }).waitFor();
  await requestBtn(page.locator("header, [data-community-actions]")).click();
  await page.getByText("Katılma isteğin değerlendiriliyor").waitFor();
  await page.locator("header, [data-community-actions]").getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  assert.equal(await page.locator("[data-section-menu]").count(), 0, "a pending request still gives no content access");
}, { setup: visibilitySetup });

await scenario("25e. Tamamen kapalı topluluk: davetsiz kişi için sayfa 'bulunamadı' der; ad, katılma/istek düğmesi ya da ipucu görünmez", async ({ page }) => {
  // Davetsiz / başvurusuz kişi için tamamen kapalı topluluk "yok" gibidir (kart yok): ad, düğme ya da ipucu görünmez.
  await page.goto(`${BASE}/communities/local?id=${C3}`);
  await page.getByText("Topluluk bulunamadı").waitFor();
  assert.equal(await page.getByText("Hayalet Kulüp").count(), 0);
  assert.equal((await requestBtn(page).count()) + (await joinBtn(page).count()), 0, "no way to join or request a fully closed community from its page");
}, { setup: visibilitySetup });

await scenario("26. Öneriler (Keşfet şeridi): ortak kategori önce, kapalı topluluk önerilir (tamamen kapalı asla); önerilenden istek/katılma", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByRole("heading", { name: "Sana uygun topluluklar" }).waitFor();
  const items = page.getByTestId("suggestion-card");
  assert.equal(await items.count(), 2, "public + restricted suggested; fully closed and joined ones are not");
  assert.ok((await items.first().innerText()).includes("Resim Odası"), "same category as my community comes first");
  await items.first().getByText("Üye olduğun topluluklarla aynı konu").waitFor();
  await items.nth(1).getByText(/· Popüler$/).waitFor();
  const strip = page.getByTestId("suggestion-strip");
  assert.equal(await strip.getByText("Hayalet Kulüp").count(), 0);
  assert.equal(await strip.getByText("Üyesi Olduğum").count(), 0);
  assert.ok(calls(db, "recommend_communities", "RPC").length >= 1);
  await requestBtn(items.nth(1)).click();
  await items.nth(1).getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  await joinBtn(items.first()).click();
  await items.first().getByRole("button", { name: /Katıldın/ }).waitFor();
}, {
  setup: (db) => {
    db.suggestions = true;
    db.addCommunity(C1, { name: "Üyesi Olduğum", category: "image", myRole: "member", members: [[U.bob, "owner"]] });
    db.addCommunity(C2, { name: "Resim Odası", category: "image", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
    db.addCommunity(C3, { name: "Kapalı Ses", visibility: "restricted", category: "audio", myRole: "none", members: [[U.bob, "owner"]] });
    db.addCommunity("e0000000-0000-4000-8000-0000000000a4", { name: "Hayalet Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
  },
});

await scenario("27. Oluştur: üç görünürlük seçeneği (Herkese açık · Kapalı · Tamamen kapalı); 'Kapalı' seçimi p_visibility=restricted gönderir", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const d = dlg(page);
  assert.equal(await d.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ }).count(), 3);
  assert.equal(await d.getByRole("radio", { name: /^Tamamen kapalı/ }).isChecked(), true, "default stays fully closed (previous behaviour)");
  await d.getByLabel("Topluluk adı").fill("Kapalı Kulüp");
  await d.getByRole("radio", { name: /^Kapalı/ }).check();
  await d.getByRole("button", { name: "Topluluğu oluştur" }).click();
  await page.waitForURL(/communities\/local\/?\?id=/);
  assert.equal(calls(db, "create_community", "RPC")[0].body.p_visibility, "restricted");
});

await scenario("27b. Yönetim · Ayarlar: görünürlük seçicisi mevcut düzeyi vurgular; başka düzey seçmek ETKİSİNİ anlatan onay penceresi açar; vazgeçince değişmez; onaylayınca uygulanır", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Ayarlar");
  const publicRadio = page.getByRole("radio", { name: /^Herkese açık/ });
  assert.equal(await publicRadio.isChecked(), true, "current level is selected");
  await page.getByText("Şu anki", { exact: true }).waitFor();
  await page.getByRole("radio", { name: /^Kapalı/ }).click();
  await dlg(page).getByText("Gönderiler, duyurular ve etkinlikler hemen yalnızca üyelere açılır", { exact: false }).waitFor();
  await dlg(page).getByText("Mevcut üyeler topluluktan çıkarılmaz", { exact: false }).waitFor();
  await dlg(page).getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(calls(db, "rpc/set_chat_group_visibility").length, 0, "cancel changes nothing");
  assert.equal(await publicRadio.isChecked(), true);
  await page.getByRole("radio", { name: /^Kapalı/ }).click();
  await dlg(page).getByRole("button", { name: "Kapalı yap" }).click();
  await page.getByText("Topluluk kapalı yapıldı.").waitFor();
  assert.equal(calls(db, "rpc/set_chat_group_visibility")[0].body.p_visibility, "restricted");
  await page.getByRole("radio", { name: /^Kapalı/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /^Kapalı/ }).isChecked(), true);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("28. İngilizce: Katıl / İstek gönder / Katıldın menüsü, görünürlük adları, öneriler", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByRole("heading", { name: "Communities for you" }).waitFor();
  const sug = page.getByTestId("suggestion-strip");
  await sug.getByRole("button", { name: "Send a request to join Closed Atelier" }).waitFor();
  await sug.getByRole("button", { name: "Join the community Open Atelier" }).waitFor();
  await sug.getByText("Private", { exact: true }).waitFor();
  await sug.getByText("Public", { exact: true }).waitFor();
  await sug.getByRole("button", { name: "Join the community Open Atelier" }).click();
  await sug.getByRole("button", { name: /Joined/ }).click();
  await page.getByRole("menuitem", { name: "Leave community" }).waitFor();
}, {
  lang: "en",
  setup: (db) => {
    db.suggestions = true;
    db.addCommunity(C1, { name: "Open Atelier", visibility: "public", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
    db.addCommunity(C2, { name: "Closed Atelier", visibility: "restricted", category: "audio", myRole: "none", members: [[U.bob, "owner"]] });
  },
});


// 29 — gizlilik sıkılaştırması (docs/history/177-*): ziyaretçi, kart, görsel, seçici, odak yenileme
const LOGIN_TEXT = "Topluluğa katılmak ya da istek göndermek için giriş yap";
const guestSetup = (db) => {
  db.suggestions = true;
  db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
  db.addCommunity(C2, { name: "Kapalı Atölye", visibility: "restricted", category: "audio", myRole: "none", members: [[U.bob, "owner"]] });
  db.addCommunity(C3, { name: "Hayalet Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
  db.addPost(C1, { title: "Herkese açık gönderi" });
  db.addPost(C2, { title: "Kapalı gönderi" });
};

await scenario("29. Ziyaretçi (oturumsuz) · Topluluklar: yalnız Keşfet (herkese açık), öneri ve kişisel sekme yok; arama kapalıyı da bulur; katıl/istek/oluştur giriş diyaloğu açar ve HİÇBİR istek göndermez", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Topluluklar", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Açık Atölye" }).waitFor();
  // docs/history/212-*: a visitor gets no section row at all (the page is Keşfet) — and never the personal sections.
  const visitorTabs = await tabNames(page);
  for (const personal of ["Gönderiler", "Yönettiklerim", "Davet ve başvurular"]) assert.ok(!visitorTabs.includes(personal), `${personal} is personal`);
  for (const hidden of ["Kapalı Atölye", "Hayalet Kulüp"]) assert.equal(await page.getByRole("heading", { name: hidden }).count(), 0, `${hidden} is not in Discover`);
  assert.equal(await page.getByRole("heading", { name: "Senin için önerilenler" }).count(), 0, "suggestions are personal");
  assert.equal(await page.locator("#community-link-input").count(), 0, "no invite-link form for visitors");
  assert.equal(calls(db, "suggest_communities", "RPC").length, 0, "visitors never call the suggestion RPC");
  assert.equal(calls(db, "list_my_communities", "RPC").length, 0);
  await joinBtn(page.locator("li", { hasText: "Açık Atölye" })).click();
  await page.getByText(LOGIN_TEXT).waitFor();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder(GUEST_SEARCH).fill("atölye");
  const card = page.locator("li", { hasText: "Kapalı Atölye" });
  await card.waitFor();
  await card.getByText("Kapalı topluluk: içerik yalnızca üyelere açık.").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Hayalet Kulüp" }).count(), 0, "fully closed never shows in search");
  await requestBtn(card).click();
  await page.getByText(LOGIN_TEXT).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  assert.equal(await page.getByRole("button", { name: "Topluluğu oluştur" }).count(), 0, "creating needs a login");
  for (const rpc of ["join_community", "request_join_community", "create_community"]) assert.equal(calls(db, rpc, "RPC").length, 0, `${rpc} was not called`);
}, { guest: true, setup: guestSetup });

await scenario("29b. Ziyaretçi · topluluk sayfası: herkese açıkta salt-okunur içerik (Üyeler yok); kapalıda içerik ve sekme YOK; tamamen kapalıda 'bulunamadı'; hiçbirinde üye/istatistik çağrısı yok", async ({ page, db }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Akış", "Etkinlikler", "Hakkında ve kurallar"]);
  await page.getByText("Herkese açık gönderi").waitFor();
  assert.equal(await page.locator("[data-community-actions] a", { hasText: "Sohbeti aç" }).count(), 0);
  await joinBtn(page.locator("header, [data-community-actions]")).click();
  await page.getByText(LOGIN_TEXT).waitFor();
  await page.keyboard.press("Escape");
  await open(page, C2);
  assert.equal(await page.locator("[data-section-menu]").count(), 0, "a visitor sees no tabs of a private (closed) community");
  await page.getByText("Bu topluluk kapalı", { exact: true }).waitFor();
  assert.equal(await page.getByText("Kapalı gönderi").count(), 0);
  await requestBtn(page.locator("header, [data-community-actions]")).click();
  await page.getByText(LOGIN_TEXT).waitFor();
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/communities/local?id=${C3}`);
  await page.getByText("Topluluk bulunamadı").waitFor();
  assert.equal(await page.getByText("Hayalet Kulüp").count(), 0, "the name of a fully closed community never reaches a visitor");
  for (const rpc of ["community_members", "community_stats", "list_my_communities", "join_community", "request_join_community"]) assert.equal(calls(db, rpc, "RPC").length, 0, `${rpc} was not called`);
  assert.ok(calls(db, "community_cards", "RPC").length >= 3);
}, { guest: true, setup: guestSetup });

await scenario("30. Topluluk görseli özel bucket'ta: arayüz ortak /object/public adresini HİÇ çekmez, signed URL ister; üye olmayan (kapalı topluluk) için kart görselini kart RPC'sinden alıp imzalar", async ({ page, db }) => {
  const publicHits = [];
  page.on("request", (r) => { if (r.url().includes("/object/public/community-avatars/")) publicHits.push(r.url()); });
  await open(page, C1);
  await page.waitForTimeout(500);
  assert.ok(calls(db, "community-avatars", "SIGN").length >= 1, "a signed URL was requested for the community picture");
  assert.deepEqual(calls(db, "community-avatars", "SIGN")[0].body.paths, ["u1/group-1.jpg"]);
  await open(page, C2);
  await page.waitForTimeout(500);
  assert.ok(calls(db, "community-avatars", "SIGN").some((c) => c.body.paths.includes("u2/group-2.jpg")), "non-member card picture is signed too");
  assert.deepEqual(publicHits, [], "the public object URL is never fetched");
  assert.equal(calls(db, "PUBLICGET").length, 0);
}, {
  setup: (db) => {
    db.addCommunity(C1, { name: "Görselli Üye", visibility: "private", myRole: "member", members: [[U.bob, "owner"]] });
    db.addCommunity(C2, { name: "Görselli Kapalı", visibility: "restricted", myRole: "none", members: [[U.bob, "owner"]] });
    db.groups.find((g) => g.id === C1).avatar_url = "https://example.supabase.co/storage/v1/object/public/community-avatars/u1/group-1.jpg";
    db.groups.find((g) => g.id === C2).avatar_url = "https://example.supabase.co/storage/v1/object/public/community-avatars/u2/group-2.jpg";
  },
});

await scenario("31. Görünürlük seçici (oluştur): seçili düzey vurgulanır ('Seçili'), her düzeyin gizlilik sonuçları seçimden önce görünür; masaüstünde karşılaştırma tablosu, klavyeyle seçilir", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const d = dlg(page);
  const radios = d.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ });
  await radios.first().waitFor();
  assert.equal(await radios.count(), 3);
  assert.equal(await d.getByText("Seçili", { exact: true }).count(), 1, "exactly one level is marked as selected");
  assert.equal(await d.getByRole("radio", { name: /^Tamamen kapalı/ }).isChecked(), true);
  const table = d.getByRole("table", { name: "Görünürlük düzeylerinin karşılaştırması" });
  await table.waitFor();
  for (const text of ["Listelenir", "Hiç görünmez", "Herkes okur (ziyaretçiler dahil)", "İstek gönderilir, yönetici onaylar", "Yalnızca davetle"]) await table.getByText(text).first().waitFor();
  await d.getByRole("radio", { name: /^Herkese açık/ }).focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await d.getByRole("radio", { name: /^Kapalı/ }).isChecked(), true, "arrow keys move the selection");
  assert.equal(await d.getByText("Seçili", { exact: true }).count(), 1);
  assert.ok((await d.getByText("Seçili", { exact: true }).locator("xpath=ancestor::label").innerText()).startsWith("Kapalı"), "the badge moved with the selection");
});

for (const [label, viewport] of [["mobil 390x800", { width: 390, height: 800 }], ["tablet 820x1100", { width: 820, height: 1100 }]]) {
  await scenario(`31b. Görünürlük seçici (${label}): yatay taşma yok; ${label.startsWith("mobil") ? "tablo gizli, her kartta kompakt olgu listesi" : "karşılaştırma tablosu görünür"}`, async ({ page }) => {
    await page.goto(`${BASE}/communities`);
    await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
    const d = dlg(page);
    await d.getByRole("radio", { name: /^Herkese açık/ }).waitFor();
    assert.ok(await overflowFree(page), "picker overflows horizontally");
    const tableVisible = await d.getByRole("table").isVisible();
    if (label.startsWith("mobil")) {
      assert.equal(tableVisible, false);
      assert.equal(await d.getByText("Yalnızca davetle").first().isVisible(), true, "facts are shown inside each card on small screens");
    } else assert.equal(tableVisible, true);
    const heights = await d.getByRole("radio").evaluateAll((els) => els.map((el) => Math.round(el.closest("label").getBoundingClientRect().height)));
    assert.ok(heights.every((h) => h >= 36), `option cards too small: ${heights}`);
  }, { viewport });
}

await scenario("32. Sekme yeniden görünür olunca topluluk sessizce yenilenir: üyelikten çıkarılan kişi bayat ekranda kalmaz (Üyeler sekmesi kalkar, 'Katıl' döner)", async ({ page, db }) => {
  await page.clock.install();
  await open(page, C1);
  await waitTab(page, "Üyeler");
  db.members = db.members.filter((m) => !(m.conversation_id === C1 && m.user_id === ME));
  db.groups.find((g) => g.id === C1).member_count -= 1;
  await page.clock.fastForward(60 * 1000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitNoTab(page, "Üyeler");
  await joinBtn(page.locator("header, [data-community-actions]")).waitFor();
}, { setup: (db) => seed(db, { myRole: "member", visibility: "public" }) });

console.log("");
// 33 — kapak (docs/history/191-*): Otomatik · Renk · Fotoğraf; fotoğraf ağır olsa da reddedilmez, otomatik küçülür
const cover = (page) => page.locator("[data-community-cover]").first();
/** "Temel ayarlar" bölümünün kendi Kaydet düğmesi (Ayarlar sekmesinde bir de topluluk ayarlarının Kaydet'i var). */
const saveBasic = (page) => page.locator('section[aria-labelledby="settings-basic-title"]').getByRole("button", { name: "Kaydet", exact: true });
/** Sayfada gürültülü (sıkıştırılması zor) AĞIR bir JPEG üretip dosya seçiciye verir. 4000×3000 gürültü ≈ 12 MB (eski 8 MB sınırının çok üstü). */
async function pickHeavyPhoto(page, selector, { fakeBytes } = {}) {
  return page.evaluate(async ({ selector, fakeBytes }) => {
    let file;
    if (fakeBytes) {
      file = new File([new Uint8Array(fakeBytes)], "dev.jpg", { type: "image/jpeg" });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = 4000; canvas.height = 3000;
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(4000, 3000);
      for (let i = 0; i < image.data.length; i += 65536) crypto.getRandomValues(image.data.subarray(i, Math.min(i + 65536, image.data.length)));
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      file = new File([blob], "ağır.jpg", { type: "image/jpeg" });
    }
    const input = document.querySelector(selector);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return file.size;
  }, { selector, fakeBytes });
}

await scenario("33. Kapak · Renk: varsayılan Otomatik; renk seçilip kaydedilince şerit o renk olur (kapak fotoğrafı temizlenir); Otomatik'e dönünce renk kalkar", async ({ page, db }) => {
  await open(page, C1, "manage");
  assert.equal(await cover(page).getAttribute("data-community-cover"), "auto", "nothing chosen → automatic (follows the community picture)");
  await pickManage(page, "Ayarlar");
  const group = page.getByRole("radiogroup", { name: "Kapak türü" });
  assert.equal(await group.getByRole("radio", { name: "Otomatik" }).getAttribute("aria-checked"), "true");
  await group.getByRole("radio", { name: "Renk" }).click();
  await page.locator('[data-cover-swatch="#e4572e"]').click();
  await saveBasic(page).click();
  await page.getByText("Topluluk ayarları kaydedildi.", { exact: false }).waitFor();
  const patch = calls(db, "rpc/update_chat_group").at(-1).body.p_patch;
  assert.equal(patch.cover_color, "#e4572e");
  assert.equal(patch.cover_url, null, "choosing a colour clears the photo");
  await page.waitForFunction(() => document.querySelector("[data-community-cover]")?.getAttribute("data-community-cover") === "color");
  assert.equal(await cover(page).evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(228, 87, 46)");
  await page.getByRole("radiogroup", { name: "Kapak türü" }).getByRole("radio", { name: "Otomatik" }).click();
  await saveBasic(page).click();
  await page.waitForFunction(() => document.querySelector("[data-community-cover]")?.getAttribute("data-community-cover") === "auto");
  const back = calls(db, "rpc/update_chat_group").at(-1).body.p_patch;
  assert.deepEqual([back.cover_color, back.cover_url], [null, null]);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("33b. Kapak · Fotoğraf: ağır (8 MB üstü) fotoğraf reddedilmez; ≤ ~1 MB'a küçülüp özel bucket'a yüklenir, adresi kaydedilir ve şerit fotoğraf olur", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Ayarlar");
  await page.getByRole("radiogroup", { name: "Kapak türü" }).getByRole("radio", { name: "Fotoğraf" }).click();
  await saveBasic(page).click();
  await page.getByText("Bir fotoğraf seç ya da başka bir kapak türü kullan.").waitFor();
  assert.equal(calls(db, "rpc/update_chat_group").length, 0, "photo mode without a photo cannot be saved");
  const source = await pickHeavyPhoto(page, "[data-cover-picker] input[type=file]");
  assert.ok(source > 8 * 1024 * 1024, `the test photo is heavy (${source} bytes)`);
  assert.equal(await page.getByText("çok büyük", { exact: false }).count(), 0, "a heavy photo is not turned away");
  await saveBasic(page).click();
  await page.getByText("Topluluk ayarları kaydedildi.", { exact: false }).waitFor();
  const up = db.calls.filter((c) => c.method === "UPLOAD" && c.table.startsWith("community-avatars/"));
  assert.equal(up.length, 1, "one cover upload");
  assert.match(up[0].table, /\/cover-[0-9a-f-]+\.jpg$/);
  assert.ok(up[0].body.size < 1.2 * 1024 * 1024, `the upload was shrunk automatically (${up[0].body.size} bytes from ${source})`);
  const patch = calls(db, "rpc/update_chat_group").at(-1).body.p_patch;
  assert.match(patch.cover_url, /\/storage\/v1\/object\/public\/community-avatars\/.+\/cover-[0-9a-f-]+\.jpg$/);
  assert.equal(patch.cover_color, null);
  await page.waitForFunction(() => document.querySelector("[data-community-cover]")?.getAttribute("data-community-cover") === "photo");
  assert.ok(db.calls.some((c) => c.method === "SIGN" && c.table === "community-avatars"), "the cover is shown through a signed URL");
  assert.equal(db.calls.filter((c) => c.method === "PUBLICGET").length, 0, "the shared public address is never requested");
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("33c. Topluluk görseli: ağır fotoğraf artık '8 MB' diye reddedilmez, ≤ ~200 KB kareye küçülüp yüklenir ve kaydedilir; 40 MB üstü dosya anlaşılır bir mesajla reddedilir", async ({ page, db }) => {
  await open(page, C1, "manage");
  await pickManage(page, "Ayarlar");
  const AVATAR_INPUT = 'section[aria-labelledby="settings-basic-title"] input[type=file]';
  await page.locator(AVATAR_INPUT).waitFor({ state: "attached" });
  const tooBig = await pickHeavyPhoto(page, AVATAR_INPUT, { fakeBytes: 41 * 1024 * 1024 });
  assert.ok(tooBig > 40 * 1024 * 1024);
  await page.getByText("en fazla 40 MB", { exact: false }).waitFor();
  assert.equal(calls(db, "rpc/update_chat_group").length, 0);
  const source = await pickHeavyPhoto(page, AVATAR_INPUT);
  assert.ok(source > 8 * 1024 * 1024);
  await saveBasic(page).click();
  await page.getByText("Topluluk ayarları kaydedildi.", { exact: false }).waitFor();
  const up = db.calls.filter((c) => c.method === "UPLOAD" && c.table.startsWith("community-avatars/"));
  assert.equal(up.length, 1);
  assert.match(up[0].table, /\/group-[0-9a-f-]+\.jpg$/);
  assert.ok(up[0].body.size < 300 * 1024, `avatar shrunk to a small square (${up[0].body.size} bytes from ${source})`);
  assert.match(calls(db, "rpc/update_chat_group").at(-1).body.p_patch.avatar_url, /community-avatars\/.+group-/);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("33d. Kapak · üye olmayan / ziyaretçi: kapak, kart kapağı RPC'sinden gelir", async ({ page, db }) => {
  await open(page, C1);
  assert.equal(await cover(page).getAttribute("data-community-cover"), "color");
  assert.equal(await cover(page).evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(112, 72, 232)");
  assert.ok(calls(db, "rpc/community_card_covers").length >= 1);
}, { guest: true, setup: (db) => { seed(db, { myRole: "none" }); db.groups.find((x) => x.id === C1).cover_color = "#7048e8"; } });

await scenario("34. Sade kontrol satırı (docs/history/232-*): Topluluklar ana sayfasında arama simgesi alanı açar ✕ kapatır, Kart/Izgara tek simge; topluluk sayfasında 'Akış ▾' menüsü + aynı satırda Kart/Izgara ve 'Gönderi oluştur' simgeleri", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Topluluklar", level: 1 }).waitFor();
  assert.equal(await page.getByRole("searchbox").count(), 0, "arama alanı simgeyle açılır");
  await page.getByRole("button", { name: "Ara", exact: true }).click();
  await page.getByRole("searchbox").waitFor();
  await page.getByRole("button", { name: "Temizle" }).click();
  assert.equal(await page.getByRole("searchbox").count(), 0);
  const toggle = page.locator("[data-view-toggle]");
  const before = await toggle.getAttribute("data-view-toggle");
  await toggle.click();
  assert.notEqual(await page.locator("[data-view-toggle]").getAttribute("data-view-toggle"), before, "Kart/Izgara tek simgeyle değişir");
  await open(page, C1);
  const menu = await page.locator("[data-section-menu]").boundingBox();
  const slot = page.locator("[data-community-actions-slot]");
  await slot.locator("[data-view-toggle]").waitFor();
  const create = await slot.locator("[data-create-post]").boundingBox();
  assert.ok(Math.abs(menu.y + menu.height / 2 - (create.y + create.height / 2)) < 6, "menü, görünüm ve '+' aynı satırda");
}, { setup: (db) => seed(db, { myRole: "owner" }) });

let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
