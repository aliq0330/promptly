import test from "node:test";
import assert from "node:assert/strict";
import {
  API_TOKEN_ACTIVE_LIMIT,
  API_TOKEN_PATTERN,
  activeApiTokenCount,
  apiTokenStatus,
  canCreateApiToken,
  isValidApiTokenName,
  mapApiTokenRow,
  type ApiTokenRow,
} from "./api-tokens.ts";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const row = (over: Partial<ApiTokenRow> = {}): ApiTokenRow => ({
  id: "i", name: "n", prefix: "pmt_abcd", scopes: ["read"], kind: "user",
  createdAt: "2026-10-01T00:00:00Z", expiresAt: null, lastUsedAt: null, revokedAt: null, ...over,
});

test("status: revoked wins over expiry; a past expiry is expired; no expiry stays active", () => {
  assert.equal(apiTokenStatus(row(), NOW), "active");
  assert.equal(apiTokenStatus(row({ expiresAt: "2026-12-01T00:00:00Z" }), NOW), "active");
  assert.equal(apiTokenStatus(row({ expiresAt: "2026-10-31T00:00:00Z" }), NOW), "expired");
  assert.equal(apiTokenStatus(row({ expiresAt: "2026-10-31T00:00:00Z", revokedAt: "2026-10-30T00:00:00Z" }), NOW), "revoked");
});

test("only active keys count toward the limit, and the limit blocks creation", () => {
  const rows = [
    ...Array.from({ length: API_TOKEN_ACTIVE_LIMIT - 1 }, () => row()),
    row({ revokedAt: "2026-10-30T00:00:00Z" }),
    row({ expiresAt: "2026-10-31T00:00:00Z" }),
  ];
  assert.equal(activeApiTokenCount(rows, NOW), API_TOKEN_ACTIVE_LIMIT - 1);
  assert.equal(canCreateApiToken(rows, NOW), true);
  assert.equal(canCreateApiToken([...rows, row()], NOW), false);
});

test("names: 1–60 characters after trimming", () => {
  assert.equal(isValidApiTokenName("   "), false);
  assert.equal(isValidApiTokenName(" a "), true);
  assert.equal(isValidApiTokenName("x".repeat(60)), true);
  assert.equal(isValidApiTokenName("x".repeat(61)), false);
});

test("the raw key pattern matches the server format (pmt_ + 43 base64url characters)", () => {
  assert.ok(API_TOKEN_PATTERN.test("pmt_" + "A".repeat(43)));
  assert.ok(!API_TOKEN_PATTERN.test("pmt_" + "A".repeat(42)));
  assert.ok(!API_TOKEN_PATTERN.test("pmx_" + "A".repeat(43)));
  assert.ok(!API_TOKEN_PATTERN.test("pmt_" + "+".repeat(43)));
});

test("mapApiTokenRow keeps known scopes, defaults kind, and drops rows without id/name/prefix", () => {
  const mapped = mapApiTokenRow({ id: "1", name: "Dizüstü", prefix: "pmt_Ab3d", scopes: ["read", "write", "admin"], kind: "weird", created_at: "2026-11-01T00:00:00Z", expires_at: null, last_used_at: null, revoked_at: null });
  assert.deepEqual(mapped?.scopes, ["read", "write"]);
  assert.equal(mapped?.kind, "user");
  assert.equal(mapped?.expiresAt, null);
  assert.equal(mapApiTokenRow({ name: "x", prefix: "pmt_abcd" }), null);
  assert.equal(mapApiTokenRow({ id: "1", prefix: "pmt_abcd" }), null);
  assert.deepEqual(mapApiTokenRow({ id: "1", name: "n", prefix: "pmt_abcd", scopes: [] })?.scopes, ["read"]);
});
