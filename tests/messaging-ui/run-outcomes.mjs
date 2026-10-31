// "Çalıştı mı?" geri bildirimi + kullanım hakkı (docs/history/296-*): prompt detay sayfası. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ —
// kuralların (kopyalamadan oy yok, kendi promptuna oy yok, engel, hız sınırı, toplama) doğrulaması supabase/tests/prompt-outcomes.sql'dedir.
// Burada yalnız istemci davranışı sınanır: özet/yüzde/araç dökümü, 3 oydan az durumu, iki adımlı cevap ve RPC gövdesi, kopyalama sonrası kartın belirmesi,
// kopyalamamış/ziyaretçi/İngilizce, lisans satırı + atıf satırlı kopyalama, mobil taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { installDetailData, PAGES } from "./detail-fixtures.mjs";

const PORT = 4210;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

// 38 cevap: 28 çalıştı · 6 kısmen · 4 olmadı → %74 / %16 / %10 (en büyük kalan yöntemi, toplam 100).
const STATS = [
  { tool: "GPT Image 1", tool_version: "v1.5", worked: 17, partial: 3, failed: 1 },
  { tool: "GPT Image 1", tool_version: "", worked: 4, partial: 0, failed: 0 },
  { tool: "Flux", tool_version: "", worked: 7, partial: 3, failed: 3 },
];
const FEW = [{ tool: "", tool_version: "", worked: 1, partial: 1, failed: 0 }];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, copied = true, stats = STATS, mine = [], prompt = {} } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { calls: [], copyCalls: 0, copied, stats: [...stats], mine: [...mine] };
  db.rpc.prompt_outcome_stats = () => ({ body: state.stats });
  db.rpc.has_copied_prompt = () => ({ body: state.copied });
  db.rpc.record_prompt_copy = () => { state.copyCalls += 1; state.copied = true; return { body: true }; };
  db.rpc.set_prompt_outcome = (body) => {
    state.calls.push(body);
    if (body.p_outcome === null) state.mine = state.mine.filter((m) => m.tool !== body.p_tool);
    else {
      state.mine = [...state.mine.filter((m) => m.tool !== body.p_tool), { outcome: body.p_outcome, tool: body.p_tool, tool_version: body.p_tool_version }];
      state.stats = [...state.stats, { tool: body.p_tool, tool_version: body.p_tool_version, worked: body.p_outcome === "worked" ? 1 : 0, partial: body.p_outcome === "partial" ? 1 : 0, failed: body.p_outcome === "failed" ? 1 : 0 }];
    }
    return { body: body.p_outcome };
  };
  db.extraRoutes = async (ctx) => (ctx.table === "prompt_outcomes" ? ctx.rows(state.mine) : null);
  const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
  await installMock(context, db, guest ? { guest: true } : {});
  await installDetailData(context, { prompts: prompt });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${BASE}${PAGES.prompt}`, { waitUntil: "networkidle" });
    await fn(page, state);
    assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, e.message.split("\n")[0]]);
  } finally {
    await context.close();
  }
}

const section = (page) => page.getByTestId("prompt-outcome");

await scenario("1 özet: yüzdeler, bar ve araç dökümü", async (page) => {
  const box = section(page);
  await box.waitFor();
  const text = await box.innerText();
  assert.match(text, /38 kişi denedi/);
  assert.match(text, /%74 çalıştı/);
  assert.match(text, /%16 kısmen/);
  assert.match(text, /%10 olmadı/);
  assert.match(text, /GPT Image 1 · v1\.5/);
  assert.match(text, /Flux/);
  const aria = await box.getByRole("img").first().getAttribute("aria-label");
  assert.equal(aria, "Çalıştı %74, kısmen %16, olmadı %10");
});

await scenario("2 üçten az cevapta yüzde yok", async (page) => {
  const box = section(page);
  await box.waitFor();
  const text = await box.innerText();
  assert.match(text, /2 kişi denedi/);
  assert.match(text, /Henüz yeterli deneme yok/);
  assert.doesNotMatch(text, /%\d+ çalıştı/);
}, { stats: FEW });

await scenario("3 iki adımlı cevap: Çalıştı → araç + sürüm → Gönder", async (page, state) => {
  const box = section(page);
  await box.getByTestId("outcome-ask").waitFor();
  assert.equal(await box.getByTestId("outcome-step2").count(), 0);
  await box.getByRole("button", { name: "Çalıştı", exact: true }).click();
  await box.getByTestId("outcome-step2").waitFor();
  // Önerilen araç (katalog adı) ilk çip olarak seçili gelir.
  const chip = box.getByRole("button", { name: /GPT Image/ }).first();
  assert.equal(await chip.getAttribute("aria-pressed"), "true");
  await box.getByLabel("Sürüm (isteğe bağlı)").fill("v1.5");
  await box.getByRole("button", { name: "Gönder" }).click();
  await box.getByText("Kaydedildi, teşekkürler.").waitFor();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].p_outcome, "worked");
  assert.equal(state.calls[0].p_tool_version, "v1.5");
  assert.ok(state.calls[0].p_tool.length > 0);
  assert.equal(await box.getByTestId("outcome-step2").count(), 0);
  // Özet yeniden okundu: artık 39 kişi.
  await box.getByText("39 kişi denedi").waitFor();
});

await scenario("4 'Diğer' araç adı yazılır; boşken Gönder kapalı", async (page, state) => {
  const box = section(page);
  await box.getByRole("button", { name: "Kısmen", exact: true }).click();
  await box.getByRole("button", { name: "Diğer", exact: true }).click();
  const send = box.getByRole("button", { name: "Gönder" });
  assert.equal(await send.isDisabled(), true);
  await box.getByLabel("Araç adı").fill("Ideogram 3");
  assert.equal(await send.isDisabled(), false);
  await send.click();
  await box.getByText("Kaydedildi, teşekkürler.").waitFor();
  assert.equal(state.calls[0].p_tool, "Ideogram 3");
  assert.equal(state.calls[0].p_outcome, "partial");
});

await scenario("5 kendi cevabım görünür, geri alınır", async (page, state) => {
  const box = section(page);
  await box.getByText("Cevabın:").waitFor();
  assert.match(await box.innerText(), /Çalıştı · GPT Image 1 · v1\.5/);
  await box.getByRole("button", { name: "Geri al" }).click();
  await box.getByText("Cevabın:").waitFor({ state: "detached" });
  assert.equal(state.calls[0].p_outcome, null);
  assert.equal(state.calls[0].p_tool, "GPT Image 1");
}, { mine: [{ outcome: "worked", tool: "GPT Image 1", tool_version: "v1.5" }] });

await scenario("6 kopyalamamış kişi ipucu görür, düğme görmez", async (page) => {
  const box = section(page);
  await box.waitFor();
  assert.match(await box.innerText(), /Promptu kopyaladıktan sonra/);
  assert.equal(await box.getByTestId("outcome-ask").count(), 0);
}, { copied: false });

await scenario("7 kopyalayınca 'Denedin mi?' sayfa yenilenmeden belirir", async (page, state) => {
  const box = section(page);
  await box.waitFor();
  assert.equal(await box.getByTestId("outcome-ask").count(), 0);
  await page.getByRole("button", { name: "Kopyala", exact: true }).first().click();
  await box.getByTestId("outcome-ask").waitFor();
  assert.equal(state.copyCalls, 1);
}, { copied: false });

await scenario("8 ziyaretçi özeti görür, soru/ipucu görmez", async (page) => {
  const box = section(page);
  await box.waitFor();
  const text = await box.innerText();
  assert.match(text, /38 kişi denedi/);
  assert.equal(await box.getByTestId("outcome-ask").count(), 0);
  assert.doesNotMatch(text, /Promptu kopyaladıktan sonra/);
}, { guest: true });

await scenario("9 hiç cevap yoksa ziyaretçi bölümü görmez", async (page) => {
  await page.getByText("Prompt metni").first().waitFor();
  assert.equal(await page.getByTestId("prompt-outcome").count(), 0);
}, { guest: true, stats: [] });

await scenario("10 İngilizce etiketler", async (page) => {
  const box = section(page);
  await box.getByRole("button", { name: "It worked", exact: true }).waitFor();
  const text = await box.innerText();
  await page.getByRole("heading", { name: "Did it work?" }).waitFor();
  assert.match(text, /38 people tried it/);
  assert.match(text, /74% worked/);
}, { lang: "en" });

await scenario("11 lisans satırı + atıf satırlı kopyalama (atıfla serbest)", async (page) => {
  const row = page.getByTestId("prompt-license");
  await row.waitFor();
  assert.match(await row.innerText(), /Atıfla serbest/);
  const check = page.getByTestId("copy-with-credit");
  assert.equal(await check.isChecked(), false, "atıf satırı varsayılan KAPALI: kopyalanan metin kendiliğinden kirlenmez");
  await page.getByRole("button", { name: "Kopyala", exact: true }).first().click();
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  assert.doesNotMatch(plain, /Promptly$/);
  await check.check();
  await page.getByRole("button", { name: "Kopyala", exact: true }).first().click();
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: "Kopyala", exact: true }).first().click();
  const credited = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(credited, /\n\n— @carol, Promptly$/);
}, { prompt: { license: "cc-by" } });

await scenario("12 lisans yoksa satır ve onay kutusu yok", async (page) => {
  await page.getByText("Prompt metni").first().waitFor();
  assert.equal(await page.getByTestId("prompt-license").count(), 0);
  assert.equal(await page.getByTestId("copy-with-credit").count(), 0);
}, { prompt: { description: "Kaynak notu olmayan sade bir açıklama." } });

await scenario("12b açık seçim yoksa 'CC BY' kaynak notundan okunur", async (page) => {
  await page.getByTestId("prompt-license").waitFor();
  assert.match(await page.getByTestId("prompt-license").innerText(), /Atıfla serbest/);
});

await scenario("13 CC0 lisansı: satır var, atıf onayı yok", async (page) => {
  await page.getByTestId("prompt-license").waitFor();
  assert.match(await page.getByTestId("prompt-license").innerText(), /Serbest \(CC0\)/);
  assert.equal(await page.getByTestId("copy-with-credit").count(), 0);
}, { prompt: { license: "cc0" } });

await scenario("14 mobilde yatay taşma yok", async (page) => {
  const box = section(page);
  await box.getByTestId("outcome-ask").waitFor();
  await box.getByRole("button", { name: "Olmadı", exact: true }).click();
  await box.getByTestId("outcome-step2").waitFor();
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
