import { test } from "node:test";
import assert from "node:assert/strict";
import { createOauthHandler, oauthMetadata, oauthRouteOf, type OauthQuery, type RateLimiter } from "./index.ts";

const ISSUER = "https://proj.supabase.co/functions/v1/oauth";
const SITE = "https://aliq0330.github.io/promptly";
const RESOURCE = "https://proj.supabase.co/functions/v1/mcp/me";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CHALLENGE = "A".repeat(43);

interface Call { sql: string; params: unknown[] }

function setup(handler: (sql: string, params: unknown[]) => Record<string, unknown>[] | Error = () => [], extra: { rateLimiter?: RateLimiter; registerLimiter?: RateLimiter } = {}) {
  const calls: Call[] = [];
  const errors: unknown[] = [];
  const query: OauthQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    const out = handler(sql, params);
    if (out instanceof Error) throw out;
    return out;
  };
  const run = createOauthHandler({ query, issuer: ISSUER, siteUrl: SITE, resources: [RESOURCE], onError: (e) => errors.push(e), ...extra });
  return { run, calls, errors };
}

const known = (ok: boolean) => (sql: string) => (sql.includes("oauth_clients where id") ? [{ ok }] : sql.includes("_oauth_start_request") ? [{ request: "RAW-REQUEST" }] : []);
const authorizeUrl = (params: Record<string, string>) => `${ISSUER}/authorize?${new URLSearchParams(params)}`;
const good = { response_type: "code", client_id: CLIENT, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: "S256", state: "st" };
const form = (body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`${ISSUER}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
const jsonPost = (path: string, body: unknown) => new Request(`${ISSUER}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("routing: the tail picks the endpoint, with or without the function prefix", () => {
  assert.equal(oauthRouteOf("/functions/v1/oauth/token"), "token");
  assert.equal(oauthRouteOf("/token/"), "token");
  assert.equal(oauthRouteOf("/oauth/authorize"), "authorize");
  assert.equal(oauthRouteOf("/functions/v1/oauth/register"), "register");
  assert.equal(oauthRouteOf("/functions/v1/oauth/revoke"), "revoke");
  assert.equal(oauthRouteOf("/functions/v1/oauth/.well-known/oauth-authorization-server"), "metadata");
  assert.equal(oauthRouteOf("/functions/v1/oauth/.well-known/openid-configuration"), "metadata");
  assert.equal(oauthRouteOf("/functions/v1/oauth/.well-known/oauth-authorization-server/functions/v1/oauth"), "metadata");
  assert.equal(oauthRouteOf("/functions/v1/oauth/jwks"), "jwks");
  assert.equal(oauthRouteOf("/functions/v1/oauth/other"), null);
});

test("metadata: public clients only, PKCE S256, our own endpoints and scopes", async () => {
  const { run } = setup();
  const response = await run(new Request(`${ISSUER}/.well-known/oauth-authorization-server`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, oauthMetadata(ISSUER, SITE));
  assert.equal(body.issuer, ISSUER);
  assert.equal(body.authorization_endpoint, `${ISSUER}/authorize`);
  assert.equal(body.registration_endpoint, `${ISSUER}/register`);
  assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(body.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(body.scopes_supported, ["read", "write"]);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("register: a public client is created through the database function, whatever auth method it asks for", async () => {
  const { run, calls } = setup((sql) => sql.includes("_oauth_register_client") ? [{ client: { client_id: CLIENT, client_name: "Claude", redirect_uris: [REDIRECT], client_id_issued_at: 1 } }] : []);
  const response = await run(jsonPost("register", { client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.client_id, CLIENT);
  assert.equal(body.token_endpoint_auth_method, "none");
  assert.equal(body.client_secret, undefined);
  assert.deepEqual(JSON.parse(String(calls[0].params[1])), [REDIRECT]);
});

test("register: invalid metadata is a 400 with the OAuth error code; a busy server is 503; nothing leaks", async () => {
  const bad = setup(() => new Error("invalid_redirect_uri: http://evil.test/cb"));
  const r1 = await bad.run(jsonPost("register", { client_name: "x", redirect_uris: ["http://evil.test/cb"] }));
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).error, "invalid_redirect_uri");
  const busy = setup(() => new Error("server_busy"));
  assert.equal((await busy.run(jsonPost("register", { client_name: "x", redirect_uris: [REDIRECT] }))).status, 503);
  const broken = setup(() => new Error("connection to 10.0.0.5 refused"));
  const r3 = await broken.run(jsonPost("register", { client_name: "x", redirect_uris: [REDIRECT] }));
  assert.equal(r3.status, 500);
  assert.doesNotMatch(JSON.stringify(await r3.json()), /10\.0\.0\.5/);
  assert.equal(broken.errors.length, 1);
});

test("register: bodies that are not objects / have no name or URIs never reach the database", async () => {
  const { run, calls } = setup();
  assert.equal((await run(jsonPost("register", []))).status, 400);
  assert.equal((await run(jsonPost("register", { redirect_uris: [REDIRECT] }))).status, 400);
  assert.equal((await run(jsonPost("register", { client_name: "x", redirect_uris: [] }))).status, 400);
  assert.equal((await run(jsonPost("register", { client_name: "x", redirect_uris: [REDIRECT, 5] }))).status, 400);
  assert.equal(calls.length, 0);
});

test("register has its own, narrower rate limit", async () => {
  const strict: RateLimiter = { check: async () => ({ allowed: false, limit: 10, remaining: 0, resetAt: Date.now() + 60000, retryAfterSeconds: 60 }) };
  const { run, calls } = setup(() => [], { registerLimiter: strict });
  const response = await run(new Request(`${ISSUER}/register`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: "{}" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(calls.length, 0);
});

test("authorize: a valid request is stored and the user goes to the site's consent page with the opaque request token", async () => {
  const { run, calls } = setup(known(true));
  const response = await run(new Request(authorizeUrl({ ...good, resource: RESOURCE, scope: "read write" })));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${SITE}/oauth/connect/?request=RAW-REQUEST`);
  const start = calls.find((c) => c.sql.includes("_oauth_start_request"));
  assert.deepEqual(start?.params, [CLIENT, REDIRECT, CHALLENGE, "st", "read write", RESOURCE]);
});

test("authorize: an unknown client or an unregistered redirect_uri gets an error PAGE, never a redirect", async () => {
  const { run } = setup(known(false));
  const evil = await run(new Request(authorizeUrl({ ...good, redirect_uri: "https://evil.test/cb" })));
  assert.equal(evil.status, 400);
  assert.equal(evil.headers.get("location"), null);
  assert.match(await evil.text(), /not valid/);
  assert.equal((await run(new Request(authorizeUrl({ ...good, client_id: "nope" })))).status, 400);
  assert.equal((await run(new Request(authorizeUrl({ ...good, redirect_uri: "" })))).status, 400);
});

test("authorize: protocol errors go back to the (valid) redirect_uri with state", async () => {
  const { run, calls } = setup(known(true));
  const cases: [Record<string, string>, string][] = [
    [{ ...good, response_type: "token" }, "unsupported_response_type"],
    [{ ...good, code_challenge_method: "plain" }, "invalid_request"],
    [{ ...good, code_challenge: "short" }, "invalid_request"],
    [{ ...good, resource: "https://other.test/mcp" }, "invalid_target"],
  ];
  for (const [params, error] of cases) {
    const response = await run(new Request(authorizeUrl(params)));
    assert.equal(response.status, 302, error);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.origin + location.pathname, REDIRECT);
    assert.equal(location.searchParams.get("error"), error);
    assert.equal(location.searchParams.get("state"), "st");
  }
  assert.equal(calls.some((c) => c.sql.includes("_oauth_start_request")), false);
});

test("token: authorization_code is exchanged (PKCE verified in the database) and returns a Bearer response that is never cached", async () => {
  const { run, calls } = setup((sql) => sql.includes("_oauth_exchange_code") ? [{ result: { access_token: "pmt_x", refresh_token: "pmr_y", expires_in: 3600, scope: "read" } }] : []);
  const response = await run(form({ grant_type: "authorization_code", client_id: CLIENT, code: "CODE", redirect_uri: REDIRECT, code_verifier: "V".repeat(43) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { token_type: "Bearer", access_token: "pmt_x", refresh_token: "pmr_y", expires_in: 3600, scope: "read" });
  assert.deepEqual(calls[0].params, [CLIENT, "CODE", REDIRECT, "V".repeat(43)]);
});

test("token: refresh_token grant, and the client id may come from Basic auth", async () => {
  const { run, calls } = setup((sql) => sql.includes("_oauth_refresh") ? [{ result: { access_token: "pmt_n", refresh_token: "pmr_n", expires_in: 3600, scope: "read" } }] : []);
  const basic = `Basic ${btoa(`${CLIENT}:`)}`;
  const response = await run(form({ grant_type: "refresh_token", refresh_token: "pmr_old" }, { authorization: basic }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].params, [CLIENT, "pmr_old"]);
});

test("token: database refusals become invalid_grant (400); bad input never reaches the database", async () => {
  const { run, calls } = setup((sql) => sql.includes("_oauth_exchange_code") ? [{ result: { error: "invalid_grant" } }] : []);
  const refused = await run(form({ grant_type: "authorization_code", client_id: CLIENT, code: "C", redirect_uri: REDIRECT, code_verifier: "V".repeat(43) }));
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).error, "invalid_grant");
  const before = calls.length;
  assert.equal((await run(form({ grant_type: "authorization_code", client_id: "nope", code: "C" }))).status, 401);
  assert.equal((await run(form({ grant_type: "authorization_code", client_id: CLIENT, code: "C" }))).status, 400);
  assert.equal((await run(form({ grant_type: "password", client_id: CLIENT }))).status, 400);
  assert.equal((await run(form({ grant_type: "refresh_token", client_id: CLIENT }))).status, 400);
  assert.equal((await run(form({ grant_type: "authorization_code", client_id: CLIENT, code: "C", redirect_uri: REDIRECT, code_verifier: "V".repeat(43), resource: "https://other.test" }))).status, 400);
  assert.equal(calls.length, before);
});

test("token: only POST; GET is refused", async () => {
  const { run } = setup();
  assert.equal((await run(new Request(`${ISSUER}/token`))).status, 405);
});

test("revoke: always answers 200 (RFC 7009) and only calls the database for a well-formed request", async () => {
  const { run, calls } = setup();
  const response = await run(new Request(`${ISSUER}/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: "pmr_x", client_id: CLIENT }) }));
  assert.equal(response.status, 200);
  assert.equal(calls.filter((c) => c.sql.includes("_oauth_revoke")).length, 1);
  const bad = await run(new Request(`${ISSUER}/revoke`, { method: "POST", body: new URLSearchParams({ token: "x", client_id: "nope" }) }));
  assert.equal(bad.status, 200);
  assert.equal(calls.filter((c) => c.sql.includes("_oauth_revoke")).length, 1);
});

test("the general rate limit answers 429 with Retry-After before any work is done", async () => {
  const limiter: RateLimiter = { check: async () => ({ allowed: false, limit: 120, remaining: 0, resetAt: Date.now() + 5000, retryAfterSeconds: 5 }) };
  const { run, calls } = setup(() => [], { rateLimiter: limiter });
  const response = await run(new Request(authorizeUrl(good), { headers: { "cf-connecting-ip": "1.2.3.4" } }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(calls.length, 0);
});

test("unknown paths are 404 and CORS preflight is answered", async () => {
  const { run } = setup();
  assert.equal((await run(new Request(`${ISSUER}/nothing`))).status, 404);
  const preflight = await run(new Request(`${ISSUER}/token`, { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /content-type/);
});

test("metadata also satisfies the OpenID-provider shape the official MCP SDK validates on its last discovery fallback (jwks_uri, subject types, id token algs); /jwks is an empty key set", async () => {
  const { run } = setup();
  const meta = await (await run(new Request(`${ISSUER}/.well-known/openid-configuration`))).json();
  assert.equal(meta.jwks_uri, `${ISSUER}/jwks`);
  assert.deepEqual(meta.subject_types_supported, ["public"]);
  assert.ok(Array.isArray(meta.id_token_signing_alg_values_supported) && meta.id_token_signing_alg_values_supported.length > 0);
  const jwks = await run(new Request(`${ISSUER}/jwks`));
  assert.equal(jwks.status, 200);
  assert.deepEqual(await jwks.json(), { keys: [] });
  assert.equal((await run(new Request(`${ISSUER}/jwks`, { method: "POST" }))).status, 405);
});
