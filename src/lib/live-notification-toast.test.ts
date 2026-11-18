import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_TOAST_MAX,
  addLiveToast,
  dropLiveToast,
  leaveLiveToast,
  liveEntries,
  liveToastAction,
  liveToastKey,
  liveToastReplyHref,
  liveToastSkipReason,
  mergeToastCard,
  parseIncomingRow,
  parseLiveToastPref,
  toastCardFromRow,
  type IncomingNotificationRow,
  type LiveToastContext,
} from "./live-notification-toast.ts";
import { notificationGroupKey } from "./notification-mirror.ts";
import type { UserProfile } from "../types/index.ts";

const actor = (id: string): UserProfile => ({ id, username: id, displayName: id.toUpperCase() }) as unknown as UserProfile;
const row = (over: Partial<IncomingNotificationRow> = {}): IncomingNotificationRow => ({
  id: "n1",
  type: "like",
  actorId: "a1",
  message: 'Paylaşımını beğendi: "Gece"',
  targetHref: "/prompts/local?id=p1&hl=post:p1",
  createdAt: "2026-11-18T10:00:00.000Z",
  reaction: "love",
  dedupeKey: null,
  snoozedUntil: null,
  isRead: false,
  ...over,
});
const ctx = (over: Partial<LiveToastContext> = {}): LiveToastContext => ({
  pathname: "/",
  search: "",
  visible: true,
  composeOpen: false,
  storyOpen: false,
  popoverOpen: false,
  dockConversationId: null,
  ...over,
});

test("tercih: yazılmamışsa açık, yalnız 'off' kapatır", () => {
  assert.equal(parseLiveToastPref(null), true);
  assert.equal(parseLiveToastPref(undefined), true);
  assert.equal(parseLiveToastPref(""), true);
  assert.equal(parseLiveToastPref("on"), true);
  assert.equal(parseLiveToastPref("off"), false);
});

test("Realtime satırı: eksik/bozuk alan reddedilir, sütun adları eşlenir", () => {
  assert.equal(parseIncomingRow(null), null);
  assert.equal(parseIncomingRow({ id: "x" }), null);
  const parsed = parseIncomingRow({ id: "n1", type: "comment", message: "m", created_at: "2026-11-18T10:00:00Z", target_href: "/a", actor_id: "u1", is_read: false, reaction: null, dedupe_key: "k", snoozed_until: null });
  assert.deepEqual(parsed, { id: "n1", type: "comment", actorId: "u1", message: "m", targetHref: "/a", createdAt: "2026-11-18T10:00:00Z", reaction: null, dedupeKey: "k", snoozedUntil: null, isRead: false });
});

test("gösterilmeme nedenleri", () => {
  assert.equal(liveToastSkipReason(row(), ctx()), null);
  assert.equal(liveToastSkipReason(row({ isRead: true }), ctx()), "read");
  assert.equal(liveToastSkipReason(row({ snoozedUntil: "2999-01-01T00:00:00Z" }), ctx()), "snoozed");
  assert.equal(liveToastSkipReason(row({ snoozedUntil: "2000-01-01T00:00:00Z" }), ctx()), null);
  assert.equal(liveToastSkipReason(row({ type: "system", dedupeKey: "weekly:2026-46" }), ctx()), "digest");
  assert.equal(liveToastSkipReason(row({ type: "system", dedupeKey: "milestone:p1:100" }), ctx()), null);
  assert.equal(liveToastSkipReason(row(), ctx({ visible: false })), "hidden");
  assert.equal(liveToastSkipReason(row(), ctx({ composeOpen: true })), "busy");
  assert.equal(liveToastSkipReason(row(), ctx({ storyOpen: true })), "busy");
  assert.equal(liveToastSkipReason(row(), ctx({ popoverOpen: true })), "panel");
  assert.equal(liveToastSkipReason(row(), ctx({ pathname: "/notifications" })), "inbox");
  assert.equal(liveToastSkipReason(row(), ctx({ pathname: "/notifications/" })), "inbox");
  assert.equal(liveToastSkipReason(row(), ctx({ pathname: "/notifications-x" })), null);
});

test("mesaj: yalnız o sohbetin içindeyken (sayfa ya da dock) kart çıkmaz", () => {
  const msg = row({ type: "message", targetHref: "/messages/local?id=c1" });
  assert.equal(liveToastSkipReason(msg, ctx({ pathname: "/messages/local", search: "?id=c1" })), "in-chat");
  assert.equal(liveToastSkipReason(msg, ctx({ pathname: "/messages/local", search: "?id=c2" })), null);
  assert.equal(liveToastSkipReason(msg, ctx({ dockConversationId: "c1" })), "in-chat");
  assert.equal(liveToastSkipReason(msg, ctx({ dockConversationId: "c2" })), null);
  assert.equal(liveToastSkipReason(msg, ctx({ pathname: "/" })), null);
  assert.equal(liveToastSkipReason(row({ type: "message_request", targetHref: "/messages/local?id=c1" }), ctx({ dockConversationId: "c1" })), "in-chat");
});

test("birleşme anahtarı sunucunun grup anahtarıyla aynıdır", () => {
  for (const r of [row(), row({ type: "follow", targetHref: "/profile/real?username=a" }), row({ type: "comment", id: "z" })]) {
    assert.equal(liveToastKey(r), notificationGroupKey(r.type, r.targetHref, r.id));
  }
});

test("aynı içeriğe gelen beğeniler tek kartta birleşir, süre yeniden başlar", () => {
  let stack = addLiveToast([], toastCardFromRow(row({ id: "n1" }), actor("a1")), false);
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "n2", actorId: "a2", reaction: "fire" }), actor("a2")), false);
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "n3", actorId: "a3" }), actor("a3")), false);
  assert.equal(stack.length, 1);
  assert.equal(stack[0].seq, 2);
  assert.equal(stack[0].card.rowCount, 3);
  assert.deepEqual(stack[0].card.actors.map((a) => a.id), ["a3", "a2", "a1"]);
  assert.deepEqual(stack[0].card.reactionCounts, { love: 2, fire: 1 });
  assert.equal(stack[0].id, "n1");
});

test("farklı içerik ayrı kart; tekil bildirimler (yorum) hiç birleşmez", () => {
  let stack = addLiveToast([], toastCardFromRow(row({ id: "n1" }), actor("a1")), false);
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "n2", targetHref: "/prompts/local?id=p2&hl=post:p2" }), actor("a2")), false);
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "c1", type: "comment" }), actor("a3")), false);
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "c2", type: "comment" }), actor("a3")), false);
  assert.equal(stack.length, 4);
  assert.equal(liveEntries(stack).length, LIVE_TOAST_MAX);
});

test("en çok 3 kart: dördüncüsü gelince en eskisi kapanmaya alınır", () => {
  let stack = [] as ReturnType<typeof addLiveToast>;
  for (const id of ["c1", "c2", "c3", "c4"]) stack = addLiveToast(stack, toastCardFromRow(row({ id, type: "comment" }), actor("a")), false);
  assert.deepEqual(stack.map((e) => [e.id, e.leaving]), [["c1", true], ["c2", false], ["c3", false], ["c4", false]]);
  stack = dropLiveToast(stack, "c1");
  assert.equal(stack.length, 3);
});

test("kapanmakta olan karta birleşilmez; kapatma ve kaldırma kimlikle yapılır", () => {
  let stack = addLiveToast([], toastCardFromRow(row({ id: "n1" }), actor("a1")), false);
  stack = leaveLiveToast(stack, "n1");
  stack = addLiveToast(stack, toastCardFromRow(row({ id: "n2" }), actor("a2")), false);
  assert.equal(stack.length, 2);
  assert.equal(stack[1].card.rowCount, 1);
  stack = dropLiveToast(stack, "n1");
  assert.deepEqual(stack.map((e) => e.id), ["n2"]);
  assert.equal(dropLiveToast(stack, "n2").length, 1, "kapanmamış kart bırakılmaz");
});

test("mergeToastCard: aktörsüz yeni satır eski aktörü korur", () => {
  const prev = toastCardFromRow(row({ id: "n1" }), actor("a1"));
  const next = toastCardFromRow(row({ id: "n2", actorId: null }), null);
  const merged = mergeToastCard(prev, next);
  assert.equal(merged.latestActor?.id, "a1");
  assert.equal(merged.rowCount, 2);
});

test("hızlı eylem: yorum ve mesajda Yanıtla, tek kişilik takipte Takip et, diğerlerinde yok", () => {
  const comment = toastCardFromRow(row({ type: "comment", id: "n9", targetHref: "/prompts/local?id=p1&hl=comment:c1" }), actor("a"));
  assert.equal(liveToastAction(comment), "reply");
  assert.equal(liveToastReplyHref(comment), `/notifications?n=${encodeURIComponent("n|n9")}`);
  const commentNoTarget = toastCardFromRow(row({ type: "comment", targetHref: "/spaces/local?id=s1" }), actor("a"));
  assert.equal(liveToastAction(commentNoTarget), null);
  const message = toastCardFromRow(row({ type: "message", targetHref: "/messages/local?id=c1" }), actor("a"));
  assert.equal(liveToastAction(message), "reply");
  assert.equal(liveToastReplyHref(message), "/messages/local?id=c1");
  const follow = toastCardFromRow(row({ type: "follow", targetHref: "/profile/real?username=ali" }), actor("a"));
  assert.equal(liveToastAction(follow), "follow");
  assert.equal(liveToastAction({ ...follow, rowCount: 2 }), null);
  assert.equal(liveToastAction(toastCardFromRow(row({ type: "follow", targetHref: "/collections/local?id=c1" }), actor("a"))), null);
  assert.equal(liveToastAction(toastCardFromRow(row(), actor("a"))), null);
});
