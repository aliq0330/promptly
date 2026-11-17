import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_RUN_MAX_TOPICS,
  FIRST_RUN_MIN_TOPICS,
  firstRunDoneKey,
  firstRunRequired,
  markFirstRunDone,
  readFirstRunDone,
  toggleTopic,
  topicProgress,
} from "./first-run-setup.ts";

const SINCE = Date.parse("2026-11-17T00:00:00Z");
const fresh = { createdAt: "2026-11-18T09:00:00Z", interests: [] as string[] };

test("a new account without enough topics must go through the setup", () => {
  assert.equal(firstRunRequired(fresh, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: ["Dijital Sanat"] }, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: undefined }, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: null }, false, SINCE), true);
});

test("two topics (or more) finish it — the server-side column is the source of truth", () => {
  assert.equal(firstRunRequired({ ...fresh, interests: ["Dijital Sanat", "Fotoğrafçılık"] }, false, SINCE), false);
  assert.equal(firstRunRequired({ ...fresh, interests: ["a", "b", "c"] }, false, SINCE), false);
});

test("accounts created before the cut-off are never forced", () => {
  assert.equal(firstRunRequired({ createdAt: "2026-11-16T23:59:59Z", interests: [] }, false, SINCE), false);
  assert.equal(firstRunRequired({ createdAt: "2025-01-01T00:00:00Z" }, false, SINCE), false);
  assert.equal(firstRunRequired({ createdAt: "2026-11-17T00:00:00Z", interests: [] }, false, SINCE), true);
});

test("a finished device flag, demo accounts and unreadable dates never lock anyone in", () => {
  assert.equal(firstRunRequired(fresh, true, SINCE), false);
  assert.equal(firstRunRequired({ ...fresh, isDemo: true }, false, SINCE), false);
  assert.equal(firstRunRequired({ createdAt: "not a date", interests: [] }, false, SINCE), false);
  assert.equal(firstRunRequired(fresh, false, Number.NaN), false);
});

test("toggling keeps the order and stops at the maximum", () => {
  assert.deepEqual(toggleTopic([], "a"), ["a"]);
  assert.deepEqual(toggleTopic(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleTopic(["a", "b"], "a"), ["b"]);
  const full = ["a", "b", "c", "d", "e"];
  assert.equal(full.length, FIRST_RUN_MAX_TOPICS);
  assert.deepEqual(toggleTopic(full, "f"), full);
  assert.deepEqual(toggleTopic(full, "c"), ["a", "b", "d", "e"]);
});

test("progress says how many topics are still missing", () => {
  assert.equal(FIRST_RUN_MIN_TOPICS, 2);
  assert.deepEqual(topicProgress(0), { missing: 2, canContinue: false });
  assert.deepEqual(topicProgress(1), { missing: 1, canContinue: false });
  assert.deepEqual(topicProgress(2), { missing: 0, canContinue: true });
  assert.deepEqual(topicProgress(5), { missing: 0, canContinue: true });
});

test("the done flag is per user and survives blocked storage", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  assert.equal(readFirstRunDone("u1", storage), false);
  markFirstRunDone("u1", storage);
  assert.equal(readFirstRunDone("u1", storage), true);
  assert.equal(readFirstRunDone("u2", storage), false);
  assert.notEqual(firstRunDoneKey("u1"), firstRunDoneKey("u2"));

  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readFirstRunDone("u1", blocked), false);
  assert.doesNotThrow(() => markFirstRunDone("u1", blocked));
  assert.equal(readFirstRunDone("u1", null), false);
});
