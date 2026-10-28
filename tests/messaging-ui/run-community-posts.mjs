// Topluluk gönderisi etkileşimi arayüz testleri (ağ taklitli) — docs/history/178-*. Çalıştırma: README.md.
// Gerçek Supabase'e bağlanmaz: mock.mjs + mock-communities.mjs PostgREST'in kullanılan kısmını bellekte taklit eder.
// SQL/RLS doğrulaması `supabase/tests/community-post-engagement.sql`'dir; burası arayüzün çağrılarını, durumlarını ve metinlerini sınar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4176/promptly";
const server = await serve(4176);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const C1 = "e0000000-0000-4000-8000-0000000000a1";
const C2 = "e0000000-0000-4000-8000-0000000000a2";
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
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const dlg = (page) => page.getByRole("dialog").last();
/** Beğeni düğmesi tepki seçicisini açar (docs/history/265-*): düğmeye bas, sonra tepkiyi (varsayılan Sevdim = eski beğeni) seç. */
const react = async (page, button, name = "Sevdim") => { await button.click(); await page.getByRole("menuitem", { name }).click(); };
const LIKE = /beğen|tepki/i;
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const open = async (page, id, tab = "feed", extra = "") => { await page.goto(`${BASE}/communities/local?id=${id}&tab=${tab}${extra}`); await page.locator("h1").first().waitFor(); await page.waitForTimeout(250); };
const seed = (db, opts = {}) => db.addCommunity(C1, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], ...opts });
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const post = (page, title) => page.locator("li[data-community-post]", { hasText: title }).first();
const PROMPT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PRIVATE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const postPage = (id, extra = "") => `${BASE}/communities/post/local?id=${id}${extra}`;
const own = (db) => db.ownContent.prompt.push({ id: PROMPT_ID, title: "Açık Prompt", visibility: "public" }, { id: PRIVATE_ID, title: "Özel Prompt", visibility: "private" });

// 1
await scenario("1. 'Gönderi oluştur' iki yol sunar: yeni içerik (dört tür → normal oluşturma ekranı ?community=) ve mevcut içeriğe başvur", async ({ page }) => {
  await open(page, C1);
  await page.getByRole("button", { name: "Gönderi oluştur" }).click();
  const d = dlg(page);
  await d.getByRole("button", { name: /Yeni içerik oluştur/ }).waitFor();
  await d.getByRole("button", { name: /Mevcut içeriğe başvur/ }).waitFor();
  await d.getByRole("button", { name: /Yeni içerik oluştur/ }).click();
  const hrefs = await d.locator("a[data-post-new-type]").evaluateAll((els) => els.map((a) => [a.dataset.postNewType, a.getAttribute("href")]));
  assert.deepEqual(hrefs.map(([t]) => t), ["prompt", "request", "workflow", "preset"]);
  const expected = { prompt: "/create?mode=prompt", request: "/requests/new", workflow: "/workflows/create", preset: "/presets/create" };
  for (const [type, href] of hrefs) assert.ok(href.replace("/promptly", "").replace(/\/\?/, "?") === `${expected[type]}${expected[type].includes("?") ? "&" : "?"}community=${C1}`, `${type} opens the EXISTING creation screen with the community context: ${href}`);
  await d.getByRole("button", { name: "Geri" }).click();
  await d.getByRole("button", { name: /Mevcut içeriğe başvur/ }).click();
  await dlg(page).getByText("Mevcut içeriğe başvur", { exact: true }).waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); own(db); } });

// 2
await scenario("2. Başvuru: kendi kimliğiyle gönderi olur; not varsa görünür; orijinal içeriğe belirgin bağlantı; not yoksa boş yer tutucu YOK", async ({ page, db }) => {
  await open(page, C1);
  await page.getByRole("button", { name: "Gönderi oluştur" }).click();
  await dlg(page).getByRole("button", { name: /Mevcut içeriğe başvur/ }).click();
  await dlg(page).getByText("Açık Prompt").waitFor();
  assert.equal(await dlg(page).getByText("Özel Prompt").count(), 0, "private content is never offered");
  await dlg(page).getByRole("radio").first().click();
  await dlg(page).locator("#share-note").fill("Bu topluluğa uyar");
  await dlg(page).getByRole("button", { name: "Paylaş", exact: true }).click();
  await page.getByText("İçerik toplulukta paylaşıldı.").waitFor();
  const shared = calls(db, "share_to_community", "RPC");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].body.p_note, "Bu topluluğa uyar");
  const card = post(page, "Açık Prompt");
  await card.getByText("Alıntı", { exact: true }).waitFor();
  await card.getByText("Bu topluluğa uyar").waitFor();
  const link = card.getByRole("link", { name: /Açık Prompt/ }).first();
  assert.match((await link.getAttribute("href")) ?? "", /communities\/post\/local\/?\?id=/, "the card opens the application's OWN page");
  assert.equal(await card.getByText("Orijinal içeriği aç").count(), 0, "the original link lives on the application's page, not on the card");
  await link.click();
  await page.waitForURL(/communities\/post\/local/);
  await page.locator("[data-community-post-page]").waitFor();
  await page.locator("[data-post-note]").getByText("Bu topluluğa uyar").waitFor();
  assert.match((await page.locator("[data-open-original]").getAttribute("href")) ?? "", new RegExp(`/prompts/local/?\\?id=${PROMPT_ID}`));
}, { setup: (db) => { seed(db, { myRole: "member" }); own(db); } });

await scenario("2b. Notsuz başvuru gönderisinde not alanı hiç bulunmaz", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Notsuz içerik");
  await card.waitFor();
  assert.equal(await card.locator("[data-post-note]").count(), 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Notsuz içerik", note: null }); } });

// 3
await scenario("3. Yerel (topluluğa özgü) içerik: akışta NORMAL içerik kartı, TEK ⋮ menüsü (üst çubuk yok); ayrı gönderi etkileşimi ve 'başvuru' etiketi YOK; kaydet + istatistik + paylaş normal kart gibi VAR", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Yerel prompt");
  const normalCard = card.locator("article").first();
  await normalCard.waitFor();
  assert.equal(await card.getByText("Topluluk içeriği").count(), 0, "no extra community bar above the card");
  assert.equal(await card.getByRole("button", { name: /seçenekleri/ }).count(), 1, "ONE menu: the card's own");
  assert.equal(await card.getByText("Alıntı", { exact: true }).count(), 0);
  assert.equal(await card.locator("[data-post-engagement]").count(), 0, "native content uses the content's OWN like/comment, not a second engagement bar");
  await normalCard.getByRole("button", { name: LIKE }).first().waitFor();
  await normalCard.getByRole("button", { name: /Kaydet|koleksiyon/i }).first().waitFor();
  await normalCard.getByRole("button", { name: /İstatistik/i }).first().waitFor();
  await normalCard.getByRole("button", { name: "Paylaş" }).waitFor();
  assert.match((await normalCard.getByRole("link", { name: "Yerel prompt" }).getAttribute("href")) ?? "", /prompts\/local\/?\?id=/);
  await card.getByRole("button", { name: /seçenekleri/ }).click();
  await page.getByRole("menuitem", { name: /Sil|Düzenle/ }).first().waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel prompt", kind: "native", visibility: "private" }); } });

await scenario("3c. Yerel kartın paylaşımı özel içerik için paylaşım sayfasına ÇEVRİLMEZ: bağlantı içeriğin kendi sayfasıdır", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, C1);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await post(page, "Yerel prompt").locator("article").first().getByRole("button", { name: "Paylaş" }).click();
  await dlg(page).getByRole("button", { name: /Diğer uygulamalarla paylaş/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /prompts\/local\/?\?id=/);
  assert.doesNotMatch(copied, /\/share\//, "private community content has no public share page");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel prompt", kind: "native", visibility: "private" }); } });

await scenario("3d. Başvuru kartı da normal kart gibi Kaydet + İstatistik + Paylaş sunar; istatistik gönderinin KENDİ etkileşimini sorar (kaydedenler sekmesi dahil); paylaşım bağlantısı gönderinin sayfasına gider, mesajla paylaşım da var", async ({ page, db, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  db.rpc.content_engagers = (body) => { db.calls.push({ method: "RPC", table: "content_engagers", body }); return { body: [] }; };
  await open(page, C1);
  const card = post(page, "Başvuru prompt");
  await card.waitFor();
  await card.getByRole("button", { name: /İstatistik/i }).click();
  const d = dlg(page);
  await d.getByRole("tab", { name: /Beğenenler/ }).waitFor();
  await d.getByRole("tab", { name: /Kaydedenler/ }).waitFor();
  await page.waitForTimeout(300);
  const stat = calls(db, "content_engagers", "RPC").at(-1);
  assert.equal(stat?.body.p_content_type, "community_post");
  assert.ok(stat?.body.p_content_id, "targets the post, not the applied content");
  await d.getByRole("button", { name: /Kapat/ }).click();
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await card.getByRole("button", { name: "Paylaş" }).click();
  await dlg(page).getByText(/mesaj olarak/i).first().waitFor();
  await dlg(page).getByRole("button", { name: /Diğer uygulamalarla paylaş/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /communities\/post\/local\/?\?id=/);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Başvuru prompt", kind: "application" }); } });

await scenario("3b. Eski (legacy) gönderi: tür rozeti TAHMİN EDİLMEZ, başvuru gibi gösterilir", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Eski gönderi");
  await card.waitFor();
  assert.equal(await card.getByText("Alıntı", { exact: true }).count(), 0);
  await card.getByText("bir prompt paylaştı").waitFor();
  assert.match((await card.getByRole("link", { name: /Eski gönderi/ }).first().getAttribute("href")) ?? "", /communities\/post\/local/);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Eski gönderi", kind: "legacy" }); } });

// 4
await scenario("4. Beğeni gönderi kimliğine bağlanır (community_post_id), içeriğe DEĞİL; geri alınır; çift tık tek istek; sayaç gönderiye aittir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Beğenilecek");
  const heart = card.locator("[data-post-engagement]").getByRole("button", { name: LIKE }).first();
  await react(page, heart);
  await page.waitForTimeout(300);
  let likes = calls(db, "prompt_likes", "POST");
  assert.equal(likes.length, 1);
  assert.ok(likes[0].body.community_post_id, "like targets the post id");
  assert.equal(likes[0].body.prompt_id, undefined, "never the original content");
  assert.equal(db.posts[0].like_count, 1);
  await card.locator("[data-post-engagement]").getByText("1", { exact: true }).first().waitFor();
  await react(page, heart, "Tepkini kaldır");
  await page.waitForTimeout(300);
  assert.equal(calls(db, "prompt_likes", "DELETE").length, 1);
  assert.equal(db.posts[0].like_count, 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Beğenilecek" }); } });

await scenario("5. Yorum başvuru sayfasında yazılır, gönderi kimliğine bağlanır; sayaç artar; başka gönderinin yorumları karışmaz; içeriğin yorum tablosuna yazılmaz", async ({ page, db }) => {
  await open(page, C1);
  const a = post(page, "Birinci gönderi");
  await a.getByRole("link", { name: /Gönderi yorumları \(1\)/ }).waitFor();
  await a.getByRole("link", { name: /Birinci gönderi/ }).first().click();
  await page.waitForURL(/communities\/post\/local/);
  await page.getByText("Eski yorum").waitFor();
  const box = page.getByRole("textbox").first();
  await box.fill("Harika bir fikir");
  await box.press("Enter");
  await page.getByText("Harika bir fikir").waitFor();
  const posts = calls(db, "prompt_comments", "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.community_post_id, db.posts[0].id);
  assert.equal(posts[0].body.prompt_id, undefined);
  assert.equal(db.posts[0].comment_count, 2);
  await page.getByRole("link", { name: /Gönderi yorumları \(2\)/ }).first().waitFor();
  await page.goto(postPage(db.posts[1].id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByRole("link", { name: /Gönderi yorumları \(0\)/ }).first().waitFor();
  assert.equal(await page.getByText("Harika bir fikir").count(), 0, "comments never leak across posts");
  assert.equal(await page.getByText("Eski yorum").count(), 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); const first = db.addPost(C1, { title: "Birinci gönderi", commentCount: 1 }); db.addPost(C1, { title: "İkinci gönderi" }); first.created_at = "2026-03-02T00:00:00Z"; db.posts[1].created_at = "2026-03-01T00:00:00Z"; db.comments.push({ id: crypto.randomUUID(), community_post_id: first.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

await scenario("6. Aynı içerik iki toplulukta iki ayrı gönderidir: birindeki beğeni diğerinin sayacını değiştirmez", async ({ page, db }) => {
  await open(page, C1);
  await react(page, post(page, "Ortak içerik").locator("[data-post-engagement]").getByRole("button", { name: LIKE }).first());
  await page.waitForTimeout(300);
  assert.equal(db.posts.find((p) => p.community_id === C1).like_count, 1);
  assert.equal(db.posts.find((p) => p.community_id === C2).like_count, 0);
  assert.notEqual(db.posts[0].id, db.posts[1].id);
  await open(page, C2);
  await post(page, "Ortak içerik").locator("[data-post-engagement]").getByRole("button", { name: /Gönderi beğenisi: 0|0/ }).first().waitFor();
  assert.equal(calls(db, "prompt_likes", "POST").length, 1);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addCommunity(C2, { name: "İkinci Topluluk", myRole: "member", members: [[U.bob, "owner"]] }); db.addPost(C1, { title: "Ortak içerik" }); db.addPost(C2, { title: "Ortak içerik" }); } });

// 7
await scenario("7. Üye olmayan oturumlu kullanıcı okur ama beğenemez/yorum yazamaz: istek gitmez, açıklayıcı metin gösterilir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Açık gönderi");
  await card.locator("[data-post-engagement]").getByRole("button", { name: /Gönderi beğenisi/ }).click();
  await page.getByText("Gönderiyi beğenmek için topluluğa katıl.").first().waitFor();
  await page.goto(postPage(db.posts[0].id));
  await page.getByText("Eski yorum").waitFor();
  await page.getByText("Yorum yapmak için topluluğa katıl.").waitFor();
  assert.equal(await page.getByRole("textbox").count(), 0, "no composer for non-members");
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
  assert.equal(calls(db, "prompt_comments", "POST").length, 0);
}, { setup: (db) => { seed(db, { myRole: "none", visibility: "public" }); const p = db.addPost(C1, { title: "Açık gönderi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

await scenario("8. Kapatılmış (salt-okunur) topluluk: beğeni/yorum yazılamaz, nedeni gösterilir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Kapalı akış gönderisi");
  await card.locator("[data-post-engagement]").getByRole("button", { name: /Gönderi beğenisi/ }).click();
  await page.getByText("Topluluk kapatıldığı için yeni yorum yazılamaz.").first().waitFor();
  await page.goto(postPage(db.posts[0].id));
  await page.getByText("Topluluk kapatıldığı için yeni yorum yazılamaz.").first().waitFor();
  assert.equal(await page.getByRole("textbox").count(), 0);
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
}, { setup: (db) => { seed(db, { myRole: "member", closed: true }); db.addPost(C1, { title: "Kapalı akış gönderisi" }); } });

await scenario("9. Ziyaretçi: beğeni giriş diyaloğunu açar ve HİÇBİR istek göndermez; yorumları okuyabilir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Ziyaretçi gönderisi");
  await card.locator("[data-post-engagement]").getByRole("button", { name: /beğen/i }).first().click();
  await page.getByRole("dialog").first().waitFor();
  await page.keyboard.press("Escape");
  await page.goto(postPage(db.posts[0].id));
  await page.getByText("Eski yorum").waitFor();
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
  assert.equal(calls(db, "prompt_comments", "POST").length, 0);
}, { guest: true, setup: (db) => { db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] }); const p = db.addPost(C1, { title: "Ziyaretçi gönderisi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

// 10
await scenario("10. Bildirim bağlantısı (?post=&hl=comment:): gönderi en üstte 'Açılan gönderi' olarak açılır, yorumlar açık, yorum vurgulu; olmayan gönderi için açıklama", async ({ page }) => {
  await open(page, C1, "feed", "&post=00000000-0000-4000-8000-00000000dead");
  await page.getByText("Bu gönderi artık yok ya da görüntüleme iznin yok.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Başka gönderi" }); } });

await scenario("10b. Bildirim bağlantısı (?post=&hl=comment:) başvuruyu KENDİ sayfasında açar; yorumlar açık, yorum görünür", async ({ page, db }) => {
  const p = db.posts[0];
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=feed&post=${p.id}&hl=comment:${db.comments[0].id}`);
  await page.waitForURL(/communities\/post\/local/);
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByText("Vurgulanacak yorum").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); const p = db.addPost(C1, { title: "Odak gönderisi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Vurgulanacak yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

await scenario("10c. ?post= ile açılan YEREL gönderi akışta 'Açılan gönderi' olarak en üstte çizilir ve listede ikinci kez çıkmaz", async ({ page, db }) => {
  const p = db.posts[0];
  await open(page, C1, "feed", `&post=${p.id}`);
  await page.getByRole("region", { name: "Açılan gönderi" }).waitFor();
  assert.equal(await page.locator(`li[data-community-post="${p.id}"]`).count(), 1);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel odak", kind: "native", visibility: "private" }); } });

// 11
await scenario("11. İçeriği erişilemeyen (silinmiş/özel) başvuru: yazara açıklayıcı yer tutucu; başkasına gönderi hiç çizilmez", async ({ page }) => {
  await open(page, C1);
  assert.equal(await page.locator("li[data-community-post]").count(), 1, "only the author's own post remains visible");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.bob, title: "Başkasının kaybolan", gone: true }); const m = db.addPost(C1, { author: U.alice, title: "Benim kaybolan", gone: true }); m.content = null; } });

// 12
await scenario("12. Yetki: yerel içerikte not/başvuru menüsü yok; başvuruda 'Notu düzenle' var; üye başkasının yerel içeriğinde TEK menüde topluluk 'bildir'i görür, yönetici kaldırması yok", async ({ page }) => {
  await open(page, C1);
  const native = post(page, "Yerel yazar");
  await native.getByRole("button", { name: /seçenekleri/ }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Notu düzenle" }).count(), 0);
  await page.keyboard.press("Escape");
  const app = post(page, "Başvuru yazar");
  await app.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Notu düzenle" }).waitFor();
  await page.keyboard.press("Escape");
  const theirs = post(page, "Başkasının yerel");
  await theirs.getByRole("button", { name: /seçenekleri/ }).click();
  await page.getByRole("menuitem", { name: "Topluluk yöneticilerine bildir" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: /Gönderiyi kaldır \(yönetici\)/ }).count(), 0, "a member never gets staff removal");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel yazar", kind: "native" }); db.addPost(C1, { author: U.alice, title: "Başvuru yazar", kind: "application", note: "n" }); db.addPost(C1, { author: U.bob, title: "Başkasının yerel", kind: "native" }); } });

// 13 — oluşturma ekranı topluluk bağlamı (docs/history/244-*: tek sayfa form, formun sonunda "Kim görsün?" bölümü)
const openPublish = async (page) => {
  await page.locator("[data-publish-panel]").waitFor();
  await page.locator("[data-publish-panel]").scrollIntoViewIfNeeded();
};
await scenario("13. Oluşturma ekranı topluluk bağlamıyla açılınca: yazma ekranı topluluğu söyler; Kim görsün?'te topluluk seçili, cümle ne olacağını yazar, 'Taslak' YOK; bağlam yokken taslak var", async ({ page }) => {
  await page.goto(`${BASE}/requests/new?community=${C1}`);
  await page.locator("[data-compose-audience]").getByText("Prompt Atölyesi").waitFor();
  await openPublish(page);
  await page.locator('[data-audience-field="community"]').waitFor();
  await page.locator("[data-audience-community]").getByText("Prompt Atölyesi").waitFor();
  assert.match(await page.locator('[data-publish-summary="community"]').innerText(), /Prompt Atölyesi topluluğuna ait olacak/);
  assert.equal(await page.locator("[data-announce-picker]").count(), 0, "community content is not announced elsewhere");
  assert.equal(await page.locator("[data-publish-panel] [data-action=save-draft]").count(), 0, "community content can't be a draft");
  await page.locator("[data-publish-panel] [data-action=publish]").waitFor();
  await page.goto(`${BASE}/requests/new`);
  await openPublish(page);
  await page.locator('[data-audience-field="public"]').waitFor();
  await page.locator('[data-audience-option="private"]').waitFor();
  await page.locator("[data-publish-panel] [data-action=save-draft]").waitFor();
  await page.locator('[data-publish-summary="public"]').waitFor();
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("13b. Yayınlama: topluluk bağlamlı NORMAL istek formu içeriği doğrudan `community_id` ile kaydeder (ayrı RPC YOK), akış gönderisi kendiliğinden oluşur ve akışa dönülür", async ({ page, db }) => {
  await page.goto(`${BASE}/requests/new?community=${C1}`);
  await page.locator("[data-compose-audience]").getByText("Prompt Atölyesi").waitFor();
  await page.locator("#request-title").fill("Topluluğa özel istek");
  await page.locator("#request-description").fill("Bu topluluk için bir stil isteği");
  await openPublish(page);
  await page.locator("[data-publish-panel] [data-action=publish]").click();
  await page.waitForURL(/communities\/local\/?\?id=.*shared=1/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.community_id, C1, "the content is created INSIDE the community");
  assert.equal(inserted[0].body.is_draft, false);
  assert.equal(calls(db, "publish_native_community_post", "RPC").length, 0, "no second step: the server creates the feed post");
  assert.equal(calls(db, "share_to_community", "RPC").length, 0, "native content never goes through the application RPC");
  await page.getByText("İçeriğin yayınlandı ve toplulukta paylaşıldı.").waitFor();
  assert.equal(db.posts.filter((p) => p.kind === "native").length, 1);
  await page.locator('li[data-community-post][data-post-kind="native"]').first().waitFor();
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("13c. Normal (topluluk bağlamsız) istek formu `community_id` göndermez", async ({ page, db }) => {
  await page.goto(`${BASE}/requests/new`);
  await page.locator("#request-title").fill("Normal istek");
  await page.locator("#request-description").fill("Bu normal bir isteğin yeterince uzun açıklamasıdır");
  await openPublish(page);
  await page.locator("[data-publish-panel] [data-action=publish]").click();
  await page.waitForURL(/requests\/local/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.ok(!inserted[0].body.community_id, "ordinary content stays ordinary");
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("13d. Prompt: /create?mode=prompt&community= ve yalnız ?community= seçim ekranına DÜŞMEDEN doğrudan prompt yazma ekranını açar", async ({ page }) => {
  for (const url of [`/create?mode=prompt&community=${C1}`, `/create?community=${C1}`]) {
    await page.goto(`${BASE}${url}`);
    await page.locator("[data-compose-audience]").getByText("Prompt Atölyesi").waitFor();
    assert.equal(await page.locator("[data-create-menu]").count(), 0, `${url} must not show the type picker`);
  }
}, { setup: (db) => seed(db, { myRole: "member" }) });

// 16 — başvuru sayfası
await scenario("16. Başvuru sayfası = başvurulan içeriğin NORMAL detay sayfası (başlık, açıklama, prompt metni) + üstte başvuru bandı (not, 'Orijinal içeriği aç'); eylem satırı gönderinin kendisine bağlı: beğeni, kaydet, istatistik, paylaş, yorum", async ({ page, db }) => {
  const p = db.posts[0];
  await page.goto(postPage(p.id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByRole("heading", { name: "Ayrıntılı prompt", level: 1 }).waitFor();
  await page.getByText("açıklama", { exact: true }).first().waitFor();
  await page.getByText("metin", { exact: true }).first().waitFor();
  await page.locator("[data-post-note]").getByText("Denemek isteyen olur").waitFor();
  assert.match((await page.locator("[data-open-original]").getAttribute("href")) ?? "", /prompts\/local\/?\?id=/);
  const back = page.getByRole("link", { name: /akışına dön/ });
  assert.match((await back.getAttribute("href")) ?? "", new RegExp(`communities/local/?\\?id=${C1}&tab=feed`));
  // Normal detay sayfasındaki eylem satırının aynısı: Beğeni · Yorum · Kaydet · İstatistik … Paylaş (hepsi gönderiye bağlı)
  const bar = page.locator("[data-detail-actions]", { has: page.getByRole("button", { name: "Paylaş" }) }).first();
  await bar.getByRole("button", { name: /Kaydet|koleksiyon/i }).first().waitFor();
  await bar.getByRole("button", { name: /İstatistik/i }).first().waitFor();
  await react(page, page.getByRole("button", { name: LIKE }).first());
  await page.waitForTimeout(300);
  assert.equal(calls(db, "prompt_likes", "POST")[0].body.community_post_id, p.id);
  assert.equal(calls(db, "prompt_likes", "POST")[0].body.prompt_id, undefined);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Ayrıntılı prompt", note: "Denemek isteyen olur" }); } });

await scenario("16a. Başvuru sayfasında KAYDET: normal koleksiyon penceresi, kaydedilen şey gönderinin kendisi (community_post_id), içerik değil; yerel içerik değil", async ({ page, db }) => {
  const p = db.posts[0];
  await page.goto(postPage(p.id));
  await page.locator("[data-community-post-page]").waitFor();
  const bar = page.locator("[data-detail-actions]", { has: page.getByRole("button", { name: "Paylaş" }) }).first();
  await bar.getByRole("button", { name: /Kaydet|koleksiyon/i }).first().click();
  await dlg(page).getByRole("button", { name: "Kaydet", exact: true }).waitFor();
  await dlg(page).getByRole("checkbox").first().check();
  await dlg(page).getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.waitForTimeout(400);
  const added = calls(db, "collection_items", "POST");
  assert.equal(added.length, 1);
  assert.equal(added[0].body.community_post_id, p.id, "the POST is saved");
  assert.equal(added[0].body.prompt_id, undefined, "never the original content");
  assert.equal(db.posts[0].save_count, 1, "the post's OWN save counter");
  await page.waitForTimeout(300);
  await bar.getByRole("button", { name: /koleksiyon|Kaydedildi|Kaydet/i }).first().getByText("1", { exact: true }).waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Kaydedilecek", note: "n" }); } });

await scenario("16g. Kaydedilenler: kaydedilen başvuru gönderisi, akıştaki karta AYNI kart (kaydet/istatistik/paylaş) olarak listelenir; topluluğu okuyamayınca listede görünmez", async ({ page, db }) => {
  const p = db.posts[0];
  db.collectionItems.push({ id: "f0000000-0000-4000-8000-000000000001", collection_id: db.collections[0].id, community_post_id: p.id, created_at: db.stamp() });
  await page.goto(`${BASE}/saved`);
  const card = page.locator("article", { hasText: "Kaydedilmiş başvuru" }).first();
  await card.waitFor();
  await card.getByText("Alıntı", { exact: true }).waitFor();
  await card.getByRole("button", { name: /İstatistik/i }).first().waitFor();
  await card.getByRole("button", { name: "Paylaş" }).waitFor();
  assert.match((await card.getByRole("link", { name: /Kaydedilmiş başvuru/ }).first().getAttribute("href")) ?? "", /communities\/post\/local/);
  // topluluğa erişim kalktı → gönderi okunamaz → kart listede yer almaz (kırık kart yok)
  db.posts.length = 0;
  await page.reload();
  await page.getByText("Kaydedilmiş başvuru").waitFor({ state: "detached" });
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Kaydedilmiş başvuru", note: "n" }); } });

await scenario("16e. Başvuru sayfasında ⋮ menüsü yalnız GÖNDERİ işlerini taşır (not düzenle / gönderimi kaldır); içeriğin düzenle/sil/bağlantı kopyala öğeleri orijinalin sayfasında kalır", async ({ page, db }) => {
  await page.goto(postPage(db.posts[0].id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByRole("button", { name: /seçenekleri/ }).first().click();
  await page.getByRole("menuitem", { name: "Notu düzenle" }).waitFor();
  await page.getByRole("menuitem", { name: "Gönderimi kaldır" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Düzenle", exact: true }).count(), 0, "content editing stays on the original page");
  assert.equal(await page.getByRole("menuitem", { name: "Sil", exact: true }).count(), 0);
  assert.equal(await page.getByRole("menuitem", { name: /Bağlantıyı kopyala/ }).count(), 0, "sharing goes through the post's Paylaş");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Kendi başvurum", note: "n" }); } });

await scenario("16b. Başvuru sayfası: içerik erişilemezse açıklayıcı yer tutucu, not ve yorumlar yine görünür; yazar notu düzenler, kaldırınca akışa döner", async ({ page, db }) => {
  const p = db.posts[0];
  await page.goto(postPage(p.id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByText(/Bu içerik artık görüntülenemiyor/).waitFor();
  await page.getByText("Not duruyor").waitFor();
  await page.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Notu düzenle" }).click();
  await dlg(page).getByLabel("Not").fill("Yeni not");
  await dlg(page).getByRole("button", { name: "Kaydet" }).click();
  await page.locator("[data-post-note]").getByText("Yeni not").waitFor();
  await page.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Gönderimi kaldır" }).click();
  await dlg(page).getByRole("button", { name: "Sil" }).click();
  await page.waitForURL(/communities\/local/);
  assert.equal(calls(db, "delete_community_post", "RPC").length, 1);
}, { setup: (db) => { seed(db, { myRole: "member" }); const p = db.addPost(C1, { author: U.alice, title: "kayıp", note: "Not duruyor", gone: true }); p.content = null; } });

await scenario("16c. Yerel gönderinin KENDİ başvuru sayfası yoktur: adresi içeriğin kendi sayfasına yönlenir; olmayan gönderi için açıklama", async ({ page, db }) => {
  await page.goto(postPage(db.posts[0].id));
  await page.waitForURL(/prompts\/local/);
  await page.goto(postPage("00000000-0000-4000-8000-00000000dead"));
  await page.getByText("Bu gönderi artık yok ya da görüntüleme iznin yok.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel", kind: "native", visibility: "private" }); } });

await scenario("16d. Başvuru sayfası İngilizce + mobil: normal detay sayfası çevrilir, başvuru bandı çevrilir, yatay taşma yok", async ({ page, db }) => {
  await page.goto(postPage(db.posts[0].id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByRole("heading", { name: "Detailed prompt", level: 1 }).waitFor();
  await page.getByText("Open the original").waitFor();
  await page.getByText(/belong to this post/).waitFor();
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 844 }, setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Detailed prompt", note: "n" }); } });

await scenario("16f. Başvuru sayfası tablet (820) ve koyu masaüstü: yatay taşma yok, eylem satırı ve yorumlar görünür", async ({ page, db }) => {
  await page.goto(postPage(db.posts[0].id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.locator("#comments").waitFor();
  assert.ok(await overflowFree(page));
  await page.setViewportSize({ width: 820, height: 1100 });
  await page.waitForTimeout(300);
  assert.ok(await overflowFree(page), "tablet");
}, { theme: "dark", setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Koyu tema", note: "n" }); } });

// 17 — başvuru gönderisini site içi mesajla paylaşma (docs/history/184-*)
const DM = "c0000000-0000-4000-8000-0000000000c9";
await scenario("17. Başvuru gönderisi site içi mesajla paylaşılır: Paylaş → 'mesaj olarak gönder' → sohbet seç → başlık şeridi → gönder; mesaj metni gönderi başlığı + gönderi bağlantısıdır, balon gerçek kart çizer", async ({ page, db }) => {
  const p = db.posts[0];
  await page.goto(postPage(p.id));
  await page.locator("[data-community-post-page]").waitFor();
  await page.getByRole("button", { name: "Paylaş" }).first().click();
  await dlg(page).getByRole("link", { name: /mesaj olarak gönder/ }).click();
  await page.waitForURL(/messages\/?\?sharePostId=/);
  assert.match(page.url(), new RegExp(`sharePostId=${p.id}`));
  await page.locator("a[href*='/messages/local'][href*='sharePostId=']", { hasText: "Carol" }).first().click();
  await page.waitForURL(/messages\/local/);
  await page.getByText(/Paylaşılıyor/).getByText(/Mesajlaşılacak başvuru/).waitFor();
  await page.getByPlaceholder(/not ekle/i).fill("bak bunu");
  await page.getByRole("button", { name: "Mesaj gönder" }).click();
  await page.locator("[data-shared-post-card='ready']").waitFor();
  const sent = calls(db, "messages", "POST");
  assert.equal(sent.length, 1);
  const body = sent[0].body.body;
  assert.match(body, /^bak bunu\n\nMesajlaşılacak başvuru\n.*\/communities\/post\/local\?id=/);
  assert.ok(body.includes(p.id), "the link carries the POST id");
  assert.equal(sent[0].body.shared_prompt_id ?? null, null, "no embed column is used (the post is not a message type)");
  await page.locator("[data-shared-post-card='ready']").getByText("Mesajlaşılacak başvuru").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Mesajlaşılacak başvuru", note: "n" }); db.addConv(DM, U.carol, { texts: ["selam"] }); } });

await scenario("17b. Alıcı gönderiyi okuyamıyorsa (topluluğa erişimi yok) kart içeriği değil 'erişimin olmalı' gösterir; içerik sızmaz", async ({ page, db }) => {
  const id = "99999999-0000-4000-8000-000000000099";
  db.addMessage(DM, U.carol.id, `Kapalı başvuru\nhttps://example.dev/promptly/communities/post/local?id=${id}`);
  await page.goto(`${BASE}/messages/local?id=${DM}`);
  await page.locator("[data-shared-post-card='none']").waitFor();
  await page.getByText(/topluluğa erişimin olmalı/).waitFor();
  assert.equal(await page.getByText("Kapalı başvuru").count(), 1, "only the sender's own title line is in the plain text; the card itself reveals nothing");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addConv(DM, U.carol, { texts: ["selam"] }); } });

// 14 — i18n
await scenario("14. İngilizce: Create post / Apply an existing item / Application / Community content / post engagement metinleri", async ({ page }) => {
  await open(page, C1);
  const app = post(page, "App post");
  await app.getByText("Quote", { exact: true }).waitFor();
  assert.equal(await app.getByText("Open the original").count(), 0, "the original link lives on the application's page");
  const nat = post(page, "Native post");
  assert.equal(await nat.getByText("Community content").count(), 0);
  await page.getByRole("button", { name: "Create post" }).click();
  await dlg(page).getByRole("button", { name: /Create new content/ }).waitFor();
  await dlg(page).getByRole("button", { name: /Apply an existing item/ }).waitFor();
}, { lang: "en", setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "App post", kind: "application" }); db.addPost(C1, { title: "Native post", kind: "native" }); } });

// 15 — mobil / koyu tema / masaüstü
for (const [label, viewport, theme] of [["mobil 390", { width: 390, height: 844 }, undefined], ["tablet 768", { width: 768, height: 1024 }, undefined], ["koyu masaüstü", { width: 1280, height: 900 }, "dark"]]) {
  await scenario(`15. Düzen (${label}): yatay taşma yok; gönderi kartı, etkileşim çubuğu ve açık yorumlar sığar`, async ({ page }) => {
    await open(page, C1);
    assert.ok(await overflowFree(page), "feed overflows horizontally");
    const card = post(page, "Uzun başlıklı gönderi");
    const heights = await card.locator("[data-post-engagement] button, [data-post-engagement] a").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.ok(heights.length >= 2 && heights.every((h) => h >= 36), `touch targets too small: ${heights}`);
    await card.getByRole("link", { name: /Uzun başlıklı gönderi/ }).first().click();
    await page.waitForURL(/communities\/post\/local/);
    await page.locator("[data-community-post-page]").waitFor();
    assert.ok(await overflowFree(page), "application page overflows horizontally");
    await page.goBack();
    await page.locator("li[data-community-post]").first().waitFor();
    await page.getByRole("button", { name: "Gönderi oluştur" }).click();
    assert.ok(await overflowFree(page), "create-post modal overflows");
  }, { viewport, theme, setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Uzun başlıklı gönderi ".repeat(8), note: "Uzun not ".repeat(30), kind: "application" }); } });
}

console.log("");
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
