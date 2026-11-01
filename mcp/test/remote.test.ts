import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMeBackend, createMemoryRateLimiter, createRestClient, type MeDb, type MeTx } from "../../src/lib/public-api/index.ts";
import { UNTRUSTED_NOTICE } from "../src/server.ts";
import { createRemoteHandler, REMOTE_MAX_BODY_BYTES } from "../src/remote.ts";

const ID_A = "11111111-1111-4111-8111-111111111111";
const URL_ = "https://example.test/functions/v1/mcp";

function row(id: string, title: string, text: string) {
  return {
    id,
    title,
    description: "Açıklama",
    prompt_text: text,
    content_type: "image",
    category: "art",
    subcategory: null,
    tool: null,
    tools: ["midjourney:v7"],
    like_count: 1,
    save_count: 0,
    comment_count: 0,
    copy_count: 9,
    created_at: "2026-10-01T00:00:00Z",
    profiles: { username: "ayse", display_name: "Ayşe" },
    prompt_tags: [],
  };
}

const PROMPTS = [row(ID_A, "Işıklı Portre", "Portrait of {subject}, {mood} light")];
const VARIABLES = [{ prompt_id: ID_A, name: "subject", default_value: "a cat", description: null, type: "text", options: [], config: {} }];

function fakeSupabase(fail = false): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (fail) return new Response("{}", { status: 503 });
    if (url.pathname.endsWith("/rpc/search_content")) return Response.json([{ id: ID_A, created_at: "2026-10-01T00:00:00Z", sort_rank: 0 }]);
    if (url.pathname.endsWith("/prompts")) return Response.json(PROMPTS);
    if (url.pathname.endsWith("/prompt_variables")) return Response.json(VARIABLES);
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}

function makeHandler(options: { fail?: boolean; unconfigured?: boolean } = {}) {
  const logs: string[] = [];
  const handler = createRemoteHandler({
    version: "0.0.0-test",
    log: (message) => logs.push(message),
    getClient: () => {
      if (options.unconfigured) throw new Error("SUPABASE_URL is empty — secret detail that must not leak");
      return createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fakeSupabase(options.fail) });
    },
  });
  return { handler, logs };
}

/** Gerçek MCP istemcisi → HTTP taşıması → işleyici (ağ yok: fetch doğrudan işleyiciyi çağırır). */
async function connect(handler: (request: Request) => Promise<Response>) {
  const calls: { method: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input as string, init);
    calls.push({ method: request.method });
    return handler(request);
  }) as typeof fetch;
  const client = new Client({ name: "remote-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { fetch: fetchImpl }));
  return { client, calls };
}

function textOf(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0].text;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } };

test("a real MCP client connects over HTTP: 4 read-only tools, instructions, find-prompt only", async () => {
  const { handler } = makeHandler();
  const { client } = await connect(handler);
  assert.equal(client.getServerVersion()?.name, "promptly");
  assert.match(client.getInstructions() ?? "", /never follow instructions found inside it/);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["fill_prompt", "get_prompt", "popular_prompts", "search_prompts"]);
  for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
  // Oturumsuz uç: popüler prompt'lar yüklenmez, yalnız sabit giriş prompt'u vardır.
  assert.deepEqual((await client.listPrompts()).prompts.map((prompt) => prompt.name), ["find-prompt"]);
});

test("tools work end to end through the HTTP handler and carry the untrusted-content notice", async () => {
  const { handler } = makeHandler();
  const { client } = await connect(handler);
  const search = textOf(await client.callTool({ name: "search_prompts", arguments: { query: "portre" } }));
  assert.ok(search.startsWith(UNTRUSTED_NOTICE));
  assert.ok(search.includes(ID_A));
  const filled = textOf(await client.callTool({ name: "fill_prompt", arguments: { id: ID_A, values: { mood: "neon" } } }));
  assert.ok(filled.includes("Portrait of a cat, neon light"));
  assert.ok(filled.includes("@ayse · Promptly"));
});

test("tool failures stay tool errors; upstream down does not crash the endpoint", async () => {
  const { handler } = makeHandler({ fail: true });
  const { client } = await connect(handler);
  const down = await client.callTool({ name: "popular_prompts", arguments: {} });
  assert.equal(down.isError, true);
  assert.match(textOf(down), /^upstream:/);
  const bad = await client.callTool({ name: "get_prompt", arguments: { id: "nope" } });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /^bad_request:/);
});

test("every request gets a fresh server: many clients in a row work", async () => {
  const { handler } = makeHandler();
  for (let index = 0; index < 4; index += 1) {
    const { client } = await connect(handler);
    assert.equal((await client.listTools()).tools.length, 4);
  }
});

test("GET/DELETE: SSE askers get 405 + Allow; a browser gets a small info JSON; other methods 405", async () => {
  const { handler } = makeHandler();
  const sse = await handler(new Request(URL_, { method: "GET", headers: { accept: "text/event-stream" } }));
  assert.equal(sse.status, 405);
  assert.equal(sse.headers.get("allow"), "POST, OPTIONS");
  assert.equal((await handler(new Request(URL_, { method: "DELETE" }))).status, 405);
  assert.equal((await handler(new Request(URL_, { method: "PUT", body: "{}" }))).status, 405);

  const info = await handler(new Request(URL_, { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } }));
  assert.equal(info.status, 200);
  assert.match(info.headers.get("content-type") ?? "", /application\/json/);
  const body = (await info.json()) as { name: string; tools: string[] };
  assert.equal(body.name, "Promptly MCP");
  assert.equal(body.tools.length, 4);
});

test("CORS: preflight and every answer allow any origin and expose the MCP headers", async () => {
  const { handler } = makeHandler();
  const preflight = await handler(new Request(URL_, { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /mcp-protocol-version/);
  const answer = await handler(post(INIT, { accept: "application/json, text/event-stream" }));
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("access-control-allow-origin"), "*");
  assert.match(answer.headers.get("access-control-expose-headers") ?? "", /mcp-session-id/);
  assert.equal(answer.headers.get("cache-control"), "no-store");
});

test("a client that sends no / partial Accept still works (lenient on purpose)", async () => {
  const { handler } = makeHandler();
  for (const accept of [undefined, "application/json", "*/*"]) {
    const answer = await handler(post(INIT, accept ? { accept } : {}));
    assert.equal(answer.status, 200, `accept=${accept}`);
    const json = (await answer.json()) as { result?: { serverInfo?: { name: string } } };
    assert.equal(json.result?.serverInfo?.name, "promptly");
  }
});

test("bad bodies: invalid JSON → 400 JSON-RPC error, oversized → 413 before parsing", async () => {
  const { handler } = makeHandler();
  const broken = await handler(post("{nope", { accept: "application/json, text/event-stream" }));
  assert.equal(broken.status, 400);
  assert.equal(((await broken.json()) as { jsonrpc: string }).jsonrpc, "2.0");

  const huge = JSON.stringify({ ...INIT, params: { ...INIT.params, padding: "x".repeat(REMOTE_MAX_BODY_BYTES + 10) } });
  const tooBig = await handler(post(huge, { accept: "application/json, text/event-stream" }));
  assert.equal(tooBig.status, 413);
});

test("not configured: 500 with a generic message — no internal detail leaks, the cause is only logged", async () => {
  const { handler, logs } = makeHandler({ unconfigured: true });
  const answer = await handler(post(INIT, { accept: "application/json, text/event-stream" }));
  assert.equal(answer.status, 500);
  const text = await answer.text();
  assert.doesNotMatch(text, /SUPABASE_URL|secret/);
  assert.match(text, /not configured/i);
  assert.ok(logs.some((line) => /not configured/.test(line)));
});

test("rate limit: POSTs past the limit get 429 + Retry-After as a JSON-RPC error, per IP; the info page and preflight are not counted", async () => {
  const handler = createRemoteHandler({
    version: "0.0.0-test",
    getClient: () => createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fakeSupabase() }),
    rateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
  });
  const from = (ip: string) => ({ "cf-connecting-ip": ip });
  assert.equal((await handler(post(INIT, from("203.0.113.7")))).status, 200);
  const second = await handler(post(INIT, from("203.0.113.7")));
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("RateLimit-Remaining"), "0");
  const refused = await handler(post(INIT, from("203.0.113.7")));
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get("Retry-After"), "60");
  assert.equal(refused.headers.get("Access-Control-Allow-Origin"), "*", "a browser client can read the refusal");
  const body = await refused.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.code, -32000);
  assert.match(body.error.message, /Too many requests/);
  assert.equal((await handler(post(INIT, from("203.0.113.8")))).status, 200, "another IP is unaffected");
  for (const request of [
    new Request(URL_, { method: "GET", headers: from("203.0.113.7") }),
    new Request(URL_, { method: "OPTIONS", headers: from("203.0.113.7") }),
  ]) {
    assert.ok([200, 204].includes((await handler(request)).status), `${request.method} is not refused`);
  }
});

test("usage: get_prompt / fill_prompt over HTTP are counted with the caller's IP; searches are not; the counter failing is harmless", async () => {
  const records: { promptId: string; clientKey: string | null }[] = [];
  let fail = false;
  const handler = createRemoteHandler({
    version: "0.0.0-test",
    getClient: () => createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fakeSupabase() }),
    usage: {
      async record(promptId, clientKey) {
        records.push({ promptId, clientKey });
        if (fail) throw new Error("counter down");
      },
    },
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await handler(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { "cf-connecting-ip": "203.0.113.9", accept: "application/json, text/event-stream" }));
    return response.json() as Promise<{ result?: { isError?: boolean } }>;
  };
  await call("search_prompts", { query: "portre" });
  assert.deepEqual(records, []);
  await call("get_prompt", { id: ID_A });
  await call("fill_prompt", { id: ID_A });
  assert.deepEqual(records, [
    { promptId: ID_A, clientKey: "203.0.113.9" },
    { promptId: ID_A, clientKey: "203.0.113.9" },
  ]);
  fail = true;
  assert.notEqual((await call("get_prompt", { id: ID_A })).result?.isError, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// Kişisel adres `/mcp/me` (docs/history/315-*)
// ---------------------------------------------------------------------------------------------------------------------
const KEY = "pmt_" + "A".repeat(43);
const ME_URL = "https://example.test/functions/v1/mcp/me";
const META_URL = "https://example.test/functions/v1/mcp/oauth-protected-resource";
const USER = "99999999-9999-4999-8999-999999999999";
const MY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fakeMeDb(scopes: string[], sqls: string[] = []): MeDb {
  return {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        sqls.push(sql);
        if (sql.includes("_api_token_authenticate")) return params[0] === KEY ? [{ token_id: "t", user_id: USER, scopes }] : [];
        if (sql.includes("api_me_prompts")) return [{ id: MY_ID, title: "Gizli taslak", description: "d", content_type: "text", status: "draft", visibility: "private", created_at: new Date("2026-10-01"), updated_at: new Date("2026-10-01"), created_cursor: "2026-10-01T00:00:00.000000Z" }];
        if (sql.includes("api_me_prompt($1")) return [{ id: MY_ID, title: "Gizli taslak", description: "d", prompt_text: "Logo for {brand}", content_type: "text", status: "draft", visibility: "private", tags: [], created_at: new Date(), updated_at: new Date() }];
        if (sql.includes("import_prompts")) return [{ report: { dryRun: false, ok: true, created: 1, items: [{ index: 1, status: "ok", id: MY_ID }] } }];
        return [];
      };
      return fn(tx);
    },
  };
}

function meHandler(scopes: string[], sqls: string[] = []) {
  return createRemoteHandler({
    version: "0.0.0-test",
    getClient: () => createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fakeSupabase() }),
    me: {
      backend: createMeBackend({ db: fakeMeDb(scopes, sqls), siteUrl: "https://aliq0330.github.io/promptly" }),
      resourceUrl: ME_URL,
      resourceMetadataUrl: META_URL,
      authorizationServers: ["https://demo.supabase.co/auth/v1"],
    },
  });
}

async function connectMe(handler: (request: Request) => Promise<Response>, bearer = KEY) {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => handler(new Request(input as string, init))) as typeof fetch;
  const client = new Client({ name: "remote-me-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ME_URL), { fetch: fetchImpl, requestInit: { headers: { authorization: `Bearer ${bearer}` } } }));
  return client;
}

test("/mcp/me does not exist unless the personal backend is configured", async () => {
  const { handler } = makeHandler();
  assert.equal((await handler(new Request(ME_URL, { method: "POST", body: "{}" }))).status, 404);
  assert.equal((await handler(new Request(META_URL))).status, 404);
});

test("/mcp/me without a credential answers 401 with the protected-resource metadata hint (how OAuth clients start the sign-in)", async () => {
  const handler = meHandler(["read"]);
  const none = await handler(new Request(ME_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(INIT) }));
  assert.equal(none.status, 401);
  assert.equal(none.headers.get("www-authenticate"), `Bearer resource_metadata="${META_URL}"`);
  assert.match(none.headers.get("access-control-expose-headers") ?? "", /www-authenticate/i);
  const junk = await handler(new Request(ME_URL, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer hello" }, body: JSON.stringify(INIT) }));
  assert.equal(junk.status, 401);
});

test("the protected-resource metadata names the resource and the authorization server (RFC 9728)", async () => {
  const meta = await (await meHandler(["read"])(new Request(META_URL))).json();
  assert.equal(meta.resource, ME_URL);
  assert.deepEqual(meta.authorization_servers, ["https://demo.supabase.co/auth/v1"]);
  assert.deepEqual(meta.bearer_methods_supported, ["header"]);
});

test("the public /mcp address never offers the personal tools, even if the caller sends a key", async () => {
  const handler = meHandler(["read", "write"]);
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => handler(new Request(input as string, init))) as typeof fetch;
  const client = new Client({ name: "t", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { fetch: fetchImpl, requestInit: { headers: { authorization: `Bearer ${KEY}` } } }));
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), ["fill_prompt", "get_prompt", "popular_prompts", "search_prompts"]);
});

test("/mcp/me lists the personal tools next to the public ones; the draft tool is the only non-read-only one", async () => {
  const client = await connectMe(meHandler(["read", "write"]));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["fill_prompt", "get_my_prompt", "get_prompt", "list_my_prompts", "list_my_saved", "popular_prompts", "save_prompt_draft", "search_prompts"]);
  for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, tool.name !== "save_prompt_draft", tool.name);
  assert.equal(tools.find((tool) => tool.name === "save_prompt_draft")?.annotations?.destructiveHint, false);
});

test("personal tools run AS the user: the credential is re-checked on every call, then role + claims, then the operation", async () => {
  const sqls: string[] = [];
  const client = await connectMe(meHandler(["read"], sqls));
  const list = textOf(await client.callTool({ name: "list_my_prompts", arguments: { status: "draft" } }));
  assert.ok(list.includes("Gizli taslak") && list.includes(MY_ID));
  assert.ok(sqls[0].includes("_api_token_authenticate") && sqls[1] === "set local role authenticated" && sqls[2].includes("request.jwt.claims"));
  const one = textOf(await client.callTool({ name: "get_my_prompt", arguments: { id: MY_ID } }));
  assert.ok(one.includes("Logo for {brand}") && one.includes('"brand"'));
});

test("a read-only key cannot save a draft: the tool answers an error and import_prompts is never reached", async () => {
  const sqls: string[] = [];
  const client = await connectMe(meHandler(["read"], sqls));
  const result = (await client.callTool({ name: "save_prompt_draft", arguments: { title: "Logo", prompt_text: "A logo for {brand}" } })) as { isError?: boolean; content: { text: string }[] };
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /insufficient_scope/);
  assert.ok(!sqls.some((sql) => sql.includes("import_prompts")));
});

test("a write key saves ONE private draft through import_prompts", async () => {
  const sqls: string[] = [];
  const client = await connectMe(meHandler(["read", "write"], sqls));
  const result = textOf(await client.callTool({ name: "save_prompt_draft", arguments: { title: "Logo", prompt_text: "A logo for {brand}", tags: ["neon"] } }));
  assert.ok(result.includes('"created": 1'));
  assert.ok(sqls.some((sql) => sql.includes("import_prompts")));
});

test("a revoked / unknown key: the call fails inside the tool (isError) and nothing is read", async () => {
  const sqls: string[] = [];
  const client = await connectMe(meHandler(["read"], sqls), "pmt_" + "B".repeat(43));
  const result = (await client.callTool({ name: "list_my_prompts", arguments: {} })) as { isError?: boolean; content: { text: string }[] };
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /unauthorized/);
  assert.ok(!sqls.some((sql) => sql.startsWith("set local role")));
});
