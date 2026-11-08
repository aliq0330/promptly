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
  await card.getByText("Sahip", { exact: true }).waitFor();
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
  await card.getByText("Seçilenler").waitFor();
  await card.getByText("1 konuk").waitFor();
  await page.locator("[data-team-new-space]").waitFor();
});

await scenario("6. Kütüphane: onay bekleyen prompt İncele → Onayla → space_decide_item(approve)", async ({ page, db }) => {
  await page.goto(`${BASE}/teams/local?id=atolye-mor&tab=library`);
  const row = page.locator(`[data-library-item="${ITEM}"]`);
  await row.getByText("Onay bekliyor").first().waitFor();
  await row.locator("[data-review-open]").click();
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
  await page.locator(`[data-team-card="${TEAM}"]`).getByText("Owner", { exact: true }).waitFor();
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
  await page.getByTestId("team-tabs").waitFor();
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
  await page.locator("[data-team-back]").waitFor();
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

await browser.close();
server.close();
const failed = results.filter((r) => r[0] === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
