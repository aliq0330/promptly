import { test } from "node:test";
import assert from "node:assert/strict";
import { clearThrottle, shouldRunNow, type ThrottleStorage } from "./run-throttle.ts";

function memoryStorage(): ThrottleStorage & { removeItem(key: string): void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

test("first call runs, the next ones inside the interval do not", () => {
  const storage = memoryStorage();
  assert.equal(shouldRunNow("k", 1000, 10_000, storage), true);
  assert.equal(shouldRunNow("k", 1000, 10_500, storage), false);
  assert.equal(shouldRunNow("k", 1000, 10_999, storage), false);
});

test("runs again once the interval has passed, and restarts the interval", () => {
  const storage = memoryStorage();
  assert.equal(shouldRunNow("k", 1000, 10_000, storage), true);
  assert.equal(shouldRunNow("k", 1000, 11_000, storage), true);
  assert.equal(shouldRunNow("k", 1000, 11_500, storage), false);
});

test("keys are independent", () => {
  const storage = memoryStorage();
  assert.equal(shouldRunNow("a", 1000, 10_000, storage), true);
  assert.equal(shouldRunNow("b", 1000, 10_000, storage), true);
});

test("a stored time in the future or garbage never blocks", () => {
  const storage = memoryStorage();
  storage.setItem("k", String(99_999_999));
  assert.equal(shouldRunNow("k", 1000, 10_000, storage), true);
  storage.setItem("k", "not-a-number");
  assert.equal(shouldRunNow("k", 1000, 10_000, storage), true);
});

test("no storage or a throwing storage means run", () => {
  assert.equal(shouldRunNow("k", 1000, 10_000, null), true);
  const broken: ThrottleStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(shouldRunNow("k", 1000, 10_000, broken), true);
});

test("clearThrottle lets the next call run", () => {
  const storage = memoryStorage();
  shouldRunNow("k", 1000, 10_000, storage);
  clearThrottle("k", storage);
  assert.equal(shouldRunNow("k", 1000, 10_100, storage), true);
});
