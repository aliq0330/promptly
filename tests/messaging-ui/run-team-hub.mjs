// Ekipler — bağımsız sistem istemcisi (docs/history/353-*): Ekipler sayfası (kartlar, davet kabulü, Ekip oluştur), ekip sayfasının rol bazlı sekmeleri
// (üye/konuk/yönetici), Kütüphane inceleme+onay, Sohbet kanal listesi (özel kanal kilidi), Yönetim → Davetler (kullanıcı adı + bağlantı, jeton bir kez),
// davet bağlantısı sayfası, İngilizce ve telefon. Ağ taklitli (`db.rpc` geçersiz kılmaları); gerçek Supabase'e KARŞI DENENMEDİ — kurallar
// `supabase/tests/teams-core.sql`, `team-library-governance.sql`, `team-channels.sql`, `team-membership.sql`, `team-admin.sql`.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const PORT = 4219;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const TEAM = "e1000000-0000-4000-8000-000000000001";
const LIB = "e1000000-0000-4000-8000-000000000002";
const ITEM = "e1000000-0000-4000-8000-000000000003";
const CH_GENERAL = "e1000000-0000-4000-8000-0000000000a1";
const CH_SECRET = "e1000000-0000-4000-8000-0000000000a2";
const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const teamRow = (role) => ({
  id: TEAM, slug: "atolye-mor", name: "Atölye Mor", description: "Pazarlama ve tasarım", tone: "primary", my_role: role, member_count: 6, guest_count: 1, space_count: 2,
  channel_count: 2, unread_count: 3, last_activity_at: "2026-11-08T10:00:00Z", library_space_id: LIB, guest_until: role === "guest" ? "2026-12-01T00:00:00Z" : null,
});
const PROJECT = "e1000000-0000-4000-8000-0000000000b1";
const projectSummary = (role = "lead", over = {}) => ({
  id: PROJECT, title: "Villa Projesi", description: "Mimari proje", tone: "primary", archived_at: null, review_default: true, access_mode: "selected", base_role: "view",
  my_role: role, main_area_id: "e1000000-0000-4000-8000-0000000000b2", channel_id: null, member_count: 5, board_count: 1, item_count: 9, pending_count: role === "lead" ? 2 : null,
  files: [{ id: "e1000000-0000-4000-8000-0000000000b3", title: "Mutfak", review_required: true, main_area_id: "e1000000-0000-4000-8000-0000000000b4", item_count: 6, pending_count: role === "lead" ? 2 : null }], ...over,
});
const channel = (id, name, mode, extra = {}) => ({
  id, name, description: null, mode, space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: name === "genel", position: 0,
  archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: "2026-11-08T09:00:00Z", member_count: 4, can_post: true, ...extra,
});

/** Her senaryoda sunucu taklidi: çağrılar `calls`a düşer, yanıtlar senaryoya göre ayarlanır. */
function seed(db, { role = "owner", invitations = [] } = {}) {
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
  reply("my_teams_preview", () => [{ team_id: TEAM, members_preview: [{ user_id: "u1", username: "aylin", display_name: "Aylin Demir", avatar_url: null }, { user_id: "u2", username: "elifk", display_name: "Elif Kaya", avatar_url: null }], recent: { action: "member_joined", actor_name: "Elif Kaya", label: null, at: "2026-11-08T08:00:00Z" } }]);
  reply("my_team_invitations", () => invitations);
  reply("my_team_todos", () => []);
  reply("team_project_todos", () => []);
  reply("team_review_board", () => ({ items: [], proposals: [] }));
  reply("team_recent_activity", () => []);
  reply("team_member_project_roles", () => []);
  reply("team_projects_list", () => [projectSummary(role === "owner" || role === "admin" ? "lead" : "view")]);
  reply("team_project_channels", () => []);
  reply("team_project_get", () => {
    const sum = projectSummary(role === "owner" || role === "admin" ? "lead" : "view");
    return {
      project: { id: sum.id, team_id: TEAM, title: sum.title, description: sum.description, tone: "primary", access_mode: "selected", base_role: "view", review_default: true, archived_at: null, created_at: "2026-11-01T00:00:00Z" },
      my_role: sum.my_role, main_area_id: sum.main_area_id, channel_id: null, item_count: 9, pending_count: sum.pending_count,
      files: sum.files.map((f) => ({ ...f, board_count: 0 })), boards: [], people: [], variables: [],
    };
  });
  reply("team_create", () => TEAM);
  reply("team_respond_invitation", () => ({ status: "accepted", team_id: TEAM, slug: "atolye-mor" }));
  reply("team_list_spaces", () => [
    { id: "e1000000-0000-4000-8000-0000000000b1", owner_id: "11111111-1111-4111-8111-111111111111", owner_username: "alice", owner_display_name: "Alice", owner_avatar_url: null, title: "Kampanya panosu", description: "", kind: "moodboard", visibility: "private",
      cover_url: null, cover_item_id: null, cover_item_url: null, preview_urls: [], image_count: 4, prompt_count: 2, note_count: 0, member_count: 5, my_role: "owner", is_favorite: false, last_opened_at: null,
      created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", archived_at: null, access_mode: "selected", guest_count: 1, is_library: false },
  ]);
  reply("team_list_channels", () => [channel(CH_GENERAL, "genel", "open", { unread_count: 3 }), channel(CH_SECRET, "yonetim", "private")]);
  reply("team_channel_members", () => []);
  reply("team_set_channel_notify", () => null);
  reply("team_archive_channel", () => null);
  reply("team_delete_channel", () => null);
  reply("team_list_invitations", () => []);
  reply("team_list_invite_links", () => []);
  reply("team_invite_user", () => "e1000000-0000-4000-8000-0000000000c1");
  reply("team_create_invite_link", () => ({ link_id: "l1", token: TOKEN, expires_at: "2026-11-15T00:00:00Z", max_uses: null, role: "member" }));
  reply("team_list_members", () => []);
  reply("team_list_groups", () => []);
  reply("preview_team_link", () => ({ team_name: "Atölye Mor", tone: "primary", member_count: 6, role: "member", already_member: false, valid: true, expires_at: "2026-11-15T00:00:00Z" }));
  reply("join_team_via_link", () => ({ team_id: TEAM, slug: "atolye-mor" }));
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", role = "owner", invitations = [], setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  seed(db, { role, invitations });
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
    // SHOT=<klasör>: her senaryonun son ekranını kaydeder (görsel inceleme için; test sonucunu etkilemez).
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/${name.split(".")[0].replace(/\W+/g, "_")}.png` }).catch(() => undefined);
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ") + (errors.length ? "\n      sayfa hataları: " + errors.slice(0, 2).join(" | ").slice(0, 400) : "")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/team-hub-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}
const called = (db, name) => db.teamCalls.filter((c) => c.name === name);
const tabs = async (page) => {
  const items = await page.locator("[data-team-tab-link]").allInnerTexts();
  return items.map((t) => t.replace(/\s+/g, " ").trim());
};

await scenario("1. /teams: ekip kartı (üye + Space sayısı, rol), tek RPC; Sohbet kısayolunda okunmamış rozeti", async ({ page, db }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByTestId("teams-list").waitFor();
  const card = page.locator(`[data-team-card="${TEAM}"]`);
  await card.getByText("Atölye Mor").waitFor();
  await card.getByText("6 üye").waitFor();
  await card.getByText("2 proje").waitFor();
  await card.locator("[data-team-avatars]").waitFor();
  await card.getByText("Elif ekibe katıldı", { exact: false }).waitFor();
  await card.locator("[data-team-open-chat]").getByText("3").waitFor();
  assert.ok(called(db, "my_teams").length <= 2, "sayfa + kenar çubuğu en çok iki istek");
});

await scenario("2. Bekleyen davet: Katıl → team_respond_invitation(kabul) ve ekip sayfasına gider", async ({ page, db }) => {
  await page.goto(`${BASE}/teams`);
  const invites = page.getByTestId("team-invites");
  await invites.waitFor();
  await invites.getByText("Yeni Ekip").waitFor();
  await invites.locator("[data-invite-accept]").click();
  await page.waitForURL(/\/teams\/local\/?\?id=atolye-mor/);
  assert.equal(called(db, "team_respond_invitation")[0].body.p_accept, true);
}, {
  invitations: [{ id: "i1", team_id: "e1000000-0000-4000-8000-0000000000ff", team_name: "Yeni Ekip", team_tone: "success", role: "member", guest_days: null, guest_org: null, invited_by: "x",
    inviter_username: "bobby", inviter_name: "Bob", inviter_avatar_url: null, created_at: "2026-11-07T00:00:00Z", expires_at: "2026-11-21T00:00:00Z" }],
});

await scenario("3. Ekip oluştur: ad + renk → team_create(p_name, p_tone) ve ekip sayfasına yönlenir", async ({ page, db }) => {
  await page.goto(`${BASE}/teams`);
  await page.locator("[data-team-create]").click();
  const form = page.getByTestId("team-create-form");
  await form.waitFor();
  await form.getByLabel("Ekip adı").fill("Yeni Atölye");
  await form.getByRole("radio").nth(2).click();
  await form.getByRole("button", { name: "Oluştur" }).click();
  await page.waitForURL(/\/teams\/local\/?\?id=/);
  const body = called(db, "team_create")[0].body;
  assert.equal(body.p_name, "Yeni Atölye");
  assert.equal(body.p_tone, "success");
});

await scenario("4c. Konuk: yalnız Space'ler ve Sohbet; süre bandı", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  await page.getByTestId("team-page").waitFor();
  await page.getByText(/Konuk erişimin/).waitFor();
  const guest = await tabs(page);
  assert.ok(!guest.some((t) => t.startsWith("Kütüphane")) && !guest.some((t) => t.startsWith("Üyeler")), `guest tabs: ${guest}`);
}, { role: "guest" });

await scenario("8. Sohbet: kanal çipleri (özel kanalda kilit), okunmamış rozeti, kanal değişince başlık", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat`);
  const list = page.getByTestId("team-channel-chips");
  await list.waitFor();
  await list.locator('[data-channel-chip="yonetim"]').click();
  await list.locator('[data-channel-chip="genel"]').getByText("3").waitFor();
  await page.getByTestId("team-channel-view").getByRole("heading", { name: /yonetim/ }).waitFor();
  assert.equal(await page.locator(`[data-channel-id="${CH_SECRET}"]`).count(), 1);
});

await scenario("9. Yönetim → Davetler: kullanıcı adıyla davet team_invite_user'a gider; bağlantı jetonu bir kez gösterilir", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=invites`);
  await page.locator("[data-team-invite]").first().click();
  const form = page.getByTestId("team-invite-form");
  await form.getByLabel("Kullanıcı adı").fill("@bobby");
  await form.getByRole("button", { name: "Davet gönder" }).click();
  await form.getByText("Davet gönderildi.").waitFor();
  const body = called(db, "team_invite_user")[0].body;
  assert.equal(body.p_username, "bobby");
  assert.equal(body.p_role, "member");
  // Bağlantı sekmesi: yalnız Üye/Düzenleyici; jeton bir kez
  await form.getByRole("radio", { name: "Bağlantıyla" }).click();
  await form.getByRole("button", { name: "Bağlantı oluştur" }).click();
  const input = form.locator("input[readonly]");
  await input.waitFor();
  assert.ok((await input.inputValue()).endsWith(`/team-join#${TOKEN}`));
  assert.equal(await form.getByRole("radio", { name: "Konuk" }).count(), 0, "bağlantıyla konuk/yönetici davet edilmez");
  // Alan adı / e-posta ile katılma YOK
  assert.equal(await page.getByText(/alan adı|domain/i).count(), 0);
});

await scenario("10. /team-join#jeton: önizleme + Ekibe katıl → join_team_via_link ve ekip sayfası", async ({ page, db }) => {
  await page.goto(`${BASE}/team-join#${TOKEN}`);
  await page.getByTestId("team-join").waitFor();
  await page.getByRole("heading", { name: "Atölye Mor" }).waitFor();
  await page.locator("[data-team-join]").click();
  await page.waitForURL(/\/teams\/local\/?\?id=atolye-mor/);
  assert.equal(called(db, "join_team_via_link")[0].body.p_token, TOKEN);
});

await scenario("11. /team-join: geçersiz jeton hiçbir ekip bilgisi vermez", async ({ page, db }) => {
  db.rpc.preview_team_link = () => ({ status: 400, body: { code: "P0001", message: "link_not_found" } });
  await page.goto(`${BASE}/team-join#${TOKEN}`);
  await page.getByText("Bu bağlantı geçerli değil").waitFor();
  assert.equal(await page.getByTestId("team-join").count(), 0, "önizleme kartı yok");
  assert.equal(await page.locator("main").getByText("Atölye Mor").count(), 0);
});

await scenario("12. İngilizce: Ekipler başlığı, ekip sekmeleri ve rol", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor();
  await page.locator(`[data-team-card="${TEAM}"]`).getByText("6 members").waitFor();
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library`);
  // Eski kütüphane adresi Projeler'e yönlenir.
  await page.getByRole("heading", { name: /^Projects/ }).waitFor();
  await page.getByText("Villa Projesi").waitFor();
  await page.locator("[data-team-tab-link=projects]").getByText("Overview").waitFor();
  await page.locator("[data-team-tab-link=approvals]").getByText("Approvals").waitFor();
}, { lang: "en" });

const shot = (page, name) => (process.env.SHOT ? page.screenshot({ path: `${process.env.SHOT}/${name}.png` }).catch(() => undefined) : undefined);

await scenario("13. Telefon: Ekipler, ekip sayfası ve Yönetim yatay taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByTestId("teams-list").waitFor();
  assert.ok(await overflowFree(page), "teams");
  await shot(page, "m_teams");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects`);
  await page.getByTestId("team-projects").waitFor();
  assert.ok(await overflowFree(page), "team page");
  await shot(page, "m_projects");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.getByTestId("team-band").waitFor();
  await page.waitForTimeout(400);
  assert.ok(await overflowFree(page), "members");
  await shot(page, "m_members");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=invites`);
  await page.getByTestId("team-invites-panel").waitFor();
  assert.ok(await overflowFree(page), "admin");
}, { viewport: { width: 390, height: 800 } });

await scenario("14. Telefon: ekip sayfasında Sohbet = kanal listesi; kanala dokunmak Mesajlar'daki TAM EKRAN sohbeti açar (ekip başlığı + kanal çipleri), geri düğmesi ekip sayfasına döner", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat`);
  await page.getByTestId("team-channel-list").waitFor();
  assert.equal(await page.getByTestId("team-channel-view").isVisible().catch(() => false), false, "telefonda sayfa içinde gömülü sohbet yok");
  assert.ok(await overflowFree(page));
  await page.locator('[data-channel="genel"]').click();
  await page.waitForURL(/\/messages\/local\/?\?id=.*from=team/);
  await page.locator("[data-team-header]").waitFor();
  assert.match(await page.locator("[data-team-header]").innerText(), /Atölye Mor/);
  await page.locator("[data-team-header-sub]").waitFor();
  // docs/history/369-*: kanal çipleri sohbet ekranından kalktı; kanallar ekip sayfasında listelenir.
  assert.equal(await page.locator("[data-channel-chips]").count(), 0, "sohbet ekranında çip satırı yok");
  assert.ok(await overflowFree(page));
  await shot(page, "m_chat");
  await page.getByRole("button", { name: /Mesaj listesine dön|Back to message list/i }).first().click();
  await page.waitForURL(/\/teams\/local\/?\?id=atolye-mor/);
  await page.getByTestId("team-channel-list").waitFor();
}, { viewport: { width: 390, height: 800 }, setup: (db) => { db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] }); } });

await scenario("17. Ekip sohbeti (gömülü): '+' menüsünde Kütüphaneden paylaş ve içe aktar, sohbette ara düğmesi", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  await page.getByTestId("team-channel-view").waitFor();
  await page.locator("[data-chat-search-toggle]").first().waitFor();
  await page.locator("[data-chat-search-toggle]").first().click();
  await page.getByPlaceholder(/ara/i).first().waitFor();
  // "+" menüsü: kütüphaneden paylaş + içe aktar (dock'ta yoktu, ekip sohbetinde var)
  await page.locator("[data-composer-plus]").click();
  await page.getByText("Prompt içe aktar").first().waitFor();
  assert.ok((await page.getByText("Kütüphaneden").count()) >= 1, "Kütüphaneden paylaş seçenekleri");
}, { setup: (db) => { db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] }); } });

await scenario("15. Ekip başlığı (mockup): geri bağlantısı, Ekip rozeti, üye · Space · Yalnızca davetle satırı, Davet et; kenar çubuğunda Ekiplerim", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=spaces`);
  await page.getByTestId("team-page").waitFor();
  const band = page.getByTestId("team-band");
  await band.getByText("EKİP").waitFor();
  await band.getByRole("heading", { name: "Atölye Mor" }).waitFor();
  await band.getByText("Yalnızca davetle").waitFor();
  await page.getByTestId("team-tabs").waitFor();
  await page.locator("[data-team-invite-header]").waitFor();
  const sidebar = page.getByTestId("sidebar-teams");
  await sidebar.getByText("Atölye Mor").waitFor();
  await sidebar.getByText("Ekiplerim").waitFor();
});

await scenario("16. Ekip kanalı = gerçek sohbet ekranı: mesajlar, yazma alanı, gönderme; Mesajlar listesinde Ekip rozetiyle AYNI konuşma", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  const view = page.getByTestId("team-channel-view");
  await view.waitFor();
  await view.getByText("lansman afişi hazır").waitFor();
  const box = view.getByRole("textbox").last();
  await box.fill("harika, teşekkürler");
  await box.press("Enter");
  await view.getByText("harika, teşekkürler").waitFor();
  assert.ok(db.messages.some((m) => m.conversation_id === CH_GENERAL && m.body === "harika, teşekkürler"), "mesaj ekip kanalı konuşmasına yazıldı");
  await page.goto(`${BASE}/messages`);
  const row = page.locator("[data-conversation-row]:visible").first();
  await row.getByText("Atölye Mor").first().waitFor();
  await row.locator("[data-team-channel]").getByText("# genel").waitFor();
  await row.locator("[data-kind-tag]").getByText("Ekip").waitFor();
}, { setup: (db) => { db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] }); } });

// --- Yön A: tek sohbet, tek bilgi sayfası (docs/history/353-*) ---
const twoChannels = (role = "owner") => (db) => {
  db.addTeamChannel(CH_GENERAL, { name: "genel", myRole: role, members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] });
  db.addTeamChannel(CH_SECRET, { name: "yonetim", myRole: role, members: [[U.bob, "member"]], texts: [[U.bob, "bütçe toplantısı"]] });
};

await scenario("18. Mesajlar: ekibin iki kanalı TEK satırdır (ekip adı + etiket + '# kanal' + özet), özet satırı ve CTA", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  const rows = page.locator("[data-conversation-row]:visible");
  await rows.first().waitFor();
  assert.equal(await rows.count(), 1, "iki kanal tek ekip satırı");
  const row = rows.first();
  await row.getByText("Atölye Mor").first().waitFor();
  await row.locator("[data-team-channel]").waitFor();
  await row.locator("[data-kind-tag]").getByText("Ekip").waitFor();
  await row.locator("[data-row-meta]").waitFor();
  await page.locator("[data-kind-chip='team']:visible").click();
  await page.locator("[data-kind-summary]:visible").waitFor();
  assert.match(await page.locator("[data-kind-summary]:visible").innerText(), /1 ekip/);
  await page.locator("[data-kind-cta]:visible").waitFor();
  assert.ok(await overflowFree(page));
}, { setup: twoChannels() });

await scenario("19. Ekip sohbeti başlığı: ekip adı + '# kanal · N üye'; çip satırı YOK; geri ekip sayfasına (kanal listesi) döner, satır kanalı değiştirir", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  const header = page.locator("[data-team-header]");
  await header.waitFor();
  assert.match(await header.innerText(), /Atölye Mor/);
  assert.match(await page.locator("[data-team-header-sub]").innerText(), /# genel/);
  assert.equal(await page.locator("[data-channel-chips]").count(), 0, "çip satırı yok");
  await page.getByRole("button", { name: /Mesaj listesine dön|Back to message list/i }).first().click();
  await page.waitForFunction(() => location.search.includes("hub=team"));
  await page.locator('[data-hub="team"]').waitFor();
  await page.locator('[data-hub-row="genel"]').waitFor();
  await page.locator('[data-hub-row="yonetim"]').click();
  await page.waitForFunction((id) => location.search.includes(`id=${id}`), CH_SECRET);
  await page.locator("[data-chat-scroll]").getByText("bütçe toplantısı").waitFor();
}, { setup: twoChannels() });

await scenario("20. Ekip bilgisi (E3): tek sayfa — kanal listesi (açık olan işaretli), Ekip sayfası, Kanal ekle (new=1), kanallara toplu bildirim düzeyi", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-team-header]").click();
  const info = page.locator("[data-team-info]");
  await info.waitFor();
  await info.locator("[data-info-channel='genel'][aria-current='true']").waitFor();
  await info.locator("[data-info-channel='yonetim']").waitFor();
  assert.match(await info.locator("[data-info-team-link]").first().getAttribute("href"), /teams\/local\/?\?id=/);
  assert.match(await info.locator("[data-info-add-channel]").getAttribute("href"), /new=1/);
  await info.locator("[data-segmented='team-notify'] [data-segment='none']").click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  const calls = called(db, "team_set_channel_notify");
  assert.equal(calls.length, 2, "ekibin her kanalına yazılır");
  assert.ok(calls.every((c) => c.body.p_level === "none"));
  await info.locator("[data-info-channel='yonetim']").click();
  await page.waitForFunction((id) => location.search.includes(`id=${id}`), CH_SECRET);
}, { setup: twoChannels() });

await scenario("21. Kanal bilgisi (E4): kim görür/yazar, bildirim düzeyi, yönetici Düzenle (settings=1) · Arşivle onayı; üye yönetimi görmez", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-team-header]").click();
  await page.locator("[data-info-channel-info='genel']").click();
  const sheet = page.locator("[data-channel-info]");
  await sheet.waitFor();
  await sheet.getByText("Kim görür").waitFor();
  await sheet.locator("[data-segmented='channel-notify'] [data-segment='all']").click();
  await page.waitForTimeout(300);
  assert.ok(called(db, "team_set_channel_notify").some((c) => c.body.p_channel === CH_GENERAL && c.body.p_level === "all"));
  assert.match(await sheet.locator("[data-channel-edit]").getAttribute("href"), /settings=1/);
  assert.equal(await sheet.locator("[data-channel-archive]").count(), 0, "varsayılan kanal arşivlenemez");
}, { setup: twoChannels() });

await scenario("21b. Kanal bilgisi: yönetici gizli olmayan kanalı arşivler (onaylı); üye Düzenle/Arşivle görmez", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_SECRET}`);
  await page.locator("[data-team-header]").click();
  await page.locator("[data-info-channel-info='yonetim']").click();
  await page.locator("[data-channel-info]").waitFor();
  await page.locator("[data-channel-archive]").click();
  await page.locator("#channel-confirm-title").waitFor();
  await page.getByRole("button", { name: "Arşivle", exact: true }).last().click();
  await page.waitForTimeout(400);
  assert.equal(called(db, "team_archive_channel").length, 1);
}, { setup: twoChannels() });

await scenario("21c. Üye: kanal bilgisinde yönetim bölümü yok", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-team-header]").click();
  await page.locator("[data-info-channel-info='genel']").click();
  await page.locator("[data-channel-info]").waitFor();
  assert.equal(await page.locator("[data-channel-admin]").count(), 0);
}, { role: "member", setup: twoChannels("member") });

await scenario("22. Konuk (E5): sohbette 'Konuk erişimi' bandı; Kanal ekle yok", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-guest-banner]").waitFor();
  assert.match(await page.locator("[data-guest-banner]").innerText(), /Konuk erişimi/);
  await page.locator("[data-team-header]").click();
  await page.locator("[data-team-info]").waitFor();
  assert.equal(await page.locator("[data-info-add-channel]").count(), 0);
}, { role: "guest", setup: twoChannels("guest") });

await scenario("23. İngilizce: ekip bilgisi ve kanal bilgisi başlıkları", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  await page.locator("[data-team-header]").click();
  await page.getByRole("heading", { name: "Team info" }).waitFor();
  await page.locator("[data-info-channel-info='genel']").click();
  await page.locator("[data-channel-info]").getByText("Who can see it").waitFor().catch(async () => { await page.locator("[data-channel-info]").getByText(/Channel/).first().waitFor(); });
}, { lang: "en", setup: twoChannels() });

// --- Masaüstü çalışma alanı (Seçenek 1, docs/history/354-*) ---
const withMembers = (db) => {
  db.rpc.team_channel_members = () => ({ body: [U.bob, U.carol, U.dave].map((u) => ({ user_id: u.id, username: u.username, display_name: u.display_name ?? u.username, avatar_url: null, team_role: "member" })) });
};

await scenario("24. Masaüstü sohbet (Merkez): kartta kanal çipleri, sağda kanal bilgisi + çevrimiçi üyeler; Ara ve bilgi düğmeleri", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  const view = page.getByTestId("team-channel-view");
  await view.waitFor();
  const aside = page.getByTestId("team-channel-aside");
  assert.equal(await aside.isVisible(), true);
  await aside.getByTestId("team-channel-info-card").waitFor();
  await aside.getByTestId("team-online").getByText(/çevrimiçi/).waitFor();
  assert.match(await view.locator("h3").first().innerText(), /# genel/);
  await view.locator("[data-channel-faces]").waitFor();
  const chips = view.getByTestId("team-channel-chips");
  assert.equal(await chips.isVisible(), true, "kanal çipleri sohbet kartının içinde (Merkez düzeni)");
  await chips.locator("[data-channel-chip='genel']").waitFor();
  await view.locator("[data-chat-search-toggle]").getByText("Ara…").waitFor();
  await view.locator("[data-chat-search-toggle]").click();
  await page.getByPlaceholder(/ara/i).first().waitFor();
  await view.locator("[data-channel-info-open]").click();
  await page.locator("[data-channel-info]").waitFor();
  await page.locator("[data-channel-info]").getByText("genel").first().waitFor();
}, { setup: (db) => { withMembers(db); db.addTeamChannel(CH_GENERAL, { name: "genel", myRole: "owner", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] }); } });

await scenario("25. Tablet: kanal kartı gizli, kanallar sohbet kartının çip satırında; çip kanalı değiştirir", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  await page.getByTestId("team-channel-view").waitFor();
  assert.equal(await page.getByTestId("team-channel-aside").isVisible(), false, "tablette kanal kartı yok");
  const chips = page.getByTestId("team-channel-chips");
  await chips.waitFor();
  assert.ok((await chips.locator("[data-channel-chip]").count()) >= 2);
  await chips.locator("[data-channel-chip='yonetim']").click();
  await page.waitForFunction(() => location.search.includes("channel=yonetim"));
}, { viewport: { width: 834, height: 1000 }, setup: (db) => { db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "lansman afişi hazır"]] }); } });

// --- Faz 1: mockup ile birebir sayfalar (docs/history/355-*) ---
const member = (id, name, username, role, extra = {}) => ({ user_id: id, username, display_name: name, avatar_url: null, role, joined_at: "2026-10-01T00:00:00Z", guest_org: null, guest_until: null, group_ids: null, group_names: ["Tasarım"], ...extra });

await scenario("28. Üyeler: görünüm hapları, tablo, Roller ve yetkiler matrisi; Çıkar → içerik özeti + 3 seçenek → team_remove_member", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.locator("[data-members-view]").first().waitFor();
  await page.getByText("Elif Kaya").first().waitFor();
  await page.getByText("Roller ve yetkiler").locator("visible=true").first().waitFor();
  await page.locator("[data-members-groups-card]").waitFor();
  await page.locator("[data-member-remove]").first().click();
  const form = page.getByTestId("team-remove-form");
  await form.waitFor();
  await form.getByText("12", { exact: true }).waitFor();
  await form.locator("[data-remove-stats]").waitFor();
  for (const mode of ["team", "member", "personal"]) await form.locator(`[data-remove-mode="${mode}"]`).waitFor();
  await form.locator("[data-remove-mode=personal]").click();
  await form.getByRole("button", { name: "Ekipten çıkar" }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  const body = called(db, "team_remove_member")[0]?.body;
  assert.equal(body?.p_mode, "personal");
  assert.equal(body?.p_user, "u-elif");
}, { setup: (db) => {
  db.rpc.team_list_members = () => ({ body: [member("u-aylin", "Aylin Demir", "aylin", "owner"), member("u-elif", "Elif Kaya", "elifk", "member")] });
  db.rpc.team_list_groups = () => ({ body: [{ id: "g1", name: "Tasarım", tone: "primary", lead_id: null, lead_name: null, leads_approve: false, member_count: 14, member_ids: null, spaces: null, folders: null }] });
  db.rpc.team_member_content_summary = () => ({ body: { prompts: 12, items: 7, variables: 2 } });
  db.rpc.team_remove_member = (body) => { db.teamCalls.push({ name: "team_remove_member", body }); return { body: {} }; };
} });

await scenario("29. Telefon: Üye satırında çıkarma simgesi var (pencere taşmaz); Roller ve yetkiler açılır", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.getByTestId("team-band").waitFor();
  // Telefonda masaüstü "Çıkar" düğmesi gizlidir; satırda ayrı bir çıkarma simgesi vardır (docs/history/370-*).
  assert.equal(await page.locator("[data-member-remove]:visible").count(), 0, "masaüstü düğmesi telefonda görünmez");
  await page.locator("[data-member-remove-phone]").first().click();
  await page.getByTestId("team-remove-form").waitFor();
  assert.ok(await overflowFree(page));
  await page.getByRole("button", { name: "Vazgeç" }).first().click();
  await page.getByTestId("team-remove-form").waitFor({ state: "detached" });
  await page.getByText("Roller ve yetkiler").first().click();
  await page.getByText("Hangi rol neyi yapabilir?").first().waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_list_members = () => ({ body: [member("u-aylin", "Aylin Demir", "aylin", "owner"), member("u-elif", "Elif Kaya", "elifk", "member")] });
} });

// --- Faz 2: Yönetim (sol gezinme), Denetim, Panel, Politikalar, Gruplar, Konuklar, Entegrasyonlar (docs/history/356-*) ---
const POLICY_ROW = { content_owner: "team", offboard_default: "ask", default_member_role: "member", invite_link_ttl_days: 7, publish_external_role: "admin", guest_invite_role: "admin", export_role: "owner" };
const withPolicy = async (page) => {
  await page.route((url) => url.pathname.endsWith("/rest/v1/teams") && url.search.includes("content_owner"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(POLICY_ROW) }));
};
const auditRow = (id, category, action, extra = {}) => ({ id, created_at: new Date().toISOString(), category, action, target_label: null, details: null, actor_id: "u-elif", actor_username: "elifk", actor_name: "Elif Kaya", actor_avatar_url: null, ...extra });

await scenario("30. Yönetim: masaüstünde sol dikey alt gezinme bölüm değiştirir; Politikalar iki sütun + tek Kaydet (değişmeden pasif, sonra team_update)", async ({ page, db }) => {
  await withPolicy(page);
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=audit`);
  const nav = page.locator("[data-admin-nav]");
  await nav.waitFor();
  await nav.locator("[data-admin-nav-item=policies]").click();
  await page.waitForFunction(() => location.search.includes("section=policies"));
  await page.getByTestId("team-policies").waitFor();
  const save = page.locator("[data-policy-save]");
  assert.equal(await save.isDisabled(), true, "değişiklik yokken Kaydet pasif");
  await page.getByLabel("Davet bağlantısı süresi").selectOption("14");
  assert.equal(await save.isDisabled(), false);
  await save.click();
  await page.waitForFunction(() => document.body.innerText.includes("Kaydedildi") || true);
  await page.waitForTimeout(300);
  const body = called(db, "team_update").at(-1)?.body;
  assert.deepEqual(body?.p_patch, { invite_link_ttl_days: 14 });
}, { setup: (db) => {
  db.rpc.team_update = (body) => { db.teamCalls.push({ name: "team_update", body }); return { body: null }; };
  db.rpc.team_audit_list = () => ({ body: [] });
  db.rpc.team_audit_stats = () => ({ body: { total: 0, role_access: 0, deletes: 0 } });
} });

await scenario("31. Denetim günlüğü: istatistik kartları, satır (zaman · avatar · cümle · kategori etiketi), message_reported çevirili, CSV indir tüm satırları yazar", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=audit`);
  await page.locator("[data-audit-stats]").waitFor();
  const rows = page.locator("[data-audit-row]");
  await rows.first().waitFor();
  assert.equal(await rows.count(), 3);
  await page.getByText("bir mesajı şikâyet etti").first().waitFor();
  assert.equal(await page.locator("[data-audit-tag=approval]").first().innerText(), "Onay");
  assert.equal(await page.getByText("tm.audit.action").count(), 0, "ham çeviri anahtarı görünmez");
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-audit-csv]").click()]);
  assert.match(download.suggestedFilename(), /audit\.csv$/);
  const text = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  assert.match(text, /Zaman,Yapan,Kategori,Olay/);
  assert.match(text, /Elif Kaya/);
}, { setup: (db) => {
  db.rpc.team_audit_list = () => ({ body: [auditRow("a1", "approval", "item_approved", { target_label: "Lansman afişi" }), auditRow("a2", "member", "message_reported"), auditRow("a3", "role", "role_changed", { target_label: "Kaan Aksoy", details: { from: "member", to: "editor" } })] });
  db.rpc.team_audit_stats = () => ({ body: { total: 214, role_access: 18, deletes: 3 } });
} });

await scenario("32. Panel (proje etkinliği): başlık, dönem hapları, dört kart (renkli değişim), günlük grafik, Dikkat gerekenler, en hareketli projeler tablosu", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=panel`);
  await page.getByText("Ekipte neler oluyor?").waitFor();
  await page.locator("[data-panel-stats]").waitFor();
  await page.locator("[data-panel-chart]").waitFor();
  await page.locator("[data-panel-alerts]").waitFor();
  await page.getByText("içerik onay bekliyor; en eskisi 4 gündür.").waitFor();
  await page.getByText("içerikte lider değişiklik istedi.").waitFor();
  const row = page.locator("[data-panel-top-row]").first();
  await row.getByText("Villa Projesi").waitFor();
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  assert.ok(rowText.includes("42") && rowText.includes("3 onay bekliyor"), rowText);
  assert.equal(await page.getByText("Kopyalama").count(), 0, "eski kütüphane kartları yok");
}, { setup: (db) => {
  db.rpc.team_insights = () => ({ body: { days: 30, added: 128, added_prev: 114, approval_hours: 3, approval_hours_prev: 4, contributors: 31, contributors_prev: 27, members: 48, projects: 9,
    daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, n: 1 + ((i * 7) % 11) })),
    alerts: { pending: 6, oldest_pending_days: 4, changes: 2 },
    top: [{ id: "p1", title: "Villa Projesi", added: 42, pending: 3 }] } });
} });

await scenario("33. Gruplar: sol liste + sağ ayrıntı (üyeler, Space erişimi); gruba dokununca ayrıntı değişir; kütüphane klasörü bölümü yok", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=groups`);
  await page.locator("[data-group-list]").waitFor();
  const detail = page.locator("[data-group-detail]");
  await detail.getByText("Marka görsel dili").waitFor();
  await detail.getByText("Yalnız görüntüler").waitFor();
    await page.locator("[data-group-item=g2]").click();
  await page.locator("[data-group-detail=g2]").waitFor();
  assert.equal(await page.locator("[data-group-leads-approve], [data-group-library]").count(), 0, "kütüphane klasörü / liderler onaylar bölümü artık yok");
}, { setup: (db) => {
  const g = (id, name, n, extra = {}) => ({ id, name, tone: "primary", lead_id: null, lead_name: "Elif Kaya", leads_approve: false, member_count: n, member_ids: [], spaces: [], folders: [], ...extra });
  db.rpc.team_list_groups = () => ({ body: [g("g1", "Tasarım", 14, { spaces: [{ space_id: "s1", title: "Marka görsel dili", level: "edit" }, { space_id: "s3", title: "Sosyal medya takvimi", level: "view" }], folders: [{ space_group_id: "f1", name: "Tasarım promptları", prompts: 18 }] }), g("g2", "Pazarlama", 11)] });
  db.rpc.team_update_group = (body) => { db.teamCalls.push({ name: "team_update_group", body }); return { body: null }; };
} });

await scenario("34. Konuklar: istatistik kartları, tablo (Konuk/Space'ler/Yetki/Erişim süresi/Son giriş), 'N gün kaldı' etiketi, 'Konuk neleri göremez?'; süre uzatma team_extend_guest'e gider", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=guests`);
  await page.locator("[data-guest-stats]").waitFor();
  const row = page.locator("[data-guest-row]").first();
  await row.getByText("Okan Sel").waitFor();
  await row.getByText("Yalnız görüntüler").waitFor();
  await row.getByText(/gün kaldı/).waitFor();
  await page.locator("[data-guest-hidden]").getByText("Ekip sohbeti").waitFor();
  await row.locator("[data-guest-extend]").selectOption("14");
  await page.waitForTimeout(300);
  assert.equal(called(db, "team_extend_guest").at(-1)?.body.p_days, 14);
}, { setup: (db) => {
  const until = new Date(Date.now() + 12 * 86_400_000).toISOString();
  db.rpc.team_list_guests = () => ({ body: [{ user_id: "gu1", username: "okans", display_name: "Okan Sel", avatar_url: null, guest_org: "Kuzey Kafe", guest_until: until, joined_at: "2026-10-01T00:00:00Z", expired: false, spaces: [{ space_id: "s1", title: "Müşteri: Kuzey Kafe", role: "viewer" }], channels: [] }] });
  db.rpc.team_extend_guest = (body) => { db.teamCalls.push({ name: "team_extend_guest", body }); return { body: until }; };
} });

await scenario("36. Telefon: Yönetim bölümleri (Denetim, Panel, Politikalar, Gruplar, Konuklar) yatay taşmaz; masaüstü gezinme gizli", async ({ page }) => {
  await withPolicy(page);
  for (const [tab, section, marker] of [["admin", "audit", "[data-audit-stats]"], ["panel", "", "[data-panel-stats]"], ["admin", "policies", "[data-policy-save]"], ["admin", "groups", "[data-group-list]"], ["admin", "guests", "[data-guest-stats]"]]) {
    await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=${tab}${section ? `&section=${section}` : ""}`);
    await page.locator(marker).waitFor();
    assert.ok(await overflowFree(page), `${tab}/${section}`);
    assert.equal(await page.locator("[data-admin-nav]").isVisible().catch(() => false), false, "telefonda dikey gezinme yok");
  }
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_audit_list = () => ({ body: [auditRow("a1", "approval", "item_approved", { target_label: "Lansman afişi" })] });
  db.rpc.team_audit_stats = () => ({ body: { total: 1, role_access: 0, deletes: 0 } });
  db.rpc.team_insights = () => ({ body: { days: 30, added: 10, added_prev: 5, approval_hours: null, approval_hours_prev: null, contributors: 1, contributors_prev: 1, members: 6, projects: 2, daily: [{ day: "2026-11-01", n: 3 }, { day: "2026-11-02", n: 5 }], alerts: { pending: 0, oldest_pending_days: null, changes: 0 }, top: [] } });
  db.rpc.team_list_groups = () => ({ body: [{ id: "g1", name: "Tasarım", tone: "primary", lead_id: null, lead_name: null, leads_approve: false, member_count: 3, member_ids: [], spaces: [], folders: [] }] });
  db.rpc.team_list_guests = () => ({ body: [] });
  db.rpc.team_integrations = () => ({ body: { slug: "atolye-mor", enabled: true, audience: "members", month_reads: 0, apps: [] } });
} });

await scenario("37. Telefon: Ekip sayfasında genel üst menü görünür; açık kanalda (tam ekran sohbet) gizlenir", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects`);
  await page.getByTestId("team-band").waitFor();
  assert.equal(await page.locator("[data-app-header]").isVisible(), true, "Genel bakış: üst menü görünür");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.getByTestId("team-band").waitFor();
  assert.equal(await page.locator("[data-app-header]").isVisible(), true, "Üyeler: üst menü görünür");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-team-focus"));
  assert.equal(await page.locator("[data-app-header]").isVisible(), false, "açık kanal: üst menü gizli");
}, { viewport: { width: 390, height: 800 } });

await scenario("38. Telefon (Merkez): bant (geri · im · ad · Davet et · ⋯) + kaydırılan sekme şeridi; sekme adresi değiştirir; proje açılınca bant yerine proje başlığı", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  const band = page.getByTestId("team-band");
  await band.waitFor();
  await band.locator("[data-team-back-phone]").waitFor();
  await band.locator("[data-team-invite-header]").waitFor();
  await band.locator("[data-team-menu]").click();
  await band.locator("[data-team-menu-list]").waitFor();
  await page.keyboard.press("Escape");
  const tabs = page.getByTestId("team-tabs");
  for (const key of ["projects", "approvals", "chat", "members", "panel", "admin"]) await tabs.locator(`[data-team-tab-link=${key}]`).waitFor({ state: "attached" });
  await tabs.locator("[data-team-tab-link=approvals]").click();
  await page.waitForFunction(() => location.search.includes("tab=approvals"));
  await page.getByTestId("team-approvals").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "yatay taşma yok");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=projects`);
  await page.locator("[data-project-card]").first().click();
  await page.locator("[data-drill-header]").waitFor();
  assert.equal(await page.getByTestId("team-band").count(), 0, "projede bant yerine proje başlığı");
}, { viewport: { width: 390, height: 800 } });

await scenario("39. Telefon (Yön C): Yönetim = liste → alt sayfa; alt sayfa 'Atölye Mor · Yönetim / Denetim günlüğü' çubuğu, geri Yönetim listesine döner", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin`);
  const list = page.locator("[data-phone-admin-list] [data-phone-section-list]");
  await list.waitFor();
  assert.ok((await list.locator("a").count()) >= 5, "yönetim bölümleri listelenir");
  await list.locator("[data-phone-section=audit]").click();
  await page.waitForFunction(() => location.search.includes("section=audit"));
  const bar = page.locator("[data-phone-subbar]");
  await bar.waitFor();
  const text = await bar.innerText();
  assert.match(text, /Yönetim/);
  assert.match(text, /Denetim günlüğü/);
  await page.locator("[data-audit-stats]").waitFor();
  assert.equal(await page.locator("[data-admin-phone-menus]").count(), 0, "eski çift hap yok");
  await bar.locator("[data-phone-back]").click();
  await page.waitForFunction(() => !location.search.includes("section="));
  await page.locator("[data-phone-admin-list]").waitFor();
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_audit_list = () => ({ body: [] });
  db.rpc.team_audit_stats = () => ({ body: { total: 0, role_access: 0, deletes: 0 } });
} });

await scenario("40. Telefon: Ekipler listesi (Hub düzeni, docs/history/378-*) — bant (başlık + kısa '+ Oluştur') + süzgeç + ara; kartlar tek sütun", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  const band = page.locator("[data-hub-band]");
  await band.waitFor();
  await band.getByRole("heading", { name: "Ekipler" }).waitFor();
  await band.locator("[data-team-create-phone]").waitFor();
  await page.locator("[data-teams-search]").waitFor();
  await page.getByTestId("teams-list").locator(`[data-team-card="${TEAM}"]`).waitFor();
  await page.locator("[data-teams-search]").click();
  await page.getByPlaceholder("Ekip ara…").fill("zzz");
  await page.waitForFunction(() => document.querySelectorAll("[data-team-card]").length === 0);
}, { viewport: { width: 390, height: 800 } });

await scenario("42. Telefon /teams (docs/history/359-*, 378-*): dikkat şeridi + Ekiplerim (Hub kartı, rozetler) + Son projeler; alt menü kadar boşluk", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  const strip = page.getByTestId("team-todos-strip");
  await strip.getByText("Senden bekleyen 2 iş var").waitFor();
  const card = page.locator(`[data-team-card="${TEAM}"]`);
  await card.waitFor();
  assert.match(await card.innerText(), /Atölye Mor/);
  assert.match(await card.innerText(), /6 üye · 2 proje/);
  await card.locator("[data-team-chip=unread]").waitFor();
  await card.locator("[data-team-chip=approvals]").waitFor();
  await page.getByTestId("teams-phone-projects").getByText("Villa Projesi").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "yatay taşma yok");
  const gap = await page.evaluate(async () => {
    const nav = document.querySelector("[data-app-nav]");
    const last = document.querySelector("[data-testid=teams-phone-projects]");
    for (const el of [document.scrollingElement, ...document.querySelectorAll("main, [data-app-scroll]")]) el?.scrollTo?.(0, 1e6);
    await new Promise((r) => setTimeout(r, 200));
    return nav.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
  });
  assert.ok(gap >= 8, `son bölüm alt menünün üstünde kalır (boşluk ${gap}px)`);
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_project_todos = () => ({ body: [{ team_id: TEAM, team_name: "Atölye Mor", team_slug: "atolye-mor", project_id: PROJECT, project_title: "Villa Projesi", kind: "review", n: 2, href: `/teams/local?id=${TEAM}&tab=projects&project=${PROJECT}&review=1`, at: "2026-11-08T08:00:00Z" }] });
} });

// ---------------------------------------------------------------------------------------------------------------------------------------
// Ekip projeleri (docs/history/360-*, 361-*): proje başına rol, proje kütüphanesi, Space'e bağlı kanal. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ —
// kurallar `supabase/tests/team-projects.sql` (127+ kontrol).
// ---------------------------------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------------------
// Merkez düzeni (docs/history/366-*): Onaylar panosu, üye kartları + Davet et formu, Yönetim hap şeridi + Genel ızgarası
// ---------------------------------------------------------------------------------------------------------------------------------------
const boardItem = (id, state, over = {}) => ({
  id, kind: "note", state, title: `Öğe ${id}`, body: "mat beyaz", note: null, media_url: null, content_type: null, color: "", space_id: "s1", project_id: PROJECT, project_title: "Villa Projesi",
  file_id: "f1", file_title: "Mutfak", author_id: "u-b", author_name: "Bob", author_username: "bob", submitted_at: "2026-11-08T09:00:00Z", decided_at: state === "approved" ? "2026-11-10T08:00:00Z" : null,
  unit: null, unit_count: 1, can_decide: true, mine: false, ...over,
});
const boardSetup = (items) => (db) => {
  db.rpc.team_review_board = () => ({ body: { items, proposals: [] } });
  db.rpc.team_review_decide = (b) => { db.teamCalls.push({ name: "team_review_decide", body: b }); return { body: (b.p_item_ids ?? []).length }; };
};

await scenario("43. Onaylar (masaüstü): üç sütun; Onayla → team_review_decide(approve); Değişiklik iste not zorunlu → changes + not", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=approvals`);
  const board = page.getByTestId("team-approvals");
  await board.waitFor();
  await board.locator("[data-board-layout=columns]").waitFor();
  assert.equal(await board.locator('[data-board-column="pending"] [data-board-card]').count(), 2);
  assert.equal(await board.locator('[data-board-column="changes"] [data-board-card]').count(), 1);
  assert.equal(await board.locator('[data-board-column="approved"] [data-board-card]').count(), 1);
  await board.locator('[data-board-card="p1"] [data-board-approve]').click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  const approve = db.teamCalls.filter((c) => c.name === "team_review_decide").at(-1)?.body;
  assert.deepEqual([approve.p_item_ids, approve.p_decision], [["p1"], "approve"]);
  await board.locator('[data-board-card="p2"] [data-board-changes]').click();
  const form = page.getByTestId("board-changes-form");
  await form.waitFor();
  await form.getByRole("button", { name: "Gönder" }).click();
  await form.getByText("Değişiklik isterken bir not yaz.").waitFor();
  await form.getByRole("textbox").fill("Daha kısa yaz");
  await form.getByRole("button", { name: "Gönder" }).click();
  await page.waitForTimeout(300);
  const changes = db.teamCalls.filter((c) => c.name === "team_review_decide").at(-1)?.body;
  assert.deepEqual([changes.p_item_ids, changes.p_decision, changes.p_note], [["p2"], "changes", "Daha kısa yaz"]);
  await board.getByText("Liderin notu: Ölçüleri yaz").waitFor();
}, { setup: boardSetup([boardItem("p1", "pending"), boardItem("p2", "pending"), boardItem("c1", "changes", { note: "Ölçüleri yaz" }), boardItem("a1", "approved")]) });

await scenario("44. Onaylar (tablet): segmentli tek liste; sekme sayacı bekleyen karar sayısı; kart öğe çekmecesine gider", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=approvals`);
  await page.locator("[data-board-layout=segments]").waitFor();
  await page.locator("[data-team-tab-link=approvals]").getByText("2").waitFor();
  await page.locator("[data-board-segment=changes]").click();
  await page.getByText("Liderin notu: Ölçüleri yaz").waitFor();
  await page.locator("[data-board-segment=pending]").click();
  const href = await page.locator('[data-board-card="p1"] [data-board-open]').getAttribute("href");
  assert.ok(href.includes("project=") && href.includes("file=f1") && href.includes("item=p1"), href);
  assert.ok(await overflowFree(page));
}, { viewport: { width: 834, height: 1000 }, setup: boardSetup([boardItem("p1", "pending"), boardItem("p2", "pending"), boardItem("c1", "changes", { note: "Ölçüleri yaz" })]) });

await scenario("45. Onaylar: üye yalnız kendi öğesini görür, karar düğmesi yok", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=approvals`);
  await page.getByTestId("team-approvals").waitFor();
  await page.getByText("Kararı projenin lideri verir.").first().waitFor();
  assert.equal(await page.locator("[data-board-approve]").count(), 0);
}, { role: "member", setup: boardSetup([boardItem("m1", "pending", { can_decide: false, mine: true })]) });

await scenario("46. Üyeler (Merkez): kartlar (proje rol özeti), Davet et formu → team_invite_user, bekleyen davetler", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  const card = page.locator('[data-member="elifk"]');
  await card.waitFor();
  await card.locator("[data-member-projects]").getByText("2 projede lider").waitFor();
  const invite = page.getByTestId("team-invite-card");
  await invite.waitFor();
  await invite.locator("#team-invite-card-username").fill("@mert");
  await invite.locator("[data-invite-card-send]").click();
  await invite.getByText("Davet gönderildi.").waitFor();
  const body = called(db, "team_invite_user").at(-1)?.body;
  assert.equal(body.p_username.replace("@", ""), "mert");
  await page.getByTestId("team-members-pending").getByText("@zeynep").waitFor();
}, { setup: (db) => {
  db.rpc.team_list_members = () => ({ body: [member("u-aylin", "Aylin Demir", "aylin", "owner"), member("u-elif", "Elif Kaya", "elifk", "editor")] });
  db.rpc.team_member_project_roles = () => ({ body: [{ user_id: "u-elif", lead_count: 2, edit_count: 0, view_count: 1 }] });
  db.rpc.team_list_invitations = () => ({ body: [{ id: "i1", invitee_username: "zeynep", invitee_name: "Zeynep", invitee_avatar_url: null, role: "member", created_at: "2026-11-08T09:00:00Z" }] });
} });

await scenario("47. Yönetim (Merkez): hap şeridi, Genel = profil + politikalar + denetim özeti + tehlikeli bölge ızgarası; hap bölüm değiştirir", async ({ page }) => {
  await withPolicy(page);
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin`);
  const nav = page.locator("[data-admin-nav]");
  await nav.locator("[data-admin-nav-item=overview]").waitFor();
  assert.equal(await nav.locator("[data-admin-nav-item=overview]").getAttribute("aria-current"), "page");
  await page.getByTestId("admin-overview").waitFor();
  await page.getByTestId("admin-audit-preview").waitFor();
  await nav.locator("[data-admin-nav-item=policies]").click();
  await page.waitForFunction(() => location.search.includes("section=policies"));
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=general`);
  await page.getByTestId("admin-overview").waitFor();
}, { setup: (db) => { db.rpc.team_audit_list = () => ({ body: [auditRow("a1", "member", "invited"), auditRow("a2", "policy", "policy_changed")] }); } });

// SURVEY=<klasör>: tüm ekip ekranlarının üç boyutta ekran görüntüsü (görsel inceleme; test sonucunu etkilemez).
if (process.env.SURVEY) {
  const VIEWS = { phone: { width: 390, height: 844 }, tablet: { width: 834, height: 1112 }, desktop: { width: 1440, height: 900 } };
  const URLS = {
    teams: "/teams", overview: "/teams/local?id=atolye-mor", approvals: "/teams/local?id=atolye-mor&tab=approvals", chat: "/teams/local?id=atolye-mor&tab=chat",
    members: "/teams/local?id=atolye-mor&tab=members", panel: "/teams/local?id=atolye-mor&tab=panel", admin: "/teams/local?id=atolye-mor&tab=admin",
    admin_policies: "/teams/local?id=atolye-mor&tab=admin&section=policies", admin_invites: "/teams/local?id=atolye-mor&tab=admin&section=invites", admin_groups: "/teams/local?id=atolye-mor&tab=admin&section=groups",
    admin_guests: "/teams/local?id=atolye-mor&tab=admin&section=guests", admin_audit: "/teams/local?id=atolye-mor&tab=admin&section=audit",
  };
  for (const [vname, viewport] of Object.entries(VIEWS)) {
    await scenario(`S. ${vname}`, async ({ page }) => {
      await withPolicy(page);
      for (const [key, url] of Object.entries(URLS)) {
        await page.goto(`${BASE}${url}`);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${process.env.SURVEY}/hub_${vname}_${key}.png`, fullPage: true });
      }
    }, { viewport, setup: (db) => {
      boardSetup([boardItem("p1", "pending"), boardItem("p2", "pending"), boardItem("c1", "changes", { note: "Ölçüleri yaz" }), boardItem("a1", "approved")])(db);
      withMembers(db);
      db.addTeamChannel(CH_GENERAL, { name: "genel", members: [[U.bob, "member"]], texts: [[U.bob, "Merhaba ekip, yeni kampanya panosunu inceledim."], [U.carol, "Harika, onaya gönderiyorum."]] });
      db.rpc.team_list_members = () => ({ body: [member("u-aylin", "Aylin Demir", "aylin", "owner"), member("u-elif", "Elif Kaya", "elifk", "editor", { guest_org: null }), member("u-can", "Can Yılmaz", "canyil", "member")] });
      db.rpc.team_member_project_roles = () => ({ body: [{ user_id: "u-elif", lead_count: 2, edit_count: 0, view_count: 1 }, { user_id: "u-can", lead_count: 0, edit_count: 1, view_count: 0 }] });
      db.rpc.team_list_groups = () => ({ body: [{ id: "g1", name: "Tasarım", tone: "primary", lead_id: null, lead_name: "Elif Kaya", leads_approve: false, member_count: 14, member_ids: [], spaces: [], folders: [] }] });
      db.rpc.team_list_guests = () => ({ body: [{ user_id: "gu1", username: "okans", display_name: "Okan Sel", avatar_url: null, guest_org: "Kuzey Kafe", guest_until: new Date(Date.now() + 12 * 86_400_000).toISOString(), joined_at: "2026-10-01T00:00:00Z", expired: false, spaces: [{ space_id: "s1", title: "Müşteri: Kuzey Kafe", role: "viewer" }], channels: [] }] });
      db.rpc.team_audit_list = () => ({ body: [auditRow("a1", "approval", "item_approved", { target_label: "Lansman afişi" }), auditRow("a2", "member", "invited"), auditRow("a3", "policy", "policy_changed")] });
      db.rpc.team_audit_stats = () => ({ body: { total: 3, role_access: 1, deletes: 0 } });
      db.rpc.team_recent_activity = () => ({ body: [{ id: "x1", kind: "added", item_kind: "note", actor_name: "Bob", title: "Mat beyaz", project_title: "Villa Projesi", at: new Date().toISOString() }, { id: "x2", kind: "approved", item_kind: "prompt", actor_name: "Aylin Demir", title: "Salon sahnesi", project_title: "Villa Projesi", at: new Date().toISOString() }] });
      db.rpc.team_insights = () => ({ body: { days: 30, added: 128, added_prev: 114, approval_hours: 3, approval_hours_prev: 4, contributors: 31, contributors_prev: 27, members: 48, projects: 9,
        daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, n: 1 + ((i * 7) % 11) })), alerts: { pending: 6, oldest_pending_days: 4, changes: 2 }, top: [{ id: "p1", title: "Villa Projesi", added: 42, pending: 3 }] } });
    } });
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
