// Sohbet açılışı ve Oluştur menüsü dayanıklılığı (ağ taklitli; gerçek Supabase'e/cihaza KARŞI DENENMEDİ):
//  - Sohbet yüklenirken çıplak "Yükleniyor…" değil iskelet görünür; yükleme sunucu hatasıyla düşerse ekran sonsuza dek "Yükleniyor…"
//    kalmaz — "Sohbet yüklenemedi" + "Tekrar dene" çıkar, tekrar deneyince sohbet açılır ("bulunamadı" ile karıştırılmaz).
//  - Oturum belirteci yenilenip `user` nesnesi değişse de açık sohbet yeniden yüklenmez (iskelet yeniden çıkmaz).
//  - Oluştur menüsü (telefon, kısa ekran): başlık sabit, liste kendi içinde kayar; en alttaki satır kartın dışına taşmaz.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const PORT = Number(process.env.PORT ?? 4212);
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, path = `/messages/local?id=${CONV}`, wait = "form textarea" } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { texts: ["merhaba", "nasılsın"] });
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  await installMock(context, db, { signedIn: ME });
  await hub.install(context, ME);
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-terms-notice", "2026-11-02"); localStorage.setItem("promptly-tour-seen", "1"); } catch {} });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, context, db, goto: async () => { await page.goto(`${BASE}${path}`); if (wait) await page.locator(wait).first().waitFor(); } });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/clfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

await scenario("1. Sohbet yüklenirken iskelet görünür (çıplak yazı değil), sonra sohbet açılır", async ({ page, context, goto }) => {
  await context.route(/\/rest\/v1\/messages\?/, async (route) => {
    if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 900));
    await route.fallback();
  });
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("[data-chat-loading]").waitFor();
  assert.equal(await page.locator("[data-chat-load-failed]").count(), 0, "hata kartı yok");
  await page.locator("form textarea").waitFor();
  assert.equal(await page.locator("[data-chat-loading]").count(), 0, "iskelet kalktı");
  void goto;
});

await scenario("2. Mesaj sayfası sunucu hatası verirse sonsuz 'Yükleniyor…' yok: 'Sohbet yüklenemedi' + Tekrar dene", async ({ page, context }) => {
  let fail = true;
  await context.route(/\/rest\/v1\/messages\?/, async (route) => {
    if (fail && route.request().method() === "GET") return route.abort("failed");
    return route.fallback();
  });
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  const card = page.locator("[data-chat-load-failed]");
  await card.waitFor();
  assert.match(await card.innerText(), /Sohbet yüklenemedi/);
  assert.equal(await page.locator("[data-chat-loading]").count(), 0, "iskelet kalıcı değil");
  assert.equal(await page.getByText("Konuşma bulunamadı").count(), 0, "'bulunamadı' ile karışmaz");
  assert.ok(await page.getByRole("link", { name: "Mesajlara Dön" }).isVisible(), "listeye dönüş var");
  fail = false;
  await card.getByRole("button", { name: "Tekrar dene" }).click();
  await page.locator("form textarea").waitFor();
  await page.locator("[data-chat-scroll]").getByText("nasılsın").waitFor();
  assert.equal(await page.locator("[data-chat-load-failed]").count(), 0);
});

await scenario("2b. Mesaj isteği hiç cevap vermezse (bağlantı asıldı) 20 sn sonra 'Sohbet yüklenemedi' çıkar, tekrar deneyince açılır", async ({ page, context }) => {
  let stall = true;
  await context.route(/\/rest\/v1\/messages\?/, async (route) => {
    if (stall && route.request().method() === "GET") return; // cevap yok: istek asılı kalır
    return route.fallback();
  });
  await page.clock.install();
  await page.clock.resume();
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("[data-chat-loading]").waitFor();
  await page.clock.fastForward(21_000);
  const card = page.locator("[data-chat-load-failed]");
  await card.waitFor();
  assert.equal(await page.locator("[data-chat-loading]").count(), 0);
  stall = false;
  await card.getByRole("button", { name: "Tekrar dene" }).click();
  await page.locator("form textarea").waitFor();
  await page.locator("[data-chat-scroll]").getByText("nasılsın").waitFor();
});

await scenario("3. Oturum yenilenip kullanıcı nesnesi değişince açık sohbet yeniden yüklenmez", async ({ page, context }) => {
  let reads = 0;
  await context.route(/\/rest\/v1\/messages\?/, async (route) => {
    if (route.request().method() === "GET") reads += 1;
    await route.fallback();
  });
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("form textarea").waitFor();
  await page.waitForTimeout(300);
  const before = reads;
  // Sekmeyi gizleyip geri getirmek Supabase'in oturumu yeniden doğrulamasını (TOKEN_REFRESHED/SIGNED_IN) tetikler.
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-chat-loading]").count(), 0, "iskelet yeniden çıkmadı");
  assert.ok(reads - before <= 1, `mesajlar gereksiz yeniden okunmadı (${reads - before})`);
  assert.ok(await page.locator("form textarea").isVisible());
});

await scenario("4. Oluştur menüsü kısa telefon ekranında: başlık sabit, liste kayar, son satır kartın dışına taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("nav[data-app-nav] [data-nav-create]").waitFor();
  await page.locator("nav[data-app-nav] [data-nav-create]").click();
  const list = page.locator("[data-create-menu]");
  await list.waitFor();
  await page.waitForTimeout(450);
  const geometry = await page.evaluate(() => {
    const menu = document.querySelector("[data-create-menu]");
    const card = menu.closest("[class*='overflow-hidden']");
    const scroller = menu.parentElement;
    return {
      cardBottom: card.getBoundingClientRect().bottom,
      cardTop: card.getBoundingClientRect().top,
      scrollable: scroller.scrollHeight > scroller.clientHeight,
      overflowY: getComputedStyle(scroller).overflowY,
    };
  });
  assert.equal(geometry.overflowY, "auto", "liste kendi içinde kayar");
  assert.ok(geometry.scrollable, "kısa ekranda içerik kartı aşar → kaydırma gerekir");
  const share = page.locator("[data-create-share-existing]");
  await share.scrollIntoViewIfNeeded();
  const box = await share.boundingBox();
  assert.ok(box.y + box.height <= geometry.cardBottom + 1, `son satır kartın içinde: ${Math.round(box.y + box.height)} <= ${Math.round(geometry.cardBottom)}`);
  await page.locator("#create-menu-title").waitFor();
  const title = await page.locator("#create-menu-title").boundingBox();
  assert.ok(title.y >= geometry.cardTop - 1 && title.y < geometry.cardTop + 60, "başlık kaydırınca yerinde kalır");
}, { viewport: { width: 390, height: 560 }, path: "/discover", wait: null });

await scenario("5. Oluştur menüsü uzun ekranda: kaydırma gerekmez, tüm seçenekler görünür", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("nav[data-app-nav] [data-nav-create]").click();
  await page.locator("[data-create-menu]").waitFor();
  await page.waitForTimeout(450);
  for (const key of ["prompt", "request", "story", "workflow", "preset", "space"]) {
    assert.ok(await page.locator(`[data-create-option='${key}']`).isVisible(), `${key} görünür`);
  }
  assert.ok(await page.locator("[data-create-share-existing]").isVisible());
}, { viewport: { width: 390, height: 1000 }, path: "/discover", wait: null });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
