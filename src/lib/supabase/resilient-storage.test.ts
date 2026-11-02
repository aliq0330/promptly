import test from "node:test";
import assert from "node:assert/strict";
import { createResilientStorage, describeStorageUsage, pickNewestSession, type PersistFailure } from "./resilient-storage.ts";

class FakeStorage {
  data = new Map<string, string>();
  /** true → her yazma `QuotaExceededError` fırlatır; sayı → yalnız o kadar baytı aşan değerler. */
  quota: boolean | number = false;
  setCalls = 0;
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.setCalls += 1;
    const old = this.data.get(key)?.length ?? 0;
    const used = [...this.data.entries()].reduce((sum, [k, v]) => sum + k.length + v.length, 0) - (this.data.has(key) ? key.length + old : 0);
    if (this.quota === true || (typeof this.quota === "number" && used + key.length + value.length > this.quota)) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
}

const session = (expiresAt: number, refresh = "r") => JSON.stringify({ access_token: "a", refresh_token: refresh, expires_at: expiresAt });
const KEY = "sb-test-auth-token";

test("normal case: writes go to localStorage, reads come back, remove clears everything", () => {
  const local = new FakeStorage();
  const sess = new FakeStorage();
  const storage = createResilientStorage({ local, session: sess });
  storage.setItem(KEY, session(100));
  assert.equal(local.getItem(KEY), session(100));
  assert.equal(storage.getItem(KEY), session(100));
  assert.equal(sess.length, 0, "no fallback copy when the persistent write works");
  storage.removeItem(KEY);
  assert.equal(storage.getItem(KEY), null);
  assert.equal(local.length, 0);
});

test("the production bug: when the persistent write FAILS the rotated session is still what getItem returns (not the stale one in localStorage)", () => {
  const local = new FakeStorage();
  const sess = new FakeStorage();
  const failures: PersistFailure[] = [];
  const storage = createResilientStorage({ local, session: sess, onPersistFailure: (f) => failures.push(f) });
  storage.setItem(KEY, session(100, "old"));
  local.quota = true; // Safari: depolama doldu
  storage.setItem(KEY, session(200, "rotated"));
  assert.equal(JSON.parse(storage.getItem(KEY) as string).refresh_token, "rotated", "memory is authoritative, so the library never re-sends the old token");
  assert.equal(storage.isMemoryAuthoritative(KEY), true);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error, "QuotaExceededError");
  assert.equal(failures[0].savedTo, "session");
});

test("a failed write is reported ONCE per key, not on every refresh; raw values never reach the callback", () => {
  const local = new FakeStorage();
  local.quota = true;
  const failures: PersistFailure[] = [];
  const storage = createResilientStorage({ local, session: null, onPersistFailure: (f) => failures.push(f) });
  for (let i = 1; i <= 5; i++) storage.setItem(KEY, session(i * 100, `t${i}`));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].savedTo, "memory");
  assert.ok(!JSON.stringify(failures).includes("t1"), "no token in the report");
  assert.equal(JSON.parse(storage.getItem(KEY) as string).refresh_token, "t5");
});

test("after a reload the newest copy wins: sessionStorage (new) beats the stale localStorage value", () => {
  const local = new FakeStorage();
  const sess = new FakeStorage();
  const first = createResilientStorage({ local, session: sess });
  first.setItem(KEY, session(100, "old"));
  local.quota = true;
  first.setItem(KEY, session(200, "rotated"));
  // Yeniden yükleme: yeni örnek, bellek boş.
  const reloaded = createResilientStorage({ local, session: sess });
  assert.equal(JSON.parse(reloaded.getItem(KEY) as string).refresh_token, "rotated");
});

test("a later successful write returns authority to localStorage and drops the fallback copy", () => {
  const local = new FakeStorage();
  const sess = new FakeStorage();
  const storage = createResilientStorage({ local, session: sess });
  local.quota = true;
  storage.setItem(KEY, session(200, "a"));
  assert.equal(storage.isMemoryAuthoritative(KEY), true);
  local.quota = false; // ör. kullanıcı yer açtı
  storage.setItem(KEY, session(300, "b"));
  assert.equal(storage.isMemoryAuthoritative(KEY), false);
  assert.equal(JSON.parse(local.getItem(KEY) as string).refresh_token, "b");
  assert.equal(sess.length, 0);
});

test("when only the old size of the same key blocks the write, removing it first lets the new value in (no failure reported)", () => {
  const local = new FakeStorage();
  const failures: PersistFailure[] = [];
  const storage = createResilientStorage({ local, session: null, onPersistFailure: (f) => failures.push(f) });
  const big = JSON.stringify({ expires_at: 100, pad: "x".repeat(300) });
  local.setItem(KEY, big);
  local.quota = 380; // eski değer + yenisi sığmaz, yalnız yenisi sığar
  const next = JSON.stringify({ expires_at: 200, pad: "y".repeat(300) });
  storage.setItem(KEY, next);
  assert.equal(local.getItem(KEY), next);
  assert.equal(failures.length, 0);
});

test("pickNewestSession: larger expires_at wins; missing side / unparsable falls back to the first", () => {
  assert.equal(pickNewestSession(session(100), session(200)), session(200));
  assert.equal(pickNewestSession(session(300), session(200)), session(300));
  assert.equal(pickNewestSession(null, session(1)), session(1));
  assert.equal(pickNewestSession(session(1), null), session(1));
  assert.equal(pickNewestSession("not json", session(5)), "not json");
  assert.equal(pickNewestSession(null, null), null);
});

test("no window at all (static export build): everything lives in memory and nothing throws", () => {
  const storage = createResilientStorage({ local: null, session: null });
  storage.setItem(KEY, "v");
  assert.equal(storage.getItem(KEY), "v");
  storage.removeItem(KEY);
  assert.equal(storage.getItem(KEY), null);
});

test("a storage whose reads and writes throw (blocked storage) never breaks the caller", () => {
  const blocked = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  const failures: PersistFailure[] = [];
  const storage = createResilientStorage({ local: blocked, session: blocked, onPersistFailure: (f) => failures.push(f) });
  storage.setItem(KEY, session(100));
  assert.equal(storage.getItem(KEY), session(100));
  storage.removeItem(KEY);
  assert.equal(storage.getItem(KEY), null);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].savedTo, "memory");
});

test("describeStorageUsage lists sizes and key names only, biggest first, never values", () => {
  const store = new FakeStorage();
  store.data.set("small", "a");
  store.data.set("neighbour-app-cache", "z".repeat(3000));
  store.data.set("mid", "b".repeat(100));
  const text = describeStorageUsage(store, 2);
  assert.match(text, /^≈ /);
  assert.ok(text.indexOf("neighbour-app-cache") < text.indexOf("mid"));
  assert.ok(!text.includes("small"), "top-N only");
  assert.ok(!text.includes("zzz"), "no values");
});
