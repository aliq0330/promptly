// Workflow ↔ Space bağlantısı arayüzü (docs/history/261-*, 262-*): workflow'un panoya AYRI NESNELER olarak aktarılması (adım kartı + prompt +
// görsel + oklar), "Workflow aktar" penceresi (seçenekler, planın önizlemesi, geri al), "Güncelle" şeridi, workflow formundaki
// "Space'te göster", workflow sayfasındaki "Space panosu" önizlemesi (herkese açık / özel / çoklu Space / ziyaretçi), eski tek parça
// çerçeve öğesi (geriye uyum), İngilizce, telefonda taşma yok. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (yetki kuralı: supabase/tests/space-workflow-flow.sql + space-connections.sql).
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
  [5, "Yeni adım promptu", U.carol],
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
const STEP_OUT = ["Konsept metni", "Görsel prompt'u", "4 görsel", "Sosyal medya metni"];
const STEP_ID = (i) => `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const OBJ_ID = (kind, i) => `d${kind}000000-0000-4000-8000-${String(i).padStart(12, "0")}`; // kind: 1 adım kartı, 2 prompt
/** Workflow adımları (db'deki `stepTitles`/`extraStep` ile değiştirilebilir: "workflow değişti" senaryosu). */
const stepRows = (db) => {
  const titles = db.stepTitles ?? STEP_TITLES;
  const idx = db.stepIdx ?? titles.map((_, i) => i + 1); // adımın özgün sırası: kimliği ve prompt'u buna bağlıdır (silinince kayma olmaz)
  return titles.map((title, i) => ({
    id: STEP_ID(idx[i]), position: i, title, description: "", instructions: "", step_type: "prompt", prompt_id: PID(idx[i]), request_id: null,
    inputs: i === 0 ? [{ id: "i1", label: "{ürün}", source: null }, { id: "i2", label: "{kitle}", source: null }] : [{ id: `i${idx[i] + 1}`, label: `girdi ${idx[i] - 1}`, source: { stepId: STEP_ID(idx[i - 1]), outputId: `o${idx[i - 1]}` } }],
    outputs: [{ id: `o${idx[i]}`, label: STEP_OUT[idx[i] - 1] ?? `çıktı ${idx[i]}` }],
  }));
};

/** Tüm senaryolar için ortak taklit veri + workflow uçları (mock-spaces'in tablo kancasının DIŞINA sarılır). */
function setupWorkflowSpace(db) {
  setupSpaces(db);
  db.workflows = [workflowRow(1, { title: "Ürün lansman görseli" }), workflowRow(2, { title: "Özel workflow", visibility: "private" }), workflowRow(3, { title: "Başkasının workflow'u", creator_id: U.carol.id })];
  db.wfRelations = [{ id: "r1", source_type: "prompt", source_id: PID(1), target_type: "prompt", target_id: PID(2), relation_type: "similar", note: null, created_by: ME }];
  db.stepTitles = null;
  /** Workflow'dan aktarılmış nesneler (docs/history/262-*): adım kartları + prompt'lar + akış/içerik okları + çerçeve (grup). */
  db.addWorkflowObjects = (spaceN, { steps = 4, withPrompts = true, group = true, io = true } = {}) => {
    const spaceId = SID(spaceN);
    const groupId = group ? `e0000000-0000-4000-8000-00000000000${spaceN}` : null;
    if (group) db.spaceGroups.push({ id: groupId, space_id: spaceId, name: "Workflow · Ürün lansman görseli", color: "primary", position: 0, created_at: new Date().toISOString() });
    for (let i = 0; i < steps; i += 1) {
      db.addItem(spaceId, {
        id: OBJ_ID(1, i + 1), kind: "note", title: STEP_TITLES[i], body: io ? `${i === 0 ? ">> {ürün}\n>> {kitle}" : `>> girdi ${i}`}\n<< ${STEP_OUT[i]}` : "", color: "primary",
        x: i * 370, y: 0, w: 260, h: 150, z: i + 1, group_id: groupId, source_workflow_id: WID(1), source_step_id: STEP_ID(i + 1), source_role: "step", source_step_no: i + 1,
      });
      if (withPrompts) {
        db.addItem(spaceId, { id: OBJ_ID(2, i + 1), kind: "prompt", prompt_id: PID(i + 1), x: i * 370, y: 206, w: 260, h: 170, z: i + 10, group_id: groupId, source_workflow_id: WID(1), source_step_id: STEP_ID(i + 1), source_role: "prompt", source_step_no: i + 1 });
        db.addConnection(spaceId, OBJ_ID(1, i + 1), OBJ_ID(2, i + 1), { line_style: "dotted", color: "neutral", route: "straight", source_workflow_id: WID(1), source_role: "link" });
      }
      if (i > 0) db.addConnection(spaceId, OBJ_ID(1, i), OBJ_ID(1, i + 1), { label: STEP_OUT[i - 1], source_workflow_id: WID(1), source_role: "flow" });
    }
  };
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
      return rows(wid ? stepRows(db) : []);
    }
    if (table === "prompt_media" && method === "GET") {
      const ids = inv(q.get("prompt_id")) ?? [];
      return rows(PROMPTS.filter(([n]) => ids.includes(PID(n))).flatMap(([n]) => ["a", "b"].map((k, position) => ({ prompt_id: PID(n), url: `https://example.supabase.co/storage/v1/object/public/prompt-media/p${n}-${k}.jpg`, width: 800, height: 600, position }))));
    }
    // Workflow'un bağlı olduğu Space'ler: nesneler (adım kartı rolü) ya da eski çerçeve öğesi (`or` süzgeci).
    if (table === "space_items" && method === "GET" && q.get("or")) {
      const id = /source_workflow_id\.eq\.([0-9a-f-]+)/.exec(q.get("or"))?.[1];
      const memberOf = (spaceId) => db.spaceMembers.some((m) => m.space_id === spaceId && m.user_id === signedIn);
      const readable = (spaceId) => { const sp = db.spaces.find((x) => x.id === spaceId); return sp && (memberOf(spaceId) || (sp.visibility === "public" && !sp.archived_at)); };
      return rows(db.spaceItems.filter((i) => readable(i.space_id) && ((i.source_workflow_id === id && i.source_role === "step") || (i.kind === "content" && i.content_type === "workflow" && i.content_id === id))));
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
  if (process.env.DEBUG_CONSOLE) page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 300)));
  // `spaces`↔`space_items` arasında iki yabancı anahtar var: gömme (`spaces!…`) PostgREST'te belirsizdir (PGRST201) — hiçbir istek kullanmamalı.
  page.on("request", (r) => { if (/[?&]select=[^&]*spaces(%21|!)/.test(r.url())) errors.push(`belirsiz gömme: ${r.url()}`); });
  try {
    await fn({ page, db, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    if (process.env.DEBUG_CALLS) console.log(JSON.stringify(db.calls.filter((c) => c.method !== "GET").map((c) => [c.method, c.table, JSON.stringify(c.body).slice(0, 200)]), null, 1));
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


// ---------------------------------------------------------------- pano: ayrı nesneler
await scenario("1 pano: aktarılan workflow AYRI nesneler olarak çizilir (adım kartı + prompt + oklar + çerçeve)", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-step-card]").first().waitFor();
  assert.equal(await page.locator("[data-step-card]").count(), 4, "dört adım kartı");
  assert.equal(await page.locator('[data-board-item][data-kind="prompt"]').count(), 4, "dört prompt nesnesi");
  assert.equal(await page.locator("[data-connector]").count(), 3 + 4, "üç akış oku + dört içerik çizgisi");
  const card = await page.locator("[data-step-card]").nth(1).innerText();
  assert.ok(card.includes("Görsel prompt'u üret") && card.toUpperCase().includes("GİRDİ") && card.toUpperCase().includes("ÇIKTI") && card.includes("girdi 1"), "adım kartı başlık + girdi/çıktı");
  assert.ok((await page.locator("[data-step-card]").first().innerText()).includes("1"), "numara rozeti");
  assert.equal(await page.locator("[data-workflow-flow]").count(), 0, "tek parça çerçeve yok");
  assert.ok((await page.locator("[data-group-frame]").first().innerText()).includes("Workflow · Ürün lansman görseli"), "çerçeve başlığı");
  assert.ok((await page.locator("[data-connector-label]").first().innerText()).includes("Konsept metni"), "ok üstünde çıktı adı");
  // nesneler birbirinden bağımsızdır: tek adım kartı sürüklenince diğerleri yerinde kalır
  const before = await page.locator('[data-board-item="' + OBJ_ID(1, 2) + '"]').boundingBox();
  const box = await page.locator('[data-board-item="' + OBJ_ID(1, 1) + '"]').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) await page.mouse.move(box.x + 40, box.y + 20 + i * 20);
  await page.mouse.up();
  const after = await page.locator('[data-board-item="' + OBJ_ID(1, 2) + '"]').boundingBox();
  assert.ok(Math.abs(before.y - after.y) <= 2, "komşu adım kartı yerinde");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); } });

await scenario("1b pano: eski tek parça çerçeve öğesi hâlâ diyagram çizer (geriye uyum)", async ({ page }) => {
  await page.goto(boardUrl(1));
  const flow = page.locator("[data-board-item] [data-workflow-flow]");
  await flow.waitFor();
  assert.equal(await flow.locator("[data-flow-node]").count(), 4);
  assert.equal(await flow.locator("[data-flow-link]").count(), 4);
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowItem(1); } });

await scenario("1c pano: erişilemeyen eski çerçeve öğesi sade kart olarak kalır, hata yok", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-board-item][data-kind=content]").waitFor();
  assert.equal(await page.locator("[data-workflow-flow]").count(), 0);
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); const item = db.addWorkflowItem(1); item.content_id = WID(9); } });

// ---------------------------------------------------------------- Workflow aktar
async function openImport(page) {
  await page.getByRole("button", { name: "Ekle" }).first().click();
  await page.getByRole("menuitem", { name: "Workflow aktar" }).click();
  await page.getByRole("dialog").waitFor();
}
const importDialog = (page) => page.getByRole("dialog");

await scenario("2 aktar: yalnız kendi yayınlanmış workflow'lar; seçince plan önizlemesi; seçenekler planı değiştirir", async ({ page }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = importDialog(page);
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).waitFor();
  assert.equal(await dialog.getByRole("radio", { name: /Başkasının workflow'u/ }).count(), 0, "başkasının workflow'u yok");
  assert.equal(await dialog.getByRole("radio", { name: /Özel workflow/ }).count(), 1);
  assert.ok(await dialog.getByRole("button", { name: "Panoya aktar" }).isDisabled(), "seçmeden aktarılamaz");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.locator("[data-plan-step]").first().waitFor();
  assert.equal(await dialog.locator("[data-plan-step]").count(), 4);
  assert.equal(await dialog.locator("[data-plan-prompt]").count(), 4);
  assert.equal(await dialog.locator("[data-plan-image]").count(), 8);
  const counts = await dialog.locator("[data-plan-counts]").innerText();
  assert.ok(counts.includes("4 adım") && counts.includes("4 prompt") && counts.includes("8 görsel") && counts.includes("16 ok"), counts);
  await dialog.getByLabel("Prompt görselleri").uncheck();
  assert.equal(await dialog.locator("[data-plan-image]").count(), 0);
  assert.ok((await dialog.locator("[data-plan-counts]").innerText()).includes("0 görsel"));
  await dialog.getByRole("checkbox", { name: /^Promptlar / }).uncheck();
  assert.equal(await dialog.locator("[data-plan-prompt]").count(), 0);
  assert.ok(await dialog.getByLabel("Prompt görselleri").isDisabled(), "promptsuz görsel seçilemez");
  assert.ok(await dialog.getByLabel("İlişkiler").isDisabled());
  assert.ok((await dialog.locator("[data-plan-counts]").innerText()).includes("3 ok"), "yalnız akış okları");
}, { setup: (db) => db.addSpace(1, { title: "Lansman", visibility: "public" }) });

await scenario("2b aktar: Panoya aktar → çerçeve + adım kartları + prompt + görsel + oklar yazılır; pano çizer; tek adımda geri al / yinele", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = importDialog(page);
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.locator("[data-plan-step]").first().waitFor();
  await dialog.getByRole("button", { name: "Panoya aktar" }).click();
  await page.locator("[data-step-card]").first().waitFor();
  assert.equal(await page.locator("[data-step-card]").count(), 4);

  const groups = calls(db, "POST", "space_groups");
  assert.equal(groups.length, 1);
  const group = Array.isArray(groups[0].body) ? groups[0].body[0] : groups[0].body;
  assert.equal(group.name, "Workflow · Ürün lansman görseli");

  const itemRows = calls(db, "POST", "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(itemRows.length, 16, "4 adım + 4 prompt + 8 görsel");
  const stepRows_ = itemRows.filter((r) => r.source_role === "step");
  assert.equal(stepRows_.length, 4);
  assert.ok(stepRows_.every((r) => r.kind === "note" && r.source_workflow_id === WID(1) && r.source_step_id && r.group_id === group.id));
  assert.deepEqual(stepRows_.map((r) => r.source_step_no), [1, 2, 3, 4]);
  assert.ok(stepRows_[0].body.includes(">> {ürün}") && stepRows_[0].body.includes("<< Konsept metni"));
  const promptRows = itemRows.filter((r) => r.kind === "prompt");
  assert.deepEqual(promptRows.map((r) => r.prompt_id).sort(), [1, 2, 3, 4].map(PID).sort());
  assert.ok(promptRows.every((r) => r.source_role === "prompt" && r.is_draft === false));
  const imageRows = itemRows.filter((r) => r.kind === "image");
  assert.equal(imageRows.length, 8);
  assert.ok(imageRows.every((r) => r.prompt_id && r.media_url.includes("prompt-media") && r.source_role === "image"));

  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(connRows.length, 16);
  assert.equal(connRows.filter((r) => r.source_role === "flow").length, 3);
  assert.equal(connRows.filter((r) => r.source_role === "link").length, 12);
  assert.equal(connRows.filter((r) => r.source_role === "relation").length, 1);
  assert.ok(connRows.every((r) => r.source_workflow_id === WID(1)));
  assert.equal(connRows.find((r) => r.source_role === "flow").label, "Konsept metni");
  assert.equal(connRows.find((r) => r.source_role === "relation").label, "Benzer");
  assert.ok(await waitFor(async () => (await page.locator("[data-connector]").count()) === 16), "oklar panoda çizildi");
  assert.equal(db.workflows.length, 3, "workflow kopyalanmadı");

  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+z");
  assert.ok(await waitFor(async () => (await page.locator("[data-step-card]").count()) === 0), "tek geri al hepsini kaldırır");
  assert.equal(await page.locator("[data-connector]").count(), 0);
  await page.keyboard.press("Control+Shift+z");
  assert.ok(await waitFor(async () => (await page.locator("[data-step-card]").count()) === 4), "yinele geri getirir");
  assert.ok(await waitFor(async () => (await page.locator("[data-connector]").count()) === 16));
}, { setup: (db) => db.addSpace(1, { title: "Lansman", visibility: "public" }) });

await scenario("2c aktar: yalnız adım kartı + akış okları seçeneği", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = importDialog(page);
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.locator("[data-plan-step]").first().waitFor();
  await dialog.getByRole("checkbox", { name: /^Promptlar / }).uncheck();
  await dialog.getByLabel("Girdi ve çıktılar").uncheck();
  await dialog.getByRole("button", { name: "Panoya aktar" }).click();
  await page.locator("[data-step-card]").first().waitFor();
  const itemRows = calls(db, "POST", "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(itemRows.length, 4);
  assert.ok(itemRows.every((r) => r.body === ""));
  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(connRows.length, 3);
}, { setup: (db) => db.addSpace(1, { title: "Lansman", visibility: "public" }) });

await scenario("2d aktar: panoda zaten olan prompt yeniden açılmaz, mevcut olana ok bağlanır", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = importDialog(page);
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.locator("[data-plan-step]").first().waitFor();
  assert.ok((await dialog.locator("[data-plan-counts]").innerText()).includes("3 prompt"), "dört prompttan biri panoda var");
  await dialog.getByRole("button", { name: "Panoya aktar" }).click();
  await page.locator("[data-step-card]").first().waitFor();
  const itemRows = calls(db, "POST", "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(itemRows.filter((r) => r.kind === "prompt").length, 3);
  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.ok(connRows.some((r) => r.to_item_id === "f0000000-0000-4000-8000-000000000001"), "mevcut prompt öğesine ok bağlandı");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addItem(SID(1), { id: "f0000000-0000-4000-8000-000000000001", kind: "prompt", prompt_id: PID(1), x: 5000, y: 5000, w: 260, h: 170, z: 1 }); } });

await scenario("2e aktar: panoda bu workflow'un nesneleri varsa tekrar aktarılamaz; özel workflow uyarısı; izleyici aktaramaz", async ({ page }) => {
  await page.goto(boardUrl(1));
  await openImport(page);
  const dialog = importDialog(page);
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  assert.ok((await dialog.innerText()).includes("Güncelle"), "güncelle yönlendirmesi");
  assert.ok(await dialog.getByRole("button", { name: "Panoya aktar" }).isDisabled());
  await dialog.getByRole("radio", { name: /Özel workflow/ }).click();
  assert.ok((await dialog.innerText()).includes("Sadece ben"), "özel workflow herkese açık Space'te uyarı verir");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); } });

await scenario("2f aktar: izleyici rolü aktaramaz (Ekle menüsü yok)", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-board-canvas]").waitFor();
  assert.equal(await page.getByRole("button", { name: "Ekle" }).count(), 0);
}, { setup: (db) => db.addSpace(1, { title: "Başkasının", owner: U.carol.id, members: [[{ id: ME }, "viewer"]], visibility: "public" }) });

// ---------------------------------------------------------------- Güncelle
await scenario("3 güncelle: workflow değişmediyse şerit yok", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-step-card]").first().waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-workflow-sync]").count(), 0);
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); db.addWorkflowObjects(1); } });

await scenario("3b güncelle: yeni adım → şerit; Güncelle yalnız farkı ekler (kart + prompt + görseller + ok)", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  const sync = page.locator("[data-workflow-sync]");
  await sync.waitFor();
  const text = await sync.innerText();
  assert.ok(text.includes("değişti") && text.includes("1 yeni adım"), text);
  await sync.getByRole("button", { name: "Güncelle" }).click();
  assert.ok(await waitFor(async () => (await page.locator("[data-step-card]").count()) === 5), "beşinci adım kartı geldi");
  assert.ok(await waitFor(async () => (await page.locator("[data-workflow-sync]").count()) === 0), "şerit kapandı");
  const itemRows = calls(db, "POST", "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(itemRows.length, 4, "yeni adım kartı + prompt + 2 görsel");
  assert.equal(itemRows.find((r) => r.source_role === "step").source_step_no, 5);
  assert.equal(itemRows.find((r) => r.source_role === "step").group_id, "e0000000-0000-4000-8000-000000000001", "mevcut çerçeveye girer");
  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.ok(connRows.some((r) => r.source_role === "flow" && r.from_item_id === OBJ_ID(1, 4)), "son adımdan yeni karta akış oku");
  assert.equal(calls(db, "DELETE", "space_items").length, 0, "hiçbir nesne silinmedi");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); db.addWorkflowObjects(1); db.addItem(SID(1), { id: OBJ_ID(3, 1), kind: "image", prompt_id: PID(1), media_url: "https://example.supabase.co/storage/v1/object/public/prompt-media/p1-a.jpg", x: 0, y: 420, w: 124, h: 124, z: 30, source_workflow_id: WID(1), source_step_id: STEP_ID(1), source_role: "image", source_step_no: 1 }); db.stepTitles = [...STEP_TITLES, "Yeni adım"]; } });

await scenario("3c güncelle: başlık değişti → yalnız o kart güncellenir; senin elle eklediğin ok ve notlar korunur", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  const sync = page.locator("[data-workflow-sync]");
  await sync.waitFor();
  assert.ok((await sync.innerText()).includes("1 değişen adım"));
  await sync.getByRole("button", { name: "Güncelle" }).click();
  await waitFor(() => calls(db, "PATCH", "space_items").length >= 1);
  const patch = calls(db, "PATCH", "space_items").find((c) => c.body.title);
  assert.equal(patch.body.title, "Konsept yaz (v2)");
  assert.ok(await waitFor(async () => (await page.locator("[data-step-card]").first().innerText()).includes("Konsept yaz (v2)")));
  assert.equal(calls(db, "POST", "space_items").length, 0);
  assert.ok(db.spaceItems.some((i) => i.title === "Elle not"), "elle eklenen not durur");
  assert.ok(db.spaceConnections.some((c) => c.label === "elle ok"), "elle çizilen ok durur");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); db.addWorkflowObjects(1); db.addItem(SID(1), { id: "f0000000-0000-4000-8000-000000000002", kind: "note", title: "Elle not", x: 0, y: 700, w: 220, h: 160, z: 99 }); db.addConnection(SID(1), "f0000000-0000-4000-8000-000000000002", OBJ_ID(1, 1), { label: "elle ok" }); db.stepTitles = ["Konsept yaz (v2)", ...STEP_TITLES.slice(1)]; } });

await scenario("3d güncelle: kaldırılan adım → kart + o adımın nesneleri gider, kalanlar arası ok kurulur", async ({ page, db }) => {
  await page.goto(boardUrl(1));
  const sync = page.locator("[data-workflow-sync]");
  await sync.waitFor();
  assert.ok((await sync.innerText()).includes("1 kaldırılan adım"));
  await sync.getByRole("button", { name: "Güncelle" }).click();
  assert.ok(await waitFor(async () => (await page.locator("[data-step-card]").count()) === 3));
  assert.equal(await page.locator('[data-board-item][data-kind="prompt"]').count(), 3);
  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.ok(connRows.some((r) => r.source_role === "flow" && r.from_item_id === OBJ_ID(1, 1) && r.to_item_id === OBJ_ID(1, 3)), "1 → 3 oku");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman" }); db.addWorkflowObjects(1); db.stepTitles = [STEP_TITLES[0], STEP_TITLES[2], STEP_TITLES[3]]; db.stepIdx = [1, 3, 4]; } });

await scenario("3e güncelle: izleyici şerit görmez", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-step-card]").first().waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-workflow-sync]").count(), 0);
}, { setup: (db) => { db.addSpace(1, { title: "Başkasının", owner: U.carol.id, members: [[{ id: ME }, "viewer"]], visibility: "public" }); db.addWorkflowObjects(1); db.stepTitles = [...STEP_TITLES, "Yeni adım"]; } });

// ---------------------------------------------------------------- Workflow sayfası önizlemesi
await scenario("4 sayfa: herkese açık Space → ziyaretçi 'Space panosu' önizlemesini görür (adım kartları, promptlar, oklar)", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  assert.ok((await section.innerText()).includes("Lansman"), "Space adı");
  await section.locator("[data-step-card]").first().waitFor();
  assert.equal(await section.locator("[data-step-card]").count(), 4);
  assert.equal(await section.locator("[data-connector]").count(), 7, "oklar da çizilir");
  assert.ok((await section.innerText()).includes("Herkese açık Space"));
  assert.ok(!(await section.innerText()).includes("Alakasız uzak not"), "workflow'dan uzak öğeler önizlemede yok");
  const href = await section.getByRole("link", { name: /Panoyu aç/ }).getAttribute("href");
  assert.ok(href.includes(`id=${SID(1)}`) && href.includes("tab=board") && href.includes("focus="), `pano bağlantısı: ${href}`);
  assert.equal(await section.getByRole("group", { name: /bağlı olduğu Space/ }).count(), 0, "tek Space: çip yok");
}, { guest: true, setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); db.addItem(SID(1), { kind: "note", title: "Uzak", body: "Alakasız uzak not", x: 9000, y: 9000, w: 220, h: 160, z: 2 }); db.addItem(SID(1), { kind: "note", title: "Gizli", body: "gizli not metni", is_private: true, x: 0, y: 420, w: 220, h: 160, z: 3 }); } });

await scenario("4b sayfa: gizli notlar hiçbir durumda önizlemeye girmez (üye bile görse)", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.locator("[data-step-card]").first().waitFor();
  assert.ok(!(await section.innerText()).includes("gizli not metni"));
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); db.addItem(SID(1), { kind: "note", title: "Gizli", body: "gizli not metni", is_private: true, x: 0, y: 420, w: 220, h: 160, z: 3 }); } });

await scenario("4c sayfa: eski tek parça çerçeve öğesi olan Space de önizlenir (geriye uyum)", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.locator("[data-workflow-flow]").waitFor();
}, { guest: true, setup: (db) => { db.addSpace(1, { title: "Eski", visibility: "public" }); db.addWorkflowItem(1); } });

await scenario("5 sayfa: özel Space → ziyaretçi bölümü HİÇ görmez, sahibi görür", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.getByRole("heading", { name: /Ürün lansman görseli/ }).first().waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#workflow-space").count(), 0, "ziyaretçi: bölüm yok");
  assert.ok(!(await page.content()).includes("Özel Lansman"), "Space adı sayfada hiçbir yerde geçmez");
}, { guest: true, setup: (db) => { db.addSpace(1, { title: "Özel Lansman", visibility: "private" }); db.addWorkflowObjects(1); } });

await scenario("5b sayfa: özel Space → sahibi önizlemeyi 'yalnız sen ve üyeler görür' notuyla görür", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  await section.locator("[data-step-card]").first().waitFor();
  assert.ok((await section.innerText()).includes("Yalnız sen ve üyeler görür"));
}, { setup: (db) => { db.addSpace(1, { title: "Özel Lansman", visibility: "private" }); db.addWorkflowObjects(1); } });

await scenario("5c sayfa: birden fazla Space — varsayılan en yeni herkese açık olan, çipten geçiş; ziyaretçi özel çipi görmez", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.waitFor();
  const chips = section.getByRole("group", { name: /bağlı olduğu Space/ }).getByRole("button");
  assert.equal(await chips.count(), 3);
  assert.equal(await section.getByRole("button", { name: /Yeni Açık/ }).getAttribute("aria-pressed"), "true");
  assert.equal(await section.getByRole("button", { name: /Gizli Moodboard/ }).getAttribute("aria-pressed"), "false");
  await section.getByRole("button", { name: /Gizli Moodboard/ }).click();
  await section.locator("[data-step-card]").first().waitFor();
  assert.equal(await section.getByRole("button", { name: /Gizli Moodboard/ }).getAttribute("aria-pressed"), "true");
}, { setup: (db) => {
  db.addSpace(1, { title: "Eski Açık", visibility: "public", updated_at: "2026-09-12T10:00:00Z" });
  db.addSpace(2, { title: "Yeni Açık", visibility: "public", updated_at: "2026-09-20T10:00:00Z" });
  db.addSpace(3, { title: "Gizli Moodboard", visibility: "private", updated_at: "2026-09-25T10:00:00Z" });
  [1, 2, 3].forEach((n) => db.addWorkflowObjects(n, { group: false }));
} });

await scenario("5d sayfa: ziyaretçi yalnız herkese açık Space çiplerini görür; bağ yoksa bölüm yok", async ({ page }) => {
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
  [1, 2, 3].forEach((n) => db.addWorkflowObjects(n, { group: false }));
} });

await scenario("5e sayfa: bağ yoksa bölüm yok", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.getByRole("heading", { name: /Ürün lansman görseli/ }).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#workflow-space").count(), 0);
}, { setup: (db) => db.addSpace(1, { title: "Boş", visibility: "public" }) });

// ---------------------------------------------------------------- form
await scenario("6 form: 'Space'te göster' — seçenekler + gizlilik notları; yayında nesneler (kart + prompt + görsel + ok) yazılır", async ({ page, db }) => {
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
  await row.getByLabel("Prompt görselleri").uncheck();
  await page.getByRole("button", { name: "Kaydet" }).last().click();
  await page.waitForURL(/workflows\/local\/?\?id=/);
  const itemRows = calls(db, "POST", "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(itemRows.length, 8, "4 adım kartı + 4 prompt (görseller kapalı)");
  assert.ok(itemRows.every((r) => r.space_id === SID(1) && r.source_workflow_id === WID(1)));
  assert.equal(itemRows.filter((r) => r.kind === "image").length, 0);
  const connRows = calls(db, "POST", "space_connections").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
  assert.equal(connRows.filter((r) => r.source_role === "flow").length, 3);
  assert.equal(connRows.filter((r) => r.source_role === "link").length, 4);
  assert.equal(calls(db, "POST", "space_groups").length, 1, "çerçeve (grup)");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addSpace(2, { title: "Moodboard", visibility: "private" }); } });

await scenario("6b form: var olan bağ önceden dolu; kapatınca bu workflow'un nesneleri silinir (başkalarına dokunulmaz)", async ({ page, db }) => {
  await page.goto(`${BASE}/workflows/create?edit=${WID(1)}`);
  const row = page.locator("[data-form-row=space]");
  await row.waitFor();
  await waitFor(async () => (await row.innerText()).includes("Lansman"));
  assert.ok((await row.innerText()).includes("Lansman"), "mevcut Space seçili");
  await row.getByRole("button", { name: /Space'te göster/ }).click();
  await row.getByRole("switch").click();
  assert.ok((await row.innerText()).includes("kaldırılır"), "kapatınca ne olacağı söylenir");
  await page.getByRole("button", { name: "Kaydet" }).last().click();
  await page.waitForURL(/workflows\/local\/?\?id=/);
  const deleted = calls(db, "DELETE", "space_items");
  assert.ok(deleted.length >= 1);
  assert.ok(!db.spaceItems.some((i) => i.source_workflow_id === WID(1)), "workflow nesneleri gitti");
  assert.ok(db.spaceItems.some((i) => i.title === "Elle not"), "elle eklenen not durdu");
  assert.equal(db.workflows.length, 3, "workflow silinmedi");
}, { setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); db.addItem(SID(1), { kind: "note", title: "Elle not", x: 0, y: 700, w: 220, h: 160, z: 99 }); } });

await scenario("6c form: eski tek parça çerçeve öğesi kaydedilince nesnelere çevrilir", async ({ page, db }) => {
  await page.goto(`${BASE}/workflows/create?edit=${WID(1)}`);
  const row = page.locator("[data-form-row=space]");
  await row.waitFor();
  await waitFor(async () => (await row.innerText()).includes("Eski"));
  await page.getByRole("button", { name: "Kaydet" }).last().click();
  await page.waitForURL(/workflows\/local\/?\?id=/);
  assert.ok(db.spaceItems.some((i) => i.source_role === "step"), "adım kartları eklendi");
  assert.ok(!db.spaceItems.some((i) => i.kind === "content" && i.content_type === "workflow"), "eski çerçeve öğesi silindi");
}, { setup: (db) => { db.addSpace(1, { title: "Eski", visibility: "public" }); db.addWorkflowItem(1); } });

// ---------------------------------------------------------------- İngilizce + telefon
await scenario("7 İngilizce: adım kartı, aktarma penceresi ve önizleme etiketleri çevrilir", async ({ page }) => {
  await page.goto(boardUrl(1));
  await page.locator("[data-step-card]").first().waitFor();
  assert.ok((await page.locator("[data-step-card]").nth(1).innerText()).toUpperCase().includes("INPUT"));
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("menuitem", { name: "Import workflow" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Ürün lansman görseli/ }).click();
  await dialog.locator("[data-plan-step]").first().waitFor();
  const text = await dialog.innerText();
  for (const s of ["What should come onto the board?", "Prompt images", "Will add:"]) assert.ok(text.toUpperCase().includes(s.toUpperCase()), `"${s}" var`);
}, { lang: "en", setup: (db) => { db.addSpace(1, { title: "Launch", visibility: "public" }); db.addWorkflowObjects(1, { steps: 2 }); db.workflows[0].title = "Ürün lansman görseli"; } });

await scenario("7b İngilizce: workflow sayfasında Space önizlemesi", async ({ page }) => {
  await page.goto(wfUrl(1));
  const section = page.locator("#workflow-space");
  await section.locator("[data-step-card]").first().waitFor();
  const text = (await section.innerText()).toUpperCase();
  for (const s of ["SPACE BOARD", "OPEN BOARD", "READ-ONLY PREVIEW", "PUBLIC SPACE"]) assert.ok(text.includes(s), `"${s}" var`);
}, { lang: "en", guest: true, setup: (db) => { db.addSpace(1, { title: "Launch", visibility: "public" }); db.addWorkflowObjects(1); } });

await scenario("8 telefon: workflow sayfası ve Space panosu taşmaz", async ({ page }) => {
  await page.goto(wfUrl(1));
  await page.locator("#workflow-space [data-step-card]").first().waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
}, { viewport: { width: 390, height: 800 }, touch: true, setup: (db) => { db.addSpace(1, { title: "Lansman", visibility: "public" }); db.addWorkflowObjects(1); } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
  if (status === "FAIL") failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
