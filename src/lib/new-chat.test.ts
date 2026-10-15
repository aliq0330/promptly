import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNewChatSections, resolveNewChatTarget, type ChatPerson } from "./new-chat.ts";

const person = (id: string, displayName = id): ChatPerson => ({ id, displayName, username: id });
const partner = (id: string, lastMessageAt: string) => ({ profile: person(id), lastMessageAt });
const none = new Set<string>();
const ids = (list: ChatPerson[]) => list.map((p) => p.id);

test("followed section: people with a conversation first (newest chat first), the rest alphabetical", () => {
  const { followed } = buildNewChatSections({
    selfId: "me",
    followed: [person("zed"), person("amy"), person("bob"), person("cat")],
    partners: [partner("bob", "2026-01-01T00:00:00Z"), partner("cat", "2026-03-01T00:00:00Z")],
    followers: [],
    blockedIds: none,
  });
  assert.deepEqual(ids(followed), ["cat", "bob", "amy", "zed"]);
});

test("interaction section never repeats anyone from the followed section", () => {
  const { followed, interactions } = buildNewChatSections({
    selfId: "me",
    followed: [person("amy")],
    partners: [partner("amy", "2026-03-01T00:00:00Z"), partner("bob", "2026-02-01T00:00:00Z")],
    followers: [person("amy"), person("cat")],
    blockedIds: none,
  });
  assert.deepEqual(ids(followed), ["amy"]);
  assert.deepEqual(ids(interactions), ["bob", "cat"]);
});

test("interaction section has no duplicates when someone is both a partner and a follower", () => {
  const { interactions } = buildNewChatSections({
    selfId: "me",
    followed: [],
    partners: [partner("bob", "2026-02-01T00:00:00Z")],
    followers: [person("bob"), person("bob"), person("cat")],
    blockedIds: none,
  });
  assert.deepEqual(ids(interactions), ["bob", "cat"]);
});

test("self and people the viewer blocked are never listed", () => {
  const { followed, interactions } = buildNewChatSections({
    selfId: "me",
    followed: [person("me"), person("amy"), person("bad")],
    partners: [partner("bad2", "2026-02-01T00:00:00Z")],
    followers: [person("bad"), person("cat")],
    blockedIds: new Set(["bad", "bad2"]),
  });
  assert.deepEqual(ids(followed), ["amy"]);
  assert.deepEqual(ids(interactions), ["cat"]);
});

test("server answer drops unreachable people but keeps existing conversation partners", () => {
  const { followed, interactions } = buildNewChatSections({
    selfId: "me",
    followed: [person("amy"), person("locked")],
    partners: [partner("old", "2026-02-01T00:00:00Z")],
    followers: [person("locked2"), person("cat")],
    blockedIds: none,
    messageableIds: new Set(["amy", "cat"]),
  });
  assert.deepEqual(ids(followed), ["amy"]);
  assert.deepEqual(ids(interactions), ["old", "cat"]);
});

test("each section is capped", () => {
  const many = Array.from({ length: 50 }, (_, i) => person(`u${String(i).padStart(2, "0")}`));
  const { followed, interactions } = buildNewChatSections({
    selfId: "me",
    followed: many.slice(0, 40),
    partners: [],
    followers: many,
    blockedIds: none,
    limit: 10,
  });
  assert.equal(followed.length, 10);
  assert.equal(interactions.length, 10);
  assert.ok(interactions.every((p) => !followed.some((f) => f.id === p.id)));
});

test("picking someone with a conversation opens it instead of creating another", () => {
  const target = resolveNewChatTarget({
    personId: "bob",
    conversationIdByUserId: new Map([["bob", "conv-1"]]),
    blockedIds: none,
    messageableIds: none,
  });
  assert.deepEqual(target, { kind: "open", conversationId: "conv-1" });
});

test("picking a reachable person without a conversation goes to the draft (nothing is created yet)", () => {
  const target = resolveNewChatTarget({ personId: "amy", conversationIdByUserId: new Map(), blockedIds: none, messageableIds: new Set(["amy"]) });
  assert.deepEqual(target, { kind: "draft" });
});

test("a person the server did not clear (privacy or a block the other way) is unavailable — same answer for both", () => {
  const target = resolveNewChatTarget({ personId: "amy", conversationIdByUserId: new Map(), blockedIds: none, messageableIds: none });
  assert.deepEqual(target, { kind: "unavailable" });
});

test("a person the viewer blocked cannot be messaged from the picker even if the server list were stale", () => {
  const target = resolveNewChatTarget({
    personId: "amy",
    conversationIdByUserId: new Map(),
    blockedIds: new Set(["amy"]),
    messageableIds: new Set(["amy"]),
  });
  assert.deepEqual(target, { kind: "blocked-by-me" });
});
