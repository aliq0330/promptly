import test from "node:test";
import assert from "node:assert/strict";
import { cardKindKey, groupedHeadline, withoutQuotedPreview, likedObjectKey, milestoneInfo, namesLabel, quotedPreview, reactionSummary } from "./notification-card.ts";
import type { NotificationCard } from "../types/index.ts";

// `t` yerine anahtar + parametre döndüren taklit: hangi cümlenin seçildiği sınanır, çeviri metni değil.
const t = ((key: string, params?: Record<string, string | number>) => (params ? `${key}${JSON.stringify(params)}` : key)) as never;

const actor = (name: string) => ({ id: name, displayName: name }) as never;
const card = (over: Partial<NotificationCard>): NotificationCard => ({
  key: "like|/prompts/local?id=P&hl=post:P",
  type: "like",
  targetHref: "/prompts/local?id=P&hl=post:P",
  sortAt: "2026-11-03T10:00:00Z",
  rowCount: 1,
  unreadCount: 1,
  latestId: "1",
  latestMessage: "",
  latestActor: null,
  actors: [],
  reactionCounts: {},
  ...over,
});

test("adlar: 1 · 2 · 3+ kişi (en çok iki ad + kalan sayı)", () => {
  assert.equal(namesLabel(["Ali"], 1, t), "Ali");
  assert.equal(namesLabel(["Ali", "Veli"], 2, t), 'nc.names.two{"a":"Ali","b":"Veli"}');
  assert.equal(namesLabel(["Ali", "Veli", "Can"], 12, t), 'nc.names.more{"a":"Ali","b":"Veli","n":10}');
  assert.equal(namesLabel(["Ali"], 5, t), 'nc.names.moreOne{"a":"Ali","n":4}');
  assert.equal(namesLabel([], 3, t), "");
});

test("gruplu başlık: tek satır/tek kişi için null (sunucu cümlesi kullanılır)", () => {
  assert.equal(groupedHeadline(card({ rowCount: 1, actors: [actor("Ali")] }), t), null);
  assert.equal(groupedHeadline(card({ type: "comment", rowCount: 1 }), t), null);
  assert.equal(groupedHeadline(card({ type: "comment", rowCount: 3 }), t), null);
});

test("gruplu başlık: beğeni nesnesi adresten, takip/hikâye sabit cümle", () => {
  const like = groupedHeadline(card({ rowCount: 12, actors: [actor("Ali"), actor("Veli"), actor("Can")] }), t);
  assert.equal(like?.names, 'nc.names.more{"a":"Ali","b":"Veli","n":10}');
  assert.equal(like?.text, 'nc.liked{"obj":"nc.obj.prompt"}');
  assert.equal(groupedHeadline(card({ rowCount: 2, targetHref: "/prompts/local?id=P&hl=comment:C", actors: [actor("Ali"), actor("Veli")] }), t)?.text, 'nc.liked{"obj":"nc.obj.comment"}');
  assert.equal(groupedHeadline(card({ type: "follow", rowCount: 2, targetHref: "/profile/real?username=me", actors: [actor("Ali"), actor("Veli")] }), t)?.text, "nc.followed");
  assert.equal(groupedHeadline(card({ type: "follow", rowCount: 2, targetHref: "/collections/local?id=K", actors: [actor("Ali"), actor("Veli")] }), t)?.text, "nc.followedCollection");
  assert.equal(groupedHeadline(card({ type: "story_reaction", rowCount: 2, actors: [actor("Ali"), actor("Veli")] }), t)?.text, "nc.storyReaction");
  assert.equal(groupedHeadline(card({ type: "story_poll_vote", rowCount: 2, actors: [actor("Ali"), actor("Veli")] }), t)?.text, "nc.storyPoll");
});

test("beğeni nesnesi: yorum, içerik türleri ve bilinmeyen → gönderi", () => {
  assert.equal(likedObjectKey("/prompts/local?id=P&hl=post:P"), "nc.obj.prompt");
  assert.equal(likedObjectKey("/workflows/local?id=W&hl=post:W"), "nc.obj.workflow");
  assert.equal(likedObjectKey("/quotes/local?id=Q"), "nc.obj.quote");
  assert.equal(likedObjectKey("/communities/post/local?id=Q"), "nc.obj.post");
  assert.equal(likedObjectKey("/something"), "nc.obj.post");
});

test("tepki özeti: çoktan aza, eşitlikte seçici sırası, boşsa boş", () => {
  const tr = ((key: string) => ({ "reaction.love": "Aşk", "reaction.fire": "Ateş", "reaction.wow": "Vay" })[key] ?? key) as never;
  assert.equal(reactionSummary({ love: 3, fire: 2, wow: 1 }, tr), "3 aşk · 2 ateş · 1 vay");
  assert.equal(reactionSummary({ fire: 2, love: 2 }, tr), "2 aşk · 2 ateş");
  assert.equal(reactionSummary({}, tr), "");
});

test("kilometre taşı ve alıntı önizlemesi sunucu cümlesinden ayrıştırılır", () => {
  assert.deepEqual(milestoneInfo('Promptun "Gece Şehri" 100 kopyalamaya ulaştı.'), { title: "Gece Şehri", count: 100, kind: "copies" });
  assert.deepEqual(milestoneInfo('Promptun "X" 50 tepkiye ulaştı.'), { title: "X", count: 50, kind: "reactions" });
  assert.equal(milestoneInfo("Haftalık özet: 3 yorum."), null);
  assert.equal(quotedPreview('Paylaşımına yorum yaptı: "güzel iş"'), "güzel iş");
  assert.equal(quotedPreview("Seni takip etmeye başladı."), null);
});

test("tür etiketi anahtarı", () => {
  assert.equal(cardKindKey({ type: "comment", targetHref: "/p" }), "nc.kind.comment");
  assert.equal(cardKindKey({ type: "like", targetHref: "/p" }), "nc.kind.like");
  assert.equal(cardKindKey({ type: "system", targetHref: "/insights/local?id=P" }), "nc.kind.milestone");
  assert.equal(cardKindKey({ type: "system", targetHref: "/insights" }), "nc.kind.digest");
  assert.equal(cardKindKey({ type: "system", targetHref: "/communities/local?id=C" }), "nc.kind.system");
  assert.equal(cardKindKey({ type: "edit_suggestion_received", targetHref: "/p" }), "nc.kind.suggestion");
});

test("başlıktan sondaki alıntı önizlemesi atılır; önizlemesiz cümle değişmez", () => {
  assert.equal(withoutQuotedPreview('Paylaşımına yorum yaptı: "Işık harika"'), "Paylaşımına yorum yaptı");
  assert.equal(withoutQuotedPreview('Commented on your post: "Great light: really"'), "Commented on your post");
  assert.equal(withoutQuotedPreview("Seni takip etmeye başladı."), "Seni takip etmeye başladı.");
  assert.equal(withoutQuotedPreview('Yanıtın "X" isteği için seçildi!'), 'Yanıtın "X" isteği için seçildi!');
});
