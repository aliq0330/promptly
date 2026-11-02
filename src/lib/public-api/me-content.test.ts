import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createMeBackend, type MeDb, type MeTx } from "./index.ts";
import { serializeContent } from "../exchange/content-format.ts";

const SITE = "https://aliq0330.github.io/promptly";
const KEY = "pmt_" + "A".repeat(43);
const USER = "11111111-1111-4111-8111-111111111111";
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAMP = "2026-11-02T10:00:00.123Z";

type Rows = Record<string, unknown>[];
interface Call { sql: string; params: unknown[] }

function fakeDb(scopes: string[], query: (sql: string, params: unknown[]) => Rows = () => []) {
  const calls: Call[] = [];
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("_api_token_authenticate")) return [{ token_id: "tok-1", user_id: USER, scopes }];
        if (sql.startsWith("set local role") || sql.includes("set_config") || sql.includes("api_me_throttle")) return [];
        return query(sql, params);
      };
      return fn(tx);
    },
  };
  return { db, calls };
}

const handlerWith = (db: MeDb) =>
  createApiHandler({ config: { url: "https://x.supabase.co", anonKey: "anon" }, publicBaseUrl: "https://x.supabase.co/functions/v1/api/v1", me: createMeBackend({ db, siteUrl: SITE }) });

const call = (path: string, method = "GET", body?: unknown) =>
  new Request(`https://x.supabase.co/functions/v1/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}` },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const summaryRow = (id: string, i: number) => ({
  id, title: `T${i}`, description: "d", content_type: "image", status: "draft", visibility: "private",
  created_at: new Date("2026-11-01T10:00:00.000Z"), updated_at: new Date(STAMP), created_cursor: `2026-11-01T10:00:00.00012${i}Z`,
});

const READ = ["read"];
const WRITE = ["read", "write"];

test("each content kind lists through ITS OWN rpc, with limit+1 and edit/detail links", async () => {
  for (const [segment, fn] of [["requests", "api_me_requests"], ["presets", "api_me_presets"], ["workflows", "api_me_workflows"]] as const) {
    const seen: string[] = [];
    const { db } = fakeDb(READ, (sql) => { seen.push(sql); return sql.includes(fn) ? [summaryRow(ID_A, 1)] : []; });
    const response = await handlerWith(db)(call(`/me/${segment}?status=draft`));
    assert.equal(response.status, 200, segment);
    assert.ok(seen.some((sql) => sql.includes(`public.${fn}(`)), segment);
    const page = await response.json();
    assert.equal(page.items[0].id, ID_A);
    assert.equal(page.items[0].updatedAt, STAMP);
    assert.match(page.items[0].editUrl, new RegExp(`^${SITE}/.+\\?edit=${ID_A}$`));
    assert.match(page.items[0].url, new RegExp(`^${SITE}/${segment}/local\\?id=${ID_A}$`));
  }
});

test("one request / preset / workflow: the database jsonb comes back with links; not found → 404; bad id → 400", async () => {
  const { db } = fakeDb(READ, (sql, params) => (sql.includes("api_me_workflow($1") && params[0] === ID_A ? [{ detail: { id: ID_A, title: "W", steps: [{ position: 1 }], updatedAt: STAMP } }] : [{ detail: null }]));
  const handler = handlerWith(db);
  const found = await (await handler(call(`/me/workflows/${ID_A}`))).json();
  assert.equal(found.updatedAt, STAMP);
  assert.equal(found.steps[0].position, 1);
  assert.equal(found.editUrl, `${SITE}/workflows/create?edit=${ID_A}`);
  assert.equal((await handler(call("/me/presets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))).status, 404);
  assert.equal((await handler(call("/me/requests/not-a-uuid"))).status, 400);
});

test("POST /me/requests: the file becomes import_content('request', …) as TEXT jsonb; a read-only key is refused before any role is set", async () => {
  const sent: unknown[][] = [];
  const { db, calls } = fakeDb(WRITE, (sql, params) => {
    if (sql.includes("import_content")) { sent.push(params); return [{ report: { dryRun: false, ok: true, created: 1, items: [{ index: 1, status: "ok", id: ID_A }] } }]; }
    return [];
  });
  const file = serializeContent("request", [{ title: "Neon city", description: "A request", creativeDirection: "", contentType: "image", category: null, subcategory: null, tools: [], tags: ["neon"] }]);
  const response = await handlerWith(db)(call("/me/requests", "POST", file));
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.items[0].editUrl, `${SITE}/requests/new?edit=${ID_A}`);
  assert.equal(sent[0][0], "request");
  assert.equal(JSON.parse(String(sent[0][1]))[0].title, "Neon city");
  assert.ok(calls.some((c) => c.sql.includes("$2::text::jsonb")));

  const ro = fakeDb(READ);
  const denied = await handlerWith(ro.db)(call("/me/requests", "POST", file));
  assert.equal(denied.status, 403);
  assert.ok(!ro.calls.some((c) => c.sql.startsWith("set local role")));
});

test("POST /me/workflows goes to import_workflows; a file of ANOTHER kind is refused; garbage is 400", async () => {
  const seen: string[] = [];
  const { db } = fakeDb(WRITE, (sql) => { seen.push(sql); return [{ report: { dryRun: true, ok: true, created: 0, items: [] } }]; });
  const handler = handlerWith(db);
  const workflow = serializeContent("workflow", [{
    title: "Chain", description: "", contentType: "text", category: null, subcategory: null, tools: [], tags: [],
    steps: [{ key: "s1", title: "One", description: "", instructions: "Do it", prompt: null, inputs: [], outputs: [{ id: "o1", label: "Out" }] }],
  }]);
  assert.equal((await handler(call("/me/workflows?dry_run=true", "POST", workflow))).status, 200);
  assert.ok(seen.some((sql) => sql.includes("import_workflows")));
  const wrong = serializeContent("preset", [{ title: "P", description: "", contentType: "image", category: null, subcategory: null, tools: [], tags: [], selection: { a: "b" } }]);
  assert.equal((await handler(call("/me/workflows", "POST", wrong))).status, 400);
  assert.equal((await handler(call("/me/requests", "POST", "not json"))).status, 400);
  assert.equal((await handler(call("/me/presets", "POST", ""))).status, 400);
});

test("PATCH: the change goes to api_me_update_draft with the expected time, as TEXT jsonb, in the WRITE bucket; success carries the new token", async () => {
  const sent: unknown[][] = [];
  const { db, calls } = fakeDb(WRITE, (sql, params) => {
    if (sql.includes("api_me_update_draft")) { sent.push(params); return [{ result: { ok: true, id: ID_A, changed: ["title"], warnings: [], updatedAt: "2026-11-02T10:05:00.000Z" } }]; }
    return [];
  });
  const response = await handlerWith(db)(call(`/me/presets/${ID_A}`, "PATCH", { expectedUpdatedAt: STAMP, changes: { title: "New" } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.updatedAt, "2026-11-02T10:05:00.000Z");
  assert.deepEqual(body.changed, ["title"]);
  assert.equal(body.editUrl, `${SITE}/presets/create?edit=${ID_A}`);
  assert.deepEqual(sent[0].slice(0, 2), ["preset", ID_A]);
  assert.deepEqual(JSON.parse(String(sent[0][2])), { title: "New" });
  assert.equal(sent[0][3], STAMP);
  assert.ok(calls.some((c) => c.sql.includes("api_me_throttle") && c.params[0] === true));
  assert.ok(calls.some((c) => c.sql.includes("$3::text::jsonb")));
});

test("PATCH maps the database refusals: conflict → 409 (with the current time), not_draft/validation → 422, unknown field → 400, missing token → 400", async () => {
  const outcomes: Record<string, Record<string, unknown>> = {
    conflict: { ok: false, code: "conflict", currentUpdatedAt: "2026-11-02T11:00:00.000Z" },
    not_draft: { ok: false, code: "not_draft" },
    too_long: { ok: false, code: "too_long", field: "title" },
    unknown_field: { ok: false, code: "unknown_field", field: "visibility" },
    not_found: { ok: false, code: "not_found" },
  };
  let current = "conflict";
  const { db } = fakeDb(WRITE, (sql) => (sql.includes("api_me_update_draft") ? [{ result: outcomes[current] }] : []));
  const handler = handlerWith(db);
  const patch = () => handler(call(`/me/prompts/${ID_A}`, "PATCH", { expectedUpdatedAt: STAMP, changes: { title: "x" } }));
  const status: Record<string, number> = { conflict: 409, not_draft: 422, too_long: 422, unknown_field: 400, not_found: 404 };
  for (const name of Object.keys(outcomes)) {
    current = name;
    const response = await patch();
    assert.equal(response.status, status[name], name);
    const error = (await response.json()).error;
    if (name === "conflict") {
      assert.equal(error.code, "conflict");
      assert.match(error.message, /2026-11-02T11:00:00\.000Z/);
    }
    if (name === "too_long") assert.match(error.message, /title/);
  }
  // Eksik belirteç / yama istemci tarafında da reddedilir; veritabanına gitmez.
  const noToken = await handler(call(`/me/prompts/${ID_A}`, "PATCH", { changes: { title: "x" } }));
  assert.equal(noToken.status, 400);
  assert.equal((await handler(call(`/me/prompts/${ID_A}`, "PATCH", { expectedUpdatedAt: STAMP }))).status, 400);
  assert.equal((await handler(call(`/me/prompts/${ID_A}`, "PATCH", { expectedUpdatedAt: "yesterday", changes: { title: "x" } }))).status, 400);
  assert.equal((await handler(call(`/me/prompts/${ID_A}`, "PATCH", "not json"))).status, 400);
  assert.equal((await handler(call("/me/prompts/not-a-uuid", "PATCH", { expectedUpdatedAt: STAMP, changes: { title: "x" } }))).status, 400);
});

test("PATCH needs the write scope; there is no way to publish or delete: DELETE/PUT are 405 and publish fields are the database's to refuse", async () => {
  const ro = fakeDb(READ);
  const handler = handlerWith(ro.db);
  const denied = await handler(call(`/me/requests/${ID_A}`, "PATCH", { expectedUpdatedAt: STAMP, changes: { title: "x" } }));
  assert.equal(denied.status, 403);
  assert.ok(!ro.calls.some((c) => c.sql.includes("api_me_update_draft")));
  for (const method of ["DELETE", "PUT"]) {
    assert.equal((await handler(call(`/me/requests/${ID_A}`, method))).status, 405, method);
    assert.equal((await handler(call(`/me/prompts/${ID_A}`, method))).status, 405, method);
  }
  // `status`/`visibility` yamada gönderilirse çağrı veritabanına gider ve orada `unknown_field` ile reddedilir (SQL testi 20-21).
  const rw = fakeDb(WRITE, (sql, params) => (sql.includes("api_me_update_draft") ? [{ result: { ok: false, code: "unknown_field", field: JSON.parse(String(params[2])).status ? "status" : "visibility" } }] : []));
  const refused = await handlerWith(rw.db)(call(`/me/requests/${ID_A}`, "PATCH", { expectedUpdatedAt: STAMP, changes: { status: "published" } }));
  assert.equal(refused.status, 400);
});

test("CORS allows PATCH", async () => {
  const { db } = fakeDb(READ);
  const response = await handlerWith(db)(new Request("https://x.supabase.co/functions/v1/api/v1/me", { method: "OPTIONS" }));
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /PATCH/);
});
