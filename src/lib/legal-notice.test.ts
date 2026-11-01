import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowTermsNotice } from "./legal-notice.ts";

const base = { version: "2026-11-01", seenVersion: null, accountCreatedAt: "2026-01-01T00:00:00Z", effectiveAt: "2026-11-01T07:00:00Z" };

test("an existing account that has not seen this version gets the notice", () => {
  assert.equal(shouldShowTermsNotice(base), true);
});

test("seen this version → no notice; an older seen version → notice again", () => {
  assert.equal(shouldShowTermsNotice({ ...base, seenVersion: "2026-11-01" }), false);
  assert.equal(shouldShowTermsNotice({ ...base, seenVersion: "2026-10-14" }), true);
});

test("an account opened after the terms took effect already saw them at sign-up", () => {
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: "2026-11-02T10:00:00Z" }), false);
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: "2026-11-01T07:00:00Z" }), false, "exactly at the effective moment counts as after");
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: "2026-11-01T06:59:59Z" }), true);
});

test("unknown or unparsable dates fail on the safe side: show the notice", () => {
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: undefined }), true);
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: null }), true);
  assert.equal(shouldShowTermsNotice({ ...base, accountCreatedAt: "not a date" }), true);
});

test("a new version shows again even to an account created after the previous one", () => {
  assert.equal(shouldShowTermsNotice({ ...base, version: "2027-03-01", seenVersion: "2026-11-01", accountCreatedAt: "2026-12-01T00:00:00Z", effectiveAt: "2027-03-01T00:00:00Z" }), true);
});
