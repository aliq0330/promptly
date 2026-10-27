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
const TAG_CATALOG = [{ slug: "portre", label: "Portre" }, { slug: "anime", label: "Anime" }, { slug: "manzara", label: "Manzara" }];
const VARIABLES = [{ id: "v1", prompt_id: P1, name: "Stil", default_value: "noir", description: "Tarz", sort_order: 0, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", type: "select", options: [{ label: "Noir", value: "noir" }, { label: "Neon", value: "neon" }], config: {} }];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", detail = false, moderator = false, manageCount = 250, templateCount = 3, taxRows = [] } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { prompts: [], imports: [], importResult: null, variableCalls: 0, adminCalls: [], adminResult: null, manageQueries: [], manageCalls: [], manageFailAt: 0, impactCalls: [], impactFail: false, tagPuts: [], tagCreates: [], tagCatalog: TAG_CATALOG, tmplScans: [], tmplCalls: [], tmplFailAt: 0, taxQueries: [], taxCalls: [], taxFailAt: 0, taxRows: taxRows.map((r) => ({ ...r })) };
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
      if (at >= 0 && (body.p_force === true || state.manageRows[at].like_count === 0)) { state.manageRows.splice(at, 1); deleted += 1; }
    }
    return { body: { affected: deleted, skipped: body.p_ids.length - deleted } };
  };
  // Silme etkisi taklidi (docs/history/252-*): etkileşimli satır = 1 beğeni + 2 yorum + 1 koleksiyon kaydı; sunucu mantığı supabase/tests/admin-bulk-delete-force.sql'dedir.
  db.rpc.admin_bulk_delete_impact = (body) => {
    state.impactCalls.push(body);
    if (state.impactFail) return forbidden;
    const hit = body.p_ids.map((id) => state.manageRows.find((r) => r.id === id)).filter(Boolean);
    const engaged = hit.filter((r) => r.like_count > 0).length;
    return { body: { prompts: hit.length, engaged, likes: engaged, comments: engaged * 2, saves: engaged, quotes: 0, communityPosts: 0, results: 0, suggestions: 0, spaceItems: 0, workflowSteps: engaged, sharedInMessages: 0 } };
  };
  // ${Ad:Varsayılan} dönüştürme taklidi (docs/history/253-*): sunucu mantığı supabase/tests/admin-template-variables.sql'dedir; burada yalnız arayüz sözleşmesi.
  // Kendi promptların: 1 = Role+Topic, 2 = Mood + zaten tanımlı Stil, 3 = taslak, çakışan varsayılan (Ton); diğer kullanıcının 2 promptu yalnız 'all' kapsamında gelir.
  const tmplVars = (i) => (i % 3 === 0 ? [{ name: "Role", default: "Teacher", existing: false }, { name: "Topic", default: "Math", existing: false }] : i % 3 === 1 ? [{ name: "Mood", default: "", existing: false }, { name: "Stil", default: "Noir", existing: true }] : [{ name: "Ton", default: "Sıcak", existing: false }]);
  const tmplPool = (scope) => [
    ...Array.from({ length: templateCount }, (_, i) => ({ id: `f0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Şablon ${i + 1}`, author: "ben", status: i % 3 === 2 ? "draft" : "published", variables: tmplVars(i), conflicts: i % 3 === 2 ? 1 : 0, own: true })),
    ...(scope === "all" ? [0, 1].map((i) => ({ id: `f1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Başkası ${i + 1}`, author: "alice", status: "published", variables: [{ name: "Language", default: "French", existing: false }], conflicts: 0, own: false })) : []),
  ];
  state.tmplDone = new Set();
  db.rpc.admin_template_variables_candidates = (body) => {
    state.tmplScans.push(body);
    const left = tmplPool(body.p_scope).filter((x) => !state.tmplDone.has(x.id));
    return { body: { total: left.length, items: left.slice(0, body.p_limit).map(({ own, ...rest }) => rest) } };
  };
  db.rpc.admin_convert_template_variables = (body) => {
    state.tmplCalls.push(body);
    if (state.tmplFailAt > 0 && state.tmplCalls.length === state.tmplFailAt) return forbidden;
    const hit = tmplPool(body.p_scope).filter((x) => body.p_ids.includes(x.id) && !state.tmplDone.has(x.id));
    hit.forEach((x) => state.tmplDone.add(x.id));
    return { body: { affected: hit.length, skipped: body.p_ids.length - hit.length, variables: hit.reduce((n, x) => n + x.variables.filter((v) => !v.existing).length, 0), conflicts: hit.reduce((n, x) => n + x.conflicts, 0) } };
  };
  // Toplu tür/kategori taklidi (docs/history/260-*): sunucu mantığı supabase/tests/admin-bulk-taxonomy.sql'dedir; burada yalnız arayüz sözleşmesi
  // (kategori dolu satır overwrite kapalıyken atlanır; kategori null = geri alma).
  db.rpc.admin_bulk_set_prompt_taxonomy = (body) => {
    state.taxCalls.push(body);
    if (state.taxFailAt > 0 && state.taxCalls.length === state.taxFailAt) return forbidden;
    let affected = 0;
    let already = 0;
    for (const item of body.p_items) {
      const r = state.taxRows.find((x) => x.id === item.id);
      if (!r) continue;
      if (r.category !== null && !body.p_overwrite) { already += 1; continue; }
      if (r.content_type === item.content_type && r.category === item.category && r.subcategory === (item.category ? item.subcategory : null)) continue;
      r.content_type = item.content_type; r.category = item.category; r.subcategory = item.category ? item.subcategory : null;
      affected += 1;
    }
    return { body: { affected, skipped: body.p_items.length - affected, invalid: [], not_mine: 0, already_categorized: already, subcategory_dropped: 0 } };
  };
  db.rpc.get_or_create_tag = (body) => {
    state.tagCreates.push(body.p_label);
    return { body: { slug: body.p_label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: body.p_label } };
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
    if (ctx.table === "prompts" && ctx.method === "GET" && ctx.sel.replace(/\s/g, "") === "id,title,content_type,category,subcategory") {
      state.taxQueries.push(Object.fromEntries(ctx.q.entries()));
      const offset = Number(ctx.q.get("offset") ?? 0);
      const limit = Number(ctx.q.get("limit") ?? 1000);
      return ctx.rows(state.taxRows.slice(offset, offset + limit));
    }
    if (ctx.table === "tags" && ctx.method === "GET" && ctx.sel.replace(/\s/g, "") === "slug,label") return ctx.rows(state.tagCatalog);
    // Etiketleme için prompt okuma (docs/history/252-*): başlık + metin + var olan etiketler; metin sıraya göre değişir.
    if (ctx.table === "prompts" && ctx.method === "GET" && ctx.sel.includes("prompt_text") && ctx.sel.includes("prompt_tags(tag_slug)")) {
      const ids = (ctx.q.get("id") ?? "").replace(/^in\./, "").replace(/[()]/g, "").split(",");
      const texts = ["bir anime portrait sahnesi", "manzara and photography", "düz metin"];
      return ctx.rows(ids.map((id) => state.manageRows.find((r) => r.id === id)).filter(Boolean).map((r) => ({ id: r.id, title: r.title, prompt_text: texts[(Number(r.title.replace("Toplu ", "")) - 1) % 3], prompt_tags: [] })));
    }
    if (ctx.table === "prompt_tags" && ctx.method === "POST") {
      state.tagPuts.push({ rows: ctx.body, query: Object.fromEntries(ctx.q.entries()) });
      return ctx.json(201, []);
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


await scenario("25. Etkileşimi olanları da sil (B): silmeden önce etki sayılır ve gösterilir; kutu işaretlenmeden p_force gitmez; işaretlenince hepsi gider", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-delete").click();
  await page.getByTestId("manage-impact").waitFor();
  const impact = await page.getByTestId("manage-impact").innerText();
  assert.match(impact, /5 promptta başkalarının etkileşimi var\. Normal silme bunları atlar\./);
  assert.match(impact, /5 beğeni, 10 yorum, 5 koleksiyon kaydı, 0 alıntı, 0 topluluk gönderisi, 0 sonuç görseli, 0 düzenleme önerisi/);
  assert.match(impact, /5 workflow adımı/);
  assert.deepEqual(state.impactCalls.map((c) => c.p_ids.length), [100, 100, 50], "etki de parçalarla sayılır");
  assert.equal(state.manageCalls.length, 0, "etki sayımı hiçbir şey silmez");
  assert.equal(await page.getByTestId("manage-force").isChecked(), false, "varsayılan: kapalı");
  assert.match(await page.getByTestId("manage-confirm-yes").innerText(), /Evet, kalıcı sil/);
  await page.getByTestId("manage-force").check();
  assert.match(await page.getByTestId("manage-confirm-yes").innerText(), /Evet, etkileşimleriyle birlikte sil/);
  await page.getByTestId("manage-confirm-yes").click();
  await page.getByTestId("manage-outcome").waitFor();
  assert.ok(state.manageCalls.every((c) => c.fn === "delete" && c.p_force === true), "p_force=true gönderildi");
  assert.match(await page.getByTestId("manage-outcome").innerText(), /250 prompt etkileşimleriyle birlikte silindi, 0 atlandı\./);
  assert.equal(await rowsOf(page).count(), 0);
  // sonraki silme tekrar kapalı başlar
}, { moderator: true });

await scenario("26. Etkileşimsiz seçimde onay kutusu çıkmaz ('kimsenin etkileşimi yok'); kutu işaretsizken p_force gönderilmez", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-search").fill("Toplu 25");
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-delete").click();
  await page.getByTestId("manage-impact-none").waitFor();
  assert.equal(await page.getByTestId("manage-force").count(), 0);
  await page.getByTestId("manage-confirm-yes").click();
  await page.getByTestId("manage-outcome").waitFor();
  assert.ok(state.manageCalls.every((c) => c.p_force === undefined), "kutu yoksa eski 1 argümanlı biçim");
  assert.match(await page.getByTestId("manage-outcome").innerText(), /2 prompt silindi, 0 atlandı/);
}, { moderator: true });

await scenario("27. Etki hesaplanamazsa silme onayı kilitli kalır (hiçbir şey silinmez); Vazgeç çalışır; İngilizce", async ({ page, state }) => {
  state.impactFail = true;
  await openManage(page);
  await page.getByTestId("manage-select-all").click();
  await page.getByTestId("manage-delete").click();
  await page.getByTestId("manage-impact-failed").waitFor();
  assert.match(await page.getByTestId("manage-impact-failed").innerText(), /Couldn't work out the impact; nothing was deleted/);
  assert.equal(await page.getByTestId("manage-confirm-yes").isDisabled(), true);
  await page.getByTestId("manage-cancel").click();
  assert.equal(await page.getByTestId("manage-confirm").count(), 0);
  assert.equal(state.manageCalls.length, 0);
  state.impactFail = false;
  await page.getByTestId("manage-delete").click();
  await page.getByTestId("manage-impact").waitFor();
  assert.match(await page.getByTestId("manage-impact").innerText(), /5 prompt\(s\) have other people's activity/);
  assert.equal(await page.getByTestId("manage-force").isChecked(), false);
}, { moderator: true, lang: "en" });

await scenario("28. Etiketle (mevcut promptlara): yalnız 'Otomatik' açıkken katalog etiketleri eklenir, yeni etiket oluşturulmaz; 'Önerilen' ile yeni etiket de oluşur", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-status").selectOption("draft");
  await page.getByTestId("manage-first-n").fill("50");
  await page.getByTestId("manage-select-first").click();
  await page.getByTestId("manage-tag-open").click();
  await page.getByTestId("manage-tag-panel").waitFor();
  assert.equal(await page.getByTestId("manage-autotag-automatic").isChecked(), true);
  assert.equal(await page.getByTestId("manage-autotag-suggested").isChecked(), false);
  await page.getByTestId("manage-tag-run").click();
  await page.getByTestId("manage-tag-outcome").waitFor();
  assert.match(await page.getByTestId("manage-tag-outcome").innerText(), /34 promptta toplam 51 etiket eklendi, 0 yeni etiket oluşturuldu\./);
  const links = state.tagPuts.flatMap((c) => c.rows);
  assert.equal(links.length, 51);
  assert.ok(links.every((l) => l.source === "automatic" && ["anime", "portre", "manzara"].includes(l.tag_slug)));
  assert.ok(state.tagPuts.every((c) => c.query.on_conflict === "prompt_id,tag_slug"), "yinelenen bağlar yok sayılır (var olan etiket değişmez)");
  assert.deepEqual(state.tagCreates, []);
  // Önerilen de açık: aday sözlüğünden gelen (ör. Photography) yeni etiket olarak oluşturulur, bir kez
  state.tagPuts.length = 0;
  await page.getByTestId("manage-autotag-suggested").check();
  await page.getByTestId("manage-tag-run").click();
  await page.getByTestId("manage-tag-outcome").filter({ hasText: /yeni etiket oluşturuldu/ }).waitFor();
  assert.ok(state.tagCreates.includes("Photography"), "aday etiket get_or_create_tag ile oluşturuldu");
  assert.equal(state.tagCreates.filter((l) => l === "Photography").length, 1, "aynı etiket tekrar tekrar oluşturulmaz");
  assert.ok(state.tagPuts.flatMap((c) => c.rows).some((l) => l.tag_slug === "photography" && l.source === "manual"));
  assert.deepEqual(state.manageCalls, [], "etiketleme görünürlüğe/silmeye dokunmaz");
}, { moderator: true });

await scenario("29. Etiket seçenekleri kapalıyken çalıştır kilitli; seçim yokken düğme kapalı; İngilizce metinler", async ({ page, state }) => {
  await openManage(page);
  await page.getByTestId("manage-select-first").click();
  await page.getByTestId("manage-tag-open").click();
  await page.getByTestId("manage-autotag-automatic").uncheck();
  assert.equal(await page.getByTestId("manage-tag-run").isDisabled(), true);
  await page.getByText("Turn on at least one option.").waitFor();
  assert.equal(state.tagPuts.length, 0);
}, { moderator: true, lang: "en" });

await scenario("30. Toplu yükleme: otomatik etiket varsayılan AÇIK, dosyadaki ve ortak etiketin üstüne eklenir; kapalıyken eklenmez; Önerilen yeni etiket adaylarını da ekler", async ({ page, state }) => {
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-import").waitFor();
  const file = [
    { title: "A", promptText: "bir anime portrait sahnesi çiz", contentType: "text", tags: ["özel"] },
    { title: "B", promptText: "düz metin", contentType: "text" },
  ];
  await page.getByTestId("bulk-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByTestId("bulk-loaded").waitFor();
  assert.equal(await page.getByTestId("bulk-autotag-automatic").isChecked(), true);
  assert.equal(await page.getByTestId("bulk-autotag-suggested").isChecked(), false);
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  const first = state.adminCalls[0].p_items;
  assert.deepEqual(first[0].tags.slice(0, 2), ["özel", "prompts.chat"], "dosyadaki + ortak etiket önce");
  assert.ok(first[0].tags.includes("Anime") && first[0].tags.includes("Portre"), "katalog etiketleri eklendi");
  assert.deepEqual(first[1].tags, ["prompts.chat"], "eşleşmeyen prompta yalnız ortak etiket");
  assert.match(await page.getByTestId("bulk-autonote").innerText(), /1 prompta toplam 2 etiket eklendi/);
  // kapalı
  state.adminCalls.length = 0;
  await page.getByTestId("bulk-autotag-automatic").uncheck();
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.deepEqual(state.adminCalls[0].p_items[0].tags, ["özel", "prompts.chat"]);
  assert.equal(await page.getByTestId("bulk-autonote").count(), 0);
  // önerilen
  state.adminCalls.length = 0;
  await page.getByTestId("bulk-autotag-suggested").check();
  await page.getByTestId("bulk-tag").fill("");
  const cand = [{ title: "C", promptText: "photography tips for travel", contentType: "text" }];
  await page.getByTestId("bulk-file").setInputFiles({ name: "y.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(cand)) });
  await page.getByTestId("bulk-loaded").waitFor();
  await page.getByTestId("bulk-run").click();
  await page.getByTestId("bulk-outcome").waitFor();
  assert.ok(state.adminCalls[0].p_items[0].tags.includes("Photography"), "aday sözlüğünden gelen etiket eklendi");
  assert.ok(state.adminCalls[0].p_items[0].tags.length <= 20);
  assert.deepEqual(state.tagCreates, [], "yükleme tarafında etiketi sunucu (import RPC'si) oluşturur; istemci get_or_create_tag çağırmaz");
}, { moderator: true });


// ---- ${Ad:Varsayılan} → değişken (docs/history/253-*) ----
async function openTemplate(page) {
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("template-vars").waitFor();
}
const templateRows = (page) => page.getByTestId("template-row");

await scenario("31. Şablon değişkenleri: varsayılan kapsam 'yalnız kendi promptlarım'; tarama yazmaz; her prompt için olacaklar listelenir; tek tuşla dönüşür, onay istemez, sonra yeniden taranır", async ({ page, state }) => {
  await openTemplate(page);
  assert.equal(await page.getByTestId("template-scope-own").isChecked(), true);
  assert.equal(await page.getByTestId("template-scope-all").isChecked(), false);
  assert.equal(await page.getByTestId("template-convert").count(), 0, "taramadan önce dönüştür düğmesi yok");
  await page.getByTestId("template-scan").click();
  await page.getByTestId("template-summary").waitFor();
  assert.deepEqual(state.tmplScans, [{ p_scope: "own", p_limit: 1000 }]);
  assert.equal(state.tmplCalls.length, 0, "tarama hiçbir şey yazmaz");
  assert.match(await page.getByTestId("template-summary").innerText(), /3 promptta 4 yeni değişken dönüşecek\./);
  assert.equal(await templateRows(page).count(), 3);
  const first = await templateRows(page).nth(0).innerText();
  assert.match(first, /\{Role\} = Teacher/);
  assert.match(first, /\{Topic\} = Math/);
  assert.match(await templateRows(page).nth(1).innerText(), /\{Stil\} = Noir/, "zaten tanımlı değişken de gösterilir");
  assert.match(await templateRows(page).nth(2).innerText(), /farklı varsayılanlarla geçiyor/);
  assert.equal(await page.getByTestId("template-list").locator("input:checked").count(), 3, "hepsi varsayılan seçili");
  assert.match(await page.getByTestId("template-convert").innerText(), /3 promptu dönüştür/);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-outcome").waitFor();
  assert.equal(await page.getByTestId("template-confirm").count(), 0, "kendi promptların için onay yok");
  assert.equal(state.tmplCalls.length, 1);
  assert.equal(state.tmplCalls[0].p_scope, "own");
  assert.equal(state.tmplCalls[0].p_ids.length, 3);
  assert.match(await page.getByTestId("template-outcome").innerText(), /3 prompt dönüştürüldü, 4 yeni değişken eklendi, 0 atlandı\./);
  assert.match(await page.getByTestId("template-outcome").innerText(), /1 yerde aynı ad farklı varsayılanla/);
  await page.getByText("Dönüştürülecek ${…} yazımı bulunamadı.").waitFor();
  assert.equal(state.tmplScans.length, 2, "dönüşümden sonra yeniden tarandı");
  assert.equal(await templateRows(page).count(), 0);
}, { moderator: true });

await scenario("32. 'Tüm promptlar' ayrı ve uyarılı seçenek: başkasının promptları @yazarla listelenir, dönüştürmeden önce AÇIK onay ister (Vazgeç çağrı yapmaz); onaylanınca p_scope=all gider", async ({ page, state }) => {
  await openTemplate(page);
  await page.getByText("başka kullanıcıların prompt metnini değiştirir").waitFor();
  await page.getByTestId("template-scope-all").check();
  await page.getByTestId("template-scan").click();
  await page.getByTestId("template-summary").waitFor();
  assert.equal(state.tmplScans[0].p_scope, "all");
  assert.equal(await templateRows(page).count(), 5);
  assert.match(await page.getByTestId("template-list").innerText(), /@alice/);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-confirm").waitFor();
  assert.match(await page.getByTestId("template-confirm").innerText(), /Başka kullanıcıların promptları da dahil 5 prompt dönüştürülecek\./);
  assert.match(await page.getByTestId("template-confirm").innerText(), /Yazarlara bildirim gitmez/);
  assert.equal(state.tmplCalls.length, 0, "onay verilmeden hiçbir şey yazılmaz");
  await page.getByTestId("template-cancel").click();
  assert.equal(await page.getByTestId("template-confirm").count(), 0);
  assert.equal(state.tmplCalls.length, 0);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-confirm-yes").click();
  await page.getByTestId("template-outcome").waitFor();
  assert.equal(state.tmplCalls.length, 1);
  assert.equal(state.tmplCalls[0].p_scope, "all");
  assert.equal(state.tmplCalls[0].p_ids.length, 5);
  assert.match(await page.getByTestId("template-outcome").innerText(), /5 prompt dönüştürüldü/);
}, { moderator: true });

await scenario("33. Seçim: tek tek çıkarılabilir; hiçbiri seçili değilken düğme kapalı; yalnız seçilenler gönderilir; kapsam taramadan sonra değiştirilirse eski taramanın kapsamı kullanılır", async ({ page, state }) => {
  await openTemplate(page);
  await page.getByTestId("template-scan").click();
  await page.getByTestId("template-summary").waitFor();
  await templateRows(page).nth(0).locator("input").uncheck();
  assert.match(await page.getByTestId("template-convert").innerText(), /2 promptu dönüştür/);
  await page.getByTestId("template-clear").click();
  assert.equal(await page.getByTestId("template-convert").isDisabled(), true);
  await templateRows(page).nth(1).locator("input").check();
  await page.getByTestId("template-scope-all").check();
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-outcome").waitFor();
  assert.equal(state.tmplCalls.length, 1, "kendi taraması 'own' idi: onay istemeden 'own' ile gitti");
  assert.deepEqual(state.tmplCalls[0], { p_ids: ["f0000000-0000-4000-8000-000000000001"], p_scope: "own" });
}, { moderator: true });

await scenario("34. 250 prompt: 100'erli 3 çağrı, sonuç toplamı yazar; liste 100'erli gösterilir; tekrar tarayınca boş", async ({ page, state }) => {
  await openTemplate(page);
  await page.getByTestId("template-scan").click();
  await page.getByTestId("template-summary").waitFor();
  assert.match(await page.getByTestId("template-summary").innerText(), /250 promptta/);
  assert.equal(await templateRows(page).count(), 100);
  assert.match(await page.getByTestId("template-showing").innerText(), /100 \/ 250 gösteriliyor/);
  await page.getByTestId("template-more").click();
  assert.equal(await templateRows(page).count(), 200);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-outcome").waitFor();
  assert.deepEqual(state.tmplCalls.map((c) => c.p_ids.length), [100, 100, 50]);
  assert.match(await page.getByTestId("template-outcome").innerText(), /250 prompt dönüştürüldü/);
  await page.getByText("Dönüştürülecek ${…} yazımı bulunamadı.").waitFor();
}, { moderator: true, templateCount: 250 });

await scenario("35. Yarıda kalma: 2. parça hata verirse 1. parça dönüşmüş kalır, uyarı gösterilir, kalanlar listede durur; yeniden denenince tamamlanır; İngilizce + telefonda taşma yok", async ({ page, state }) => {
  state.tmplFailAt = 2;
  await openTemplate(page);
  await page.getByTestId("template-scan").click();
  await page.getByTestId("template-summary").waitFor();
  assert.match(await page.getByTestId("template-summary").innerText(), /250 new variable|will be created across 250 prompt/);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-partial").waitFor();
  assert.match(await page.getByTestId("template-partial").innerText(), /100 \/ 250/);
  assert.match(await page.getByTestId("template-outcome").innerText(), /100 prompt\(s\) converted/);
  await page.getByTestId("template-error").waitFor();
  assert.match(await page.getByTestId("template-summary").innerText(), /across 150 prompt/, "kalan 150 yeniden tarandı");
  assert.equal(await overflowFree(page), true);
  await page.getByTestId("template-convert").click();
  await page.getByTestId("template-outcome").filter({ hasText: /150 prompt\(s\) converted/ }).waitFor();
  await page.getByText("No ${…} syntax to convert was found.").waitFor();
}, { moderator: true, lang: "en", templateCount: 250, viewport: { width: 375, height: 800 } });


// ===================== Toplu tür / kategori (docs/history/260-*) =====================
const taxBlock = (title, tur, kategori, alt) => `<details>\n<summary><strong>${title}</strong></summary>\n\n**Tür:** ${tur}\n\n**Kategori:** ${kategori}\n${alt ? `\n**Alt kategori:** ${alt}\n` : ""}\n## ${title}\n\nContributed by [@kisi](https://github.com/kisi)\n\n\`\`\`md\nmetin ${title}\n\`\`\`\n</details>\n`;
const taxFile = (blocks) => ({ name: "PROMPTS_categorized.md", mimeType: "text/markdown", buffer: Buffer.from(`# Awesome\n\n${blocks.join("\n")}`) });
const taxRow = (i, extra = {}) => ({ id: `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Tax ${i}`, content_type: "text", category: null, subcategory: null, ...extra });
async function openTaxonomy(page) {
  await page.goto(`${BASE}/moderation`);
  await page.getByTestId("bulk-taxonomy").waitFor();
}

await scenario("36. Kategori motoru: dosya seçilince ÖNİZLEME (yazmaz); onay iki adımlı; yedek yazımdan önce iner; sunucuya doğru türler gider; Geri al eski değerlere döner", async ({ page, state }) => {
  await openTaxonomy(page);
  assert.equal(await page.getByTestId("taxonomy-apply").count(), 0, "dosyadan önce uygula düğmesi yok");
  const file = taxFile([
    taxBlock("Tax 1", "Metin", "Metin – Kodlama", "Kod"),
    taxBlock("Tax 2", "Metin", "Metin – Yazarlık", "Hikâye"),
    taxBlock("Tax 3", "Görsel", "Görsel – İnsan & Karakter", "Portre"),
    taxBlock("Tax 4", "Video", "Video – Sinematik", "Sinematik Sahne"),
    taxBlock("Tax 5", "Metin", "Metin – Eğitim", "Ders"),
    taxBlock("Başka Yerde", "Ses", "Ses – Müzik", "Şarkı"),
  ]);
  await page.getByTestId("taxonomy-file").setInputFiles(file);
  await page.getByTestId("taxonomy-preview").waitFor();
  assert.deepEqual(state.taxCalls, [], "önizleme hiçbir şey yazmaz");
  assert.match(await page.getByTestId("taxonomy-summary").innerText(), /Dosyada 6 kayıt \(6 geçerli\)\. Promptlarınla eşleşen: 5\. Yazılacak: 4\./);
  assert.match(await page.getByTestId("taxonomy-type-text").innerText(), /Metin: 2/);
  assert.match(await page.getByTestId("taxonomy-type-image").innerText(), /Görsel: 1/);
  assert.match(await page.getByTestId("taxonomy-type-video").innerText(), /Video: 1/);
  assert.match(await page.getByTestId("taxonomy-already").innerText(), /1 promptun kategorisi zaten dolu/);
  assert.match(await page.getByTestId("taxonomy-notfound").innerText(), /1 kayıt kütüphanende bulunamadı/);
  assert.match(await page.getByTestId("taxonomy-odak-note").innerText(), /1 prompt Video\/Ses olacak/);
  await page.getByTestId("taxonomy-apply").click();
  await page.getByTestId("taxonomy-confirm").waitFor();
  assert.deepEqual(state.taxCalls, [], "ilk tık yalnız onay ister");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("taxonomy-confirm").click()]);
  assert.match(download.suggestedFilename(), /^promptly-kategori-yedek-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.equal(backup.length, 4);
  assert.deepEqual(backup[0].before, { contentType: "text", category: null, subcategory: null });
  await page.getByTestId("taxonomy-outcome").waitFor();
  assert.equal(state.taxCalls.length, 1);
  assert.equal(state.taxCalls[0].p_overwrite, false);
  assert.deepEqual(state.taxCalls[0].p_items.map((i) => `${i.content_type}/${i.category}/${i.subcategory}`).sort(), ["image/human_character/portrait", "text/coding/code", "text/writing/story", "video/cinematic/cinematic_scene"]);
  assert.match(await page.getByTestId("taxonomy-outcome").innerText(), /4 prompt kategorilendi, 0 atlandı\./);
  assert.equal(state.taxRows.find((r) => r.title === "Tax 4").content_type, "video");
  await page.getByTestId("taxonomy-undo").click();
  await page.getByTestId("taxonomy-outcome").filter({ hasText: /eski haline döndürüldü/ }).waitFor();
  assert.equal(state.taxCalls.length, 2);
  assert.equal(state.taxCalls[1].p_overwrite, true, "geri alma overwrite ister");
  assert.ok(state.taxCalls[1].p_items.every((i) => i.category === null && i.content_type === "text"));
  assert.deepEqual(state.taxRows.filter((r) => r.title !== "Tax 5").map((r) => `${r.content_type}/${r.category}`), ["text/null", "text/null", "text/null", "text/null"], "dört prompt eski hâlinde");
  assert.equal(state.taxRows.find((r) => r.title === "Tax 5").category, "teaching_dummy", "elle kategorili prompta dokunulmadı");
}, { moderator: true, taxRows: [taxRow(1), taxRow(2), taxRow(3), taxRow(4), taxRow(5, { category: "teaching_dummy" })] });

await scenario("37. Kategorili olmayan / bozuk dosya anlaşılır mesaj verir ve hiçbir çağrı yapmaz; 'üzerine yaz' yazılacak sayıyı değiştirir; 150 kayıt 100'erli 2 çağrı", async ({ page, state }) => {
  await openTaxonomy(page);
  await page.getByTestId("taxonomy-file").setInputFiles({ name: "x.md", mimeType: "text/markdown", buffer: Buffer.from("merhaba") });
  await page.getByTestId("taxonomy-problem").waitFor();
  assert.match(await page.getByTestId("taxonomy-problem").innerText(), /Tür \/ Kategori satırları yok/);
  const plain = `<details>\n<summary><strong>P</strong></summary>\n\nContributed by [@a](https://github.com/a)\n\n\`\`\`md\nm\n\`\`\`\n</details>`;
  await page.getByTestId("taxonomy-file").setInputFiles({ name: "plain.md", mimeType: "text/markdown", buffer: Buffer.from(plain) });
  await page.getByTestId("taxonomy-problem").filter({ hasText: /Tür \/ Kategori satırları yok/ }).waitFor();
  assert.deepEqual(state.taxCalls, []);
  const blocks = Array.from({ length: 150 }, (_, i) => taxBlock(`Tax ${i + 1}`, "Metin", "Metin – Araştırma", "Analiz"));
  await page.getByTestId("taxonomy-file").setInputFiles(taxFile(blocks));
  await page.getByTestId("taxonomy-preview").waitFor();
  assert.match(await page.getByTestId("taxonomy-summary").innerText(), /Yazılacak: 100\./, "50'si zaten kategorili: varsayılan olarak ezilmez");
  await page.getByTestId("taxonomy-overwrite").check();
  assert.match(await page.getByTestId("taxonomy-summary").innerText(), /Yazılacak: 150\./);
  await page.getByTestId("taxonomy-apply").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("taxonomy-confirm").click()]);
  assert.ok(download);
  await page.getByTestId("taxonomy-outcome").waitFor();
  assert.deepEqual(state.taxCalls.map((c) => c.p_items.length), [100, 50]);
  assert.ok(state.taxCalls.every((c) => c.p_overwrite === true));
  assert.match(await page.getByTestId("taxonomy-outcome").innerText(), /150 prompt kategorilendi/);
}, { moderator: true, taxRows: Array.from({ length: 150 }, (_, i) => taxRow(i + 1, i < 50 ? { category: "writing", subcategory: "story" } : {})) });

await scenario("38. Yarıda kalma: 2. parça hata verirse 1. parça yazılmış kalır, uyarı gösterilir; İngilizce metinler + telefonda taşma yok", async ({ page, state }) => {
  state.taxFailAt = 2;
  await openTaxonomy(page);
  const blocks = Array.from({ length: 150 }, (_, i) => taxBlock(`Tax ${i + 1}`, "Ses", "Ses – Müzik", "Şarkı"));
  await page.getByTestId("taxonomy-file").setInputFiles(taxFile(blocks));
  await page.getByTestId("taxonomy-preview").waitFor();
  assert.match(await page.getByTestId("taxonomy-summary").innerText(), /150 entries in the file \(150 valid\)\. Matched to your prompts: 150\. To be written: 150\./);
  assert.match(await page.getByTestId("taxonomy-type-audio").innerText(), /Audio: 150/);
  assert.match(await page.getByTestId("taxonomy-odak-note").innerText(), /150 prompt\(s\) will become Video\/Audio/);
  assert.equal(await overflowFree(page), true);
  await page.getByTestId("taxonomy-apply").click();
  await page.getByTestId("taxonomy-confirm").waitFor();
  assert.match(await page.getByTestId("bulk-taxonomy").innerText(), /150 prompt\(s\) will change type and category/);
  await Promise.all([page.waitForEvent("download"), page.getByTestId("taxonomy-confirm").click()]);
  await page.getByTestId("taxonomy-partial").waitFor();
  await page.getByTestId("taxonomy-error").waitFor();
  assert.match(await page.getByTestId("taxonomy-outcome").innerText(), /100 prompt\(s\) categorized/);
  assert.equal(state.taxRows.filter((r) => r.category === "music").length, 100);
  assert.equal(await overflowFree(page), true);
}, { moderator: true, lang: "en", viewport: { width: 375, height: 800 }, taxRows: Array.from({ length: 150 }, (_, i) => taxRow(i + 1)) });

await browser.close();
server.close();
const failed = results.filter(([r]) => r === "FAIL");
for (const [r, n] of results) console.log(`${r}  ${n}`);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
