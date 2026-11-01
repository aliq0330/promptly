import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthorizationId, redirectHost, safeRedirectUrl, splitScopes } from "./oauth-consent.ts";

test("authorization_id: opaque safe characters only, bounded length", () => {
  assert.equal(parseAuthorizationId("abc123_-XYZ789"), "abc123_-XYZ789");
  assert.equal(parseAuthorizationId("  abc12345  "), "abc12345");
  for (const bad of [null, undefined, "", "short", "has space inside", "a".repeat(201), "x/../y1234567", "<script>alert(1)</script>"]) assert.equal(parseAuthorizationId(bad as string), null);
});

test("redirect host: https (or local development) only; anything else is not shown as a destination", () => {
  assert.equal(redirectHost("https://claude.ai/api/mcp/auth_callback"), "claude.ai");
  assert.equal(redirectHost("https://chatgpt.com/connector_platform_oauth_redirect"), "chatgpt.com");
  assert.equal(redirectHost("http://localhost:6274/oauth/callback"), "localhost:6274");
  for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "myapp://callback", "not a url", "", null, undefined]) assert.equal(redirectHost(bad as string), null);
});

test("safeRedirectUrl follows only what redirectHost accepts", () => {
  assert.equal(safeRedirectUrl("https://claude.ai/cb?code=1&state=2"), "https://claude.ai/cb?code=1&state=2");
  assert.equal(safeRedirectUrl("javascript:alert(1)"), null);
  assert.equal(safeRedirectUrl(undefined), null);
});

test("scopes are split, de-duplicated and bounded", () => {
  assert.deepEqual(splitScopes("openid  profile email openid"), ["openid", "profile", "email"]);
  assert.deepEqual(splitScopes(""), []);
  assert.equal(splitScopes(Array.from({ length: 50 }, (_, i) => `s${i}`).join(" ")).length, 20);
});
