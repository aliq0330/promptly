// Yazma alanının emoji klavyesi (docs/history/331-*): telefonda seçici yazma alanını ÖRTMEZ — klavyenin yerine yazma
// satırının ALTINDA açılan bir paneldir; dokunulan emoji kutuda hemen görünür, panelin geri sil tuşu bütün emojiyi siler,
// emoji düğmesi klavye düğmesine döner (basınca panel kapanır, kutu odaklanır), kutuya ya da listeye dokunmak paneli kapatır,
// listenin sonu yerinde kalır. Masaüstünde kutunun üstünde açılan küçük pencere değişmedi.
// Ağ taklitli; gerçek iOS Safari klavyesi bu ortamda açılamaz — DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const BASE = "http://localhost:4191/promptly";
const server = await serve(4191);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const SHOTS = process.env.SHOTS ?? "";
const TEXTS = Array.from({ length: 24 }, (_, i) => `mesaj ${i + 1}`);

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr" } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { texts: TEXTS });
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  await installMock(context, db, { signedIn: ME });
  await hub.install(context, ME);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-terms-notice", "2026-11-02"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/messages/local?id=${CONV}`);
    await page.locator("[data-message-id]").first().waitFor();
    await page.waitForTimeout(400);
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cefail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const input = (page) => page.locator("form textarea");
const emojiButton = (page) => page.locator("[data-composer-emoji]");
const panel = (page) => page.locator("[data-emoji-panel]");
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const visibleIn = (box, view) => box && box.y >= 0 && box.y + box.height <= view.height + 1;

await scenario("1. Telefon: panel yazma satırının ALTINDA açılır; kutu ve Gönder görünür, panelle çakışmaz; Modal/örtü yok", async ({ page }) => {
  await input(page).tap();
  await emojiButton(page).tap();
  await panel(page).waitFor();
  const view = page.viewportSize();
  const inBox = await input(page).boundingBox();
  const sendBox = await page.getByRole("button", { name: "Mesaj gönder" }).boundingBox().catch(() => null);
  const panelBox = await panel(page).boundingBox();
  assert.ok(visibleIn(inBox, view), "kutu ekranda");
  assert.ok(visibleIn(panelBox, view), "panel ekranda");
  assert.ok(inBox.y + inBox.height <= panelBox.y, "kutu panelin üstünde, çakışma yok");
  if (sendBox) assert.ok(visibleIn(sendBox, view), "Gönder ekranda");
  assert.equal(await page.locator('[role="dialog"]').count(), 0, "alttan açılan pencere yok");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "BODY", "kutu odaksız (klavye panelin üstüne çıkmaz)");
  assert.equal(await emojiButton(page).getAttribute("aria-label"), "Klavyeyi göster");
  await shot(page, "composer-emoji-panel");
});

await scenario("2. Telefon: dokunulan emoji kutuda hemen görünür; geri sil bütün emojiyi (ten rengi/bayrak dahil) siler", async ({ page }) => {
  await input(page).fill("selam ");
  await emojiButton(page).tap();
  await panel(page).waitFor();
  await panel(page).getByRole("tab").nth(1).tap();
  const first = panel(page).getByRole("group").getByRole("button").first();
  const emoji = await first.getAttribute("aria-label");
  await first.tap();
  await first.tap();
  assert.equal(await input(page).inputValue(), `selam ${emoji}${emoji}`);
  assert.ok(await input(page).isVisible(), "kutu görünür");
  await panel(page).getByRole("button", { name: "Geri sil" }).tap();
  assert.equal(await input(page).inputValue(), `selam ${emoji}`);
  // Çok kod noktalı emoji (ten rengi + bayrak) tek dokunuşla gider.
  await input(page).fill("a👍🏽🇹🇷");
  await input(page).evaluate((el) => el.blur());
  await emojiButton(page).tap();
  await panel(page).waitFor();
  await panel(page).getByRole("button", { name: "Geri sil" }).tap();
  assert.equal(await input(page).inputValue(), "a👍🏽");
  await panel(page).getByRole("button", { name: "Geri sil" }).tap();
  assert.equal(await input(page).inputValue(), "a");
});

await scenario("3. Telefon: klavye düğmesi paneli kapatır ve kutuyu odaklar; kutuya dokunmak da kapatır", async ({ page }) => {
  await emojiButton(page).tap();
  await panel(page).waitFor();
  await emojiButton(page).tap();
  await panel(page).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA");
  assert.equal(await emojiButton(page).getAttribute("aria-label"), "Emoji ekle");
  await input(page).evaluate((el) => el.blur());
  await emojiButton(page).tap();
  await panel(page).waitFor();
  await input(page).tap();
  await panel(page).waitFor({ state: "detached" });
});

await scenario("4. Telefon: listeye dokunmak paneli kapatır; açılınca listenin sonu (son mesaj) görünür kalır", async ({ page }) => {
  const last = page.locator("[data-message-id]", { hasText: "mesaj 24" }).first();
  await last.waitFor();
  await emojiButton(page).tap();
  await panel(page).waitFor();
  await page.waitForTimeout(100);
  const list = await page.locator("[data-chat-scroll]").boundingBox();
  const lastBox = await last.boundingBox();
  assert.ok(lastBox.y + lastBox.height <= list.y + list.height + 2, `son mesaj görünür: ${Math.round(lastBox.y + lastBox.height)} ≤ ${Math.round(list.y + list.height)}`);
  await page.locator("[data-chat-scroll]").tap({ position: { x: 10, y: 20 } });
  await panel(page).waitFor({ state: "detached" });
});

await scenario("5. Masaüstü: küçük pencere kutunun ÜSTÜNDE açılır, emoji imlece yazılır ve kutu odakta kalır; Esc kapatır", async ({ page }) => {
  await input(page).fill("x");
  await emojiButton(page).click();
  const pop = page.getByRole("dialog", { name: "Emoji" });
  await pop.waitFor();
  assert.equal(await panel(page).count(), 0, "masaüstünde panel yok");
  const popBox = await pop.boundingBox();
  const inBox = await input(page).boundingBox();
  assert.ok(popBox.y + popBox.height <= inBox.y, "pencere kutunun üstünde");
  const first = pop.getByRole("group").getByRole("button").first();
  const emoji = await first.getAttribute("aria-label");
  await first.click();
  assert.equal(await input(page).inputValue(), `x${emoji}`);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA");
  await page.keyboard.press("Escape");
  await pop.waitFor({ state: "detached" });
}, { viewport: { width: 1280, height: 800 } });

await scenario("6. İngilizce: düğme adları çevrilir", async ({ page }) => {
  assert.equal(await emojiButton(page).getAttribute("aria-label"), "Add emoji");
  await emojiButton(page).tap();
  await panel(page).waitFor();
  assert.equal(await emojiButton(page).getAttribute("aria-label"), "Show keyboard");
  await panel(page).getByRole("button", { name: "Backspace" }).waitFor();
}, { lang: "en" });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
