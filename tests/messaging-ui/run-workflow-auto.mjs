// Workflow'u OTOMATİK çalıştırma (docs/history/296-*): "Adım adım" modunun içindeki "Otomatik çalıştır" paneli. Ağ taklitli: sağlayıcı (Gemini) uçları
// `context.route` ile taklit edilir — gerçek bir model/Supabase'e KARŞI DENENMEDİ. Zincirin kuralları (sıra, durma, hata türleri) `lib/workflow-auto-run.test.ts`'te
// birim testlidir; burada istemci davranışı sınanır: panel, plan notu, anahtarın yalnız sağlayıcıya gitmesi, çıktının bağlı sonraki adıma girdi olması,
// durdur/devam/baştan, hata mesajları, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { ID, installDetailData } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4197/promptly";
const server = await serve(4197);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";
const KEY = "AIza-test-key-0123456789";
const RUN_URL = `${BASE}/workflows/local?id=${ID.workflow}&run=1`;

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (i) => `b2000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const sid = (i) => `c2000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const promptRow = (i, title, text, contentType = "text") => ({
  id: pid(i), title, description: "d", prompt_text: text, tool: null, tools: [], content_type: contentType, category: null, subcategory: null, status: "published", origin_type: "original",
  request_id: null, like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-09-20T10:00:00Z", show_on_profile: true, requires_reference_image: false,
  requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.carol), prompt_media: [], prompt_tags: [],
});
/** Step i (1-based) points at prompt i; `from` wires an input to step `from`'s output. */
const stepRow = (i, title, from) => ({
  id: sid(i), position: i - 1, title, description: "", instructions: "", step_type: "prompt", prompt_id: pid(i), request_id: null,
  inputs: from ? [{ id: `in${i}`, label: i === 2 ? "Slogan" : `Girdi ${i}`, source: { stepId: sid(from), outputId: `out${from}` } }] : [],
  outputs: [{ id: `out${i}`, label: `Çıktı ${i}` }],
});

// 3 adım: metin → metin → GÖRSEL (otomatik çalışmaz).
const THREE = {
  prompts: [promptRow(1, "Fikir yaz", "Bir ürün için kısa bir slogan fikri yaz."), promptRow(2, "Sloganı parlat", "Sloganı daha çarpıcı yap."), promptRow(3, "Görsel", "Slogandan afiş çiz.", "image")],
  steps: [stepRow(1, "Fikir", null), stepRow(2, "Parlat", 1), stepRow(3, "Afiş", 2)],
};
// 4 adım: metin → metin → GÖRSEL (elle) → metin (3. adımın çıktısını girdi olarak alır).
const FOUR = {
  prompts: [...THREE.prompts, promptRow(4, "Açıklama", "Afişe kısa bir açıklama yaz.")],
  steps: [stepRow(1, "Fikir", null), stepRow(2, "Parlat", 1), stepRow(3, "Afiş", 2), { ...stepRow(4, "Açıklama", 3), inputs: [{ id: "in4", label: "Afiş notu", source: { stepId: sid(3), outputId: "out3" } }] }],
};

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", data = THREE, variables = null } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  // Adımlar + prompt'lar + (varsa) değişkenler: sonradan kaydedilen rota önce cevap verir.
  await context.route("https://example.supabase.co/rest/v1/workflow_steps**", (route) => route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data.steps) }) : route.fallback());
  await context.route("https://example.supabase.co/rest/v1/prompts?**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const idParam = new URL(route.request().url()).searchParams.get("id") ?? "";
    const ids = idParam.match(/b2000000-0000-4000-8000-\d{12}/g);
    if (!ids) return route.fallback();
    const list = data.prompts.filter((p) => ids.includes(p.id));
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route("https://example.supabase.co/rest/v1/prompt_variables**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(variables ?? []) }));

  // Sağlayıcı taklidi: her POST bir kayıt; yanıt "ÇIKTI:" + istemin ilk satırı. mode: ok | quota | slow.
  const gemini = { mode: "ok", posts: [] };
  const supabaseSeen = [];
  context.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("https://example.supabase.co") || url.startsWith("http://localhost")) supabaseSeen.push(`${url}\n${request.postData() ?? ""}\n${JSON.stringify(request.headers())}`);
  });
  await context.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "GET" && url.includes("/models")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }] }) });
    const body = JSON.parse(request.postData() ?? "{}");
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
    gemini.posts.push({ url, key: request.headers()["x-goog-api-key"], prompt });
    if (gemini.mode === "slow") await new Promise((resolve) => setTimeout(resolve, 2500));
    if (gemini.mode === "quota") return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { message: "quota exceeded" } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: `ÇIKTI:${prompt.split("\n")[0].slice(0, 22)}` }] } }] }) });
  });

  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); sessionStorage.clear(); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(RUN_URL);
    await page.locator("[data-auto-run]").waitFor();
    await fn({ page, gemini, supabaseSeen });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/wa-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const panel = (page) => page.locator("[data-auto-run]");
const openPanel = async (page) => { await panel(page).locator("button[aria-expanded]").first().click(); await page.locator("#workflow-auto-key").waitFor(); };
const fillKey = (page) => page.locator("#workflow-auto-key").fill(KEY);
const statusItems = (page, kind) => page.locator(`[data-auto-status] li[data-status='${kind}']`);
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const progressNow = (page) => page.getByRole("progressbar").first().getAttribute("aria-valuenow");

await scenario("1. Panel kapalı gelir; açılınca plan notu '2 model çağrısı' ve 3. adımda (görsel) duracağını söyler", async ({ page }) => {
  assert.equal(await page.locator("#workflow-auto-key").count(), 0, "kapalıyken form yok");
  await openPanel(page);
  await panel(page).getByText("2 model çağrısı yapılacak.").waitFor();
  await panel(page).getByText(/Zincir 3\. adımda duracak \(metin dışı adım otomatik çalışmaz\)/).waitFor();
  await panel(page).getByText(/Anahtar Promptly'ye gönderilmez/).waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/auto-run-open.png`, fullPage: true });
});

await scenario("2. Anahtar yokken 'Çalıştır' kapalı ve 'Önce API anahtarını gir.' yazar; anahtar girilince açılır", async ({ page, gemini }) => {
  await openPanel(page);
  const run = panel(page).getByRole("button", { name: "Çalıştır", exact: true });
  assert.equal(await run.isDisabled(), true);
  await panel(page).getByText("Önce API anahtarını gir.").waitFor();
  await fillKey(page);
  assert.equal(await run.isDisabled(), false);
  assert.equal(gemini.posts.length, 0);
});

await scenario("3. Çalıştır: 1. ve 2. adım modele gider, 2. adımın istemine 1. adımın çıktısı 'Slogan:' girdisi olarak eklenir; 3. adımda durur", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.equal(await statusItems(page, "done").count(), 2);
  assert.equal(gemini.posts.length, 2);
  assert.equal(gemini.posts[0].prompt, "Bir ürün için kısa bir slogan fikri yaz.");
  assert.equal(gemini.posts[1].prompt, "Sloganı daha çarpıcı yap.\n\nSlogan:\nÇIKTI:Bir ürün için kısa bir");
  await statusItems(page, "blocked").first().getByText(/Elle yapılmalı: metin dışı adım otomatik çalışmaz/).waitFor();
  assert.equal(await progressNow(page), "2");
  // Sonuç, "Adım adım" modunun AYNI çıktı alanında (elle yapıştırılmış gibi) durur.
  assert.equal(await page.locator("textarea").first().inputValue(), "ÇIKTI:Bir ürün için kısa bir");
  await panel(page).getByRole("button", { name: "Devam et" }).waitFor();
});

await scenario("4. Anahtar yalnız sağlayıcıya gider: Promptly/Supabase isteklerinin hiçbirinde (adres, gövde, başlık) bulunmaz", async ({ page, gemini, supabaseSeen }) => {
  await openPanel(page);
  await fillKey(page);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.ok(gemini.posts.length >= 2);
  assert.ok(gemini.posts.every((post) => post.key === KEY), "anahtar sağlayıcıya başlıkta gider");
  assert.ok(gemini.posts.every((post) => !post.url.includes(KEY)), "anahtar adreste YOK");
  assert.equal(supabaseSeen.filter((line) => line.includes(KEY)).length, 0, "anahtar Promptly/Supabase isteklerinde YOK");
});

await scenario("5. Sağlayıcı kota hatası: ilk adım 'Hata' + çevrilmiş mesaj, sonraki adım çağrılmaz; sorun giderilince 'Çalıştır' tamamlar", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  gemini.mode = "quota";
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "error").first().getByText(/Kota ya da hız sınırına takıldı/).waitFor();
  assert.equal(gemini.posts.length, 1, "zincir ilk hatada durdu");
  assert.equal(await progressNow(page), "0");
  gemini.mode = "ok";
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.equal(await statusItems(page, "done").count(), 2);
  assert.equal(await progressNow(page), "2");
});

await scenario("6. Durdur: çalışan çağrı kesilir, 'Durduruldu' yazar, o adımın sonucu kaydedilmez; düğme 'Çalıştır'a döner", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  gemini.mode = "slow";
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "running").first().waitFor();
  await panel(page).getByRole("button", { name: "Durdur" }).click();
  await panel(page).getByText(/Durduruldu\. Bitenler korundu/).waitFor();
  assert.equal(await progressNow(page), "0");
  assert.equal(await page.locator("textarea").first().inputValue(), "");
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).waitFor();
});

await scenario("7. Elle devam: görsel adımı elle yapıp çıktısını yapıştırınca 'Devam et' 4. adımı o metinle çalıştırır (önceki adımlar yeniden çağrılmaz)", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.equal(gemini.posts.length, 2);
  // 3. adıma git, kendi sonucunu yapıştır.
  await page.getByRole("button", { name: /^Adım 3:/ }).click();
  await page.getByPlaceholder("Aracından aldığın sonucu buraya yapıştır").fill("Elle yapılan afiş: kırmızı arka plan");
  await panel(page).getByRole("button", { name: "Devam et" }).click();
  await panel(page).getByText("Zincir bitti. Sonuçlar adımların çıktı alanlarında.").waitFor();
  assert.equal(gemini.posts.length, 3, "yalnız 4. adım çağrıldı");
  assert.equal(gemini.posts[2].prompt, "Afişe kısa bir açıklama yaz.\n\nAfiş notu:\nElle yapılan afiş: kırmızı arka plan");
  assert.equal(await statusItems(page, "kept").count(), 3, "ilk üç adım hazır sayıldı");
  assert.equal(await statusItems(page, "done").count(), 1, "yalnız 4. adım yeni üretildi");
  assert.equal(await progressNow(page), "3", "elle yapılan 3. adım, kişi işaretlemedikçe 'bitti' sayılmaz");
  await panel(page).getByRole("button", { name: "Özeti aç" }).click();
  await page.getByRole("heading", { name: "Çalışma özeti" }).waitFor();
  await page.getByText("ÇIKTI:Afişe kısa bir açıklam").first().waitFor();
}, { data: FOUR });

await scenario("8. 'Baştan çalıştır' yalnız modelin ürettiklerini siler ve yeniden üretir", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.equal(gemini.posts.length, 2);
  await panel(page).getByRole("button", { name: "Baştan çalıştır" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-auto-status] li[data-status='done']").length === 2 && document.querySelector("[data-auto-status] li[data-status='running']") === null);
  assert.equal(gemini.posts.length, 4, "iki adım yeniden modele gitti");
  assert.equal(await progressNow(page), "2");
});

await scenario("9. Değişkeni varsayılansız prompt: model çağrılmadan 'varsayılan değeri yok' hatası (adım elle çalıştırılmalı)", async ({ page, gemini }) => {
  await openPanel(page);
  await fillKey(page);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "error").first().getByText("“konu” değişkeninin varsayılan değeri yok. Bu adımı elle çalıştır.").waitFor();
  assert.equal(gemini.posts.length, 0);
}, { variables: [{ id: "v1", prompt_id: pid(1), name: "konu", default_value: "", description: null, sort_order: 0, type: "text", options: null, config: {}, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z" }] });

await scenario("10. İngilizce: panel, plan, durum ve hata cümleleri", async ({ page, gemini }) => {
  await openPanel(page);
  await panel(page).getByText("2 model call(s) will be made.").waitFor();
  await panel(page).getByText(/The chain will stop at step 3 \(non-text steps can't run automatically\)/).waitFor();
  await fillKey(page);
  gemini.mode = "quota";
  await panel(page).getByRole("button", { name: "Run", exact: true }).click();
  await statusItems(page, "error").first().getByText(/Quota or rate limit reached/).waitFor();
  gemini.mode = "ok";
  await panel(page).getByRole("button", { name: "Run", exact: true }).click();
  await statusItems(page, "blocked").first().getByText(/Needs to be done by hand: non-text steps can't run automatically/).waitFor();
}, { lang: "en" });

await scenario("11. Telefon: panel açık, taşma yok, düğmeler dokunulabilir", async ({ page }) => {
  await openPanel(page);
  await fillKey(page);
  assert.equal(await overflowFree(page), true);
  const h = await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(h >= 36, `button height ${h}`);
  await panel(page).getByRole("button", { name: "Çalıştır", exact: true }).click();
  await statusItems(page, "blocked").first().waitFor();
  assert.equal(await overflowFree(page), true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/auto-run-mobile.png`, fullPage: true });
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
