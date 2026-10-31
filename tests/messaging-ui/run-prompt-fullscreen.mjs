// Prompt metni TAM EKRAN yazma + sabit "Değişkene dönüştür" (docs/history/288-*): formdaki "Tam ekran" düğmesi, üstte iki sabit katman
// (başlık satırı + sol üstte dönüştürme düğmesi / sağda Hazır ayarlar), imleç kelimedeyken kelimenin tamamı, seçimde seçilen metin,
// boşlukta pasif, jetonda "Değişkeni düzenle", dönüştürünce yeşil onay + "Geri al", Hazır ayarlar panelinin katmanın üstüne açılması,
// İngilizce ve mobil taşma. Ağ taklitli; gerçek Supabase'e / gerçek telefon klavyesine KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = Number(process.env.PORT ?? 4202);
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pwfail-fs-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const TEXT = "Act as a cinematic designer. Design one red wooden covered bridge at sunrise.";
const layer = (page) => page.getByTestId("prompt-fullscreen");
const convert = (page) => page.getByTestId("fullscreen-convert");
const convertText = (page) => page.getByTestId("fullscreen-convert-text");
const fsText = (page) => layer(page).locator("textarea");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** Formda metni yazar, "Tam ekran"ı açar. */
const openFullscreen = async (page, initial = TEXT) => {
  await page.goto(`${BASE}/create?mode=prompt`);
  await page.locator("[data-compose-body]").waitFor();
  await page.waitForTimeout(300);
  await page.locator("#prompt-text").fill(initial);
  await page.getByTestId("open-fullscreen").click();
  await layer(page).waitFor();
};
/** Tam ekran textarea'da [needle]'ı seçer (needle yoksa imleci verilen konuma koyar). */
const select = (page, needle, caretOffset) => fsText(page).evaluate((el, [n, off]) => {
  const i = el.value.indexOf(n);
  el.focus();
  if (off == null) el.setSelectionRange(i, i + n.length); else el.setSelectionRange(i + off, i + off);
  document.dispatchEvent(new Event("selectionchange"));
}, [needle, caretOffset]);

await scenario("1. Formdaki Tam ekran düğmesi katmanı açar: başlık + sayaç, sabit satır (dönüştür + Hazır ayarlar), Bitti kapatır, metin formda kalır", async ({ page }) => {
  await openFullscreen(page);
  await page.getByRole("heading", { name: "Prompt Metni" }).last().waitFor();
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /0 değişken · \d+ karakter/);
  await convert(page).waitFor();
  await page.getByTestId("fullscreen-presets").waitFor();
  assert.equal(await fsText(page).inputValue(), TEXT);
  assert.equal(await page.locator("[data-app-chrome]:visible").count(), 0);
  await page.getByTestId("fullscreen-done").click();
  await layer(page).waitFor({ state: "detached" });
  assert.equal(await page.locator("#prompt-text").inputValue(), TEXT);
});

await scenario("2. İmleç kelimenin ortasındayken düğme kelimenin TAMAMINI gösterir; dokununca {Kelime} olur, yeşil onay + Geri al; Geri al metni geri verir", async ({ page }) => {
  await openFullscreen(page);
  await select(page, "bridge", 3);
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "active");
  assert.equal(await convertText(page).innerText(), "“bridge”");
  await convert(page).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "done");
  assert.match(await fsText(page).inputValue(), /covered \{Bridge\} at sunrise/);
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /^1 değişken/);
  await page.getByTestId("fullscreen-undo-convert").click();
  assert.equal(await fsText(page).inputValue(), TEXT);
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /^0 değişken/);
  // Geri alma düğmesi kaybolur, Hazır ayarlar geri gelir.
  await page.getByTestId("fullscreen-presets").waitFor();
});

await scenario("3. Seçili metin: düğme seçilen ifadeyi gösterir ve tamamı tek değişken olur (varsayılan değer = ifade); değişken formdaki listede de görünür", async ({ page }) => {
  await openFullscreen(page);
  await select(page, "red wooden covered bridge");
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "active");
  assert.equal(await convertText(page).innerText(), "“red wooden covered bridge”");
  await convert(page).click();
  // Ad ilk üç kelimeden üretilir; dönüşen şey seçilen ifadenin TAMAMIDIR.
  assert.equal(await fsText(page).inputValue(), "Act as a cinematic designer. Design one {Red_wooden_covered} at sunrise.");
  await page.getByTestId("fullscreen-done").click();
  await layer(page).waitFor({ state: "detached" });
  assert.match(await page.locator("#prompt-text").inputValue(), /\{Red_wooden_covered\}/);
  await page.getByText("{Red_wooden_covered}").first().waitFor();
});

await scenario("4. Boşlukta ve noktalamada düğme pasif ('Bir kelimeye dokun'); seçimde { } varsa 'Seçimde değişken var'", async ({ page }) => {
  await openFullscreen(page, "Merhaba dünya. {Konu} güzel.");
  await select(page, "dünya.", 6);
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "none");
  assert.equal(await convertText(page).innerText(), "Bir kelimeye dokun");
  assert.equal(await convert(page).getAttribute("aria-disabled"), "true");
  await convert(page).click({ force: true });
  assert.equal(await fsText(page).inputValue(), "Merhaba dünya. {Konu} güzel.", "disabled button changes nothing");
  await select(page, "dünya. {Konu");
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "blocked");
  assert.equal(await convertText(page).innerText(), "Seçimde değişken var");
});

await scenario("5. İmleç hazır bir {değişken}in içindeyken düğme 'Değişkeni düzenle' olur ve mevcut değişken penceresini açar (katmanın üstünde)", async ({ page }) => {
  await openFullscreen(page, "Bir şehir seç.");
  await select(page, "şehir");
  await convert(page).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "done");
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") !== "done", null, { timeout: 8000 });
  await select(page, "{Şehir}", 3);
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "token");
  assert.equal(await convertText(page).innerText(), "{Şehir}");
  await convert(page).click();
  await page.getByRole("heading", { name: "Değişkeni Düzenle" }).waitFor();
  assert.equal(await layer(page).count(), 1, "fullscreen layer stays under the modal");
});

await scenario("6. Aynı adlı değişken varsa yenisi açılmaz: 'Mevcut değişkene bağlandı' ve Geri al mevcut değişkene dokunmaz", async ({ page }) => {
  await openFullscreen(page, "kedi ve kedi");
  await select(page, "kedi", 1);
  await convert(page).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "done");
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /^1 değişken/);
  await page.getByTestId("fullscreen-done").click();
  await page.getByTestId("open-fullscreen").click();
  await layer(page).waitFor();
  await fsText(page).evaluate((el) => { const i = el.value.lastIndexOf("kedi"); el.focus(); el.setSelectionRange(i + 1, i + 1); document.dispatchEvent(new Event("selectionchange")); });
  await convert(page).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-convert]")?.getAttribute("data-mode") === "done");
  assert.match(await page.locator("[data-testid=fullscreen-convert]").innerText(), /Mevcut değişkene bağlandı/);
  assert.equal(await fsText(page).inputValue(), "{Kedi} ve {Kedi}");
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /^1 değişken/);
  await page.getByTestId("fullscreen-undo-convert").click();
  assert.equal(await fsText(page).inputValue(), "{Kedi} ve kedi");
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /^1 değişken/, "the existing variable is kept");
});

await scenario("7. Hazır ayarlar üstte: dokununca Hazır ayarlar paneli katmanın ÜSTÜNE açılır; Escape önce paneli kapatır, katman açık kalır", async ({ page }) => {
  await openFullscreen(page);
  await page.getByTestId("fullscreen-presets").click();
  await page.locator("[data-extra-panel]").waitFor();
  const stacking = await page.evaluate(() => {
    const panel = document.querySelector("[data-extra-panel]").getBoundingClientRect();
    const top = document.elementFromPoint(panel.left + panel.width / 2, panel.top + 20);
    return !!top?.closest("[data-extra-panel]");
  });
  assert.equal(stacking, true, "panel paints above the fullscreen layer");
  await page.keyboard.press("Escape");
  await page.locator("[data-extra-panel]").waitFor({ state: "detached" });
  assert.equal(await layer(page).count(), 1);
  await page.keyboard.press("Escape");
  await layer(page).waitFor({ state: "detached" });
});

await scenario("8. İngilizce: katman ve düğme metinleri çevrili", async ({ page }) => {
  await page.goto(`${BASE}/create?mode=prompt`);
  await page.locator("[data-compose-body]").waitFor();
  await page.waitForTimeout(300);
  await page.locator("#prompt-text").fill(TEXT);
  await page.getByTestId("open-fullscreen").click();
  await layer(page).waitFor();
  assert.match(await page.getByTestId("fullscreen-meta").innerText(), /0 variables · \d+ characters/);
  await select(page, "bridge", 2);
  await page.waitForFunction(() => /Convert to variable/.test(document.querySelector("[data-testid=fullscreen-convert]")?.innerText ?? ""));
  await page.getByTestId("fullscreen-presets").waitFor();
  assert.match(await page.getByTestId("fullscreen-presets").innerText(), /Presets/);
  await page.getByTestId("fullscreen-done").innerText().then((s) => assert.equal(s.trim(), "Done"));
}, { lang: "en" });

await scenario("9. Mobil (390x800): yatay taşma yok; sabit satır metin kaydırılınca yerinde kalır; düğme ile Hazır ayarlar yan yana sığar", async ({ page }) => {
  const long = Array.from({ length: 40 }, (_, i) => `Cümle ${i + 1} bir kelime daha.`).join(" ");
  await openFullscreen(page, long);
  assert.equal(await overflowFree(page), true);
  const before = await convert(page).boundingBox();
  await page.evaluate(() => { const scroller = document.querySelector("[data-prompt-fullscreen] .overflow-y-auto"); scroller.scrollTop = 600; });
  const after = await convert(page).boundingBox();
  assert.deepEqual([after.x, after.y], [before.x, before.y], "convert button does not move while the text scrolls");
  const presets = await page.getByTestId("fullscreen-presets").boundingBox();
  assert.ok(before.x + before.width <= presets.x, "convert and presets do not overlap");
  assert.ok(presets.x + presets.width <= 390, "presets button stays on screen");
  assert.equal(before.y < 140, true, "the row is at the top of the screen");
  assert.equal(await page.evaluate(() => !!document.elementFromPoint(20, window.innerHeight - 10)?.closest("[data-prompt-fullscreen]")), true, "layer covers the whole screen");
}, { viewport: { width: 390, height: 800 } });

await scenario("10. Klavye açılınca (görünür alan küçülür/kayar, ölçüm bayat da olsa) katman tüm ekranı kaplar: arkadaki form görünmez, içerik görünür alana oturur", async ({ page }) => {
  await openFullscreen(page);
  const insideLayer = (y) => page.evaluate((yy) => !!document.elementFromPoint(20, yy)?.closest("[data-prompt-fullscreen]"), y);
  assert.equal(await insideLayer(780), true, "bottom of the screen is covered before the keyboard");
  // iOS klavyesi: görünür alan 340 px'e iner ve 50 px aşağı kayar (ara ölçüm gibi).
  await page.evaluate(() => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, "height", { configurable: true, get: () => 340 });
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => 50 });
    vv.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => document.querySelector("[data-testid=fullscreen-visible]")?.getBoundingClientRect().height === 340);
  const rect = await page.getByTestId("fullscreen-visible").boundingBox();
  assert.equal(Math.round(rect.y), 50);
  assert.equal(await insideLayer(780), true, "the layer still covers the bottom (keyboard area) and the top");
  assert.equal(await insideLayer(10), true);
  const header = await page.getByTestId("fullscreen-close").boundingBox();
  assert.ok(header.y >= 50 && header.y < 120, "header sits at the top of the visible area");
  // Ölçüm düzelince (klavye kapanır) iç alan tüm ekrana döner.
  await page.evaluate(() => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, "height", { configurable: true, get: () => window.innerHeight });
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => 0 });
    vv.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => Math.round(document.querySelector("[data-testid=fullscreen-visible]").getBoundingClientRect().height) === window.innerHeight);
}, { viewport: { width: 390, height: 800 } });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
