// Sayfa kayıtları: her kayıt = bir mockup panosu + gerçek sayfanın adresi + sahte veri (tests/messaging-ui/mock*.mjs).
import { ME, U } from "../messaging-ui/mock.mjs";
import { setupCommunities } from "../messaging-ui/mock-communities.mjs";
import { setupRooms } from "../messaging-ui/mock-rooms.mjs";

const C1 = "e0000000-0000-4000-8000-0000000000a1";

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
  db.addRoom(C1, { name: "Duyurular", posting_policy: "admins", section: "Genel" });
  db.addRoom(C1, { name: "Prompt ipuçları", section: "Atölye" });
  db.addRoom(C1, { name: "Yardım", section: "Atölye" });
  db.addRoom(C1, { name: "Yönetim", read_policy: "staff", section: "Özel" });
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
];
