// Sayfa kayıtları: her kayıt = bir mockup panosu + gerçek sayfanın adresi + sahte veri (tests/messaging-ui/mock*.mjs).
import { ME, U } from "../messaging-ui/mock.mjs";
import { setupCommunities } from "../messaging-ui/mock-communities.mjs";
import { setupRooms } from "../messaging-ui/mock-rooms.mjs";
import { setupSpaces, SID, MEDIA, IID } from "../messaging-ui/mock-spaces.mjs";

const C1 = "e0000000-0000-4000-8000-0000000000a1";
const R_IPUCLARI = "e0000000-0000-4000-8000-0000000000b3";

/** Mockup'taki topluluk: Sinematik Prompt Atölyesi, 412 üye, sahip sensin. */
function community(db, extra = {}) {
  setupCommunities(db);
  const g = db.addCommunity(C1, {
    name: "Sinematik Prompt Atölyesi",
    myRole: "owner",
    visibility: "public",
    category: "showcase",
    domain: "video",
    description: "Sinema dilinden ilham alan görsel ve video promptları üzerine çalışan açık bir atölye.",
    rules: "1. Prompt paylaşırken kullandığın aracı ve sürümü yaz.\n2. Başkasının promptunu uyarlarsan kaynağı belirt.\n3. Kişisel veri, yetişkin içerik ve telif ihlali içeren paylaşımlar kaldırılır.\n4. Eleştiri yapıcı olsun; kişiye değil içeriğe odaklan.",
    rulesRequired: true,
    members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]],
    ...extra,
  });
  setupRooms(db);
  db.addRoom(C1, { name: "Genel", is_default: true });
  db.addRoom(C1, { name: "Duyurular", posting_policy: "admins" });
  db.addRoom(C1, { id: R_IPUCLARI, name: "Prompt ipuçları", description: "Kısa ve işe yarayan prompt numaraları.", section: "Atölye" });
  db.addRoom(C1, { name: "Yardım", section: "Atölye" });
  db.addRoom(C1, { name: "Yönetim", read_policy: "staff", section: "Özel" });
  db.addRoom(C1, { name: "Eski duyurular", archived_at: "2026-10-01T00:00:00Z" });
  db.addRoom(C1, { name: "Etkinlik", archived_at: "2026-10-02T00:00:00Z" });
  db.links = [{ id: "l1", group_id: C1, created_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-14T00:00:00Z", revoked_at: null, max_uses: 50, use_count: 12 }, { id: "l2", group_id: C1, created_at: "2026-11-02T00:00:00Z", expires_at: "2026-12-20T00:00:00Z", revoked_at: null, max_uses: null, use_count: 3 }];
  db.stats = { days: 30, members: { total: 412, joined: 4, left: 1, net: 3 }, posts: { total: 9, in_period: 5, authors_in_period: 3 }, engagement: { likes: 21, comments: 6 }, events: { total: 3, upcoming: 2, in_period: 1, going_in_period: 7, going_upcoming: 10 }, chat: { messages_in_period: 340, active_senders_in_period: 8 }, queue: { pending_requests: 3, pending_invitations: 1, open_reports: 4 }, series: [] };
  g.member_count = 412;
  g.member_limit = 1000;
  g.rules_version = 3;
  return g;
}

const norm = (text) => text.replace(/Sinema ve video|Video & Animasyon/g, "<alan>").replace(/\d+ (\/ \d+ )?karakter/g, "<n> karakter");


// ---------------------------------------------------------------------------------------------
// Ekip: "Ürün Tasarım Ekibi", 18 üye, 6 proje, sahip sensin.
// ---------------------------------------------------------------------------------------------
const TEAM = "e1000000-0000-4000-8000-000000000001";
function team(db, { role = "owner" } = {}) {
  const calls = (db.teamCalls = []);
  const reply = (name, fn) => { db.rpc[name] = (body) => { calls.push({ name, body }); return { body: fn(body) }; }; };
  const row = { id: TEAM, slug: "urun-tasarim", name: "Ürün Tasarım Ekibi", description: "Ürün tasarımı, prompt kütüphanesi ve ortak proje panoları.", tone: "primary", my_role: role, member_count: 18, guest_count: 3, space_count: 6, channel_count: 3, unread_count: 0, last_activity_at: "2026-11-08T10:00:00Z", library_space_id: null, guest_until: null };
  reply("my_teams", () => [row]);
  reply("my_teams_preview", () => []);
  reply("my_team_invitations", () => []);
  reply("my_team_todos", () => []);
  reply("team_project_todos", () => []);
  reply("team_review_board", () => ({ items: [], proposals: [] }));
  reply("team_recent_activity", () => []);
  reply("team_projects_list", () => []);
  reply("team_my_can", () => true);
  reply("team_list_members", () => [
    { user_id: U.bob.id, username: "mert.demir", display_name: "Mert Demir", avatar_url: null, role: "member", joined_at: "2026-03-12T00:00:00Z", guest_org: null, guest_until: null, group_ids: null, group_names: null },
    { user_id: U.carol.id, username: "can.yildiz", display_name: "Can Yıldız", avatar_url: null, role: "editor", joined_at: "2026-03-12T00:00:00Z", guest_org: null, guest_until: null, group_ids: null, group_names: ["Tasarım"] },
  ]);
  reply("team_list_invitations", () => [
    { id: "i1", invitee_id: U.dave.id, invitee_username: "mert.demir", invitee_name: "Mert Demir", invitee_avatar_url: null, role: "member", guest_days: null, guest_org: null, invited_by_name: "Sen", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "i2", invitee_id: U.erin.id, invitee_username: "zeynep.y", invitee_name: "Zeynep Yılmaz", invitee_avatar_url: null, role: "editor", guest_days: null, guest_org: null, invited_by_name: "Sen", created_at: new Date(Date.now() - 86400000).toISOString() },
  ]);
  reply("team_list_invite_links", () => [
    { id: "k7p0mwaa", role: "member", created_by: ME, created_by_name: "Sen", expires_at: "2027-12-21T00:00:00Z", revoked_at: null, max_uses: 20, use_count: 3, created_at: "2026-11-01T00:00:00Z" },
    { id: "x92qabbb", role: "member", created_by: ME, created_by_name: "Sen", expires_at: "2026-12-21T00:00:00Z", revoked_at: "2026-11-10T00:00:00Z", max_uses: null, use_count: 0, created_at: "2026-10-01T00:00:00Z" },
  ]);
  const day = 86400000;
  const guest = (id, name, un, days, role, joinedAgo) => ({ user_id: id, username: un, display_name: name, avatar_url: null, guest_org: null, guest_until: new Date(Date.now() + days * day + 3600000).toISOString(), joined_at: new Date(Date.now() - joinedAgo * day).toISOString(), expired: false, spaces: role === "edit" ? [{ space_id: "s1", title: "A", role: "editor" }] : [{ space_id: "s1", title: "A", role: "viewer" }, { space_id: "s2", title: "B", role: "viewer" }], channels: [] });
  reply("team_list_guests", () => [guest(U.dave.id, "Selin Kara", "selin", 12, "view", 1), guest("g2", "Onur Tan", "onur", 5, "edit", 0), guest("g3", "Deniz Aksoy", "deniz", 30, "view", 3)]);
  reply("team_list_groups", () => []);
  reply("team_member_project_roles", () => [{ user_id: U.carol.id, lead_count: 0, edit_count: 3, view_count: 1 }]);
  reply("team_audit_stats", () => ({ total: 128, roleAccess: 14, deletes: 3 }));
  const now = new Date();
  const at = (h, m, back = 0) => { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h, m, 0, 0); return d.toISOString(); };
  reply("team_audit_list", () => [
    { id: "a1", created_at: at(10, 18), category: "role", action: "role_changed", target_label: "Can Yıldız", details: { from: "member", to: "editor" }, actor_id: ME, actor_username: "ayse", actor_name: "Ayşe Yılmaz", actor_avatar_url: null },
    { id: "a2", created_at: at(9, 42), category: "approval", action: "item_approved", target_label: "Onboarding", details: null, actor_id: U.carol.id, actor_username: "can", actor_name: "Can Yıldız", actor_avatar_url: null },
    { id: "a3", created_at: at(17, 42, 1), category: "access", action: "guest_extended", target_label: "Selin Kara'nın konuk erişimi 12 gün sonra sona erecek", details: null, actor_id: null, actor_username: null, actor_name: null, actor_avatar_url: null },
    { id: "a4", created_at: at(11, 5, 1), category: "member", action: "invite_link_created", target_label: null, details: null, actor_id: ME, actor_username: "ayse", actor_name: "Ayşe Yılmaz", actor_avatar_url: null },
    { id: "a5", created_at: at(9, 20, 1), category: "library", action: "channel_deleted", target_label: "Eski", details: null, actor_id: ME, actor_username: "ayse", actor_name: "Ayşe Yılmaz", actor_avatar_url: null },
  ]);
  const prev = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "teams" && ctx.method === "GET") return ctx.rows([{ content_owner: "team", offboard_default: "ask", default_member_role: "member", invite_link_ttl_days: 7, publish_external_role: "editor", guest_invite_role: "admin", export_role: "admin" }]);
    return prev ? prev(ctx) : null;
  };
}

const PROJECT = "e1000000-0000-4000-8000-0000000000b1";
const FILE = "e1000000-0000-4000-8000-0000000000b3";
const PID = (n) => `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function teamProject(db, { files = true } = {}) {
  team(db);
  const calls = db.teamCalls;
  const reply = (name, fn) => { db.rpc[name] = (body) => { calls.push({ name, body }); return { body: fn(body) }; }; };
  const person = (id, name, role, over = {}) => ({ type: "member", id, name, username: name.toLowerCase(), avatar_url: null, role, implicit: false, member_count: null, ...over });
  const detail = () => ({
    project: { id: PROJECT, team_id: TEAM, title: "Mobil uygulama yenileme", description: "2027 ilk çeyrek tasarım dili ve prompt setleri.", tone: "primary", access_mode: "selected", base_role: "view", review_default: true, archived_at: null, created_at: "2026-11-01T00:00:00Z" },
    my_role: "lead", main_area_id: null, channel_id: null, item_count: 4, pending_count: 0,
    files: [{ id: FILE, title: "Onboarding akışı", position: 0, review_required: true, main_area_id: PID(2), item_count: 6, board_count: 2, pending_count: 0 }],
    boards: [{ id: PID(3), title: "Akış", file_id: FILE, item_count: 3, position: 0, group_id: "g1" }, { id: PID(4), title: "Ekranlar", file_id: FILE, item_count: 2, position: 1, group_id: "g1" }],
    groups: [{ id: "g1", file_id: FILE, title: "Grup" }],
    people: [person("p1", "Ayşe", "lead"), person("p2", "Can", "edit"), person("p3", "Mert", "edit"), person("p4", "Deniz", "view"), person("p5", "Selin", "view"), person("p6", "Onur", "view"), person("p7", "Sahip", "lead", { implicit: true })],
    variables: [{ id: "v1", file_id: FILE, name: "marka", value: "Lumen" }, { id: "v2", file_id: FILE, name: "ton", value: "Samimi, kısa cümleler" }, { id: "v3", file_id: FILE, name: "hedef_kitle", value: "22–35 yaş, şehirli" }],
  });
  reply("team_projects_list", () => [{ id: PROJECT, title: "Mobil uygulama yenileme", description: "", tone: "primary", archived_at: null, review_default: true, access_mode: "selected", base_role: "view", my_role: "lead", main_area_id: null, channel_id: null, member_count: 6, board_count: 2, item_count: 6, pending_count: 0, files: files ? detail().files : [] }]);
  reply("team_project_get", () => detail());
  reply("team_project_channels", () => []);
  reply("team_channels_overview", () => []);
  reply("team_list_channels", () => []);
  reply("team_variables_list", () => detail().variables);
  reply("team_project_access", () => ({ mode: "selected", base_role: "view", entries: [
    { type: "member", id: ME, role: "lead", name: "Ayşe Yılmaz", username: "ayse", sub: "owner" },
    { type: "member", id: U.carol.id, role: "edit", name: "Can Yıldız", username: "can.yildiz", sub: "editor" },
    { type: "group", id: "tg1", role: "edit", name: "Tasarım grubu", username: null, sub: "7" },
    { type: "member", id: U.dave.id, role: "view", name: "Selin Kara", username: "selin", sub: "guest" },
  ] }));
  reply("team_update_project", () => null);
  reply("team_set_project_access", () => null);
}
const projUrl = `/teams/local?id=${TEAM}&tab=projects&project=${PROJECT}`;

// ---------------------------------------------------------------------------------------------
// Space: "Neon şehir karakterleri", sahip sensin, 3 üye + 1 bekleyen davet, 5 görsel.
// ---------------------------------------------------------------------------------------------
function space(db) {
  setupSpaces(db);
  const row = db.addSpace(1, { title: "Neon şehir karakterleri", description: "Cyberpunk şehir için ana karakterler, yan roller ve kostüm paleti.", kind: "character", members: [[U.bob, "editor"], [U.carol, "viewer"]] });
  row.cover_url = "https://example.supabase.co/storage/v1/object/public/space-media/cover.jpg";
  for (let i = 1; i <= 5; i += 1) db.addItem(row.id, { id: IID(i), kind: "image", media_url: MEDIA(row.id, i), title: `Görsel ${i}` });
  db.spaceInvites.push({ id: "inv1", space_id: row.id, invitee_id: U.erin.id, inviter_id: ME, role: "viewer", status: "pending", created_at: new Date().toISOString() });
  return row;
}
const SPACE_URL = `/spaces/local?id=${SID(1)}`;
const openMenu = async (page) => { await page.getByRole("button", { name: "Daha fazla işlem" }).first().click(); await page.getByRole("menuitem", { name: /Ayarlar/ }).first().click(); await page.waitForTimeout(500); };
const spaceNorm = (x) => x.replace(/!$/, "").replace(/\d+ üye · \d+ bekleyen davet/, "<m>").replace(/@[\w.]+/g, "@u");

const CH = "e1000000-0000-4000-8000-0000000000a9";
function teamChannels(db) {
  teamProject(db);
  const calls = db.teamCalls;
  const reply = (name, fn) => { db.rpc[name] = (body) => { calls.push({ name, body }); return { body: fn(body) }; }; };
  const channel = (id, name, mode, extra = {}) => ({ id, name, description: null, mode, space_id: null, space_title: null, posting_policy: "members", notify_default: "mentions", is_default: false, position: 0, archived_at: null, unread_count: 0, muted: false, notify_level: "mentions", last_message_at: "2026-11-08T09:00:00Z", member_count: 4, can_post: true, ...extra });
  const list = () => [
    channel("e1000000-0000-4000-8000-0000000000aa", "genel", "project", { project_id: PROJECT, project_title: "Mobil uygulama yenileme", project_main: true, muted: true, mute_scope: "project", notify_level: "none" }),
    channel(CH, "tasarim-kritikleri", "project", { description: "Haftalık kritik ve geri bildirim toplantısı notları.", project_id: PROJECT, project_title: "Mobil uygulama yenileme", file_id: null, project_main: false, notify_level: "mentions" }),
    channel("e1000000-0000-4000-8000-0000000000ab", "duyurular", "open", { is_default: true, notify_level: "all" }),
  ];
  reply("team_channels_overview", list);
  reply("team_list_channels", list);
  reply("team_channel_members", () => []);
  reply("team_update_channel", () => null);
  reply("team_set_channel_notify", () => null);
  reply("team_my_mutes", () => [{ team_id: TEAM, project_id: PROJECT }]);
  const second = { id: "e1000000-0000-4000-8000-0000000000b9", title: "Marka rehberi", description: "", tone: "primary", archived_at: null, review_default: true, access_mode: "selected", base_role: "view", my_role: "lead", main_area_id: null, channel_id: null, member_count: 3, board_count: 0, item_count: 0, pending_count: 0, files: [] };
  const prevList = db.rpc.team_projects_list;
  reply("team_projects_list", () => [...prevList({}).body, second]);
}

export const PAGES = [
  { id: "A1", mock: "A1-yonetim-listesi", height: 1290, url: `/communities/local?id=${C1}&tab=manage`, setup: (db) => { community(db); db.groups.find((g) => g.id === C1).pending_request_count = 3; } },
  { id: "A2", mock: "A2-topluluk-ayarlari", height: 1470, ignore: ["btn#4", "rt#4"], url: `/communities/local?id=${C1}&tab=manage&section=settings`, setup: (db) => community(db), normalize: norm, before: async (page) => { await page.locator("[data-sx-page] .seg").nth(1).getByText("Yönetim").click(); await page.locator("[data-sx-page] .tg").first().click(); } },
  { id: "A3", mock: "A3-gorunurluk", height: 820, url: `/communities/local?id=${C1}&tab=manage&section=settings&sub=visibility`, setup: (db) => community(db), normalize: norm },
  { id: "A4", mock: "A4-kurallar", height: 900, url: `/communities/local?id=${C1}&tab=manage&section=settings&sub=rules`, setup: (db) => community(db), normalize: norm },
  { id: "A5", mock: "A5-yetkiler", height: 1800, url: `/communities/local?id=${C1}&tab=manage&section=permissions`, setup: (db) => community(db), before: async (page) => { await page.locator("[data-sx-page] .tg").nth(2).click(); await page.locator("[data-sx-page] .tg").nth(3).click(); } },
  { id: "A6", mock: "A6-sohbet-ayarlari", height: 1060, url: `/communities/local?id=${C1}&tab=manage&section=chat`, setup: (db) => community(db) },
  { id: "B1", mock: "B1-sohbet-odalari", height: 1000, url: `/communities/local?id=${C1}&tab=manage&section=rooms`, setup: (db) => community(db) },
  { id: "B2", mock: "B2-oda-formu", height: 1200, url: `/communities/local?id=${C1}&tab=manage&section=rooms&sub=room&room=${R_IPUCLARI}`, setup: (db) => community(db), normalize: (x) => x.replace(/Odayı düzenle|Yeni oda/g, "<baslik>").replace(/Oda oluştur|Kaydet/g, "<eylem>").replace(/\d+ \/ 40/g, "<n>").replace(/#$/, ""), ignore: ["hash#0"] },
  { id: "B3", mock: "B3-davetler", height: 1180, url: `/communities/local?id=${C1}&tab=members&section=invites`, normalize: (x) => x.replace(/…\/join#\w+/g, "<l>").replace(/@[\w.]+/g, "@u").replace(/@u.*?davet edildi/g, "@u <w> davet edildi").replace(/^[A-ZÇĞİÖŞÜ]{1,3}(?=@u)/, "<av>").replace(/^[A-ZÇĞİÖŞÜ]{1,3}$/, "<av>").replace(/\d+ \/ \d+ kullanım.*$/g, "<kullanım>").replace(/Oluşturan: \S+/g, "Oluşturan"),
    setup: (db) => {
      community(db);
      db.links = [{ id: "a8f2k9aa", group_id: C1, created_at: "2026-11-01T00:00:00Z", expires_at: "2027-12-14T00:00:00Z", revoked_at: null, max_uses: 50, use_count: 12, created_by: ME }, { id: "q31zxpbb", group_id: C1, created_at: "2026-10-02T00:00:00Z", expires_at: "2026-10-20T00:00:00Z", revoked_at: null, max_uses: 50, use_count: 50, created_by: ME }];
      db.invitations.push({ id: "i1", group_id: C1, invitee_id: U.carol.id, inviter_id: ME, status: "pending", created_at: new Date(Date.now() - 2 * 86400000).toISOString(), expires_at: "2027-01-01T00:00:00Z" });
      db.invitations.push({ id: "i2", group_id: C1, invitee_id: U.erin.id, inviter_id: ME, status: "pending", created_at: new Date(Date.now() - 86400000).toISOString(), expires_at: "2027-01-01T00:00:00Z" });
    } },
  { id: "B4", mock: "B4-topluluk-bildirimleri", height: 1260, url: `/communities/local?id=${C1}&tab=about&section=prefs`, normalize: (x) => x.replace(/\d+ \w+ \d+:\d+('a|'e)? kadar sessizde\.( Sesi aç)?/, "<sessiz>"),
    setup: (db) => { community(db); const g = db.groups.find((x) => x.id === C1); g.myRole = "member"; const m = db.member(C1, ME); m.role = "member"; m.notify_muted_until = new Date(Date.now() + 86400000).toISOString(); db.acceptances.push({ community_id: C1, user_id: ME, rules_version: 3 }); } },
  { id: "B5", mock: "B5-topluluk-tehlike", height: 960, url: `/communities/local?id=${C1}&tab=manage&section=danger`, setup: (db) => community(db) },
  { id: "B6", mock: "B6-topluluk-silme", height: 860, url: `/communities/local?id=${C1}&tab=manage&section=danger&sub=delete`, setup: (db) => community(db) },
  { id: "C1", mock: "C1-ekip-yonetim", height: 1200, url: `/teams/local?id=${TEAM}&tab=admin`, setup: (db) => team(db) },
  { id: "C2", mock: "C2-ekip-profili", height: 1100, url: `/teams/local?id=${TEAM}&tab=admin&section=profile`, setup: (db) => team(db), before: async (page) => { await page.locator("[data-sx-page] #ek-ad").fill("Ürün Tasarım Ekibi!"); }, normalize: (x) => x.replace(/\d+ \/ 500/g, "<n>").replace(/Ürün Tasarım Ekibi!?/g, "<ad>") },
  { id: "C3", mock: "C3-ekip-politikalar", height: 1220, ignore: ["rt#6", "btn#6"], url: `/teams/local?id=${TEAM}&tab=admin&section=policies`, setup: (db) => team(db), normalize: (x) => x.replace(/\d+ gün/g, "<g>"), before: async (page) => { await page.locator("[data-sx-page] .btn.sel").last().click(); await page.getByRole("radio", { name: /14 gün/ }).click(); await page.getByRole("button", { name: "Seç" }).click(); await page.waitForTimeout(300); } },
  { id: "C4", mock: "C4-rol-secici", height: 820, url: `/teams/local?id=${TEAM}&tab=admin&section=policies&sub=pick&key=publishExternalRole`, setup: (db) => team(db) },
  { id: "C5", mock: "C5-ekip-davetler", height: 1220, url: `/teams/local?id=${TEAM}&tab=admin&section=invites`, setup: (db) => team(db), normalize: (x) => x.replace(/…\/team-join#\w+/g, "<l>").replace(/@[\w.]+/g, "@u").replace(/(Üye|Düzenleyici) · .*?(?=İptal)/g, "<rol> · <zaman>").replace(/[Dd]ün/g, "<d>").replace(/^[A-ZÇĞİÖŞÜ]{1,3}(?=@u)/, "<av>").replace(/^[A-ZÇĞİÖŞÜ]{1,3}$/, "<av>").replace(/\d+ \/ \d+ kullanım.*?(?=İptal)/g, "<k>") },
  { id: "C6", mock: "C6-konuklar", height: 1180, ignore: ["tag#2"], url: `/teams/local?id=${TEAM}&tab=admin&section=guests`, setup: (db) => team(db), normalize: (x) => x.replace(/Katıldı: .*$/, "<s>").replace(/Son giriş: .*$/, "<s>").replace(/(Dün|Bugün|\d+ gün önce)$/, "<s>").replace(/ (Selin Kara|Onur Tan|Deniz Aksoy)/, "").replace(/^[A-ZÇĞİÖŞÜ]{2}(?=[A-ZÇĞİÖŞÜ][a-zçğıöşü])/, "").replace(/\d+ gün kaldı/g, "<g>").replace(/\d+ proje · (Görüntüleyici|Düzenleyici)/g, "<p>") },
  { id: "D2", mock: "D2-ekip-tehlike", height: 1000, url: `/teams/local?id=${TEAM}&tab=admin&section=danger`, setup: (db) => team(db) },
  { id: "D3", mock: "D3-ekip-silme", height: 900, url: `/teams/local?id=${TEAM}&tab=admin&section=danger&sub=delete`, setup: (db) => team(db) },
  { id: "E3", mock: "E3-denetim-gunlugu", height: 1240, textIgnore: ["row", "rt", "av", "tag"], ignore: ["tag#4"], url: `/teams/local?id=${TEAM}&tab=admin&section=audit`, setup: (db) => team(db) },
  { id: "D4", mock: "D4-proje-ayarlari", height: 1120, url: projUrl, setup: (db) => teamProject(db), normalize: (x) => x.replace(/\d+ kişi/g, "<k>"), before: async (page) => { await page.getByRole("button", { name: "Bilgi" }).first().click(); await page.locator("[data-project-settings]").click(); await page.waitForTimeout(500); } },
  { id: "D5", mock: "D5-proje-erisimi", height: 1320, ignore: ["rt#1", "btn#1"], textIgnore: ["row"], url: projUrl, setup: (db) => teamProject(db), normalize: (x) => x.replace(/@[\w.]+( · Konuk)?( · \d+ gün kaldı)?/g, "@u").replace(/\d+ kişi/g, "<k>").replace(/^[A-ZÇĞİÖŞÜ]{1,3}(?=\S)/, "").replace(/(Düzenleyici|Görüntüleyici)$/, "<r>").replace(/Konuk · \d+ gün kaldı/, "<g>"), before: async (page) => { await page.getByRole("button", { name: "Bilgi" }).first().click(); await page.locator("[data-project-settings]").click(); await page.getByText("Proje erişimi").first().click(); await page.waitForTimeout(600); await page.locator("[data-sx-page] .btn.sel").nth(1).click(); await page.getByRole("radio", { name: "Görüntüleyici" }).click(); await page.getByRole("button", { name: "Seç" }).click(); await page.waitForTimeout(300); } },
  { id: "E2", mock: "E2-dosya-ayarlari", height: 1240, url: `${projUrl}&file=${FILE}`, setup: (db) => teamProject(db), before: async (page) => { await page.getByRole("button", { name: "Bilgi" }).first().click(); await page.waitForTimeout(500); } },
  { id: "F1", mock: "F1-space-ayarlari", height: 1180, url: SPACE_URL, setup: space, normalize: spaceNorm, before: async (page) => { await openMenu(page); await page.locator("[data-sx-page] #sp-ad").fill("Neon şehir karakterleri!"); } },
  { id: "F2", mock: "F2-space-kapak", height: 920, url: SPACE_URL, setup: space, normalize: spaceNorm, before: async (page) => { await openMenu(page); await page.getByRole("button", { name: "Değiştir" }).first().click(); await page.waitForTimeout(400); } },
  { id: "F3", mock: "F3-space-uyeler", height: 1300, url: `${SPACE_URL}&tab=members`, setup: space, normalize: (x) => x.replace(/@[\w.]+/g, "@u").replace(/^[A-ZÇĞİÖŞÜ]{1,3}(?=\S)/, "").replace(/(Alice|Sen|Bob|Carol|Can Yıldız|Selin Kara)/g, "<n>").replace(/(Düzenleyici|Görüntüleyici|Sahip)/g, "<r>").replace(/^<n>?.*$/, (m) => m), textIgnore: ["row", "rt", "av"] },
  { id: "F4", mock: "F4-space-uye-rol", height: 960, url: `${SPACE_URL}&tab=members`, setup: space, normalize: (x) => x.replace(/@[\w.]+/g, "@u"), textIgnore: ["rt", "hd", "av", "card", "row", "btn", "bar", "bt"], before: async (page) => { await page.locator("[data-sx-page] .btn.sel").first().click(); await page.waitForTimeout(400); }, ignore: ["hd#0"] },
  { id: "F5", mock: "F5-space-tehlike", height: 900, url: SPACE_URL, setup: space, before: async (page) => { await openMenu(page); await page.getByText("Arşivle veya sil").first().click(); await page.waitForTimeout(400); } },
  { id: "F6", mock: "F6-space-silme", height: 860, url: SPACE_URL, setup: space, normalize: (x) => x.replace(/\d+ görsel, \d+ prompt, \d+ not/, "<g>").replace(/\d+ üyelik ve \d+ bekleyen davet/, "<u>"), before: async (page) => { await openMenu(page); await page.getByText("Arşivle veya sil").first().click(); await page.getByRole("button", { name: "Space'i sil" }).first().click(); await page.waitForTimeout(500); } },
  { id: "D1", mock: "D1-uye-ayrinti", height: 1120, url: `/teams/local?id=${TEAM}&tab=members`, setup: (db) => team(db), normalize: (x) => x.replace(/[\d]+ projede rolü var/, "<p>").replace(/\d+ (\w+) (\d{4})$/, "<d>").replace(/Tasarım grubu|Tasarım/g, "<g>").replace(/\d+ \w+ \d{4}/, "<d>"), before: async (page) => { await page.locator("[data-member='can.yildiz']").click({ position: { x: 24, y: 24 } }); await page.waitForTimeout(500); await page.getByRole("radio", { name: /Yönetici/ }).first().click(); } },
  { id: "D6", mock: "D6-kanal-ayarlari", height: 1360, url: `/teams/local?id=${TEAM}&tab=chat&channel=${CH}&settings=1`, setup: (db) => teamChannels(db), normalize: (x) => x.replace(/Ekip sessizde( değil)?, proje sessizde( değil)?/, "<m>"), ignore: [] },
  { id: "E1", mock: "E1-ekip-sessize-alma", height: 1160, url: `/teams/local?id=${TEAM}&tab=chat&notify=1`, setup: (db) => teamChannels(db) },
];
