// Workflow ↔ Space bağlantısı arayüzü (docs/history/261-*): pano çerçevesi (akış diyagramı), Space içinden "Workflow aktar", workflow
// formundaki "Space'te göster", workflow sayfasındaki "Space panosu" önizlemesi (herkese açık / özel / çoklu Space / ziyaretçi),
// İngilizce, telefonda taşma yok. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (yetki kuralı: supabase/tests/space-workflow-flow.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4197;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const WID = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PID = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const eqv = (v) => (v?.startsWith("eq.") ? v.slice(3) : null);
const inv = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : null);

const PROMPTS = [
  [1, "Ürün konsepti yazıcı", U.carol],
  [2, "Midjourney prompt çevirici", U.bob],
  [3, "Sinematik ışık görseli", U.carol],
  [4, "Sosyal medya caption", U.bob],
];
const promptRow = (n, title, u) => ({
  id: PID(n), title, description: "d", prompt_text: `${title} metni`, tool: null, tools: [], content_type: "text", category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 1, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-09-20T10:00:00Z",
  show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null,
  community_id: null, profiles: author(u), prompt_media: [], prompt_tags: [],
});
const workflowRow = (n, over = {}) => ({
  id: WID(n), creator_id: ME, title: `Workflow ${n}`, description: "", cover_url: null, content_types: ["text"], category: null, subcategory: null, tools: [], status: "published",
  visibility: "public", community_id: null, like_count: 0, save_count: 0, comment_count: 0, created_at: `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00Z`,
  updated_at: "2026-09-20T10:00:00Z", profiles: author(Object.values(U).find((u) => u.id === (over.creator_id ?? ME))), workflow_steps: [{ count: 4 }], workflow_tags: [], workflow_media: [], ...over,
});
const STEP_TITLES = ["Konsept yaz", "Görsel prompt'u üret", "Görseli üret", "Başlık ve caption"];
const stepRows = (wid) =>
  STEP_TITLES.map((title, i) => ({
    id: `${wid}-s${i + 1}`.slice(-36).padStart(36, "5"), position: i, title, description: "", instructions: "", step_type: "prompt", prompt_id: PID(i + 1), request_id: null,
    inputs: i === 0 ? [{ id: "i1", label: "{ürün}", source: null }, { id: "i2", label: "{kitle}", source: null }] : [{ id: `i${i + 2}`, label: `girdi ${i}`, source: { stepId: `${wid}-s${i}`.slice(-36).padStart(36, "5"), outputId: `o${i}` } }],
    outputs: [{ id: `o${i + 1}`, label: ["Konsept metni", "Görsel prompt'u", "4 görsel", "Sosyal medya metni"][i] }],
  }));

/** Tüm senaryolar için ortak taklit veri + workflow uçları (mock-spaces'in tablo kancasının DIŞINA sarılır). */
function setupWorkflowSpace(db) {
  setupSpaces(db);
  db.workflows = [workflowRow(1, { title: "Ürün lansman görseli" }), workflowRow(2, { title: "Özel workflow", visibility: "private" }), workflowRow(3, { title: "Başkasının workflow'u", creator_id: U.carol.id })];
  db.wfRelations = [{ id: "r1", source_type: "prompt", source_id: PID(1), target_type: "prompt", target_id: PID(2), relation_type: "similar", note: null, created_by: ME }];
  db.addWorkflowItem = (spaceN, over = {}) =>
    Object.assign(db.addItem(SID(spaceN), { kind: "content", x: 0, y: 0, w: 900, h: 420, z: 1, ...over }), { content_type: "workflow", content_id: WID(1), flow_show_io: true, flow_show_links: true, flow_show_relations: true, ...over.flow });
  const prior = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, method, q, signedIn, json, rows } = ctx;
    if (table === "prompts" && method === "GET") {
      const ids = inv(q.get("id")) ?? (eqv(q.get("id")) ? [eqv(q.get("id"))] : null);
      if (ids) return rows(PROMPTS.filter(([n]) => ids.includes(PID(n))).map(([n, title, u]) => promptRow(n, title, u)));
    }
    if (table === "workflows" && method === "GET") {
      let list = db.workflows.filter((w) => w.visibility === "public" || w.creator_id === signedIn);
      const byId = eqv(q.get("id"));
      const ids = inv(q.get("id"));
      if (byId) list = list.filter((w) => w.id === byId);
      if (ids) list = list.filter((w) => ids.includes(w.id));
      const creator = eqv(q.get("creator_id"));
      if (creator) list = list.filter((w) => w.creator_id === creator && w.status === "published");
      list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const offset = Number(q.get("offset") ?? 0);
      const limit = Number(q.get("limit") ?? 1000);
      return rows(creator ? list.slice(offset, offset + limit) : list);
    }
    if (table === "workflow_steps" && method === "GET") {
      const wid = eqv(q.get("workflow_id"));
      return rows(wid ? stepRows(wid) : []);
    }
    if (table === "content_relations" && method === "GET") return rows(db.wfRelations);
    // Düzenleme kaydı (workflow formu): içerik RPC'si + üst satır güncellemesi + yan tablolar.
    if (table === "rpc/save_workflow_content") return json(200, null);
    if (table === "workflows" && method === "PATCH") return rows([{ id: eqv(q.get("id")) }]);
    if (["workflow_media", "workflow_tags"].includes(table) && ["DELETE", "POST"].includes(method)) return json(200, []);
    return prior ? prior(ctx) : false;
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, lang = "tr", guest = false, touch = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupWorkflowSpace(db);
  setup?.(db);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await installMock(context, db, { guest });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // `spaces`↔`space_items` arasında iki yabancı anahtar var: gömme (`spaces!…`) PostgREST'te belirsizdir (PGRST201) — hiçbir istek kullanmamalı.
  page.on("request", (r) => { if (/[?&]select=[^&]*spaces(%21|!)/.test(r.url())) errors.push(`belirsiz gömme: ${r.url()}`); });
  try {
    await fn({ page, db, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/wfspace-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const calls = (db, method, table) => db.calls.filter((c) => c.method === method && c.table === table);
const waitFor = async (check, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const boardUrl = (n) => `${BASE}/spaces/local?id=${SID(n)}&tab=board`;
const wfUrl = (n) => `${BASE}/workflows/local?id=${WID(n)}`;

// ---------------------------------------------------------------- pano çerçevesi
await scenario("1 pano: workflow öğesi akış diyagramı olarak çizilir (adımlar, oklar, içerik kartları, ilişki)", async ({ page }) => {
  await page.goto(boardUrl(1));
  const flow = page.locator("[data-board-item] [data-workflow-flow]");
  await flow.waitFor();
  assert.equal(await flow.locator("[data-flow-node]").count(), 4, "dört adım");
  assert.equal(await flow.locator("[data-flow-link]").count(), 4, "dört içerik kartı");
  const text = await flow.innerText();
  for (const s of ["Konsept yaz", "Ürün lansman görseli", "Ürün konsepti yazıcı", "@carol", "Benzer", "GİRDİ", "ÇIKTI"]) assert.ok(text.includes(s) || text.toUpperCase().includes(s.toUpperCase()), `diyagramda "${s}" var`);
  assert.ok(text.includes("↩ Adım 1"), "bağlı girdi önceki adıma işaret eder");
  assert.equal(await flow.locator("svg path[marker-end]").count(), 3, "üç ok");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); } });

await scenario("1b pano: katman bayrakları — kapalı katman çizilmez", async ({ page }) => {
  await page.goto(boardUrl(1));
  const flow = page.locator("[data-board-item] [data-workflow-flow]");
  await flow.waitFor();
  assert.equal(await flow.locator("[data-flow-link]").count(), 0, "içerik kartı yok");
  assert.ok(!(await flow.innerText()).includes("Benzer"), "ilişki yok");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); db.addWorkflowItem(1, { flow: { flow_show_links: false, flow_show_relations: false } }); } });

await scenario("1c pano: erişilemeyen workflow sade 'erişilemiyor' kartı olarak kalır, hata yok", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-board-item][data-kind=content]").waitFor();
  assert.equal(await page.locator("[data-workflow-flow]").count(), 0);
  assert.ok((await page.locator("[data-board-item][data-kind=content]").innerText()).length > 0);
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); const item = db.addWorkflowItem(1); item.content_id = WID(9); } });

// ---------------------------------------------------------------- Workflow aktar
async function openImport(page) {
  await page.getByRole("button", { name: "Ekle" }).first().click();
  await page.getByRole("menuitem", { name: "Workflow aktar" }).click();
  await page.getByRole("dialog").waitFor();
}

await scenario("2 aktar: yalnız kendi yayınlanmış workflow'ların listelenir; seçince önizleme, katmanlar önizlemeyi değiştirir", async ({ page }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).waitFor();
  assert.equal(await dialog.getByRole("radio", { name: /Başkasının workflow'u/ }).count(), 0, "başkasının workflow'u yok");
  assert.ok(await dialog.getByRole("radio", { name: /Özel workflow/ }).count() === 1, "kendi özel workflow'un listelenir");
  assert.ok(await dialog.getByRole("button", { name: "Panoya aktar" }).isDisabled(), "seçmeden aktarılamaz");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  const preview = dialog.locator("[data-workflow-flow]");
  await preview.waitFor();
  assert.equal(await preview.locator("[data-flow-link]").count(), 4);
  await dialog.getByLabel("Bağlı içerikler").uncheck();
  assert.equal(await preview.locator("[data-flow-link]").count(), 0, "önizleme katmanı izler");
}, { setup: (db) => db.addSpace(1, { title: "Lansman", visibility: "public" }) });

await scenario("2b aktar: gönderilen öğe başvuru + katman bayrakları taşır; pano çerçeveyi çizer", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.getByLabel("Bağlı içerikler").uncheck();
  await dialog.getByLabel("İlişkiler").uncheck();
  await dialog.getByRole("button", { name: "Panoya aktar" }).click();
  await page.locator("[data-board-item] [data-workflow-flow]").waitFor();
  const posts = calls(db, "POST", "space_items");
  assert.equal(posts.length, 1);
  const row = Array.isArray(posts[0].body) ? posts[0].body[0] : posts[0].body;
  assert.equal(row.kind, "content");
  assert.equal(row.content_type, "workflow");
  assert.equal(row.content_id, WID(1));
  assert.equal(row.flow_show_links, false);
  assert.equal(row.flow_show_relations, false);
  assert.equal(row.flow_show_io, true);
  assert.ok(row.w >= 320 && row.h >= 200, "boyut akışa göre hesaplanır");
  assert.equal(await page.locator("[data-board-item] [data-flow-link]").count(), 0, "kapalı katman panoda çizilmez");
  assert.equal(db.workflows.length, 3, "workflow kopyalanmadı");
}, { setup: (db) => db.addSpace(1, { title: "Lansman", visibility: "public" }) });

await scenario("2c aktar: panoda olan workflow 'Panoda' görünür ve tekrar aktarılamaz; özel workflow uyarısı", async ({ page }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  assert.ok((await dialog.innerText()).includes("zaten panoda"));
  assert.ok(await dialog.getByRole("button", { name: "Panoya aktar" }).isDisabled());
  await dialog.getByRole("radio", { name: /Özel workflow/ }).click();
  assert.ok((await dialog.innerText()).includes("Sadece ben"), "özel workflow herkese açık Space'te uyarı verir");
  assert.ok(await dialog.getByRole("button", { name: "Panoya aktar" }).isEnabled());
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); } });

await scenario("2d aktar: izleyici rolü aktaramaz (Ekle menüsü yok)", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-board-canvas]").waitFor();
  assert.equal(await page.getByRole("button", { name: "Ekle" }).count(), 0);
}, { setup: (db) => db.addSpace(1, { title: "Başkasının", owner: U.carol.id, members: [[{ id: ME }, "viewer"]], visibility: "public" }) });

// ---------------------------------------------------------------- Workflow sayfası önizlemesi
await scenario("3 sayfa: herkese açık Space → ziyaretçi 'Space panosu' önizlemesini görür (diyagram + panonun diğer öğeleri)", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  assert.ok((await section.innerText()).includes("Lansman"), "Space adı");
  await section.locator("[data-workflow-flow]").waitFor();
  assert.ok((await section.innerText()).includes("Lansman 14 Kasım"), "panonun başka öğesi (not) de görünür");
  assert.ok((await section.innerText()).includes("Herkese açık Space"));
  const href = await section.getByRole("link", { name: /Panoyu aç/ }).getAttribute("href");
  assert.ok(href.includes(`id=${SID(1)}`) && href.includes("tab=board") && href.includes("focus="), `pano bağlantısı: ${href}`);
  assert.equal(await section.getByRole("group", { name: /bağlı olduğu Space/ }).count(), 0, "tek Space: çip yok");
}, { guest: true, setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); db.addItem(SID(1), { kind: "note", title: "Not", body: "Lansman 14 Kasım", x: 950, y: 0, w: 220, h: 160, z: 2 }); db.addItem(SID(1), { kind: "note", title: "Gizli", body: "gizli not metni", is_private: true, x: 950, y: 200, w: 220, h: 160, z: 3 }); } });

await scenario("3b sayfa: gizli notlar hiçbir durumda önizlemeye girmez (üye bile görse)", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.locator("[data-workflow-flow]").waitFor();
  assert.ok(!(await section.innerText()).includes("gizli not metni"));
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); db.addItem(SID(1), { kind: "note", title: "Gizli", body: "gizli not metni", is_private: true, x: 950, y: 0, w: 220, h: 160, z: 3 }); } });

await scenario("4 sayfa: özel Space → ziyaretçi bölümü HİÇ görmez, sahibi görür", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.getByRole("heading", { name: /Ürün lansman görseli/ }).first().waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#workflow-space").count(), 0, "ziyaretçi: bölüm yok");
  assert.ok(!(await page.content()).includes("Özel Lansman"), "Space adı sayfada hiçbir yerde geçmez");
}, { guest: true, setup: (db) => { db.addSpace(1, { title: "Özel Lansman", visibility: "private" }); db.addWorkflowItem(1); } });

await scenario("4b sayfa: özel Space → sahibi önizlemeyi 'yalnız sen ve üyeler görür' notuyla görür", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  await section.locator("[data-workflow-flow]").waitFor();
  assert.ok((await section.innerText()).includes("Yalnız sen ve üyeler görür"));
}, { setup: (db) => { db.addSpace(1, { title: "Özel Lansman", visibility: "private" }); db.addWorkflowItem(1); } });

await scenario("5 sayfa: birden fazla Space — varsayılan en yeni herkese açık olan, çipten geçiş, ziyaretçi özel çipi görmez", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  const chips = section.getByRole("group", { name: /bağlı olduğu Space/ }).getByRole("button");
  assert.equal(await chips.count(), 3);
  assert.equal(await section.getByRole("button", { name: /Yeni Açık/ }).getAttribute("aria-pressed"), "true", "varsayılan: en yeni herkese açık");
  assert.equal(await section.getByRole("button", { name: /Gizli Moodboard/ }).getAttribute("aria-pressed"), "false", "daha yeni olsa da özel olan varsayılan değil");
  await section.getByRole("button", { name: /Gizli Moodboard/ }).click();
  await section.locator("[data-workflow-flow]").waitFor();
  assert.equal(await section.getByRole("button", { name: /Gizli Moodboard/ }).getAttribute("aria-pressed"), "true");
  assert.ok((await section.innerText()).includes("Yalnız sen ve üyeler görür"));
}, { setup: (db) => {
  db.addSpace(1, { title: "Eski Açık", visibility: "public", updated_at: "2026-09-12T10:00:00Z" });
  db.addSpace(2, { title: "Yeni Açık", visibility: "public", updated_at: "2026-09-20T10:00:00Z" });
  db.addSpace(3, { title: "Gizli Moodboard", visibility: "private", updated_at: "2026-09-25T10:00:00Z" });
  [1, 2, 3].forEach((n) => db.addWorkflowItem(n));
} });

await scenario("5b sayfa: ziyaretçi yalnız herkese açık Space çiplerini görür", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  const chips = section.getByRole("group", { name: /bağlı olduğu Space/ }).getByRole("button");
  assert.equal(await chips.count(), 2);
  assert.ok(!(await section.innerText()).includes("Gizli Moodboard"));
}, { guest: true, setup: (db) => {
  db.addSpace(1, { title: "Eski Açık", visibility: "public", updated_at: "2026-09-12T10:00:00Z" });
  db.addSpace(2, { title: "Yeni Açık", visibility: "public", updated_at: "2026-09-20T10:00:00Z" });
  db.addSpace(3, { title: "Gizli Moodboard", visibility: "private", updated_at: "2026-09-25T10:00:00Z" });
  [1, 2, 3].forEach((n) => db.addWorkflowItem(n));
} });

await scenario("5c sayfa: bağ yoksa bölüm yok", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.getByRole("heading", { name: /Ürün lansman görseli/ }).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#workflow-space").count(), 0);
}, { setup: (db) => db.addSpace(1, { title: "Boş", visibility: "public" }) });

// ---------------------------------------------------------------- form
await scenario("6 form: 'Space'te göster' — seçim notları ve yayında Space öğesi eklenir", async ({ page, db }) => {
  await page.goto(`${BASE}/workflows/create?edit=${WID(1)}`);
  const row = page.locator("[data-form-row=space]");
  await row.waitFor();
  assert.ok((await row.innerText()).includes("Kapalı"), "varsayılan kapalı");
  await row.getByRole("button", { name: /Space'te göster/ }).click();
  await row.getByRole("switch").click();
  await row.getByRole("radio", { name: /Lansman/ }).click();
  assert.ok((await row.innerText()).includes("Space herkese açık"), "herkese açık notu");
  await row.getByRole("radio", { name: /Moodboard/ }).click();
  assert.ok((await row.innerText()).includes("herkese açık değil"), "özel Space uyarısı");
  await row.getByRole("radio", { name: /Lansman/ }).click();
  await row.getByLabel("İlişkiler").uncheck();
  await page.getByRole("button", { name: "Kaydet" }).last().click();
  await page.waitForURL(/workflows\/local\/?\?id=/);
  const posts = calls(db, "POST", "space_items");
  assert.equal(posts.length, 1, "bir Space öğesi eklendi");
  const rowBody = Array.isArray(posts[0].body) ? posts[0].body[0] : posts[0].body;
  assert.equal(rowBody.space_id, SID(1));
  assert.equal(rowBody.content_type, "workflow");
  assert.equal(rowBody.content_id, WID(1));
  assert.equal(rowBody.flow_show_relations, false);
  assert.equal(rowBody.flow_show_io, true);
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addSpace(2, { title: "Moodboard", visibility: "private" }); } });

await scenario("6b form: var olan bağ önceden dolu gelir; kapatınca Space öğesi silinir", async ({ page, db }) => {
  await page.goto(`${BASE}/workflows/create?edit=${WID(1)}`);
  const row = page.locator("[data-form-row=space]");
  await row.waitFor();
  await waitFor(async () => (await row.innerText()).includes("Lansman"));
  assert.ok((await row.innerText()).includes("Lansman"), "mevcut Space seçili");
  await row.getByRole("button", { name: /Space'te göster/ }).click();
  await row.getByRole("switch").click();
  await page.getByRole("button", { name: "Kaydet" }).last().click();
  await page.waitForURL(/workflows\/local\/?\?id=/);
  assert.equal(calls(db, "DELETE", "space_items").length, 1, "öğe silindi");
  assert.equal(db.workflows.length, 3, "workflow silinmedi");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); } });

// ---------------------------------------------------------------- İngilizce + telefon
await scenario("7 İngilizce: diyagram ve önizleme etiketleri çevrilir", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  await section.locator("[data-workflow-flow]").waitFor();
  const text = (await section.innerText()).toUpperCase();
  for (const s of ["SPACE BOARD", "INPUT", "OUTPUT", "OPEN BOARD", "READ-ONLY PREVIEW", "PUBLIC SPACE"]) assert.ok(text.includes(s), `"${s}" var`);
  assert.ok(!text.includes("GİRDİ"));
}, { lang: "en", guest: true, setup: (db) => { db.addSpace(1, { title: "Launch", visibility: "public" }); db.addWorkflowItem(1); } });

await scenario("8 telefon: workflow sayfası ve Space panosu taşmaz", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.locator("#workflow-space [data-workflow-flow]").waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
}, { viewport: { width: 390, height: 800 }, touch: true, setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
  if (status === "FAIL") failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
