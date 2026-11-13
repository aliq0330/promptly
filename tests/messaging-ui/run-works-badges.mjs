// "Çalıştı mı?" oyunun yorum/sonuç rozeti + oydan sonraki isteğe bağlı davet (docs/history/341-*). Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — oyun kimin
// görebileceği/gizliliği SUNUCU kuralıdır (supabase/tests/prompt-works-for-users.sql). Burada yalnız istemci davranışı sınanır: davetin biçimi ("Çalışmadı" = belirgin
// yorum kutusu, "Çalıştı" = sönük + Sonucunu paylaş), yorumun listeye eklenmesi, yorum ve sonuç kartında rozet, toplu okuma (yorum başına istek yok), hata sessizliği,
// sonuç penceresindeki "Çalıştı olarak da işaretle" kutusu, iki dil, telefon taşması.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { PAGES, ID, installDetailData, seedComments } from "./detail-fixtures.mjs";

const PORT = 4310;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";
const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, ...headers }, body: JSON.stringify(body) });

const profile = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [], is_demo: false });
const thumb = (a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${a}"/><circle cx="200" cy="200" r="90" fill="${b}"/></svg>`)}`;
const RESULT_ROWS = [
  ["c1", U.bob, "#3f6e8c", "#d9e4ee"],
  ["c2", U.dave, "#8a5a44", "#f2d2b0"],
  ["c3", U.amy, "#2b3a67", "#f6c9a0"],
].map(([n, u, a, b]) => ({ id: `c0000000-0000-4000-8000-0000000000${n.slice(1).padStart(2, "0")}`, prompt_id: ID.prompt, media_type: "image", thumbnail_url: thumb(a, b), text_content: null, tool: null, has_modification: false, like_count: 0, created_at: "2026-09-21T10:00:00Z", profiles: profile(u) }));

/** Sunucu taklidi: oy durumu + oy yazma + rozet için "kişi → oy" (yalnız oy verenler). */
function worksServer({ my = null, canVote = true, votes = {}, failBadges = false } = {}) {
  const s = { yes: 8, no: 2, my, canVote, votes: { ...votes }, voteCalls: [], badgeCalls: [], failBadges, resultPosts: [] };
  const row = () => [{ yes_count: s.yes, no_count: s.no, my_vote: s.my, can_vote: s.canVote }];
  return {
    s,
    install(db) {
      db.rpc.prompt_works_state = () => ({ body: row() });
      db.rpc.record_prompt_copy = () => { s.canVote = true; return { body: true }; };
      db.rpc.set_prompt_works = (body) => {
        s.voteCalls.push(body);
        if (s.my === true) s.yes -= 1;
        if (s.my === false) s.no -= 1;
        s.my = body.p_works;
        if (s.my === true) s.yes += 1;
        if (s.my === false) s.no += 1;
        if (s.my === null) delete s.votes[ME]; else s.votes[ME] = s.my;
        return { body: row() };
      };
      db.rpc.prompt_works_for_users = (body) => {
        s.badgeCalls.push(body);
        if (s.failBadges) return { status: 500, body: { message: "boom" } };
        return { body: body.p_user_ids.filter((id) => id in s.votes).map((id) => ({ user_id: id, works: s.votes[id] })) };
      };
    },
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, comments = true, resultCards = false, ...serverOpts } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  if (comments) seedComments(db, "prompt");
  const ws = worksServer(serverOpts);
  ws.install(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompt_results/, (route) => {
    const req = route.request();
    if (req.method() === "POST") { ws.s.resultPosts.push(JSON.parse(req.postData() ?? "{}")); return route.fulfill({ status: 201, headers: CORS, body: "" }); }
    const rows = resultCards ? RESULT_ROWS : [];
    return json(route, rows, 200, { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await fn({ page, s: ws.s, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pw-works-badges-fail-${results.length}.png`, fullPage: true }); } catch {}
  } finally { await context.close(); }
}

const block = (page) => page.locator("[data-works-vote]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Yorum satırı: yazar adı + rozet + metin aynı <p>'de durur. */
const commentLine = (page, text) => page.locator("p", { hasText: text });
const openAllComments = async (page) => { await page.getByRole("button", { name: /Tümünü gör/ }).click().catch(() => {}); };

await scenario("1. 'Çalışmadı' → belirgin yorum kutusu açılır, sonuç önerisi YOK; yazıp gönderince yorum listeye eklenir ve yazarın oyu rozet olarak yanında durur", async ({ page, s, db }) => {
  await block(page).getByRole("button", { name: "Çalışmadı" }).click();
  const invite = block(page).locator("[data-works-invite='strong']");
  await invite.getByText("Neyi beklemiştin, ne çıktı?").waitFor();
  await invite.getByText(/«Çalışmadı» rozetiyle görünür/).waitFor();
  assert.equal(await invite.getByRole("button", { name: "Sonucunu paylaş" }).count(), 0, "a failed output is never offered as a result");
  const box = invite.getByRole("textbox");
  assert.equal(await invite.getByRole("button", { name: "Yorumu gönder" }).isDisabled(), true, "empty draft cannot be sent");
  await box.fill("Midjourney v7'de yüzler bozuk çıktı.");
  await invite.getByRole("button", { name: "Yorumu gönder" }).click();
  await block(page).locator("[data-works-invite-sent]").waitFor();
  assert.equal(await block(page).locator("[data-works-invite]").count(), 0, "the invite closes after sending");
  const mine = db.comments.find((c) => c.body === "Midjourney v7'de yüzler bozuk çıktı.");
  assert.ok(mine, "the comment was written");
  assert.equal(mine.author_id, ME);
  assert.equal(mine.prompt_id, ID.prompt);
  assert.equal(mine.parent_id, null);
  const line = commentLine(page, "Midjourney v7'de yüzler bozuk çıktı.");
  await line.waitFor();
  await line.locator("[data-works-badge='no']").waitFor();
  assert.deepEqual(s.voteCalls, [{ p_prompt_id: ID.prompt, p_works: false }]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/works-badges-desktop.png`, fullPage: true });
}, { canVote: true });

await scenario("2. 'Çalıştı' (görsel prompt) → sönük davet: 'Sonucunu paylaş' öne çıkar (ilk), 'Yorum ekle' ikinci; 'Sonucunu paylaş' sonuç penceresini açar", async ({ page }) => {
  await block(page).getByRole("button", { name: "Çalıştı" }).click();
  const invite = block(page).locator("[data-works-invite='soft']");
  await invite.getByText("Oyun kaydedildi. Nasıl çıktığını göstermek ister misin?").waitFor();
  const names = await invite.getByRole("button").allTextContents();
  assert.deepEqual(names.map((n) => n.trim()), ["Sonucunu paylaş", "Yorum ekle", "Şimdi değil"]);
  assert.equal(await invite.getByRole("textbox").count(), 0, "the comment box stays closed until asked");
  await invite.getByRole("button", { name: "Sonucunu paylaş" }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Sonuç ekle" }).waitFor();
}, { canVote: true });

await scenario("3. 'Yorum ekle' kutuyu açar; 'Şimdi değil' daveti kapatır ama oy durur; oyu geri alınca davet de kapanır", async ({ page, s }) => {
  await block(page).getByRole("button", { name: "Çalıştı" }).click();
  const invite = block(page).locator("[data-works-invite]");
  await invite.getByRole("button", { name: "Yorum ekle" }).click();
  await invite.getByRole("textbox").waitFor();
  await invite.getByRole("button", { name: "Şimdi değil" }).click();
  assert.equal(await block(page).locator("[data-works-invite]").count(), 0);
  assert.equal(await block(page).getByRole("button", { name: "Çalıştı" }).getAttribute("aria-pressed"), "true", "dismissing the invite does not undo the vote");
  assert.equal(s.my, true);
  await block(page).getByRole("button", { name: "Çalıştı" }).click();   // aynı düğme = geri al
  await page.waitForFunction(() => document.querySelector("[data-works-invite]") === null);
  assert.equal(s.my, null);
}, { canVote: true });

await scenario("4. Yorumlarda rozet: oy veren yazarlarda ✓/✗, oy vermemiş yazarda yok; tek toplu istek (yorum başına istek yok)", async ({ page, s }) => {
  await openAllComments(page);
  const bob = commentLine(page, "Deniz: Kare formatta");
  const dave = commentLine(page, "Elif: Müşterime");
  const amy = commentLine(page, "Selin: Cam ve metal");
  await bob.locator("[data-works-badge='yes']").waitFor();
  await dave.locator("[data-works-badge='no']").waitFor();
  assert.equal(await amy.locator("[data-works-badge]").count(), 0, "no vote → no badge");
  assert.equal(s.badgeCalls.length, 1, "one batched read for the whole thread");
  const ids = s.badgeCalls[0].p_user_ids;
  assert.ok(ids.includes(U.bob.id) && ids.includes(U.dave.id) && ids.includes(U.amy.id), "every comment author is asked about in that one call");
  assert.equal(s.badgeCalls[0].p_prompt_id, ID.prompt);
}, { votes: { [U.bob.id]: true, [U.dave.id]: false }, canVote: false });

await scenario("5. Ziyaretçi de rozeti görür (yorumlar ve sonuçlar ziyaretçiye açık)", async ({ page }) => {
  await openAllComments(page);   // varsayılan sıra en yeni (docs/history/385-*): en eski yorum "Tümünü gör" ile açılır
  await commentLine(page, "Deniz: Kare formatta").locator("[data-works-badge='yes']").waitFor();
}, { guest: true, votes: { [U.bob.id]: true }, canVote: false });

await scenario("6. Kendi oyum yorumdaki rozeti anında değiştirir: yorumum 'Çalıştı' iken oyu 'Çalışmadı'ya çevirince rozet de çevrilir, geri alınca kaybolur", async ({ page, db }) => {
  db.comments.push({ id: crypto.randomUUID(), body: "Benim yorumum", author_id: ME, prompt_id: ID.prompt, parent_id: null, created_at: "2026-09-25T10:00:00Z" });
  await page.reload();   // yorum sayfa yüklendikten sonra eklendi: yeniden yükle ki liste onu da okusun
  await page.getByRole("heading", { level: 1 }).waitFor();
  await openAllComments(page);
  const mine = commentLine(page, "Benim yorumum");
  await mine.locator("[data-works-badge='yes']").waitFor();
  await block(page).getByRole("button", { name: "Çalışmadı" }).click();
  await mine.locator("[data-works-badge='no']").waitFor();
  await block(page).getByRole("button", { name: "Çalışmadı" }).click();   // geri al
  await page.waitForFunction(() => ![...document.querySelectorAll("p")].some((p) => p.textContent?.includes("Benim yorumum") && p.querySelector("[data-works-badge]")));
}, { my: true, votes: { [ME]: true }, canVote: true });

await scenario("7. Sonuç kartında rozet: oy veren paylaşanlarda ✓/✗, oy vermemişte yok; profil listesindeki kart etkilenmez", async ({ page, s }) => {
  const section = page.locator("section", { has: page.getByRole("heading", { name: /Kullanıcı sonuçları/ }) }).first();
  await section.locator("[data-works-badge='yes']").waitFor();
  await section.locator("[data-works-badge='no']").waitFor();
  assert.equal(await section.locator("[data-works-badge]").count(), 2, "only the two voters carry a badge");
  assert.ok(s.badgeCalls.some((c) => c.p_user_ids.includes(U.bob.id) && c.p_user_ids.includes(U.dave.id) && c.p_user_ids.includes(U.amy.id)));
}, { comments: false, resultCards: true, votes: { [U.bob.id]: true, [U.dave.id]: false }, canVote: false });

await scenario("8. Sonuç penceresi: oy yokken ve oy verebiliyorsa 'Çalıştı olarak da işaretle' kutusu BOŞ gelir; işaretleyip paylaşınca sonuç + oy (p_works=true) yazılır", async ({ page, s }) => {
  await page.getByRole("button", { name: "Sonuç ekle" }).first().click();
  const dialog = page.getByRole("dialog");
  const mark = dialog.locator("[data-works-mark] input[type=checkbox]");
  await mark.waitFor();
  assert.equal(await mark.isChecked(), false, "never ticked for the person");
  await dialog.getByRole("button", { name: "Metin gir" }).click();
  await dialog.getByRole("textbox").first().fill("Çıktı metni");
  await mark.check();
  await dialog.getByRole("button", { name: "Paylaş" }).click();
  await page.waitForFunction(() => document.querySelector("[role=dialog]") === null);
  assert.equal(s.resultPosts.length, 1);
  assert.equal(s.resultPosts[0].prompt_id, ID.prompt);
  assert.deepEqual(s.voteCalls, [{ p_prompt_id: ID.prompt, p_works: true }]);
}, { comments: false, canVote: true });

await scenario("9. Sonuç penceresi: kutuyu işaretlemeden paylaşınca oy YAZILMAZ; oy zaten varsa kutu yok, 'sonucunla birlikte görünür' notu var", async ({ page, s }) => {
  await page.getByRole("button", { name: "Sonuç ekle" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("[data-works-mark]").waitFor();
  await dialog.getByRole("button", { name: "Metin gir" }).click();
  await dialog.getByRole("textbox").first().fill("Başka bir çıktı");
  await dialog.getByRole("button", { name: "Paylaş" }).click();
  await page.waitForFunction(() => document.querySelector("[role=dialog]") === null);
  assert.equal(s.resultPosts.length, 1);
  assert.deepEqual(s.voteCalls, [], "the result alone never casts a vote");
}, { comments: false, canVote: true });

await scenario("10. Sonuç penceresi: oyu olan kişide kutu çıkmaz, not çıkar; kopyalamamış (oy veremeyen) kişide ikisi de çıkmaz", async ({ page }) => {
  await page.getByRole("button", { name: "Sonuç ekle" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-works-shown]").getByText("Oyun: «Çalıştı» — sonucunla birlikte görünür.").waitFor();
  assert.equal(await dialog.locator("[data-works-mark]").count(), 0);
}, { comments: false, my: true, canVote: true, votes: { [ME]: true } });

await scenario("11. Oy veremeyen (kopyalamamış) kişi: sonuç penceresinde ne kutu ne not", async ({ page }) => {
  await page.getByRole("button", { name: "Sonuç ekle" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Sonuç ekle" }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await dialog.locator("[data-works-mark], [data-works-shown]").count(), 0);
}, { comments: false, canVote: false });

await scenario("12. Rozet okuması patlarsa sessiz kalır: rozet çıkmaz, sayfa ve yorumlar çalışır, hata yüzeye çıkmaz", async ({ page, s }) => {
  await openAllComments(page);
  await commentLine(page, "Deniz: Kare formatta").waitFor();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  assert.ok(s.badgeCalls.length >= 1, "the read was attempted");
  assert.equal(await page.locator("[data-works-badge]").count(), 0);
}, { failBadges: true, votes: { [U.bob.id]: true }, canVote: false });

await scenario("13. İngilizce: davet ve rozet metinleri", async ({ page }) => {
  await block(page).getByRole("button", { name: "It didn't work" }).click();
  const invite = block(page).locator("[data-works-invite='strong']");
  await invite.getByText("What did you expect, and what came out?").waitFor();
  await invite.getByRole("button", { name: "Not now" }).waitFor();
  await invite.getByRole("textbox").fill("Faces came out broken.");
  await invite.getByRole("button", { name: "Post comment" }).click();
  await commentLine(page, "Faces came out broken.").locator("[data-works-badge='no']").getByText("It didn't work").waitFor();
}, { lang: "en", canVote: true });

await scenario("14. Telefon: davet ve rozetler taşmaz, düğmeler dokunulabilir boyda", async ({ page }) => {
  await block(page).getByRole("button", { name: "Çalışmadı" }).click();
  const invite = block(page).locator("[data-works-invite='strong']");
  await invite.getByRole("textbox").waitFor();
  assert.equal(await overflowFree(page), true);
  const h = await invite.getByRole("button", { name: "Yorumu gönder" }).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(h >= 32, `button height ${h}`);
  await openAllComments(page);
  await commentLine(page, "Elif: Müşterime").locator("[data-works-badge='no']").waitFor();
  assert.equal(await overflowFree(page), true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/works-badges-mobile.png`, fullPage: true });
}, { viewport: { width: 390, height: 844 }, canVote: true, votes: { [U.dave.id]: false } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
