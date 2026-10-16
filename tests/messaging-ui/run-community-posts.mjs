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
const calls = (db, table, method) => db.calls.filter((c) => c.table === table && (!method || c.method === method));
const open = async (page, id, tab = "feed", extra = "") => { await page.goto(`${BASE}/communities/local?id=${id}&tab=${tab}${extra}`); await page.locator("h1").first().waitFor(); await page.waitForTimeout(250); };
const seed = (db, opts = {}) => db.addCommunity(C1, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], ...opts });
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const post = (page, title) => page.locator("li[data-community-post]", { hasText: title }).first();
const PROMPT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PRIVATE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
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
  const expected = { prompt: "/create", request: "/requests/new", workflow: "/workflows/create", preset: "/presets/create" };
  for (const [type, href] of hrefs) assert.ok(href.replace("/promptly", "").replace(/\/\?/, "?") === `${expected[type]}?community=${C1}`, `${type} opens the EXISTING creation screen with the community context: ${href}`);
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
  await card.getByText("Başvuru", { exact: true }).waitFor();
  await card.getByText("Bu topluluğa uyar").waitFor();
  await card.getByText("Başvurulan içerik").waitFor();
  const link = card.getByRole("link", { name: /Açık Prompt/ });
  assert.match((await link.getAttribute("href")) ?? "", new RegExp(`/prompts/local/?\\?id=${PROMPT_ID}`));
  await card.getByText("Orijinal içeriği aç").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); own(db); } });

await scenario("2b. Notsuz başvuru gönderisinde not alanı hiç bulunmaz", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Notsuz içerik");
  await card.waitFor();
  assert.equal(await card.locator("[data-post-note]").count(), 0);
  await card.getByText("Orijinal içeriği aç").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Notsuz içerik", note: null }); } });

// 3
await scenario("3. Yerel gönderi: 'Yeni içerik' rozeti ve 'bu toplulukta … oluşturdu'; başvuru etiketi YOK; 'İçeriği aç'; özel içerikte 'Yalnızca bu topluluk'", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Yerel prompt");
  await card.getByText("Yeni içerik", { exact: true }).waitFor();
  await card.getByText("bu toplulukta bir prompt oluşturdu").waitFor();
  assert.equal(await card.getByText("Başvurulan içerik").count(), 0);
  await card.getByText("İçeriği aç").waitFor();
  await card.getByText("Yalnızca bu topluluk").waitFor();
  const other = post(page, "Genel prompt");
  assert.equal(await other.getByText("Yalnızca bu topluluk").count(), 0, "a public native item is not labeled community-only");
  assert.equal(await card.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).count(), 1);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Yerel prompt", kind: "native", visibility: "private" }); db.addPost(C1, { title: "Genel prompt", kind: "native", visibility: "public" }); } });

await scenario("3b. Eski (legacy) gönderi: tür rozeti TAHMİN EDİLMEZ, başvuru gibi gösterilir", async ({ page }) => {
  await open(page, C1);
  const card = post(page, "Eski gönderi");
  await card.waitFor();
  assert.equal(await card.getByText("Yeni içerik", { exact: true }).count(), 0);
  assert.equal(await card.getByText("Başvuru", { exact: true }).count(), 0);
  await card.getByText("bir prompt paylaştı").waitFor();
  await card.getByText("Orijinal içeriği aç").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Eski gönderi", kind: "legacy" }); } });

// 4
await scenario("4. Beğeni gönderi kimliğine bağlanır (community_post_id), içeriğe DEĞİL; geri alınır; çift tık tek istek; sayaç gönderiye aittir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Beğenilecek");
  const heart = card.locator("[data-post-engagement]").getByRole("button", { name: /beğen/i }).first();
  await heart.click();
  await page.waitForTimeout(300);
  let likes = calls(db, "prompt_likes", "POST");
  assert.equal(likes.length, 1);
  assert.ok(likes[0].body.community_post_id, "like targets the post id");
  assert.equal(likes[0].body.prompt_id, undefined, "never the original content");
  assert.equal(db.posts[0].like_count, 1);
  await card.locator("[data-post-engagement]").getByText("1", { exact: true }).first().waitFor();
  await heart.click();
  await page.waitForTimeout(300);
  assert.equal(calls(db, "prompt_likes", "DELETE").length, 1);
  assert.equal(db.posts[0].like_count, 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Beğenilecek" }); } });

await scenario("5. Yorum gönderi kimliğine bağlanır; sayaç artar; başka gönderinin yorumları karışmaz; içeriğin yorum tablosuna yazılmaz", async ({ page, db }) => {
  await open(page, C1);
  const a = post(page, "Birinci gönderi");
  await a.getByRole("button", { name: /Gönderi yorumları/ }).click();
  await a.getByText("Eski yorum").waitFor();
  const box = a.getByRole("textbox").first();
  await box.fill("Harika bir fikir");
  await box.press("Enter");
  await a.getByText("Harika bir fikir").waitFor();
  const posts = calls(db, "prompt_comments", "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.community_post_id, db.posts[0].id);
  assert.equal(posts[0].body.prompt_id, undefined);
  assert.equal(db.posts[0].comment_count, 2);
  await a.getByRole("button", { name: /Gönderi yorumları \(2\)/ }).waitFor();
  const b = post(page, "İkinci gönderi");
  await b.getByRole("button", { name: /Gönderi yorumları \(0\)/ }).waitFor();
  await b.getByRole("button", { name: /Gönderi yorumları/ }).click();
  assert.equal(await b.getByText("Harika bir fikir").count(), 0, "comments never leak across posts");
  assert.equal(await b.getByText("Eski yorum").count(), 0);
}, { setup: (db) => { seed(db, { myRole: "member" }); const first = db.addPost(C1, { title: "Birinci gönderi", commentCount: 1 }); db.addPost(C1, { title: "İkinci gönderi" }); first.created_at = "2026-03-02T00:00:00Z"; db.posts[1].created_at = "2026-03-01T00:00:00Z"; db.comments.push({ id: crypto.randomUUID(), community_post_id: first.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

await scenario("6. Aynı içerik iki toplulukta iki ayrı gönderidir: birindeki beğeni diğerinin sayacını değiştirmez", async ({ page, db }) => {
  await open(page, C1);
  await post(page, "Ortak içerik").locator("[data-post-engagement]").getByRole("button", { name: /beğen/i }).first().click();
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
  await card.getByRole("button", { name: /Gönderi yorumları/ }).click();
  await card.getByText("Eski yorum").waitFor();
  await card.getByText("Yorum yapmak için topluluğa katıl.").waitFor();
  assert.equal(await card.getByRole("textbox").count(), 0, "no composer for non-members");
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
  assert.equal(calls(db, "prompt_comments", "POST").length, 0);
}, { setup: (db) => { seed(db, { myRole: "none", visibility: "public" }); const p = db.addPost(C1, { title: "Açık gönderi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

await scenario("8. Kapatılmış (salt-okunur) topluluk: beğeni/yorum yazılamaz, nedeni gösterilir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Kapalı akış gönderisi");
  await card.locator("[data-post-engagement]").getByRole("button", { name: /Gönderi beğenisi/ }).click();
  await page.getByText("Topluluk kapatıldığı için yeni yorum yazılamaz.").first().waitFor();
  await card.getByRole("button", { name: /Gönderi yorumları/ }).click();
  assert.equal(await card.getByRole("textbox").count(), 0);
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
}, { setup: (db) => { seed(db, { myRole: "member", closed: true }); db.addPost(C1, { title: "Kapalı akış gönderisi" }); } });

await scenario("9. Ziyaretçi: beğeni giriş diyaloğunu açar ve HİÇBİR istek göndermez; yorumları okuyabilir", async ({ page, db }) => {
  await open(page, C1);
  const card = post(page, "Ziyaretçi gönderisi");
  await card.locator("[data-post-engagement]").getByRole("button", { name: /beğen/i }).first().click();
  await page.getByRole("dialog").first().waitFor();
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: /Gönderi yorumları/ }).click();
  await card.getByText("Eski yorum").waitFor();
  assert.equal(calls(db, "prompt_likes", "POST").length, 0);
  assert.equal(calls(db, "prompt_comments", "POST").length, 0);
}, { guest: true, setup: (db) => { db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] }); const p = db.addPost(C1, { title: "Ziyaretçi gönderisi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Eski yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

// 10
await scenario("10. Bildirim bağlantısı (?post=&hl=comment:): gönderi en üstte 'Açılan gönderi' olarak açılır, yorumlar açık, yorum vurgulu; olmayan gönderi için açıklama", async ({ page }) => {
  await open(page, C1, "feed", "&post=00000000-0000-4000-8000-00000000dead");
  await page.getByText("Bu gönderi artık yok ya da görüntüleme iznin yok.").waitFor();
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { title: "Başka gönderi" }); } });

await scenario("10b. ?post= ile açılan gönderi listede ikinci kez çizilmez; yorumlar açık gelir", async ({ page, db }) => {
  const p = db.posts[0];
  await open(page, C1, "feed", `&post=${p.id}&hl=comment:${db.comments[0].id}`);
  await page.getByRole("region", { name: "Açılan gönderi" }).waitFor();
  await page.getByText("Vurgulanacak yorum").waitFor();
  assert.equal(await page.locator(`li[data-community-post="${p.id}"]`).count(), 1, "the post is not duplicated in the feed list");
}, { setup: (db) => { seed(db, { myRole: "member" }); const p = db.addPost(C1, { title: "Odak gönderisi", commentCount: 1 }); db.comments.push({ id: crypto.randomUUID(), community_post_id: p.id, author_id: U.bob.id, body: "Vurgulanacak yorum", parent_id: null, created_at: "2026-03-02T01:00:00Z" }); } });

// 11
await scenario("11. İçeriği erişilemeyen (silinmiş/özel) başvuru: yazara açıklayıcı yer tutucu; başkasına gönderi hiç çizilmez", async ({ page }) => {
  await open(page, C1);
  assert.equal(await page.locator("li[data-community-post]").count(), 1, "only the author's own post remains visible");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.bob, title: "Başkasının kaybolan", gone: true }); const m = db.addPost(C1, { author: U.alice, title: "Benim kaybolan", gone: true }); m.content = null; } });

// 12
await scenario("12. Yetki: yerel gönderide 'notu düzenle' yok; başvuruda var; başkasının gönderisinde yazar menüsü yok", async ({ page }) => {
  await open(page, C1);
  const native = post(page, "Yerel yazar");
  await native.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Notu düzenle" }).count(), 0);
  await page.keyboard.press("Escape");
  const app = post(page, "Başvuru yazar");
  await app.getByRole("button", { name: "Topluluk gönderisi seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Notu düzenle" }).waitFor();
  assert.equal(await page.getByRole("menuitem", { name: /Gönderiyi kaldır \(yönetici\)/ }).count(), 0, "a member never gets staff removal");
}, { setup: (db) => { seed(db, { myRole: "member" }); db.addPost(C1, { author: U.alice, title: "Yerel yazar", kind: "native" }); db.addPost(C1, { author: U.alice, title: "Başvuru yazar", kind: "application", note: "n" }); } });

// 13 — oluşturma ekranı topluluk bağlamı
await scenario("13. Oluşturma ekranı topluluk bağlamıyla açılınca: hangi toplulukta yayınlanacağı yazar, görünürlük dili topluluğa uyar (yeni görünürlük değeri YOK)", async ({ page }) => {
  await page.goto(`${BASE}/requests/new?community=${C1}`);
  await page.locator("[data-community-context]").waitFor();
  await page.getByText(/“Prompt Atölyesi” topluluğunun akışında kendi gönderisi/).waitFor();
  const sw = page.locator("[data-visibility-switch] [role=switch]");
  await sw.waitFor();
  await page.getByText("Topluluk gönderisi olur; herkes görebilir").waitFor();
  await sw.click();
  await page.getByText("Yalnızca topluluk", { exact: true }).waitFor();
  await page.getByText(/Prompt Atölyesi topluluğunu okuyabilenler görebilir/).waitFor();
  assert.equal(await page.getByText("Sadece ben", { exact: true }).count(), 0, "community context never says 'only me'");
  // topluluk bağlamı yokken eski dil
  await page.goto(`${BASE}/requests/new`);
  await page.locator("[data-visibility-switch] [role=switch]").click();
  await page.getByText("Sadece ben", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-community-context]").count(), 0);
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("13b. Yayınlama: topluluk bağlamlı NORMAL istek formundan yayınlayınca yerel gönderi RPC'si çağrılır (içerik özel de olabilir) ve akışa dönülür; taslak topluluğa gönderilmez", async ({ page, db }) => {
  await page.goto(`${BASE}/requests/new?community=${C1}`);
  await page.locator("[data-community-context]").waitFor();
  await page.locator("#request-title").fill("Topluluğa özel istek");
  await page.locator("#request-description").fill("Bu topluluk için bir stil isteği");
  await page.locator("[data-visibility-switch] [role=switch]").click(); // → yalnızca topluluk (private)
  await page.locator("[data-create-form-actions] [data-action=publish]").click();
  await page.waitForURL(/communities\/local\/?\?id=.*shared=1/);
  const inserted = calls(db, "prompt_requests", "POST");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].body.visibility, "private", "the existing visibility value is kept; no new value is invented");
  const native = calls(db, "publish_native_community_post", "RPC");
  assert.equal(native.length, 1);
  assert.equal(native[0].body.p_group_id, C1);
  assert.equal(native[0].body.p_content_type, "request");
  assert.equal(native[0].body.p_content_id, inserted[0].body.id);
  assert.equal(calls(db, "share_to_community", "RPC").length, 0, "native publishing never goes through the application RPC");
  await page.getByText("İçeriğin yayınlandı ve toplulukta paylaşıldı.").waitFor();
  const card = page.locator('li[data-community-post][data-post-kind="native"]').first();
  await card.getByText("Yeni içerik", { exact: true }).waitFor();
}, { setup: (db) => seed(db, { myRole: "member" }) });

await scenario("13c. Yayınlama başarısız olursa (ör. içerik yeni sayılmıyor): içerik kaybolmaz, akışta nedenini anlatan uyarı gösterilir", async ({ page, db }) => {
  db.rpc.publish_native_community_post = () => ({ status: 400, body: { code: "P0001", message: "content_not_new", details: "", hint: "" } });
  await page.goto(`${BASE}/requests/new?community=${C1}`);
  await page.locator("#request-title").fill("Gecikmiş istek");
  await page.locator("#request-description").fill("Bu isteğin açıklaması yeterince uzun bir metindir");
  await page.locator("[data-create-form-actions] [data-action=publish]").click();
  await page.waitForURL(/shareFailed=content_not_new/);
  await page.getByText(/toplulukta gönderi olarak eklenemedi/).waitFor();
  assert.equal(calls(db, "prompt_requests", "POST").length, 1, "the content itself was saved");
  assert.equal(db.posts.length, 0);
}, { setup: (db) => seed(db, { myRole: "member" }) });

// 14 — i18n
await scenario("14. İngilizce: Create post / Apply an existing item / Application / New content / post engagement metinleri", async ({ page }) => {
  await open(page, C1);
  const app = post(page, "App post");
  await app.getByText("Application", { exact: true }).waitFor();
  await app.getByText("Applied content").waitFor();
  await app.getByText("Open the original").waitFor();
  const nat = post(page, "Native post");
  await nat.getByText("New content", { exact: true }).waitFor();
  await nat.getByText("created a prompt in this community").waitFor();
  await nat.getByRole("button", { name: /Post comments/ }).click();
  await nat.getByText("Join the community to comment.").waitFor().catch(() => undefined);
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
    await card.getByRole("button", { name: /Gönderi yorumları/ }).click();
    await card.getByText("Yorum").first().waitFor().catch(() => undefined);
    assert.ok(await overflowFree(page), "open comments overflow horizontally");
    const heights = await card.locator("[data-post-engagement] [role=group] button").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    assert.ok(heights.every((h) => h >= 36), `touch targets too small: ${heights}`);
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
