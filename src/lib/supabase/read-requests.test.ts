import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BACKGROUND_READS,
  READ_ONLY_RPCS,
  classifyRequest,
  coalesceReads,
  isTransientResponse,
  limitReadConcurrency,
  retryDelay,
  retryTransientReads,
} from "./read-requests.ts";

const BASE = "https://x.supabase.co";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rpc = (name: string, body: unknown = {}): [string, RequestInit] => [`${BASE}/rest/v1/rpc/${name}`, { method: "POST", headers: { authorization: "Bearer a" }, body: JSON.stringify(body) }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("classifyRequest: only /rest/v1 reads count — GET/HEAD tables and read-only RPCs; writes, unknown RPCs, auth and storage do not", () => {
  assert.equal(classifyRequest(`${BASE}/rest/v1/prompts?select=id`).read, true);
  assert.equal(classifyRequest(`${BASE}/rest/v1/prompts?select=id`, { method: "HEAD" }).read, true);
  assert.equal(classifyRequest(`${BASE}/rest/v1/prompts`, { method: "POST", body: "{}" }).read, false);
  assert.equal(classifyRequest(`${BASE}/rest/v1/prompts?id=eq.1`, { method: "PATCH", body: "{}" }).read, false);
  assert.equal(classifyRequest(`${BASE}/rest/v1/prompts?id=eq.1`, { method: "DELETE" }).read, false);
  assert.deepEqual(classifyRequest(...rpc("feed_page")), { read: true, rpc: "feed_page", method: "POST", url: `${BASE}/rest/v1/rpc/feed_page` });
  assert.equal(classifyRequest(...rpc("set_content_interest")).read, false, "a writing RPC is never a read");
  assert.equal(classifyRequest(...rpc("presence_heartbeat")).read, false);
  assert.equal(classifyRequest(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: "POST" }).read, false);
  assert.equal(classifyRequest(`${BASE}/storage/v1/object/sign/prompt-media/a.jpg`, { method: "POST" }).read, false);
  assert.equal(classifyRequest("not a url").read, false);
});

test("coalesceReads: identical reads in flight share ONE network request and every caller can read its own body", async () => {
  const gate = deferred<void>();
  let calls = 0;
  const base = (async () => {
    calls += 1;
    await gate.promise;
    return json([{ id: 1 }]);
  }) as typeof fetch;
  const fetcher = coalesceReads(base);
  const pending = [fetcher(...rpc("story_tray", { p: 1 })), fetcher(...rpc("story_tray", { p: 1 })), fetcher(...rpc("story_tray", { p: 1 }))];
  gate.resolve();
  const responses = await Promise.all(pending);
  assert.equal(calls, 1);
  for (const response of responses) assert.deepEqual(await response.json(), [{ id: 1 }]);
});

test("coalesceReads: different bodies, different identities, writes and finished requests are NOT shared", async () => {
  let calls = 0;
  const base = (async () => {
    calls += 1;
    return json({ ok: true });
  }) as typeof fetch;
  const fetcher = coalesceReads(base);
  await Promise.all([fetcher(...rpc("feed_page", { a: 1 })), fetcher(...rpc("feed_page", { a: 2 }))]);
  assert.equal(calls, 2, "different arguments");
  const [url, init] = rpc("feed_page", { a: 1 });
  await Promise.all([fetcher(url, init), fetcher(url, { ...init, headers: { authorization: "Bearer other-user" } })]);
  assert.equal(calls, 4, "different user");
  await Promise.all([fetcher(...rpc("set_content_interest", { a: 1 })), fetcher(...rpc("set_content_interest", { a: 1 }))]);
  assert.equal(calls, 6, "a write is sent every time");
  await fetcher(...rpc("feed_page", { a: 9 }));
  await fetcher(...rpc("feed_page", { a: 9 }));
  assert.equal(calls, 8, "a finished response is never reused (no stale data)");
});

test("coalesceReads: one caller aborting does not cancel the shared request for the others", async () => {
  const gate = deferred<void>();
  const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.signal, undefined, "the shared request carries no caller signal");
    await gate.promise;
    return json({ ok: 1 });
  }) as typeof fetch;
  const fetcher = coalesceReads(base);
  const controller = new AbortController();
  const [url, init] = rpc("feed_page");
  const aborted = fetcher(url, { ...init, signal: controller.signal });
  const kept = fetcher(url, init);
  controller.abort();
  await assert.rejects(aborted, (error: unknown) => (error as { name?: string }).name === "AbortError");
  gate.resolve();
  assert.deepEqual(await (await kept).json(), { ok: 1 });
});

test("coalesceReads: a request that started long ago (hung) is NOT joined — a retry gets its own network request", async () => {
  let clock = 0;
  let calls = 0;
  const hang = deferred<Response>();
  const base = (async () => {
    calls += 1;
    return calls === 1 ? hang.promise : json({ fresh: true });
  }) as typeof fetch;
  const fetcher = coalesceReads(base, { joinMs: 1500, now: () => clock });
  void fetcher(...rpc("feed_page"));
  clock = 1000;
  const joined = fetcher(...rpc("feed_page"));
  assert.equal(calls, 1, "within the window it joins");
  clock = 21_000;
  const retried = await fetcher(...rpc("feed_page"));
  assert.equal(calls, 2, "after the window a new request goes out");
  assert.deepEqual(await retried.json(), { fresh: true });
  hang.resolve(json({ late: true }));
  assert.deepEqual(await (await joined).json(), { late: true });
});

test("isTransientResponse: statement timeout / connection codes and gateway statuses are transient; real errors are not", async () => {
  assert.equal(await isTransientResponse(json({ code: "57014", message: "canceling statement due to statement timeout" }, 500)), true);
  assert.equal(await isTransientResponse(json({ code: "PGRST003" }, 504)), true);
  assert.equal(await isTransientResponse(new Response("bad gateway", { status: 502 })), true);
  assert.equal(await isTransientResponse(json({ code: "P0001", message: "content_not_found" }, 400)), false);
  assert.equal(await isTransientResponse(json({ code: "42883", message: "function does not exist" }, 500)), false, "a bug does not get retried");
  assert.equal(await isTransientResponse(json({ code: "23505" }, 409)), false);
  assert.equal(await isTransientResponse(json([], 200)), false);
});

test("retryTransientReads: a read that times out is retried with 2 s / 5 s / 15 s back-off (±25 %) until it works", async () => {
  const responses = [json({ code: "57014" }, 500), json({ code: "57014" }, 500), json([{ id: 7 }])];
  const waits: number[] = [];
  let calls = 0;
  const base = (async () => responses[calls++]) as typeof fetch;
  const fetcher = retryTransientReads(base, { sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
  const response = await fetcher(...rpc("for_you_page"));
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 5000]);
  assert.deepEqual(await response.json(), [{ id: 7 }]);
  assert.equal(retryDelay(2000, () => 0), 1500);
  assert.equal(retryDelay(2000, () => 1), 2500);
});

test("retryTransientReads: gives up after three retries and returns the last answer; network errors are retried, aborts are not", async () => {
  let calls = 0;
  const failing = retryTransientReads((async () => {
    calls += 1;
    return json({ code: "57014" }, 500);
  }) as typeof fetch, { sleep: async () => {} });
  const last = await failing(...rpc("feed_page"));
  assert.equal(calls, 4, "1 + 3 retries");
  assert.equal(last.status, 500);

  let netCalls = 0;
  const flaky = retryTransientReads((async () => {
    netCalls += 1;
    if (netCalls === 1) throw new TypeError("Load failed");
    return json({ ok: true });
  }) as typeof fetch, { sleep: async () => {} });
  assert.equal((await flaky(...rpc("story_tray"))).status, 200);
  assert.equal(netCalls, 2);

  let abortCalls = 0;
  const aborting = retryTransientReads((async () => {
    abortCalls += 1;
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch, { sleep: async () => {} });
  await assert.rejects(aborting(...rpc("feed_page")));
  assert.equal(abortCalls, 1);
});

test("retryTransientReads: a network error is retried only once, quickly — the error then reaches the screen", async () => {
  let calls = 0;
  const waits: number[] = [];
  const offline = retryTransientReads((async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  }) as typeof fetch, { sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
  await assert.rejects(offline(`${BASE}/rest/v1/messages?select=id`));
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1500]);
});

test("limitReadConcurrency: a hung read frees its slot after the hold time, so the queue keeps moving", async () => {
  const hang = deferred<Response>();
  const started: string[] = [];
  const base = (async (input: RequestInfo | URL) => {
    const name = String(input).split("/").pop() ?? "";
    started.push(name);
    return name === "feed_page" ? hang.promise : json({});
  }) as typeof fetch;
  const fetcher = limitReadConcurrency(base, 1, 20);
  const stuck = fetcher(...rpc("feed_page"));
  const waiting = fetcher(...rpc("story_tray"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(started, ["feed_page"]);
  await waiting;
  assert.deepEqual(started, ["feed_page", "story_tray"], "the queued read went out after the hold time");
  hang.resolve(json({}));
  await stuck;
});

test("retryTransientReads: writes and non-transient errors go through exactly once", async () => {
  let calls = 0;
  const base = (async () => {
    calls += 1;
    return json({ code: "57014" }, 500);
  }) as typeof fetch;
  const fetcher = retryTransientReads(base, { sleep: async () => {} });
  await fetcher(...rpc("set_prompt_works"));
  assert.equal(calls, 1, "a write is never repeated");
  calls = 0;
  const bug = retryTransientReads((async () => {
    calls += 1;
    return json({ code: "42883" }, 500);
  }) as typeof fetch, { sleep: async () => {} });
  await bug(...rpc("feed_page"));
  assert.equal(calls, 1);
});

test("limitReadConcurrency: at most `max` reads are on the network; background reads wait behind visible ones; writes never wait", async () => {
  const gates: { name: string; done: () => void }[] = [];
  let active = 0;
  let peak = 0;
  const started: string[] = [];
  const base = (async (input: RequestInfo | URL) => {
    const name = String(input).split("/").pop() ?? "";
    started.push(name);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => gates.push({ name, done: resolve }));
    active -= 1;
    return json({ name });
  }) as typeof fetch;
  const fetcher = limitReadConcurrency(base, 1);
  const all = [
    fetcher(...rpc("feed_page")),
    fetcher(...rpc("notifications_snooze_summary")),
    fetcher(...rpc("story_tray")),
    fetcher(...rpc("for_you_page")),
    fetcher(...rpc("set_content_interest")),
  ];
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ["feed_page", "set_content_interest"], "one read on the network; the write starts at once");
  while (gates.length) {
    gates.shift()?.done();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(all);
  assert.deepEqual(started, ["feed_page", "set_content_interest", "story_tray", "for_you_page", "notifications_snooze_summary"], "queued visible reads go before the queued background read");
  assert.ok(peak <= 2, `peak ${peak}: one read + one write`);
});

test("limitReadConcurrency: an aborted queued read leaves the queue without ever hitting the network", async () => {
  const gate = deferred<void>();
  const names: string[] = [];
  const base = (async (input: RequestInfo | URL) => {
    names.push(String(input).split("/").pop() ?? "");
    await gate.promise;
    return json({});
  }) as typeof fetch;
  const fetcher = limitReadConcurrency(base, 1);
  const first = fetcher(...rpc("feed_page"));
  const controller = new AbortController();
  const [url, init] = rpc("story_tray");
  const queued = fetcher(url, { ...init, signal: controller.signal });
  controller.abort();
  await assert.rejects(queued);
  gate.resolve();
  await first;
  assert.deepEqual(names, ["feed_page"]);
});

// Listedeki her RPC gerçekten salt-okunur olmalı: tanımlandığı EN SON migration dosyasındaki her tanımı STABLE ya da IMMUTABLE (Postgres
// böyle bir işlevin veri yazmasına izin vermez → yeniden denemek/birleştirmek yan etki üretmez). Bir okuma işlevi yazan bir işleve dönüşürse burası kırılır.
test("every READ_ONLY_RPCS entry is STABLE/IMMUTABLE in the latest migration that defines it; background reads are a subset", () => {
  const dir = path.resolve(import.meta.dirname, "../../../supabase/migrations");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  const latest = new Map<string, string[]>();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\bas\s+\$/gi;
    const found = new Map<string, string[]>();
    for (const match of sql.matchAll(re)) {
      const name = match[1].toLowerCase();
      if (!READ_ONLY_RPCS.has(name)) continue;
      found.set(name, [...(found.get(name) ?? []), match[2]]);
    }
    for (const [name, headers] of found) latest.set(name, headers);
  }
  for (const name of READ_ONLY_RPCS) {
    const headers = latest.get(name);
    assert.ok(headers, `${name}: no migration defines it`);
    for (const header of headers) assert.match(header, /\b(stable|immutable)\b/i, `${name} must be STABLE or IMMUTABLE (latest definition)`);
  }
  for (const name of BACKGROUND_READS) assert.ok(READ_ONLY_RPCS.has(name), `${name} is background but not read-only`);
});
