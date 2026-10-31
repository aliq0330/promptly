// Studio karşılaştırma (docs/history/296-*): iki modelle çalıştırınca sonuçlar model başına yan yana sütunlarda, süre görünür, "Bu daha iyi" yerel işareti,
// Prompt kaynaklıysa "Sonuç olarak paylaş" (sonuç penceresi üretilen görselle ve araçla dolu açılır). Sağlayıcı uçları (Gemini/OpenAI) ağ taklitlidir;
// gerçek bir API anahtarına/sağlayıcıya KARŞI DENENMEDİ. Anahtarın sunucuya gitmediği de sınanır (Supabase isteklerinde anahtar geçmez).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { installDetailData, ID } from "./detail-fixtures.mjs";

const PORT = 4211;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

async function scenario(name, fn, { viewport = { width: 1280, height: 1000 }, lang = "tr", path = `/studio?prompt=${ID.prompt}`, openaiFails = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { gemini: 0, openai: 0, supabaseBodies: [] };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  context.on("request", (req) => {
    if (req.url().startsWith("https://example.supabase.co") && req.postData()) state.supabaseBodies.push(req.postData());
  });
  await context.route("https://generativelanguage.googleapis.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (route.request().method() === "GET") return json(route, {}, 500);
    state.gemini += 1;
    await new Promise((r) => setTimeout(r, 250));
    return json(route, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] } }] });
  });
  await context.route("https://api.openai.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (route.request().method() === "GET") return json(route, {}, 500);
    state.openai += 1;
    await new Promise((r) => setTimeout(r, 900));
    if (openaiFails) return json(route, { error: { message: "Incorrect API key provided" } }, 401);
    return json(route, { data: [{ b64_json: PNG }] });
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await fn(page, state);
    assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, e.message.split("\n")[0]]);
  } finally {
    await context.close();
  }
}

async function fillKeys(page, { compare }) {
  await page.locator("#gen-key").fill("gem-test-key");
  if (!compare) return;
  await page.getByRole("button", { name: /Başka bir modelle de dene|Also try another model/ }).click();
  // Ek satır: sağlayıcı OpenAI'a düşer; kendi anahtar kutusu belirir.
  await page.locator("input[type=password]").last().fill("oa-test-key");
}

await scenario("1 iki modelle: yan yana iki sütun, süreler ve etiketler", async (page, state) => {
  await fillKeys(page, { compare: true });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.getByTestId("studio-result-column").nth(1).waitFor();
  await page.locator("[data-testid=result-seconds]").nth(1).waitFor();
  assert.equal(await page.getByTestId("studio-result-column").count(), 2);
  assert.equal(await page.locator("[data-testid=result-seconds]").count(), 2);
  assert.equal(state.gemini, 1);
  assert.equal(state.openai, 1);
  const cols = await page.getByTestId("studio-result-column").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  assert.ok(cols[1] > cols[0] + 100, `sütunlar yan yana değil: ${cols}`);
  const secs = await page.locator("[data-testid=result-seconds]").allInnerTexts();
  assert.match(secs[0], /\d,\d sn/);
  const headers = await page.getByTestId("studio-result-column").evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""));
  assert.match(headers[0], /Gemini/);
  assert.match(headers[1], /OpenAI/);
});

await scenario("2 'Bu daha iyi' yerel işaret: biri işaretlenir, ikincisi ilkini değiştirir, geri alınır", async (page, state) => {
  await fillKeys(page, { compare: true });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.locator("[data-testid=mark-better]").nth(1).waitFor();
  const marks = page.getByTestId("mark-better");
  await marks.nth(0).click();
  assert.equal(await page.getByText("Daha iyisi", { exact: true }).count(), 1);
  assert.equal(await marks.nth(0).getAttribute("aria-pressed"), "true");
  await marks.nth(1).click();
  assert.equal(await page.getByText("Daha iyisi", { exact: true }).count(), 1);
  assert.equal(await marks.nth(0).getAttribute("aria-pressed"), "false");
  assert.equal(await marks.nth(1).getAttribute("aria-pressed"), "true");
  await marks.nth(1).click();
  assert.equal(await page.getByText("Daha iyisi", { exact: true }).count(), 0);
  // İşaret yalnız ekranda kalır: hiçbir Supabase isteği "better" taşımaz.
  assert.ok(!state.supabaseBodies.some((b) => /better/i.test(b)));
  assert.ok(!state.supabaseBodies.some((b) => /gem-test-key|oa-test-key/.test(b)), "API anahtarı sunucuya gitmemeli");
});

await scenario("3 tek modelde işaret düğmesi yok, tek sütun, süre var", async (page) => {
  await fillKeys(page, { compare: false });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.locator("[data-testid=result-seconds]").first().waitFor();
  assert.equal(await page.getByTestId("studio-result-column").count(), 1);
  assert.equal(await page.getByTestId("mark-better").count(), 0);
});

await scenario("4 Prompt kaynaklıyken 'Sonuç olarak paylaş' dolu bir sonuç penceresi açar", async (page) => {
  await fillKeys(page, { compare: false });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  const share = page.getByTestId("share-as-result");
  await share.waitFor();
  await share.click();
  const note = page.getByTestId("result-prefilled");
  await note.waitFor();
  assert.match(await note.innerText(), /studio-result\.png/);
  const tool = await page.locator("#result-tool").inputValue();
  assert.match(tool, /Gemini/);
  const submit = page.getByRole("button", { name: /Paylaş|Ekle|Sonuç ekle/ }).last();
  assert.equal(await submit.isDisabled(), false, "dosya hazır olduğu için gönder açık olmalı");
});

await scenario("5 kaynaksız (boş) Studio'da paylaş düğmesi yok", async (page) => {
  await page.locator("#gen-prompt").fill("Bir sokak lambasının altında yağmur");
  await fillKeys(page, { compare: false });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.locator("[data-testid=result-seconds]").first().waitFor();
  assert.equal(await page.getByTestId("share-as-result").count(), 0);
}, { path: "/studio" });

await scenario("6 bir model hata verirse diğeri etkilenmez", async (page, state) => {
  await fillKeys(page, { compare: true });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /anahtar/i }).first().waitFor();
  assert.equal(await page.locator("[data-testid=result-seconds]").count(), 1, "Gemini sonucu yine de gelir");
  assert.equal(state.openai, 1);
}, { openaiFails: true });

await scenario("7 İngilizce etiketler", async (page) => {
  await fillKeys(page, { compare: true });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "This one is better" }).first().waitFor();
  await page.getByRole("button", { name: "Share as result" }).first().waitFor();
  assert.match((await page.locator("[data-testid=result-seconds]").first().innerText()), /\d\.\d s/);
}, { lang: "en" });

await scenario("8 mobilde sütunlar alt alta ve taşma yok", async (page) => {
  await fillKeys(page, { compare: true });
  await page.getByRole("button", { name: "Üret", exact: true }).click();
  await page.getByTestId("studio-result-column").nth(1).waitFor();
  await page.locator("[data-testid=result-seconds]").nth(1).waitFor();
  const tops = await page.getByTestId("studio-result-column").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY)));
  assert.ok(tops[1] > tops[0] + 100, "mobilde alt alta olmalı");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `yatay taşma ${overflow}px`);
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
let failed = 0;
for (const [name, ok, msg] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — ${msg}`}`);
  if (!ok) failed += 1;
}
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
