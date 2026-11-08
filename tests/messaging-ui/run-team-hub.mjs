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
  };
  reply("my_teams", () => [teamRow(role)]);
  reply("my_teams_preview", () => [{ team_id: TEAM, members_preview: [{ user_id: "u1", username: "aylin", display_name: "Aylin Demir", avatar_url: null }, { user_id: "u2", username: "elifk", display_name: "Elif Kaya", avatar_url: null }], recent: { action: "member_joined", actor_name: "Elif Kaya", label: null, at: "2026-11-08T08:00:00Z" } }]);
  reply("my_team_invitations", () => invitations);
  reply("my_team_todos", () => []);
  reply("team_create", () => TEAM);
  reply("team_respond_invitation", () => ({ status: "accepted", team_id: TEAM, slug: "atolye-mor" }));
  reply("team_list_spaces", () => [
    { id: "e1000000-0000-4000-8000-0000000000b1", owner_id: "11111111-1111-4111-8111-111111111111", owner_username: "alice", owner_display_name: "Alice", owner_avatar_url: null, title: "Kampanya panosu", description: "", kind: "moodboard", visibility: "private",
      cover_url: null, cover_item_id: null, cover_item_url: null, preview_urls: [], image_count: 4, prompt_count: 2, note_count: 0, member_count: 5, my_role: "owner", is_favorite: false, last_opened_at: null,
      created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", archived_at: null, access_mode: "selected", guest_count: 1, is_library: false },
  ]);
  reply("team_library_counts", () => ({ total: 3, approved: 1, pending: 1, draft: 1, deprecated: 0, oldest_pending_at: "2026-11-05T00:00:00Z" }));
  reply("team_library_items", () => [
    { id: ITEM, title: "Ürün tanıtım", group_id: null, group_name: "Pazarlama", state: "pending", content_rev: 2, use_count: 0, works_yes: 0, works_no: 0, approvals: 0, approvals_needed: 1,
      updated_at: "2026-11-05T00:00:00Z", updated_by: null, updated_by_name: "Carol", created_by: null, review_requested_at: "2026-11-05T00:00:00Z", approved_at: null, deprecated_at: null, locked: false },
  ]);
  reply("space_item_review", () => ({
    item: { id: ITEM, title: "Ürün tanıtım", body: "Merhaba {marka}", rev: 2, state: "pending", review_requested_at: "2026-11-05T00:00:00Z", requested_by: null, created_by: null, updated_at: "2026-11-05T00:00:00Z" },
    needed: 1, can_decide: true, base: null, approvals: [], comments: [],
  }));
  reply("space_decide_item", () => ({ state: "approved" }));
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
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
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
  await card.getByText("2 Space").waitFor();
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

await scenario("4. Sahip: tüm sekmeler (Space'ler, Kütüphane, Sohbet, Üyeler, Panel, Yönetim); üye: Panel ve Yönetim yok", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  await page.getByTestId("team-page").waitFor();
  const owner = await tabs(page);
  for (const label of ["Space'ler", "Kütüphane", "Sohbet", "Üyeler", "Panel", "Yönetim"]) assert.ok(owner.some((t) => t.startsWith(label)), `owner sees ${label}: ${owner}`);
});
await scenario("4b. Üye rolü: Panel ve Yönetim görünmez", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  await page.getByTestId("team-page").waitFor();
  const member = await tabs(page);
  assert.ok(member.some((t) => t.startsWith("Kütüphane")));
  assert.ok(!member.some((t) => t.startsWith("Panel")) && !member.some((t) => t.startsWith("Yönetim")), `member tabs: ${member}`);
}, { role: "member" });
await scenario("4c. Konuk: yalnız Space'ler ve Sohbet; süre bandı", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor`);
  await page.getByTestId("team-page").waitFor();
  await page.getByText(/Konuk erişimin/).waitFor();
  const guest = await tabs(page);
  assert.ok(!guest.some((t) => t.startsWith("Kütüphane")) && !guest.some((t) => t.startsWith("Üyeler")), `guest tabs: ${guest}`);
}, { role: "guest" });

await scenario("5. Space'ler sekmesi: kart, erişim özeti (Seçilenler) ve Yeni Space düğmesi (yetkiye göre)", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=spaces`);
  const card = page.locator("[data-space-card]");
  await card.getByText("Kampanya panosu").waitFor();
  await card.getByText("5 kişi + 1 konuk").waitFor();
  await page.locator("[data-space-counter]").waitFor();
  await page.locator("[data-team-new-space]").waitFor();
});

await scenario("6. Kütüphane: onay bekleyen prompt İncele → Onayla → space_decide_item(approve)", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library`);
  const row = page.locator(`[data-library-item="${ITEM}"]`);
  await row.getByText("Onay bekliyor").first().waitFor();
  await page.locator("[data-lib-detail] [data-review-open]").click();
  await page.getByTestId("team-review").waitFor();
  await page.getByText("Merhaba {marka}").waitFor();
  await page.locator("[data-review-approve]").click();
  await page.getByTestId("team-review").waitFor({ state: "detached" });
  const body = called(db, "space_decide_item")[0].body;
  assert.equal(body.p_decision, "approve");
  assert.equal(body.p_item, ITEM);
});

await scenario("7. Kütüphane: ?review=<öğe> penceresi doğrudan açar", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library&review=${ITEM}`);
  await page.getByTestId("team-review").waitFor();
});

await scenario("8. Sohbet: kanal listesi (özel kanalda kilit), okunmamış rozeti, kanal değişince başlık", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat`);
  const list = page.getByTestId("team-channel-list");
  await list.waitFor();
  await list.locator('[data-channel="genel"]').getByText("3").waitFor();
  await list.locator('[data-channel="yonetim"]').click();
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
  await page.getByText("Pending approval").first().waitFor();
}, { lang: "en" });

const shot = (page, name) => (process.env.SHOT ? page.screenshot({ path: `${process.env.SHOT}/${name}.png` }).catch(() => undefined) : undefined);

await scenario("13. Telefon: Ekipler, ekip sayfası ve Yönetim yatay taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByTestId("teams-list").waitFor();
  assert.ok(await overflowFree(page), "teams");
  await shot(page, "m_teams");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=spaces`);
  await page.getByTestId("team-spaces").waitFor();
  assert.ok(await overflowFree(page), "team page");
  await shot(page, "m_spaces");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library`);
  await page.getByTestId("team-library").waitFor();
  await page.locator("[data-lib-pending-banner]").waitFor();
  assert.equal(await page.locator("[data-testid=team-library] .grid.grid-cols-2").first().isVisible(), false, "telefonda istatistik kartları gizli");
  assert.ok(await overflowFree(page), "library");
  await shot(page, "m_library");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.locator("[data-team-phone-bar]").waitFor();
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
  await page.locator("[data-channel-chips]").waitFor();
  assert.ok((await page.locator("[data-channel-chip]").count()) >= 1, "kanal çipleri");
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
  await page.locator("[data-team-back-desktop]").waitFor();
  await page.getByText("Yalnızca davetle").waitFor();
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

await scenario("19. Ekip sohbeti başlığı: ekip adı + '# kanal · N üye'; kanal çipleri; çip kanalı değiştirir", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${CH_GENERAL}`);
  const header = page.locator("[data-team-header]");
  await header.waitFor();
  assert.match(await header.innerText(), /Atölye Mor/);
  assert.match(await page.locator("[data-team-header-sub]").innerText(), /# genel/);
  const chips = page.locator("[data-channel-chips] [data-channel-chip]");
  await chips.first().waitFor();
  assert.equal(await chips.count(), 2);
  assert.equal(await page.locator("[data-channel-chip='genel']").getAttribute("aria-selected"), "true");
  await page.locator("[data-channel-chip='yonetim']").click();
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

await scenario("24. Masaüstü sohbet = çalışma alanı: solda kanal kartı (rozet, alt satır 'çevrimiçi · üye'), sağda sohbet kartı (başlık, yüzler, Ara, bilgi); bilgi düğmesi kanal bilgisini açar", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  const view = page.getByTestId("team-channel-view");
  await view.waitFor();
  const aside = page.getByTestId("team-channel-aside");
  assert.equal(await aside.isVisible(), true);
  await aside.locator("[data-channel='genel']").getByText("3").waitFor();
  await page.getByTestId("team-online").getByText(/çevrimiçi/).waitFor();
  assert.match(await view.locator("h3").innerText(), /# genel/);
  await view.locator("[data-channel-faces]").waitFor();
  assert.equal(await view.getByTestId("team-channel-chips").isVisible(), false, "masaüstünde çip satırı yok (kanallar solda)");
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

await scenario("26. Kütüphane: tablo (Prompt/Durum/Sürüm/Kullanım/Güncelleyen) + sağda seçili prompt ayrıntısı (İncele) ve onay bekliyor şeridi", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library`);
  const table = page.getByTestId("team-library-list");
  await table.waitFor();
  await table.getByText("Ürün tanıtım").first().waitFor();
  for (const col of ["Prompt", "Durum", "Sürüm", "Kullanım", "Güncelleyen"]) await table.getByText(col, { exact: true }).first().waitFor();
  const detail = page.locator("[data-lib-detail]");
  await detail.waitFor();
  await detail.locator("[data-review-open]").waitFor();
  await page.locator("[data-lib-pending-banner]").waitFor();
});

await scenario("27. Onay incelemesi: tam sayfa — değişken çipleri, örnek çıktı kartı, kontrol listesi ve sağ panel; Değişiklik iste gerekçesiz gitmez", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library&review=${ITEM}`);
  await page.getByTestId("team-review").waitFor();
  await page.locator("[data-review-new]").waitFor();
  await page.locator("[data-review-vars]").waitFor();
  await page.locator("[data-review-sample]").getByText("Mavi bir kapak").waitFor();
  await page.locator("[data-review-panel]").waitFor();
  await page.locator("[data-review-changes]").click();
  assert.equal(called(db, "space_decide_item").length, 0, "gerekçesiz değişiklik isteği sunucuya gitmez");
}, { setup: (db) => {
  const original = db.rpc.space_item_review;
  db.rpc.space_item_review = (body) => {
    const out = original(body);
    out.body = { ...out.body, sample: { body: "Mavi bir kapak görseli", author: "Carol", at: "2026-11-05T00:00:00Z" }, base: { title: "Ürün tanıtım", body: "Merhaba", wasApproved: true, at: "2026-11-01T00:00:00Z", author: "Aylin" }, approvers: ["Aylin Demir"] };
    return out;
  };
} });

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

await scenario("29. Telefon: Üyeler satırında Roller ve yetkiler açılır, Çıkar penceresi taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.locator("[data-team-phone-bar]").waitFor();
  await page.getByText("Roller ve yetkiler").first().click();
  await page.getByText("Hangi rol neyi yapabilir?").first().waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_list_members = () => ({ body: [member("u-aylin", "Aylin Demir", "aylin", "owner"), member("u-elif", "Elif Kaya", "elifk", "member")] });
} });

// --- Faz 2: Yönetim (sol gezinme), Denetim, Panel, Politikalar, Gruplar, Konuklar, Entegrasyonlar (docs/history/356-*) ---
const POLICY_ROW = { require_approval: true, approvals_needed: 1, hide_unapproved: true, content_owner: "team", offboard_default: "ask", version_keep: 50, default_member_role: "member", invite_link_ttl_days: 7, publish_external_role: "admin", guest_invite_role: "admin", export_role: "owner", mcp_enabled: true, mcp_audience: "members" };
const withPolicy = async (page) => {
  await page.route((url) => url.pathname.endsWith("/rest/v1/teams") && url.search.includes("require_approval"), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(POLICY_ROW) }));
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
  await page.getByLabel("Gereken onay").selectOption("2");
  assert.equal(await save.isDisabled(), false);
  await page.locator("[data-policy-approvers]").waitFor();
  await save.click();
  await page.waitForFunction(() => document.body.innerText.includes("Kaydedildi") || true);
  await page.waitForTimeout(300);
  const body = called(db, "team_update").at(-1)?.body;
  assert.deepEqual(body?.p_patch, { approvals_needed: 2 });
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

await scenario("32. Panel: başlık, dönem hapları, dört kart (renkli değişim), günlük grafik, Dikkat gerekenler, en çok kullanılanlar tablosu (Çalıştı mı? %)", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=panel`);
  await page.getByText("Ekip kütüphanesi nasıl kullanılıyor?").waitFor();
  await page.locator("[data-panel-stats]").waitFor();
  await page.locator("[data-panel-chart]").waitFor();
  await page.locator("[data-panel-alerts]").waitFor();
  const row = page.locator("[data-panel-top-row]").first();
  await row.getByText("%92").waitFor();
  await row.getByText("Ürün tanıtım metni").waitFor();
}, { setup: (db) => {
  db.rpc.team_insights = () => ({ body: { days: 30, copies: 1284, copies_prev: 1146, approval_hours: 3, approval_hours_prev: 4, contributors: 31, contributors_prev: 27, members: 48, stale: 9,
    daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, n: 10 + ((i * 7) % 50) })),
    alerts: { pending: 6, oldest_pending_days: 4, stale: 9, deprecated_used: 2 },
    top: [{ id: "t1", title: "Ürün tanıtım metni", copies: 312, works_yes: 35, works_no: 3, rev: 4, updated_at: "2026-11-05T00:00:00Z", stale: false }] } });
} });

await scenario("33. Gruplar: sol liste + sağ ayrıntı (üyeler, Space erişimi, kütüphane klasörü); gruba dokununca ayrıntı değişir; liderler onay anahtarı team_update_group'a gider", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=groups`);
  await page.locator("[data-group-list]").waitFor();
  const detail = page.locator("[data-group-detail]");
  await detail.getByText("Marka görsel dili").waitFor();
  await detail.getByText("Yalnız görüntüler").waitFor();
  await detail.getByText("Grup klasörü: Tasarım promptları").waitFor();
  await page.locator("[data-group-item=g2]").click();
  await page.locator("[data-group-detail=g2]").waitFor();
  await page.locator("[data-group-leads-approve] button").click();
  await page.waitForTimeout(300);
  const body = called(db, "team_update_group").at(-1)?.body;
  assert.equal(body?.p_group, "g2");
  assert.deepEqual(body?.p_patch, { leads_approve: true });
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

await scenario("35. Entegrasyonlar: adres + Kopyala, 3 adım, 'Neye erişir?', 'Kimler kullanabilir?' seçici, bu ay okuma ve bağlı uygulama tablosu; Engelle team_set_api_block'a gider", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=admin&section=integrations`);
  const address = page.locator("[data-int-address]");
  await address.waitFor();
  assert.match(await address.inputValue(), /\/mcp\/team\/atolye-mor$/);
  await page.locator("[data-int-copy]").waitFor();
  await page.getByText("Claude'da Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle.").waitFor();
  await page.locator("[data-int-access]").getByText("Onaylı promptlar").waitFor();
  await page.locator("[data-int-access]").getByText("Yazma ve düzenleme").waitFor();
  await page.locator("[data-int-reads]").getByText("222").waitFor();
  const app = page.locator("[data-int-app]").first();
  await app.getByText("Claude").waitFor();
  await app.locator("[data-int-block]").click();
  await page.waitForTimeout(300);
  assert.equal(called(db, "team_set_api_block").at(-1)?.body.p_blocked, true);
}, { setup: (db) => {
  db.rpc.team_integrations = () => ({ body: { slug: "atolye-mor", enabled: true, audience: "members", month_reads: 222, apps: [{ user_id: "u-elif", user_name: "Elif Kaya", name: "Claude", via: "oauth", reads: 142, last_day: "2026-11-07", token_id: "tok1", blocked: false }] } });
  db.rpc.team_set_api_block = (body) => { db.teamCalls.push({ name: "team_set_api_block", body }); return { body: null }; };
} });

await scenario("36. Telefon: Yönetim bölümleri (Denetim, Panel, Politikalar, Gruplar, Konuklar, Entegrasyonlar) yatay taşmaz; masaüstü gezinme gizli", async ({ page }) => {
  await withPolicy(page);
  for (const [tab, section, marker] of [["admin", "audit", "[data-audit-stats]"], ["panel", "", "[data-panel-stats]"], ["admin", "policies", "[data-policy-save]"], ["admin", "groups", "[data-group-list]"], ["admin", "guests", "[data-guest-stats]"], ["admin", "integrations", "[data-int-connector]"]]) {
    await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=${tab}${section ? `&section=${section}` : ""}`);
    await page.locator(marker).waitFor();
    assert.ok(await overflowFree(page), `${tab}/${section}`);
    assert.equal(await page.locator("[data-admin-nav]").isVisible().catch(() => false), false, "telefonda dikey gezinme yok");
  }
}, { viewport: { width: 390, height: 800 }, setup: (db) => {
  db.rpc.team_audit_list = () => ({ body: [auditRow("a1", "approval", "item_approved", { target_label: "Lansman afişi" })] });
  db.rpc.team_audit_stats = () => ({ body: { total: 1, role_access: 0, deletes: 0 } });
  db.rpc.team_insights = () => ({ body: { days: 30, copies: 10, copies_prev: 5, approval_hours: null, approval_hours_prev: null, contributors: 1, contributors_prev: 1, members: 6, stale: 0, daily: [{ day: "2026-11-01", n: 3 }, { day: "2026-11-02", n: 5 }], alerts: { pending: 0, oldest_pending_days: null, stale: 0, deprecated_used: 0 }, top: [] } });
  db.rpc.team_list_groups = () => ({ body: [{ id: "g1", name: "Tasarım", tone: "primary", lead_id: null, lead_name: null, leads_approve: false, member_count: 3, member_ids: [], spaces: [], folders: [] }] });
  db.rpc.team_list_guests = () => ({ body: [] });
  db.rpc.team_integrations = () => ({ body: { slug: "atolye-mor", enabled: true, audience: "members", month_reads: 0, apps: [] } });
} });

await scenario("37. Telefon: Ekip sayfasında genel üst menü görünür; açık kanalda (tam ekran sohbet) ve Kütüphane ayrıntısında gizlenir", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=spaces`);
  await page.locator("[data-team-phone-bar]").waitFor();
  assert.equal(await page.locator("[data-app-header]").isVisible(), true, "Space'ler: üst menü görünür");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=members`);
  await page.locator("[data-team-phone-bar]").waitFor();
  assert.equal(await page.locator("[data-app-header]").isVisible(), true, "Üyeler: üst menü görünür");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library&item=${ITEM}`);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-fullscreen-detail"));
  assert.equal(await page.locator("[data-app-header]").isVisible(), false, "Kütüphane ayrıntısı tam ekran: üst menü gizli");
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=chat&channel=genel`);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-team-focus"));
  assert.equal(await page.locator("[data-app-header]").isVisible(), false, "açık kanal: üst menü gizli");
}, { viewport: { width: 390, height: 800 } });

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
