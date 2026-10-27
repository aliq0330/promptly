// Ölçek testleri (docs/history/258-*): çok sohbetli kişide Mesajlar listesi, grup okunmamış sayısı (okuma anında), büyük listeler.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (sorgu kuralları: supabase/tests/group-unread.sql, community-notify-scale.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { ID, installDetailData, PAGES } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4204/promptly";
const server = await serve(4204);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup, detail = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  if (detail) await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  const urls = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => urls.push({ url: r.url(), method: r.method(), body: r.postData() }));
  try {
    await fn({ page, db, urls });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/scalefail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const fakeUser = (i) => ({
  id: `a3000000-0000-4000-8000-${String(i).padStart(12, "0")}`, username: `kisi${i}`, display_name: `Kişi ${i}`, avatar_url: null, cover_url: null, bio: null, website: null,
  follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [],
});
const rowLinks = (page) => page.locator("main a[href*='/messages/local']");
const rowCount = (page) => page.evaluate(() => new Set([...document.querySelectorAll("main a[href*='/messages/local']")].map((a) => a.getAttribute("href"))).size);

await scenario("1. Çok sohbetli kişi (1200 birebir): hepsi okunur (1000'lik sayfalarla), kimlik listeleri 100'erli parça, son mesaj sorguları 200'erli ve 500'de kesilmez; liste 50 satır çizer, kaydırınca devamı gelir", async ({ page, urls }) => {
  await page.goto(`${BASE}/messages`);
  await rowLinks(page).first().waitFor();
  await page.waitForTimeout(500);
  const members = urls.filter((u) => /\/conversation_members\?/.test(u.url) && !/profiles/.test(decodeURIComponent(u.url)));
  assert.ok(members.some((u) => /limit=1000/.test(u.url) && /offset=0/.test(u.url)), "üyelikler 1000'lik sayfayla: " + members.map((u) => u.url.slice(-80)).join(" | "));
  assert.ok(members.some((u) => /offset=1000/.test(u.url)), "ikinci sayfa (offset=1000)");
  const others = urls.filter((u) => /conversation_members\?/.test(u.url) && /profiles/.test(decodeURIComponent(u.url)));
  assert.ok(others.length >= 12, `1200 birebir sohbet 100'erli parçalarla (${others.length} istek)`);
  for (const u of others) {
    const ids = (/conversation_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(u.url))?.[1] ?? "").split(",").filter(Boolean);
    assert.ok(ids.length <= 100, `tek istekte ≤100 kimlik (${ids.length})`);
    assert.ok(u.url.length < 8000, `adres kısa (${u.url.length})`);
  }
  const last = urls.filter((u) => /rpc\/conversation_last_messages/.test(u.url));
  const covered = new Set(last.flatMap((u) => JSON.parse(u.body).p_conversation_ids));
  assert.equal(covered.size, 1200, "son mesaj 1200 sohbetin hepsi için istendi (500'de kesilmedi)");
  assert.ok(last.every((u) => JSON.parse(u.body).p_conversation_ids.length <= 200));
  assert.ok((await rowCount(page)) >= 50 && (await rowCount(page)) < 400, "yalnız ilk satırlar çizildi (50; kısa liste kendiliğinden devam edebilir), 1200 değil");
  for (let i = 0; i < 40 && (await rowCount(page)) < 200; i += 1) {
    await page.locator("[data-testid=load-more]:visible").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(150);
  }
  assert.ok((await rowCount(page)) >= 200, `kaydırınca devamı geldi (${await rowCount(page)} satır, ${await page.getByTestId("load-more").count()} düğme)`);
}, {
  setup: (db) => {
    for (let i = 0; i < 1200; i += 1) {
      const u = fakeUser(i);
      U[`x${i}`] = u;
      db.addConv(`c3000000-0000-4000-8000-${String(i).padStart(12, "0")}`, u, { texts: [`mesaj ${i}`] });
    }
  },
});

await scenario("2. Grup okunmamış sayısı sunucudan (group_unread_counts): rozet 7 ve 100 için '99+'; birebirde sütun değeri; istek parça parça", async ({ page, urls }) => {
  await page.goto(`${BASE}/messages`);
  await rowLinks(page).first().waitFor();
  const rpcs = urls.filter((u) => /rpc\/group_unread_counts/.test(u.url));
  assert.ok(rpcs.length >= 1, "RPC çağrıldı");
  const text = await page.locator("main").innerText();
  assert.match(text, /\b7\b/, "7 okunmamış");
  assert.match(text, /99\+/, "100 → 99+");
}, {
  setup: (db) => {
    db.addGroup("e0000000-0000-4000-8000-0000000000e1", { name: "Topluluk A", visibility: "public", texts: [[U.bob, "merhaba"]] });
    db.addGroup("e0000000-0000-4000-8000-0000000000e2", { name: "Topluluk B", visibility: "public", texts: [[U.bob, "selam"]] });
    db.addConv("c4000000-0000-4000-8000-0000000000c1", U.carol, { texts: ["x"], theirs: {}, my: { unread_count: 3 } });
    db.rpc.group_unread_counts = (body) => ({ body: (body.p_ids ?? []).map((id) => ({ conversation_id: id, unread_count: id.endsWith("e1") ? 7 : 100 })) });
  },
});

/** 130 üst düzey yorum, her birinin 2 yanıtı: `db.comments` (prompt detay sayfası). */
function seedThread(db, { tops = 130 } = {}) {
  const authors = [U.bob, U.dave, U.amy, U.zed];
  for (let i = 0; i < tops; i += 1) {
    const id = `f4000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    db.comments.push({ id, body: `Yorum ${i + 1}`, author_id: authors[i % 4].id, prompt_id: ID.prompt, parent_id: null, created_at: db.stamp() });
    for (let r = 0; r < 2; r += 1) {
      db.comments.push({ id: `f5000000-0000-4000-8000-${String(i * 2 + r).padStart(12, "0")}`, body: `Yanıt ${i + 1}.${r + 1}`, author_id: authors[(i + r + 1) % 4].id, prompt_id: ID.prompt, parent_id: id, created_at: db.stamp() });
    }
  }
}
const commentNodes = (page) => page.locator("#comments").getByText(/^Yorum \d+$/);

await scenario("3. Yorumlar sayfalı (130 üst yorum + 260 yanıt): ilk istek 20'lik, başlık '60+' (yüklenen yorum + yanıt), 'Tümünü gör' ile açılınca kaydırdıkça sonraki sayfalar kendiliğinden gelir; yanıtlar parent_id=in.(…) ile parça parça, sınırsız istek yok", async ({ page, db }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.locator("#comments").waitFor();
  await page.waitForFunction(() => /60\+/.test(document.querySelector("#comments")?.textContent ?? ""));
  const first = db.commentQueries.find((x) => x.parent === "is.null");
  assert.deepEqual([first.offset, first.limit], [0, 20], "ilk sayfa 20'lik");
  assert.ok(db.commentQueries.some((x) => (x.parent ?? "").startsWith("in.(")), "yanıtlar parent_id=in.(…) ile");
  assert.equal(await commentNodes(page).count(), 3, "özet görünümünde yalnız ilk 3 üst yorum");
  assert.equal(db.commentQueries.filter((x) => x.parent === "is.null").length, 1, "özet görünümü bütün sayfaları yüklemez");
  await page.locator("#comments").getByRole("button", { name: "Tümünü gör" }).click();
  for (let i = 0; i < 40 && (await commentNodes(page).count()) < 130; i += 1) {
    await page.locator("[data-testid=load-more]:visible").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(150);
  }
  assert.equal(await commentNodes(page).count(), 130, "kaydırınca hepsi geldi");
  const tops = db.commentQueries.filter((x) => x.parent === "is.null").map((x) => x.offset);
  assert.deepEqual(tops, [0, 20, 40, 60, 80, 100, 120], "yalnız 20'şerli üst düzey sayfalar");
  assert.ok(db.commentQueries.every((x) => x.limit === 0 || x.limit <= 20 || x.parent !== "is.null"));
  const header = await page.locator("#comments").innerText();
  assert.match(header, /390/, "tamamı yüklenince sayaç 390 (130 yorum + 260 yanıt)");
  assert.doesNotMatch(header, /390\+/, "artı işareti kalktı");
  assert.equal(await page.locator("[data-testid=load-more]:visible").count(), 0, "son sayfadan sonra düğme yok");
}, { detail: true, setup: seedThread });

await scenario("4. Bildirimden gelen derin bağlantı: 6. sayfadaki bir yanıt (hl=comment:…) ilk açılışta yüklenir, kök yorum ve altı eklenir, yorum görünür", async ({ page, db }) => {
  const target = "f5000000-0000-4000-8000-000000000200"; // 101. üst yorumun yanıtı (6. sayfa)
  await page.goto(`${BASE}${PAGES.prompt}&hl=comment:${target}`);
  await page.locator("#comments").waitFor();
  await page.getByText("Yanıt 101.1", { exact: true }).waitFor();
  assert.ok(await page.getByText("Yorum 101", { exact: true }).count(), "kök yorum da yüklendi");
  assert.ok(db.commentQueries.some((x) => x.parent === null), "yorum kimliğiyle ayrıca okundu");
  assert.equal(await page.getByText("Bu yorum artık mevcut değil", { exact: false }).count(), 0);
}, { detail: true, setup: seedThread });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
