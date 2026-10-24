// Güvenlik/sosyal mantık sertleştirmesi arayüzü (docs/history/224-*): veritabanı hata kodlarının (hız sınırı, engel, kendi beğenisi) kullanıcı dilinde
// toast olarak görünmesi, örnek (demo) hesap rozeti, görselsiz prompt kartının yeni yüzeyi. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (kurallar: supabase/tests/safety-hardening.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { installDetailData, PAGES } from "./detail-fixtures.mjs";

const PORT = 4201;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, context, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/safety-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
    delete U.carol.is_demo;
  }
}

/** Beğeni isteğini verilen veritabanı hata koduyla reddettirir. */
const failLikes = (context, message) =>
  context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return json(route, { code: "P0001", message, details: null, hint: null }, 400);
  });
const likeButton = (page) => page.locator("button[aria-label^='Beğen'], button[aria-label^='Like']").first();
const toast = (page) => page.locator("[role='status']").filter({ hasText: /\S/ });

for (const [code, tr, en] of [
  ["rate_limit", "Çok hızlı işlem yapıyorsun", "You're doing that too fast"],
  ["interaction_blocked", "Bu kişiyle etkileşime giremezsin", "You can't interact with this person"],
  ["self_like_not_allowed", "Kendi içeriğini beğenemezsin", "You can't like your own content"],
]) {
  await scenario(`1. ${code}: ham kod değil, Türkçe cümle toast olarak görünür`, async ({ page, context }) => {
    await failLikes(context, code);
    await page.goto(`${BASE}${PAGES.prompt}`);
    await likeButton(page).waitFor();
    await likeButton(page).click();
    await toast(page).first().waitFor();
    const text = (await toast(page).allTextContents()).join(" ");
    assert.ok(text.includes(tr), `toast: ${text}`);
    assert.ok(!text.includes(code), "raw code is not shown");
  });
  await scenario(`2. ${code}: İngilizce`, async ({ page, context }) => {
    await failLikes(context, code);
    await page.goto(`${BASE}${PAGES.prompt}`);
    await likeButton(page).waitFor();
    await likeButton(page).click();
    await toast(page).first().waitFor();
    assert.ok((await toast(page).allTextContents()).join(" ").includes(en));
  }, { lang: "en" });
}

await scenario("3. Bilinmeyen hata kodu çevrilmez / toast çıkmaz (yalnız bilinen kodlar)", async ({ page, context }) => {
  await failLikes(context, "some_other_error");
  await page.goto(`${BASE}${PAGES.prompt}`);
  await likeButton(page).waitFor();
  await likeButton(page).click();
  await page.waitForTimeout(800);
  const text = (await toast(page).allTextContents()).join(" ");
  assert.ok(!/hızlı|etkileşime|beğenemezsin/.test(text), text);
});

await scenario("4. Örnek hesap rozeti: demo profilde görünür, gerçek profilde yok", async ({ page }) => {
  U.carol.is_demo = true;
  await page.goto(`${BASE}/profile/real?username=carol`);
  await page.locator("[data-demo-badge]").first().waitFor();
  assert.match(await page.locator("[data-demo-badge]").first().textContent(), /Örnek hesap/);
  await page.goto(`${BASE}/profile/real?username=bobby`);
  await page.getByText("@bobby").first().waitFor();
  assert.equal(await page.locator("[data-demo-badge]").count(), 0, "no badge on a real account");
});

await scenario("5. Örnek hesap rozeti: İngilizce", async ({ page }) => {
  U.carol.is_demo = true;
  await page.goto(`${BASE}/profile/real?username=carol`);
  await page.locator("[data-demo-badge]").first().waitFor();
  assert.match(await page.locator("[data-demo-badge]").first().textContent(), /Sample account/);
}, { lang: "en" });

await scenario("6. Yorum kutusu 2000 karakterle sınırlı", async ({ page }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  const input = page.getByPlaceholder(/Yorum yaz|yorum/i).first();
  await input.waitFor();
  assert.equal(await input.getAttribute("maxlength"), "2000");
});

await scenario("7. Migration henüz yok: is_demo sütunu canlıda olmasa da profil sayfası açılır (istek sütunsuz yeniden denenir, sonrakiler baştan sütunsuz)", async ({ page, context }) => {
  const selects = [];
  await context.route(/\/rest\/v1\/profiles\?/, (route) => {
    const select = new URL(route.request().url()).searchParams.get("select") ?? "";
    selects.push(select);
    if (select.includes("is_demo")) return json(route, { code: "42703", message: "column profiles.is_demo does not exist", details: null, hint: null }, 400);
    return route.fallback();
  });
  await page.goto(`${BASE}/profile/real?username=carol`);
  await page.getByText("@carol").first().waitFor();
  assert.equal(await page.getByText("Profil bulunamadı").count(), 0, "profile page did not break");
  assert.equal(await page.locator("[data-demo-badge]").count(), 0, "no badge without the column");
  const withColumn = selects.filter((x) => x.includes("is_demo")).length;
  // Eşzamanlı ilk istekler sütunlu gidebilir (hata henüz öğrenilmemiş); sonra gelenler sütunsuz olmalı.
  assert.ok(withColumn >= 1 && withColumn <= 3, `only the first, concurrent selects carry the column (saw ${withColumn})`);
  assert.ok(!selects.at(-1).includes("is_demo"), "later selects omit the column");
  assert.ok(selects.some((x) => x.length > 0 && !x.includes("is_demo")), "retried without the column");
});

console.log(results.map(([s, n]) => `${s === "PASS" ? "✓" : "✗"} ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL");
failed.forEach(([, n]) => console.log(n));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
