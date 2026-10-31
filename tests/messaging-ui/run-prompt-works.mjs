// "Çalıştı mı?" oyu (docs/history/296-*): prompt detay sayfasındaki blok. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — kimin oy verebileceği, sayaçların
// doğruluğu ve engeller SUNUCU kuralıdır (supabase/tests/prompt-works.sql). Burada yalnız istemci davranışı sınanır: bloğun ne zaman göründüğü, rozet/yüzde
// eşikleri, oy ver/değiştir/geri al (RPC gövdeleri), kopyalayınca yenilenme, sunucu hata kodunun çevrilmiş mesajı, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { PAGES, ID, installDetailData } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4196/promptly";
const server = await serve(4196);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

/** Sunucu durumu taklidi: sayılar + benim oyum + oy verebilir miyim; RPC çağrıları `calls`'a yazılır. */
function worksServer(initial) {
  const s = { yes: 0, no: 0, my: null, canVote: false, failNextVote: null, ...initial, stateCalls: 0, voteCalls: [], copyCalls: 0 };
  const row = () => [{ yes_count: s.yes, no_count: s.no, my_vote: s.my, can_vote: s.canVote }];
  return {
    s,
    install(db) {
      db.rpc.prompt_works_state = () => { s.stateCalls += 1; return { body: row() }; };
      db.rpc.record_prompt_copy = () => { s.copyCalls += 1; s.canVote = true; return { body: true }; };
      db.rpc.set_prompt_works = (body) => {
        s.voteCalls.push(body);
        if (s.failNextVote) { const message = s.failNextVote; s.failNextVote = null; return { status: 400, body: { message } }; }
        if (s.my === true) s.yes -= 1;
        if (s.my === false) s.no -= 1;
        s.my = body.p_works;
        if (s.my === true) s.yes += 1;
        if (s.my === false) s.no += 1;
        return { body: row() };
      };
    },
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, initial = {} } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  const ws = worksServer(initial);
  ws.install(db);
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:4196" }).catch(() => {});
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await fn({ page, s: ws.s });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pw-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const block = (page) => page.locator("[data-works-vote]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Oy verebilen kullanıcı: özet '%80 çalıştı · 10 oy' (rozet yok), iki düğme; 'Çalıştı'ya basınca RPC p_works=true, sayı 9'a çıkar, düğme basılı", async ({ page, s }) => {
  await block(page).waitFor();
  await block(page).getByText("%80 çalıştı · 10 oy").waitFor();
  assert.equal(await block(page).getByText("Kanıtlanmış").count(), 0, "8 of 10 is not 'proven'");
  const yes = block(page).getByRole("button", { name: "Çalıştı" });
  await yes.click();
  await block(page).getByText("%82 çalıştı · 11 oy").waitFor();
  assert.deepEqual(s.voteCalls, [{ p_prompt_id: ID.prompt, p_works: true }]);
  assert.equal(await yes.getAttribute("aria-pressed"), "true");
  assert.equal(await block(page).getByRole("button", { name: "Çalışmadı" }).getAttribute("aria-pressed"), "false");
  await block(page).getByText("Oyunu geri almak için aynı düğmeye tekrar bas.").waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/works-desktop.png`, fullPage: true });
}, { initial: { yes: 8, no: 2, canVote: true } });

await scenario("2. Oyu değiştir ve geri al: 'Çalışmadı'ya basınca p_works=false; aynı düğmeye tekrar basınca p_works=null (geri alma)", async ({ page, s }) => {
  const yes = block(page).getByRole("button", { name: "Çalıştı" });
  const no = block(page).getByRole("button", { name: "Çalışmadı" });
  await no.click();
  await block(page).getByText("%78 çalıştı · 9 oy").waitFor();
  assert.equal(await no.getAttribute("aria-pressed"), "true");
  assert.equal(await yes.getAttribute("aria-pressed"), "false");
  await no.click();
  await page.waitForFunction(() => document.querySelector("[data-works-vote] button[aria-pressed='true']") === null);
  assert.deepEqual(s.voteCalls.map((c) => c.p_works), [false, null]);
}, { initial: { yes: 8, no: 1, my: true, canVote: true } });

await scenario("3. 'Kanıtlanmış' rozeti yalnız yeterli oy + yüksek oranda (180 evet / 20 hayır)", async ({ page }) => {
  await block(page).getByText("Kanıtlanmış").waitFor();
  await block(page).getByText("%90 çalıştı · 200 oy").waitFor();
}, { initial: { yes: 180, no: 20, canVote: true } });

await scenario("4. Az oy: yüzde gösterilmez ('Henüz yeterli oy yok (3 oy)'), rozet yok", async ({ page }) => {
  await block(page).getByText("Henüz yeterli oy yok (3 oy)").waitFor();
  assert.equal(await block(page).getByText(/%\d+ çalıştı/).count(), 0);
  assert.equal(await block(page).getByText("Kanıtlanmış").count(), 0);
}, { initial: { yes: 3, no: 0, canVote: true } });

await scenario("5. Kopyalamamış kullanıcı: oy düğmesi yok, 'önce kopyalayıp dene' ipucu; sayılar görünür", async ({ page }) => {
  await block(page).getByText("Oy vermek için promptu önce kopyalayıp dene.").waitFor();
  assert.equal(await block(page).getByRole("button", { name: "Çalıştı" }).count(), 0);
  await block(page).getByText("%80 çalıştı · 10 oy").waitFor();
}, { initial: { yes: 8, no: 2, canVote: false } });

await scenario("6. Kopyalayınca blok kendini yeniler: önce ipucu, 'Kopyala'dan sonra oy düğmeleri çıkar", async ({ page, s }) => {
  await block(page).getByText("Oy vermek için promptu önce kopyalayıp dene.").waitFor();
  const before = s.stateCalls;
  await page.locator("#prompt-text").getByRole("button", { name: /Kopyala/ }).first().click();
  await block(page).getByRole("button", { name: "Çalıştı" }).waitFor();
  assert.equal(s.copyCalls, 1);
  assert.ok(s.stateCalls > before, "the state was fetched again after the copy was recorded");
}, { initial: { yes: 8, no: 2, canVote: false } });

await scenario("7. Ziyaretçi: oy yokken blok hiç çizilmez; oy varsa yalnız sayılar (düğme/ipucu yok)", async ({ page }) => {
  await page.waitForTimeout(600);
  assert.equal(await block(page).count(), 0);
}, { guest: true, initial: { yes: 0, no: 0 } });

await scenario("8. Ziyaretçi, oylu prompt: sayılar görünür, düğme ve 'önce kopyala' ipucu yok", async ({ page }) => {
  await block(page).getByText("%80 çalıştı · 10 oy").waitFor();
  assert.equal(await block(page).getByRole("button").count(), 0);
  assert.equal(await block(page).getByText("Oy vermek için").count(), 0);
}, { guest: true, initial: { yes: 8, no: 2 } });

await scenario("9. Sunucu reddederse (copy_required): çevrilmiş mesaj bloğun içinde, iyimser değişiklik geri alınır", async ({ page, s }) => {
  s.failNextVote = "copy_required";
  await block(page).getByRole("button", { name: "Çalıştı" }).click();
  await block(page).getByRole("alert").getByText("Oy vermek için promptu önce kopyalamış olmalısın.").waitFor();
  await block(page).getByText("%80 çalıştı · 10 oy").waitFor();
  assert.equal(await block(page).getByRole("button", { name: "Çalıştı" }).getAttribute("aria-pressed"), "false");
}, { initial: { yes: 8, no: 2, canVote: true } });

await scenario("10. İngilizce: başlık, düğmeler, özet, rozet ve hata cümlesi", async ({ page, s }) => {
  await block(page).getByRole("heading", { name: "Did it work?" }).waitFor();
  await block(page).getByText("Proven").waitFor();
  await block(page).getByText("90% worked · 200 votes").waitFor();
  s.failNextVote = "copy_required";
  await block(page).getByRole("button", { name: "It worked" }).click();
  await block(page).getByText("You need to copy the prompt before you can vote.").waitFor();
  await block(page).getByRole("button", { name: "It didn't work" }).waitFor();
}, { lang: "en", initial: { yes: 180, no: 20, canVote: true } });

await scenario("11. Telefon: taşma yok, düğmeler dokunulabilir boyda", async ({ page }) => {
  await block(page).getByRole("button", { name: "Çalıştı" }).waitFor();
  assert.equal(await overflowFree(page), true);
  const h = await block(page).getByRole("button", { name: "Çalıştı" }).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(h >= 32, `button height ${h}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/works-mobile.png`, fullPage: true });
}, { viewport: { width: 390, height: 844 }, initial: { yes: 8, no: 2, canVote: true } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
