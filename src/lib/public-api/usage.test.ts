import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "./http.ts";
import { createRemotePromptUseRecorder, type PromptUseRecorder } from "./usage.ts";

const ID_A = "11111111-1111-4111-8111-111111111111";
const BASE = "https://demo.supabase.co/functions/v1/api/v1";

function row(id: string) {
  return {
    id, title: "Işıklı Portre", description: "d", prompt_text: "Portrait of {subject}", content_type: "image", category: "art", subcategory: null, tool: null,
    tools: [], like_count: 1, save_count: 0, comment_count: 0, copy_count: 9, created_at: "2026-10-01T00:00:00Z",
    profiles: { username: "ayse", display_name: "Ayşe" }, prompt_tags: [],
  };
}

/** PostgREST taklidi: ID_A var, başka her kimlik yok. */
const upstream = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/rpc/search_content")) return Response.json([{ id: ID_A, created_at: "2026-10-01T00:00:00Z", sort_rank: 0 }]);
  if (url.pathname.endsWith("/prompts")) return Response.json(url.searchParams.get("id")?.includes(ID_A) || !url.searchParams.get("id") ? [row(ID_A)] : []);
  if (url.pathname.endsWith("/prompt_variables")) return Response.json([]);
  return new Response("nope", { status: 404 });
}) as typeof fetch;

function setup(opts: { throwing?: boolean } = {}) {
  const records: { promptId: string; clientKey: string | null }[] = [];
  const errors: unknown[] = [];
  const usage: PromptUseRecorder = {
    async record(promptId, clientKey) {
      records.push({ promptId, clientKey });
      if (opts.throwing) throw new Error("boom");
    },
  };
  const handler = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "k", fetch: upstream }, usage, onError: (e) => errors.push(e) });
  const get = (path: string, init: RequestInit = {}) => handler(new Request(`${BASE}${path}`, { headers: { "cf-connecting-ip": "203.0.113.7" }, ...init }));
  return { records, errors, get };
}

test("API: reading one prompt (JSON or a download format) and filling it count; the client key is the caller's IP", async () => {
  const { records, get } = setup();
  assert.equal((await get(`/prompts/${ID_A}`)).status, 200);
  assert.equal((await get(`/prompts/${ID_A}?format=markdown`)).status, 200);
  assert.equal((await get(`/prompts/${ID_A}/fill`, { method: "POST", body: JSON.stringify({ values: { subject: "cat" } }) })).status, 200);
  assert.deepEqual(records.map((r) => r.promptId), [ID_A, ID_A, ID_A]);
  assert.ok(records.every((r) => r.clientKey === "203.0.113.7"));
});

test("API: searches, popular lists, a bad format, an unknown prompt and a bad fill do NOT count", async () => {
  const { records, get } = setup();
  await get("/prompts?q=portre");
  await get("/prompts/popular");
  assert.equal((await get(`/prompts/${ID_A}?format=pdf`)).status, 400);
  assert.equal((await get("/prompts/33333333-3333-4333-8333-333333333333")).status, 404);
  assert.equal((await get(`/prompts/${ID_A}/fill`, { method: "GET" })).status, 405);
  assert.deepEqual(records, []);
});

test("API: a failing counter never breaks the answer (it is reported, not thrown)", async () => {
  const { records, errors, get } = setup({ throwing: true });
  const response = await get(`/prompts/${ID_A}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, ID_A);
  assert.equal(records.length, 1);
  assert.equal(errors.length, 1);
});

test("API: with no counter configured nothing is recorded and nothing breaks", async () => {
  const handler = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "k", fetch: upstream } });
  assert.equal((await handler(new Request(`${BASE}/prompts/${ID_A}`))).status, 200);
});

type RpcCall = { fn: string; args: Record<string, unknown> };
function fakeRpc(fail = false) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
        calls.push({ fn, args });
        if (fail) throw new Error("db down");
        return true as T;
      },
    },
  };
}

test("recorder: sends the secret, the source and a hashed client (never the raw IP)", async () => {
  const rpc = fakeRpc();
  const recorder = createRemotePromptUseRecorder({ client: rpc.client, secret: "s3cret", source: "api" });
  await recorder.record(ID_A, "203.0.113.7");
  const [call] = rpc.calls;
  assert.equal(call.fn, "record_public_api_prompt_use");
  assert.equal(call.args.p_secret, "s3cret");
  assert.equal(call.args.p_prompt_id, ID_A);
  assert.equal(call.args.p_source, "api");
  assert.match(String(call.args.p_client), /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(call.args).includes("203.0.113.7"), "the raw IP never reaches the database");
});

test("recorder: the client hash is stable per (surface, IP) and differs between surfaces and IPs", async () => {
  const hashes: string[] = [];
  const make = (source: "api" | "mcp") => {
    const rpc = fakeRpc();
    return { rpc, recorder: createRemotePromptUseRecorder({ client: rpc.client, secret: "s", source }) };
  };
  for (const [source, ip] of [["api", "1.1.1.1"], ["api", "1.1.1.1"], ["api", "2.2.2.2"], ["mcp", "1.1.1.1"]] as const) {
    const { rpc, recorder } = make(source);
    await recorder.record(ID_A, ip);
    hashes.push(String(rpc.calls[0].args.p_client));
  }
  assert.equal(hashes[0], hashes[1]);
  assert.equal(new Set(hashes).size, 3);
});

test("recorder: no client key → nothing is sent; a failing database is swallowed and reported", async () => {
  const idle = fakeRpc();
  await createRemotePromptUseRecorder({ client: idle.client, secret: "s", source: "mcp" }).record(ID_A, null);
  assert.equal(idle.calls.length, 0, "an unidentifiable caller is not counted (one shared bucket would make the number meaningless)");

  const errors: unknown[] = [];
  const failing = fakeRpc(true);
  await createRemotePromptUseRecorder({ client: failing.client, secret: "s", source: "mcp", onError: (e) => errors.push(e) }).record(ID_A, "1.1.1.1");
  assert.equal(errors.length, 1);
});
