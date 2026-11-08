import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketConversations, hasUnreadInInbox, filterConversationsByQuery, isAfterClear, rollUpTeamChannels, unreadConversationCount, type TeamChannelFields } from "./conversation-lists.ts";

const conv = (id: string, over: Partial<Parameters<typeof bucketConversations>[0][number]> = {}) => ({
  id,
  myStatus: "accepted" as const,
  archivedAt: null,
  deletedAt: null,
  unreadCount: 0,
  lastMessageAt: "2026-01-01T00:00:00Z",
  ...over,
});
const ids = (list: { id: string }[]) => list.map((c) => c.id);

test("an archived chat leaves the inbox and shows only in the archive", () => {
  const { inbox, archived } = bucketConversations([conv("a"), conv("b", { archivedAt: "2026-02-01T00:00:00Z" })]);
  assert.deepEqual(ids(inbox), ["a"]);
  assert.deepEqual(ids(archived), ["b"]);
});

test("un-archiving (archivedAt back to null) returns the chat to the inbox", () => {
  const { inbox, archived } = bucketConversations([conv("b", { archivedAt: null })]);
  assert.deepEqual(ids(inbox), ["b"]);
  assert.deepEqual(ids(archived), []);
});

test("a chat deleted from the viewer's list appears nowhere, archived or not", () => {
  const { inbox, archived, requests } = bucketConversations([
    conv("a", { deletedAt: "2026-02-01T00:00:00Z" }),
    conv("b", { deletedAt: "2026-02-01T00:00:00Z", archivedAt: "2026-01-15T00:00:00Z" }),
    conv("c", { myStatus: "pending", deletedAt: "2026-02-01T00:00:00Z" }),
  ]);
  assert.deepEqual([ids(inbox), ids(archived), ids(requests)], [[], [], []]);
});

test("message requests stay in their own list and are never treated as archived", () => {
  const { requests, inbox, archived } = bucketConversations([conv("r", { myStatus: "pending", archivedAt: "2026-02-01T00:00:00Z" })]);
  assert.deepEqual(ids(requests), ["r"]);
  assert.deepEqual([ids(inbox), ids(archived)], [[], []]);
});

test("lists are newest-first", () => {
  const { inbox } = bucketConversations([
    conv("old", { lastMessageAt: "2026-01-01T00:00:00Z" }),
    conv("new", { lastMessageAt: "2026-03-01T00:00:00Z" }),
  ]);
  assert.deepEqual(ids(inbox), ["new", "old"]);
});

test("unread dot ignores archived and deleted chats", () => {
  assert.equal(hasUnreadInInbox([conv("a", { unreadCount: 3, archivedAt: "2026-02-01T00:00:00Z" })]), false);
  assert.equal(hasUnreadInInbox([conv("a", { unreadCount: 3, deletedAt: "2026-02-01T00:00:00Z" })]), false);
  assert.equal(hasUnreadInInbox([conv("a", { unreadCount: 3 })]), true);
  assert.equal(hasUnreadInInbox([conv("r", { unreadCount: 1, myStatus: "pending" })]), true);
});

test("isAfterClear: only messages strictly after the clear moment stay visible", () => {
  const cleared = "2026-02-01T12:00:00Z";
  assert.equal(isAfterClear("2026-02-01T11:59:59Z", cleared), false);
  assert.equal(isAfterClear("2026-02-01T12:00:00Z", cleared), false);
  assert.equal(isAfterClear("2026-02-01T12:00:01Z", cleared), true);
  assert.equal(isAfterClear("2020-01-01T00:00:00Z", null), true);
  assert.equal(isAfterClear("2020-01-01T00:00:00Z", undefined), true);
});

test("a muted group with unread messages does not light the header dot, but an unmuted one does", () => {
  assert.equal(hasUnreadInInbox([conv("g", { unreadCount: 4, mutedAt: "2026-02-01T00:00:00Z" })]), false);
  assert.equal(hasUnreadInInbox([conv("g", { unreadCount: 4, mutedAt: "2026-02-01T00:00:00Z" }), conv("h", { unreadCount: 1 })]), true);
});

test("unreadConversationCount counts chats (not messages) in the inbox and requests, skipping muted, archived and deleted ones", () => {
  assert.equal(unreadConversationCount([]), 0);
  assert.equal(
    unreadConversationCount([
      conv("a", { unreadCount: 7 }),
      conv("b", { unreadCount: 1, myStatus: "pending" }),
      conv("c", { unreadCount: 0 }),
      conv("d", { unreadCount: 4, mutedAt: "2026-02-01T00:00:00Z" }),
      conv("e", { unreadCount: 4, archivedAt: "2026-02-01T00:00:00Z" }),
      conv("f", { unreadCount: 4, deletedAt: "2026-02-01T00:00:00Z" }),
    ]),
    2,
  );
});

test("filterConversationsByQuery matches group names, people's names/usernames and the last message, ignoring case", () => {
  const person = (displayName: string, username: string, lastMessage: string) => ({ group: null, participants: [{ displayName, username }], lastMessage });
  const list = [
    person("Ayşe Kaya", "ayse", "Midjourney denedim"),
    person("Mert Demir", "mert_d", "workflow için sağ ol"),
    { group: { name: "Görsel Atölye" }, participants: [], lastMessage: "tema açıldı" },
  ];
  assert.equal(filterConversationsByQuery(list, "").length, 3);
  assert.equal(filterConversationsByQuery(list, "   ").length, 3, "blank query keeps everything");
  assert.deepEqual(filterConversationsByQuery(list, "AYŞE").map((c) => c.lastMessage), ["Midjourney denedim"]);
  assert.deepEqual(filterConversationsByQuery(list, "mert_d").length, 1, "username");
  assert.deepEqual(filterConversationsByQuery(list, "atölye").length, 1, "group name");
  assert.deepEqual(filterConversationsByQuery(list, "workflow").length, 1, "last message");
  assert.equal(filterConversationsByQuery(list, "yok böyle").length, 0);
});

// Ekip kanalları Mesajlar listesinde ekip başına TEK satırdır (Yön A, docs/history/353-*).
const channel = (id: string, teamId: string, over: Record<string, unknown> = {}) => ({
  ...conv(id),
  lastMessage: "",
  pinnedAt: null as string | null,
  mutedAt: null as string | null,
  group: { team: { id: teamId, name: `Ekip ${teamId}`, channelName: id } },
  ...over,
});

test("a team's channels collapse into one row; other chats stay as they are", () => {
  const rolled = rollUpTeamChannels<TeamChannelFields & Record<string, unknown>>([channel("genel", "t1"), channel("tasarim", "t1"), channel("genel2", "t2"), { ...conv("dm"), lastMessage: "", pinnedAt: null, mutedAt: null, group: undefined }]);
  assert.equal(rolled.length, 3);
  assert.equal(rolled.find((c) => c.group?.team?.id === "t1")?.teamRollup?.channelCount, 2);
  assert.equal(rolled.find((c) => c.id === "dm")?.teamRollup, undefined);
});

test("the roll-up opens the newest channel with unread messages and sums their counts", () => {
  const rolled = rollUpTeamChannels<TeamChannelFields & Record<string, unknown>>([
    channel("genel", "t1", { lastMessageAt: "2026-03-01T00:00:00Z" }),
    channel("tasarim", "t1", { lastMessageAt: "2026-02-01T00:00:00Z", unreadCount: 3 }),
    channel("sunum", "t1", { lastMessageAt: "2026-01-15T00:00:00Z", unreadCount: 2 }),
  ]);
  assert.equal(rolled.length, 1);
  assert.equal(rolled[0].id, "tasarim");
  assert.equal(rolled[0].unreadCount, 5);
  assert.equal(rolled[0].lastMessageAt, "2026-03-01T00:00:00Z");
  assert.deepEqual(rolled[0].teamRollup, { channelCount: 3, unreadChannelCount: 2, channelName: "tasarim" });
});

test("a muted channel's unread messages do not count toward the team row", () => {
  const rolled = rollUpTeamChannels<TeamChannelFields & Record<string, unknown>>([channel("genel", "t1", { unreadCount: 4, mutedAt: "2026-02-01T00:00:00Z" }), channel("tasarim", "t1")]);
  assert.equal(rolled[0].unreadCount, 0);
  assert.equal(rolled[0].teamRollup?.unreadChannelCount, 0);
});

test("with nothing unread the row opens the newest channel; pinned teams sort first", () => {
  const rolled = rollUpTeamChannels<TeamChannelFields & Record<string, unknown>>([
    channel("eski", "t1", { lastMessageAt: "2026-01-01T00:00:00Z" }),
    channel("yeni", "t1", { lastMessageAt: "2026-02-01T00:00:00Z" }),
    channel("baska", "t2", { lastMessageAt: "2026-03-01T00:00:00Z" }),
  ]);
  assert.equal(rolled.find((c) => c.group?.team?.id === "t1")?.id, "yeni");
  const pinned = rollUpTeamChannels<TeamChannelFields & Record<string, unknown>>([channel("a", "t1", { pinnedAt: "2026-01-01T00:00:00Z", lastMessageAt: "2025-01-01T00:00:00Z" }), channel("b", "t2", { lastMessageAt: "2026-03-01T00:00:00Z" })]);
  assert.equal(pinned[0].group?.team?.id, "t1");
});
