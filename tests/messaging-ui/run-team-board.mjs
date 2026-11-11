// Ekip panosu (docs/history/367-*): pano grubu (sayfa değiştirici, genel bakış, ekle/yeniden adlandır/çoğalt/kaldır, taşı/kopyala), yüzen araç çubukları,
// çizim araçları (çerçeve/metin/şekil/kalem), sunum, konumlu yorumlar (yorum modu, pin, yanıt, çözüldü, yeri göster), Paylaş + dışa aktarma; masaüstü / tablet / telefon.
// Ağ taklitli (`db.rpc` geçersiz kılmaları + `mock-spaces.mjs`); gerçek Supabase'e KARŞI DENENMEDİ — kurallar `supabase/tests/team-board-group.sql`.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4237;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const TEAM = "e1000000-0000-4000-8000-000000000001";
const PROJECT = "e1000000-0000-4000-8000-0000000000b1";
const FILE = "e1000000-0000-4000-8000-0000000000b3";
const FILE2 = "e1000000-0000-4000-8000-0000000000b5";
const AREA_PROJECT = SID(1);
const AREA_FILE = SID(2);
const BOARD = SID(3);
const GROUP = "e1000000-0000-4000-8000-0000000000c1";
const CHANNEL = "e1000000-0000-4000-8000-0000000000a3";
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const teamRow = (role) => ({
  id: TEAM, slug: "atolye-mor", name: "Atölye Mor", description: "Mimari ofis", tone: "primary", my_role: role, member_count: 6, guest_count: 0, space_count: 1,
  channel_count: 3, unread_count: 0, last_activity_at: "2026-11-08T10:00:00Z", library_space_id: null, guest_until: null,
});
const file = (id, title, over = {}) => ({ id, title, position: 0, review_required: true, main_area_id: id === FILE ? AREA_FILE : null, item_count: 6, board_count: 1, pending_count: 2, ...over });
const person = (id, name, role, over = {}) => ({ type: "member", id, name, username: name.toLowerCase(), avatar_url: null, role, implicit: false, member_count: null, ...over });
const detail = (role, over = {}) => ({
  project: { id: PROJECT, team_id: TEAM, title: "Villa Projesi", description: "Mimari proje", tone: "primary", access_mode: "selected", base_role: "view", review_default: true, archived_at: null, created_at: "2026-11-01T00:00:00Z" },
  my_role: role, main_area_id: null, channel_id: CHANNEL, item_count: 4, pending_count: role === "lead" ? 2 : null,
  files: [file(FILE, "Mutfak", { pending_count: role === "lead" ? 2 : null }), file(FILE2, "Banyo", { review_required: false, item_count: 2, board_count: 0, pending_count: 0 })],
  // docs/history/368-*: pano dosyanın içindedir; "Ortak" + "Müşteri toplantısı" tek PANO GRUBUDUR (dosya ana alanı pano değil, öğe kabıdır).
  boards: [
    { id: AREA_PROJECT, title: "Ortak", file_id: FILE, item_count: 4, position: 0, group_id: GROUP },
    { id: BOARD, title: "Müşteri toplantısı", file_id: FILE, item_count: 3, position: 1, group_id: GROUP },
  ],
  groups: [{ id: GROUP, title: "Ortak", file_id: FILE, board_count: 2 }],
  areas: [
    { id: AREA_PROJECT, title: "Ortak", file_id: FILE, is_main: false, position: 0, group_id: GROUP, item_count: 4, updated_at: "2026-11-10T09:00:00Z", pending_count: role === "lead" ? 1 : null, open_comments: 1 },
    { id: BOARD, title: "Müşteri toplantısı", file_id: FILE, is_main: false, position: 1, group_id: GROUP, item_count: 3, updated_at: "2026-11-09T09:00:00Z", pending_count: role === "lead" ? 0 : null, open_comments: 0 },
    { id: AREA_FILE, title: "Mutfak", file_id: FILE, is_main: true, position: 0, item_count: 6, updated_at: "2026-11-08T09:00:00Z", pending_count: role === "lead" ? 2 : null, open_comments: 0 },
  ],
  people: [person("u-a", "Ayşe", "lead"), person("u-m", "Mert", "edit"), person("u-c", "Can", "view"), person("u-o", "Sahip", "lead", { implicit: true })],
  variables: [
    { id: "v1", file_id: null, name: "musteri", value: "Ahmet Bey" },
    { id: "v2", file_id: null, name: "stil", value: "Modern Akdeniz" },
    { id: "v3", file_id: FILE, name: "stil", value: "Skandinav" },
    { id: "v4", file_id: FILE, name: "tezgah", value: "mermer" },
  ],
  ...over,
});
const summary = (role) => ({
  id: PROJECT, title: "Villa Projesi", description: "Mimari proje", tone: "primary", archived_at: null, review_default: true, access_mode: "selected", base_role: "view", my_role: role,
  main_area_id: AREA_PROJECT, channel_id: CHANNEL, member_count: 5, board_count: 1, item_count: 9, pending_count: role === "lead" ? 2 : null,
  files: [{ id: FILE, title: "Mutfak", review_required: true, main_area_id: AREA_FILE, item_count: 6, pending_count: role === "lead" ? 2 : null }],
});

function seed(db, { role = "owner", projectRole = "lead" } = {}) {
  const calls = [];
  db.teamCalls = calls;
  const reply = (name, fn) => {
    db.rpc[name] = (body) => {
      calls.push({ name, body });
      return { body: fn(body) };
    };
  };
  reply("my_teams", () => [teamRow(role)]);
  reply("my_teams_preview", () => []);
  reply("my_team_invitations", () => []);
  reply("my_team_todos", () => []);
  reply("team_project_todos", () => []);
  reply("team_review_board", () => ({ items: [], proposals: [] }));
  reply("team_recent_activity", () => []);
  reply("team_member_project_roles", () => []);
  reply("team_projects_list", () => [summary(projectRole)]);
  reply("team_project_get", () => detail(projectRole));
  reply("team_project_channels", () => [{ channel_id: CHANNEL, project_id: PROJECT, project_title: "Villa Projesi" }]);
  reply("team_create_project", () => PROJECT);
  reply("team_update_project", () => null);
  reply("team_create_file", () => FILE);
  reply("team_set_variable", () => "v9");
  reply("team_delete_variable", () => null);
  reply("team_file_set_review", () => 2);
  reply("team_review_submit", (b) => (b.p_item_ids ?? []).length);
  reply("team_review_withdraw", () => 1);
  reply("team_review_propose", () => null);
  reply("team_review_pending", () => ({ items: [], proposals: [] }));
  reply("team_review_decide", (b) => (b.p_item_ids ?? []).length);
  reply("team_review_decide_proposal", () => null);
  reply("team_project_access", () => ({ mode: "selected", base_role: "view", entries: [{ type: "member", id: "u-a", role: "lead", name: "Ayşe", username: "ayse", sub: "editor" }] }));
  reply("team_set_project_access", () => null);
  reply("team_list_members", () => []);
  reply("team_list_groups", () => []);
  reply("team_list_channels", () => [
    { id: "ch-general", name: "genel", description: null, mode: "open", space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: true, position: 0, archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: null, member_count: 6, can_post: true },
    { id: CHANNEL, name: "villa-projesi", description: null, mode: "project", space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: false, position: 1, archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: null, member_count: 5, can_post: true },
  ]);
  reply("team_channel_members", () => []);
}

/** Alan (Space motoru satırı) + öğeler. `viewerOf`: ME'nin alandaki Space rolü (lider/düzenleyici = editor, görüntüleyici = viewer). */
function areaSetup(db, { spaceRole = "editor", items = (d) => d } = {}) {
  const other = U.bob;
  for (const [n, id] of [[1, AREA_PROJECT], [2, AREA_FILE], [3, BOARD]]) {
    const row = db.addSpace(n, { owner: other.id, title: n === 1 ? "Ortak" : n === 2 ? "Mutfak" : "Müşteri toplantısı", kind: "team_area", teamId: TEAM, teamProjectId: PROJECT, teamFileId: FILE, members: [[U.alice, spaceRole]] });
    row.id = id;
    db.spaceMembers.forEach((m) => { if (m.space_id === SID(n)) m.space_id = id; });
  }
  items(db);
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", role = "owner", projectRole = "lead", spaceRole = "editor", setup, items = seedItems } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  seed(db, { role, projectRole });
  areaSetup(db, { spaceRole, items });
  pinsSetup(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db });
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/tb_${name.split(".")[0].replace(/\W+/g, "_")}.png` }).catch(() => undefined);
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ") + (errors.length ? "\n      sayfa hataları: " + errors.slice(0, 2).join(" | ").slice(0, 400) : "")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/team-board-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}


// ---------------------------------------------------------------------------------------------------------------------------------------
// Ağ taklidi: ek öğeler + konumlu yorumlar (`space_pin_comments` + pin_comment_* RPC'leri)
// ---------------------------------------------------------------------------------------------------------------------------------------
const NOTE = (n) => `17e30000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PIN = (n) => `91e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const authorOf = (id) => {
  const u = Object.values(U).find((x) => x.id === id);
  return u ? { id: u.id, username: u.username, display_name: u.display_name, avatar_url: null } : null;
};
function pinsSetup(db) {
  db.pins = [
    { id: PIN(1), space_id: AREA_PROJECT, parent_id: null, author_id: U.bob.id, body: "Bu panoyu daha sıcak bir tonla deneyelim mi?", x: 340, y: 120, item_id: NOTE(1), off_x: 20, off_y: 12, resolved_at: null, resolved_by: null, edited_at: null, created_at: "2026-11-10T08:00:00Z" },
    { id: PIN(2), space_id: AREA_PROJECT, parent_id: PIN(1), author_id: ME, body: "Olur, bir varyant ekliyorum.", x: null, y: null, item_id: null, off_x: null, off_y: null, resolved_at: null, resolved_by: null, edited_at: null, created_at: "2026-11-10T08:30:00Z" },
    { id: PIN(3), space_id: AREA_PROJECT, parent_id: null, author_id: ME, body: "Tezgah ölçüsü burada eksik.", x: 80, y: 260, item_id: null, off_x: null, off_y: null, resolved_at: "2026-11-10T09:00:00Z", resolved_by: ME, edited_at: null, created_at: "2026-11-09T09:00:00Z" },
    { id: PIN(4), space_id: BOARD, parent_id: null, author_id: U.bob.id, body: "Toplantı notlarını buraya ekleyelim.", x: 60, y: 60, item_id: null, off_x: null, off_y: null, resolved_at: null, resolved_by: null, edited_at: null, created_at: "2026-11-10T07:00:00Z" },
  ];
  db.pinCalls = [];
  const rec = (name, body, fn) => { db.pinCalls.push({ name, body }); return { body: fn?.(body) ?? null }; };
  db.rpc.pin_comment_create = (b) => rec("pin_comment_create", b, (x) => {
    db.pins.push({ id: x.p_id ?? crypto.randomUUID(), space_id: x.p_space, parent_id: x.p_parent ?? null, author_id: ME, body: x.p_body, x: x.p_x, y: x.p_y, item_id: x.p_item ?? null, off_x: x.p_off_x ?? null, off_y: x.p_off_y ?? null, resolved_at: null, resolved_by: null, edited_at: null, created_at: new Date().toISOString() });
    return x.p_id;
  });
  db.rpc.pin_comment_update = (b) => rec("pin_comment_update", b, (x) => { const r = db.pins.find((p) => p.id === x.p_id); if (r) { r.body = x.p_body; r.edited_at = new Date().toISOString(); } });
  db.rpc.pin_comment_set_resolved = (b) => rec("pin_comment_set_resolved", b, (x) => { const r = db.pins.find((p) => p.id === x.p_id); if (r) r.resolved_at = x.p_resolved ? new Date().toISOString() : null; });
  db.rpc.pin_comment_delete = (b) => rec("pin_comment_delete", b, (x) => { db.pins = db.pins.filter((p) => p.id !== x.p_id && p.parent_id !== x.p_id); });
  db.rpc.team_create_board = (b) => rec("team_create_board", b, () => SID(9));
  db.rpc.team_create_board_in_group = (b) => rec("team_create_board_in_group", b, () => SID(9));
  db.rpc.team_rename_board_group = (b) => rec("team_rename_board_group", b, () => null);
  db.rpc.team_rename_board = (b) => rec("team_rename_board", b, () => null);
  db.rpc.team_delete_board = (b) => rec("team_delete_board", b, () => null);
  db.rpc.team_reorder_boards = (b) => rec("team_reorder_boards", b, () => null);
  db.rpc.team_transfer_items = (b) => rec("team_transfer_items", b, () => ({ done: (b.p_ids ?? []).length, skipped: 0, ids: (b.p_ids ?? []).map(() => crypto.randomUUID()), old_ids: b.p_ids ?? [] }));
  const prior = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "space_pin_comments" && ctx.method === "GET") {
      const space = ctx.q.get("space_id")?.replace("eq.", "");
      return ctx.json(200, db.pins.filter((p) => !space || p.space_id === space).map((p) => ({ ...p, author: authorOf(p.author_id) })));
    }
    return prior ? prior(ctx) : undefined;
  };
}
const called = (db, name) => (db.pinCalls ?? []).concat(db.teamCalls ?? []).filter((c) => c.name === name);
const boardUrl = (area = AREA_PROJECT, extra = "") => `${BASE}/teams/local?id=atolye-mor&tab=projects&project=${PROJECT}&board=${area}&sub=board${extra}`;
const seedItems = (db) => {
  db.addItem(AREA_PROJECT, { id: NOTE(1), kind: "note", title: "Salon fikri", body: "Sıcak tonlar, ahşap sehpa", x: 300, y: 100, w: 240, h: 160, created_by: U.bob.id });
  db.addItem(AREA_PROJECT, { id: NOTE(2), kind: "note", title: "Ölçüler", body: "5,2 × 3,8 m", x: 640, y: 100, w: 220, h: 160, created_by: ME });
  db.addItem(AREA_PROJECT, { id: NOTE(3), kind: "note", title: "Taslak not", body: "Henüz onaysız", x: 300, y: 360, w: 220, h: 140, rev_state: "draft", created_by: ME });
  db.addItem(BOARD, { id: NOTE(11), kind: "note", title: "Toplantı gündemi", body: "1. Plan 2. Bütçe", x: 120, y: 100, created_by: ME });
  db.addItem(AREA_FILE, { id: NOTE(21), kind: "note", title: "Mutfak notu", body: "Tezgah mermer", x: 120, y: 100, created_by: ME });
};

const calls = (db, table, method = "POST") => db.calls.filter((c) => c.table === table && c.method === method);
const board = (page) => page.locator("[data-board-team]");
/** Tuvalde (görünür kutu içinde) göreli konuma sürükle. */
const dragOnCanvas = async (page, from, to) => {
  const box = await page.locator("[data-board-canvas]").first().boundingBox();
  assert.ok(box, "tuval kutusu");
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
  await page.mouse.up();
};

await scenario("1. Masaüstü: tam tuval, yol çubuğu, yüzen araç çubukları; bant/sekme yok, sol menü yerinde", async ({ page }) => {
  await page.goto(boardUrl());
  await page.getByTestId("team-board-mode").waitFor();
  await board(page).waitFor();
  assert.equal(await page.locator("[data-team-chrome]").count(), 0, "bant/sekmeler gizli");
  await page.getByRole("navigation", { name: /Ana gezinme|Primary/i }).first().waitFor();
  await page.getByRole("heading", { name: "Mutfak" }).first().waitFor();
  await page.getByRole("button", { name: "Paylaş" }).first().waitFor();
  await page.locator("[data-board-pages-button]").waitFor();
  assert.match(await page.locator("[data-board-page-name]").innerText(), /Ortak/);
  for (const name of ["Seç", "El (kaydır)", "Metin", "Çerçeve", "Not", "Kalem", "Şekil", "Ekle", "Sunum", "Yakınlaştırma", "Yorumlar"]) await page.getByRole("button", { name }).first().waitFor();
  assert.equal(await page.locator("[data-board-item]").count(), 3);
  assert.ok(await overflowFree(page));
});

await scenario("2. Pano değiştirici: iki pano + sayılar; diğer panoyu açınca öğeler KARIŞMAZ", async ({ page }) => {
  await page.goto(boardUrl());
  await page.locator("[data-board-pages-button]").click();
  const pop = page.locator("[data-board-popover]");
  await pop.waitFor();
  const rows = pop.locator("[data-board-page]");
  assert.equal(await rows.count(), 2);
  await rows.first().locator("[data-board-page-current], :scope").first().waitFor();
  assert.ok((await rows.first().innerText()).includes("Ortak"));
  assert.ok((await rows.nth(1).innerText()).includes("Müşteri toplantısı"));
  await pop.getByText("4 öğe").first().waitFor();
  await rows.nth(1).getByRole("button").first().click();
  await page.waitForFunction((id) => location.search.includes(`board=${id}`), BOARD);
  await page.getByText("Toplantı gündemi").waitFor();
  assert.equal(await page.getByText("Salon fikri").count(), 0, "diğer panonun öğesi görünmemeli");
  assert.match(await page.locator("[data-board-page-name]").innerText(), /Müşteri toplantısı/);
});

await scenario("3. Tüm panolara bak: genel bakış kartları; karta dokununca pano açılır", async ({ page }) => {
  await page.goto(boardUrl());
  await page.locator("[data-board-pages-button]").click();
  await page.locator("[data-board-overview-open]").click();
  const cards = page.locator("[data-board-page]");
  await cards.first().waitFor();
  assert.equal(await cards.count(), 2);
  await page.getByRole("button", { name: "Müşteri toplantısı panosunu aç" }).click();
  await page.waitForFunction((id) => location.search.includes(`board=${id}`), BOARD);
});

await scenario("4. Yeni pano / yeniden adlandır / çoğalt / kaldır → team_create_board_in_group, team_rename_board, team_transfer_items, team_delete_board", async ({ page, db }) => {
  await page.goto(boardUrl(BOARD));
  await page.locator("[data-board-pages-button]").click();
  await page.locator("[data-board-popover] [data-board-page-new]").click();
  const form = page.getByTestId("team-new-board-form");
  await form.getByRole("textbox").fill("Cephe fikirleri");
  await form.getByRole("button", { name: "Panoyu aç" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=team-new-board-form]"));
  // docs/history/368-*: açık panonun yanına yeni pano = pano grubuna ekleme (sunucu grubu kurar/büyütür)
  const create = called(db, "team_create_board_in_group").at(-1)?.body;
  assert.deepEqual({ from: create.p_from, t: create.p_title }, { from: BOARD, t: "Cephe fikirleri" });
  assert.equal(called(db, "team_create_board").length, 0, "bağımsız pano RPC'si çağrılmaz");
  // ⋯ menüsü: ek panoda yeniden adlandır
  await page.goto(boardUrl(BOARD));
  await page.locator("[data-board-pages-button]").click();
  const row = page.locator(`[data-board-popover] [data-board-page="${BOARD}"]`);
  await row.getByRole("button", { name: "Pano seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Yeniden adlandır" }).click();
  await page.waitForTimeout(500);

  const rename = page.getByTestId("board-page-rename");
  await rename.getByRole("textbox").fill("Toplantı 2");
  await rename.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=board-page-rename]"));
  assert.deepEqual({ s: called(db, "team_rename_board").at(-1)?.body.p_space, t: called(db, "team_rename_board").at(-1)?.body.p_title }, { s: BOARD, t: "Toplantı 2" });
  // çoğalt
  await page.locator("[data-board-pages-button]").click();
  await row.getByRole("button", { name: "Pano seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Panoyu çoğalt" }).click();
  await page.waitForTimeout(500);
  assert.equal(called(db, "team_create_board_in_group").at(-1)?.body.p_title.includes("(kopya)"), true, "kopya aynı gruba girer");
  assert.equal(called(db, "team_transfer_items").at(-1)?.body.p_copy, true);
  // kaldır
  await page.goto(boardUrl(BOARD));
  await page.locator("[data-board-pages-button]").click();
  await page.locator(`[data-board-popover] [data-board-page="${BOARD}"]`).getByRole("button", { name: "Pano seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Panoyu kaldır" }).click();
  const del = page.getByTestId("board-page-delete");
  await del.getByText("kalıcı olarak silinir").waitFor();
  await del.getByRole("button", { name: "Panoyu kaldır" }).click();
  await page.waitForFunction((a) => location.search.includes(`board=${a}`), AREA_PROJECT);
  assert.equal(called(db, "team_delete_board").at(-1)?.body.p_space, BOARD);
});

await scenario("5. Ekle menüsü: Promptly içeriği + Çiz ve düzenle satırları; Not → not düzenleyici", async ({ page }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Ekle" }).first().click();
  const pop = page.locator("[data-board-popover], [data-board-sheet]").last();
  await pop.waitFor();
  for (const label of ["Prompt", "Görsel", "Not", "Palet", "Workflow", "Ayar paketi", "İstek", "Metin", "Çerçeve", "Kalem", "Şekil"]) await pop.getByText(label, { exact: true }).first().waitFor();
  await pop.getByText("Not", { exact: true }).first().click();
  await page.getByRole("dialog").last().waitFor();
});

await scenario("4b. Grubu yeniden adlandır: değiştirici başlığında kalem → team_rename_board_group; grup adı başlıkta", async ({ page, db }) => {
  await page.goto(boardUrl(BOARD));
  await page.locator("[data-board-pages-button]").click();
  await page.locator("[data-board-group-name]").getByText("Panolar · Ortak").waitFor();
  await page.locator("[data-board-group-rename]").click();
  const form = page.getByTestId("board-group-rename");
  await form.getByRole("textbox").fill("Müşteri panoları");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=board-group-rename]"));
  const body = called(db, "team_rename_board_group").at(-1)?.body;
  assert.deepEqual({ g: body.p_group, t: body.p_title }, { g: GROUP, t: "Müşteri panoları" });
});

await scenario("6. Panoya taşı: öğe seç → Panoya taşı → team_transfer_items(taşı); kopyala kipi p_copy=true", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.locator(`[data-board-item][data-item-id="${NOTE(2)}"], [data-board-item]:has-text("Ölçüler")`).first().click();
  await page.getByRole("button", { name: "Panoya taşı" }).click();
  const pop = page.locator("[data-board-popover]").last();
  await pop.waitFor();
  await pop.locator("[data-board-move-target]").first().click();
  await page.waitForTimeout(400);
  const call = called(db, "team_transfer_items").at(-1)?.body;
  assert.deepEqual({ from: call.p_from, to: call.p_to, ids: call.p_ids, copy: call.p_copy }, { from: AREA_PROJECT, to: BOARD, ids: [NOTE(2)], copy: false });
  assert.equal(await page.locator('[data-board-item]:has-text("Ölçüler")').count(), 0, "taşınan öğe bu panodan kalkar");
});

await scenario("6b. Panoya kopyala: Kopyala kipi → p_copy=true, öğe bu panoda kalır", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.locator('[data-board-item]:has-text("Ölçüler")').first().click();
  await page.getByRole("button", { name: "Panoya taşı" }).click();
  const pop = page.locator("[data-board-popover]").last();
  await pop.locator('[data-board-move-mode="copy"]').click();
  await pop.locator("[data-board-move-target]").first().click();
  await page.waitForTimeout(400);
  assert.equal(called(db, "team_transfer_items").at(-1)?.body.p_copy, true);
  assert.equal(await page.locator('[data-board-item]:has-text("Ölçüler")').count(), 1);
});

await scenario("7. Yorum paneli: Açık/Çözüldü, yanıtlar, yer simgesi tuvalde gösterir, çözüldü işaretle/yeniden aç", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Yorumlar" }).first().click();
  const panel = page.getByTestId("board-comments-panel");
  await panel.waitFor();
  const open = panel.locator("[data-comment-thread]");
  assert.equal(await open.count(), 1);
  await open.getByText("daha sıcak bir tonla").waitFor();
  await open.getByText("Olur, bir varyant ekliyorum.").waitFor();
  await panel.locator('[data-comment-filter="resolved"]').click();
  await panel.getByText("Tezgah ölçüsü burada eksik.").waitFor();
  await panel.locator('[data-comment-filter="open"]').click();
  await panel.locator(`[data-comment-locate="${PIN(1)}"]`).click();
  await page.locator(`[data-board-pin][data-pin-active], [data-pin-active]`).first().waitFor();
  await panel.locator(`[data-comment-resolve="${PIN(1)}"]`).click();
  await page.waitForTimeout(300);
  assert.deepEqual({ id: called(db, "pin_comment_set_resolved").at(-1)?.body.p_id, r: called(db, "pin_comment_set_resolved").at(-1)?.body.p_resolved }, { id: PIN(1), r: true });
});

await scenario("8. Yorum yaz: Yorumlar → Yeni → tuvalde boş bir yere dokun → pin_comment_create(x,y); öğeye dokun → p_item", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Yorumlar" }).first().click();
  await page.locator("[data-comment-new]").click();
  await page.getByText("Yorum yapmak için tuvalde bir yere ya da öğeye dokun").first().waitFor();
  const canvas = await page.locator("[data-board-canvas]").first().boundingBox();
  await page.mouse.click(canvas.x + 120, canvas.y + 520);
  const input = page.locator("[data-comment-input] textarea, [data-comment-input] input").first();
  await input.waitFor();
  await input.fill("Buraya pencere gelsin");
  await page.locator("[data-comment-send]").click();
  await page.waitForTimeout(400);
  const first = called(db, "pin_comment_create").at(-1)?.body;
  assert.equal(first.p_body, "Buraya pencere gelsin");
  assert.equal(typeof first.p_x, "number");
  assert.equal(first.p_item, null);
  // öğe üzerine yorum (panel gönderimden sonra açık kalır)
  await page.locator("[data-comment-new]").click();
  await page.locator('[data-board-item]:has-text("Ölçüler")').first().click();
  await page.locator("[data-comment-input] textarea, [data-comment-input] input").first().fill("Ölçü doğru mu?");
  await page.locator("[data-comment-send]").click();
  await page.waitForTimeout(400);
  const second = called(db, "pin_comment_create").at(-1)?.body;
  assert.equal(second.p_item, NOTE(2));
});

await scenario("9. Yanıt: panelden yanıtla → pin_comment_create(p_parent)", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Yorumlar" }).first().click();
  await page.locator(`[data-comment-reply-open="${PIN(1)}"]`).click();
  await page.locator("[data-comment-input] textarea, [data-comment-input] input").first().fill("Tamam");
  await page.locator("[data-comment-send]").click();
  await page.waitForTimeout(400);
  assert.equal(called(db, "pin_comment_create").at(-1)?.body.p_parent, PIN(1));
});

await scenario("10. Bildirim bağlantısı ?comment= : panel açılır, yorum etkin", async ({ page }) => {
  await page.goto(boardUrl(AREA_PROJECT, `&comment=${PIN(1)}`));
  const panel = page.getByTestId("board-comments-panel");
  await panel.waitFor();
  await page.locator(`[data-comment-thread="${PIN(1)}"][data-comment-active]`).waitFor();
});

await scenario("11. Paylaş: Paylaşım/Dışa aktarma sekmeleri, davet, bağlantıyı kopyala; JSON dışa aktarma indirir", async ({ page }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Paylaş" }).first().click();
  const dialog = page.getByTestId("board-share-dialog");
  await dialog.waitFor();
  await dialog.locator("[data-board-invite]").waitFor();
  await dialog.locator("[data-board-copy-link]").waitFor();
  await dialog.getByText("Yalnızca proje üyeleri").first().waitFor();
  await dialog.locator('[data-share-tab="export"]').click();
  for (const label of ["Görsel (PNG)", "PDF", "Pano verisi (JSON)"]) await dialog.getByText(label).first().waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.locator('[data-board-export="json"]').click()]);
  assert.match(download.suggestedFilename(), /\.json$/);
  const text = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, "promptly.board");
  assert.equal(parsed.items.length >= 3, true);
});

await scenario("12. Çerçeve aracı: sürükle → space_items(kind=frame); Metin aracı: dokun + yaz → kind=text", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Çerçeve" }).first().click();
  await dragOnCanvas(page, [60, 420], [360, 640]);
  await page.waitForTimeout(500);
  assert.ok(calls(db, "space_items").some((c) => (Array.isArray(c.body) ? c.body : [c.body]).some((r) => r.kind === "frame")), "çerçeve öğesi yazılmalı");
  await page.getByRole("button", { name: "Metin" }).first().click();
  const box = await page.locator("[data-board-canvas]").first().boundingBox();
  await page.mouse.click(box.x + 700, box.y + 520);
  const dialog = page.getByRole("dialog").last();
  await dialog.getByRole("textbox").first().fill("Salon planı");
  await dialog.getByRole("button", { name: /Ekle|Kaydet/ }).last().click();
  await page.waitForTimeout(500);
  assert.ok(calls(db, "space_items").some((c) => (Array.isArray(c.body) ? c.body : [c.body]).some((r) => r.kind === "text")), "metin öğesi yazılmalı");
});

await scenario("13. Şekil + kalem: dikdörtgen sürükle → kind=shape (data.shape=rect); kalem → data.shape=draw", async ({ page, db }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Şekil" }).first().click();
  await dragOnCanvas(page, [700, 400], [860, 520]);
  await page.waitForTimeout(500);
  const rows = () => calls(db, "space_items").flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])).filter((r) => r.kind === "shape");
  assert.ok(rows().some((r) => r.data?.shape === "rect"), "dikdörtgen yazılmalı");
  await page.getByRole("button", { name: "Kalem" }).first().click();
  await dragOnCanvas(page, [100, 450], [240, 560]);
  await page.waitForTimeout(500);
  assert.ok(rows().some((r) => r.data?.shape === "draw"), "serbest çizim yazılmalı");
});

await scenario("14. Sunum: çerçeve yokken düğme kapalı; iki çerçeve → Sunum → 1/2, sonraki, Esc ile çıkış", async ({ page }) => {
  await page.goto(boardUrl());
  await board(page).waitFor();
  assert.equal(await page.getByRole("button", { name: "Sunum" }).first().isDisabled(), true);
  await page.goto(boardUrl(BOARD));
  await board(page).waitFor();
  await page.getByRole("button", { name: "Sunum" }).first().click();
  await page.locator("[data-present-counter]").getByText("1 / 2").waitFor();
  await page.locator("[data-present-next]").click();
  await page.locator("[data-present-counter]").getByText("2 / 2").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-present-counter]").waitFor({ state: "detached" });
}, { items: (db) => { seedItems(db); for (const [n, x] of [[31, 40], [32, 520]]) { const r = db.addItem(BOARD, { id: NOTE(n), kind: "frame", title: `Çerçeve ${n}`, x, y: 40, w: 400, h: 300, created_by: ME }); r.data = null; } } });

await scenario("15. Görüntüleyici: Ekle/araçlar yok; Yorumlar + Paylaş var; davet yok", async ({ page }) => {
  await page.goto(boardUrl());
  await board(page).waitFor();
  assert.equal(await page.getByRole("button", { name: "Ekle" }).count(), 0);
  await page.getByRole("button", { name: "Yorumlar" }).first().waitFor();
  await page.getByRole("button", { name: "Paylaş" }).first().click();
  await page.getByTestId("board-share-dialog").waitFor();
  assert.equal(await page.locator("[data-board-invite]").count(), 0);
}, { role: "member", projectRole: "view", spaceRole: "viewer" });

await scenario("16. Telefon: alt menü görünür kalır, pano grubu alt sayfa, yatay taşma yok", async ({ page }) => {
  await page.goto(boardUrl());
  await board(page).waitFor();
  await page.locator("nav[data-app-nav]").waitFor();
  assert.ok(await page.locator("nav[data-app-nav]").isVisible());
  await page.locator("[data-board-pages-button]").click();
  await page.locator("[data-board-sheet], [role=dialog]").last().getByText("Müşteri toplantısı").first().waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Yorumlar" }).first().click();
  await page.getByTestId("board-comments-panel").waitFor();
  assert.ok(await overflowFree(page));
  assert.ok(await page.locator("nav[data-app-nav]").isVisible(), "alt menü yorum panelinde de görünür");
}, { viewport: { width: 390, height: 844 } });

await scenario("17. Tablet: sol rayı yerinde, pano grubu soldan çekmece", async ({ page }) => {
  await page.goto(boardUrl());
  await board(page).waitFor();
  await page.getByRole("navigation", { name: /Ana gezinme|Primary/i }).first().waitFor();
  await page.locator("[data-board-pages-button]").click();
  await page.getByRole("dialog", { name: "Panolar" }).waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 820, height: 1100 } });

await scenario("18. İngilizce: araç ipuçları ve Paylaş metinleri", async ({ page }) => {
  await page.goto(boardUrl());
  await page.getByRole("button", { name: "Add" }).first().waitFor();
  await page.getByRole("button", { name: "Comments" }).first().waitFor();
  await page.getByRole("button", { name: "Share" }).first().click();
  await page.getByTestId("board-share-dialog").getByText("Project members only").first().waitFor();
}, { lang: "en" });

if (process.env.SHOTS) {
  const dir = process.env.SHOTS;
  for (const [tag, viewport] of [["d", { width: 1440, height: 900 }], ["t", { width: 820, height: 1100 }], ["p", { width: 390, height: 844 }]]) {
    await scenario(`s-${tag}`, async ({ page }) => {
      await page.goto(boardUrl());
      await board(page).waitFor();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/${tag}-1-board.png` });
      await page.locator("[data-board-pages-button]").click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/${tag}-2-pages.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Ekle" }).first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/${tag}-3-add.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Yorumlar" }).first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${tag}-4-comments.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Paylaş" }).first().click().catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${tag}-5-share.png` });
    }, { viewport });
  }
}

await browser.close();
server.close?.();
for (const [r, n] of results) console.log(r === "PASS" ? "✓" : "✗", n);
console.log(`${results.filter(([r]) => r === "PASS").length}/${results.length} passed`);
process.exit(results.some(([r]) => r === "FAIL") ? 1 : 0);
