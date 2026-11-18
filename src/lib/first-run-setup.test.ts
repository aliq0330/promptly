import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AVATAR_COLORS,
  FIRST_RUN_MAX_TOPICS,
  FIRST_RUN_MIN_TOPICS,
  firstRunDoneKey,
  firstRunRequired,
  markFirstRunDone,
  normalizeUsername,
  readFirstRunDone,
  toggleTopic,
  topicProgress,
  USERNAME_FORMAT,
  avatarInitial,
  usernameCanFinish,
  usernameFormat,
  usernameStatus,
  usernameSuggestions,
} from "./first-run-setup.ts";

const SINCE = Date.parse("2026-11-17T00:00:00Z");
const fresh = { createdAt: "2026-11-18T09:00:00Z", interests: [] as string[] };

test("a new account without enough topics must go through the setup", () => {
  assert.equal(firstRunRequired(fresh, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: ["art"] }, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: undefined }, false, SINCE), true);
  assert.equal(firstRunRequired({ ...fresh, interests: null }, false, SINCE), true);
});

test("two topics (or more) finish it — the server-side column is the source of truth", () => {
  assert.equal(firstRunRequired({ ...fresh, interests: ["art", "photography"] }, false, SINCE), false);
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

test("username format matches the database pattern used by the settings page", () => {
  const profiles = readFileSync(new URL("./supabase/profiles.ts", import.meta.url), "utf8");
  assert.ok(profiles.includes(`USERNAME_PATTERN = ${USERNAME_FORMAT.toString()}`), "same regex as lib/supabase/profiles.ts");
});

test("typing is normalised and the format says what is wrong", () => {
  assert.equal(normalizeUsername("  Ali Veli "), "aliveli");
  assert.equal(normalizeUsername("A".repeat(40)).length, 30);
  assert.equal(usernameFormat(""), "empty");
  assert.equal(usernameFormat("ab"), "short");
  assert.equal(usernameFormat("a b"), "invalid");
  assert.equal(usernameFormat("Ab1"), "invalid");
  assert.equal(usernameFormat("ali-2"), "invalid");
  assert.equal(usernameFormat("ali_2.x"), "valid");
});

test("status: own name is always free, a taken name blocks, a failed check never blocks", () => {
  assert.equal(usernameStatus("merve_k", "idle", "merve_k"), "available");
  assert.equal(usernameStatus("yeni_ad", "idle", "merve_k"), "checking");
  assert.equal(usernameStatus("yeni_ad", "checking", "merve_k"), "checking");
  assert.equal(usernameStatus("yeni_ad", "free", "merve_k"), "available");
  assert.equal(usernameStatus("yeni_ad", "taken", "merve_k"), "taken");
  assert.equal(usernameStatus("yeni_ad", "error", "merve_k"), "available");
  assert.equal(usernameStatus("ab", "free", "merve_k"), "short");
  assert.equal(usernameCanFinish("available"), true);
  for (const blocked of ["empty", "short", "invalid", "checking", "taken"] as const) assert.equal(usernameCanFinish(blocked), false);
});

test("suggestions stay valid and within 30 characters", () => {
  assert.deepEqual(usernameSuggestions("ali"), ["ali_1", "ali.tr"]);
  for (const name of ["ali", "a".repeat(30)]) {
    for (const suggestion of usernameSuggestions(name)) assert.ok(USERNAME_FORMAT.test(suggestion), suggestion);
  }
});

test("avatar initial and colours", () => {
  assert.equal(avatarInitial("merve_k"), "M");
  assert.equal(avatarInitial(""), "M");
  assert.equal(AVATAR_COLORS.length, 6);
  assert.equal(new Set(AVATAR_COLORS).size, 6);
});
