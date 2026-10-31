// Sohbet mesaj düğmeleri ve menülerinin konumu (docs/history/212-*, 288-*): uzun mesajda düğmeler görünen kısımda; emoji seçici
// mesaj listesinin görünen alanında; ⋮ ve UZUN BASMA aynı sayfayı açar (bulanık zemin + mesajın kopyası + tepki çubuğu + menü):
// ekrana sığar, alan daralınca (klavye/adres çubuğu taklidi: görünüm yüksekliği küçültülür) yeniden yerleşir, kısa dokunuş/kaydırma
// açmaz, parmak kalkınca kapanmaz, Esc/boş alan kapatır, 6 hızlı emoji ile tepki verilir/geri alınır.
// Ağ + Realtime taklitli; gerçek iOS Safari klavyesi/adres çubuğu bu ortamda açılamaz — DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const BASE = "http://localhost:4189/promptly";
const server = await serve(4189);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const SHOTS = process.env.SHOTS ?? "";

const LONG = Array.from({ length: 70 }, (_, i) => `uzun mesajın ${i + 1}. cümlesi burada duruyor`).join(" ");
// 0,2,4… = Bob; 1,3,5… = ben. 4 = Bob'un çok uzun mesajı; en sonda kısa mesajlar (yazma alanının hemen üstünde).
const TEXTS = ["ilk bob", "ilk benim", "ikinci bob", "ikinci benim", LONG, "uzun sonrası benim", "son bob", "son benim"];

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr" } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { texts: TEXTS });
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  await installMock(context, db, { signedIn: ME });
  await hub.install(context, ME);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cpfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const msg = (page, text) => page.locator("[data-message-id]", { hasText: text }).first();
const listBox = (page) => page.locator("[data-chat-scroll]").boundingBox();
const inside = (box, area, slack = 1) =>
  box.y >= area.y - slack && box.y + box.height <= area.y + area.height + slack && box.x >= area.x - slack && box.x + box.width <= area.x + area.width + slack;
const describe = (box) => `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** Scrolls the list so that `text`'s message starts at `offset` px below the list's top edge. */
async function placeMessage(page, text, offset) {
  await page.evaluate(([t, off]) => {
    const list = document.querySelector("[data-chat-scroll]");
    const el = [...document.querySelectorAll("[data-message-id]")].find((m) => m.textContent.includes(t));
    list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - off;
  }, [text, offset]);
  await page.waitForTimeout(250);
}
/** Taps the visible part of a message's TEXT (phones reveal its icons on tap; the row's middle may be the icons themselves). */
async function tapMessage(page, text, y = 24) {
  const m = msg(page, text).locator("p.break-words").first();
  const box = await m.boundingBox();
  const area = await listBox(page);
  const top = Math.max(box.y, area.y) + y;
  await page.touchscreen.tap(box.x + box.width / 2, Math.min(top, area.y + area.height - 8));
  await page.waitForTimeout(250);
}
const optionsButton = (page, text) => msg(page, text).getByRole("button", { name: "Mesaj seçenekleri" });
const emojiButton = (page, text) => msg(page, text).getByRole("button", { name: "Emoji tepkisi ekle" });
const sheet = (page) => page.locator("[data-message-sheet]");
const menu = (page) => sheet(page).getByRole("menu", { name: "Mesaj seçenekleri" });
const bar = (page) => sheet(page).getByRole("menu", { name: /emoji/i });
const picker = (page) => page.getByRole("menu", { name: /emoji/i });
const viewport = (page) => ({ x: 0, y: 0, ...page.viewportSize() });
/** Gerçek dokunmatik uzun basma (CDP): basılı tut; `moveFirst` ile önce parmağı kaydır (kaydırma = iptal). */
async function longPress(page, locator, { holdMs = 650, moveBy = 0, moveFirst = false } = {}) {
  const box = await locator.boundingBox();
  const area = await listBox(page);
  const x = box.x + Math.min(box.width / 2, 40);
  const y = Math.min(Math.max(box.y + 12, area.y + 8), area.y + area.height - 8);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  if (moveFirst && moveBy) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + moveBy }] });
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(150);
}

await scenario("1. uzun mesaj, ÜSTÜ görünürken: düğmeler mesajın ortasında (ekran dışı) değil, görünen kısımda", async ({ page }) => {
  await placeMessage(page, "uzun mesajın 1.", 40);
  const bubble = await msg(page, "uzun mesajın 1.").boundingBox();
  const area = await listBox(page);
  assert.ok(bubble.height > area.height, `mesaj ekrandan uzun (${Math.round(bubble.height)} > ${Math.round(area.height)})`);
  assert.ok(bubble.y + bubble.height / 2 > area.y + area.height, "mesajın ortası görünür alanın altında");
  await tapMessage(page, "uzun mesajın 1.");
  for (const button of [optionsButton(page, "uzun mesajın 1."), emojiButton(page, "uzun mesajın 1.")]) {
    const box = await button.boundingBox();
    assert.ok(inside(box, area), `düğme görünür alanda: ${describe(box)} / alan ${describe(area)}`);
  }
  await shot(page, "1-long-top");
});

await scenario("2. uzun mesaj, ALTI görünürken: ⋮ sayfası açılır; menü ve tepki çubuğu ekrandan taşmaz, uzun mesajın kopyası kırpılır", async ({ page }) => {
  await placeMessage(page, "uzun mesajın 1.", -900);
  await tapMessage(page, "uzun mesajın 1.", 30);
  await optionsButton(page, "uzun mesajın 1.").click();
  await sheet(page).waitFor();
  await page.waitForTimeout(500);
  const view = viewport(page);
  for (const [name, locator] of [["menü", menu(page)], ["tepki çubuğu", bar(page)]]) {
    const box = await locator.boundingBox();
    assert.ok(inside(box, view), `${name} ekranda: ${describe(box)} / ekran ${describe(view)}`);
  }
  const clone = await page.locator("[data-sheet-clone]").boundingBox();
  assert.ok(clone.height < 900, `kopya kırpıldı (${Math.round(clone.height)} px)`);
  assert.equal(await msg(page, "uzun mesajın 1.").locator("[data-message-content]").evaluate((el) => getComputedStyle(el).visibility), "hidden", "gerçek baloncuk sayfa açıkken gizli");
  await shot(page, "2-long-sheet");
});

await scenario("3. en alttaki mesaj: sayfa yukarı oturur — çubuk, mesaj kopyası, menü alt alta ve ekran içinde", async ({ page }) => {
  await tapMessage(page, "son benim", 10);
  await optionsButton(page, "son benim").click();
  await sheet(page).waitFor();
  await page.waitForTimeout(500);
  const view = viewport(page);
  const barBox = await bar(page).boundingBox();
  const cloneBox = await page.locator("[data-sheet-clone]").boundingBox();
  const menuBox = await menu(page).boundingBox();
  for (const [name, box] of [["çubuk", barBox], ["kopya", cloneBox], ["menü", menuBox]]) assert.ok(inside(box, view), `${name} ekranda: ${describe(box)}`);
  assert.ok(barBox.y + barBox.height <= cloneBox.y + 1 && cloneBox.y + cloneBox.height <= menuBox.y + 1, "üstten alta: çubuk, mesaj, menü");
  // Kendi mesajım sağda: menünün sağ kenarı mesajın sağ kenarıyla hizalı.
  assert.ok(Math.abs(menuBox.x + menuBox.width - (cloneBox.x + cloneBox.width)) <= 2, "menü sağ kenarı mesajla hizalı");
  await shot(page, "3-bottom-sheet");
});

await scenario("4. en üstteki mesaj: tepki çubuğu ekranın üstünden taşmaz; karşı tarafın mesajında sol kenarlar hizalı", async ({ page }) => {
  await placeMessage(page, "ilk bob", 4);
  await tapMessage(page, "ilk bob", 8);
  await optionsButton(page, "ilk bob").click();
  await sheet(page).waitFor();
  await page.waitForTimeout(500);
  const barBox = await bar(page).boundingBox();
  const cloneBox = await page.locator("[data-sheet-clone]").boundingBox();
  const menuBox = await menu(page).boundingBox();
  assert.ok(barBox.y >= 0, `çubuk ekranın üstünde değil: ${describe(barBox)}`);
  assert.ok(Math.abs(menuBox.x - cloneBox.x) <= 2, "menü sol kenarı mesajla hizalı");
});

await scenario("5. emoji seçici: yatayda ekrana sığar; '+' ile büyüyünce yeniden yerleşir ve yine alanda kalır", async ({ page }) => {
  const area = await listBox(page);
  await tapMessage(page, "son bob", 10);
  await emojiButton(page, "son bob").click();
  await picker(page).waitFor();
  let box = await picker(page).boundingBox();
  assert.ok(inside(box, area), `seçici görünür alanda: ${describe(box)}`);
  await page.getByRole("button", { name: /Daha fazla emoji|More emoji/i }).click();
  await page.waitForTimeout(150);
  box = await picker(page).boundingBox();
  assert.ok(inside(box, area), `genişleyen seçici görünür alanda: ${describe(box)}`);
  await page.getByRole("menuitemradio").first().click();
  await picker(page).waitFor({ state: "detached" });
});

await scenario("6. görünür alan daralınca (klavye / adres çubuğu taklidi) açık sayfa yeniden yerleşir ve ekranda kalır", async ({ page }) => {
  await placeMessage(page, "ikinci benim", 140);
  await tapMessage(page, "ikinci benim", 10);
  await optionsButton(page, "ikinci benim").click();
  await sheet(page).waitFor();
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.waitForTimeout(500);
  assert.equal(await sheet(page).count(), 1, "sayfa açık kalır");
  const view = viewport(page);
  const menuBox = await menu(page).boundingBox();
  const barBox = await bar(page).boundingBox();
  assert.ok(inside(menuBox, view), `daralan alanda menü: ${describe(menuBox)} / ${describe(view)}`);
  assert.ok(inside(barBox, view), `daralan alanda çubuk: ${describe(barBox)}`);
  await shot(page, "6-shrunk");
});

await scenario("7. UZUN BASMA: 400 ms basılı tutunca açılır; kısa dokunuş ve kaydırma açmaz; sayfa kapanınca baloncuk geri gelir", async ({ page }) => {
  // Kısa dokunuş: yalnız ikonları gösterir.
  await tapMessage(page, "son bob", 10);
  assert.equal(await sheet(page).count(), 0, "kısa dokunuş sayfa açmaz");
  // Basılı tutarken parmak kayarsa (kaydırma) açılmaz.
  await longPress(page, msg(page, "ilk bob").locator("p.break-words").first(), { holdMs: 700, moveBy: 40, moveFirst: true });
  assert.equal(await sheet(page).count(), 0, "kayan parmak sayfa açmaz");
  // Gerçek uzun basma.
  await longPress(page, msg(page, "ilk bob").locator("p.break-words").first(), { holdMs: 650 });
  await sheet(page).waitFor();
  assert.equal(await sheet(page).count(), 1);
  // Parmak kalktıktan sonra gelen click sayfayı kapatmamalı.
  await page.waitForTimeout(700);
  assert.equal(await sheet(page).count(), 1, "parmak kalkınca sayfa kapanmaz");
  // Karşı tarafın mesajında "Şikâyet et" + tepki çubuğu var; Esc kapatır ve baloncuk geri gelir.
  await menu(page).getByRole("menuitem", { name: /Şikayet|Şikâyet/ }).waitFor();
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  assert.equal(await msg(page, "ilk bob").locator("[data-message-content]").evaluate((el) => getComputedStyle(el).visibility), "visible", "baloncuk geri göründü");
  await shot(page, "7-long-press");
});

await scenario("8. tepki çubuğu: mevcut 6 hızlı emoji; seçince tepki mesaja eklenir ve sayfa kapanır; aynısına tekrar basmak geri alır", async ({ page }) => {
  await longPress(page, msg(page, "son bob").locator("p.break-words").first(), { holdMs: 650 });
  await sheet(page).waitFor();
  const emojis = await bar(page).getByRole("menuitemradio").allTextContents();
  assert.deepEqual(emojis, ["❤️", "😂", "😮", "😢", "😡", "👍"], "altı hızlı emoji, mevcut seçiciyle aynı sıra");
  await bar(page).getByRole("menuitemradio", { name: /😂/ }).click();
  await sheet(page).waitFor({ state: "detached" });
  await msg(page, "son bob").locator('[data-reaction-emoji="😂"]').waitFor();
  // Aynı emojiye tekrar: seçili görünür ve geri alır.
  await longPress(page, msg(page, "son bob").locator("p.break-words").first(), { holdMs: 650 });
  await sheet(page).waitFor();
  assert.equal(await bar(page).getByRole("menuitemradio", { name: /😂/ }).getAttribute("aria-checked"), "true");
  await bar(page).getByRole("menuitemradio", { name: /😂/ }).click();
  await sheet(page).waitFor({ state: "detached" });
  await msg(page, "son bob").locator('[data-reaction-emoji="😂"]').waitFor({ state: "detached" });
});

await scenario("9. menü işlevleri sayfada çalışır (Yanıtla kapatır); boş alana dokunmak kapatır", async ({ page }) => {
  await longPress(page, msg(page, "son bob").locator("p.break-words").first(), { holdMs: 650 });
  await sheet(page).waitFor();
  await page.waitForTimeout(450);
  await page.touchscreen.tap(195, 30); // bulanık zemin
  await sheet(page).waitFor({ state: "detached" });
  await longPress(page, msg(page, "son bob").locator("p.break-words").first(), { holdMs: 650 });
  await sheet(page).waitFor();
  await menu(page).getByRole("menuitem", { name: "Yanıtla" }).click();
  await sheet(page).waitFor({ state: "detached" });
  await page.getByText(/son bob/).last().waitFor();
});

await scenario("10. masaüstü: ⋮ ve sağ tık aynı sayfayı açar; Esc kapatır", async ({ page }) => {
  await msg(page, "ilk bob").hover();
  await optionsButton(page, "ilk bob").click();
  await sheet(page).waitFor();
  const view = viewport(page);
  const menuBox = await menu(page).boundingBox();
  assert.ok(inside(menuBox, view), `menü ekranda: ${describe(menuBox)}`);
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  await msg(page, "ilk bob").locator("p.break-words").first().click({ button: "right" });
  await sheet(page).waitFor();
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
}, { viewport: { width: 1280, height: 800 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
