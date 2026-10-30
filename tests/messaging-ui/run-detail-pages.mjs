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

// 1 — her tür aynı iskeleti kullanır (Albüm, docs/history/201-*): bantta tür etiketi + başlık + yazar satırı; altında eylem satırı
// (Takip Et + ⋮ dahil), "Hakkında"da meta kartı, yorumlar
for (const kind of ["prompt", "request", "workflow", "preset"]) {
  await scenario(`1. ${kind}: ortak iskelet — başlık, yazar satırı + Takip Et, etkileşim çubuğu, meta kartı (araç + etiketler), yorumlar`, kind, async ({ page }) => {
    await page.getByRole("button", { name: "Takip Et" }).first().waitFor();
    const byline = await page.locator("[data-detail-band] [data-detail-author]").textContent();
    assert.match(byline ?? "", /Carol/);
    const bar = page.locator("[data-detail-actions]").filter({ has: page.getByRole("button", { name: "Paylaş" }) }).first();
    await bar.waitFor();
    const meta = page.getByTestId("detail-meta");
    await meta.waitFor();
    assert.ok((await meta.getByRole("link", { name: "Marka" }).count()) === 1, "tag chips live inside the meta card");
    assert.ok((await meta.getByText(/Tavsiye edilen araç\/model|Tercih edilen araç\/model/).count()) === 1, "tool label inside the meta card");
    await page.locator("#comments").waitFor();
    assert.match((await page.locator("#comments h2").first().textContent()) ?? "", /Yorumlar/);
    // Takip Et bantta, yazar adının hemen sonunda; ⋮ bandın sağ üst köşesinde; İstatistik · Paylaş eylem satırının en sağında
    const follow = await box(page.locator("[data-detail-band]").getByRole("button", { name: "Takip Et" }));
    const author = await box(page.locator("[data-detail-band] [data-detail-author]"));
    assert.ok(follow.left >= author.right - 1 && Math.abs((follow.top + follow.bottom) / 2 - (author.top + author.bottom) / 2) <= 6, "Takip Et right after the author's name, on its line");
    const band = await box(page.locator("[data-detail-band]"));
    const menu = await box(page.locator("[data-detail-menu]"));
    assert.ok(menu.top - band.top <= 24 && band.right - menu.right <= 24, "⋮ sits in the band's top-right corner");
    const share = await box(bar.getByRole("button", { name: "Paylaş" }));
    const stats = await box(bar.getByRole("button", { name: /İstatistik/ }).first());
    const like = await box(bar.getByRole("button", { name: /Beğen|Tepki/ }).first());
    assert.ok(share.left >= stats.right - 1 && stats.left > like.right + 40, "İstatistik · Paylaş on the far right");
    assert.equal(await page.locator("[data-detail-actions]").getByRole("button", { name: "Promptu Kopyala" }).count(), 0, "no big copy button in the actions row");
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
await scenario("2b. prompt: Kopyala | Çalıştır · Studio'da aç prompt bloğunun altında; 'Düzenleme öner' ve 'İlişki haritası' ⋮ menüsünde / Hakkında kartında (docs/history/278-*); araç adı çift yazılmaz", "prompt", async ({ page }) => {
  const card = page.locator("section#prompt-text");
  await card.waitFor();
  for (const name of [/Kopyala/, /Çalıştır/, /Studio/]) await card.getByRole("button", { name }).or(card.getByRole("link", { name })).first().waitFor();
  const text = await box(card.locator("[data-prompt-block]"));
  const copy = await box(card.getByRole("button", { name: /Kopyala/ }));
  assert.ok(copy.top >= text.bottom - 1, "the prompt actions sit under the prompt text (docs/history/201-*)");
  assert.equal(await card.getByRole("button", { name: "Düzenleme öner" }).count(), 0, "'Düzenleme öner' no longer sits in the prompt block");
  assert.equal(await card.getByRole("link", { name: /Studio/ }).count(), 1, "Studio'da aç stays beside the pill");
  await page.getByRole("button", { name: /Gönderi seçenekleri|Post options/ }).first().click();
  await page.getByRole("menuitem", { name: "Düzenleme öner" }).waitFor();
  await page.getByRole("menuitem", { name: "İlişki haritasını aç" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("detail-meta").getByRole("link", { name: "İlişki haritasını aç" }).waitFor();
  const meta = (await page.getByTestId("detail-meta").textContent()) ?? "";
  assert.match(meta, /GPT Image 1/);
  assert.ok(!/GPT Image GPT Image/.test(meta), "model name is not prefixed with the tool name twice");
});
await scenario("2c. prompt: çıktı görseli bantta kendi oranında, kırpılmadan; telefonda en çok 240px yükseklik, sayfaya sığar", "prompt", async ({ page }) => {
  const art = page.locator("[data-detail-band] figure button").first();
  await art.waitFor();
  const b = await box(art);
  const h = await art.evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(h <= 241 && h >= 150, `art height on phones (${h})`);
  assert.ok(b.width <= 390 - 31, `art fits the page (${b.width})`);
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

// 4 — yerleşim (Albüm, docs/history/201-*): taşma yok; bant içeriğin üstünde; lg+ (≥1024px) "Hakkında" içeriğin sağında,
// daha dar ekranda altında; tek eylem satırı; birincil düğme (Kopyala/Yanıtla/Çalıştır/Studio'da aç) bandın hemen altında
for (const [label, width, height] of [["320", 320, 700], ["375", 375, 800], ["390", 390, 844], ["430", 430, 900], ["768", 768, 1000], ["1024", 1024, 900], ["1280", 1280, 900], ["1440", 1440, 1000]]) {
  for (const kind of ["prompt", "request", "workflow", "preset"]) {
    await scenario(`4. ${kind} @${label}px: yatay taşma yok; "Hakkında" ${width >= 1024 ? "sağda" : "altta"}`, kind, async ({ page }) => {
      await page.waitForTimeout(500);
      assert.equal(await overflowFree(page), true, "no horizontal overflow");
      const band = await box(page.locator("[data-detail-band]"));
      const article = await box(page.locator("article").first());
      const aside = await box(page.locator("[data-detail-aside]"));
      assert.ok(band.bottom <= article.top, "band above the content");
      assert.equal(await page.locator("[data-detail-actions]").count(), 1, "one actions row");
      if (width >= 1024) assert.ok(article.right <= aside.left, "Hakkında right of the content");
      else assert.ok(aside.top >= article.bottom, "Hakkında under the content");
      // Bandın içeriği taşmaz: kapak başlığın üstüne binmez
      const art = page.locator("[data-detail-band] figure").first();
      if (await art.count()) {
        const artBox = await box(art);
        const title = await box(page.locator("[data-detail-band] h1"));
        const overlaps = artBox.right > title.left + 1 && artBox.left < title.right - 1 && artBox.bottom > title.top + 1 && artBox.top < title.bottom - 1;
        assert.ok(!overlaps, "art does not overlap the title");
      }
    }, { viewport: { width, height } });
  }
}
await scenario("4b. mobil: sabitlenen eylem satırı sayfa sonundaki içeriği örtmez (son içerik satırın üstünde bitebilir)", "prompt", async ({ page }) => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const dock = await box(page.locator("[data-detail-dock]"));
  const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll("main *")].filter((el) => el.childElementCount === 0 && !el.closest("[data-detail-dock]") && el.getClientRects().length > 0).map((el) => el.getBoundingClientRect().bottom)));
  assert.ok(lowest <= dock.top + 1, `content ends above the pinned actions row (${lowest} vs ${dock.top})`);
}, { viewport: { width: 390, height: 844 } });

// 4c — kaydırınca üst menü kaybolur; alt menü ve eylem satırı yerinde, tam opak kalır (docs/history/214-*); yukarı kaydırınca üst menü döner
await scenario("4c. mobil: aşağı kaydırınca üst menü kaybolur, alt menü + eylem satırı yerinde ve TAM opak kalır; yukarı kaydırınca üst menü geri gelir", "prompt", async ({ page }) => {
  await page.waitForTimeout(1200);
  const nav = page.locator("[data-app-nav]");
  const header = page.locator("[data-app-header]");
  assert.equal(await page.locator("[data-detail-dock]").count(), 0, "not pinned at the top of the page");
  const commentsTop = await page.evaluate(() => document.querySelector("#comments").getBoundingClientRect().top + scrollY);
  for (let i = 0; i < 10; i += 1) { await page.evaluate(() => window.scrollBy(0, 120)); await page.waitForTimeout(50); }
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.querySelector("#comments").getBoundingClientRect().top + scrollY), commentsTop, "pinning does not shift the page");
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-chrome-hidden")), true, "bars react while scrolling down");
  const navBox = await box(nav);
  const headerBox = await box(header);
  assert.ok(headerBox.bottom <= 1, `header slid up (${headerBox.bottom})`);
  assert.ok(navBox.bottom >= 843, `nav stays in place (${navBox.bottom})`);
  assert.equal(await nav.evaluate((el) => getComputedStyle(el).opacity), "1", "nav stays opaque");
  assert.notEqual(await nav.evaluate((el) => getComputedStyle(el).pointerEvents), "none", "nav stays tappable");
  const dockEl = page.locator("[data-detail-dock]");
  const dock = await box(dockEl);
  assert.ok(Math.abs(dock.bottom - navBox.top) <= 1, `pinned row stays right above the nav (${dock.bottom} vs ${navBox.top})`);
  assert.equal(await dockEl.evaluate((el) => getComputedStyle(el).opacity), "1", "pinned row stays opaque");

  await page.evaluate(() => window.scrollBy(0, -60));
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-chrome-hidden")), false, "bars back on the way up");
  const navBack = await box(nav);
  const dockBack = await box(dockEl);
  assert.ok(Math.abs(dockBack.bottom - navBack.top) <= 1, `pinned row rides right above the nav (${dockBack.bottom} vs ${navBack.top})`);
  assert.equal(await nav.evaluate((el) => getComputedStyle(el).opacity), "1", "nav still opaque");
  assert.equal(await dockEl.evaluate((el) => getComputedStyle(el).opacity), "1", "pinned row still opaque");
  assert.ok((await box(header)).top >= -1, "header back");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-detail-dock]").count(), 0, "back in place at the top");
  assert.ok((await box(page.locator("[data-detail-actions]").first())).top > (await box(page.locator("[data-detail-band]"))).bottom - 1, "actions row under the band again");
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
