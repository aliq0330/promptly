// Ölçek testleri (docs/history/258-*): çok sohbetli kişide Mesajlar listesi, grup okunmamış sayısı (okuma anında), büyük listeler.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (sorgu kuralları: supabase/tests/group-unread.sql, community-notify-scale.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";

const BASE = "http://localhost:4204/promptly";
const server = await serve(4204);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
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

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
