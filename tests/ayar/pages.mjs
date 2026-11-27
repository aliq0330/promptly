// Sayfa kayıtları: her kayıt = bir mockup panosu + gerçek sayfanın adresi + sahte veri (tests/messaging-ui/mock*.mjs).
import { ME, U } from "../messaging-ui/mock.mjs";
import { setupCommunities } from "../messaging-ui/mock-communities.mjs";
import { setupRooms } from "../messaging-ui/mock-rooms.mjs";

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
];
