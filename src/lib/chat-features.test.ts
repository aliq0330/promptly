import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceReadAt,
  canPinMessages,
  formatTypingText,
  nextReadAck,
  normalizeSearchTerm,
  readStateFor,
  shouldSendTyping,
  snippetAround,
  splitHighlight,
  stepIndex,
  TYPING_EXPIRE_MS,
  TYPING_MAX_TRACKED,
  TYPING_SEND_INTERVAL_MS,
  TypingTracker,
  typingTopic,
} from "./chat-features.ts";
import { DEFAULT_ROLE_PERMISSIONS } from "./chat-groups.ts";
import type { ChatGroup, GroupRole } from "../types/index.ts";

const T0 = "2026-10-01T10:00:00.000Z";
const T1 = "2026-10-01T10:05:00.000Z";
const T2 = "2026-10-01T10:10:00.000Z";

// ---- okundu ----
test("readStateFor: karşı tarafın imleci mesaja ulaştıysa okundu, yoksa gönderildi", () => {
  assert.equal(readStateFor(T1, null), "sent");
  assert.equal(readStateFor(T1, T0), "sent");
  assert.equal(readStateFor(T1, T1), "read");
  assert.equal(readStateFor(T1, T2), "read");
  assert.equal(readStateFor(T1, "geçersiz"), "sent");
});

test("advanceReadAt: imleç yalnız ileri gider", () => {
  assert.equal(advanceReadAt(null, T1), T1);
  assert.equal(advanceReadAt(T1, T0), T1);
  assert.equal(advanceReadAt(T1, T2), T2);
  assert.equal(advanceReadAt(T1, null), T1);
  assert.equal(advanceReadAt(T1, T1), T1);
});

test("nextReadAck: yalnız başkalarının mesajları sayılır; aynı mesaj için ikinci bildirim yok", () => {
  const msgs = [
    { senderId: "me", createdAt: T2 },
    { senderId: "ali", createdAt: T1 },
    { senderId: "ali", createdAt: T0 },
  ];
  assert.equal(nextReadAck(msgs, "me", null), T1);
  assert.equal(nextReadAck(msgs, "me", T1), null);
  assert.equal(nextReadAck(msgs, "me", T2), null);
  assert.equal(nextReadAck(msgs, "me", T0), T1);
  assert.equal(nextReadAck([{ senderId: "me", createdAt: T2 }], "me", null), null);
  assert.equal(nextReadAck([], "me", null), null);
});

// ---- yazıyor ----
test("shouldSendTyping: sinyaller kısıtlanır", () => {
  assert.equal(shouldSendTyping(null, 1000), true);
  assert.equal(shouldSendTyping(1000, 1000 + TYPING_SEND_INTERVAL_MS - 1), false);
  assert.equal(shouldSendTyping(1000, 1000 + TYPING_SEND_INTERVAL_MS), true);
});

test("TypingTracker: sinyal gelir, yenilenir, süre dolunca sönmeden kalmaz", () => {
  const tracker = new TypingTracker();
  tracker.receive("ali", 0);
  tracker.receive("veli", 1000);
  assert.deepEqual(tracker.active(2000), ["ali", "veli"]);
  assert.equal(tracker.nextExpiryIn(2000), TYPING_EXPIRE_MS - 2000);
  tracker.receive("ali", 5000);
  assert.deepEqual(tracker.active(TYPING_EXPIRE_MS + 1500), ["ali"]);
  assert.deepEqual(tracker.active(5000 + TYPING_EXPIRE_MS), []);
  assert.equal(tracker.nextExpiryIn(5000 + TYPING_EXPIRE_MS), null);
});

test("TypingTracker: durdurma, temizleme ve üst sınır", () => {
  const tracker = new TypingTracker();
  tracker.receive("ali", 0);
  tracker.stop("ali");
  assert.deepEqual(tracker.active(1), []);
  for (let i = 0; i < TYPING_MAX_TRACKED + 5; i += 1) tracker.receive(`u${i}`, i);
  assert.equal(tracker.active(100).length, TYPING_MAX_TRACKED);
  tracker.clear();
  assert.deepEqual(tracker.active(100), []);
});

test("formatTypingText: birebir, tek kişi, iki kişi, çok kişi, adı çözülemeyen", () => {
  const t = (key: string, p?: Record<string, string | number>) => `${key}:${JSON.stringify(p ?? {})}`;
  assert.equal(formatTypingText([], 0, true, t), "");
  assert.equal(formatTypingText([], 1, false, t), 'chat.typing.direct:{}');
  assert.equal(formatTypingText(["Ali"], 0, true, t), 'chat.typing.one:{"name":"Ali"}');
  assert.equal(formatTypingText(["Ali", "Veli"], 0, true, t), 'chat.typing.two:{"a":"Ali","b":"Veli"}');
  assert.equal(formatTypingText(["Ali", "Veli", "Can"], 0, true, t), 'chat.typing.many:{"name":"Ali","count":2}');
  assert.equal(formatTypingText(["Ali"], 2, true, t), 'chat.typing.many:{"name":"Ali","count":2}');
  assert.equal(formatTypingText([], 3, true, t), 'chat.typing.someone:{"count":3}');
});

test("typingTopic: yalnız konuşma kimliği", () => {
  assert.equal(typingTopic("abc"), "typing:abc");
});

// ---- sabitleme ----
function group(role: GroupRole, over: Partial<ChatGroup> = {}): ChatGroup {
  return {
    id: "g", name: "G", description: null, avatarUrl: null, coverUrl: null, coverColor: null, visibility: "private", postingPolicy: "members", memberLimit: 10, memberCount: 3,
    pendingRequestCount: 0, historyVisible: true, membersCanPin: false, rolePermissions: DEFAULT_ROLE_PERMISSIONS, createdAt: T0, myRole: role,
    category: "general", feedPolicy: "members", rules: null, rulesVersion: 1, rulesRequired: false, closedAt: null, postCount: 0, origin: "native", ...over,
  };
}

test("canPinMessages: birebirde herkes; grupta owner/admin/moderatör varsayılan, üye yalnız owner izin verince", () => {
  assert.equal(canPinMessages(null), true);
  assert.equal(canPinMessages(group("owner")), true);
  assert.equal(canPinMessages(group("admin")), true);
  assert.equal(canPinMessages(group("moderator")), true);
  assert.equal(canPinMessages(group("member")), false);
  assert.equal(canPinMessages(group("member", { membersCanPin: true })), true);
  const noPin = { admin: { ...DEFAULT_ROLE_PERMISSIONS.admin }, moderator: { ...DEFAULT_ROLE_PERMISSIONS.moderator, pin_messages: false } };
  assert.equal(canPinMessages(group("moderator", { rolePermissions: noPin })), false);
  assert.equal(canPinMessages(group("owner", { rolePermissions: noPin })), true);
});

// ---- arama ----
test("normalizeSearchTerm: 2–100 karakter", () => {
  assert.equal(normalizeSearchTerm(" a "), null);
  assert.equal(normalizeSearchTerm("  ab  "), "ab");
  assert.equal(normalizeSearchTerm("x".repeat(100)), "x".repeat(100));
  assert.equal(normalizeSearchTerm("x".repeat(101)), null);
  assert.equal(normalizeSearchTerm("😀😀"), "😀😀");
});

test("splitHighlight: büyük/küçük harfe duyarsız, regex kullanmaz, İ/ı bozulmaz", () => {
  assert.deepEqual(splitHighlight("Merhaba merhaba", "MERHABA"), [
    { text: "Merhaba", match: true },
    { text: " ", match: false },
    { text: "merhaba", match: true },
  ]);
  assert.deepEqual(splitHighlight("a.*b", ".*"), [
    { text: "a", match: false },
    { text: ".*", match: true },
    { text: "b", match: false },
  ]);
  const parts = splitHighlight("İstanbul güzel", "güzel");
  assert.equal(parts.map((p) => p.text).join(""), "İstanbul güzel");
  assert.equal(parts.find((p) => p.match)?.text, "güzel");
  assert.deepEqual(splitHighlight("abc", ""), [{ text: "abc", match: false }]);
});

test("snippetAround ve stepIndex", () => {
  const long = `${"a".repeat(200)}HEDEF${"b".repeat(200)}`;
  const snippet = snippetAround(long, "hedef");
  assert.ok(snippet.includes("HEDEF") && snippet.startsWith("…") && snippet.endsWith("…") && snippet.length < 200);
  assert.equal(snippetAround("kısa", "kı"), "kısa");
  assert.equal(stepIndex(-1, 3, 1), 0);
  assert.equal(stepIndex(-1, 3, -1), 2);
  assert.equal(stepIndex(2, 3, 1), 0);
  assert.equal(stepIndex(0, 3, -1), 2);
  assert.equal(stepIndex(0, 0, 1), -1);
});
