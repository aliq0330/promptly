import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESENCE_ACTIVE_WINDOW_MS,
  derivePresence,
  idsNeedingLookup,
  isPresenceAudience,
  isPresenceMode,
  isRecentlyActive,
  isSelfHidden,
  liveFromPresenceState,
  parsePresenceTopic,
  presenceFocusKey,
  selectLiveIds,
  shouldTrackSelf,
  sortOnlineFirst,
  type PresenceEntry,
} from "./presence.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const KEY = "0123456789abcdef0123456789abcdef";

function entry(partial: Partial<PresenceEntry>): PresenceEntry {
  return { visible: true, topic: `presence:${A}:${KEY}`, lastSeenAt: null, live: null, fetchedAt: 0, ...partial };
}

test("mode/audience guards", () => {
  assert.equal(isPresenceMode("auto"), true);
  assert.equal(isPresenceMode("invisible"), true);
  assert.equal(isPresenceMode("away"), false);
  for (const a of ["everyone", "following", "mutual", "nobody"]) assert.equal(isPresenceAudience(a), true);
  assert.equal(isPresenceAudience("friends"), false);
});

test("reciprocity: invisible or nobody hides self and stops tracking", () => {
  assert.equal(isSelfHidden("auto", "everyone"), false);
  assert.equal(isSelfHidden("auto", "mutual"), false);
  assert.equal(isSelfHidden("invisible", "everyone"), true);
  assert.equal(isSelfHidden("auto", "nobody"), true);
  assert.equal(shouldTrackSelf("auto", "following"), true);
  assert.equal(shouldTrackSelf("invisible", "following"), false);
});

test("topic parsing accepts only the server format", () => {
  assert.deepEqual(parsePresenceTopic(`presence:${A}:${KEY}`), { userId: A, key: KEY });
  assert.equal(parsePresenceTopic(`presence:${A}`), null);
  assert.equal(parsePresenceTopic(`typing:${A}`), null);
  assert.equal(parsePresenceTopic(`presence:${A}:${KEY}x`), null);
  assert.equal(parsePresenceTopic(null), null);
});

test("focus key mirrors SQL _presence_focus_key (supabase/tests/presence.sql #64)", () => {
  assert.equal(presenceFocusKey("/prompts/local", "?id=abc&hl=comment:x"), "/prompts/local?id=abc");
  assert.equal(presenceFocusKey("/prompts/local/", "?hl=comment:x&id=abc"), "/prompts/local?id=abc");
  assert.equal(presenceFocusKey("/notifications", ""), "/notifications");
  assert.equal(presenceFocusKey("/messages/local/", "?id=c1"), "/messages/local?id=c1");
  assert.equal(presenceFocusKey("", ""), null);
  assert.equal(presenceFocusKey(null, null), null);
  assert.equal(presenceFocusKey("/", ""), null);
});

test("recently active uses the 5 minute window and ignores future clocks", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  assert.equal(isRecentlyActive(new Date(now - 60_000).toISOString(), now), true);
  assert.equal(isRecentlyActive(new Date(now - PRESENCE_ACTIVE_WINDOW_MS - 1).toISOString(), now), false);
  assert.equal(isRecentlyActive(new Date(now + 10 * 60_000).toISOString(), now), false);
  assert.equal(isRecentlyActive(null, now), false);
  assert.equal(isRecentlyActive("not a date", now), false);
});

test("derivePresence: live channel wins, otherwise last-seen window; not visible = nothing", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const recent = new Date(now - 60_000).toISOString();
  assert.deepEqual(derivePresence(undefined, now), { visible: false, online: false, lastSeenAt: null });
  assert.deepEqual(derivePresence(entry({ visible: false, lastSeenAt: recent }), now), { visible: false, online: false, lastSeenAt: null });
  assert.equal(derivePresence(entry({ live: true }), now).online, true);
  // Tab closed: live channel says gone even though the heartbeat is fresh.
  assert.equal(derivePresence(entry({ live: false, lastSeenAt: recent }), now).online, false);
  // No channel (cap reached / reconnecting): fall back to the heartbeat window.
  assert.equal(derivePresence(entry({ live: null, lastSeenAt: recent }), now).online, true);
  assert.equal(derivePresence(entry({ live: null, lastSeenAt: new Date(now - 3_600_000).toISOString() }), now).online, false);
});

test("selectLiveIds: only visible with topic, most recently watched first, capped", () => {
  const entries = new Map<string, PresenceEntry>([
    [A, entry({})],
    [B, entry({ topic: `presence:${B}:${KEY}` })],
    [C, entry({ visible: false, topic: null })],
  ]);
  const watched = new Map([
    [A, { count: 1, lastAt: 10 }],
    [B, { count: 2, lastAt: 20 }],
    [C, { count: 1, lastAt: 30 }],
  ]);
  assert.deepEqual(selectLiveIds(watched, entries, 40), [B, A]);
  assert.deepEqual(selectLiveIds(watched, entries, 1), [B]);
  watched.set(B, { count: 0, lastAt: 20 });
  assert.deepEqual(selectLiveIds(watched, entries, 40), [A]);
});

test("idsNeedingLookup: missing or stale only", () => {
  const entries = new Map<string, PresenceEntry>([[A, entry({ fetchedAt: 1000 })], [B, entry({ fetchedAt: 100 })]]);
  assert.deepEqual(idsNeedingLookup([A, B, C], entries, 1100, 500), [B, C]);
});

test("sortOnlineFirst is stable and keeps order inside groups", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(sortOnlineFirst(items, (x) => x.id, new Set(["c", "a"])).map((x) => x.id), ["a", "c", "b", "d"]);
  assert.deepEqual(sortOnlineFirst(items, (x) => x.id, new Set()).map((x) => x.id), ["a", "b", "c", "d"]);
});

test("liveFromPresenceState: any session of the owner counts (multi-tab)", () => {
  assert.equal(liveFromPresenceState({}, A), false);
  assert.equal(liveFromPresenceState({ [A]: [{ at: 1 }, { at: 2 }] }, A), true);
  assert.equal(liveFromPresenceState({ [A]: [] }, A), false);
});
