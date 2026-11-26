import test from "node:test";
import assert from "node:assert/strict";
import { SNAPSHOT_MAX_AGE_MS, SNAPSHOT_MAX_CHARS, SNAPSHOT_MAX_ENTRIES, clearSnapshots, readSnapshot, writeSnapshot, type SnapshotStorage } from "./feed-snapshot.ts";

function memoryStorage(quota = Infinity): SnapshotStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      const used = [...map.entries()].filter(([key]) => key !== k).reduce((n, [, value]) => n + value.length, 0);
      if (used + v.length > quota) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

test("a written list comes back for the same person and key", () => {
  const storage = memoryStorage();
  assert.equal(writeSnapshot("u1", "forYou|all", [{ id: 1 }], { now: 1000, storage }), true);
  assert.deepEqual(readSnapshot("u1", "forYou|all", { now: 2000, storage }), { data: [{ id: 1 }], savedAt: 1000 });
});

test("another person, a guest or another key never sees it", () => {
  const storage = memoryStorage();
  writeSnapshot("u1", "k", ["private"], { now: 1000, storage });
  assert.equal(readSnapshot("u2", "k", { now: 1000, storage }), null);
  assert.equal(readSnapshot(null, "k", { now: 1000, storage }), null);
  assert.equal(readSnapshot("u1", "other", { now: 1000, storage }), null);
  writeSnapshot(null, "k", ["guest"], { now: 1000, storage });
  assert.deepEqual(readSnapshot(undefined, "k", { now: 1000, storage })?.data, ["guest"]);
});

test("an old, future-dated or corrupt copy is ignored", () => {
  const storage = memoryStorage();
  writeSnapshot("u1", "k", [1], { now: 0, storage });
  assert.equal(readSnapshot("u1", "k", { now: SNAPSHOT_MAX_AGE_MS + 1, storage }), null);
  writeSnapshot("u1", "k", [1], { now: 10 * 60_000, storage });
  assert.equal(readSnapshot("u1", "k", { now: 0, storage }), null);
  writeSnapshot("u1", "short", [1], { now: 0, storage });
  assert.ok(readSnapshot("u1", "short", { now: 29 * 60_000, storage, maxAgeMs: 30 * 60_000 }));
  assert.equal(readSnapshot("u1", "short", { now: 31 * 60_000, storage, maxAgeMs: 30 * 60_000 }), null, "a shorter max age (stories) applies");
  storage.map.set([...storage.map.keys()].find((k) => k.endsWith(":u1:k")) as string, "{not json");
  assert.equal(readSnapshot("u1", "k", { now: 0, storage }), null);
});

test("too large a copy is not written; the oldest copies go once the limit is reached", () => {
  const storage = memoryStorage();
  assert.equal(writeSnapshot("u1", "big", "x".repeat(SNAPSHOT_MAX_CHARS), { storage }), false);
  for (let i = 0; i < SNAPSHOT_MAX_ENTRIES + 3; i += 1) writeSnapshot("u1", `k${i}`, i, { now: i, storage });
  assert.equal(readSnapshot("u1", "k0", { now: 100, storage }), null, "evicted");
  assert.equal(readSnapshot("u1", "k2", { now: 100, storage }), null, "evicted");
  assert.equal(readSnapshot("u1", `k${SNAPSHOT_MAX_ENTRIES + 2}`, { now: 100, storage })?.data, SNAPSHOT_MAX_ENTRIES + 2);
});

test("a full storage drops old copies to make room instead of failing; blocked storage is silent", () => {
  const storage = memoryStorage(900);
  for (let i = 0; i < 6; i += 1) writeSnapshot("u1", `k${i}`, "y".repeat(120), { now: i, storage });
  assert.ok(readSnapshot("u1", "k5", { now: 10, storage }), "the newest copy fits after evictions");
  const blocked: SnapshotStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {},
    length: 0,
    key: () => null,
  };
  assert.equal(readSnapshot("u1", "k", { storage: blocked }), null);
  assert.equal(writeSnapshot("u1", "k", 1, { storage: blocked }), false);
  assert.equal(readSnapshot("u1", "k", { storage: null }), null);
});

test("clearSnapshots removes every copy (sign-out) and nothing else", () => {
  const storage = memoryStorage();
  writeSnapshot("u1", "a", 1, { storage });
  writeSnapshot("u2", "b", 2, { storage });
  storage.setItem("promptly-theme", "dark");
  clearSnapshots(storage);
  assert.deepEqual([...storage.map.keys()], ["promptly-theme"]);
});
