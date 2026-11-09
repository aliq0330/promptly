// Ekip projeleri v2 arayüzü (docs/history/362-*): Projeler sekmesi (kartlar, bekleyen bandı, oluşturma), proje sayfası (dosyalar, panolar,
// kişiler ve roller, proje değişkenleri), dosya sayfası (alan görünümü: mevcut Space sağlayıcısı + sekmeler, onay rozetleri, onaya gönder,
// onay anahtarı, dosya değişkeni projeyi ezer), düzenleyici/görüntüleyici görünümü, değişiklik önerisi, lider onay kuyruğu (paket, not zorunlu,
// hepsini onayla, öneri kararı), proje sohbeti grubu, eski adreslerin yönlenmesi, İngilizce ve telefon. Ağ taklitli (`db.rpc` geçersiz kılmaları +
// `mock-spaces.mjs`); gerçek Supabase'e KARŞI DENENMEDİ — kurallar `supabase/tests/team-projects-v2.sql` ve `team-project-review.sql`.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";

const PORT = 4231;
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
  my_role: role, main_area_id: AREA_PROJECT, channel_id: CHANNEL, item_count: 4, pending_count: role === "lead" ? 2 : null,
  files: [file(FILE, "Mutfak", { pending_count: role === "lead" ? 2 : null }), file(FILE2, "Banyo", { review_required: false, item_count: 2, board_count: 0, pending_count: 0 })],
  boards: [{ id: BOARD, title: "Müşteri toplantısı", file_id: null, item_count: 3 }],
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
    const row = db.addSpace(n, { owner: other.id, title: n === 1 ? "Villa Projesi" : n === 2 ? "Mutfak" : "Müşteri toplantısı", kind: "team_area", teamId: TEAM, teamProjectId: PROJECT, teamFileId: n === 2 ? FILE : null, members: [[U.alice, spaceRole]] });
    row.id = id;
    db.spaceMembers.forEach((m) => { if (m.space_id === SID(n)) m.space_id = id; });
  }
  items(db);
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", role = "owner", projectRole = "lead", spaceRole = "editor", setup, items } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  seed(db, { role, projectRole });
  areaSetup(db, { spaceRole, items });
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
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/tp_${name.split(".")[0].replace(/\W+/g, "_")}.png` }).catch(() => undefined);
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ") + (errors.length ? "\n      sayfa hataları: " + errors.slice(0, 2).join(" | ").slice(0, 400) : "")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/team-projects-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}
const called = (db, name) => db.teamCalls.filter((c) => c.name === name);
const projectUrl = (extra = "") => `${BASE}/teams/local?id=atolye-mor&tab=projects&project=${PROJECT}${extra}`;
const NOTE = (n) => `17e30000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------------------------------------------------------------------
await scenario("1. Projeler sekmesi: kart (rol rozeti, sayılar, dosya çipi, bekleyen), bekleyen bandı; sekme menüsünde Space'ler/Kütüphane yok", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  const list = page.getByTestId("team-project-list");
  await list.waitFor();
  const card = list.locator(`[data-project-card="${PROJECT}"]`);
  await card.getByText("Villa Projesi").waitFor();
  await card.locator("[data-project-role=lead]").waitFor();
  await card.getByText("1 dosya · 1 pano · 5 kişi").waitFor();
  await card.getByText("Mutfak").waitFor();
  await card.locator('[data-project-pending="2"]').waitFor();
  await page.locator("[data-project-pending-banner]").getByText("2 öğe senin onayını bekliyor").waitFor();
  const tabs = (await page.locator("[data-team-tab-link]").allInnerTexts()).map((t) => t.trim());
  assert.deepEqual(tabs, ["Projeler", "Sohbet", "Üyeler", "Panel", "Yönetim"]);
  assert.equal((await page.locator("[data-team-tab-link=spaces], [data-team-tab-link=library]").count()), 0);
  await page.locator("[data-team-new-project]").waitFor();
});

await scenario("2. Yeni proje: ad + onay anahtarı kapalı → team_create_project, ardından team_update_project(review_default=false)", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects`);
  await page.locator("[data-team-new-project]").click();
  const form = page.getByTestId("team-create-project-form");
  await form.waitFor();
  await form.getByRole("textbox").first().fill("Ofis yenileme");
  await form.getByRole("switch").click();
  await form.getByRole("button", { name: "Projeyi aç" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=team-create-project-form]"));
  const create = called(db, "team_create_project").at(-1)?.body;
  assert.equal(create.p_title, "Ofis yenileme");
  assert.equal(create.p_mode, "selected");
  const update = called(db, "team_update_project").at(-1)?.body;
  assert.deepEqual(update.p_patch, { review_default: false });
});

await scenario("3. Proje sayfası (lider): dosyalar, panolar, kişiler ve roller (örtük lider), proje değişkenleri; Yeni dosya → team_create_file ve dosya sayfası", async ({ page, db }) => {
  await page.goto(projectUrl());
  const home = page.getByTestId("team-project-home");
  await home.waitFor();
  await home.getByRole("heading", { name: "Villa Projesi" }).waitFor();
  assert.equal(await home.getAttribute("data-project-role"), "lead");
  await home.locator(`[data-file-card="${FILE}"]`).getByText("Mutfak").waitFor();
  await home.locator(`[data-file-card="${FILE}"]`).getByText("Onay açık").waitFor();
  await home.locator(`[data-file-card="${FILE2}"]`).getByText("Onay kapalı").waitFor();
  await home.locator(`[data-board-card="${BOARD}"]`).getByText("Müşteri toplantısı").waitFor();
  await home.locator("[data-project-main-area]").getByText("Proje geneli").waitFor();
  const people = home.getByTestId("project-people");
  await people.getByText("Mert", { exact: true }).waitFor();
  await people.getByText("Sahip", { exact: true }).waitFor();
  await people.getByText("Ekip yöneticisi · her projede lider").waitFor();
  const vars = home.locator('[data-variable-scope="project"]');
  await vars.locator('[data-variable-row="musteri"]').getByText("Ahmet Bey").waitFor();
  await home.locator("[data-project-review-link]").waitFor();
  await home.locator("[data-project-open-chat]").waitFor();
  await home.locator("[data-project-new-file]").click();
  const form = page.getByTestId("team-new-file-form");
  await form.waitFor();
  await form.getByRole("textbox").first().fill("Oturma odası");
  await form.getByRole("button", { name: "Dosyayı aç" }).click();
  await page.waitForFunction((id) => location.search.includes(`file=${id}`), FILE);
  const body = called(db, "team_create_file").at(-1)?.body;
  assert.equal(body.p_title, "Oturma odası");
  assert.equal(body.p_project, PROJECT);
  assert.equal(body.p_review, true);
});

await scenario("4. Proje değişkeni: Ekle → team_set_variable(proje kapsamı)", async ({ page, db }) => {
  await page.goto(projectUrl());
  await page.locator('[data-variable-scope="project"] [data-variable-add]').click();
  const form = page.getByTestId("team-variable-form");
  await form.waitFor();
  await form.getByPlaceholder("musteri").fill("sehir");
  await form.getByRole("textbox").nth(1).fill("İzmir");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=team-variable-form]"));
  const body = called(db, "team_set_variable").at(-1)?.body;
  assert.deepEqual({ n: body.p_name, v: body.p_value, f: body.p_file }, { n: "sehir", v: "İzmir", f: null });
});

await scenario("5. Dosya sayfası (lider): onaysız öğeler rozetli, dosya değişkeni projeyi ezer, onay anahtarı → team_file_set_review(false) + uyarı", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const view = page.getByTestId("team-file-page");
  await view.waitFor();
  await view.getByRole("heading", { name: "Mutfak" }).waitFor();
  const panel = view.getByTestId("area-review-panel");
  await panel.waitFor();
  await panel.locator('[data-review-item][data-review-state="pending"]').getByText("Onay bekliyor").waitFor();
  await panel.locator("[data-review-open-queue]").waitFor();
  // Değişkenler: dosyadaki stil=Skandinav projedeki Modern Akdeniz'i ezer; musteri projeden gelir.
  const vars = view.locator('[data-variable-scope="file"]');
  await vars.locator('[data-variable-row="stil"]').getByText("Skandinav").waitFor();
  await vars.locator('[data-variable-row="stil"]').getByText("dosyadan").waitFor();
  await vars.locator('[data-variable-row="musteri"]').getByText("projeden").waitFor();
  await vars.getByText("dosyadaki değer geçerli", { exact: false }).waitFor();
  // Onay anahtarı
  const switchRow = view.locator("[data-file-review-switch]");
  await switchRow.getByText("Bu dosyada onay: Açık").waitFor();
  await switchRow.getByRole("switch").click();
  await page.waitForFunction(() => document.body.innerText.includes("2 öğe hâlâ onaysız"));
  assert.equal(called(db, "team_file_set_review").at(-1)?.body.p_on, false);
  // Alan görünümünün sekmeleri
  for (const key of ["board", "images", "prompts", "content", "notes", "palette"]) await view.locator(`[data-area-tab=${key}]`).waitFor();
}, {
  items: (db) => {
    db.addItem(AREA_FILE, { id: NOTE(1), title: "Dolap notu", body: "mat beyaz", rev_state: "pending", created_by: U.bob.id });
    db.addItem(AREA_FILE, { id: NOTE(2), title: "Onaylı not", rev_state: "approved", created_by: U.bob.id });
  },
});

await scenario("6. Düzenleyici: Yeni dosya yok, 'Ekle' menüsü var; taslak/değişiklik istenen rozetli; Onaya gönder → team_review_submit; onaylı öğe için değişiklik öner", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const view = page.getByTestId("team-file-page");
  await view.waitFor();
  assert.equal(await view.getAttribute("data-project-role"), "edit");
  assert.equal(await page.locator("[data-file-review-switch]").count(), 0, "anahtarı yalnız lider değiştirir");
  await view.locator("[data-file-review-note]").getByText("Bu dosyada onay açık", { exact: false }).waitFor();
  const panel = view.getByTestId("area-review-panel");
  await panel.waitFor();
  const draft = panel.locator(`[data-review-item="${NOTE(10)}"]`);
  await draft.locator("[data-review-state=draft]").waitFor();
  const changes = panel.locator(`[data-review-item="${NOTE(11)}"]`);
  await changes.getByText("Rengi sıcak yapalım").waitFor();
  const pending = panel.locator(`[data-review-item="${NOTE(12)}"]`);
  await pending.locator("[data-review-withdraw]").waitFor();
  assert.equal(await pending.locator("[data-review-submit]").count(), 0, "bekleyen tekrar gönderilmez");
  // Toplu gönder: taslak + değişiklik istenen
  await panel.locator("[data-review-submit-all]").click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  const ids = called(db, "team_review_submit").at(-1)?.body.p_item_ids ?? [];
  assert.deepEqual([...ids].sort(), [NOTE(10), NOTE(11)].sort());
  // Geri çek
  await panel.locator("[data-review-withdraw]").first().click();
  await page.waitForTimeout(300);
  assert.deepEqual(called(db, "team_review_withdraw").at(-1)?.body.p_item_ids, [NOTE(12)]);
}, {
  projectRole: "edit",
  items: (db) => {
    db.addItem(AREA_FILE, { id: NOTE(10), title: "Taslak notum", rev_state: "draft", created_by: ME });
    db.addItem(AREA_FILE, { id: NOTE(11), title: "Ada tezgah", rev_state: "changes", rev_note: "Rengi sıcak yapalım", created_by: ME });
    db.addItem(AREA_FILE, { id: NOTE(12), title: "Bekleyen not", rev_state: "pending", created_by: ME });
    db.addItem(AREA_FILE, { id: NOTE(13), title: "Onaylı not", body: "metin", rev_state: "approved", created_by: U.bob.id });
  },
});

await scenario("7. Düzenleyici: onaylı öğe için Değişiklik öner → team_review_propose(başlık, metin, not)", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const panel = page.getByTestId("area-review-panel");
  await panel.waitFor();
  await panel.locator("[data-area-propose] summary").click();
  await panel.locator(`[data-area-propose-item="${NOTE(13)}"]`).click();
  const form = page.getByTestId("area-propose-form");
  await form.waitFor();
  await form.getByRole("textbox").first().fill("Onaylı not v2");
  await form.getByRole("button", { name: "Öneriyi gönder" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=area-propose-form]"));
  const body = called(db, "team_review_propose").at(-1)?.body;
  assert.equal(body.p_item, NOTE(13));
  assert.equal(body.p_title, "Onaylı not v2");
}, {
  projectRole: "edit",
  items: (db) => { db.addItem(AREA_FILE, { id: NOTE(13), title: "Onaylı not", body: "metin", rev_state: "approved", created_by: U.bob.id }); },
});

await scenario("8. Görüntüleyici: ekleme/onay paneli ve Yeni dosya yok; yalnız onaylıyı görür", async ({ page }) => {
  await page.goto(projectUrl());
  await page.getByTestId("team-project-home").waitFor();
  assert.equal(await page.locator("[data-project-new-file], [data-project-new-board], [data-project-edit-access], [data-project-settings]").count(), 0);
  assert.equal(await page.locator("[data-project-review-link]").count(), 0);
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("team-file-page").waitFor();
  await page.locator("[data-area-tab=notes]").waitFor();
  assert.equal(await page.locator("[data-area-add], [data-testid=area-review-panel]").count(), 0);
}, { projectRole: "view", spaceRole: "viewer" });

await scenario("9. Lider kuyruğu: paket tek satır, not zorunlu, Değişiklik iste/Onayla/Hepsini onayla, öneri onayı", async ({ page, db }) => {
  await page.goto(projectUrl("&review=1"));
  const inbox = page.getByTestId("team-review-inbox");
  await inbox.waitFor();
  const rows = inbox.getByTestId("review-list").locator("[data-review-row]");
  assert.equal(await rows.count(), 2, "paket tek satır + tek öğe");
  await inbox.getByText("Paket · 2 öğe").waitFor();
  await inbox.locator("[data-review-detail]").getByText("Dolap görseli").first().waitFor();
  // Not yazmadan değişiklik istenemez
  await inbox.locator("[data-review-changes]").click();
  await inbox.getByText("Değişiklik isterken bir not yaz.").waitFor();
  assert.equal(called(db, "team_review_decide").length, 0);
  await inbox.locator("#review-note").fill("Renkleri sıcak yapalım");
  await inbox.locator("[data-review-changes]").click();
  await page.waitForTimeout(300);
  let body = called(db, "team_review_decide").at(-1)?.body;
  assert.deepEqual({ d: body.p_decision, n: body.p_note, ids: body.p_item_ids }, { d: "changes", n: "Renkleri sıcak yapalım", ids: [NOTE(20)] });
  // Onayla
  await inbox.locator("[data-review-approve]").click();
  await page.waitForTimeout(300);
  body = called(db, "team_review_decide").at(-1)?.body;
  assert.equal(body.p_decision, "approve");
  // Hepsini onayla
  await inbox.locator("[data-review-approve-all]").click();
  await page.waitForTimeout(300);
  body = called(db, "team_review_decide").at(-1)?.body;
  assert.deepEqual([...body.p_item_ids].sort(), [NOTE(20), NOTE(22)].sort());
  // Öneri onayı
  await inbox.locator("[data-proposal-approve]").click();
  await page.waitForTimeout(300);
  const proposal = called(db, "team_review_decide_proposal").at(-1)?.body;
  assert.deepEqual({ i: proposal.p_item, d: proposal.p_decision }, { i: NOTE(23), d: "approve" });
}, {
  setup: (db) => {
    db.rpc.team_review_pending = () => ({
      body: {
        items: [
          { id: NOTE(20), kind: "image", title: "Dolap görseli", body: "", note: "", media_url: null, content_type: null, content_id: null, color: "neutral", is_draft: false, space_id: AREA_FILE, area_title: "Mutfak", file_id: FILE, file_title: "Mutfak", is_main: true, author_id: "u-m", author_name: "Mert Kaya", author_username: "mert", submitted_at: "2026-11-08T08:00:00Z", unit: "w1", unit_count: 2 },
          { id: NOTE(21), kind: "note", title: "Adım 2", body: "çıktı", note: "", media_url: null, content_type: null, content_id: null, color: "neutral", is_draft: false, space_id: AREA_FILE, area_title: "Mutfak", file_id: FILE, file_title: "Mutfak", is_main: true, author_id: "u-m", author_name: "Mert Kaya", author_username: "mert", submitted_at: "2026-11-08T08:00:00Z", unit: "w1", unit_count: 2 },
          { id: NOTE(22), kind: "note", title: "Ayrı not", body: "metin", note: "", media_url: null, content_type: null, content_id: null, color: "neutral", is_draft: false, space_id: AREA_FILE, area_title: "Mutfak", file_id: FILE, file_title: "Mutfak", is_main: true, author_id: "u-d", author_name: "Deniz", author_username: "deniz", submitted_at: "2026-11-07T08:00:00Z", unit: null, unit_count: 1 },
        ],
        proposals: [{ item_id: NOTE(23), kind: "note", space_id: AREA_FILE, file_id: FILE, file_title: "Mutfak", current: { title: "Eski", body: "a", note: "" }, proposed: { title: "Yeni", body: "b", note: "" }, proposer_id: "u-d", proposer_name: "Deniz", proposed_at: "2026-11-08T07:00:00Z" }],
      },
    });
  },
});

await scenario("10. Düzenleyici onay kuyruğunu göremez; kuyruk yalnız lidere", async ({ page, db }) => {
  await page.goto(projectUrl("&review=1"));
  await page.getByText("Onay kuyruğunu yalnız projenin liderleri görür.").waitFor();
  assert.equal(called(db, "team_review_pending").length, 0);
}, { projectRole: "edit" });

await scenario("11. Sohbet: proje kanalı 'Projeler' grubunda, proje başlığıyla; genel kanal ayrı listede", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat`);
  await page.getByTestId("team-channel-list").waitFor();
  await page.getByTestId("team-project-channels-heading").getByText("Projeler").waitFor();
  const projectList = page.getByTestId("team-project-channel-list");
  await projectList.locator('[data-channel-mode="project"]').getByText("Villa Projesi").waitFor();
  await page.getByTestId("team-channel-list").locator('[data-channel="genel"]').waitFor();
});

await scenario("12. Eski adresler: tab=spaces ve tab=library → Projeler", async ({ page }) => {
  for (const tab of ["spaces", "library"]) {
    await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=${tab}`);
    await page.getByTestId("team-projects").waitFor();
  }
});

await scenario("13. Pano sayfası: proje geneli ve ek pano açılır; ek panoda adı düzenleme (düzenleyici+)", async ({ page }) => {
  await page.goto(projectUrl(`&board=${BOARD}`));
  const view = page.getByTestId("team-board-page");
  await view.waitFor();
  await view.getByRole("heading", { name: "Müşteri toplantısı" }).waitFor();
  await view.locator("[data-area-tab=images]").waitFor();
  await page.goto(projectUrl(`&board=${AREA_PROJECT}`));
  await page.getByTestId("team-board-page").getByRole("heading", { name: "Proje geneli" }).waitFor();
});

await scenario("14. Ekle menüsü: pano/görsel/prompt/workflow/ayar paketi/değişken/palet/not seçenekleri; Pano → pano penceresi; taslak notu", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.locator("[data-area-add]").click();
  const options = page.getByTestId("area-add-options");
  await options.waitFor();
  for (const key of ["board", "image", "prompt", "workflow", "preset", "variable", "palette", "note"]) await options.locator(`[data-area-add-option=${key}]`).waitFor();
  await page.getByText("eklediğin her şey taslak başlar", { exact: false }).waitFor();
  await options.locator("[data-area-add-option=board]").click();
  const form = page.getByTestId("team-new-board-form");
  await form.waitFor();
  await form.getByRole("textbox").first().fill("Mutfak çizimi");
  await form.getByRole("button", { name: "Panoyu aç" }).click();
  await page.waitForTimeout(300);
  const body = called(db, "team_create_board").at(-1)?.body;
  assert.deepEqual({ p: body.p_project, t: body.p_title, f: body.p_file }, { p: PROJECT, t: "Mutfak çizimi", f: FILE });
}, { setup: (db) => { db.rpc.team_create_board = (b) => { db.teamCalls.push({ name: "team_create_board", body: b }); return { body: BOARD }; }; } });

await scenario("15. Proje erişimi penceresi: lider düzenler → team_set_project_access (3 rol, ekip dışı eklenemez)", async ({ page, db }) => {
  await page.goto(projectUrl());
  await page.locator("[data-project-edit-access]").click();
  const form = page.getByTestId("team-project-access-form");
  await form.waitFor();
  await form.getByTestId("project-access-editor").getByText("Erişimi olanlar · 1").waitFor();
  const roles = await form.getByLabel("Proje rolü").first().locator("option").allInnerTexts();
  assert.deepEqual(roles, ["Lider", "Düzenleyici", "Görüntüleyici"]);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForTimeout(300);
  const body = called(db, "team_set_project_access").at(-1)?.body;
  assert.equal(body.p_mode, "selected");
  assert.deepEqual(body.p_entries, [{ type: "member", id: "u-a", role: "lead" }]);
});

await scenario("16. İngilizce: Projeler, proje sayfası, dosya sayfası ve kuyruk metinleri", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects`);
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  await page.getByText("New project").first().waitFor();
  await page.goto(projectUrl());
  await page.getByText("Your role:").waitFor();
  await page.getByText("Files", { exact: true }).waitFor();
  await page.getByText("People & roles").waitFor();
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByText("Review in this file: On").waitFor();
  await page.goto(projectUrl("&review=1"));
  await page.getByRole("heading", { name: "Awaiting review" }).waitFor();
}, { lang: "en" });

await scenario("17. Telefon: Projeler, proje, dosya ve kuyruk sayfaları yatay taşmaz", async ({ page }) => {
  for (const [url, marker] of [
    [`${BASE}/teams/local?id=atolye-mor&tab=projects`, "team-projects"],
    [projectUrl(), "team-project-home"],
    [projectUrl(`&file=${FILE}`), "team-file-page"],
    [projectUrl("&review=1"), "team-review-inbox"],
  ]) {
    await page.goto(url);
    await page.getByTestId(marker).waitFor();
    await page.waitForTimeout(300);
    assert.ok(await overflowFree(page), url);
  }
}, { viewport: { width: 390, height: 800 } });

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
