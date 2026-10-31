// Yaratıcı paneli (docs/history/293-*): /insights. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — sayıların DOĞRULUĞU (kim neyi sayar, dönem sınırı,
// yazar/misafir/silinmiş dışlama) sunucu kuralıdır ve supabase/tests/creator-insights.sql'dedir. Burada yalnız istemci davranışı sınanır:
// dört RPC'nin dönemle çağrılması, sayı/yüzde biçimi, grafik/liste/tepki dağılımı, dönem değişimi + önbellek, boş/hata durumu, iki dil, giriş kapısı, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const BASE = "http://localhost:4195/promptly";
const server = await serve(4195);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const pid = (i) => `b1000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const todayUtc = () => new Date(Date.now()).toISOString().slice(0, 10);
const dayList = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400_000).toISOString().slice(0, 10));
// 30 günlük örnek seri: 16. gün zirve (78 kopyalama).
const COPIES = [12, 14, 11, 16, 18, 15, 22, 20, 19, 24, 28, 26, 23, 30, 34, 52, 78, 64, 48, 41, 38, 44, 40, 36, 42, 47, 45, 51, 49, 56];
const dailyRows = (n) => dayList(n).map((day, i) => ({ day, copies: COPIES[i % COPIES.length], reactions: Math.round(COPIES[i % COPIES.length] * 0.45), comments: i % 4 }));
const SUMMARY = { copies: 1284, prev_copies: 1035, reactions: 612, prev_reactions: 561, comments: 87, prev_comments: 91, saves: 203, prev_saves: 155, followers: 58, prev_followers: 0 };
const TOP = [
  { id: pid(1), title: "Neon yağmurlu Tokyo sokağı", content_type: "image", tools: ["midjourney"], copies: 412, reactions: 189, prev_copies: 221 },
  { id: pid(2), title: "Ürün açıklaması yazarı", content_type: "text", tools: [], copies: 197, reactions: 64, prev_copies: 140 },
  { id: pid(3), title: "Lo-fi çalışma müziği tarifi", content_type: "audio", tools: [], copies: 95, reactions: 52, prev_copies: 0 },
  { id: pid(4), title: "Minimal logo seti (v2)", content_type: "image", tools: ["gpt-image"], copies: 90, reactions: 77, prev_copies: 98 },
];
const MIX = [{ reaction: "love", n: 214 }, { reaction: "fire", n: 167 }, { reaction: "wow", n: 105 }, { reaction: "idea", n: 20 }];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  // calls: her RPC'nin aldığı gövdeler; fail: ad → true ise 500 döner; empty: hepsi sıfır/boş.
  const state = { calls: { summary: [], daily: [], top: [], mix: [] }, fail: {}, empty: false };
  db.rpc.creator_insights_summary = (body) => {
    state.calls.summary.push(body);
    if (state.fail.summary) return { status: 500, body: { message: "boom" } };
    return { body: [state.empty ? Object.fromEntries(Object.keys(SUMMARY).map((k) => [k, 0])) : SUMMARY] };
  };
  db.rpc.creator_insights_daily = (body) => {
    state.calls.daily.push(body);
    const rows = dailyRows(body.p_days);
    return { body: state.empty ? rows.map((r) => ({ ...r, copies: 0, reactions: 0, comments: 0 })) : rows };
  };
  db.rpc.creator_insights_top = (body) => { state.calls.top.push(body); return { body: state.empty ? [] : TOP }; };
  db.rpc.creator_insights_reaction_mix = (body) => { state.calls.mix.push(body); return { body: state.empty ? [] : MIX }; };
  setup?.({ db, state });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ins-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const ready = (page) => page.getByRole("heading", { name: "Günlük trend" }).or(page.getByRole("heading", { name: "Daily trend" })).first().waitFor();
const tile = (page, label) => page.locator("div.shadow-card", { has: page.getByText(label, { exact: true }) }).first();

await scenario("1. Dört RPC 30 günle çağrılır; kartlar tr biçimiyle (1.284, ▲ %24, ● Yeni, ▼ %4) ve önceki döneme göre metniyle çizilir", async ({ page, state }) => {
  await page.goto(`${BASE}/insights/`);
  await page.getByRole("heading", { level: 1, name: "Yaratıcı paneli" }).waitFor();
  await ready(page);
  assert.deepEqual(state.calls.summary, [{ p_days: 30 }]);
  assert.deepEqual(state.calls.daily, [{ p_days: 30 }]);
  assert.deepEqual(state.calls.top, [{ p_days: 30, p_limit: 5 }]);
  assert.deepEqual(state.calls.mix, [{ p_days: 30 }]);
  const copies = tile(page, "Kopyalama");
  assert.match(await copies.innerText(), /1\.284/);
  assert.match(await copies.innerText(), /▲ %24/);
  assert.match(await copies.innerText(), /önceki 30 güne göre/);
  assert.match(await tile(page, "Yorum").innerText(), /▼ %4/);
  assert.match(await tile(page, "Yeni takipçi").innerText(), /● Yeni/, "önceki dönem 0 iken yüzde değil 'Yeni'");
  assert.equal(await tile(page, "Tepki").locator("[aria-label^='Önceki döneme göre']").getAttribute("aria-label"), "Önceki döneme göre %9 arttı");
  await shot(page, "insights-desktop");
});

await scenario("2. Grafik: zirve günü balonla ve erişilebilir adla söylenir; iki çizgi çizilir", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  const svg = page.locator("svg[role='img']").first();
  const label = (await svg.getAttribute("aria-label")) ?? "";
  assert.match(label, /Son 30 günün günlük kopyalama ve tepki sayısı\. En yüksek gün .+: 78 kopyalama\./);
  assert.equal(await svg.locator("polyline").count(), 2);
  await svg.getByText("78 kopyalama").waitFor();
  assert.ok((await svg.locator("polygon").getAttribute("points"))?.length > 20);
});

await scenario("3. En çok kopyalananlar: sıra, başlık, tür · araç, sayılar, önceki döneme göre; satır promptun sayfasına gider", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  const rows = page.locator("ol > li");
  assert.equal(await rows.count(), 4);
  const first = rows.first();
  assert.match(await first.innerText(), /Neon yağmurlu Tokyo sokağı/);
  assert.match(await first.innerText(), /Görsel · Midjourney/);
  assert.match(await first.innerText(), /412/);
  assert.match(await first.innerText(), /▲ %86/);
  assert.match(await rows.nth(2).innerText(), /Yeni/, "önceki dönemde 0 kopyalama = Yeni");
  assert.match(await rows.nth(3).innerText(), /▼ %8/);
  assert.match((await first.getByRole("link").getAttribute("href")) ?? "", /\/prompts\/local\/?\?id=b1000000-0000-4000-8000-000000000001$/);
});

await scenario("4. Tepki dağılımı: toplam, çok→az sıra, her satırda tepki adı + sayı; bilinmeyen tepki atılır", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  const mix = page.locator("section", { has: page.getByRole("heading", { name: "Tepki dağılımı" }) });
  await mix.getByText("Son 30 günde aldığın 506 tepki").waitFor();
  const items = mix.locator("li");
  assert.equal(await items.count(), 4);
  assert.match(await items.nth(0).innerText(), /Sevdim[\s\S]*214/);
  assert.match(await items.nth(1).innerText(), /Ateş[\s\S]*167/);
  assert.match(await items.nth(3).innerText(), /Faydalı[\s\S]*20/);
});

await scenario("5. Dönem menüsü: 7 güne geçince dört RPC p_days=7 ile yenilenir; 30'a dönünce (3 dk önbellek) yeniden çağrı YOK", async ({ page, state }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  const trigger = page.locator("button[aria-haspopup]", { hasText: "Son 30 gün" });
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Son 7 gün" }).or(page.getByRole("menuitem", { name: "Son 7 gün" })).or(page.getByText("Son 7 gün", { exact: true })).first().click();
  await page.locator("button[aria-haspopup]", { hasText: "Son 7 gün" }).waitFor();
  await page.waitForFunction(() => document.querySelector("svg[role='img']")?.getAttribute("aria-label")?.includes("Son 7 günün"));
  assert.deepEqual(state.calls.summary.map((c) => c.p_days), [30, 7]);
  assert.match(await tile(page, "Kopyalama").innerText(), /önceki 7 güne göre/);
  await page.locator("button[aria-haspopup]", { hasText: "Son 7 gün" }).click();
  await page.getByText("Son 30 gün", { exact: true }).first().click();
  await page.locator("button[aria-haspopup]", { hasText: "Son 30 gün" }).waitFor();
  await page.waitForFunction(() => document.querySelector("svg[role='img']")?.getAttribute("aria-label")?.includes("Son 30 günün"));
  assert.deepEqual(state.calls.summary.map((c) => c.p_days), [30, 7], "30 gün önbellekten döndü");
});

await scenario("6. Hiç etkileşim yok: tek boş durum (Prompt oluştur → /create), kart/grafik/liste çizilmez", async ({ page, state }) => {
  state.empty = true;
  await page.goto(`${BASE}/insights/`);
  await page.getByText("Henüz gösterilecek veri yok").waitFor();
  const link = page.getByRole("link", { name: "Prompt oluştur" });
  assert.match((await link.getAttribute("href")) ?? "", /\/create\/?$/);
  assert.equal(await page.getByRole("heading", { name: "Günlük trend" }).count(), 0);
  assert.equal(await page.locator("svg[role='img']").count(), 0);
});

await scenario("7. Hata: RPC 500 → uyarı + 'Tekrar dene'; tekrar deneyince veri gelir (0 yazan sahte sayı yok)", async ({ page, state }) => {
  state.fail.summary = true;
  await page.goto(`${BASE}/insights/`);
  const alert = page.locator("[role=alert]", { hasText: "Panel yüklenemedi" });
  await alert.getByText("Panel yüklenemedi. Bağlantını kontrol edip tekrar dene.").waitFor();
  assert.equal(await tile(page, "Kopyalama").count(), 0, "hata varken sayı kartı yok");
  state.fail.summary = false;
  await alert.getByRole("button", { name: "Tekrar dene" }).click();
  await ready(page);
  assert.match(await tile(page, "Kopyalama").innerText(), /1\.284/);
  assert.equal(await page.getByText("Panel yüklenemedi").count(), 0, "hata mesajı kalktı");
});

await scenario("8. İngilizce: başlık, kartlar, yüzde biçimi (▲ 24%), balon, not; sayı biçimi 1,284", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await page.getByRole("heading", { level: 1, name: "Creator insights" }).waitFor();
  await page.getByRole("heading", { name: "Daily trend" }).waitFor();
  const copies = tile(page, "Copies");
  assert.match(await copies.innerText(), /1,284/);
  assert.match(await copies.innerText(), /▲ 24%/);
  assert.match(await copies.innerText(), /vs the previous 30 days/);
  await page.getByRole("heading", { name: "Most copied" }).waitFor();
  await page.getByRole("heading", { name: "Reaction mix" }).waitFor();
  await page.getByText("How are these numbers counted?").waitFor();
  assert.match((await page.locator("svg[role='img']").first().getAttribute("aria-label")) ?? "", /Daily copies and reactions over the last 30 days/);
  await page.locator("svg[role='img']").first().getByText("78 copies").waitFor();
}, { lang: "en" });

await scenario("9. Telefon: yatay taşma yok; kopyalama kartı tam genişlik; liste satırında tepki meta satırında; grafik yazıları okunur boyda", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  assert.equal(await overflowFree(page), true);
  const a = await tile(page, "Kopyalama").boundingBox();
  const b = await tile(page, "Tepki").boundingBox();
  assert.ok(a.width > b.width * 1.8, `Kopyalama kartı tam genişlik (${a.width} vs ${b.width})`);
  assert.match(await page.locator("ol > li").first().innerText(), /189 tepki/);
  const fontPx = await page.locator("svg[role='img'] text").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(fontPx >= 11, `eksen yazısı ≥ 11px (${fontPx})`);
  const svgW = (await page.locator("svg[role='img']").first().boundingBox()).width;
  assert.ok(svgW <= 390, `grafik ekrana sığar (${svgW})`);
  await shot(page, "insights-mobile");
}, { viewport: { width: 390, height: 844 } });

await scenario("10. Tablet ve koyu tema: taşma yok", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("promptly-theme", "dark"));
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  assert.equal(await overflowFree(page), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
}, { viewport: { width: 820, height: 1000 } });

await scenario("11. Kenar çubuğunda 'Yaratıcı paneli' bağlantısı var ve bu sayfada seçili", async ({ page }) => {
  await page.goto(`${BASE}/insights/`);
  await ready(page);
  const link = page.locator("aside a[href*='/insights']").first();
  await link.waitFor();
  assert.match((await link.innerText()) ?? "", /Yaratıcı paneli/);
});

await scenario("12. Ziyaretçi: giriş sayfasına yönlenir, hiçbir RPC çağrılmaz", async ({ page, state }) => {
  await page.goto(`${BASE}/insights/`);
  await page.waitForURL(/\/login/);
  assert.equal(state.calls.summary.length + state.calls.daily.length + state.calls.top.length + state.calls.mix.length, 0);
}, { guest: true });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
