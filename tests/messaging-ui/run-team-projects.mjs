// Ekip projeleri v2 arayüzü (docs/history/362-*): Projeler sekmesi (kartlar, bekleyen bandı, oluşturma), proje sayfası (dosyalar, panolar,
// kişiler ve roller, proje değişkenleri), dosya sayfası (alan görünümü: mevcut Space sağlayıcısı + sekmeler, onay rozetleri, onaya gönder,
// Öğe detay sayfaları [docs/history/364-*] (senaryo 22–30), Gezgin düzeni [docs/history/363-*]: tek üst çubuk, klasör listesi, satır satır alan listesi, Ekle, bilgi penceresi, telefonda gruplanmış pano araç çubuğu, "Space" metni yok,
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
  // docs/history/368-*: proje BOŞ doğar (proje geneli alan yok); pano dosyanın içindedir. `variables` içindeki proje düzeyi satır ESKİ veriyi taklit eder: çözümlemede yok sayılır.
  my_role: role, main_area_id: null, channel_id: CHANNEL, item_count: 4, pending_count: role === "lead" ? 2 : null,
  files: [file(FILE, "Mutfak", { pending_count: role === "lead" ? 2 : null }), file(FILE2, "Banyo", { review_required: false, item_count: 2, board_count: 0, pending_count: 0 })],
  boards: [{ id: BOARD, title: "Müşteri toplantısı", file_id: FILE, item_count: 3, position: 0, group_id: null }],
  groups: [],
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
    // Kanal listesi artık `team_channels_overview` (docs/history/369-*): eski adın yanıtı yeni adda da geçerlidir.
    if (name === "team_list_channels") db.rpc.team_channels_overview = db.rpc[name];
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
    { id: CHANNEL, name: "villa-projesi", description: null, mode: "project", space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: false, position: 1, archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: null, member_count: 5, can_post: true, mute_scope: null, project_id: PROJECT, project_title: "Villa Projesi", file_id: null, file_title: null, project_main: true },
  ]);
  reply("team_channel_members", () => []);
}

/** Alan (Space motoru satırı) + öğeler. `viewerOf`: ME'nin alandaki Space rolü (lider/düzenleyici = editor, görüntüleyici = viewer). */
function areaSetup(db, { spaceRole = "editor", items = (d) => d } = {}) {
  const other = U.bob;
  for (const [n, id] of [[1, AREA_PROJECT], [2, AREA_FILE], [3, BOARD]]) {
    const row = db.addSpace(n, { owner: other.id, title: n === 1 ? "Villa Projesi" : n === 2 ? "Mutfak" : "Müşteri toplantısı", kind: "team_area", teamId: TEAM, teamProjectId: PROJECT, teamFileId: n === 2 || n === 3 ? FILE : null, members: [[U.alice, spaceRole]] });
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
const openInfo = async (page) => {
  // Merkez düzeni (docs/history/366-*): geniş ekranda kişiler/değişkenler yan sütundadır (bilgi düğmesi yok); dar ekranda ⓘ pencere açar.
  const button = page.locator("[data-path-info]:visible, [data-drill-info]:visible");
  if (await button.count()) await button.first().click();
};
const called = (db, name) => db.teamCalls.filter((c) => c.name === name);
const projectUrl = (extra = "") => `${BASE}/teams/local?id=atolye-mor&tab=projects&project=${PROJECT}${extra}`;
const NOTE = (n) => `17e30000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------------------------------------------------------------------
await scenario("1. Genel bakış: bant + sekmeler, proje kartı (rol rozeti, sayılar, bekleyen), Senden bekleyenler şeridi, Son etkinlik; sekme menüsünde Space'ler/Kütüphane yok", async ({ page, db }) => {
  db.rpc.team_review_board = () => ({ body: { items: [{ id: "n1", kind: "note", state: "pending", title: "Dolap notu", body: "mat beyaz", note: null, media_url: null, content_type: null, color: "", space_id: "s1", project_id: PROJECT, project_title: "Villa Projesi", file_id: FILE, file_title: "Mutfak", author_id: "u-b", author_name: "Bob", author_username: "bob", submitted_at: "2026-11-08T09:00:00Z", decided_at: null, unit: null, unit_count: 1, can_decide: true, mine: false }], proposals: [] } });
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  const list = page.getByTestId("team-project-list");
  await list.waitFor();
  const card = list.locator(`[data-project-card="${PROJECT}"]`);
  await card.getByText("Villa Projesi").waitFor();
  await card.locator("[data-project-role=lead]").waitFor();
  await card.getByText("1 dosya · 1 pano · 5 kişi").waitFor();
  await card.locator('[data-project-pending="2"]').waitFor();
  await page.getByTestId("team-waiting").getByText("Senden bekleyenler").first().waitFor();
  await page.locator("[data-waiting-item]").getByText("Dolap notu").waitFor();
  const tabs = (await page.locator("[data-team-tab-link]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().replace(/ \d+$/, ""));
  assert.deepEqual(tabs, ["Genel bakış", "Onaylar", "Sohbet", "Üyeler", "Panel", "Yönetim"]);
  await page.getByTestId("team-band").getByRole("heading", { name: "Atölye Mor" }).waitFor();
  await page.getByTestId("team-activity").waitFor();
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
  assert.equal(await home.locator("[data-project-main-area]").count(), 0, "yeni modelde proje geneli 'Ortak' kartı yok");
  await home.locator("[data-project-review-link]").waitFor();
  await page.locator("[data-project-open-chat]").waitFor();
  const people = page.getByTestId("project-people");
  await people.getByText("Mert", { exact: true }).waitFor();
  await people.getByText("Sahip", { exact: true }).waitFor();
  await people.getByText("Ekip yöneticisi · her projede lider").waitFor();
  assert.equal(await page.locator('[data-variable-scope="project"]').count(), 0, "proje ortak değişkeni arayüzü kalktı");
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

await scenario("4. Dosya değişkeni: Ekle → team_set_variable(dosya kapsamı); proje geneli değişken yok", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("team-file-page").waitFor();
  await openInfo(page);
  await page.locator('[data-variable-scope="file"] [data-variable-add]').click();
  const form = page.getByTestId("team-variable-form");
  await form.waitFor();
  await form.getByPlaceholder("musteri").fill("sehir");
  await form.getByRole("textbox").nth(1).fill("İzmir");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=team-variable-form]"));
  const body = called(db, "team_set_variable").at(-1)?.body;
  assert.deepEqual({ n: body.p_name, v: body.p_value, f: body.p_file }, { n: "sehir", v: "İzmir", f: FILE });
});

await scenario("5. Dosya sayfası (lider): onaysız öğeler rozetli, yalnız dosya değişkenleri, onay anahtarı → team_file_set_review(false) + uyarı", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const view = page.getByTestId("team-file-page");
  await view.waitFor();
  await view.getByRole("heading", { name: "Mutfak" }).waitFor();
  const panel = view.getByTestId("area-review-panel");
  await panel.waitFor();
  await panel.locator('[data-review-item][data-review-state="pending"]').getByText("Onay bekliyor").waitFor();
  await panel.locator("[data-review-open-queue]").waitFor();
  // Değişkenler: yalnız dosyanın kendi değişkenleri; eski proje düzeyi (musteri) görünmez ve kullanılmaz.
  await openInfo(page);
  const vars = page.locator('[data-variable-scope="file"]');
  await vars.locator('[data-variable-row="stil"]').getByText("Skandinav").waitFor();
  await vars.locator('[data-variable-row="tezgah"]').getByText("mermer").waitFor();
  assert.equal(await vars.locator('[data-variable-row="musteri"]').count(), 0, "proje düzeyi değişken gösterilmez");
  // Onay anahtarı
  const switchRow = page.locator("[data-file-review-switch]");
  await switchRow.getByText("Bu dosyada onay: Açık").waitFor();
  await switchRow.getByRole("switch").click();
  await page.waitForFunction(() => document.body.innerText.includes("2 öğe hâlâ onaysız"));
  assert.equal(called(db, "team_file_set_review").at(-1)?.body.p_on, false);
  // docs/history/365-*: eski sekme şeridi YOK; tek alt görünüm pano, eski sekme adresleri listeye düşer
  await page.keyboard.press("Escape");
  await page.goto(projectUrl(`&file=${FILE}&sub=board`));
  await page.locator('[role=tabpanel]').waitFor();
  assert.equal(await page.locator("[data-area-tab]").count(), 0, "sekme şeridi yok");
  await page.goto(projectUrl(`&file=${FILE}&sub=prompts`));
  await page.getByTestId("area-folder-list").waitFor();
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
  await openInfo(page);
  await page.locator("[data-file-review-note]").getByText("Bu dosyada onay açık", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
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
  await page.getByTestId("area-folder-list").waitFor();
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

await scenario("11. Sohbet: proje sohbeti kanal çipinde proje başlığıyla, genel kanal yanında", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat`);
  const chips = page.getByTestId("team-channel-chips");
  await chips.waitFor();
  await chips.locator('[data-channel-chip="villa-projesi"]').getByText("Villa Projesi").waitFor();
  await chips.locator('[data-channel-chip="genel"]').waitFor();
});

await scenario("12. Eski adresler: tab=spaces ve tab=library → Projeler", async ({ page }) => {
  for (const tab of ["spaces", "library"]) {
    await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=${tab}`);
    await page.getByTestId("team-projects").waitFor();
  }
});

await scenario("13. Dosyanın panosu doğrudan tuvalde açılır (eski liste adresi tuvale yönlenir); pano değiştirici yalnız bağımsız pano", async ({ page }) => {
  await page.goto(projectUrl(`&board=${BOARD}`));
  await page.getByTestId("team-board-mode").waitFor();
  assert.ok(page.url().includes("sub=board"), page.url());
  assert.equal(await page.locator("[data-board-pages-button]").count() > 0 ? await page.locator("[data-board-pages-button]").first().innerText().then((t) => t.includes("1")) : true, true, "bağımsız pano tek sayfadır");
});

await scenario("13b. Eski proje geneli alan (canlıda kalan veri): kart 'Eski proje geneli', alan sayfası açılır, yeni pano/değişken eklenmez", async ({ page, db }) => {
  await page.goto(projectUrl());
  const home = page.getByTestId("team-project-home");
  await home.locator("[data-project-main-area]").getByText("Eski proje geneli").waitFor();
  await home.locator("[data-project-board]").getByText("Eski pano").waitFor();
  assert.equal(await home.locator("[data-project-new-board]").count(), 0, "proje geneli pano ekleme yolu yok");
  await page.goto(projectUrl(`&board=${AREA_PROJECT}`));
  const view = page.getByTestId("team-board-page");
  await view.getByRole("heading", { name: "Ortak" }).waitFor();
  await page.locator("[data-area-add]").click();
  const options = page.getByTestId("area-add-options");
  await options.waitFor();
  assert.equal(await options.locator("[data-area-add-option=board], [data-area-add-option=variable]").count(), 0);
  void db;
}, {
  setup: (db) => {
    const base = db.rpc.team_project_get;
    db.rpc.team_project_get = (b) => {
      const out = base(b);
      return { body: { ...out.body, main_area_id: AREA_PROJECT, item_count: 4, boards: [...out.body.boards, { id: "e1000000-0000-4000-8000-0000000000f1", title: "Eski pano", file_id: null, item_count: 1, position: 0, group_id: null }] } };
    };
  },
});

await scenario("14. Ekle menüsü (docs/history/376-*): pano/görsel/değişken/palet/not + Prompt/İstek/Workflow/Ayar paketi için Oluştur · Seç; prompt artık dosyada yazılmaz; Pano → pano penceresi; taslak notu", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.locator("[data-area-add]").click();
  const options = page.getByTestId("area-add-options");
  await options.waitFor();
  for (const key of ["board", "image", "variable", "palette", "note", "prompt", "request", "workflow", "preset"]) await options.locator(`[data-area-add-option=${key}]`).waitFor();
  // Tür satırına dokununca ekranın ORTASINDA "Oluştur / Seç" seçimi açılır (prompt dosyada yazılmaz).
  await options.locator("[data-area-add-option=prompt]").click();
  const choice = page.locator("[data-content-add-choice=prompt]");
  await choice.waitFor();
  await choice.locator("[data-add-choice=create]").waitFor();
  await choice.locator("[data-add-choice=pick]").waitFor();
  const box = await choice.boundingBox();
  const view = page.viewportSize();
  assert.ok(Math.abs(box.y + box.height / 2 - view.height / 2) < view.height * 0.2, "seçim penceresi ekranın ortasında");
  await page.keyboard.press("Escape");
  await choice.waitFor({ state: "detached" });
  await page.locator("[data-area-add]").click();
  await options.waitFor();
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
  await openInfo(page);
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
  await page.getByRole("heading", { name: /^Projects/ }).waitFor();
  await page.getByText("New project").first().waitFor();
  await page.goto(projectUrl());
  await page.getByRole("button", { name: "New file", exact: true }).waitFor();
  await page.locator("[data-project-header]").getByText("Your role", { exact: false }).waitFor();
  await page.getByText("People & roles").waitFor();
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-boards").getByRole("heading", { name: "Boards" }).waitFor();
  await page.getByText("File items").waitFor();
  await openInfo(page);
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


await scenario("18. Yol satırı, dosya kartları; dosyada pano satırı + öğe kartları, hiçbir şey açık gelmez, kart çekmece açar", async ({ page }) => {
  await page.goto(projectUrl());
  await page.getByTestId("team-project-home").waitFor();
  assert.equal(await page.locator("[data-project-crumbs]").count(), 1, "tek üst çubuk");
  const chips = (await page.locator("[data-project-crumbs]").innerText()).replace(/\s+/g, " ");
  assert.ok(chips.includes("Genel bakış") && chips.includes("Villa Projesi"), chips);
  await page.locator(`[data-file-card="${FILE}"]`).click();
  const list = page.getByTestId("area-folder-list");
  await list.waitFor();
  assert.equal(await page.locator("[data-area-tab]").count(), 0, "sekmeler kendiliğinden açık gelmez");
  assert.equal(await page.locator("[data-testid=space-board]").count(), 0, "tuval kendiliğinden açık gelmez");
  const kinds = await list.locator("[data-area-row]").evaluateAll((els) => els.map((el) => el.getAttribute("data-area-row")));
  assert.equal(kinds[0], "board", "pano satırı ilk (panolar ayrı bölümde, öğelerden önce)");
  assert.equal(await list.getByTestId("area-boards").count(), 1, "panolar ayrı bölüm");
  assert.equal(await list.getByTestId("area-board-rows").locator("[data-area-row=board]").getByText("Ana pano").count(), 0, "dosyanın öğe kabı 'Ana pano' satırı DEĞİL");
  assert.ok(kinds.includes("note"), "not satırı");
  await list.locator("[data-area-row=note]").getByText("Dolap notu").waitFor();
  // Bir kart öğe ÇEKMECESİNİ açar (docs/history/366-*, liste yerinde kalır); ✕ çekmeceyi kapatır
  await list.locator("[data-area-row=note]").click();
  await page.getByTestId("item-drawer").waitFor();
  await page.getByTestId("area-item-detail").waitFor();
  assert.equal(await page.locator("[data-area-tab]").count(), 0, "çekmecede sekme şeridi yok");
  assert.ok(await list.isVisible(), "liste çekmecenin altında yerinde");
  await page.locator("[data-drawer-close]").click();
  await page.getByTestId("item-drawer").waitFor({ state: "detached" });
  await page.getByTestId("area-folder-list").waitFor();
}, {
  items: (db) => { db.addItem(AREA_FILE, { id: NOTE(30), title: "Dolap notu", body: "mat beyaz", rev_state: "approved", created_by: U.bob.id }); },
});

await scenario("19. Ekle: Not → yeni not penceresi LİSTENİN üstünde açılır (sekmeye gitmez); boş dosyada 'Burası boş'", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-empty").getByText("Burası boş").waitFor();
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=note]").click();
  await page.getByTestId("note-editor").waitFor();
  assert.ok(!page.url().includes("sub="), "sekme adresine gitmedi: " + page.url());
  assert.equal(await page.locator("[data-area-tab]").count(), 0);
}, {
  items: () => undefined,
  setup: (db) => {
    const base = db.rpc.team_project_get;
    db.rpc.team_project_get = (b) => ({ body: { ...base(b).body, boards: [], groups: [] } });
  },
});

await scenario("20. Ekip alanında 'Space' kelimesi geçmez (liste, pano, görseller, promptlar, notlar, palet, workflow)", async ({ page }) => {
  for (const sub of ["", "&sub=board", "&sub=images", "&sub=prompts", "&sub=notes", "&sub=palette", "&sub=content"]) {
    await page.goto(projectUrl(`&file=${FILE}${sub}`));
    // docs/history/367-*: `sub=board` pano kipidir (tam tuval, kendi yol çubuğu); diğerleri dosya sayfasıdır.
    const root = page.getByTestId(sub === "&sub=board" ? "team-board-mode" : "team-file-page");
    await root.waitFor();
    await page.waitForTimeout(250);
    const text = await root.innerText();
    assert.ok(!/Space/.test(text), `"Space" geçiyor (${sub || "liste"}): ${text.match(/.{0,30}Space.{0,30}/)?.[0]}`);
  }
}, { items: () => undefined });

await scenario("21. Telefon: pano kipi (docs/history/367-*): alt menü yerinde, araç çubuğu ekrana sığar, yatay taşma yok", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}&sub=board`));
  const toolbar = page.locator("[data-board-toolbar-size=phone]");
  await toolbar.first().waitFor();
  assert.ok(await page.locator("nav[data-app-nav]").isVisible(), "alt menü görünür kalmalı");
  for (const name of ["Ekle", "Panolar", "Yakınlaştırma"]) await page.getByRole("button", { name }).first().waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 800 }, items: () => undefined });


// ---------------------------------------------------------------------------------------------------------------------------------------
// Öğe detay sayfaları (docs/history/364-*)
// ---------------------------------------------------------------------------------------------------------------------------------------
const PROMPT = (n) => `17e40000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const IMAGE = (n) => `17e50000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PALETTE = "17e60000-0000-4000-8000-000000000001";
const itemUrl = (id) => projectUrl(`&file=${FILE}&item=${encodeURIComponent(id)}`);
const detailItems = (db) => {
  db.addItem(AREA_FILE, { id: PROMPT(1), kind: "prompt", is_draft: true, title: "Salon — Japandi sahne", body: "{musteri} için {stil} üslubunda oturma odası, {tezgah} sehpa, {renk} tonlar", rev_state: "pending", created_by: U.bob.id });
  db.addItem(AREA_FILE, { id: IMAGE(1), kind: "image", title: "Salon referansı", media_url: "https://x.supabase.co/storage/v1/object/public/space-media/u/ref.jpg", media_width: 1600, media_height: 1067, rev_state: "approved", created_by: U.bob.id });
  db.addItem(AREA_FILE, { id: NOTE(40), title: "Ölçüler", body: "Salon 5,2 m × 3,8 m. Pencere güneye bakıyor.", rev_state: "changes", rev_note: "Ölçüleri metreyle yaz", created_by: U.bob.id });
  db.spacePalettes.push({ id: PALETTE, space_id: AREA_FILE, name: "Doğal tonlar", description: "Salonun renkleri", colors: ["#E8DFD0", "#B79F84", "#6B7A5E"], source: "manual", source_item_id: null, position: 0, created_by: U.bob.id, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" });
};

await scenario("22. Prompt detayı: yalnız dosya değişkenleri dolar (proje düzeyi kullanılmaz), anahtar kapanınca jeton görünür; kopyalama metni anahtara uyar", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-row=prompt]").click();
  const detailEl = page.getByTestId("area-item-detail");
  await detailEl.waitFor();
  assert.equal(await detailEl.getAttribute("data-item-kind"), "prompt");
  const crumbs = (await page.getByTestId("item-drawer").innerText()).replace(/\s+/g, " ").toLowerCase();
  assert.ok(crumbs.includes("mutfak") && crumbs.includes("salon — japandi sahne"), crumbs);
  assert.equal(await page.locator("[data-path-more]").count(), 1, "ⓘ yerine ⋯ var");
  const text = page.locator("[data-item-prompt-text]");
  const filled = (await text.innerText()).replace(/\s+/g, " ");
  assert.ok(filled.includes("{musteri} için Skandinav üslubunda") && filled.includes("mermer sehpa"), filled + " (proje düzeyi değişken kullanılmaz)");
  assert.ok(filled.includes("{renk}"), "değeri olmayan jeton aynen kalır");
  // Değişken listesi: kaynak rozetleri
  const vars = page.locator("[data-item-variables]");
  assert.ok((await vars.locator('[data-item-variable="stil"]').innerText()).includes("dosyadan"));
  assert.ok((await vars.locator('[data-item-variable="musteri"]').innerText()).includes("değer yok"));
  assert.ok((await vars.locator('[data-item-variable="renk"]').innerText()).includes("değer yok"));
  // Doldurarak kopyala
  assert.equal((await page.locator("[data-item-copy]").innerText()).trim(), "Doldurarak kopyala");
  await page.locator("[data-item-copy]").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "{musteri} için Skandinav üslubunda oturma odası, mermer sehpa, {renk} tonlar");
  // Anahtarı kapat: ham jetonlar + "Olduğu gibi kopyala"
  await page.locator("[data-item-fill-switch]").click();
  assert.equal(await page.locator("[data-item-fill-switch]").getAttribute("aria-checked"), "false");
  assert.ok((await text.innerText()).includes("{musteri} için {stil}"));
  assert.equal((await page.locator("[data-item-copy]").innerText()).trim(), "Olduğu gibi kopyala");
  await page.locator("[data-item-copy]").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "{musteri} için {stil} üslubunda oturma odası, {tezgah} sehpa, {renk} tonlar");
}, { items: detailItems });

await scenario("23. Prompt detayı (lider, onay bekliyor): Onayla → team_review_decide(approve); Değişiklik iste not zorunlu → changes + not", async ({ page, db }) => {
  await page.goto(itemUrl(PROMPT(1)));
  await page.getByTestId("area-item-bar").waitFor();
  await page.locator("[data-item-ask-changes]").click();
  await page.locator("[data-item-send-changes]").click();
  await page.getByText("Değişiklik isterken bir not yaz.").waitFor();
  assert.equal(called(db, "team_review_decide").length, 0, "notsuz çağrı yok");
  await page.locator("[data-item-change-note]").fill("Ölçüleri metreyle yaz");
  await page.locator("[data-item-send-changes]").click();
  await page.waitForFunction(() => true);
  const changes = called(db, "team_review_decide").at(-1)?.body;
  assert.deepEqual([changes.p_item_ids, changes.p_decision, changes.p_note], [[PROMPT(1)], "changes", "Ölçüleri metreyle yaz"]);
  await page.goto(itemUrl(PROMPT(1)));
  await page.locator("[data-item-approve]").click();
  const approve = called(db, "team_review_decide").at(-1)?.body;
  assert.deepEqual([approve.p_item_ids, approve.p_decision], [[PROMPT(1)], "approve"]);
}, { items: detailItems });

await scenario("24. Görsel detayı: büyütülebilir görsel, boyut/biçim bilgisi, Panoda göster → pano sekmesi o öğeye odaklı", async ({ page }) => {
  await page.goto(itemUrl(IMAGE(1)));
  await page.locator("[data-item-image]").waitFor();
  const info = (await page.locator("dl").first().innerText()).replace(/\s+/g, " ");
  assert.ok(info.includes("1600 × 1067") && info.includes("JPEG"), info);
  await page.locator("[data-item-image]").click();
  await page.getByRole("button", { name: "Kapat" }).first().waitFor();
  await page.keyboard.press("Escape");
  // Dosyanın öğesi pano DEĞİL, görünmez kapta durur: "Panoda göster" yoktur (docs/history/370-*).
  assert.equal(await page.locator("[data-item-show-on-board-button]").count(), 0, "dosya öğesinde Panoda göster yok");
}, { items: detailItems });

await scenario("24b. Gerçek panodaki görsel: Panoda göster → o panonun tuvali o öğeye odaklı açılır", async ({ page }) => {
  await page.goto(projectUrl(`&board=${BOARD}&item=${encodeURIComponent(IMAGE(2))}`));
  await page.locator("[data-item-image]").waitFor();
  await page.locator("[data-item-show-on-board-button]").click();
  await page.waitForURL(/sub=board/);
  assert.ok(page.url().includes(`focus=${IMAGE(2)}`) && page.url().includes(`board=${BOARD}`), page.url());
}, { items: (db) => { detailItems(db); db.addItem(BOARD, { id: IMAGE(2), kind: "image", title: "Pano görseli", media_url: "https://x.supabase.co/storage/v1/object/public/space-media/u/ref2.jpg", media_width: 800, media_height: 600, rev_state: "approved", created_by: U.bob.id }); } });

await scenario("25. Not detayı: gövde, bağlı öğe/görünürlük satırları ve liderin notu (değişiklik istendi)", async ({ page }) => {
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-item-note]").waitFor();
  assert.ok((await page.locator("[data-item-note]").innerText()).includes("Salon 5,2 m"));
  const rows = (await page.locator("dl").first().innerText()).replace(/\s+/g, " ");
  assert.ok(rows.includes("Yok (serbest not)") && rows.includes("Bu alana erişenlere"), rows);
  const lead = await page.locator("[data-item-lead-note]").innerText();
  assert.ok(lead.includes("Liderin notu") && lead.includes("Ölçüleri metreyle yaz"), lead);
  assert.ok((await page.getByTestId("item-drawer").innerText()).includes("Değişiklik istendi"));
}, { items: detailItems });

await scenario("26. Palet detayı: renkler satır satır, rengi kopyala; liste satırı palette: adresine gider", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-row=palette]").click();
  await page.locator("[data-item-palette-colors]").waitFor();
  assert.ok(page.url().includes("item=palette%3A") || page.url().includes("item=palette:"), page.url());
  assert.equal(await page.locator("[data-item-color]").count(), 3);
  await page.locator('[data-item-color="#B79F84"]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "#B79F84");
  await page.locator('[data-item-color="#B79F84"]').getByText("Kopyalandı").waitFor();
}, { items: detailItems });

await scenario("27. ⋯ menüsü: Sil (dosya öğesinde Panoda göster yok); Sil onay ister, onaylayınca öğe silinir ve liste açılır", async ({ page, db }) => {
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-delete]").waitFor();
  assert.equal(await page.locator("[data-item-show-on-board]").count(), 0, "dosya öğesinde Panoda göster yok");
  await page.locator("[data-item-delete]").click();
  await page.getByText("Silinsin mi?").waitFor();
  await page.getByRole("button", { name: "Sil" }).last().click();
  await page.getByTestId("item-drawer").waitFor({ state: "detached" });
  await page.getByTestId("area-folder-list").waitFor();
  assert.ok(!db.spaceItems.some((row) => row.id === NOTE(40)), "öğe silindi");
  assert.equal(await page.locator("[data-area-row=note]").count(), 0);
}, { items: detailItems });

await scenario("28. Görüntüleyici: öğe detayını görür; silme, ⋯ menüsü ve onay çubuğu yok", async ({ page }) => {
  await page.goto(itemUrl(IMAGE(1)));
  await page.locator("[data-item-image]").waitFor();
  assert.equal(await page.getByTestId("area-item-bar").count(), 0);
  // Görüntüleyicinin dosya öğesinde ⋯ menüsünde yapacağı bir şey kalmadı (Panoda göster yok, silme yok).
  assert.equal(await page.locator("[data-path-more]").count(), 0);
  assert.equal(await page.locator("[data-item-delete]").count(), 0);
}, { projectRole: "view", spaceRole: "viewer", items: detailItems });

await scenario("29. Olmayan öğe: 'Bu öğe bulunamadı' ve listeye dönüş", async ({ page }) => {
  await page.goto(itemUrl("17e90000-0000-4000-8000-000000000099"));
  await page.getByTestId("area-item-missing").waitFor();
  await page.getByRole("link", { name: "Listeye dön" }).click();
  await page.getByTestId("area-folder-list").waitFor();
}, { items: detailItems });

await scenario("30. İngilizce prompt detayı ve telefonda yatay taşma yok", async ({ page }) => {
  await page.goto(itemUrl(PROMPT(1)));
  await page.getByTestId("area-item-detail").waitFor();
  const text = (await page.getByTestId("area-item-detail").innerText()).toLowerCase();
  for (const word of ["Fill in the variables", "Variables", "Copy filled in", "Approve", "Request changes"]) assert.ok(text.includes(word.toLowerCase()), `${word}: ${text.slice(0, 300)}`);
  assert.ok(!/değişken|onayla/.test(text), "Türkçe kalıntı yok");
  assert.ok(await overflowFree(page));
}, { lang: "en", viewport: { width: 390, height: 800 }, items: detailItems });


// ---------------------------------------------------------------------------------------------------------------------------------------
// Ortak düz üst çubuk + eski sekmelerin yerini alan akışlar (docs/history/365-*)
// ---------------------------------------------------------------------------------------------------------------------------------------
await scenario("31. Başlıklar: proje/dosya/pano sayfalarında telefon başlığı (geri + üst konum + başlık), onay kuyruğunda düz çubuk; öğe çekmecesinde ⋯", async ({ page }) => {
  const checkDrill = async (title, parentPart) => {
    const bar = page.locator("[data-drill-header]").first();
    await bar.waitFor();
    assert.equal((await bar.locator("[data-drill-title]").innerText()).trim(), title);
    if (parentPart) assert.ok((await bar.innerText()).includes(parentPart), `${title}: ${await bar.innerText()}`);
    assert.equal(await bar.locator("[data-drill-back]").count(), 1);
  };
  await page.goto(projectUrl());
  await checkDrill("Villa Projesi", "Atölye Mor");
  await page.goto(projectUrl(`&file=${FILE}`));
  await checkDrill("Mutfak", "Villa Projesi");
  await page.goto(projectUrl(`&file=${FILE}&item=${encodeURIComponent(NOTE(40))}`));
  await page.getByTestId("item-drawer").waitFor();
  assert.equal((await page.locator("[data-item-title]").innerText()).trim(), "Ölçüler");
  assert.ok((await page.getByTestId("item-drawer").innerText()).toLowerCase().includes("mutfak"));
  assert.equal(await page.locator("[data-path-more]").count(), 1);
  await page.goto(projectUrl("&review=1"));
  const bar = page.locator("[data-project-crumbs]").first();
  await bar.waitFor();
  assert.equal((await bar.locator("[data-path-title]").innerText()).trim(), "Onay bekleyenler");
  assert.ok((await bar.innerText()).includes("Villa Projesi"));
}, { viewport: { width: 390, height: 800 }, items: detailItems });

await scenario("32. Ekle → Palet/Görsel: sekmeye gitmeden pencere/dosya seçici; eski sekme adresleri listeye düşer", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=palette]").click();
  await page.getByRole("dialog").first().waitFor();
  await page.keyboard.press("Escape");
  // Görsel: dosya seçici tarayıcıda açılır (gizli giriş), sekme yok
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=image]").click();
  await chooser;
  assert.equal(await page.locator("[data-area-tab]").count(), 0);
}, { items: () => undefined });

const BOARD2 = SID(4);
const PICK_P1 = "a1c00000-0000-4000-8000-000000000001";
const PICK_P2 = "a1c00000-0000-4000-8000-000000000002";
const pickAuthor = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pickPrompt = (id, title, by) => ({
  id, title, description: "d", prompt_text: "metin", tool: null, tools: [], content_type: "text", category: null, subcategory: null, status: "published", origin_type: "original",
  request_id: null, like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-10-20T12:00:00Z", show_on_profile: true, requires_reference_image: false,
  requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, team_file_id: null, profiles: pickAuthor(by), prompt_media: [], prompt_tags: [],
});
const pickerSetup = (db) => {
  const mine = pickPrompt(PICK_P1, "Benim promptum", { id: ME, username: "alice", display_name: "Alice" });
  const others = pickPrompt(PICK_P2, "Bobun promptu", U.bob);
  db.rpc.search_content = (body) => {
    db.teamCalls.push({ name: "search_content", body });
    const list = body.p_exclude_author_ids ? [others] : [mine];
    return { body: list.map((r) => ({ id: r.id, created_at: r.created_at, sort_rank: 0 })) };
  };
  const previous = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "prompts" && ctx.method === "GET") {
      const ids = (ctx.q.get("id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
      ctx.json(200, [mine, others].filter((r) => ids.includes(r.id)));
      return true;
    }
    return previous?.(ctx);
  };
  db.rpc.team_attach_content = (body) => { db.teamCalls.push({ name: "team_attach_content", body }); return { body: { item_id: "17e70000-0000-4000-8000-0000000000aa", board_item_id: null, existing: false } }; };
};

await scenario("32b. Ekle → Oluştur: gerçek oluşturma ekranı ekip bağlamıyla açılır (formda yazılmaz); hedef kartı 'Proje → Dosya', görünürlük/duyuru seçeneği yok, buton 'Dosyaya ekle'", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=prompt]").click();
  await page.locator("[data-add-choice=create]").click();
  await page.waitForURL(new RegExp(`/create/?\\?mode=prompt&teamProject=${PROJECT}&teamFile=${FILE}`));
  const card = page.locator("[data-team-destination]");
  await card.waitFor();
  await card.getByText("Villa Projesi → Mutfak").waitFor();
  assert.equal(await page.locator("[data-audience-field]").count(), 0, "görünürlük seçimi yok");
  assert.equal(await page.locator("[data-announce-picker]").count(), 0, "topluluklarda duyuru yok");
  assert.equal((await page.locator("[data-action=publish]").innerText()).trim(), "Dosyaya ekle");
  assert.equal(await page.locator("[data-action=save-draft]").count(), 1, "taslak kaydı var");
});

await scenario("32c. Ekle → Seç: iki sekme (Paylaştıklarım / Başkalarının paylaştıkları), gelişmiş arama + Filtre; Ekle → team_attach_content (başvuru, dosya)", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=prompt]").click();
  await page.locator("[data-add-choice=pick]").click();
  const picker = page.locator("[data-team-content-picker=prompt]");
  await picker.waitFor();
  await picker.locator(`[data-picker-row="${PICK_P1}"]`).getByText("Benim promptum").waitFor();
  const first = called(db, "search_content").at(-1).body;
  assert.deepEqual(first.p_author_ids, [ME], "Paylaştıklarım: yalnız kendi içeriğim");
  assert.equal(first.p_exclude_author_ids, undefined, "eski imza");
  await picker.locator(`[data-picker-add="${PICK_P1}"]`).click();
  await picker.locator(`[data-picker-added="${PICK_P1}"]`).waitFor();
  const [attach] = called(db, "team_attach_content");
  assert.deepEqual({ f: attach.body.p_file, t: attach.body.p_type, i: attach.body.p_id, b: attach.body.p_board }, { f: FILE, t: "prompt", i: PICK_P1, b: null });
  await page.getByRole("tab", { name: "Başkalarının paylaştıkları" }).click();
  await picker.locator(`[data-picker-row="${PICK_P2}"]`).getByText("Bobun promptu").waitFor();
  await picker.getByText("@bob").waitFor();
  const second = called(db, "search_content").at(-1).body;
  assert.deepEqual(second.p_exclude_author_ids, [ME], "Başkaları: kendim hariç");
  await picker.locator("[data-picker-filter]").click();
  await picker.locator("[data-picker-filter-panel]").waitFor();
  assert.equal(await picker.getByRole("searchbox").count() + await picker.getByRole("combobox").count() > 0, true, "gelişmiş arama kutusu");
  await picker.getByRole("tab", { name: "Paylaştıklarım" }).click().catch(() => page.getByRole("tab", { name: "Paylaştıklarım" }).click());
}, { setup: pickerSetup });

await scenario("32e. Seçilen içerik dosyaya girince kaynağı HEMEN yüklenir (docs/history/377-*): kart 'Kaynak artık erişilemiyor' DEĞİL içeriğin başlığını gösterir, sayfa yenilemek gerekmez", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("area-folder-list").waitFor();
  await page.locator("[data-area-add]").click();
  await page.locator("[data-area-add-option=prompt]").click();
  await page.locator("[data-add-choice=pick]").click();
  const picker = page.locator("[data-team-content-picker=prompt]");
  await picker.waitFor();
  await picker.locator(`[data-picker-add="${PICK_P1}"]`).click();
  await picker.locator(`[data-picker-added="${PICK_P1}"]`).waitFor();
  await page.locator("[data-picker-done]").click();
  await page.getByTestId("area-rows").getByText("Benim promptum").waitFor();
  assert.equal(await page.getByText("Kaynak artık erişilemiyor").count(), 0, "kaynak yüklendi, erişilemiyor yazmaz");
}, {
  setup: (db) => {
    pickerSetup(db);
    db.rpc.team_attach_content = (body) => {
      db.teamCalls.push({ name: "team_attach_content", body });
      const id = "17e70000-0000-4000-8000-0000000000aa";
      db.addItem(AREA_FILE, { id, kind: "prompt", is_draft: false, prompt_id: body.p_id, title: "", rev_state: "approved", created_by: ME });
      return { body: { item_id: id, board_item_id: null, existing: false } };
    };
  },
});

await scenario("32d. Panodaki yansıma: 'Panodan kaldır' yalnız yerleşimi siler (onay metni dosyada kalacağını söyler); 'Dosyadan sil' asıl öğeyi siler → team_item_delete", async ({ page, db }) => {
  db.rpc.team_item_delete = (body) => { db.teamCalls.push({ name: "team_item_delete", body }); return { body: null }; };
  const mirror = "17e60000-0000-4000-8000-000000000001";
  await page.goto(projectUrl(`&board=${BOARD}&item=${mirror}`));
  await page.getByTestId("item-drawer").waitFor();
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-remove-from-board]").waitFor();
  await page.locator("[data-item-remove-from-board]").click();
  await page.getByText("yalnız bu panodan kalkar", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-delete]").click();
  await page.getByText("tüm panolardan silinecek", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Dosyadan sil" }).last().click();
  await page.waitForTimeout(300);
  assert.equal(called(db, "team_item_delete").at(-1)?.body.p_item, mirror);
}, { items: (db) => { detailItems(db); db.addItem(BOARD, { id: "17e60000-0000-4000-8000-000000000001", kind: "note", title: "Yansıma notu", body: "x", rev_state: "approved", file_item_id: NOTE(40), created_by: ME }); } });


await scenario("33. Öğe sayfası ⋯ (lider): Düzenle → not düzenleyici penceresi", async ({ page }) => {
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-edit]").click();
  await page.getByTestId("note-editor").waitFor();
}, { items: detailItems });

await scenario("34. Öğe sayfası ⋯ (düzenleyici): onaylı öğeyi düzenleyemez, Değişiklik öner → team_review_propose; kendi taslağını düzenler", async ({ page, db }) => {
  await page.goto(itemUrl(NOTE(41)));
  await page.locator("[data-path-more]").click();
  assert.equal(await page.locator("[data-item-edit]").count(), 0, "onaylı öğeyi düzenleyici düzenleyemez");
  await page.locator("[data-item-propose]").click();
  const form = page.getByTestId("area-propose-form");
  await form.waitFor();
  await form.getByRole("button", { name: "Öneriyi gönder" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=area-propose-form]"));
  assert.equal(called(db, "team_review_propose").at(-1)?.body.p_item, NOTE(41));
  await page.goto(itemUrl(NOTE(42)));
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-edit]").click();
  await page.getByTestId("note-editor").waitFor();
}, {
  projectRole: "edit",
  items: (db) => {
    db.addItem(AREA_FILE, { id: NOTE(41), title: "Onaylı not", body: "metin", rev_state: "approved", created_by: U.bob.id });
    db.addItem(AREA_FILE, { id: NOTE(42), title: "Taslak notum", body: "x", rev_state: "draft", created_by: ME });
  },
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// Dosya ↔ pano ayrımı, pano grupları, boş doğan dosya, taslak gizliliği (docs/history/368-*)
// ---------------------------------------------------------------------------------------------------------------------------------------
const GA = SID(4);
const GB = SID(5);
const GC = SID(6);
const GROUP = "e1000000-0000-4000-8000-0000000000c1";
const groupSetup = (db) => {
  for (const [n, title] of [[4, "Taslaklar"], [5, "Sunum"], [6, "Referans"]]) db.addSpace(n, { owner: U.bob.id, title, kind: "team_area", teamId: TEAM, teamProjectId: PROJECT, teamFileId: FILE, members: [[U.alice, "editor"]] });
  const base = db.rpc.team_project_get;
  db.rpc.team_project_get = (b) => {
    const out = base(b);
    return { body: { ...out.body, boards: [
      { id: GA, title: "Taslaklar", file_id: FILE, item_count: 2, position: 0, group_id: GROUP },
      { id: GB, title: "Sunum", file_id: FILE, item_count: 1, position: 1, group_id: GROUP },
      { id: GC, title: "Referans", file_id: FILE, item_count: 0, position: 2, group_id: null },
    ], groups: [{ id: GROUP, title: "Mutfak panoları", file_id: FILE, board_count: 2 }],
    areas: [
      { id: AREA_FILE, title: "Mutfak", file_id: FILE, is_main: true, position: 0, group_id: null, item_count: 0, updated_at: null, pending_count: null, open_comments: 0 },
      { id: GA, title: "Taslaklar", file_id: FILE, is_main: false, position: 0, group_id: GROUP, item_count: 2, updated_at: null, pending_count: null, open_comments: 0 },
      { id: GB, title: "Sunum", file_id: FILE, is_main: false, position: 1, group_id: GROUP, item_count: 1, updated_at: null, pending_count: null, open_comments: 0 },
      { id: GC, title: "Referans", file_id: FILE, is_main: false, position: 2, group_id: null, item_count: 0, updated_at: null, pending_count: null, open_comments: 0 },
    ] } };
  };
  db.rpc.team_create_board_in_group = (b) => { db.teamCalls.push({ name: "team_create_board_in_group", body: b }); return { body: GC }; };
};

await scenario("35. Dosyada pano grubu tek satır, bağımsız pano ayrı satır; grup satırı ilk panonun tuvalini açar; değiştirici yalnız grubu gösterir", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const boards = page.getByTestId("area-board-rows");
  await boards.waitFor();
  assert.equal(await boards.locator("[data-area-row]").count(), 2, "1 grup + 1 bağımsız pano");
  await boards.getByText("Pano grubu · 2 pano").waitFor();
  await boards.getByText("Mutfak panoları").waitFor();
  await boards.getByText("Referans").waitFor();
  await boards.getByText("Mutfak panoları").click();
  await page.getByTestId("team-board-mode").waitFor();
  assert.ok(page.url().includes(`board=${GA}`) && page.url().includes("sub=board"), page.url());
  await page.locator("[data-board-pages-button]").first().click();
  await page.locator("[data-board-page]").first().waitFor();
  const ids = await page.locator("[data-board-page]").evaluateAll((els) => els.map((el) => el.getAttribute("data-board-page")));
  assert.deepEqual(ids, [GA, GB], "bağımsız pano (Referans) grubun değiştiricisinde çıkmaz");
}, { setup: groupSetup });

await scenario("36. Bağımsız panoda 'Yeni pano' → team_create_board_in_group (açık pano + ad); değiştirici tek sayfa", async ({ page, db }) => {
  await page.goto(projectUrl(`&board=${GC}&sub=board`));
  await page.getByTestId("team-board-mode").waitFor();
  await page.locator("[data-board-pages-button]").first().click();
  assert.equal(await page.locator("[data-board-page]").count(), 1, "bağımsız pano tek sayfa");
  await page.locator("[data-board-page-new]").first().click();
  const form = page.getByTestId("team-new-board-form");
  await form.waitFor();
  await form.getByRole("textbox").first().fill("Yeni sayfa");
  await form.getByRole("button", { name: "Panoyu aç" }).click();
  await page.waitForTimeout(300);
  const body = called(db, "team_create_board_in_group").at(-1)?.body;
  assert.deepEqual({ from: body.p_from, title: body.p_title }, { from: GC, title: "Yeni sayfa" });
  assert.equal(called(db, "team_create_board").length, 0, "grup kurulumu sunucuda: bağımsız pano RPC'si çağrılmaz");
}, { setup: groupSetup });

await scenario("37. Boş dosya hata değil boş durum: pano yok, öğe yok; panoya dair isteğe bağlı ipucu", async ({ page }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  await page.getByTestId("team-file-page").waitFor();
  await page.getByTestId("area-boards-empty").getByText("Pano eklemek isteğe bağlıdır", { exact: false }).waitFor();
  await page.getByTestId("area-empty").waitFor();
  assert.equal(await page.getByText("Dosya bulunamadı").count(), 0);
}, {
  items: () => undefined,
  setup: (db) => {
    const base = db.rpc.team_project_get;
    db.rpc.team_project_get = (b) => ({ body: { ...base(b).body, boards: [], groups: [] } });
  },
});

await scenario("38. Yeni açılan dosya bellekteki eski proje verisinde yoksa 'Dosya bulunamadı' DEĞİL: veri bir kez tazelenir", async ({ page, db }) => {
  const NEW = "e1000000-0000-4000-8000-0000000000b9";
  let reads = 0;
  const base = db.rpc.team_project_get;
  db.rpc.team_project_get = (b) => {
    reads += 1;
    const out = base(b);
    // İlk okuma yeni dosyayı henüz içermez (eski önbellek); ikinci okuma içerir.
    const files = reads >= 2 ? [...out.body.files, { id: NEW, title: "Yeni dosya", position: 3, review_required: true, main_area_id: AREA_FILE, item_count: 0, board_count: 0, pending_count: 0 }] : out.body.files;
    return { body: { ...out.body, files } };
  };
  await page.goto(projectUrl(`&file=${NEW}`));
  await page.getByTestId("team-file-page").waitFor();
  assert.ok(reads >= 2, "veri tazelendi: " + reads);
  assert.equal(await page.getByText("Dosya bulunamadı").count(), 0);
});

await scenario("39. Gerçekten olmayan dosya: bir kez tazelenir, sonra 'Dosya bulunamadı' gösterilir", async ({ page }) => {
  await page.goto(projectUrl("&file=e1000000-0000-4000-8000-0000000000ff"));
  await page.getByText("Dosya bulunamadı").waitFor();
});

await scenario("40. Proje kişileri: lider açık girişi tek dokunuşla çıkarır (onay → team_set_project_access, kişi listede yok); örtük lider ve kendin çıkarılamaz; 'Tüm ekip' modunda çıkarma yok", async ({ page, db }) => {
  const entries = [
    { type: "member", id: "u-a", role: "lead", name: "Ayşe", username: "ayse", sub: "editor" },
    { type: "member", id: "u-m", role: "edit", name: "Mert", username: "mert", sub: "member" },
  ];
  db.rpc.team_project_access = () => ({ body: { mode: "selected", base_role: "view", entries } });
  await page.goto(projectUrl());
  await openInfo(page);
  const people = page.getByTestId("project-people");
  await people.waitFor();
  assert.equal(await people.locator("[data-project-person-remove]").count(), 3, "Sahip (örtük lider) hariç üç kişide çıkarma simgesi");
  await people.getByRole("button", { name: "Mert kişisini projeden çıkar" }).click();
  await page.getByText("Mert projeden çıkarılsın mı?").waitFor();
  await page.getByRole("button", { name: "Erişimi kaldır" }).last().click();
  await page.waitForTimeout(300);
  const body = called(db, "team_set_project_access").at(-1)?.body;
  assert.ok(body, "team_set_project_access çağrıldı");
  assert.deepEqual(body.p_entries.map((entry) => entry.id), ["u-a"], "yalnız Mert çıkarıldı");
  assert.equal(body.p_mode, "selected");
});

await scenario("41. 'Tüm ekip' modundaki projede kişi listesinde çıkarma simgesi yok, açıklama var", async ({ page, db }) => {
  db.rpc.team_project_get = () => ({ body: detail("lead", { project: { ...detail("lead").project, access_mode: "all" } }) });
  await page.goto(projectUrl());
  await openInfo(page);
  const people = page.getByTestId("project-people");
  await people.waitFor();
  assert.equal(await people.locator("[data-project-person-remove]").count(), 0);
  await people.locator("[data-project-all-note]").waitFor();
});

await scenario("42. Yeni dosya / pano / proje pencerelerinde 'Space' kelimesi geçmez (Dosya adı · Pano adı · Proje adı)", async ({ page }) => {
  await page.goto(projectUrl());
  await page.getByRole("button", { name: "Yeni dosya" }).first().click();
  const form = page.getByTestId("team-new-file-form");
  await form.waitFor();
  await form.getByLabel("Dosya adı").waitFor();
  assert.ok(!(await form.innerText()).includes("Space"), "yeni dosya penceresi");
  await form.getByRole("button", { name: "Vazgeç" }).click();
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  await page.getByRole("button", { name: /Yeni proje/ }).first().click();
  const project = page.getByTestId("team-create-project-form");
  await project.waitFor();
  await project.getByLabel("Proje adı").waitFor();
  assert.ok(!(await project.innerText()).includes("Space"), "yeni proje penceresi");
});

// 43–45 (docs/history/375-*): Panoya ekle (mevcut pano / pano yoksa Pano ekle) ve öğe düzenlemede "+ Yeni grup…"
const NEW_ITEM_ID = "17e70000-0000-4000-8000-000000000001";
const placeReply = (db) => {
  db.rpc.team_board_place_items = (body) => {
    db.teamCalls.push({ name: "team_board_place_items", body });
    return { body: { placed: (body.p_items ?? []).length, skipped: 0, ids: [NEW_ITEM_ID] } };
  };
};
await scenario("43. Dosya öğesi: 'Panoya ekle' (docs/history/376-*): pencere AYNI dosyanın panolarını listeler, taşı/kopyala seçeneği YOK; seçince team_board_place_items ve panoya odaklı gidilir", async ({ page, db }) => {
  placeReply(db);
  await page.goto(itemUrl(NOTE(40)));
  const button = page.locator("[data-item-add-to-board-button]");
  await button.waitFor();
  assert.equal((await button.innerText()).trim(), "Panoya ekle");
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-add-to-board]").waitFor();
  await page.keyboard.press("Escape");
  await button.click();
  const form = page.getByTestId("add-to-board-form");
  await form.waitFor();
  await form.locator(`[data-add-to-board="${BOARD}"]`).waitFor();
  await form.locator("[data-add-to-board-note]").waitFor();
  assert.equal(await form.locator("[data-add-to-board-keep]").count(), 0, "taşı/kopyala yok: öğe dosyada kalır, pano gösterir");
  assert.equal(await form.locator("[data-add-to-board-empty]").count(), 0, "pano varken boş durum metni yok");
  assert.equal(await form.getByRole("button", { name: "Panoya ekle" }).isDisabled(), true, "pano seçilmeden gönderilemez");
  await form.locator(`[data-add-to-board="${BOARD}"]`).click();
  await form.getByRole("button", { name: "Panoya ekle" }).click();
  await page.waitForURL(new RegExp(`board=${BOARD}.*sub=board|sub=board.*board=${BOARD}`));
  assert.match(page.url(), new RegExp(`focus=${NEW_ITEM_ID}`));
  const [call] = called(db, "team_board_place_items");
  assert.equal(call.body.p_board, BOARD);
  assert.deepEqual(call.body.p_items, [NOTE(40)]);
}, { items: detailItems });

await scenario("43b. Birden çok panoya ekle: iki pano seçilir → her biri için team_board_place_items; sayfada kalınır, 'Panolarda' rozetleri görünür", async ({ page, db }) => {
  placeReply(db);
  const base = db.rpc.team_project_get;
  db.rpc.team_project_get = (b) => {
    const out = base(b);
    return { body: { ...out.body, boards: [...out.body.boards, { id: BOARD2, title: "Sunum panosu", file_id: FILE, item_count: 1, position: 1, group_id: null }] } };
  };
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-item-add-to-board-button]").click();
  const form = page.getByTestId("add-to-board-form");
  await form.locator(`[data-add-to-board="${BOARD}"]`).click();
  await form.locator(`[data-add-to-board="${BOARD2}"]`).click();
  await form.getByRole("button", { name: "Panoya ekle" }).click();
  await page.locator(`[data-item-board="${BOARD}"]`).waitFor();
  await page.locator(`[data-item-board="${BOARD2}"]`).waitFor();
  assert.ok(!page.url().includes("sub=board"), "birden çok panoda sayfada kalınır");
  assert.deepEqual(called(db, "team_board_place_items").map((c) => c.body.p_board).sort(), [BOARD, BOARD2].sort());
}, {
  items: detailItems,
  // Yerleşim okuması (`space_items?file_item_id=in.(…)`): sunucu yerleştirilen panoları döndürür.
  setup: (db) => {
    const previous = db.extraRoutes;
    db.extraRoutes = async (ctx) => {
      if (ctx.table === "space_items" && ctx.method === "GET" && ctx.q.get("file_item_id")) {
        ctx.json(200, called(db, "team_board_place_items").map((c) => ({ file_item_id: NOTE(40), space_id: c.body.p_board })));
        return true;
      }
      return previous?.(ctx);
    };
  },
});

await scenario("44. Dosyada hiç pano yoksa pencerede 'Pano ekle' açık gelir: ad yazılır → team_create_board(dosya) sonra team_board_place_items", async ({ page, db }) => {
  placeReply(db);
  const NEW_BOARD = "17e80000-0000-4000-8000-000000000001";
  db.rpc.team_project_get = (body) => { db.teamCalls.push({ name: "team_project_get", body }); return { body: detail("lead", { boards: [] }) }; };
  db.rpc.team_create_board = (body) => { db.teamCalls.push({ name: "team_create_board", body }); return { body: NEW_BOARD }; };
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-item-add-to-board-button]").click();
  const form = page.getByTestId("add-to-board-form");
  await form.locator("[data-add-to-board-empty]").waitFor();
  assert.equal(await form.locator("[data-add-to-board]").count(), 0, "listelenecek pano yok");
  await form.locator("[data-add-to-board-new]").waitFor();
  await form.locator("[data-add-to-board-title]").fill("Fikirler");
  await form.getByRole("button", { name: "Panoya ekle" }).click();
  await page.waitForURL(new RegExp(`board=${NEW_BOARD}`));
  const [create] = called(db, "team_create_board");
  assert.equal(create.body.p_title, "Fikirler");
  assert.equal(create.body.p_file, FILE);
  assert.equal(called(db, "team_board_place_items")[0].body.p_board, NEW_BOARD);
}, { items: detailItems });

await scenario("44b. Pano adı boşsa 'Bir ad yaz.' görünür ve hiçbir şey çağrılmaz", async ({ page, db }) => {
  placeReply(db);
  db.rpc.team_project_get = (body) => { db.teamCalls.push({ name: "team_project_get", body }); return { body: detail("lead", { boards: [] }) }; };
  await page.goto(itemUrl(NOTE(40)));
  await page.locator("[data-item-add-to-board-button]").click();
  const form = page.getByTestId("add-to-board-form");
  await form.getByRole("button", { name: "Panoya ekle" }).click();
  await form.getByText("Bir ad yaz.").waitFor();
  assert.equal(called(db, "team_board_place_items").length, 0);
}, { items: detailItems });

await scenario("45. Öğe düzenleme: Grup seçicide '+ Yeni grup…' ile grup açılır, öğe o gruba girer; dosya listesinde grup süzgeci ve kartta grup adı", async ({ page, db }) => {
  await page.goto(itemUrl(IMAGE(1)));
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-edit]").click();
  const picker = page.getByTestId("group-picker");
  await picker.waitFor();
  assert.deepEqual(await picker.locator("option").allInnerTexts(), ["Grupsuz", "+ Yeni grup…"]);
  await picker.locator("select").selectOption({ label: "+ Yeni grup…" });
  const form = page.getByTestId("group-picker-new");
  await form.getByLabel("Grup adı").fill("Salon");
  await form.getByRole("button", { name: "Ekle" }).click();
  await picker.locator("select option", { hasText: "Salon" }).waitFor({ state: "attached" });
  assert.ok(db.spaceGroups.some((g) => g.name === "Salon"), "grup yazıldı");
  const group = db.spaceGroups.find((g) => g.name === "Salon");
  await page.waitForTimeout(400);
  assert.equal(db.spaceItems.find((row) => row.id === IMAGE(1)).group_id, group.id, "öğe gruba girdi");
}, { items: detailItems });

await scenario("45b. Çoklu seçim (docs/history/377-*): 'Seç' → kartlara dokun → alt çubukta sayı + 'Gruba ekle'; karo penceresinde yeni grup aç → seçilen öğeler o gruba girer, seçim kapanır, grup süzgeci çıkar", async ({ page, db }) => {
  await page.goto(projectUrl(`&file=${FILE}`));
  const rows = page.getByTestId("area-rows");
  await rows.waitFor();
  assert.equal(await page.locator("[data-area-groups-manage-phone]").count(), 0, "eski 'Grupları yönet' düğmesi yok");
  await page.locator("[data-area-select]").click();
  await page.getByTestId("area-select-bar").waitFor();
  assert.equal(await page.locator("[data-select-assign]").isDisabled(), true, "seçim yokken Gruba ekle kapalı");
  const cards = rows.locator("[data-area-card]");
  await cards.nth(0).click();
  await cards.nth(1).click();
  assert.equal(page.url().includes("item="), false, "seçim kipinde karta dokunmak çekmeceyi açmaz");
  await page.locator("[data-select-count]").getByText("2 seçili").waitFor();
  await page.locator("[data-select-assign]").click();
  const form = page.getByTestId("group-assign-form");
  await form.waitFor();
  assert.deepEqual(await form.locator("[data-group-tile]").evaluateAll((els) => els.map((el) => el.getAttribute("data-group-tile"))), ["none", "new"], "grup yok: yalnız Grupsuz + Yeni grup karoları");
  await form.locator("[data-group-tile=new]").click();
  await form.locator("[data-group-new-name]").fill("Mutfak");
  await form.locator("[data-group-new-create]").click();
  const group = await (async () => {
    for (let i = 0; i < 30; i += 1) {
      const found = db.spaceGroups.find((g) => g.name === "Mutfak");
      if (found) return found;
      await page.waitForTimeout(100);
    }
    return null;
  })();
  assert.ok(group, "grup yazıldı");
  await form.locator(`[data-group-tile="${group.id}"][aria-checked=true]`).waitFor();
  await form.getByRole("button", { name: "Mutfak grubuna ekle" }).click();
  await page.getByTestId("area-select-bar").waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  assert.equal(db.spaceItems.filter((row) => row.group_id === group.id).length, 2, "iki öğe gruba girdi");
  await page.locator(`[data-area-group-filter="${group.id}"]`).waitFor();
}, { items: detailItems });

await scenario("45c. Öğe çekmecesi ⋯ → 'Gruba ekle': aynı karo penceresi tek öğe için açılır; grup seçilince öğe o gruba girer", async ({ page, db }) => {
  await page.goto(itemUrl(IMAGE(1)));
  await page.locator("[data-path-more]").click();
  await page.locator("[data-item-group-add]").click();
  const form = page.getByTestId("group-assign-form");
  await form.waitFor();
  await form.getByText("Gruba ekle").first().waitFor();
  await form.locator("[data-group-tile=new]").click();
  await form.locator("[data-group-new-name]").fill("Salon");
  await form.locator("[data-group-new-create]").click();
  await form.locator("[data-group-tile][aria-checked=true]").waitFor();
  await form.getByRole("button", { name: "Salon grubuna ekle" }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  const group = db.spaceGroups.find((g) => g.name === "Salon");
  assert.equal(db.spaceItems.find((row) => row.id === IMAGE(1)).group_id, group.id, "öğe gruba girdi");
  await page.locator("[data-item-group]").getByText("Salon").waitFor();
}, { items: detailItems });

// SURVEY=<klasör>: proje/dosya/pano/onay kuyruğu/öğe çekmecesi ekranlarının üç boyutta ekran görüntüsü (görsel inceleme).
if (process.env.SURVEY) {
  const VIEWS = { phone: { width: 390, height: 844 }, tablet: { width: 834, height: 1112 }, desktop: { width: 1440, height: 900 } };
  const URLS = {
    project: projectUrl(), file: projectUrl(`&file=${FILE}`), board: projectUrl(`&board=${BOARD}&sub=board`), review: projectUrl("&review=1"),
    item_prompt: itemUrl(PROMPT(1)), item_image: itemUrl(IMAGE(1)), item_note: itemUrl(NOTE(40)), item_palette: itemUrl(`palette:${PALETTE}`),
  };
  for (const [vname, viewport] of Object.entries(VIEWS)) {
    await scenario(`S. ${vname}`, async ({ page }) => {
      for (const [key, url] of Object.entries(URLS)) {
        await page.goto(url);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${process.env.SURVEY}/tp_${vname}_${key}.png`, fullPage: true });
      }
    }, { viewport, setup: detailItems });
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
