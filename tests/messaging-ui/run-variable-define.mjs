// Prompt oluşturma ekranında değişkenler (docs/history/439-*): metinde `{ad}` geçip tanımı olmayan jetonlar için tek dokunuşluk "Tümünü tanımla",
// JSON/kod parantezlerinin değişken sayılmaması, metin değişkeninde "Örnek değerler" (okuyucuya dokununca dolduran çipler, serbest yazma sürer),
// etiketlerde alt çizginin boşluk görünmesi, İngilizce ve mobil taşma. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ.
// SHOTS=<klasör> verilirse ana adımların ekran görüntüsünü oraya yazar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = Number(process.env.PORT ?? 4335);
const BASE = `http://localhost:${PORT}/promptly`;
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 1000 }, lang = "tr", scale = 1 } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-theme", "light"); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = async (file, locator) => { if (SHOTS) await (locator ?? page).screenshot({ path: `${SHOTS}/${file}.png` }); };
  try { await fn({ page, db, shot }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pwfail-vd-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const TEXT = 'A monumental carved {number} in {city} at {time_of_day}. Return {"style": 1} too.';
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const orphans = (page) => page.getByTestId("orphan-tokens");
const defineAll = (page) => page.getByTestId("define-all-orphans");

async function openForm(page, text = TEXT) {
  await page.goto(`${BASE}/create?mode=prompt`);
  await page.locator("[data-compose-body]").waitFor();
  await page.waitForTimeout(300);
  // Adımlı form (docs/history/445-*): prompt metni "Prompt" adımındadır, önce o adım açılır.
  await page.locator('[data-compose-step-summary="prompt"]:visible, [data-compose-nav-item="prompt"]:visible').first().click();
  await page.locator("#prompt-text").fill(text);
}

await scenario("1. Tanımsız jetonlar: uyarıda 'Tümünü tanımla (3)'; JSON parantezi sayılmaz; tıklayınca üç değişken oluşur", async ({ page, shot }) => {
  await openForm(page);
  await orphans(page).waitFor();
  assert.match(await orphans(page).innerText(), /\{number\}.*\{city\}.*\{time_of_day\}/s);
  assert.equal((await defineAll(page).innerText()).trim(), "Tümünü tanımla (3)");
  await shot("1-once-uyari", page.locator("#prompt-text").locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"));
  await defineAll(page).click();
  // Üç değişken tanımlandı: düğme kalktı, listede üçü de var, jeton uyarısı yalnız JSON parçasını (tanımlanamaz) söylüyor.
  await defineAll(page).waitFor({ state: "detached" });
  for (const name of ["number", "city", "time_of_day"]) await page.getByRole("button", { name: `${name} değişkenini düzenle` }).waitFor();
  const warning = await orphans(page).innerText();
  assert.ok(warning.includes('"style": 1') && !warning.includes("{city}"), warning);
  await shot("2-sonra-tanimli", page.locator("#prompt-text").locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"));
});

await scenario("2. Tüm jetonlar tanımlanabilirse uyarının kendisi de kalkar; ikinci kez tıklanacak düğme yok", async ({ page }) => {
  await openForm(page, "A {city} at {era}");
  await defineAll(page).click();
  await orphans(page).waitFor({ state: "detached" });
});

await scenario("3. Örnek değerler: düzenleme penceresinde yazılır, Önizlemede çip olur; çip doldurur, serbest yazma sürer; etiket alt çizgisiz görünür", async ({ page, shot }) => {
  await openForm(page, "A {time_of_day} scene in {city}");
  await defineAll(page).click();
  await page.getByRole("button", { name: "city değişkenini düzenle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Varsayılan Değer").fill("Istanbul");
  await dialog.getByLabel("Örnek değerler").fill("Istanbul, Tokyo, Paris");
  await dialog.getByText("Okuyucu birine dokunarak doldurabilir").waitFor();
  await shot("3-ornek-degerler-penceresi", dialog);
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("tab", { name: "Önizleme" }).click();
  const group = page.getByRole("group", { name: "city için örnek değerler" });
  await group.waitFor();
  assert.deepEqual((await group.getByRole("button").allInnerTexts()).map((t) => t.trim()), ["Istanbul", "Tokyo", "Paris"]);
  // Etiket: time_of_day → "time of day" (jeton adı değişmez)
  await page.getByText("time of day", { exact: false }).first().waitFor();
  await group.getByRole("button", { name: "Tokyo" }).click();
  const preview = page.locator("div.card-inset > div.whitespace-pre-wrap");
  assert.match(await preview.innerText(), /scene in Tokyo/);
  assert.equal(await page.getByLabel("city", { exact: false }).first().inputValue(), "Tokyo");
  await shot("4-onizleme-cipleri", page.locator("#prompt-text").locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]"));
  // Serbest yazma kısıtlanmaz: çip listesinde olmayan değer yazılabilir ve hiçbir çip seçili kalmaz.
  await page.getByLabel("city", { exact: false }).first().fill("Reykjavik");
  assert.match(await preview.innerText(), /scene in Reykjavik/);
  assert.equal(await group.getByRole("button", { pressed: true }).count(), 0);
});

await scenario("4. Örnek değerlerde virgül yazarken kaybolmaz; boş bırakılınca çip alanı hiç çizilmez", async ({ page }) => {
  await openForm(page, "A {city}");
  await defineAll(page).click();
  await page.getByRole("button", { name: "city değişkenini düzenle" }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("Örnek değerler");
  await input.pressSequentially("Istanbul,");
  assert.equal(await input.inputValue(), "Istanbul,");
  await input.fill("");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await page.getByRole("tab", { name: "Önizleme" }).click();
  assert.equal(await page.getByRole("group", { name: /için örnek değerler/ }).count(), 0);
});

await scenario("5. İngilizce: 'Define all (2)' ve 'Example values'", async ({ page }) => {
  await openForm(page, "A {city} in {era}");
  assert.equal((await defineAll(page).innerText()).trim(), "Define all (2)");
  await defineAll(page).click();
  await page.getByRole("button", { name: "Edit the city variable" }).click();
  await page.getByRole("dialog").getByLabel("Example values").waitFor();
}, { lang: "en" });

await scenario("6. Mobil: uyarı + düğme taşmaz, düğme ≥36px", async ({ page, shot }) => {
  await openForm(page);
  await orphans(page).waitFor();
  assert.ok(await overflowFree(page), "no horizontal overflow");
  const box = await defineAll(page).boundingBox();
  assert.ok(box && box.height >= 36, `target ${box?.height}`);
  await shot("5-mobil-uyari");
  await defineAll(page).click();
  await page.getByRole("button", { name: "city değişkenini düzenle" }).click();
  await page.getByRole("dialog").getByLabel("Örnek değerler").fill("Istanbul, Tokyo");
  await shot("6-mobil-ornek-degerler");
  assert.ok(await overflowFree(page), "no overflow with the dialog open");
}, { viewport: { width: 390, height: 844 }, scale: 2 });

await browser.close();
server.close();
for (const [status, name] of results) console.log(status === "PASS" ? "✓" : "FAIL", name);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
