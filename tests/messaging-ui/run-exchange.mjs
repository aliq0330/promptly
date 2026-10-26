// Prompt dışa / içe aktarma (docs/history/250-*): Kütüphanem'de toplu "Dışa aktar" (JSON / Markdown / CSV dosyası GERÇEKTEN indirilir ve
// çekirdek kütüphaneyle geri okunur), kartın ⋮ menüsünde tek prompt dışa aktarma, "İçe aktar" (dosya seç → kuru çalıştırma → onay →
// taslak), geçersiz / yinelenen kayıtlar, sunucu hatası (atomik), İngilizce ve mobil. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (RPC kuralları: supabase/tests/import-prompts.sql). İçe aktarma RPC'sinin yanıtı burada taklit edilir; doğrulayan SQL testidir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { ID, PAGES, installDetailData } from "./detail-fixtures.mjs";
import { parsePrompts } from "../../src/lib/exchange/index.ts";

const ME_ID = ME;
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

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", detail = false, moderator = false, manageCount = 250 } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { prompts: [], imports: [], importResult: null, variableCalls: 0, adminCalls: [], adminResult: null, manageQueries: [], manageCalls: [], manageFailAt: 0 };
  // Toplu yönetim taklidi: 250 kayıt = 200 taslak (2'si etkileşimli) + 30 yayında (2'si etkileşimli) + 20 gizli (1'i etkileşimli); >250 ise hepsi taslak.
  state.manageRows = Array.from({ length: manageCount }, (_, i) => ({
    id: `e0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Toplu ${i + 1}`,
    status: manageCount === 250 && i >= 200 ? "published" : "draft", visibility: manageCount === 250 && i >= 200 && i < 230 ? "public" : "private",
    like_count: [3, 4, 205, 206, 240].includes(i) ? 1 : 0, comment_count: 0, save_count: 0,
  }));
  const failNow = () => state.manageFailAt > 0 && state.manageCalls.length === state.manageFailAt;
  const forbidden = { status: 400, body: { code: "P0001", message: "Yetkisiz.", details: "", hint: "" } };
  db.rpc.admin_bulk_set_prompt_visibility = (body) => {
    state.manageCalls.push({ fn: "visibility", ...body });
    if (failNow()) return forbidden;
    let changed = 0;
    for (const id of body.p_ids) {
      const row = state.manageRows.find((r) => r.id === id);
      if (!row) continue;
      if (body.p_public) { if (row.status !== "published" || row.visibility !== "public") { row.status = "published"; row.visibility = "public"; changed += 1; } }
      else if (row.status === "published" && row.visibility !== "private") { row.visibility = "private"; changed += 1; }
    }
    return { body: { affected: changed, skipped: body.p_ids.length - changed } };
  };
  db.rpc.admin_bulk_delete_prompts = (body) => {
    state.manageCalls.push({ fn: "delete", ...body });
    if (failNow()) return forbidden;
    let deleted = 0;
    for (const id of body.p_ids) {
      const at = state.manageRows.findIndex((r) => r.id === id);
      if (at >= 0 && state.manageRows[at].like_count === 0) { state.manageRows.splice(at, 1); deleted += 1; }
    }
    return { body: { affected: deleted, skipped: body.p_ids.length - deleted } };
  };
  if (moderator) db.rpc.is_moderator = () => ({ body: true });
  db.rpc.admin_import_prompts = (body) => {
    state.adminCalls.push(body);
    if (state.adminResult) return state.adminResult(body, state.adminCalls.length);
    const items = body.p_items.map((item, i) => ({ index: i + 1, status: item.title === "Zaten var" ? "duplicate" : "ok", ...(!body.p_dry_run ? { id: `d0000000-0000-4000-8000-0000000${String(state.adminCalls.length).padStart(2, "0")}${String(i).padStart(3, "0")}` } : {}) }));
    const created = body.p_dry_run ? 0 : items.filter((x) => x.status === "ok").length;
    return { body: { dryRun: body.p_dry_run, ok: true, created, published: body.p_publish && !body.p_dry_run ? created : 0, items } };
  };
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
    if (ctx.table === "prompts" && ctx.method === "GET" && ctx.sel.includes("save_count") && !ctx.sel.includes("prompt_media")) {
      state.manageQueries.push(Object.fromEntries(ctx.q.entries()));
      const tagFilter = ctx.q.get("prompt_tags.tag_slug");
      if (tagFilter && tagFilter !== "eq.prompts-chat") return ctx.rows([]);
      const offset = Number(ctx.q.get("offset") ?? 0);
      const limit = Number(ctx.q.get("limit") ?? 1000);
      return ctx.rows(state.manageRows.slice(offset, offset + limit).map((r) => ({ ...r, ...(tagFilter ? { prompt_tags: [{ tag_slug: "prompts-chat" }] } : {}) })));
    }
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
  if (detail) await installDetailData(context);
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Başkasının promptunu indirme (docs/history/251-*)
// ---------------------------------------------------------------------------------------------------------------------------------
await scenario("11. Başkasının promptu da indirilir: detay ⋮ menüsünde 'Dışa aktar'; dosyaya yazar adı + Promptly bağlantısı girer, uyarı notu görünür", async ({ page }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.getByRole("button", { name: /Gönderi seçenekleri|Post options/i }).first().click();
  await page.locator("[data-export-prompt]").click();
  await dialog(page).getByTestId("exchange-credit-note").waitFor();
  const file = await download(page, "JSON");
  const item = JSON.parse(file.text).items[0];
  assert.equal(item.title, "Markalı mekanik klavye tuşları");
  assert.equal(item.source.credit, `@${U.carol.username} · Promptly`);
  assert.match(item.source.url, new RegExp(`/share/prompt/${ID.prompt}/$`));
  assert.equal(JSON.stringify(item).includes(U.carol.id), false, "yazar kimliği dosyada yok");
  assert.match(item.description, /Kaynak: @egeberkina/, "yazarın kendi kaynak satırı olduğu gibi kalır");
  const md = await (async () => { await page.getByRole("button", { name: /Gönderi seçenekleri|Post options/i }).first().click(); await page.locator("[data-export-prompt]").click(); return download(page, "Markdown"); })();
  assert.match(md.text, /sourceCredit: "@carol · Promptly"/);
}, { detail: true });

await scenario("12. İçe aktarırken atıf korunur: kaynak bilgisi açıklamanın sonuna tek 'Kaynak:' satırı olarak yazılır; zaten kaynak satırı varsa tekrarlanmaz", async ({ page, state }) => {
  await openLibrary(page);
  await page.getByTestId("my-content-import").click();
  const withSource = { title: "Başkasından", description: "Güzel bir prompt", promptText: "metin", contentType: "text", source: { credit: "@carol · Promptly", url: "https://aliq0330.github.io/promptly/share/prompt/x/" } };
  const alreadyCredited = { title: "Zaten kaynaklı", description: "Açıklama\nKaynak: @egeberkina · https://x.com/e", promptText: "metin 2", contentType: "text", source: { credit: "@carol · Promptly", url: "https://aliq0330.github.io/promptly/share/prompt/y/" } };
  await upload(page, "paylasilan.json", JSON.stringify([withSource, alreadyCredited]));
  await page.getByTestId("exchange-summary").waitFor();
  const [first, second] = state.imports[0].p_items;
  assert.equal(first.description, "Güzel bir prompt\n\nKaynak: @carol · Promptly https://aliq0330.github.io/promptly/share/prompt/x/");
  assert.equal(second.description, "Açıklama\nKaynak: @egeberkina · https://x.com/e", "ikinci kaynak satırı eklenmedi");
  assert.equal(first.source, undefined, "RPC'ye `source` alanı gitmez (yalnız açıklamaya işlenir)");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Moderatör toplu yükleme (docs/history/251-*)
// ---------------------------------------------------------------------------------------------------------------------------------
const chatBlock = (title, contributor, text) => `<details>\n<summary><strong>${title}</strong></summary>\n\n## ${title}\n\nContributed by ${contributor}\n\n\`\`\`md\n${text}\n\`\`\`\n\n</details>\n`;
const contributorFor = (i) => (i % 4 === 0 ? `[@dev${i}](https://github.com/dev${i})` : i % 4 === 1 ? `[@mail.user${i}@gmail.com](https://github.com/mail.user${i}@gmail.com)` : i % 4 === 2 ? "@anonymous" : "[@a](https://github.com/a), [@f](https://github.com/f)");
const PROMPTS_CHAT = `# Awesome ChatGPT Prompts\n\n---\n\n${Array.from({ length: 120 }, (_, i) => chatBlock(`Prompt ${i + 1}`, contributorFor(i + 1), `Act as role ${i + 1}. Use {name} and \${topic}.`)).join("\n")}\n${chatBlock("Dev Dosya", "@f", "x".repeat(50001))}`;

await scenario("13. Moderatör toplu yükleme: prompts.chat dosyası adresten gelir (120 geçerli + 1 aşırı uzun); kontrol hiçbir şey yazmaz, 50'şerli 3 çağrı", async ({ page, state }) => {
  await page.context().route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: PROMPTS_CHAT }));
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-import").waitFor();
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-loaded").waitFor();
  assert.match(await page.getByTestId("bulk-loaded").innerText(), /prompts\.chat dosyası: 121 kayıt okundu, 120 geçerli, 1 geçersiz\./);
  assert.match(await page.getByTestId("bulk-import").textContent(), /Prompt metni — çok uzun/, "atlanacak kayıt nedeniyle listelenir");
  assert.equal(await page.getByTestId("bulk-tag").inputValue(), "prompts.chat");
  await page.getByTestId("bulk-check").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.match(await page.getByTestId("bulk-outcome").innerText(), /Kontrol tamamlandı: 120 yeni, 0 zaten var, 0 geçersiz\. Hiçbir şey yazılmadı\./);
  assert.deepEqual(state.adminCalls.map((c) => [c.p_items.length, c.p_dry_run, c.p_publish]), [[50, true, false], [50, true, false], [20, true, false]], "30'dan çok prompt tek çağrıda, 50'şerli");
}, { moderator: true });

await scenario("14. Yükleme: varsayılan özel taslak (yayın kapalı); her prompta kaynak satırı + ortak etiket; e-posta benzeri katkıcı adı HİÇBİR çağrıya girmez", async ({ page, state }) => {
  await page.context().route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: PROMPTS_CHAT }));
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-loaded").waitFor();
  assert.equal(await page.getByTestId("bulk-publish").isChecked(), false, "yayın varsayılan KAPALI");
  assert.match(await page.getByTestId("bulk-run").innerText(), /120 promptu taslak olarak yükle/);
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.match(await page.getByTestId("bulk-outcome").innerText(), /120 prompt eklendi \(0 yayınlandı\), 0 zaten vardı, 0 atlandı\./);
  assert.deepEqual(state.adminCalls.map((c) => [c.p_items.length, c.p_dry_run, c.p_publish, c.p_source]), [[50, false, false, "prompts.chat"], [50, false, false, "prompts.chat"], [20, false, false, "prompts.chat"]]);
  const all = state.adminCalls.flatMap((c) => c.p_items);
  assert.equal(all.length, 120);
  assert.ok(all.every((i) => i.tags.includes("prompts.chat") && /^Kaynak: prompts\.chat \(CC0\)/m.test(i.description) && i.contentType === "text"));
  assert.equal(all[3].description, "Kaynak: prompts.chat (CC0) — @dev4 https://github.com/dev4");
  assert.equal(all[1].description, "Kaynak: prompts.chat (CC0) https://github.com/f/prompts.chat", "anonim: yalnız genel atıf");
  assert.equal(all[0].description, "Kaynak: prompts.chat (CC0) https://github.com/f/prompts.chat", "e-posta benzeri katkıcı: yalnız genel atıf");
  assert.equal(all[2].description, "Kaynak: prompts.chat (CC0) — @a, @f https://github.com/a");
  assert.equal(all[6].description, "Kaynak: prompts.chat (CC0) — @a, @f https://github.com/a");
  assert.equal(JSON.stringify(state.adminCalls).includes("gmail"), false, "kişisel e-posta kopyalanmadı");
  assert.equal(all[0].promptText, "Act as role 1. Use {name} and ${topic}.", "metin olduğu gibi (süslü parantezler değişmedi)");
}, { moderator: true });

await scenario("15. 'Yayınla' açılınca düğme uyarır (tehlike rengi) ve çağrılar p_publish=true gönderir; sonuç yayınlanan sayısını yazar", async ({ page, state }) => {
  await page.context().route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: PROMPTS_CHAT }));
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-loaded").waitFor();
  await page.getByTestId("bulk-publish").check();
  assert.match(await page.getByTestId("bulk-run").innerText(), /120 promptu yayınla ve yükle/);
  assert.match(await page.getByTestId("bulk-run").getAttribute("class"), /bg-danger/);
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.ok(state.adminCalls.every((c) => c.p_publish === true && c.p_dry_run === false));
  assert.match(await page.getByTestId("bulk-outcome").innerText(), /120 prompt eklendi \(120 yayınlandı\)/);
}, { moderator: true });

await scenario("16. Yarıda kalma: 2. parça hata verirse 1. parça yazılmış kalır, uyarı 'tekrar çalıştır' der; yeniden çalıştırınca yinelenenler atlanır", async ({ page, state }) => {
  await page.context().route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: PROMPTS_CHAT }));
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-loaded").waitFor();
  state.adminResult = (body, n) => (n === 2 ? { status: 400, body: { code: "P0001", message: "Yetkisiz.", details: "", hint: "" } } : { body: { dryRun: false, ok: true, created: body.p_items.length, published: 0, items: body.p_items.map((_, i) => ({ index: i + 1, status: "ok" })) } });
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-partial").waitFor();
  assert.match(await page.getByTestId("bulk-partial").innerText(), /Yarıda kaldı: 50 \/ 120 işlendi/);
  assert.match(await page.getByTestId("bulk-error").innerText(), /Yetkisiz\./);
  assert.match(await page.getByTestId("bulk-outcome").innerText(), /50 prompt eklendi/);
  assert.equal(state.adminCalls.length, 2, "hatadan sonra yeni parça gönderilmez");
  // aynı dosyayla tekrar: ilk 50 zaten var
  state.adminCalls.length = 0;
  state.adminResult = (body, n) => ({ body: { dryRun: false, ok: true, created: n === 1 ? 0 : body.p_items.length, published: 0, items: body.p_items.map((_, i) => ({ index: i + 1, status: n === 1 ? "duplicate" : "ok" })) } });
  await page.getByTestId("bulk-run").click();
  await page.getByText(/70 prompt eklendi \(0 yayınlandı\), 50 zaten vardı/).waitFor();
}, { moderator: true });

await scenario("17. Adres ve dosya doğrulaması: raw.githubusercontent.com dışı adres, ağ hatası ve desteklenmeyen dosya anlaşılır mesaj verir; çağrı yapılmaz", async ({ page, state }) => {
  await page.context().route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, body: "nope", headers: { "access-control-allow-origin": "*" } }));
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-import").waitFor();
  await page.getByTestId("bulk-url").fill("https://example.com/PROMPTS.md");
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-fatal").filter({ hasText: "Yalnızca https://raw.githubusercontent.com/" }).waitFor();
  await page.getByTestId("bulk-url").fill("https://raw.githubusercontent.com/f/prompts.chat/main/PROMPTS.md");
  await page.getByTestId("bulk-fetch").click();
  await page.getByTestId("bulk-fatal").filter({ hasText: "Dosya getirilemedi" }).waitFor();
  await page.getByTestId("bulk-file").setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("merhaba") });
  await page.getByTestId("bulk-fatal").filter({ hasText: "Desteklenmeyen dosya türü" }).waitFor();
  assert.equal(state.adminCalls.length, 0);
}, { moderator: true });

await scenario("18. Kendi JSON dosyan da 30'dan fazla yüklenir; geçersiz etiket yüklemeyi engeller; İngilizce arayüz", async ({ page, state }) => {
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-import").waitFor();
  const many = Array.from({ length: 75 }, (_, i) => ({ title: `Kendi ${i + 1}`, promptText: `metin ${i + 1}`, contentType: "text" }));
  await page.getByTestId("bulk-file").setInputFiles({ name: "toplu.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(many)) });
  await page.getByTestId("bulk-loaded").waitFor();
  assert.match(await page.getByTestId("bulk-loaded").innerText(), /JSON file: 75 record\(s\) read, 75 valid, 0 invalid\./);
  assert.match(await page.getByTestId("bulk-run").innerText(), /Upload 75 prompt\(s\) as drafts/);
  await page.getByTestId("bulk-tag").fill("<kötü>");
  assert.equal(await page.getByTestId("bulk-run").isDisabled(), true);
  await page.getByText("A tag can be at most 60 characters").waitFor();
  await page.getByTestId("bulk-tag").fill("");
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.deepEqual(state.adminCalls.map((c) => c.p_items.length), [50, 25]);
  assert.ok(state.adminCalls.flatMap((c) => c.p_items).every((i) => i.tags.length === 0), "etiket boşsa eklenmez");
}, { lang: "en", moderator: true });

// ---------------------------------------------------------------------------------------------------------------------------------
// Moderatör toplu yönetim: listele, seçerek yayınla / gizle / sil (docs/history/251-*)
// ---------------------------------------------------------------------------------------------------------------------------------
const rowsOf = (page) => page.getByTestId("manage-row");
async function openManage(page) {
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-manage").waitFor();
  await page.getByTestId("manage-load").click();
  await page.getByTestId("manage-summary").waitFor();
}

await scenario("19. Toplu yönetim: kendi promptların etikete göre listelenir (yalnız kendi, topluluksuz, orijinal); özet sayıları; 100'erli gösterim", async ({ page, state }) => {
  await openManage(page);
  assert.match(await page.getByTestId("manage-summary").innerText(), /250 prompt: 200 taslak, 30 yayında, 20 gizli \(yalnız sen\)\./);
  const q = state.manageQueries[0];
  assert.equal(q["prompt_tags.tag_slug"], "eq.prompts-chat", "etiket süzgeci (slug)");
  assert.equal(q.author_id, `eq.${ME_ID}`);
  assert.equal(q.community_id, "is.null");
  assert.equal(q.origin_type, "eq.original");
  assert.equal(await rowsOf(page).count(), 100);
  assert.match(await page.getByTestId("manage-showing").innerText(), /100 \/ 250 gösteriliyor/);
  await page.getByTestId("manage-more").click();
  assert.equal(await rowsOf(page).count(), 200);
  await page.getByTestId("manage-status").selectOption("hidden");
  assert.equal(await rowsOf(page).count(), 20);
  await page.getByTestId("manage-status").selectOption("all");
  await page.getByTestId("manage-search").fill("Toplu 25");
  assert.equal(await rowsOf(page).count(), 2, '"Toplu 25" araması: "Toplu 25" ve "Toplu 250"');
  await page.getByTestId("manage-tag").fill("başka-etiket");
  await page.getByTestId("manage-load").click();
  await page.getByText("Bu etikette senin prompt'un yok.").waitFor();
}, { moderator: true });

await scenario("20. 1000'den çok prompt: liste sayfalanarak (1000'lik) tamamen okunur", async ({ page, state }) => {
  await openManage(page);
  assert.match(await page.getByTestId("manage-summary").innerText(), /1050 prompt: 1050 taslak/);
  assert.deepEqual(state.manageQueries.map((x) => x.offset), ["0", "1000"]);
}, { moderator: true, manageCount: 1050 });

await scenario("21. Damla damla yayınlama: Taslak süzgeci + 'ilk 50'yi seç' → tek çağrı, onaysız; sonuç ve liste güncellenir", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-status").selectOption("draft");
  await page.getByTestId("manage-first-n").fill("50");
  await page.getByTestId("manage-select-first").click();
  assert.match(await page.getByTestId("manage-selected").innerText(), /50 seçili/);
  assert.match(await page.getByTestId("manage-publish").innerText(), /50 promptu yayınla/);
  await page.getByTestId("manage-publish").click();
  await page.getByTestId("manage-outcome").waitFor();
  assert.match(await page.getByTestId("manage-outcome").innerText(), /50 prompt yayınlandı, 0 zaten yayındaydı\./);
  assert.equal(state.manageCalls.length, 1);
  assert.equal(state.manageCalls[0].p_ids.length, 50);
  assert.equal(state.manageCalls[0].p_public, true);
  assert.equal(await page.getByTestId("manage-confirm").count(), 0, "50 prompt için onay istenmez");
  assert.match(await page.getByTestId("manage-summary").innerText(), /250 prompt: 150 taslak, 80 yayında, 20 gizli/);
  assert.match(await page.getByTestId("manage-selected").innerText(), /0 seçili/, "seçim temizlenir");
}, { moderator: true });

await scenario("22. Çok sayıda yayınlama onay ister (Vazgeç çağrı yapmaz); 200 prompt 100'erli 2 çağrı; Gizle onaysız ve yalnız yayındakileri etkiler", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-status").selectOption("draft");
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-publish").click();
  await page.getByTestId("manage-confirm").waitFor();
  assert.match(await page.getByTestId("manage-confirm").innerText(), /200 prompt herkese açık yayınlanacak/);
  await page.getByTestId("manage-cancel").click();
  assert.equal(state.manageCalls.length, 0);
  await page.getByTestId("manage-publish").click();
  await page.getByTestId("manage-confirm-yes").click();
  await page.getByTestId("manage-outcome").waitFor();
  assert.deepEqual(state.manageCalls.map((c) => [c.fn, c.p_ids.length, c.p_public]), [["visibility", 100, true], ["visibility", 100, true]]);
  assert.match(await page.getByTestId("manage-outcome").innerText(), /200 prompt yayınlandı/);
  assert.match(await page.getByTestId("manage-summary").innerText(), /250 prompt: 0 taslak, 230 yayında, 20 gizli/);
  // gizle: yayındakileri seç → 'Gizle'
  await page.getByTestId("manage-status").selectOption("public");
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-hide").click();
  await page.getByTestId("manage-outcome").filter({ hasText: "230 prompt gizlendi, 0 atlandı" }).waitFor();
  assert.equal(await page.getByTestId("manage-confirm").count(), 0, "gizle onay istemez (geri alınabilir)");
  assert.match(await page.getByTestId("manage-summary").innerText(), /250 prompt: 0 taslak, 0 yayında, 250 gizli/);
}, { moderator: true });

await scenario("23. Silme her zaman onay ister ve uyarır; etkileşimli promptlar sunucuda atlanır, sonuç ikisini de sayar; liste yeniden okunur", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-delete").click();
  await page.getByTestId("manage-confirm").waitFor();
  assert.match(await page.getByTestId("manage-confirm").innerText(), /250 prompt KALICI olarak silinecek.*atlanır.*Geri alınamaz/s);
  assert.equal(state.manageCalls.length, 0, "onaylanmadan hiçbir çağrı yok");
  await page.getByTestId("manage-confirm-yes").click();
  await page.getByTestId("manage-outcome").waitFor();
  assert.deepEqual(state.manageCalls.map((c) => [c.fn, c.p_ids.length]), [["delete", 100], ["delete", 100], ["delete", 50]]);
  assert.match(await page.getByTestId("manage-outcome").innerText(), /245 prompt silindi, 5 atlandı \(etkileşimi ya da bağı olan\)\./);
  assert.match(await page.getByTestId("manage-summary").innerText(), /5 prompt:/);
  assert.equal(await rowsOf(page).count(), 5);
  assert.match((await rowsOf(page).first().innerText()), /etkileşimli/);
}, { moderator: true });

await scenario("24. Yarıda kalma: 2. parça hata verirse 1. parça işlenmiş kalır, uyarı 'tekrar çalıştır' der; İngilizce arayüz", async ({ page, state }) => {
  state.manageFailAt = 2;
  await openManage(page);
  await page.getByTestId("manage-status").selectOption("draft");
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-publish").click();
  await page.getByTestId("manage-confirm-yes").click();
  await page.getByTestId("manage-partial").waitFor();
  assert.match(await page.getByTestId("manage-partial").innerText(), /Stopped early: 100 \/ 200 processed/);
  assert.match(await page.getByTestId("manage-error").innerText(), /Yetkisiz\./);
  assert.match(await page.getByTestId("manage-outcome").innerText(), /100 prompt\(s\) published/);
  assert.equal(state.manageCalls.length, 2, "hatadan sonra yeni parça gönderilmez");
  assert.match(await page.getByTestId("manage-summary").innerText(), /250 prompt\(s\): 100 draft, 130 published, 20 hidden/);
}, { moderator: true, lang: "en" });

await browser.close();
server.close();
const failed = results.filter(([r]) => r === "FAIL");
for (const [r, n] of results) console.log(`${r}  ${n}`);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
