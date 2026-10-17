import test from "node:test";
import assert from "node:assert/strict";
import {
  accessibleTabs,
  VISIBILITY_OPTIONS,
  visibilityTraits,
  canModeratePost,
  canRsvp,
  canSeeManageTab,
  canSharePost,
  CATEGORY_LABEL_KEYS,
  COMMUNITY_CATEGORIES,
  communityChatHref,
  communityHref,
  effectiveNotifyLevel,
  eventDateParts,
  eventPhase,
  isShareableContent,
  isoToZonedLocal,
  isTemporarilyMuted,
  muteUntilIso,
  normalizeCategory,
  normalizeFeedPolicy,
  normalizeVisibility,
  normalizeNotifyLevel,
  parseCommunityStats,
  resolveCommunityView,
  membersSections,
  manageSections,
  timezoneOptions,
  validateEventInput,
  zonedLocalToIso,
} from "./communities.ts";
import { DEFAULT_ROLE_PERMISSIONS } from "./chat-groups.ts";

const NOW = new Date("2026-10-15T12:00:00Z");

test("kategori: bilinmeyen değer 'general'e düşer, her kategorinin etiket anahtarı var", () => {
  assert.equal(normalizeCategory("image"), "image");
  assert.equal(normalizeCategory("hack"), "general");
  assert.equal(normalizeCategory(null), "general");
  for (const category of COMMUNITY_CATEGORIES) assert.ok(CATEGORY_LABEL_KEYS[category]);
  assert.equal(normalizeFeedPolicy("admins"), "admins");
  assert.equal(normalizeFeedPolicy("x"), "members");
});

test("sekmeler: üye olmayan kapalı toplulukta sekme yok; açıkta yalnız okuma sekmeleri; üye Akış ilk olmak üzere beş sekme alır", () => {
  assert.deepEqual(accessibleTabs({ role: null, visibility: "private" }), []);
  assert.deepEqual(accessibleTabs({ role: null, visibility: "public" }), ["feed", "events", "about"]);
  const member = accessibleTabs({ role: "member", visibility: "private" });
  assert.deepEqual(member, ["feed", "events", "members", "about"]);
  assert.ok(!member.includes("manage"));
  assert.ok(accessibleTabs({ role: "owner", visibility: "private" }).includes("manage"));
  assert.ok(accessibleTabs({ role: "moderator", visibility: "private" }).includes("manage"));
});

test("sekmeler: yetkisi tamamen alınan moderatör Yönet sekmesini görmez", () => {
  const none = structuredClone(DEFAULT_ROLE_PERMISSIONS);
  for (const key of Object.keys(none.moderator) as (keyof typeof none.moderator)[]) none.moderator[key] = false;
  assert.equal(canSeeManageTab("moderator", none), false);
  assert.equal(canSeeManageTab("owner", none), true);
  assert.equal(canSeeManageTab("member", DEFAULT_ROLE_PERMISSIONS), false);
  assert.equal(canSeeManageTab(null, DEFAULT_ROLE_PERMISSIONS), false);
});

test("sekmeler: yalnız kişi yönetimi yetkisi olan moderatör boş bir Yönet sekmesi görmez (istekler Üyeler'dedir)", () => {
  const onlyPeople = structuredClone(DEFAULT_ROLE_PERMISSIONS);
  for (const key of Object.keys(onlyPeople.moderator) as (keyof typeof onlyPeople.moderator)[]) onlyPeople.moderator[key] = false;
  onlyPeople.moderator.manage_requests = true;
  onlyPeople.moderator.manage_invites = true;
  assert.equal(canSeeManageTab("moderator", onlyPeople), false);
  assert.deepEqual(membersSections("moderator", onlyPeople), ["list", "requests", "invites"]);
});

test("Üyeler bölümleri yeteneğe göre: üye yalnız liste; varsayılan moderatör liste+istekler; owner hepsi", () => {
  assert.deepEqual(membersSections("member", DEFAULT_ROLE_PERMISSIONS), ["list"]);
  assert.deepEqual(membersSections(null, DEFAULT_ROLE_PERMISSIONS), ["list"]);
  assert.deepEqual(membersSections("moderator", DEFAULT_ROLE_PERMISSIONS), ["list", "requests"]);
  assert.deepEqual(membersSections("admin", DEFAULT_ROLE_PERMISSIONS), ["list", "requests", "invites"]);
  assert.deepEqual(membersSections("owner", DEFAULT_ROLE_PERMISSIONS), ["list", "requests", "invites"]);
  const revoked = structuredClone(DEFAULT_ROLE_PERMISSIONS);
  revoked.moderator.manage_requests = false;
  assert.deepEqual(membersSections("moderator", revoked), ["list"]);
});

test("Yönet bölümleri yeteneğe göre: istek/davet artık burada değil; geçmiş yalnız owner/admin", () => {
  assert.deepEqual(manageSections("owner", DEFAULT_ROLE_PERMISSIONS), ["stats", "settings", "announcements", "moderation", "history"]);
  assert.deepEqual(manageSections("moderator", DEFAULT_ROLE_PERMISSIONS), ["moderation"]);
  assert.deepEqual(manageSections("member", DEFAULT_ROLE_PERMISSIONS), []);
  for (const role of ["owner", "admin", "moderator"] as const) assert.ok(!(manageSections(role, DEFAULT_ROLE_PERMISSIONS) as string[]).includes("requests"));
});

test("görünüm çözümü: geçersiz/izinsiz sekme ilk izinli sekmeye (Akış) düşer", () => {
  const member = accessibleTabs({ role: "member", visibility: "public" });
  assert.equal(resolveCommunityView("members", null, member).view?.tab, "members");
  assert.equal(resolveCommunityView("manage", null, member).view?.tab, "feed");
  assert.equal(resolveCommunityView("nonsense", null, member).view?.tab, "feed");
  assert.equal(resolveCommunityView(null, null, member).view?.tab, "feed");
  assert.equal(resolveCommunityView("members", null, accessibleTabs({ role: null, visibility: "public" })).view?.tab, "feed");
  assert.equal(resolveCommunityView("feed", null, []).view, null);
});

test("görünüm çözümü: eski adresler çalışır — overview→Akış, chat→sohbete yönlen, manage&section=requests|invites→Üyeler", () => {
  const owner = accessibleTabs({ role: "owner", visibility: "public" });
  assert.deepEqual(resolveCommunityView("overview", null, owner), { view: { tab: "feed", section: null }, toChat: false });
  assert.equal(resolveCommunityView("chat", null, owner).toChat, true);
  assert.deepEqual(resolveCommunityView("manage", "requests", owner).view, { tab: "members", section: "requests" });
  assert.deepEqual(resolveCommunityView("manage", "invites", owner).view, { tab: "members", section: "invites" });
  assert.deepEqual(resolveCommunityView("manage", "settings", owner).view, { tab: "manage", section: "settings" });
  // Üye olmayan ziyaretçi sohbete yönlendirilmez; eski istek bağlantısı yetkisiz kişiyi Akış'a düşürür, bölüm taşınmaz.
  assert.equal(resolveCommunityView("chat", null, accessibleTabs({ role: null, visibility: "public" })).toChat, false);
  const plainMember = accessibleTabs({ role: "member", visibility: "public" });
  assert.deepEqual(resolveCommunityView("manage", "requests", plainMember).view, { tab: "members", section: "requests" });
});

test("gönderi yetkisi: üye paylaşır; feed_policy=admins ise yalnız kadro; kapalı toplulukta kimse", () => {
  assert.equal(canSharePost("member", "members", false), true);
  assert.equal(canSharePost("member", "admins", false), false);
  assert.equal(canSharePost("moderator", "admins", false), true);
  assert.equal(canSharePost("owner", "members", true), false);
  assert.equal(canSharePost(null, "members", false), false);
});

test("moderasyon: rütbe kuralı — moderatör yalnız üyeninkini, admin moderatörünkini kaldırır; yazar kendi gönderisini", () => {
  const p = DEFAULT_ROLE_PERMISSIONS;
  assert.equal(canModeratePost("moderator", "member", false, p), true);
  assert.equal(canModeratePost("moderator", "admin", false, p), false);
  assert.equal(canModeratePost("moderator", "moderator", false, p), false);
  assert.equal(canModeratePost("admin", "moderator", false, p), true);
  assert.equal(canModeratePost("admin", "owner", false, p), false);
  assert.equal(canModeratePost("owner", "admin", false, p), true);
  assert.equal(canModeratePost("owner", "owner", true, p), true);
  assert.equal(canModeratePost("member", "member", false, p), false);
  // Üyeliği bitmiş yazar (rol null) en düşük rütbedir.
  assert.equal(canModeratePost("moderator", null, false, p), true);
  const revoked = structuredClone(p);
  revoked.moderator.moderate_posts = false;
  assert.equal(canModeratePost("moderator", "member", false, revoked), false);
});

test("görünürlük kuralı: yalnız yayında + herkese açık içerik topluluğa paylaşılabilir", () => {
  assert.equal(isShareableContent({ visibility: "public", status: "published" }), true);
  assert.equal(isShareableContent({ visibility: "public", isDraft: false }), true);
  assert.equal(isShareableContent({ visibility: "private", status: "published" }), false);
  assert.equal(isShareableContent({ visibility: "public", status: "draft" }), false);
  assert.equal(isShareableContent({ visibility: "public", isDraft: true }), false);
  assert.equal(isShareableContent({}), false);
});

test("bildirim tercihi: süreli sessize alma etkin düzeyi 'none' yapar ve süre dolunca geri döner", () => {
  assert.equal(normalizeNotifyLevel("important"), "important");
  assert.equal(normalizeNotifyLevel("hepsi"), "all");
  const until = muteUntilIso(8, NOW);
  assert.equal(effectiveNotifyLevel("all", until, NOW), "none");
  assert.equal(isTemporarilyMuted(until, NOW), true);
  const later = new Date(NOW.getTime() + 9 * 3_600_000);
  assert.equal(effectiveNotifyLevel("important", until, later), "important");
  assert.equal(isTemporarilyMuted(until, later), false);
  assert.equal(effectiveNotifyLevel("important", null, NOW), "important");
});

test("saat dilimi: duvar saati ↔ ISO an dönüşümü (İstanbul UTC+3, New York yaz/kış saati)", () => {
  assert.equal(zonedLocalToIso("2026-10-20T19:30", "Europe/Istanbul"), "2026-10-20T16:30:00.000Z");
  assert.equal(zonedLocalToIso("2026-07-01T12:00", "America/New_York"), "2026-07-01T16:00:00.000Z");
  assert.equal(zonedLocalToIso("2026-12-01T12:00", "America/New_York"), "2026-12-01T17:00:00.000Z");
  assert.equal(zonedLocalToIso("2026-10-20T19:30", "UTC"), "2026-10-20T19:30:00.000Z");
  assert.equal(isoToZonedLocal("2026-10-20T16:30:00.000Z", "Europe/Istanbul"), "2026-10-20T19:30");
  assert.equal(isoToZonedLocal("2026-07-01T16:00:00.000Z", "America/New_York"), "2026-07-01T12:00");
  // gidiş-dönüş
  for (const tz of ["Asia/Tokyo", "Australia/Sydney", "America/Los_Angeles", "Europe/London"]) {
    const iso = zonedLocalToIso("2026-03-29T10:15", tz);
    assert.ok(iso);
    assert.equal(isoToZonedLocal(iso as string, tz), "2026-03-29T10:15");
  }
  assert.equal(zonedLocalToIso("bozuk", "UTC"), null);
  assert.equal(zonedLocalToIso("2026-10-20T19:30", "Mars/Olympus"), null);
  assert.ok(timezoneOptions("Asia/Tokyo").includes("Asia/Tokyo"));
});

test("etkinlik evresi: yaklaşan / canlı / bitmiş / iptal; yalnız yaklaşan ve canlıya cevap verilir", () => {
  const base = { status: "scheduled" as const, startsAt: "2026-10-15T14:00:00Z", endsAt: "2026-10-15T16:00:00Z" };
  assert.equal(eventPhase(base, NOW), "upcoming");
  assert.equal(eventPhase(base, new Date("2026-10-15T15:00:00Z")), "live");
  assert.equal(eventPhase(base, new Date("2026-10-15T16:00:00Z")), "past");
  assert.equal(eventPhase({ ...base, status: "cancelled" }, NOW), "cancelled");
  // bitiş yok → 3 saat
  assert.equal(eventPhase({ status: "scheduled", startsAt: "2026-10-15T10:00:00Z", endsAt: null }, NOW), "live");
  assert.equal(eventPhase({ status: "scheduled", startsAt: "2026-10-15T08:00:00Z", endsAt: null }, NOW), "past");
  assert.equal(canRsvp("upcoming"), true);
  assert.equal(canRsvp("live"), true);
  assert.equal(canRsvp("past"), false);
  assert.equal(canRsvp("cancelled"), false);
});

test("etkinlik doğrulaması: başlık, zaman, saat dilimi, bağlantı", () => {
  const good = {
    title: "Canlı yayın", description: "", startsAtIso: "2026-10-20T16:30:00.000Z", endsAtIso: "2026-10-20T18:00:00.000Z",
    timezone: "Europe/Istanbul", location: "", onlineUrl: "https://example.com/x", mustBeFuture: true, now: NOW,
  };
  assert.deepEqual(validateEventInput(good), []);
  assert.deepEqual(validateEventInput({ ...good, title: "  " }), ["title"]);
  assert.deepEqual(validateEventInput({ ...good, startsAtIso: null }), ["time"]);
  assert.deepEqual(validateEventInput({ ...good, startsAtIso: "2026-10-14T10:00:00.000Z" }), ["time"]);
  assert.deepEqual(validateEventInput({ ...good, startsAtIso: "2026-10-14T10:00:00.000Z", mustBeFuture: false, endsAtIso: null }), []);
  assert.deepEqual(validateEventInput({ ...good, endsAtIso: "2026-10-20T16:00:00.000Z" }), ["time"]);
  assert.deepEqual(validateEventInput({ ...good, timezone: "Mars/Olympus" }), ["timezone"]);
  assert.deepEqual(validateEventInput({ ...good, onlineUrl: "javascript:alert(1)" }), ["url"]);
  assert.deepEqual(validateEventInput({ ...good, onlineUrl: "ftp://x.test" }), ["url"]);
  assert.deepEqual(validateEventInput({ ...good, location: "x".repeat(201) }), ["location"]);
});

test("istatistik ayrıştırma: eksik/bozuk alan 0'a düşer, seri korunur", () => {
  assert.equal(parseCommunityStats(null), null);
  const empty = parseCommunityStats({});
  assert.ok(empty);
  assert.equal(empty.members.total, 0);
  assert.deepEqual(empty.series, []);
  const full = parseCommunityStats({
    days: 30, members: { total: 12, joined: 5, left: 2, net: 3 }, posts: { total: 9, in_period: 4, authors_in_period: 3 },
    engagement: { likes: 7, comments: "x" }, events: { total: 2, upcoming: 1, in_period: 1, going_in_period: 6, going_upcoming: 3 },
    chat: { messages_in_period: 120, active_senders_in_period: 8 }, queue: { pending_requests: 1, pending_invitations: 2, open_reports: 0 },
    series: [{ day: "2026-10-14", joined: 1, posts: 2, messages: 3 }, { nope: true }],
  });
  assert.ok(full);
  assert.equal(full.members.net, 3);
  assert.equal(full.engagement.comments, 0);
  assert.equal(full.chat.messagesInPeriod, 120);
  assert.equal(full.queue.openReports, 0);
  assert.equal(full.series.length, 1);
});

test("yollar: topluluk ve sohbet adresleri", () => {
  assert.equal(communityHref("abc"), "/communities/local?id=abc");
  assert.equal(communityHref("abc", "feed"), "/communities/local?id=abc&tab=feed");
  assert.equal(communityHref("abc", "members", "requests"), "/communities/local?id=abc&tab=members&section=requests");
  assert.equal(communityHref("abc", undefined, "requests"), "/communities/local?id=abc");
  assert.equal(communityChatHref("abc"), "/messages/local?id=abc");
});

test("görünürlük: bilinmeyen değer en kapalı düzeye düşer; üç düzey sıralıdır", () => {
  assert.equal(normalizeVisibility("public"), "public");
  assert.equal(normalizeVisibility("restricted"), "restricted");
  assert.equal(normalizeVisibility("private"), "private");
  assert.equal(normalizeVisibility("secret"), "private");
  assert.equal(normalizeVisibility(null), "private");
  assert.deepEqual([...VISIBILITY_OPTIONS], ["public", "restricted", "private"]);
});

test("görünürlük: Keşfet/arama/içerik/katılım davranışı üç düzeyde", () => {
  assert.deepEqual(visibilityTraits("public"), { inDiscover: true, searchable: true, publicContent: true, joinMode: "join" });
  assert.deepEqual(visibilityTraits("restricted"), { inDiscover: false, searchable: true, publicContent: false, joinMode: "request" });
  assert.deepEqual(visibilityTraits("private"), { inDiscover: false, searchable: false, publicContent: false, joinMode: "invite" });
});

test("sekmeler: kapalı (restricted) toplulukta üye olmayan hiçbir sekme görmez; üye tam sekme alır", () => {
  assert.deepEqual(accessibleTabs({ role: null, visibility: "restricted" }), []);
  assert.deepEqual(accessibleTabs({ role: "member", visibility: "restricted" }), ["feed", "events", "members", "about"]);
});

test("eventDateParts: month + day in the event's own time zone", () => {
  // 23:30 UTC on Oct 23 is already Oct 24 in Istanbul.
  assert.deepEqual(eventDateParts("2026-10-23T23:30:00Z", "Europe/Istanbul", "tr"), { month: "EKİ", day: "24" });
  assert.deepEqual(eventDateParts("2026-10-23T23:30:00Z", "America/New_York", "en"), { month: "OCT", day: "23" });
});
