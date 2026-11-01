import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createMeBackend, bearerOf, looksLikeCredential, type MeDb, type MeTx } from "./index.ts";
import { serializeJson } from "../exchange/json.ts";
import type { ExchangePrompt } from "../exchange/prompt-format.ts";

const SITE = "https://aliq0330.github.io/promptly";
const KEY = "pmt_" + "A".repeat(43);
const USER = "11111111-1111-4111-8111-111111111111";
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Rows = Record<string, unknown>[];
interface Call { sql: string; params: unknown[] }

/** Sahte veritabanı: her işlem `calls`'a yazılır; sorgu yanıtı SQL'in başına göre verilir. */
function fakeDb(handlers: { authenticate?: Rows; throttle?: Error; query?: (sql: string, params: unknown[]) => Rows | Error } = {}) {
  const calls: Call[] = [];
  const state = { transactions: 0 };
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      state.transactions += 1;
      const tx: MeTx = async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("_api_token_authenticate")) return handlers.authenticate ?? [{ token_id: "tok-1", user_id: USER, scopes: ["read"] }];
        if (sql.startsWith("set local role") || sql.includes("set_config")) return [];
        if (sql.includes("api_me_throttle")) {
          if (handlers.throttle) throw handlers.throttle;
          return [];
        }
        const out = handlers.query?.(sql, params) ?? [];
        if (out instanceof Error) throw out;
        return out;
      };
      return fn(tx);
    },
  };
  return { db, calls, state };
}

function handlerWith(db: MeDb, verifyJwt?: (jwt: string) => Promise<string | null>) {
  return createApiHandler({
    config: { url: "https://x.supabase.co", anonKey: "anon" },
    publicBaseUrl: "https://x.supabase.co/functions/v1/api/v1",
    me: createMeBackend({ db, verifyJwt, siteUrl: SITE }),
  });
}

const get = (path: string, key: string | null = KEY, method = "GET", body?: string) =>
  new Request(`https://x.supabase.co/functions/v1/api/v1${path}`, { method, headers: key ? { authorization: `Bearer ${key}` } : {}, body });

const filePrompt: ExchangePrompt = { title: "Logo", description: "d", promptText: "A logo for {brand}", contentType: "text", category: null, subcategory: null, tools: [], tags: [], variables: [] };

test("the user is established in ONE transaction, in order: authenticate → role → claims → throttle → operation", async () => {
  const { db, calls, state } = fakeDb({ query: () => [{ user_id: USER, username: "ayse" }] });
  const response = await handlerWith(db)(get("/me"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store", "personal responses are never cached");
  assert.equal(state.transactions, 1);
  assert.ok(calls[0].sql.includes("_api_token_authenticate") && calls[0].params[0] === KEY);
  assert.equal(calls[1].sql, "set local role authenticated");
  assert.ok(calls[2].sql.includes("request.jwt.claims"));
  assert.deepEqual(JSON.parse(String(calls[2].params[0])), { sub: USER, role: "authenticated" });
  assert.ok(calls[3].sql.includes("api_me_throttle") && calls[3].params[0] === false);
  assert.ok(calls[4].sql.includes("api_me_profile"));
  assert.deepEqual(await response.json(), { user: { id: USER, username: "ayse" }, scopes: ["read"], via: "key" });
});

test("no credential → 401 with a WWW-Authenticate header, and the database is never touched", async () => {
  const { db, state } = fakeDb();
  const response = await handlerWith(db)(get("/me", null));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer/);
  assert.equal(state.transactions, 0);
});

test("an unknown / revoked / expired key (no row from the authenticator) → 401 and it never becomes a user", async () => {
  const { db, calls } = fakeDb({ authenticate: [] });
  const response = await handlerWith(db)(get("/me/prompts"));
  assert.equal(response.status, 401);
  assert.ok(!calls.some((c) => c.sql.startsWith("set local role")), "role is not set for a rejected key");
});

test("a malformed bearer is rejected before any database work", async () => {
  const { db, state } = fakeDb();
  assert.equal((await handlerWith(db)(get("/me", "not-a-key"))).status, 401);
  assert.equal(state.transactions, 0);
});

test("a read-only key cannot POST: 403 insufficient_scope and no role is set", async () => {
  const { db, calls } = fakeDb({ authenticate: [{ token_id: "t", user_id: USER, scopes: ["read"] }] });
  const response = await handlerWith(db)(get("/me/prompts", KEY, "POST", serializeJson([filePrompt])));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "insufficient_scope");
  assert.ok(!calls.some((c) => c.sql.startsWith("set local role")));
});

test("OAuth: the JWT is verified outside the database, grants READ only, and never touches the key authenticator", async () => {
  const { db, calls } = fakeDb({ query: () => [{ user_id: USER, username: "ayse" }] });
  let verified = "";
  const handler = handlerWith(db, async (jwt) => { verified = jwt; return USER; });
  const jwt = "aaa.bbb.ccc";
  const ok = await handler(get("/me", jwt));
  assert.equal(ok.status, 200);
  assert.equal(verified, jwt);
  assert.equal((await ok.json()).via, "oauth");
  assert.ok(!calls.some((c) => c.sql.includes("_api_token_authenticate")));
  const denied = await handler(get("/me/prompts", jwt, "POST", serializeJson([filePrompt])));
  assert.equal(denied.status, 403, "an OAuth token has no write scope");
  const bad = await handlerWith(db, async () => null)(get("/me", jwt));
  assert.equal(bad.status, 401);
});

test("without an OAuth verifier a JWT-shaped bearer is simply unauthorized", async () => {
  const { db } = fakeDb();
  assert.equal((await handlerWith(db)(get("/me", "aaa.bbb.ccc"))).status, 401);
});

test("the per-account rate limit becomes 429; an unknown database error becomes 502 without leaking its text", async () => {
  const limited = await handlerWith(fakeDb({ throttle: new Error("rate_limit") }).db)(get("/me"));
  assert.equal(limited.status, 429);
  const broken = await handlerWith(fakeDb({ query: () => new Error('relation "secret_table" does not exist') }).db)(get("/me/prompts"));
  assert.equal(broken.status, 502);
  assert.ok(!JSON.stringify(await broken.json()).includes("secret_table"));
});

test("listing prompts: limit+1 is requested, the cursor is microsecond-exact and round-trips", async () => {
  const rows: Rows = [ID_A, ID_B, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"].map((id, i) => ({
    id, title: `P${i}`, description: "d", content_type: "text", status: "draft", visibility: "private",
    created_at: new Date("2026-10-01T10:00:00.000Z"), updated_at: new Date("2026-10-01T10:00:00.000Z"), created_cursor: `2026-10-01T10:00:00.00012${i}Z`,
  }));
  const seen: unknown[][] = [];
  const { db } = fakeDb({ query: (sql, params) => { if (sql.includes("api_me_prompts")) { seen.push(params); return rows; } return []; } });
  const handler = handlerWith(db);
  const page = await (await handler(get("/me/prompts?limit=2"))).json();
  assert.equal(page.items.length, 2, "the extra row only signals a next page");
  assert.deepEqual(seen[0], [3, null, null, null]);
  assert.ok(page.nextCursor);
  assert.equal(page.items[0].url, `${SITE}/share/prompt/${ID_A}/`);
  await handler(get(`/me/prompts?limit=2&cursor=${page.nextCursor}&status=draft`));
  assert.equal(seen[1][1], "2026-10-01T10:00:00.000121Z", "the microsecond text is passed back untouched");
  assert.equal(seen[1][2], ID_B);
  assert.equal(seen[1][3], "draft");
});

test("listing: no cursor when the page is the last one; bad limit / cursor / status are 400", async () => {
  const { db } = fakeDb({ query: () => [] });
  const handler = handlerWith(db);
  assert.equal((await (await handler(get("/me/prompts"))).json()).nextCursor, null);
  assert.equal((await handler(get("/me/prompts?limit=0"))).status, 400);
  assert.equal((await handler(get("/me/prompts?limit=abc"))).status, 400);
  assert.equal((await handler(get("/me/prompts?cursor=!!!"))).status, 400);
  assert.equal((await handler(get("/me/prompts?status=published%27--"))).status, 400);
  assert.equal((await handler(get("/me/saved?limit=51"))).status, 400);
});

test("one prompt: text, tags and detected variables; not found → 404; bad id → 400", async () => {
  const { db } = fakeDb({ query: (sql, params) => sql.includes("api_me_prompt($1") && params[0] === ID_A
    ? [{ id: ID_A, title: "Logo", description: "d", prompt_text: "A logo for {brand} in {style}", content_type: "text", status: "draft", visibility: "private", tags: ["neon"], created_at: new Date(), updated_at: new Date() }] : [] });
  const handler = handlerWith(db);
  const found = await (await handler(get(`/me/prompts/${ID_A}`))).json();
  assert.equal(found.promptText, "A logo for {brand} in {style}");
  assert.deepEqual(found.tags, ["neon"]);
  assert.deepEqual(found.variables, ["brand", "style"]);
  assert.equal((await handler(get(`/me/prompts/${ID_B}`))).status, 404);
  assert.equal((await handler(get("/me/prompts/not-a-uuid"))).status, 400);
});

test("saved prompts are listed with their save time", async () => {
  const { db } = fakeDb({ query: (sql) => sql.includes("api_me_saved") ? [{ id: ID_A, title: "S", description: "d", content_type: "text", saved_at: new Date("2026-10-02T00:00:00Z"), saved_cursor: "2026-10-02T00:00:00.000000Z" }] : [] });
  const page = await (await handlerWith(db)(get("/me/saved"))).json();
  assert.equal(page.items[0].savedAt, "2026-10-02T00:00:00.000Z");
  assert.equal(page.nextCursor, null);
});

test("POST /me/prompts: a write key sends the file's items to import_prompts; the result status follows the report", async () => {
  const sent: unknown[][] = [];
  const { db } = fakeDb({
    authenticate: [{ token_id: "t", user_id: USER, scopes: ["read", "write"] }],
    query: (sql, params) => { if (sql.includes("import_prompts")) { sent.push(params); return [{ report: { dryRun: params[1], ok: true, created: 1, items: [{ index: 1, status: "ok", id: ID_A }] } }]; } return []; },
  });
  const handler = handlerWith(db);
  const response = await handler(get("/me/prompts", KEY, "POST", serializeJson([filePrompt])));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).created, 1);
  const items = JSON.parse(String(sent[0][0]));
  assert.equal(items[0].title, "Logo");
  assert.equal(sent[0][1], false);
  await handler(get("/me/prompts?dry_run=true", KEY, "POST", serializeJson([filePrompt])));
  assert.equal(sent[1][1], true);
  const throttled = db; void throttled;
});

test("POST /me/prompts: the write bucket is used for the throttle; a report that is not ok is 422", async () => {
  const { db, calls } = fakeDb({
    authenticate: [{ token_id: "t", user_id: USER, scopes: ["write", "read"] }],
    query: (sql) => (sql.includes("import_prompts") ? [{ report: { dryRun: false, ok: false, created: 0, items: [{ index: 1, status: "duplicate" }] } }] : []),
  });
  const response = await handlerWith(db)(get("/me/prompts", KEY, "POST", serializeJson([filePrompt])));
  assert.equal(response.status, 422);
  assert.ok(calls.some((c) => c.sql.includes("api_me_throttle") && c.params[0] === true));
});

test("POST /me/prompts: garbage, empty and oversized bodies are 400 before the import runs", async () => {
  const { db, calls } = fakeDb({ authenticate: [{ token_id: "t", user_id: USER, scopes: ["write"] }] });
  const handler = handlerWith(db);
  for (const body of ["", "not json", "x".repeat(70 * 1024)]) {
    const response = await handler(get("/me/prompts", KEY, "POST", body));
    assert.equal(response.status, 400, `body of ${body.length} chars`);
  }
  assert.ok(!calls.some((c) => c.sql.includes("import_prompts")));
});

test("without a me backend the personal endpoints do not exist (404), and wrong methods are 405", async () => {
  const plain = createApiHandler({ config: { url: "https://x.supabase.co", anonKey: "anon" } });
  assert.equal((await plain(get("/me"))).status, 404);
  const { db } = fakeDb();
  const handler = handlerWith(db);
  assert.equal((await handler(get("/me", KEY, "POST"))).status, 405);
  assert.equal((await handler(get("/me/prompts", KEY, "DELETE"))).status, 405);
  assert.equal((await handler(get("/me/unknown"))).status, 404);
});

test("credential helpers: bearer extraction and the cheap shape check", () => {
  assert.equal(bearerOf(new Headers({ authorization: `Bearer ${KEY}` })), KEY);
  assert.equal(bearerOf(new Headers({ authorization: "Basic abc" })), null);
  assert.equal(bearerOf(new Headers()), null);
  assert.ok(looksLikeCredential(KEY) && looksLikeCredential("a.b.c") && !looksLikeCredential("hello"));
});
