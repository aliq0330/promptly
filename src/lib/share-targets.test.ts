import test from "node:test";
import assert from "node:assert/strict";
import { bumpShareCounts, filterShareTargets, isShareTarget, parseShareCounts, rankShareTargets, type ShareTargetSource } from "./share-targets.ts";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function direct(id: string, name: string, lastDays: number, extra: Partial<ShareTargetSource> = {}): ShareTargetSource {
  return {
    id, kind: "direct", participants: [{ id: `u-${id}`, displayName: name, username: name.toLowerCase(), avatarUrl: null }], group: null,
    myStatus: "accepted", archivedAt: null, deletedAt: null, unreadCount: 0, lastMessageAt: daysAgo(lastDays), ...extra,
  };
}
function community(id: string, name: string, lastDays: number, extra: Partial<ShareTargetSource["group"] & object> = {}, over: Partial<ShareTargetSource> = {}): ShareTargetSource {
  return {
    id, kind: "group", participants: [],
    group: { name, avatarUrl: null, postingPolicy: "members", myRole: "member", closedAt: null, team: null, ...extra },
    myStatus: "accepted", archivedAt: null, deletedAt: null, unreadCount: 0, lastMessageAt: daysAgo(lastDays), ...over,
  };
}

test("most recent chats come first", () => {
  const ranked = rankShareTargets([direct("a", "Eski", 30), direct("b", "Yeni", 0), direct("c", "Orta", 5)], {}, NOW);
  assert.deepEqual(ranked.map((t) => t.id), ["b", "c", "a"]);
});

test("a frequently shared-to chat outranks a slightly newer one", () => {
  const counts = { a: { n: 8, at: NOW } };
  const ranked = rankShareTargets([direct("a", "Sık", 6), direct("b", "Yeni", 2)], counts, NOW);
  assert.equal(ranked[0].id, "a");
});

test("pinned chats get a head start", () => {
  const ranked = rankShareTargets([direct("a", "Yeni", 0), direct("b", "Sabit", 20, { pinnedAt: daysAgo(1) })], {}, NOW);
  assert.equal(ranked[0].id, "b");
});

test("community chats and team channels are targets, labelled by kind", () => {
  const team = community("t", "x", 1, { team: { id: "tm", name: "Kalm", tone: "blue", channelName: "müzik" } });
  const ranked = rankShareTargets([direct("a", "Ali", 3), community("c", "Ses Atölyesi", 2), team], {}, NOW);
  assert.deepEqual(ranked.map((t) => [t.kind, t.name]), [["team", "Kalm · müzik"], ["community", "Ses Atölyesi"], ["person", "Ali"]]);
});

test("requests, archived, deleted, closed and admins-only (as member) chats are not targets", () => {
  assert.equal(isShareTarget(direct("a", "A", 1, { myStatus: "pending" })), false);
  assert.equal(isShareTarget(direct("a", "A", 1, { archivedAt: daysAgo(1) })), false);
  assert.equal(isShareTarget(direct("a", "A", 1, { deletedAt: daysAgo(1) })), false);
  assert.equal(isShareTarget(community("c", "C", 1, { closedAt: daysAgo(1) })), false);
  assert.equal(isShareTarget(community("c", "C", 1, { postingPolicy: "admins", myRole: "member" })), false);
  assert.equal(isShareTarget(community("c", "C", 1, { postingPolicy: "admins", myRole: "moderator" })), true);
});

test("ranking is deterministic on ties", () => {
  const ranked = rankShareTargets([direct("b", "B", 1), direct("a", "A", 1)], {}, NOW);
  assert.deepEqual(ranked.map((t) => t.id), ["a", "b"]);
});

test("filter is case-insensitive on the display name", () => {
  const targets = rankShareTargets([direct("a", "Elif", 1), direct("b", "Mert", 2)], {}, NOW);
  assert.deepEqual(filterShareTargets(targets, " MERT ").map((t) => t.id), ["b"]);
  assert.deepEqual(filterShareTargets(targets, "mer").map((t) => t.id), ["b"]);
  assert.equal(filterShareTargets(targets, "").length, 2);
});

test("share counts survive bad storage and stay bounded", () => {
  assert.deepEqual(parseShareCounts("not json"), {});
  assert.deepEqual(parseShareCounts(null), {});
  assert.deepEqual(parseShareCounts('{"a":{"n":2,"at":5},"b":{"n":"x"}}'), { a: { n: 2, at: 5 } });
  const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, { n: 1, at: i }]));
  assert.equal(Object.keys(bumpShareCounts(many, ["new"], 999)).length, 60);
  assert.equal(bumpShareCounts({ a: { n: 1, at: 1 } }, ["a"], 7).a.n, 2);
});
