import test from "node:test";
import assert from "node:assert/strict";
import { guardAuthRefresh } from "./auth-refresh-guard.ts";

const BASE = "https://x.supabase.co";
const REFRESH_URL = `${BASE}/auth/v1/token?grant_type=refresh_token`;
const refreshInit = (token: string): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: token }) });

function counting(status = 200, body: unknown = { access_token: "new", refresh_token: "child", expires_in: 3600 }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: typeof input === "string" ? input : String(input), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

test("the same refresh token sent again within the window does NOT hit the network and gets an equivalent, readable response each time", async () => {
  const { fn, calls } = counting();
  const guarded = guardAuthRefresh(fn, { now: () => 1000 });
  const first = await guarded(REFRESH_URL, refreshInit("parent"));
  const second = await guarded(REFRESH_URL, refreshInit("parent"));
  const third = await guarded(REFRESH_URL, refreshInit("parent"));
  assert.equal(calls.length, 1, "the storm collapses into one request");
  for (const res of [first, second, third]) {
    assert.equal(res.status, 200);
    assert.equal((await res.json()).refresh_token, "child", "every caller can read its own body");
  }
});

test("concurrent identical refreshes share one in-flight request", async () => {
  const { fn, calls } = counting();
  const guarded = guardAuthRefresh(fn, { now: () => 5 });
  const all = await Promise.all([1, 2, 3, 4].map(() => guarded(REFRESH_URL, refreshInit("p"))));
  assert.equal(calls.length, 1);
  assert.deepEqual(all.map((r) => r.status), [200, 200, 200, 200]);
});

test("after the window a real request goes out again; a different token is never served from another token's entry", async () => {
  let t = 0;
  const { fn, calls } = counting();
  const guarded = guardAuthRefresh(fn, { now: () => t, reuseWindowMs: 10_000 });
  await guarded(REFRESH_URL, refreshInit("a"));
  await guarded(REFRESH_URL, refreshInit("b"));
  assert.equal(calls.length, 2, "different tokens → different requests");
  t = 9_999;
  await guarded(REFRESH_URL, refreshInit("a"));
  assert.equal(calls.length, 2);
  t = 10_001;
  await guarded(REFRESH_URL, refreshInit("a"));
  assert.equal(calls.length, 3, "window over → real request");
});

test("429 on refresh becomes 503 (auth-js keeps the session on 5xx) with the body kept, and is cached so retries do not hammer the limit", async () => {
  let t = 0;
  const { fn, calls } = counting(429, { code: "over_request_rate_limit", message: "Request rate limit reached" });
  const guarded = guardAuthRefresh(fn, { now: () => t, throttleMs: 30_000 });
  const first = await guarded(REFRESH_URL, refreshInit("p"));
  assert.equal(first.status, 503);
  assert.equal((await first.json()).code, "over_request_rate_limit");
  for (let i = 0; i < 6; i++) assert.equal((await guarded(REFRESH_URL, refreshInit("p"))).status, 503);
  assert.equal(calls.length, 1, "the backoff retries are answered from the cache");
  t = 30_001;
  await guarded(REFRESH_URL, refreshInit("p"));
  assert.equal(calls.length, 2, "after the cooldown a real attempt is made");
});

test("other failures (e.g. invalid token) are passed through untouched and NOT cached", async () => {
  const { fn, calls } = counting(400, { code: "refresh_token_not_found" });
  const guarded = guardAuthRefresh(fn, { now: () => 1 });
  assert.equal((await guarded(REFRESH_URL, refreshInit("p"))).status, 400);
  assert.equal((await guarded(REFRESH_URL, refreshInit("p"))).status, 400);
  assert.equal(calls.length, 2);
});

test("a network error is rethrown and not cached", async () => {
  let n = 0;
  const flaky = (async () => {
    n += 1;
    if (n === 1) throw new TypeError("Load failed");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const guarded = guardAuthRefresh(flaky, { now: () => 1 });
  await assert.rejects(() => guarded(REFRESH_URL, refreshInit("p")), /Load failed/);
  assert.equal((await guarded(REFRESH_URL, refreshInit("p"))).status, 200);
  assert.equal(n, 2);
});

test("everything else is untouched: password login, REST, GET on /token, refresh without a readable body", async () => {
  const { fn, calls } = counting(429, { message: "x" });
  const guarded = guardAuthRefresh(fn, { now: () => 1 });
  const password = await guarded(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email: "a", password: "b" }) });
  assert.equal(password.status, 429, "a 429 on password login is NOT rewritten");
  const rest = await guarded(`${BASE}/rest/v1/prompts?select=id`, { method: "GET" });
  assert.equal(rest.status, 429);
  await guarded(REFRESH_URL, { method: "GET" });
  await guarded(REFRESH_URL, { method: "POST", body: "not json" });
  await guarded(REFRESH_URL, { method: "POST" });
  assert.equal(calls.length, 5, "all passed straight through");
});

test("the in-memory table stays small", async () => {
  const { fn, calls } = counting();
  const guarded = guardAuthRefresh(fn, { now: () => 1 });
  for (let i = 0; i < 60; i++) await guarded(REFRESH_URL, refreshInit(`t${i}`));
  assert.equal(calls.length, 60);
  // Eski girdiler atılmıştır: ilk belirteç yeniden gelirse ağa gider (önbellekte kalmadı).
  await guarded(REFRESH_URL, refreshInit("t0"));
  assert.equal(calls.length, 61);
});
