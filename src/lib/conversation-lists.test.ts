import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketConversations, hasUnreadInInbox, filterConversationsByQuery, isAfterClear, unreadConversationCount } from "./conversation-lists.ts";

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
