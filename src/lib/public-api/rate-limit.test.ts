import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequest, clientKeyOf, createMemoryRateLimiter, createRemoteRateLimiter, normalizeIp, withRateLimitHeaders, type RateLimitResult } from "./rate-limit.ts";
import { createApiHandler } from "./http.ts";

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

test("allows up to the limit, then refuses with a retry time; a new window starts clean", async () => {
  const time = clock();
  const limiter = createMemoryRateLimiter({ limit: 3, windowMs: 60_000, now: time.now });
  assert.deepEqual([(await limiter.check("a"))!.allowed, (await limiter.check("a"))!.allowed, (await limiter.check("a"))!.allowed], [true, true, true]);
  const fourth = (await limiter.check("a"))!;
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.equal(fourth.retryAfterSeconds, 60);
  time.advance(59_000);
  assert.equal((await limiter.check("a"))!.retryAfterSeconds, 1, "the wait shrinks as the window runs out");
  time.advance(2_000);
  const fresh = (await limiter.check("a"))!;
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.remaining, 2);
});

test("keys are counted independently", async () => {
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  assert.equal((await limiter.check("a"))!.allowed, true);
  assert.equal((await limiter.check("a"))!.allowed, false);
  assert.equal((await limiter.check("b"))!.allowed, true);
});

test("memory stays bounded: expired buckets go first, then the oldest", async () => {
  const time = clock();
  const limiter = createMemoryRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 3, now: time.now });
  for (const key of ["a", "b", "c"]) await limiter.check(key);
  time.advance(2000); // hepsinin süresi doldu
  await limiter.check("d");
  assert.equal(limiter.size, 1, "expired buckets were dropped");
  for (const key of ["e", "f", "g", "h"]) await limiter.check(key); // süresi dolmamış, sınırı aşıyor
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

test("headers: every answer carries RateLimit-*, a refusal also carries Retry-After", async () => {
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
  const ok = withRateLimitHeaders(new Response("x"), await limiter.check("a"));
  assert.equal(ok.headers.get("RateLimit-Limit"), "1");
  assert.equal(ok.headers.get("RateLimit-Remaining"), "0");
  assert.equal(ok.headers.get("Retry-After"), null);
  const refused = withRateLimitHeaders(new Response("x", { status: 429 }), await limiter.check("a"));
  assert.equal(refused.headers.get("Retry-After"), "60");
  assert.equal(withRateLimitHeaders(new Response("x"), null).headers.get("RateLimit-Limit"), null, "no result → untouched");
});

test("checkRequest does nothing without a limiter or without an identity", async () => {
  const request = new Request("https://x.test/", { headers: { "cf-connecting-ip": "203.0.113.7" } });
  assert.equal(await checkRequest(undefined, request), null);
  assert.equal(await checkRequest(createMemoryRateLimiter({ limit: 1, windowMs: 1000 }), new Request("https://x.test/")), null);
});

test("the API handler answers 429 past the limit (JSON error, Retry-After), counts per IP and ignores CORS preflight", async () => {
  const handler = createApiHandler({
    config: { url: "https://example.supabase.co", anonKey: "k" },
    rateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000, now: clock().now }),
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

// --- Üretim sayacı: veritabanı (RPC) ---

type RpcCall = { fn: string; args: Record<string, unknown> };
function fakeRpc(reply: (call: RpcCall) => unknown, calls: RpcCall[] = []) {
  return {
    calls,
    client: {
      async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
        const call = { fn, args };
        calls.push(call);
        return reply(call) as T;
      },
    },
  };
}

test("remote limiter: sends the secret and a hashed bucket (never the raw IP), maps the row to a result", async () => {
  const rpc = fakeRpc(() => [{ allowed: true, hits: 7, retry_after: 42 }]);
  const limiter = createRemoteRateLimiter({ client: rpc.client, secret: "s3cret", scope: "api", limit: 60, windowMs: 60_000 });
  const result = (await limiter.check("203.0.113.7")) as RateLimitResult;
  assert.deepEqual([result.allowed, result.limit, result.remaining, result.retryAfterSeconds], [true, 60, 53, 42]);
  const [call] = rpc.calls;
  assert.equal(call.fn, "public_api_rate_hit");
  assert.equal(call.args.p_secret, "s3cret");
  assert.equal(call.args.p_limit, 60);
  assert.equal(call.args.p_window_seconds, 60);
  const bucket = String(call.args.p_bucket);
  assert.match(bucket, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(call.args).includes("203.0.113.7"), "the raw IP never reaches the database");
});

test("remote limiter: the bucket differs per scope and per IP, and is stable for the same pair", async () => {
  const seen: string[] = [];
  const make = (scope: string) => createRemoteRateLimiter({ client: fakeRpc((c) => (seen.push(String(c.args.p_bucket)), [{ allowed: true, hits: 1, retry_after: 60 }])).client, secret: "s", scope, limit: 5, windowMs: 60_000 });
  await make("api").check("1.1.1.1");
  await make("api").check("1.1.1.1");
  await make("mcp").check("1.1.1.1");
  await make("api").check("2.2.2.2");
  assert.equal(seen[0], seen[1]);
  assert.equal(new Set(seen).size, 3);
});

test("remote limiter: a refusal comes through with its retry time", async () => {
  const limiter = createRemoteRateLimiter({ client: fakeRpc(() => [{ allowed: false, hits: 61, retry_after: 17 }]).client, secret: "s", scope: "api", limit: 60, windowMs: 60_000 });
  const result = (await limiter.check("1.1.1.1")) as RateLimitResult;
  assert.deepEqual([result.allowed, result.remaining, result.retryAfterSeconds], [false, 0, 17]);
});

test("remote limiter FAILS OPEN: an error, an empty/odd answer or a missing secret setup never blocks a request", async () => {
  const errors: unknown[] = [];
  const boom = createRemoteRateLimiter({ client: fakeRpc(() => { throw new Error("db down"); }).client, secret: "s", scope: "api", limit: 5, windowMs: 1000, onError: (e) => errors.push(e) });
  assert.equal(await boom.check("1.1.1.1"), null);
  assert.equal(errors.length, 1, "the failure is reported to the log, not to the caller");
  for (const odd of [[], null, [{}], [{ allowed: "yes" }]]) {
    const limiter = createRemoteRateLimiter({ client: fakeRpc(() => odd).client, secret: "s", scope: "api", limit: 5, windowMs: 1000 });
    assert.equal(await limiter.check("1.1.1.1"), null);
  }
  // checkRequest de sayaç hatasını yutar (sınırlayıcı kendi içinde yakalamasa bile).
  const throwing = { async check(): Promise<RateLimitResult | null> { throw new Error("x"); } };
  assert.equal(await checkRequest(throwing, new Request("https://x.test/", { headers: { "cf-connecting-ip": "1.1.1.1" } })), null);
});
