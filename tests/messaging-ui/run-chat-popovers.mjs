// Sohbet mesaj düğmeleri ve menülerinin konumu (docs/history/212-*): uzun mesajda düğmeler görünen kısımda, ⋮ menüsü ve emoji
// seçici mesaj listesinin görünen alanında (sabit başlık ve yazma alanıyla çakışmadan), altta yer yoksa yukarı açılır, alan
// daralınca (klavye/adres çubuğu taklidi: görünüm yüksekliği küçültülür) yeniden yerleşir, mesaj tamamen kayınca kapanır.
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
const menu = (page) => page.getByRole("menu", { name: "Mesaj seçenekleri" });
const picker = (page) => page.getByRole("menu", { name: /emoji/i });

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

await scenario("2. uzun mesaj, ALTI görünürken: düğmeler yine görünen kısımda; menü listenin içinde açılır", async ({ page }) => {
  await placeMessage(page, "uzun mesajın 1.", -900);
  const area = await listBox(page);
  await tapMessage(page, "uzun mesajın 1.", 30);
  const button = await optionsButton(page, "uzun mesajın 1.").boundingBox();
  assert.ok(inside(button, area), `düğme görünür alanda: ${describe(button)}`);
  await optionsButton(page, "uzun mesajın 1.").click();
  const box = await menu(page).boundingBox();
  assert.ok(inside(box, area), `menü görünür alanda: ${describe(box)} / alan ${describe(area)}`);
});

await scenario("3. en alttaki mesaj (yazma alanının üstü): menü YUKARI açılır, yazma alanıyla çakışmaz", async ({ page }) => {
  const area = await listBox(page);
  await tapMessage(page, "son benim", 10);
  await optionsButton(page, "son benim").click();
  await menu(page).waitFor();
  assert.equal(await menu(page).getAttribute("data-menu-side"), "above");
  const box = await menu(page).boundingBox();
  const composer = await page.getByRole("textbox").last().boundingBox();
  assert.ok(inside(box, area), `menü görünür alanda: ${describe(box)}`);
  assert.ok(box.y + box.height <= composer.y, "yazma alanının üstünde biter");
  await shot(page, "3-bottom-menu-above");
});

await scenario("4. en üstteki mesaj (sabit başlığın altı): menü aşağı açılır, başlıkla çakışmaz", async ({ page }) => {
  await placeMessage(page, "ilk benim", 4);
  const area = await listBox(page);
  await tapMessage(page, "ilk benim", 8);
  await optionsButton(page, "ilk benim").click();
  await menu(page).waitFor();
  assert.equal(await menu(page).getAttribute("data-menu-side"), "below");
  const box = await menu(page).boundingBox();
  assert.ok(inside(box, area), `menü görünür alanda: ${describe(box)}`);
  assert.ok(box.y >= area.y, "başlığın altında başlar");
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

await scenario("6. görünür alan daralınca (klavye / adres çubuğu taklidi) açık menü yeniden yerleşir", async ({ page }) => {
  // A message far from the bottom (no auto-scroll to the end) near the top of the list stays visible when the area shrinks from below.
  await placeMessage(page, "ikinci benim", 140);
  await tapMessage(page, "ikinci benim", 10);
  await optionsButton(page, "ikinci benim").click();
  await menu(page).waitFor();
  const before = await menu(page).boundingBox();
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(300);
  const area = await listBox(page);
  const message = await msg(page, "ikinci benim").boundingBox();
  assert.ok(message.y + message.height > area.y && message.y < area.y + area.height, "mesaj daralan alanda hâlâ görünür");
  assert.equal(await menu(page).count(), 1, "mesaj görünürken menü açık kalır");
  const box = await menu(page).boundingBox();
  assert.ok(inside(box, area), `daralan alanda menü: ${describe(box)} / alan ${describe(area)} (önce ${describe(before)})`);
  await shot(page, "6-shrunk");
});

await scenario("7. mesaj tamamen kayıp gidince açık menü kapanır; dışarı dokununca kapanır; menü işlevleri çalışır", async ({ page }) => {
  await tapMessage(page, "son benim", 10);
  await optionsButton(page, "son benim").click();
  await menu(page).waitFor();
  await placeMessage(page, "ilk bob", 4);
  await menu(page).waitFor({ state: "detached" });
  await placeMessage(page, "son bob", 200);
  await tapMessage(page, "son bob", 10);
  await optionsButton(page, "son bob").click();
  await menu(page).getByRole("menuitem", { name: "Yanıtla" }).click();
  await menu(page).waitFor({ state: "detached" });
  await page.getByText(/son bob/).last().waitFor();
});

await scenario("8. masaüstü: üzerine gelince düğmeler, menü listenin içinde ve sağa/sola taşmadan", async ({ page }) => {
  const area = await listBox(page);
  await msg(page, "ilk bob").hover();
  await optionsButton(page, "ilk bob").click();
  const box = await menu(page).boundingBox();
  assert.ok(inside(box, area), `menü görünür alanda: ${describe(box)}`);
  await page.keyboard.press("Escape");
  await menu(page).waitFor({ state: "detached" });
}, { viewport: { width: 1280, height: 800 } });

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
