// İçerik detay sayfaları (Prompt · İstek · Workflow · Hazır ayar) ortak tasarım testleri (ağ taklitli) — docs/history/189-*.
// Zengin veri `detail-fixtures.mjs`'tedir. Gerçek Supabase'e KARŞI DENENMEDİ; arayüzün yerleşimini, ortak parçalarını ve davranışını sınar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4180/promptly";
const server = await serve(4180);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, kind, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", theme } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  seedComments(db, kind);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES[kind]);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/dfail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const box = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }; });

// 1 — her tür aynı iskeleti kullanır: tür etiketi + menü, başlık, yazar satırı (Takip Et), etkileşim çubuğu, meta kartı, yorum kartı
for (const kind of ["prompt", "request", "workflow", "preset"]) {
  await scenario(`1. ${kind}: ortak iskelet — başlık, yazar satırı + Takip Et, etkileşim çubuğu, meta kartı (araç + etiketler), yorumlar`, kind, async ({ page }) => {
    await page.getByRole("button", { name: "Takip Et" }).first().waitFor();
    const byline = await page.locator("article a[href*='/profile/']").first().textContent();
    assert.match(byline ?? "", /Carol/);
    const bar = page.locator("[data-detail-actions]").filter({ has: page.getByRole("button", { name: "Paylaş" }) }).first();
    await bar.waitFor();
    const meta = page.getByTestId("detail-meta");
    await meta.waitFor();
    assert.ok((await meta.getByRole("link", { name: "Marka" }).count()) === 1, "tag chips live inside the meta card");
    assert.ok((await meta.getByText(/Tavsiye edilen araç\/model|Tercih edilen araç\/model/).count()) === 1, "tool label inside the meta card");
    await page.locator("#comments").waitFor();
    assert.match((await page.locator("#comments h2").first().textContent()) ?? "", /Yorumlar/);
    // Takip Et yazar satırında ağırlıkla sağda (aynı satır)
    const follow = await box(page.getByRole("button", { name: "Takip Et" }).first());
    const person = await box(page.locator("article a[href*='/profile/']").first());
    assert.ok(Math.abs(follow.top - person.top) < 40, "Takip Et sits on the byline row");
  }, { viewport: { width: 390, height: 844 } });
}

// 2 — Prompt: kaynak ve lisans tek kapalı satır; prompt kartı eylemleri başlıkta, 'Düzenleme öner' altbilgide; çıktı tam genişlikte
await scenario("2. prompt: 'Kaynak ve lisans' kapalı satır + CC BY 4.0 rozeti; açılınca bağlantılı kaynak satırları", "prompt", async ({ page }) => {
  const notes = page.getByTestId("source-notes");
  await notes.waitFor();
  assert.match((await notes.textContent()) ?? "", /Kaynak ve lisans.*CC BY 4\.0/);
  assert.equal(await notes.getByRole("link", { name: /x\.com/ }).count(), 0, "credit lines hidden until opened");
  await notes.getByRole("button", { name: /Kaynak ve lisans/ }).click();
  await notes.getByRole("link", { name: /x\.com\/egeberkina/ }).waitFor();
  assert.equal(await notes.getByRole("button", { name: /Kaynak ve lisans/ }).getAttribute("aria-expanded"), "true");
});
await scenario("2b. prompt: Kopyala · Çalıştır · Studio'da aç kart başlığında; 'Düzenleme öner' kartın altbilgisinde; araç adı çift yazılmaz", "prompt", async ({ page }) => {
  const card = page.locator("section#prompt-text");
  await card.waitFor();
  for (const name of [/Kopyala/, /Çalıştır/, /Studio/]) await card.getByRole("button", { name }).or(card.getByRole("link", { name })).first().waitFor();
  const head = await box(card.getByRole("button", { name: /Kopyala/ }));
  const suggest = await box(card.getByRole("button", { name: "Düzenleme öner" }));
  assert.ok(suggest.top > head.top + 100, "'Düzenleme öner' is the card footer, below the text");
  const meta = (await page.getByTestId("detail-meta").textContent()) ?? "";
  assert.match(meta, /GPT Image 1/);
  assert.ok(!/GPT Image GPT Image/.test(meta), "model name is not prefixed with the tool name twice");
});
await scenario("2c. prompt: çıktı görseli sütun genişliğini kullanır (mobilde tam genişlik)", "prompt", async ({ page }) => {
  const figure = page.locator("figure").first();
  await figure.waitFor();
  const w = (await box(figure.locator("button").first())).width;
  assert.ok(w >= 330, `hero uses the column width on phones (${w})`);
}, { viewport: { width: 390, height: 844 } });

// 3 — yorumlar kısa açılır (3), 'Tümünü gör' hepsini açar ve 'Daha az göster' geri toplar; yeni yorum yazınca hepsi açık
await scenario("3. yorumlar: ilk 3 görünür, 'Tümünü gör' dördüncüyü açar, 'Daha az göster' toplar", "prompt", async ({ page }) => {
  const section = page.locator("#comments");
  await section.getByText("Elif:").waitFor();
  assert.equal(await section.getByText("Mert:").count(), 0, "4th comment hidden at first");
  await section.getByRole("button", { name: /Tümünü gör/ }).click();
  await section.getByText("Mert:").waitFor();
  await section.getByRole("button", { name: "Daha az göster" }).click();
  assert.equal(await section.getByText("Mert:").count(), 0);
});
await scenario("3b. yorum yazınca konu tamamen açılır ve yorum alanı satırı doldurur (Gönder yan yana, taşmaz)", "prompt", async ({ page }) => {
  const section = page.locator("#comments");
  const input = section.getByPlaceholder(/Bir yorum yaz/);
  await input.waitFor();
  const i = await box(input); const send = await box(section.getByRole("button", { name: "Gönder" }));
  assert.ok(i.right <= send.left + 1, "input and Gönder do not overlap");
  assert.ok(send.left - i.right < 16, "input fills the row up to the button");
  await input.fill("Yeni yorum");
  await section.getByRole("button", { name: "Gönder" }).click();
  await section.getByText("Yeni yorum").waitFor();
  await section.getByText("Mert:").waitFor();
}, { viewport: { width: 390, height: 844 } });

// 4 — yerleşim: taşma yok, içerik genişliği sınırlı, sağ sütun yalnız xl+ (≥1280px), mobil alt gezinme içeriği örtmez
for (const [label, width, height] of [["320", 320, 700], ["375", 375, 800], ["390", 390, 844], ["430", 430, 900], ["768", 768, 1000], ["1024", 1024, 900], ["1280", 1280, 900], ["1440", 1440, 1000]]) {
  for (const kind of ["prompt", "request", "workflow", "preset"]) {
    await scenario(`4. ${kind} @${label}px: yatay taşma yok; ana sütun ≤ 760px (aside varken) ve ≤ 1152px; sağ sütun ${width >= 1280 ? "görünür" : "yok"}`, kind, async ({ page }) => {
      await page.waitForTimeout(500);
      assert.equal(await overflowFree(page), true, "no horizontal overflow");
      const article = await box(page.locator("article").first());
      assert.ok(article.width <= 1152, `article ≤ 1152 (${article.width})`);
      const creatorColumn = page.locator("aside > div.hidden").first();
      const visible = await creatorColumn.isVisible().catch(() => false);
      assert.equal(visible, width >= 1280, "creator column only on xl+");
      if (width >= 1280) assert.ok(article.width <= 860, `main column leaves room for the side column (${article.width})`);
    }, { viewport: { width, height } });
  }
}
await scenario("4b. mobil: alt gezinme sayfa sonundaki içeriği örtmez (son kart gezinmenin üstünde bitebilir)", "prompt", async ({ page }) => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const nav = await box(page.locator("nav").filter({ hasText: "Ana Sayfa" }).last());
  const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll("main *")].filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect().bottom)));
  assert.ok(lowest <= nav.top + 1, `content ends above the bottom nav (${lowest} vs ${nav.top})`);
}, { viewport: { width: 390, height: 844 } });

// 5 — tema ve dil
await scenario("5. koyu tema: dört türde taşma yok, meta kartı okunur (metin/zemin farklı)", "prompt", async ({ page }) => {
  await page.getByTestId("detail-meta").waitFor();
  assert.equal(await overflowFree(page), true);
  const colors = await page.getByTestId("detail-meta").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el.querySelector("a")).color }));
  assert.notEqual(colors.bg, colors.fg);
}, { theme: "dark", viewport: { width: 390, height: 844 } });
await scenario("5b. İngilizce: kaynak/lisans, yorumlar ve araç etiketi çevrilmiş", "prompt", async ({ page }) => {
  await page.getByRole("button", { name: /Source and license/ }).waitFor();
  await page.getByRole("button", { name: /View all/ }).first().waitFor();
  await page.getByText("Recommended tool/model").waitFor();
  await page.getByText("Prompt result").waitFor();
}, { lang: "en" });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
