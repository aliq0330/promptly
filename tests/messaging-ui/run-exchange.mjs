// Prompt dışa / içe aktarma (docs/history/250-*): Kütüphanem'de toplu "Dışa aktar" (JSON / Markdown / CSV dosyası GERÇEKTEN indirilir ve
// çekirdek kütüphaneyle geri okunur), kartın ⋮ menüsünde tek prompt dışa aktarma, "İçe aktar" (dosya seç → kuru çalıştırma → onay →
// taslak), geçersiz / yinelenen kayıtlar, sunucu hatası (atomik), İngilizce ve mobil. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (RPC kuralları: supabase/tests/import-prompts.sql). İçe aktarma RPC'sinin yanıtı burada taklit edilir; doğrulayan SQL testidir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { parsePrompts } from "../../src/lib/exchange/index.ts";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const P1 = "b0000000-0000-4000-8000-000000000010";
const P2 = "b0000000-0000-4000-8000-000000000020";
const P3 = "b0000000-0000-4000-8000-000000000030";
const row = (id, title, extra = {}) => ({
  id, title, description: "Açıklama, virgüllü", prompt_text: `${title} metni {Stil}\nikinci satır`, tool: null, tools: ["midjourney:v7"], content_type: "image", category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 7, save_count: 2, comment_count: 1, copy_count: 3, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: pubOf(U.alice), prompt_media: [], prompt_tags: [{ tags: { slug: "neon", label: "Neon Işık" } }],
  ...extra,
});
const ROWS = [row(P1, "Yağmurlu Gece"), row(P2, "İkinci Prompt", { content_type: "text", tools: [], prompt_tags: [], visibility: "private" }), row(P3, "Taslak Prompt", { status: "draft", visibility: "private", created_at: "2026-09-02T00:00:00Z" })];
const VARIABLES = [{ id: "v1", prompt_id: P1, name: "Stil", default_value: "noir", description: "Tarz", sort_order: 0, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", type: "select", options: [{ label: "Noir", value: "noir" }, { label: "Neon", value: "neon" }], config: {} }];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { prompts: [], imports: [], importResult: null, variableCalls: 0 };
  db.rpc.import_prompts = (body) => {
    state.imports.push(body);
    if (state.importResult) return state.importResult(body);
    const items = body.p_items.map((item, i) => ({
      index: i + 1,
      status: item.title === "Zaten var" ? "duplicate" : "ok",
      ...(item.category === "nope" ? { warnings: ["category_dropped"] } : {}),
      ...(!body.p_dry_run && item.title !== "Zaten var" ? { id: `c0000000-0000-4000-8000-00000000000${i}` } : {}),
    }));
    return { body: { dryRun: body.p_dry_run, ok: true, created: body.p_dry_run ? 0 : items.filter((x) => x.status === "ok").length, items } };
  };
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "prompts" && ctx.method === "GET") {
      state.prompts.push(Object.fromEntries(ctx.q.entries()));
      const id = ctx.q.get("id")?.replace(/^eq\./, "");
      if (id) return ctx.rows(ROWS.filter((r) => r.id === id));
      if (ctx.q.get("author_id")) return ctx.rows(ROWS);
    }
    if (ctx.table === "prompt_variables" && ctx.method === "GET") {
      state.variableCalls += 1;
      const ids = (ctx.q.get("prompt_id") ?? "").replace(/^(eq|in)\./, "").replace(/[()]/g, "").split(",");
      return ctx.rows(VARIABLES.filter((v) => ids.includes(v.prompt_id)));
    }
    return null;
  };
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); if (process.env.DEBUG) console.log("pageerror:", String(e).slice(0, 600)); });
  if (process.env.DEBUG) page.on("console", (m) => (m.type() === "error" ? console.log("console.error:", m.text().slice(0, 400)) : null));
  try {
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ex-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const dialog = (page) => page.getByRole("dialog");
async function openLibrary(page) {
  await page.goto(`${BASE}/my-content`);
  await page.getByTestId("my-content-export").waitFor();
}
async function download(page, format) {
  await dialog(page).getByRole("radio", { name: new RegExp(format, "i") }).check();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("exchange-download").click()]);
  if (process.env.DEBUG) console.log("download:", file.suggestedFilename(), file.url());
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), "utf8") };
}
const upload = (page, name, content) => page.getByTestId("exchange-file-input").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(content, "utf8") });

await scenario("1. Kütüphanem: Promptlar bölümünde İçe/Dışa aktar; diğer bölümlerde yok", async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").waitFor();
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /Workflow/ }).click();
  assert.equal(await page.getByTestId("my-content-export").count(), 0, "Workflow bölümünde yok");
  assert.equal(await overflowFree(page), true);
});

await scenario("2. Toplu JSON dışa aktarma: taslak ve özel dahil, dosya gerçekten iner, geri okununca birebir aynı; sayaç/yazar/durum dosyada yok", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-export").click();
  await dialog(page).getByText("3 prompt dışa aktarılacak.").waitFor();
  const file = await download(page, "JSON");
  assert.match(file.name, /^promptly-prompts-\d{4}-\d{2}-\d{2}\.json$/);
  const envelope = JSON.parse(file.text);
  assert.equal(envelope.format, "promptly.prompts");
  assert.equal(envelope.schemaVersion, 1);
  assert.deepEqual(envelope.items.map((i) => i.title), ["Yağmurlu Gece", "İkinci Prompt", "Taslak Prompt"], "taslak ve özel dahil");
  assert.deepEqual(envelope.items[0].tags, ["Neon Işık"]);
  assert.deepEqual(envelope.items[0].tools, ["midjourney:v7"]);
  assert.equal(envelope.items[0].variables[0].name, "Stil");
  assert.equal(envelope.items[0].variables[0].options.length, 2);
  assert.equal(envelope.items[0].promptText, "Yağmurlu Gece metni {Stil}\nikinci satır");
  assert.equal(JSON.stringify(envelope).includes("like_count") || JSON.stringify(envelope).includes("likeCount") || JSON.stringify(envelope).includes(U.alice.id), false, "sayaç / yazar kimliği yok");
  const back = parsePrompts(file.text, "json");
  assert.deepEqual(back.issues, []);
  assert.equal(back.items.length, 3);
  const exportCall = state.prompts.find((q) => q.author_id && q.deleted_at);
  assert.ok(exportCall, "dışa aktarma sorgusu");
  assert.equal(exportCall.community_id, "is.null", "topluluğa özgü içerik dışarıda");
  await dialog(page).waitFor({ state: "detached" });
});

await scenario("3. Markdown ve CSV dosyaları indirilir: CSV Excel için BOM'lu, ikisi de geri okununca aynı promptlar", async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-export").click();
  const md = await download(page, "Markdown");
  assert.match(md.name, /\.md$/);
  assert.match(md.text, /^---\nschemaVersion: 1\ntitle: "Yağmurlu Gece"/);
  assert.match(md.text, /<!-- promptly:next -->/);
  const mdBack = parsePrompts(md.text, "markdown");
  assert.deepEqual(mdBack.issues, []);
  assert.equal(mdBack.items[0].promptText, "Yağmurlu Gece metni {Stil}\nikinci satır");
  assert.deepEqual(mdBack.items[0].variables, [], "Markdown değişken tanımı taşımaz");
  await page.getByTestId("my-content-export").click();
  const csv = await download(page, "CSV");
  assert.match(csv.name, /\.csv$/);
  assert.equal(csv.text.charCodeAt(0), 0xfeff, "BOM");
  const csvBack = parsePrompts(csv.text, "csv");
  assert.deepEqual(csvBack.issues, []);
  assert.deepEqual(csvBack.items.map((i) => i.title), ["Yağmurlu Gece", "İkinci Prompt", "Taslak Prompt"]);
  assert.equal(csvBack.items[0].description, "Açıklama, virgüllü");
});

await scenario("4. Kartın ⋮ menüsünde (kendi promptum) 'Dışa aktar': tek prompt indirilir, dosya adı başlıktan (ASCII)", async ({ page, state }) => {
  await openLibrary(page);
  const card = page.locator("main article").filter({ hasText: "Yağmurlu Gece" }).first();
  await card.waitFor();
  await card.getByRole("button", { name: /Gönderi seçenekleri|Post options/i }).click();
  await page.locator("[data-export-prompt]").click();
  await dialog(page).getByRole("heading", { name: "Promptu dışa aktar" }).waitFor();
  assert.equal(await dialog(page).getByText(/prompt dışa aktarılacak/).count(), 0, "tek promptta sayı satırı yok");
  const file = await download(page, "JSON");
  assert.equal(file.name, "yagmurlu-gece.json");
  assert.equal(JSON.parse(file.text).items.length, 1);
  assert.ok(state.prompts.some((q) => q.id === `eq.${P1}`), "tek prompt id ile okundu");
  assert.ok(state.variableCalls >= 1, "değişkenler okundu");
});

await scenario("5. İçe aktarma: dosya seçilince kuru çalıştırma, özet + satır durumları; onaylayınca gerçek çağrı, yalnız içerik alanları gönderilir, Taslaklar açılır", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").click();
  const file = JSON.stringify([
    { title: "Yeni Bir Prompt", promptText: "metin {x}", contentType: "text", tags: ["Etiket"], author_id: "x", authorId: "x", status: "published", visibility: "public", like_count: 99, community_id: "c1" },
    { title: "Zaten var", promptText: "başka", contentType: "image" },
    { title: "", promptText: "başlıksız", contentType: "text" },
    { title: "Kategorisi yok", promptText: "p", contentType: "image", category: "nope" },
  ]);
  await upload(page, "yedek.json", file);
  await page.getByTestId("exchange-summary").waitFor();
  assert.match(await page.getByTestId("exchange-summary").innerText(), /4 kayıt okundu: 2 yeni, 1 zaten var, 1 geçersiz\./);
  assert.equal(state.imports.length, 1, "yalnız kuru çalıştırma yapıldı");
  assert.equal(state.imports[0].p_dry_run, true);
  assert.equal(state.imports[0].p_items.length, 3, "istemcide geçersiz olan gönderilmedi");
  assert.deepEqual(Object.keys(state.imports[0].p_items[0]).sort(), ["category", "contentType", "description", "promptText", "subcategory", "tags", "title", "tools", "variables"], "dosyadaki yazar/durum/sayaç alanları gönderilmez");
  const items = dialog(page).locator("li[data-status]");
  assert.deepEqual(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-status"))), ["invalid", "ok", "duplicate", "ok"]);
  assert.match(await dialog(page).innerText(), /3\. kayıt|Başlık: boş olamaz/);
  assert.match(await dialog(page).innerText(), /Kategori tanınmadı/);
  const run = page.getByTestId("exchange-run");
  assert.match(await run.innerText(), /2 promptu taslak olarak ekle/);
  await run.click();
  await page.getByTestId("exchange-done").waitFor();
  assert.match(await page.getByTestId("exchange-done").innerText(), /2 prompt taslak olarak eklendi\./);
  assert.equal(state.imports.length, 2);
  assert.equal(state.imports[1].p_dry_run, false);
  await page.keyboard.press("Escape");
  await page.locator("[data-section-menu]").filter({ hasText: "Taslaklar" }).waitFor();
});

await scenario("6. Hepsi zaten varsa onay düğmesi pasif; Markdown ve CSV dosyası da kabul edilir", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").click();
  await upload(page, "p.json", JSON.stringify([{ title: "Zaten var", promptText: "x", contentType: "text" }]));
  await page.getByTestId("exchange-summary").waitFor();
  const run = page.getByTestId("exchange-run");
  assert.equal(await run.isDisabled(), true);
  assert.match(await run.innerText(), /Eklenecek yeni prompt yok\./);
  await upload(page, "p.md", "---\ntitle: Elle yazıldı\ncontentType: text\ntags: [a, b]\n---\nBir hikâye yaz.\n");
  await page.getByText("1 kayıt okundu: 1 yeni").waitFor();
  assert.deepEqual(state.imports.at(-1).p_items[0].tags, ["a", "b"]);
  await upload(page, "p.csv", "title,prompt_text,content_type\r\n\"=1+1\",\"-madde\",text\r\n");
  await page.getByText("1 kayıt okundu: 1 yeni").waitFor();
  assert.equal(state.imports.at(-1).p_items[0].title, "=1+1");
});

await scenario("7. Bozuk dosyalar anlaşılır mesaj verir ve hiçbir çağrı yapmaz", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").click();
  const cases = [
    ["a.txt", "x", /Desteklenmeyen dosya türü/],
    ["a.json", "{bozuk", /Geçerli bir JSON dosyası değil/],
    ["a.csv", "a,b\n1,2", /title ve prompt_text sütunları/],
    ["a.json", JSON.stringify({ format: "promptly.prompts", schemaVersion: 99, items: [] }), /daha yeni bir Promptly sürümü/],
    ["a.json", JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ title: `t${i}`, promptText: "p", contentType: "text" }))), /en fazla 30 prompt/],
  ];
  for (const [name, content, message] of cases) {
    await upload(page, name, content);
    await page.getByTestId("exchange-fatal").filter({ hasText: message }).waitFor();
  }
  assert.equal(state.imports.length, 0);
  assert.equal(await page.getByTestId("exchange-run").count(), 0);
});

await scenario("8. Sunucu hatası (hız sınırı): hata gösterilir, 'eklendi' denmez; Taslaklar'a geçilmez", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").click();
  await upload(page, "p.json", JSON.stringify([{ title: "A", promptText: "x", contentType: "text" }]));
  await page.getByTestId("exchange-run").waitFor();
  state.importResult = (body) => (body.p_dry_run ? { body: { dryRun: true, ok: true, created: 0, items: [{ index: 1, status: "ok" }] } } : { status: 400, body: { code: "P0001", message: "rate_limit", details: "", hint: "" } });
  await page.getByTestId("exchange-run").click();
  await page.getByTestId("exchange-error").waitFor();
  assert.match(await page.getByTestId("exchange-error").innerText(), /Çok hızlı işlem yapıyorsun/);
  assert.equal(await page.getByTestId("exchange-done").count(), 0);
  assert.equal(await page.getByTestId("exchange-run").isEnabled(), true, "yeniden denenebilir");
});

await scenario("9. İngilizce arayüz: tüm metinler çevrili", async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-export").click();
  await dialog(page).getByRole("heading", { name: "Export prompts" }).waitFor();
  await dialog(page).getByText("3 prompt(s) will be exported.").waitFor();
  await dialog(page).getByText("JSON — full backup").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("my-content-import").click();
  await dialog(page).getByRole("heading", { name: "Import prompts" }).waitFor();
  await upload(page, "a.json", "{bozuk");
  await page.getByTestId("exchange-fatal").filter({ hasText: "This isn't a valid JSON file." }).waitFor();
  assert.equal(await dialog(page).innerText().then((x) => /exchange\./.test(x)), false, "çevrilmemiş anahtar görünmüyor");
}, { lang: "en" });

await scenario("10. Telefon genişliği: pencereler taşmaz, alt düğmeler görünür", async ({ page }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-export").click();
  await page.getByTestId("exchange-download").waitFor();
  await page.waitForTimeout(600); // alt sayfanın açılış animasyonu bitsin
  const box = await page.getByTestId("exchange-download").boundingBox();
  assert.ok(box && box.y + box.height <= 844, `İndir düğmesi ekranda (y=${box?.y}, h=${box?.height})`);
  assert.equal(await overflowFree(page), true);
  await page.keyboard.press("Escape");
  await page.getByTestId("my-content-import").click();
  await upload(page, "p.json", JSON.stringify([{ title: "Zaten var", promptText: "x".repeat(50), contentType: "text" }]));
  await page.getByTestId("exchange-summary").waitFor();
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
const failed = results.filter(([r]) => r === "FAIL");
for (const [r, n] of results) console.log(`${r}  ${n}`);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
