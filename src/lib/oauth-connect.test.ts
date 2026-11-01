import test from "node:test";
import assert from "node:assert/strict";
import { buildReturnUrl, mapOauthGrantRow, parseConnectInfo, parseConnectRequest } from "./oauth-connect.ts";

test("request token: exactly the 43-char base64url shape the server issues", () => {
  assert.equal(parseConnectRequest("A".repeat(43)), "A".repeat(43));
  assert.equal(parseConnectRequest("  " + "a_-".repeat(14) + "a  "), "a_-".repeat(14) + "a");
  for (const bad of [null, undefined, "", "short", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "/", "A".repeat(42) + " "]) assert.equal(parseConnectRequest(bad), null);
});

test("info: name is cleaned and capped; redirect host is shown; missing name or non-object is null", () => {
  const info = parseConnectInfo({ client_name: "  Claude\u0000 <b>x</b> ", client_uri: "https://claude.ai", redirect_uri: "https://claude.ai/api/mcp/auth_callback" });
  assert.deepEqual(info, { clientName: "Claude <b>x</b>", clientUri: "claude.ai", redirectHost: "claude.ai" });
  assert.equal(parseConnectInfo({ client_name: "x".repeat(200), redirect_uri: "https://a.test/cb" })?.clientName.length, 80);
  assert.equal(parseConnectInfo({ client_name: "   ", redirect_uri: "https://a.test/cb" }), null);
  assert.equal(parseConnectInfo(null), null);
  assert.equal(parseConnectInfo([]), null);
  assert.equal(parseConnectInfo("nope"), null);
});

test("info: a non-https return address shows no host (the page then says 'unknown')", () => {
  assert.equal(parseConnectInfo({ client_name: "X", redirect_uri: "http://evil.test/cb" })?.redirectHost, null);
  assert.equal(parseConnectInfo({ client_name: "X", redirect_uri: "http://localhost:3000/cb" })?.redirectHost, "localhost:3000");
});

test("return url: registered redirect + code/state, keeping an existing query; unsafe targets are refused", () => {
  assert.equal(buildReturnUrl({ redirect_uri: "https://claude.ai/api/mcp/auth_callback", params: { code: "C", state: "S t" } }), "https://claude.ai/api/mcp/auth_callback?code=C&state=S+t");
  assert.equal(buildReturnUrl({ redirect_uri: "https://a.test/cb?x=1", params: { error: "access_denied" } }), "https://a.test/cb?x=1&error=access_denied");
  assert.equal(buildReturnUrl({ redirect_uri: "https://a.test/cb", params: { code: "", state: 5 } }), "https://a.test/cb");
  for (const bad of [null, [], { redirect_uri: "javascript:alert(1)" }, { redirect_uri: "http://evil.test/cb" }, { params: { code: "c" } }, { redirect_uri: 5 }]) assert.equal(buildReturnUrl(bad), null);
});

test("grant row: only known scopes survive; missing id/name is dropped; dates pass through", () => {
  assert.deepEqual(
    mapOauthGrantRow({ id: "g1", client_name: "Claude", redirect_host: "claude.ai", scopes: ["read", "write", "admin"], created_at: "2026-11-01T10:00:00Z", last_used_at: null }),
    { id: "g1", name: "Claude", host: "claude.ai", scopes: ["read", "write"], createdAt: "2026-11-01T10:00:00Z", lastUsedAt: null },
  );
  assert.equal(mapOauthGrantRow({ client_name: "x" }), null);
  assert.equal(mapOauthGrantRow({ id: "g" }), null);
});
