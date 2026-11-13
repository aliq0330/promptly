// Ekip / proje / topluluk sohbet sayfaları ve hiyerarşik sessize alma (docs/history/369-*): Mesajlar satırı → ekip sayfası → proje sayfası → sohbet (çip satırı yok),
// ekip/proje/kanal sessize alma (kaynak etiketleri, miras bandı), dosya oluştururken sohbet sorusu, projeye kanal ekleme. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ —
// kurallar `supabase/tests/team-chat-hierarchy.sql`'dedir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const PORT = 4231;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const TEAM = "e1000000-0000-4000-8000-000000000001";
const PROJECT = "e1000000-0000-4000-8000-0000000000b1";
const FILE = "e1000000-0000-4000-8000-0000000000b3";
const CH_GENERAL = "e1000000-0000-4000-8000-0000000000a1";
const CH_ANN = "e1000000-0000-4000-8000-0000000000a2";
const CH_MAIN = "e1000000-0000-4000-8000-0000000000a3";
const CH_FILE = "e1000000-0000-4000-8000-0000000000a4";
const CH_EXTRA = "e1000000-0000-4000-8000-0000000000a5";
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const channel = (id, name, mode, extra = {}) => ({
  id, name, description: null, mode, space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: name === "genel", position: 0,
  archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: "2026-11-08T09:00:00Z", member_count: 4, can_post: true,
  mute_scope: null, project_id: null, project_title: null, file_id: null, file_title: null, project_main: false, ...extra,
});
const projectBits = { project_id: PROJECT, project_title: "Villa Projesi" };

/** Sunucu taklidi: sessizlik durumu `st`de tutulur; `team_set_mute` onu değiştirir, kanal listesi ve `team_my_mutes` ondan türer. */
function seed(db, { role = "owner", projectRole = "lead", fileChat = false, mutedTeam = false, mutedProject = false, mutedChannel = false } = {}) {
  const st = { teamMuted: mutedTeam, projectMuted: mutedProject, fileChat, extra: [], channelMuted: mutedChannel };
  const calls = [];
  db.teamCalls = calls;
  db.st = st;
  const reply = (name, fn) => {
    db.rpc[name] = (body) => {
      calls.push({ name, body });
      return { body: fn(body) };
    };
  };
  const overview = () => {
    const team = st.teamMuted ? "team" : null;
    const project = st.teamMuted ? "team" : st.projectMuted ? "project" : null;
    return [
      channel(CH_GENERAL, "genel", "open", { unread_count: team ? 0 : 3, mute_scope: team, muted: Boolean(team) }),
      channel(CH_ANN, "duyurular", "open", { posting_policy: "admins", mute_scope: team, muted: Boolean(team) }),
      channel(CH_MAIN, "villa-projesi", "project", { ...projectBits, project_main: true, unread_count: project ? 0 : 2, mute_scope: project ?? (st.channelMuted ? "channel" : null), muted: Boolean(project) || st.channelMuted }),
      ...(st.fileChat ? [channel(CH_FILE, "mutfak", "project", { ...projectBits, file_id: FILE, file_title: "Mutfak", mute_scope: project, muted: Boolean(project) })] : []),
      ...st.extra.map((name) => channel(CH_EXTRA, name, "project", { ...projectBits, mute_scope: project, muted: Boolean(project) })),
    ];
  };
  reply("my_teams", () => [{
    id: TEAM, slug: "atolye-mor", name: "Atölye Mor", description: "Pazarlama ve tasarım", tone: "primary", my_role: role, member_count: 6, guest_count: 0, space_count: 1,
    channel_count: 3, unread_count: 3, last_activity_at: "2026-11-08T10:00:00Z", library_space_id: null, guest_until: null,
  }]);
  reply("my_teams_preview", () => []);
  reply("my_team_invitations", () => []);
  reply("my_team_todos", () => []);
  reply("team_project_todos", () => []);
  reply("team_review_board", () => ({ items: [], proposals: [] }));
  reply("team_recent_activity", () => []);
  reply("team_member_project_roles", () => []);
  reply("team_list_spaces", () => []);
  reply("team_channel_members", () => []);
  reply("team_list_members", () => []);
  reply("team_list_groups", () => []);
  reply("team_list_channels", overview);
  reply("team_channels_overview", overview);
  reply("team_my_mutes", () => [...(st.teamMuted ? [{ team_id: TEAM, project_id: null }] : []), ...(st.projectMuted ? [{ team_id: TEAM, project_id: PROJECT }] : [])]);
  reply("team_set_mute", (b) => {
    if (b.p_project) st.projectMuted = b.p_muted; else st.teamMuted = b.p_muted;
    return null;
  });
  reply("team_set_channel_notify", () => null);
  reply("team_delete_channel", () => null);
  reply("team_my_project_role", () => projectRole);
  const detail = () => ({
    project: { id: PROJECT, team_id: TEAM, title: "Villa Projesi", description: "", tone: "primary", access_mode: "selected", base_role: "view", review_default: true, archived_at: null, created_at: "2026-11-01T00:00:00Z" },
    my_role: projectRole, main_area_id: "e1000000-0000-4000-8000-0000000000b2", channel_id: CH_MAIN, item_count: 9, pending_count: 0,
    files: [{ id: FILE, title: "Mutfak", review_required: true, main_area_id: "e1000000-0000-4000-8000-0000000000b4", item_count: 6, pending_count: 0, board_count: 0 }],
    boards: [], people: [{ type: "member", id: "u1", name: "Aylin", username: "aylin", avatar_url: null, role: "lead" }, { type: "member", id: "u2", name: "Burak", username: "burak", avatar_url: null, role: "edit" }], variables: [],
  });
  reply("team_project_get", detail);
  reply("team_projects_list", () => [{
    id: PROJECT, title: "Villa Projesi", description: "", tone: "primary", archived_at: null, review_default: true, access_mode: "selected", base_role: "view", my_role: projectRole,
    main_area_id: "e1000000-0000-4000-8000-0000000000b2", channel_id: CH_MAIN, member_count: 2, board_count: 0, item_count: 9, pending_count: 0, files: detail().files,
  }]);
  reply("team_project_channels", () => overview().filter((c) => c.project_id).map((c) => ({ channel_id: c.id, project_id: PROJECT, project_title: "Villa Projesi" })));
  reply("team_create_file", () => FILE);
  reply("team_add_project_channel", (b) => {
    if (b.p_file) { st.fileChat = true; return CH_FILE; }
    st.extra.push(b.p_name);
    return CH_EXTRA;
  });
}

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", setup, opts = {} } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  seed(db, opts);
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
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/${name.split(".")[0].replace(/\W+/g, "_")}.png` }).catch(() => undefined);
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ") + (errors.length ? "\n      sayfa hataları: " + errors.slice(0, 2).join(" | ").slice(0, 400) : "")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/team-chat-hub-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}
const called = (db, name) => db.teamCalls.filter((c) => c.name === name);
/** Üç sohbet: iki ekip kanalı + proje ana kanalı (projeye bağlı satır embed'i taklit edilir). */
const conversations = (db) => {
  db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] });
  db.addTeamChannel(CH_ANN, { name: "duyurular", posting_policy: "admins", members: [[U.bob, "member"]], texts: [[U.bob, "toplantı 15:00"]] });
  db.addTeamChannel(CH_MAIN, { name: "villa-projesi", members: [[U.bob, "member"]], texts: [[U.bob, "plan güncellendi"]] });
  Object.assign(db.teamChannels.find((c) => c.id === CH_MAIN), { mode: "project", project_id: PROJECT, project_main: true, file_id: null });
};
const hubUrl = `${BASE}/messages/local?hub=team&team=${TEAM}`;
const projectUrl = `${hubUrl}&project=${PROJECT}`;

await scenario("1. Mesajlar: ekip TEK satır — yığılmış simge, ikinci satırda kanal adları + proje sayısı, ›; dokununca ekip sayfası açılır", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  const row = page.locator("[data-conversation-row]:visible").first();
  await row.getByText("Atölye Mor").first().waitFor();
  await row.locator("[data-stacked-mark]").waitFor();
  const names = await row.locator("[data-team-names]").innerText();
  assert.ok(/genel/.test(names) && /duyurular/.test(names), "kanal adları listelenir");
  assert.match(names, /1 proje/);
  assert.match(await row.getAttribute("href"), /hub=team&team=/);
  assert.ok(await overflowFree(page));
  await row.click();
  await page.waitForFunction(() => location.search.includes("hub=team"));
  await page.locator('[data-hub="team"]').waitFor();
  await page.locator("[data-hub-title]").getByText("Atölye Mor").waitFor();
  await page.locator('[data-testid="hub-channels"] [data-hub-row="genel"]').waitFor();
  await page.locator('[data-testid="hub-channels"] [data-hub-row="duyurular"]').waitFor();
  await page.locator('[data-testid="hub-projects"] [data-hub-row="Villa Projesi"]').waitFor();
  assert.ok(await overflowFree(page));
}, { setup: conversations });

await scenario("2. Kanal satırı sohbeti açar (çip satırı YOK), geri ekip sayfasına döner; proje kanalında geri proje sayfasına", async ({ page }) => {
  await page.goto(hubUrl);
  await page.locator('[data-hub-row="genel"]').click();
  await page.waitForFunction((id) => location.search.includes(`id=${id}`), CH_GENERAL);
  await page.locator("[data-chat-scroll]").getByText("lansman afişi hazır").waitFor();
  assert.equal(await page.locator("[data-channel-chips]").count(), 0, "çip satırı yok");
  await page.getByRole("button", { name: /Mesaj listesine dön|Back to message list/i }).first().click();
  await page.waitForFunction(() => location.search.includes("hub=team") && !location.search.includes("project="));
  await page.locator('[data-testid="hub-projects"] [data-hub-row="Villa Projesi"]').click();
  await page.locator('[data-hub="project"]').waitFor();
  await page.locator('[data-hub-row="villa-projesi"]').click();
  await page.waitForFunction((id) => location.search.includes(`id=${id}`), CH_MAIN);
  await page.locator("[data-chat-scroll]").getByText("plan güncellendi").waitFor();
  await page.getByRole("button", { name: /Mesaj listesine dön|Back to message list/i }).first().click();
  await page.waitForFunction(() => location.search.includes("hub=team") && location.search.includes("project="));
  await page.locator('[data-hub="project"]').waitFor();
}, { setup: conversations });

await scenario("3. Ekibi sessize al: anahtar team_set_mute(proje yok) yazar; her kanal ve proje 'Sessiz · ekip' etiketi alır; sesi aç etiketi kaldırır", async ({ page, db }) => {
  await page.goto(hubUrl);
  const card = page.locator('[data-mute-card="team"]');
  await card.waitFor();
  assert.equal(await card.getAttribute("data-muted"), "false");
  assert.equal(await page.locator("[data-mute-chip]").count(), 0, "başta hiçbir satır sessiz değil");
  await card.getByRole("switch").click();
  await page.locator('[data-hub-row="genel"] [data-mute-chip="team"]').waitFor();
  await page.locator('[data-hub-row="duyurular"] [data-mute-chip="team"]').waitFor();
  await page.locator('[data-hub-row="Villa Projesi"] [data-mute-chip="team"]').waitFor();
  const set = called(db, "team_set_mute")[0].body;
  assert.equal(set.p_team, TEAM);
  assert.equal(set.p_project, null);
  assert.equal(set.p_muted, true);
  assert.equal(await card.getAttribute("data-muted"), "true");
  assert.equal(await card.getAttribute("data-mute-compact"), "", "sütunda tek satırlık kart (açıklama cümlesi yok)");
  assert.equal(await page.locator('[data-hub-row="genel"] [data-hub-unread]').count(), 0, "sessiz kanalda okunmamış rozeti yok");
  await card.getByRole("switch").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-mute-chip]").length === 0);
  assert.equal(called(db, "team_set_mute")[1].body.p_muted, false);
  assert.ok(await overflowFree(page));
}, { setup: conversations });

await scenario("4. Proje sayfası: ana kanal 'Proje' etiketli, dosya sohbeti yok → 'Sohbeti olmayan dosyalar' + 'Sohbet oluştur' team_add_project_channel(dosya) çağırır", async ({ page, db }) => {
  await page.goto(projectUrl);
  await page.locator('[data-hub="project"]').waitFor();
  await page.locator("[data-hub-title]").getByText("Villa Projesi").waitFor();
  const main = page.locator('[data-hub-row="villa-projesi"]');
  await main.waitFor();
  assert.match(await main.innerText(), /Proje sohbeti/);
  const noChat = page.locator('[data-testid="hub-files-no-chat"]');
  await noChat.getByText("Mutfak").waitFor();
  assert.equal(called(db, "team_add_project_channel").length, 0, "dosya sohbeti kendiliğinden açılmaz");
  await page.locator(`[data-hub-create-file-chat="${FILE}"]`).click();
  await page.locator('[data-hub-row="mutfak"]').waitFor();
  const call = called(db, "team_add_project_channel")[0].body;
  assert.equal(call.p_file, FILE);
  assert.equal(call.p_project, PROJECT);
  assert.match(await page.locator('[data-hub-row="mutfak"]').innerText(), /dosya/i);
  await page.waitForFunction(() => !document.querySelector('[data-testid="hub-files-no-chat"]'));
  assert.ok(await overflowFree(page));
}, { setup: conversations });

await scenario("5. Projeyi sessize al: team_set_mute(proje); projenin kanallarında 'Sessiz · proje', ekip kanalları sessiz değil", async ({ page, db }) => {
  await page.goto(projectUrl);
  const card = page.locator('[data-mute-card="project"]');
  await card.waitFor();
  await card.getByRole("switch").click();
  await page.locator('[data-hub-row="villa-projesi"] [data-mute-chip="project"]').waitFor();
  const set = called(db, "team_set_mute")[0].body;
  assert.equal(set.p_project, PROJECT);
  assert.equal(set.p_muted, true);
  assert.equal(await card.getAttribute("data-muted"), "true");
  await page.goto(hubUrl);
  await page.locator('[data-hub-row="Villa Projesi"] [data-mute-chip="project"]').waitFor();
  assert.equal(await page.locator('[data-hub-row="genel"] [data-mute-chip]').count(), 0, "ekip kanalı etkilenmez");
}, { setup: conversations });

await scenario("6. Ekip sessizken proje kartı bunu söyler: 'ekip de sessizde'; kanallar 'Sessiz · ekip'", async ({ page }) => {
  await page.goto(projectUrl);
  const card = page.locator('[data-mute-card="project"]');
  await card.waitFor();
  await card.getByText(/Ekip de sessizde/).waitFor();
  assert.equal(await card.getAttribute("data-muted"), "false", "projenin kendi ayarı kapalı");
  await page.locator('[data-hub-row="villa-projesi"] [data-mute-chip="team"]').waitFor();
}, { setup: conversations, opts: { mutedTeam: true } });

await scenario("7. Projeye kanal ekle (lider): ad + 'Yalnız liderler' → team_add_project_channel(ad, dosya yok); yeni kanal listede", async ({ page, db }) => {
  await page.goto(projectUrl);
  await page.locator("[data-hub-add-channel]").click();
  const form = page.getByTestId("team-new-project-channel-form");
  await form.waitFor();
  await form.getByRole("button", { name: "Kanalı oluştur" }).click();
  await form.getByText("Kanal adı gerekli.").waitFor();
  assert.equal(called(db, "team_add_project_channel").length, 0, "boş ad sunucuya gitmez");
  await form.getByLabel("Kanal adı").fill("duyurular");
  await form.getByRole("radio", { name: "Yalnız liderler" }).click();
  await form.getByRole("button", { name: "Kanalı oluştur" }).click();
  await page.locator('[data-testid="hub-project-chats"] [data-hub-row="duyurular"]').waitFor();
  const call = called(db, "team_add_project_channel")[0].body;
  assert.equal(call.p_name, "duyurular");
  assert.equal(call.p_posting, "admins");
  assert.equal(call.p_file, null);
}, { setup: conversations });

await scenario("8. Düzenleyici: kanal ekle düğmesi ve sohbeti olmayan dosyalar bölümü yok (yetki yalnız lider)", async ({ page }) => {
  await page.goto(projectUrl);
  await page.locator('[data-hub-row="villa-projesi"]').waitFor();
  assert.equal(await page.locator("[data-hub-add-channel]").count(), 0);
  assert.equal(await page.locator('[data-testid="hub-files-no-chat"]').count(), 0);
  await page.locator("[data-hub-open-project]").waitFor();
}, { setup: conversations, opts: { projectRole: "edit", role: "member" } });

await scenario("9. Kanal bilgisi: ekip sessizken 'bu kanaldan bildirim gelmiyor' bandı + 'Ekibin sesini aç' team_set_mute(false); düzey açıklaması görünür", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-team-header]").click();
  const info = page.locator("[data-team-info]");
  await info.waitFor();
  await info.locator('[data-mute-card="team"][data-muted="true"]').waitFor();
  await info.locator("[data-info-channel-info='genel']").click();
  const sheet = page.locator("[data-channel-info]");
  await sheet.waitFor();
  const banner = sheet.locator('[data-channel-inherited="team"]');
  await banner.waitFor();
  assert.match(await banner.innerText(), /Ekip sessizde olduğu için/);
  assert.match(await sheet.locator("[data-channel-notify-hint]").innerText(), /Yalnız seni andıklarında/);
  await sheet.locator("[data-channel-unmute-parent]").click();
  await page.waitForFunction(() => !document.querySelector('[data-channel-inherited]'));
  const call = called(db, "team_set_mute").pop().body;
  assert.equal(call.p_team, TEAM);
  assert.equal(call.p_project, null);
  assert.equal(call.p_muted, false);
}, { setup: conversations, opts: { mutedTeam: true } });

await scenario("10. Kanal bilgisi: proje sessizken bant 'Projenin sesini aç' (proje kimliğiyle); proje ana kanalı arşivlenemez/silinemez", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_MAIN}`);
  await page.locator("[data-team-header]").click();
  const info = page.locator("[data-team-info]");
  await info.waitFor();
  await info.locator("[data-info-channel-info='villa-projesi']").click();
  const sheet = page.locator("[data-channel-info]");
  await sheet.locator('[data-channel-inherited="project"]').waitFor();
  assert.equal(await sheet.locator("[data-channel-archive]").count(), 0, "ana kanal arşivlenemez");
  assert.equal(await sheet.locator("[data-channel-delete]").count(), 0, "ana kanal silinemez");
  await sheet.locator("[data-channel-unmute-parent]").click();
  await page.waitForFunction(() => !document.querySelector('[data-channel-inherited]'));
  assert.equal(called(db, "team_set_mute").pop().body.p_project, PROJECT);
}, { setup: conversations, opts: { mutedProject: true } });

await scenario("11. Yeni dosya: sohbet sorusu VARSAYILAN KAPALI — kapalıyken kanal açılmaz, açıkken team_add_project_channel(dosya) çağrılır", async ({ page, db }) => {
  const open = async () => {
    await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects&project=${PROJECT}`);
    await page.locator("[data-project-new-file-phone]").click();
    const form = page.getByTestId("team-new-file-form");
    await form.waitFor();
    await form.getByRole("textbox").first().fill("Salon");
    return form;
  };
  let form = await open();
  const sw = form.locator("[data-new-file-chat]").getByRole("switch");
  assert.equal(await sw.getAttribute("aria-checked"), "false", "varsayılan kapalı");
  await form.getByRole("button", { name: "Dosyayı aç" }).click();
  await page.waitForFunction(() => location.search.includes("file="));
  assert.equal(called(db, "team_create_file").length, 1);
  assert.equal(called(db, "team_add_project_channel").length, 0, "sohbet kendiliğinden açılmadı");
  form = await open();
  await form.locator("[data-new-file-chat]").getByRole("switch").click();
  await form.getByRole("button", { name: "Dosyayı aç" }).click();
  await page.waitForFunction(() => location.search.includes("file="));
  const call = called(db, "team_add_project_channel")[0].body;
  assert.equal(call.p_file, FILE);
  assert.equal(call.p_project, PROJECT);
}, { setup: conversations });

await scenario("12. İngilizce: ekip sayfası, sessize alma kartı ve etiketler", async ({ page }) => {
  await page.goto(hubUrl);
  await page.getByRole("heading", { name: "Your channels" }).waitFor();
  await page.getByRole("heading", { name: "Projects" }).waitFor();
  const card = page.locator('[data-mute-card="team"]');
  await card.getByText("Mute this team").waitFor();
  await card.getByRole("switch").click();
  await page.locator('[data-hub-row="genel"] [data-mute-chip="team"]').getByText("Muted · team").waitFor();
}, { lang: "en", setup: conversations });

await scenario("13. Masaüstü (iki bölme): ekip satırı sol sütunu ekibin kanal listesine çevirir, sağda varsayılan kanalın sohbeti açılır; kanal satırı sohbeti değiştirir; geri sohbet listesine döner", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  const aside = page.locator("aside");
  const row = aside.locator("[data-conversation-row]:visible").first();
  await row.getByText("Atölye Mor").first().waitFor();
  await row.click();
  await page.waitForFunction((id) => location.search.includes("hub=team") && location.search.includes(`id=${id}`), CH_GENERAL);
  await aside.locator('[data-hub="team"]').waitFor();
  assert.equal(await aside.locator("[data-conversation-row]").count(), 0, "sohbet listesi sütunun yerinde değil, kanal listesi geçti");
  await page.locator("[data-chat-scroll]").getByText("lansman afişi hazır").waitFor();
  await aside.locator('[data-hub-row="genel"][aria-current="true"]').waitFor();
  assert.equal(await page.getByRole("button", { name: /Mesaj listesine dön|Back to message list/i }).first().isHidden(), true, "sohbet başlığında geri düğmesi yok (liste solda)");
  await aside.locator('[data-hub-row="duyurular"]').click();
  await page.locator("[data-chat-scroll]").getByText("toplantı 15:00").waitFor();
  await aside.locator('[data-hub-row="duyurular"][aria-current="true"]').waitFor();
  assert.equal(await aside.locator('[data-hub="team"]').count(), 1, "kanal değişince sol sütun kanal listesi olarak kalır");
  assert.equal(await page.locator("[data-channel-chips]").count(), 0, "çip satırı yok");
  await aside.locator("[data-hub-back]").click();
  await aside.locator("[data-conversation-row]").first().waitFor();
  assert.equal(await aside.locator('[data-hub="team"]').count(), 0);
}, { viewport: { width: 1280, height: 900 }, setup: conversations });

await scenario("14. Masaüstü: proje satırı sol sütunu PROJE listesine çevirir, sohbet değişmez; üst düzeye dönüş ekip listesine, sağdaki sohbet korunur", async ({ page }) => {
  await page.goto(`${hubUrl}&id=${CH_GENERAL}`);
  const aside = page.locator("aside");
  await aside.locator('[data-hub="team"]').waitFor();
  await page.locator("[data-chat-scroll]").getByText("lansman afişi hazır").waitFor();
  await aside.locator('[data-hub-row="Villa Projesi"]').click();
  await aside.locator('[data-hub="project"]').waitFor();
  await page.locator("[data-chat-scroll]").getByText("lansman afişi hazır").waitFor();
  await aside.locator('[data-hub-row="villa-projesi"]').click();
  await page.locator("[data-chat-scroll]").getByText("plan güncellendi").waitFor();
  await aside.locator('[data-hub-row="villa-projesi"][aria-current="true"]').waitFor();
  await aside.locator("[data-hub-back]").click();
  await aside.locator('[data-hub="team"]').waitFor();
  await page.locator("[data-chat-scroll]").getByText("plan güncellendi").waitFor();
}, { viewport: { width: 1280, height: 900 }, setup: conversations });

await scenario("15. Kanal bağlantısıyla (?id=) açılan ekip kanalında sol sütun yine ekibin listesidir; proje kanalında projenin listesi", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_ANN}`);
  const aside = page.locator("aside");
  await aside.locator('[data-hub="team"]').waitFor();
  await aside.locator('[data-hub-row="duyurular"][aria-current="true"]').waitFor();
  await page.goto(`${BASE}/messages/local?id=${CH_MAIN}`);
  await aside.locator('[data-hub="project"]').waitFor();
}, { viewport: { width: 1280, height: 900 }, setup: conversations });

const rowSel = (page, name) => page.locator(`[data-hub-row="${name}"]`);
const startSelecting = async (page) => {
  await page.locator("[data-conversations-more]").click();
  await page.locator("[data-conversations-select]").click();
  await page.locator("[data-selection-header]").waitFor();
};

await scenario("16. Seçim modu (telefon): ⋮ → Kanal seç; üstte 'N kanal seçildi', satırlarda daire, altta Sabitle · Okundu · Sessize al · Sil; ✓ seçimi bitirir", async ({ page }) => {
  await page.goto(hubUrl);
  await rowSel(page, "genel").waitFor();
  assert.equal(await page.locator("[data-selection-bar]").count(), 0);
  await startSelecting(page);
  assert.match(await page.locator("[data-selection-header]").innerText(), /Kanal seç/);
  await rowSel(page, "duyurular").click();
  assert.match(await page.locator("[data-selection-header]").innerText(), /1 kanal seçildi/);
  await rowSel(page, "Villa Projesi").click();
  assert.match(await page.locator("[data-selection-header]").innerText(), /2 öğe seçildi/, "kanal + proje karışıksa 'öğe'");
  const bar = page.locator("[data-selection-bar]");
  await bar.locator("[data-selection-pin]").waitFor();
  await bar.locator("[data-selection-read]").waitFor();
  await bar.locator("[data-selection-mute]").waitFor();
  assert.equal(await bar.locator("[data-selection-delete]").isDisabled(), true, "proje seçiliyken Sil kapalı");
  assert.equal(await bar.locator("[data-selection-archive]").count(), 0, "Arşivle yok");
  await rowSel(page, "Villa Projesi").click();
  assert.equal(await bar.locator("[data-selection-delete]").isDisabled(), false, "yalnız kanal seçiliyken Sil açık (yönetici)");
  await rowSel(page, "genel").click();
  assert.equal(await bar.locator("[data-selection-delete]").isDisabled(), true, "varsayılan kanal silinemez");
  await page.locator("[data-selection-header] button").first().click();
  await page.locator("[data-selection-bar]").waitFor({ state: "detached" });
  assert.ok(await overflowFree(page));
}, { setup: conversations });

await scenario("17. Seçim modu: Sessize al kanalın bildirimini 'none' yapar; proje satırı team_set_mute(proje) çağırır; sesi aç geri alır", async ({ page, db }) => {
  await page.goto(hubUrl);
  await rowSel(page, "genel").waitFor();
  await startSelecting(page);
  await rowSel(page, "duyurular").click();
  await page.locator("[data-selection-mute]").click();
  await page.waitForFunction(() => !document.querySelector("[data-selection-bar]"));
  const notify = called(db, "team_set_channel_notify")[0].body;
  assert.equal(notify.p_channel, CH_ANN);
  assert.equal(notify.p_level, "none");
  await startSelecting(page);
  await rowSel(page, "Villa Projesi").click();
  await page.locator("[data-selection-mute]").click();
  await page.waitForFunction(() => !document.querySelector("[data-selection-bar]"));
  const set = called(db, "team_set_mute").at(-1).body;
  assert.equal(set.p_project, PROJECT);
  assert.equal(set.p_muted, true);
}, { setup: conversations });

await scenario("18. Seçim modu: Okundu imleci ilerletir ve rozet kalkar; Tümü okundu menüden; Sabitle satıra raptiye koyar ve başa alır", async ({ page, db }) => {
  await page.goto(hubUrl);
  await page.locator('[data-hub-row="genel"] [data-hub-unread]').waitFor();
  await startSelecting(page);
  await rowSel(page, "genel").click();
  await page.locator("[data-selection-read]").click();
  await page.waitForFunction(() => !document.querySelector("[data-selection-bar]"));
  assert.ok(db.readCalls.some((c) => c.conversation_id === CH_GENERAL), "okundu imleci genel için ilerledi");
  await rowSel(page, "duyurular").waitFor();
  await startSelecting(page);
  await rowSel(page, "duyurular").click();
  await page.locator("[data-selection-pin]").click();
  await page.waitForFunction(() => !document.querySelector("[data-selection-bar]"));
  await page.locator('[data-hub-row="duyurular"] [data-hub-pinned]').waitFor();
  const first = await page.locator('[data-testid="hub-channels"] [data-hub-row]').first().getAttribute("data-hub-row");
  assert.equal(first, "duyurular", "sabitlenen kanal listenin başına çıkar");
}, { setup: conversations });

await scenario("19. Seçim modu: Sil onay penceresi → team_delete_channel; yetkisiz üyede Sil düğmesi hiç çizilmez; arama ve süzgeç satırları daraltır", async ({ page, db }) => {
  await page.goto(hubUrl);
  await rowSel(page, "duyurular").waitFor();
  await page.locator("[data-list-search]").click();
  await page.locator("[data-hub-search]").fill("duyu");
  await rowSel(page, "genel").waitFor({ state: "detached" });
  await rowSel(page, "duyurular").waitFor();
  await page.locator("[data-list-search]").click();
  await startSelecting(page);
  await rowSel(page, "duyurular").click();
  await page.locator("[data-selection-delete]").click();
  await page.locator("[data-hub-delete-confirm]").click();
  await page.waitForFunction(() => !document.querySelector("[data-selection-bar]"));
  assert.equal(called(db, "team_delete_channel")[0].body.p_channel, CH_ANN);
}, { setup: conversations });

await scenario("20. Üye (yönetici değil): seçim çubuğunda Sil yok, '+' yok", async ({ page }) => {
  await page.goto(hubUrl);
  await rowSel(page, "genel").waitFor();
  assert.equal(await page.locator("[data-hub-add-channel]").count(), 0);
  await startSelecting(page);
  await rowSel(page, "duyurular").click();
  await page.locator("[data-selection-pin]").waitFor();
  assert.equal(await page.locator("[data-selection-delete]").count(), 0);
}, { setup: conversations, opts: { role: "member" } });

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
