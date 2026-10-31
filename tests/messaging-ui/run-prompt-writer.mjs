// Prompt metni tam ekran yazma + basit değişken akışı (docs/history/288-*): formda tek kart → tam ekran katmanı (başlık + Bitti, üstte
// Hazır ayarlar / Ek alanlar / Görselden yardım), alt çubuk (Değişken · sayaç · Önizleme → seçili kelimede "Değişken yap" → seçili jetonda
// "Düzenle"), tek alanlı Değişken ekle / dönüştür sayfaları, tür + seçenek çipli düzenleme sayfası, silme onayı, önizleme, İngilizce, mobil.
// Ağ taklitli; gerçek Supabase'e / gerçek telefon klavyesine KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const BASE = `http://localhost:${process.env.PORT ?? 4197}/promptly`;
const server = await serve(Number(process.env.PORT ?? 4197));
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
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pwfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const card = (page) => page.locator("[data-prompt-card]");
const full = (page) => page.locator("[data-prompt-fullscreen]");
const text = (page) => page.locator("#prompt-text");
const dock = (page, kind) => page.locator(`[data-prompt-dock=${kind}]`);
const sheet = (page) => page.locator("[data-variable-sheet]");
const openWriter = async (page, initial = "") => {
  await page.goto(`${BASE}/create?mode=prompt`);
  await page.locator("[data-compose]").waitFor();
  await page.waitForTimeout(300);
  await card(page).click();
  await full(page).waitFor();
  if (initial) await text(page).fill(initial);
};
/** Metindeki `needle`i gerçek textarea'da seçer (dokunmatikte uzun basma karşılığı). */
const select = async (page, needle) => {
  await text(page).evaluate((el, n) => { const i = el.value.indexOf(n); el.focus(); el.setSelectionRange(i, i + n.length); }, needle);
};
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Formda tek kart: metin + değişken sayısı + Tam ekran yaz; dokununca tam ekran katmanı, üstte üç kısayol, Bitti kartı günceller", async ({ page }) => {
  await page.goto(`${BASE}/create?mode=prompt`);
  await page.locator("[data-compose]").waitFor();
  await card(page).waitFor();
  assert.match(await card(page).innerText(), /0 değişken/);
  assert.match(await card(page).innerText(), /Tam ekran yaz/);
  assert.equal(await page.locator("#prompt-text").count(), 0, "no editor on the form itself");
  await card(page).click();
  await full(page).waitFor();
  await page.getByRole("heading", { name: "Prompt metni" }).waitFor();
  for (const tid of ["prompt-open-presets", "prompt-open-fields", "prompt-open-vision"]) await page.getByTestId(tid).waitFor();
  assert.equal(await page.locator("[data-app-chrome]:visible").count(), 0);
  await text(page).fill("Ay ışığında bekleyen bir kitsune");
  await page.getByTestId("prompt-fullscreen-done").click();
  await full(page).waitFor({ state: "detached" });
  assert.match(await card(page).innerText(), /Ay ışığında bekleyen bir kitsune/);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-prompt-card")), true, "focus returns to the card");
});

await scenario("2. Kelime seçilince alt çubuk 'Değişken yap' olur; sayfada tek alan (ad hazır), varsayılan değer = kelime; metne jeton yazılır", async ({ page }) => {
  await openWriter(page, "Ay ışığında bekleyen bir kitsune, sinematik ışık");
  await dock(page, "main").waitFor();
  await select(page, "kitsune");
  await dock(page, "word").waitFor();
  assert.match(await dock(page, "word").innerText(), /kitsune/);
  await page.getByTestId("prompt-make-variable").click();
  await sheet(page).waitFor();
  await page.getByRole("heading", { name: "Değişkene dönüştür" }).waitFor();
  assert.equal(await page.getByTestId("variable-convert-name").inputValue(), "kitsune");
  assert.equal(await sheet(page).locator("input[type=text]").count(), 1, "one field only");
  await page.getByTestId("variable-convert-name").fill("karakter");
  await page.getByTestId("variable-convert-submit").click();
  await sheet(page).waitFor({ state: "detached" });
  assert.equal(await text(page).inputValue(), "Ay ışığında bekleyen bir {karakter}, sinematik ışık");
  assert.match(await page.locator("[data-prompt-dock]").innerText(), /1 değişken/);
  await page.getByTestId("prompt-fullscreen-done").click();
  assert.match(await card(page).innerText(), /1 değişken/);
  assert.match(await card(page).innerText(), /\{karakter\}/);
});

await scenario("3. Değişken ekle sayfası: ad yaz + Enter → imlece jeton; öneri çipi tek dokunuş; 'Bu promptta' çipi var olanı ekler; aynı ad yenisini açmaz", async ({ page }) => {
  await openWriter(page, "Bir kedi");
  await page.getByTestId("prompt-add-variable").click();
  await sheet(page).waitFor();
  assert.equal(await sheet(page).locator("[data-variable-chip]").count(), 0);
  assert.equal(await sheet(page).locator("[data-variable-suggestion]").count(), 5);
  await page.getByTestId("variable-add-name").fill("ortam");
  await page.keyboard.press("Enter");
  await sheet(page).waitFor({ state: "detached" });
  assert.equal(await text(page).inputValue(), "Bir kedi {ortam}");
  await page.getByTestId("prompt-add-variable").click();
  await sheet(page).waitFor();
  await sheet(page).locator("[data-variable-suggestion=stil]").click();
  await sheet(page).waitFor({ state: "detached" });
  assert.match(await text(page).inputValue(), /\{stil\}/);
  await page.getByTestId("prompt-add-variable").click();
  await sheet(page).waitFor();
  assert.equal(await sheet(page).locator("[data-variable-suggestion=stil]").count(), 0, "defined names leave the suggestions");
  await sheet(page).locator("[data-variable-chip=ortam]").click();
  await sheet(page).waitFor({ state: "detached" });
  assert.equal((await text(page).inputValue()).match(/\{ortam\}/g).length, 2, "existing variable inserted again");
  await page.getByTestId("prompt-add-variable").click();
  await page.getByTestId("variable-add-name").fill("ORTAM");
  await page.keyboard.press("Enter");
  assert.match(await page.locator("[data-prompt-dock]").innerText(), /2 değişken/, "case-insensitive same name is not a new variable");
  await page.getByTestId("prompt-add-variable").click();
  await page.getByTestId("variable-add-name").fill("x".repeat(45));
  await page.getByTestId("variable-add-submit").click();
  await page.getByRole("alert").waitFor();
});

await scenario("4. Jeton seçilince alt çubuk 'Düzenle': Seçenekli + yaz-Enter çipleri, varsayılan, Tamam; önizlemede seçim alanı; Sil iki adımlı", async ({ page }) => {
  await openWriter(page, "Portre {lens} lens ile");
  // Jetonu dokunarak seç: imleç jetonun içine düşünce tamamı seçilir.
  await select(page, "{lens}");
  await dock(page, "token").waitFor();
  await page.getByTestId("prompt-edit-variable").click(); // yetim jeton: önce tanımlanır, sonra düzenleme açılır
  await sheet(page).waitFor();
  assert.equal(await sheet(page).locator("[data-variable-type]").count(), 4, "four main types");
  await sheet(page).locator("[data-variable-type=select]").click();
  const input = page.getByTestId("variable-option-input");
  for (const opt of ["24mm", "35mm", "85mm"]) { await input.fill(opt); await page.keyboard.press("Enter"); }
  assert.equal(await sheet(page).locator("[data-variable-options] li").count(), 3);
  assert.equal(await sheet(page).locator("[data-variable-options] button[aria-pressed=true]").count(), 1, "first option becomes the default");
  await sheet(page).locator("[data-variable-options] li").nth(2).locator("button").first().click();
  await page.getByTestId("variable-edit-submit").click();
  await sheet(page).waitFor({ state: "detached" });
  await page.getByTestId("prompt-preview-toggle").click();
  await page.locator("[data-prompt-preview]").waitFor();
  assert.match(await page.locator("[data-prompt-preview]").innerText(), /Portre 85mm lens ile/);
  await page.getByRole("button", { name: "24mm" }).click();
  assert.match(await page.locator("[data-prompt-preview]").innerText(), /Portre 24mm lens ile/);
  await page.getByTestId("prompt-preview-toggle").click();
  await select(page, "{lens}");
  await page.getByTestId("prompt-edit-variable").click();
  await sheet(page).waitFor();
  await page.getByTestId("variable-delete").click();
  await page.getByRole("alert").getByText(/1 yerde kullanılıyor/).waitFor();
  assert.match(await text(page).inputValue(), /\{lens\}/, "first press only asks");
  await page.getByTestId("variable-delete").click();
  await sheet(page).waitFor({ state: "detached" });
  assert.equal(await text(page).inputValue(), "Portre lens ile", "token removed with the variable");
});

await scenario("5. Gelişmiş: açıklama/koşul ve diğer türler kapalı gelir, açılınca görünür; yinelenen ad uyarılır; Hazır alan kütüphanesi katalog penceresini açar", async ({ page }) => {
  await openWriter(page, "Konu {a} ve {b}");
  // {a} yetimdir: önce tanımlanır (Tanımla → Tamam), sonra {b} aynı ada yeniden adlandırılmaya çalışılır.
  await select(page, "{a}");
  await page.getByTestId("prompt-edit-variable").click();
  await sheet(page).waitFor();
  await page.getByTestId("variable-edit-submit").click();
  await sheet(page).waitFor({ state: "detached" });
  await select(page, "{b}");
  await page.getByTestId("prompt-edit-variable").click();
  await sheet(page).waitFor();
  assert.equal(await page.locator("#variable-edit-description").count(), 0);
  await page.getByTestId("variable-advanced").click();
  await page.locator("#variable-edit-description").waitFor();
  await page.getByRole("button", { name: "Çoklu seçim" }).waitFor();
  await page.getByRole("button", { name: "Kaydırıcı" }).waitFor();
  await page.getByText("Yalnızca belirli bir durumda göster").waitFor();
  await page.locator("#variable-edit-name").fill("a");
  await page.getByTestId("variable-edit-submit").click();
  await page.getByRole("alert").getByText(/aynı isimde/).waitFor();
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  await full(page).waitFor();
  await page.getByTestId("prompt-add-variable").click();
  await sheet(page).getByRole("button", { name: /Hazır alan kütüphanesi/ }).click();
  await page.getByRole("dialog").filter({ hasText: /kütüphane|Kütüphane/i }).first().waitFor();
});

await scenario("6. Hazır ayarlar / Ek alanlar düğmeleri formdaki paneli ilgili sekmede açar; uygulanan sayı rozeti; Görselden yardım alt sayfası", async ({ page }) => {
  await openWriter(page, "metin");
  await page.getByTestId("prompt-open-presets").click();
  await page.locator("[data-extra-panel]").waitFor();
  assert.match(await page.locator("[data-extra-panel]").getByRole("tab", { name: "Topluluk" }).getAttribute("aria-selected") ?? "true", /true/);
  await page.keyboard.press("Escape");
  await page.locator("[data-extra-panel]").waitFor({ state: "detached" });
  await page.getByTestId("prompt-open-fields").click();
  await page.locator("[data-extra-panel]").waitFor();
  await page.locator("[data-extra-panel]").getByRole("heading", { name: /Alanlar/ }).first().waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("prompt-open-vision").click();
  await sheet(page).waitFor();
  await sheet(page).getByRole("heading", { name: "Görselden yardım" }).waitFor();
  await page.keyboard.press("Escape");
  await sheet(page).waitFor({ state: "detached" });
  await full(page).waitFor();
});

await scenario("7. İngilizce: tüm yeni metinler çevrilmiş", async ({ page }) => {
  await openWriter(page, "A fox in the moonlight");
  await page.getByTestId("prompt-open-presets").waitFor();
  assert.match(await full(page).innerText(), /Presets/);
  assert.match(await full(page).innerText(), /Extra fields/);
  assert.match(await full(page).innerText(), /Help from image/);
  assert.match(await full(page).innerText(), /0 variables · 22 characters/);
  await select(page, "fox");
  await page.getByTestId("prompt-make-variable").click();
  await page.getByRole("heading", { name: "Convert to variable" }).waitFor();
  assert.match(await sheet(page).innerText(), /Selected word/);
  assert.match(await sheet(page).innerText(), /The default value is the word in the text/);
  await page.getByTestId("variable-convert-submit").click();
  await page.getByTestId("prompt-add-variable").click();
  assert.match(await sheet(page).innerText(), /In this prompt/);
  assert.match(await sheet(page).innerText(), /Suggested · one tap/);
  await sheet(page).locator("[data-variable-suggestion='camera angle']").waitFor();
}, { lang: "en" });

await scenario("8. Mobil 390x844: tam ekran katmanı sayfayı taşırmaz, alt çubuk görünür alanda, alt sayfa %75'i aşmaz", async ({ page }) => {
  await openWriter(page, "Ay ışığında bekleyen bir kitsune");
  const box = await full(page).boundingBox();
  assert.equal(Math.round(box.width), 390);
  assert.equal(Math.round(box.height), 844);
  const dockBox = await page.locator("[data-prompt-dock]").boundingBox();
  assert.ok(dockBox.y + dockBox.height <= 844 + 1, "dock inside the viewport");
  assert.equal(await overflowFree(page), true);
  await page.getByTestId("prompt-add-variable").click();
  await sheet(page).waitFor();
  const sheetBox = await sheet(page).boundingBox();
  assert.ok(sheetBox.height <= 844 * 0.75 + 2, `sheet height ${sheetBox.height} <= 75%`);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
