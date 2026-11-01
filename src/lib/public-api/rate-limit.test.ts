import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequest, clientKeyOf, createRateLimiter, normalizeIp, withRateLimitHeaders } from "./rate-limit.ts";
import { createApiHandler } from "./http.ts";

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

test("allows up to the limit, then refuses with a retry time; a new window starts clean", () => {
  const time = clock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: time.now });
  assert.deepEqual([1, 2, 3].map(() => limiter.check("a").allowed), [true, true, true]);
  const fourth = limiter.check("a");
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.equal(fourth.retryAfterSeconds, 60);
  time.advance(59_000);
  assert.equal(limiter.check("a").retryAfterSeconds, 1, "the wait shrinks as the window runs out");
  time.advance(2_000);
  const fresh = limiter.check("a");
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.remaining, 2);
});

test("keys are counted independently", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
});

test("memory stays bounded: expired buckets go first, then the oldest", () => {
  const time = clock();
  const limiter = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 3, now: time.now });
  for (const key of ["a", "b", "c"]) limiter.check(key);
  time.advance(2000); // hepsinin süresi doldu
  limiter.check("d");
  assert.equal(limiter.size, 1, "expired buckets were dropped");
  for (const key of ["e", "f", "g", "h"]) limiter.check(key); // süresi dolmamış, sınırı aşıyor
  assert.ok(limiter.size <= 3, `size ${limiter.size} must not pass maxKeys`);
});

test("client key: cf-connecting-ip wins, then the first x-forwarded-for entry, otherwise none", () => {
  assert.equal(clientKeyOf(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7");
  assert.equal(clientKeyOf(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
  assert.equal(clientKeyOf(new Headers()), null, "no identity → no limit, never one shared bucket");
  assert.equal(clientKeyOf(new Headers({ "cf-connecting-ip": "  " })), null);
});

test("IPv6 collapses to its /64 so rotating inside a block does not dodge the limit", () => {
  assert.equal(normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), normalizeIp("2001:DB8:1:2:1111:2222:3333:4444"));
  assert.equal(normalizeIp("2001:db8::1"), normalizeIp("2001:db8:0:0:9::2"));
  assert.notEqual(normalizeIp("2001:db8:1:2::1"), normalizeIp("2001:db8:1:3::1"));
  assert.equal(normalizeIp("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIp("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizeIp("not:an:ip"), "not:an:ip", "unparsable stays as is");
});

test("headers: every answer carries RateLimit-*, a refusal also carries Retry-After", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  const ok = withRateLimitHeaders(new Response("x"), limiter.check("a"));
  assert.equal(ok.headers.get("RateLimit-Limit"), "1");
  assert.equal(ok.headers.get("RateLimit-Remaining"), "0");
  assert.equal(ok.headers.get("Retry-After"), null);
  const refused = withRateLimitHeaders(new Response("x", { status: 429 }), limiter.check("a"));
  assert.equal(refused.headers.get("Retry-After"), "60");
  assert.equal(withRateLimitHeaders(new Response("x"), null).headers.get("RateLimit-Limit"), null, "no result → untouched");
});

test("checkRequest does nothing without a limiter or without an identity", () => {
  const request = new Request("https://x.test/", { headers: { "cf-connecting-ip": "203.0.113.7" } });
  assert.equal(checkRequest(undefined, request), null);
  assert.equal(checkRequest(createRateLimiter({ limit: 1, windowMs: 1000 }), new Request("https://x.test/")), null);
});

test("the API handler answers 429 past the limit (JSON error, Retry-After), counts per IP and ignores CORS preflight", async () => {
  const handler = createApiHandler({
    config: { url: "https://example.supabase.co", anonKey: "k" },
    rateLimiter: createRateLimiter({ limit: 2, windowMs: 60_000, now: clock().now }),
  });
  const get = (ip: string) => handler(new Request("https://example.supabase.co/functions/v1/api/v1/openapi.json", { headers: { "cf-connecting-ip": ip } }));
  assert.equal((await get("203.0.113.7")).status, 200);
  assert.equal((await get("203.0.113.7")).status, 200);
  const refused = await get("203.0.113.7");
  assert.equal(refused.status, 429);
  assert.equal((await refused.json()).error.code, "rate_limited");
  assert.equal(refused.headers.get("Retry-After"), "60");
  assert.ok(refused.headers.get("Access-Control-Expose-Headers")?.includes("Retry-After"), "browser scripts can read Retry-After");
  assert.equal((await get("203.0.113.8")).status, 200, "another IP is unaffected");
  const preflight = await handler(new Request("https://example.supabase.co/functions/v1/api/v1/prompts", { method: "OPTIONS", headers: { "cf-connecting-ip": "203.0.113.7" } }));
  assert.equal(preflight.status, 204, "preflight is never counted or refused");
});
