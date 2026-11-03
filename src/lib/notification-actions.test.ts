import test from "node:test";
import assert from "node:assert/strict";
import { cardPrefKey, commentReplyTarget, likedCommentId, linkedContent, muteOptions, notificationCommentId, quickActionKind, suggestionId, messageRequestConversationId } from "./notification-actions.ts";
import type { NotificationCard } from "../types/index.ts";

const base = { rowCount: 1, latestActor: { id: "a" } as never } as const;
const c = (type: NotificationCard["type"], targetHref: string, over: Partial<NotificationCard> = {}) => ({ ...base, type, targetHref, ...over }) as NotificationCard;

test("hızlı eylem türü: yorum, beğeni, takip, öneri, mesaj isteği, kilometre taşı", () => {
  assert.equal(quickActionKind(c("comment", "/prompts/local?id=P&hl=comment:C")), "comment");
  assert.equal(quickActionKind(c("comment_reply", "/communities/post/local?id=Q&hl=comment:C")), "comment");
  assert.equal(quickActionKind(c("comment", "/prompts/local?id=P")), "none");
  assert.equal(quickActionKind(c("comment", "/stories?id=S&hl=comment:C")), "none");
  assert.equal(quickActionKind(c("like", "/prompts/local?id=P&hl=post:P", { rowCount: 3 })), "members");
  assert.equal(quickActionKind(c("follow", "/profile/real?username=me")), "followBack");
  assert.equal(quickActionKind(c("follow", "/profile/real?username=me", { rowCount: 4 })), "members");
  assert.equal(quickActionKind(c("follow", "/collections/local?id=K")), "none");
  assert.equal(quickActionKind(c("edit_suggestion_received", "/prompts/local?id=P&hl=suggestion:S")), "suggestion");
  assert.equal(quickActionKind(c("edit_suggestion_received", "/prompts/local?id=P")), "none");
  assert.equal(quickActionKind(c("message_request", "/messages/local?id=M")), "messageRequest");
  assert.equal(quickActionKind(c("system", "/insights/local?id=P")), "milestone");
  assert.equal(quickActionKind(c("system", "/insights")), "none");
  assert.equal(quickActionKind(c("request_response", "/requests/local?id=R&hl=response_new:X")), "none");
});

test("yanıt hedefi: tür + içerik + yorum; yazılamayan hedefte null", () => {
  assert.deepEqual(commentReplyTarget(c("comment", "/prompts/local?id=P&hl=comment:C")), { kind: "prompt", contentId: "P", parentCommentId: "C" });
  assert.deepEqual(commentReplyTarget(c("comment_reply", "/quotes/local?id=Q&hl=comment:C")), { kind: "quote", contentId: "Q", parentCommentId: "C" });
  assert.equal(commentReplyTarget(c("like", "/prompts/local?id=P&hl=comment:C")), null);
  assert.equal(commentReplyTarget(c("comment", "/prompts/local?id=P")), null);
});

test("kimlik çıkarıcılar", () => {
  assert.equal(notificationCommentId(c("comment", "/prompts/local?id=P&hl=comment:C")), "C");
  assert.equal(notificationCommentId(c("like", "/prompts/local?id=P&hl=comment:C")), null);
  assert.equal(likedCommentId(c("like", "/prompts/local?id=P&hl=comment:C")), "C");
  assert.equal(likedCommentId(c("like", "/prompts/local?id=P&hl=post:P")), null);
  assert.equal(suggestionId(c("edit_suggestion_received", "/prompts/local?id=P&hl=suggestion:S")), "S");
  assert.equal(messageRequestConversationId(c("message_request", "/messages/local?id=M")), "M");
});

test("bağlı içerik yalnız önizlenebilen türlerde", () => {
  assert.deepEqual(linkedContent({ targetHref: "/prompts/local?id=P&hl=post:P" }), { type: "prompt", id: "P" });
  assert.deepEqual(linkedContent({ targetHref: "/spaces/local?id=S" }), { type: "space", id: "S" });
  assert.equal(linkedContent({ targetHref: "/quotes/local?id=Q" }), null);
  assert.equal(linkedContent({ targetHref: "/profile/real?username=a" }), null);
});

test("sessize alma seçenekleri: kişi yalnız tek aktörlü kartta, içerik adresten", () => {
  assert.deepEqual(muteOptions(c("comment", "/prompts/local?id=P&hl=comment:C")), { person: true, content: true });
  assert.deepEqual(muteOptions(c("like", "/prompts/local?id=P&hl=post:P", { rowCount: 5 })), { person: false, content: true });
  assert.deepEqual(muteOptions(c("follow", "/profile/real?username=me")), { person: true, content: false });
  assert.deepEqual(muteOptions(c("system", "/insights/local?id=P", { latestActor: null })), { person: false, content: true });
  assert.deepEqual(muteOptions(c("system", "/communities/local?id=C", { latestActor: null })), { person: false, content: false });
});

test("tür tercihi anahtarı karttan: sistem kartları adresten ayrılır", () => {
  assert.equal(cardPrefKey(c("like", "/prompts/local?id=P&hl=comment:C")), "comment_likes");
  assert.equal(cardPrefKey(c("system", "/insights/local?id=P")), "milestones");
  assert.equal(cardPrefKey(c("system", "/insights")), "weekly_digest");
  assert.equal(cardPrefKey(c("system", "/communities/local?id=C")), null);
  assert.equal(cardPrefKey(c("message", "/messages/local?id=M")), null);
});
