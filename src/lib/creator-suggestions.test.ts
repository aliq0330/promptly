import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATOR_REPEAT_WINDOW_MS,
  CREATOR_STRIP_EVERY,
  CREATOR_STRIP_FIRST_INDEX,
  creatorStripOrdinal,
  creatorStripPausedUntil,
  creatorStripSlice,
  isCreatorStripSlot,
  orderCreatorPool,
  parseCreatorReasonKind,
} from "./creator-suggestions.ts";
import { isInterestPromptSlot } from "./interest-feedback.ts";

test("the strip sits under the 12th post and then every 30th, never earlier", () => {
  const slots = Array.from({ length: 110 }, (_, i) => i).filter(isCreatorStripSlot);
  assert.deepEqual(slots, [11, 41, 71, 101]);
  assert.equal(CREATOR_STRIP_FIRST_INDEX, 11);
  assert.equal(CREATOR_STRIP_EVERY, 30);
  assert.equal(isCreatorStripSlot(-19), false);
  assert.equal(isCreatorStripSlot(0), false);
  assert.equal(isCreatorStripSlot(10), false);
});

test("a slot does not move when the list grows (index-based)", () => {
  assert.equal(isCreatorStripSlot(41), true);
  assert.equal(creatorStripOrdinal(11), 0);
  assert.equal(creatorStripOrdinal(41), 1);
  assert.equal(creatorStripOrdinal(71), 2);
});

test("the strip never sits under the same post as the 'ilgini çekiyor mu?' card", () => {
  const clash = Array.from({ length: 2000 }, (_, i) => i).filter((i) => isCreatorStripSlot(i) && isInterestPromptSlot(i));
  assert.deepEqual(clash, []);
});

test("the pool is cut into strips of ten, each strip with its own slice", () => {
  const pool = Array.from({ length: 25 }, (_, i) => `p${i}`);
  assert.deepEqual(creatorStripSlice(pool, 0), pool.slice(0, 10));
  assert.deepEqual(creatorStripSlice(pool, 1), pool.slice(10, 20));
  assert.deepEqual(creatorStripSlice(pool, 2), pool.slice(20, 25));
  assert.deepEqual(creatorStripSlice(pool, 3), []);
  assert.deepEqual(creatorStripSlice(pool, -1), []);
});

test("people shown in the last week go to the end of the pool; the server order is kept inside each group", () => {
  const now = 10_000_000_000;
  const candidates = ["a", "b", "c", "d"].map((id) => ({ id }));
  const shown = { a: now - 1000, c: now - CREATOR_REPEAT_WINDOW_MS - 1 };
  assert.deepEqual(orderCreatorPool(candidates, shown, now).map((c) => c.id), ["b", "c", "d", "a"]);
  // Nothing is lost: with everybody shown recently the pool is still full (a strip is never emptied by the repeat rule).
  const all = Object.fromEntries(candidates.map((c) => [c.id, now - 5]));
  assert.deepEqual(orderCreatorPool(candidates, all, now).map((c) => c.id), ["a", "b", "c", "d"]);
});

test("an unknown reason kind reads as 'active'", () => {
  assert.equal(parseCreatorReasonKind("mutual"), "mutual");
  assert.equal(parseCreatorReasonKind("liked"), "liked");
  assert.equal(parseCreatorReasonKind("brand-new-kind"), "active");
  assert.equal(parseCreatorReasonKind(null), "active");
});

test("the pause stamp only counts while it is in the future", () => {
  const now = 1_000_000;
  assert.equal(creatorStripPausedUntil(null, now), 0);
  assert.equal(creatorStripPausedUntil("abc", now), 0);
  assert.equal(creatorStripPausedUntil(String(now - 1), now), 0);
  assert.equal(creatorStripPausedUntil(String(now + 5), now), now + 5);
});
