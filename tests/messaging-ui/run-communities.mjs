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

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const dlg = (page) => page.getByRole("dialog").last();
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const open = async (page, id, tab) => { await page.goto(`${BASE}/communities/local?id=${id}${tab ? `&tab=${tab}` : ""}`); await page.locator("h1").first().waitFor(); await page.waitForTimeout(250); };
const tabNames = (page) => page.getByRole("tablist").first().getByRole("tab").allInnerTexts().then((l) => l.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()));
const seed = (db, opts = {}) => db.addCommunity(C1, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], ...opts });
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// 1
await scenario("1. Keşfet: yalnız herkese açık topluluklar; kapalı olan listelenmez; kartta üye sayısı, kategori ve görünürlük", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Topluluklar", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Prompt Atölyesi" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Gizli Kulüp" }).count(), 0, "private communities are never listed");
  const card = page.locator("li", { hasText: "Prompt Atölyesi" }).first();
  await card.getByText("Görsel", { exact: true }).waitFor();
  await card.getByText("Herkese açık").waitFor();
  await card.getByText("4 üye").waitFor();
  assert.deepEqual((await tabNames(page)).slice(0, 5), ["Keşfet", "Üyesi olduklarım", "Yönettiklerim", "Davetler", "Başvurularım"]);
  assert.equal(await page.getByRole("tab", { name: "Kaydedilenler" }).count(), 0, "the save feature is gone");
}, { setup: (db) => { db.addCommunity(C2, { name: "Prompt Atölyesi", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"], [U.dave, "member"], [U.amy, "member"]] }); db.addCommunity(C3, { name: "Gizli Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] }); } });

// 2
await scenario("2. Keşfet: arama ve kategori süzgeci sunucuya iletilir; boş sonuç ve hata/yeniden dene durumları", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Görsel Topluluk" }).waitFor();
  await page.getByRole("heading", { name: "Ses Topluluğu" }).waitFor();
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.getByRole("heading", { name: "Görsel Topluluk" }).waitFor({ state: "detached" });
  assert.ok(calls(db, "discover_communities", "RPC").some((c) => c.body.p_category === "audio"));
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await page.getByPlaceholder("Topluluk ara (kapalı olanlar da çıkar)…").fill("zzzz");
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
  assert.ok(calls(db, "search_communities", "RPC").some((c) => c.body.p_query === "zzzz"), "typing a query uses the search RPC (public + private communities)");
  let fail = true;
  db.rpc.search_communities = () => (fail ? { status: 500, body: { message: "boom" } } : { body: [] });
  await page.getByPlaceholder("Topluluk ara (kapalı olanlar da çıkar)…").fill("yeni");
  await page.getByText("Topluluklar yüklenemedi.").waitFor();
  fail = false;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
}, { setup: (db) => { db.addCommunity(C2, { name: "Görsel Topluluk", category: "image", myRole: "none", members: [[U.bob, "owner"]] }); db.addCommunity(C3, { name: "Ses Topluluğu", category: "audio", myRole: "none", members: [[U.bob, "owner"]] }); } });

// 3
await scenario("3. Katıl (kural yok): tek istek, kabul bayrağı yok; topluluk sayfasına gider ve üye olur", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Açık Topluluk topluluğuna katıl" }).dblclick();
  await page.locator("li", { hasText: "Açık Topluluk" }).getByRole("button", { name: /Katıldın/ }).waitFor();
  const made = calls(db, "join_community", "RPC");
  assert.equal(made.length, 1, "double click sends one request");
  assert.equal(made[0].body.p_accept_rules, false);
  assert.ok(db.member(C2, ME));
  assert.match(page.url(), /\/communities\/?$/, "joining from a card keeps you on the list");
}, { setup: (db) => db.addCommunity(C2, { name: "Açık Topluluk", myRole: "none", members: [[U.bob, "owner"]] }) });

// 4
await scenario("4. Katıl (kurallar zorunlu): kural metni gösterilir, onay kutusu işaretlenmeden katılınamaz; kabulle p_accept_rules=true", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
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
  await d.getByLabel("Açıklama").fill("Haftalık paylaşımlar");
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
await scenario("9. Owner: yedi bölüm (Genel bakış … Yönetim); başlıkta kategori, görünürlük, rol; sohbet düğmesi", async ({ page }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Genel bakış", "Akış", "Sohbet", "Üyeler", "Etkinlikler", "Hakkında ve kurallar", "Yönetim"]);
  await page.locator("header").getByText("Görsel", { exact: true }).waitFor();
  await page.locator("header").getByText("Sahip", { exact: true }).waitFor();
  await page.locator("header a", { hasText: "Sohbeti aç" }).waitFor();
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("10. Üye: Yönetim sekmesi yok; durum 'Üyesin' görünür", async ({ page }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Genel bakış", "Akış", "Sohbet", "Üyeler", "Etkinlikler", "Hakkında ve kurallar"]);
  await page.getByText("Üyesin", { exact: true }).waitFor();
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=manage`);
  await page.getByRole("tab", { name: "Genel bakış" }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "Yönetim" }).count(), 0, "forged ?tab=manage falls back for a plain member");
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("10b. Moderatör: Yönetim var ama yalnız yetkisi olan bölümler (başvurular, moderasyon); özet/geçmiş/ayarlar yok", async ({ page }) => {
  await open(page, C1, "manage");
  const sections = await page.getByRole("tablist").nth(1).getByRole("tab").allInnerTexts();
  assert.deepEqual(sections.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()), ["Katılım istekleri", "Moderasyon"]);
}, { setup: (db) => seed(db, { myRole: "moderator" }) });

// 11
await scenario("11. Üye olmayan, açık topluluk: salt-okunur sekmeler (Sohbet/Üyeler yok) + başlıkta Katıl düğmesi", async ({ page, db }) => {
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Genel bakış", "Akış", "Etkinlikler", "Hakkında ve kurallar"]);
  assert.equal(await page.getByRole("region", { name: "Üyelik durumu" }).count(), 0, "no duplicate join strip: the single join button lives in the header");
  await page.locator("header").getByRole("button", { name: /topluluğuna katıl$/ }).click();
  await page.getByRole("tab", { name: "Sohbet" }).waitFor();
  await page.locator("header").getByRole("button", { name: /Katıldın/ }).waitFor();
  assert.equal(calls(db, "join_community", "RPC")[0].body.p_accept_rules, false);
}, { setup: (db) => seed(db, { myRole: "none" }) });

await scenario("11b. Kapalı topluluk, yalnız davetli: içerik/sohbet/üye listesi yok, yalnız davet kartı; kabul edince açılır", async ({ page, db }) => {
  await open(page, C1);
  assert.equal(await page.getByRole("tab").count(), 0, "no content tabs for a non-member of a private community");
  await page.getByText("Bob seni bu topluluğa davet etti").waitFor();
  await page.getByRole("button", { name: "Kabul et" }).click();
  await page.getByRole("tab", { name: "Genel bakış" }).waitFor();
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
  await page.locator("header").getByText("Kapatıldı", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Akış", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "İçerik paylaş" }).count(), 0);
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
  await page.getByRole("button", { name: "İçerik paylaş" }).click();
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
  await page.getByRole("button", { name: "İçerik paylaş" }).click();
  await dlg(page).getByRole("radio").first().check();
  await dlg(page).getByRole("button", { name: "Paylaş", exact: true }).click();
  await dlg(page).getByText("Bu içerik bu toplulukta zaten paylaşılmış.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.ownContent.prompt.push({ id: "aaaaaaaa-0000-4000-8000-000000000001", title: "Açık Prompt", visibility: "public" }, { id: "aaaaaaaa-0000-4000-8000-000000000002", title: "Özel Prompt", visibility: "private" }); } });

await scenario("13c. Paylaşma politikası 'yalnız kadro': üyede düğme yok + açıklama; kadroda var", async ({ page }) => {
  await open(page, C1, "feed");
  await page.getByText("Bu akışta yalnızca yönetim kadrosu paylaşım yapabilir.").waitFor();
  assert.equal(await page.getByRole("button", { name: "İçerik paylaş" }).count(), 0);
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
await scenario("14. Duyuru: yayınla (sohbette de), listede görünür; düzenle; sil. Üyede yönetim düğmeleri yok", async ({ page, db }) => {
  await open(page, C1);
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

await scenario("14b. Üye duyuruyu okur ama yayınlama/düzenleme/silme kontrolleri görünmez", async ({ page }) => {
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
  await page.getByRole("tab", { name: "Moderasyon" }).click();
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
  await page.getByRole("tab", { name: "Ayarlar" }).click();
  await page.getByLabel("Kategori").selectOption("learning");
  await page.getByRole("tabpanel").getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.getByText("Ayarlar kaydedildi.").waitFor();
  assert.deepEqual(calls(db, "update_community", "RPC")[0].body.p_patch, { category: "learning" });
  await page.getByRole("button", { name: "Topluluğu kapat" }).click();
  await dlg(page).getByText("Tüm üyelere bildirim gider.").waitFor();
  await dlg(page).getByRole("button", { name: "Topluluğu kapat" }).click();
  await page.getByText("Topluluk kapatıldı.").waitFor();
  assert.equal(calls(db, "close_community", "RPC").length, 1);
  await page.getByRole("tab", { name: "İşlem geçmişi" }).click();
  await page.getByText("Bir gönderiyi akıştan kaldırdı").waitFor();
}, { setup: (db) => { seed(db, { myRole: "owner" }); db.audit.push({ id: crypto.randomUUID(), group_id: C1, action: "post_removed", actor_id: U.bob.id, target_user_id: U.dave.id, details: {}, created_at: db.stamp() }); } });

await scenario("17d. Yönetim · Kurallar: owner kural metnini ve kabul zorunluluğunu değiştirir (edit_rules); metin boşken kabul zorunlu kaydedilemez", async ({ page, db }) => {
  await open(page, C1, "manage");
  await page.getByRole("tab", { name: "Ayarlar" }).click();
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
await scenario("18. Sohbet sekmesi: son mesaj + okunmamış sayısı; 'Sohbeti aç' Mesajlar çalışma alanına gider; sohbet başlığında topluluğa bağlantı var", async ({ page }) => {
  await open(page, C1, "chat");
  await page.getByText("Merhaba topluluk").first().waitFor();
  await page.getByRole("link", { name: "Sohbeti aç" }).last().click();
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
  await page.locator("a[aria-label='Topluluklara git']:visible").first().waitFor();
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
  await page.getByPlaceholder("Search communities (private ones too)…").waitFor();
  assert.deepEqual((await tabNames(page)).slice(0, 5), ["Discover", "Joined", "Managed", "Invitations", "My requests"]);
  await open(page, C1);
  assert.deepEqual(await tabNames(page), ["Overview", "Feed", "Chat", "Members", "Events", "About & rules", "Manage"]);
  await page.getByRole("button", { name: "Publish announcement" }).waitFor();
  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByRole("button", { name: "Create event" }).first().click();
  await dlg(page).getByLabel("Time zone").waitFor();
  await dlg(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("tab", { name: "About & rules" }).click();
  await page.getByRole("heading", { name: "Community notifications" }).waitFor();
  await page.getByText("Important only").waitFor();
}, { lang: "en", setup: (db) => seed(db, { myRole: "owner" }) });

for (const [label, viewport, theme] of [["mobil 390x800", { width: 390, height: 800 }, undefined], ["mobil koyu tema", { width: 390, height: 800 }, "dark"], ["tablet 820x1100", { width: 820, height: 1100 }, undefined]]) {
  await scenario(`23. Düzen (${label}): liste, detay ve akış yatay taşmaz; sekme çubuğu kaydırılabilir; temel düğmeler ≥ 36px`, async ({ page }) => {
    await page.goto(`${BASE}/communities`);
    await page.getByRole("heading", { name: "Prompt Atölyesi" }).waitFor();
    assert.ok(await overflowFree(page), "communities list overflows horizontally");
    await open(page, C1);
    assert.ok(await overflowFree(page), "detail overflows horizontally");
    await page.getByRole("tab", { name: "Akış", exact: true }).click();
    await page.getByText("Normal içerik").first().waitFor();
    assert.ok(await overflowFree(page), "feed overflows horizontally");
    const heights = await page.locator("button:visible, a[class*='h-']:visible").evaluateAll((els) => els.slice(0, 40).map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.ok(heights.filter((h) => h > 0 && h < 28).length === 0, `tiny tap targets: ${heights.filter((h) => h > 0 && h < 28)}`);
  }, { viewport, theme, setup: (db) => { seed(db, { myRole: "member", name: "Prompt Atölyesi" }); db.addPost(C1, { title: "Normal içerik" }); } });
}


// 24 — üç görünürlük düzeyi, tek üyelik düğmesi, arama ve öneriler (docs/history/176-*)
const joinBtn = (scope) => scope.getByRole("button", { name: /topluluğuna katıl$/ });
const requestBtn = (scope) => scope.getByRole("button", { name: /topluluğuna katılma isteği gönder$/ });
const SEARCH = "Topluluk ara (kapalı olanlar da çıkar)…";

await scenario("24. Başlıktaki tek üyelik düğmesi: Katıl → Katıldın ▼ → 'Topluluktan ayrıl' (onaylı, tek istek) → yeniden Katıl; 'Kaydet' düğmesi yok", async ({ page, db }) => {
  await open(page, C1);
  const head = page.locator("header");
  assert.equal(await page.getByRole("button", { name: /^Kaydet(ildi)?$/ }).count(), 0, "the save button is gone");
  await joinBtn(head).click();
  const joined = head.getByRole("button", { name: /Katıldın/ });
  await joined.waitFor();
  await page.getByRole("tab", { name: "Sohbet" }).waitFor();
  await joined.click();
  await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).click();
  await dlg(page).getByRole("button", { name: "Topluluktan ayrıl" }).dblclick();
  await joinBtn(head).waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 1, "double click sends one leave request");
  assert.equal(db.member(C1, ME), undefined);
  await page.getByRole("tab", { name: "Sohbet" }).waitFor({ state: "detached" });
}, { setup: (db) => seed(db, { myRole: "none" }) });

await scenario("24b. Sahip 'Katıldın ▼' menüsünde ayrılamaz: öğe devre dışı ve neden yazar", async ({ page, db }) => {
  await open(page, C1);
  await page.locator("header").getByRole("button", { name: /üyelik menüsü/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Topluluktan ayrıl" }).isDisabled(), true);
  await page.getByText("Sahipsin: ayrılmadan önce sahipliği başka bir üyeye devret.").waitFor();
  assert.equal(calls(db, "rpc/leave_chat_group").length, 0);
}, { setup: (db) => seed(db, { myRole: "owner" }) });

const visibilitySetup = (db) => {
  db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
  db.addCommunity(C2, { name: "Kapalı Atölye", visibility: "restricted", category: "audio", myRole: "none", members: [[U.bob, "owner"], [U.carol, "member"]] });
  db.addCommunity(C3, { name: "Hayalet Kulüp", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
};

await scenario("25. Arama: kapalı topluluk bulunur (Kapalı rozeti, içerik notu, 'istek gönder'); Keşfet'te kapalı ve tamamen kapalı yok; tamamen kapalı aramada da yok", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Açık Atölye" }).waitFor();
  for (const hidden of ["Kapalı Atölye", "Hayalet Kulüp"]) assert.equal(await page.getByRole("heading", { name: hidden }).count(), 0, `${hidden} is not in Discover`);
  await page.getByPlaceholder(SEARCH).fill("atölye");
  const card = page.locator("li", { hasText: "Kapalı Atölye" });
  await card.waitFor();
  await card.getByText("Kapalı", { exact: true }).waitFor();
  await card.getByText("Kapalı topluluk: içerik yalnızca üyelere açık.").waitFor();
  await requestBtn(card).waitFor();
  await joinBtn(page.locator("li", { hasText: "Açık Atölye" })).waitFor();
  assert.ok(calls(db, "search_communities", "RPC").some((c) => c.body.p_query === "atölye"));
  await page.getByPlaceholder(SEARCH).fill("hayalet");
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Hayalet Kulüp" }).count(), 0, "fully closed communities never show up in search");
}, { setup: visibilitySetup });

await scenario("25b. Kapalı topluluğa aramadan istek: tek istek, 'İstek gönderildi ▼', menüden geri çekilince yeniden 'İstek gönder'", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByPlaceholder(SEARCH).fill("kapalı");
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
  await page.goto(`${BASE}/communities`);
  await page.getByPlaceholder(SEARCH).fill("kapalı");
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
  assert.equal(await page.getByRole("tab").count(), 0, "no content tabs before membership");
  await page.getByText("Bu topluluk kapalı", { exact: true }).waitFor();
  await page.locator("header").getByText("Kapalı", { exact: true }).waitFor();
  await requestBtn(page.locator("header")).click();
  await page.getByText("Katılma isteğin değerlendiriliyor").waitFor();
  await page.locator("header").getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 0, "a pending request still gives no content access");
}, { setup: visibilitySetup });

await scenario("25e. Tamamen kapalı topluluk: üye değilken başlıkta hiçbir katılma/istek düğmesi yok", async ({ page }) => {
  await open(page, C3);
  await page.getByText("Bu topluluk tamamen kapalı", { exact: true }).waitFor();
  assert.equal((await requestBtn(page).count()) + (await joinBtn(page).count()), 0, "no way to join or request a fully closed community from its page");
}, { setup: visibilitySetup });

await scenario("26. Öneriler: ortak kategori önce, kapalı topluluk önerilir (tamamen kapalı asla); arama başlayınca şerit kalkar; önerilenden istek/katılma", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Senin için önerilenler" }).waitFor();
  const sug = page.getByTestId("community-suggestions");
  const items = sug.locator("li");
  assert.equal(await items.count(), 2, "public + private(searchable) suggested; fully closed and joined ones are not");
  assert.ok((await items.first().innerText()).includes("Resim Odası"), "same category as my community comes first");
  await items.first().getByText("Üye olduğun topluluklarla aynı konu").waitFor();
  await items.nth(1).getByText("Popüler", { exact: true }).waitFor();
  assert.equal(await sug.getByText("Hayalet Kulüp").count(), 0);
  assert.equal(await sug.getByText("Üyesi Olduğum").count(), 0);
  assert.ok(calls(db, "suggest_communities", "RPC").length >= 1);
  await requestBtn(items.nth(1)).click();
  await items.nth(1).getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  await joinBtn(items.first()).click();
  await items.first().getByRole("button", { name: /Katıldın/ }).waitFor();
  await page.getByPlaceholder(SEARCH).fill("resim");
  await page.getByRole("heading", { name: "Arama sonuçları" }).waitFor();
  assert.equal(await page.getByTestId("community-suggestions").count(), 0, "suggestions hide while searching");
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

await scenario("27b. Yönetim · Ayarlar: görünürlük üç düzey arasında değişir (onaylı); mevcut düzeyin düğmesi yok", async ({ page, db }) => {
  await open(page, C1, "manage");
  await page.getByRole("tab", { name: "Ayarlar" }).click();
  assert.equal(await page.getByRole("button", { name: "Herkese açık yap" }).count(), 0, "already public");
  await page.getByRole("button", { name: "Tamamen kapat" }).waitFor();
  await page.getByRole("button", { name: "Kapalı yap" }).click();
  await dlg(page).getByText("aramada ve önerilerde bulunur", { exact: false }).waitFor();
  await dlg(page).getByRole("button", { name: "Kapalı yap" }).click();
  await page.getByText("Topluluk kapalı yapıldı.").waitFor();
  assert.equal(calls(db, "rpc/set_chat_group_visibility")[0].body.p_visibility, "restricted");
  await page.getByRole("button", { name: "Herkese açık yap" }).waitFor();
}, { setup: (db) => seed(db, { myRole: "owner" }) });

await scenario("28. İngilizce: Katıl / İstek gönder / Katıldın menüsü, görünürlük adları, öneriler", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Suggested for you" }).waitFor();
  const sug = page.getByTestId("community-suggestions");
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

console.log("");
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
