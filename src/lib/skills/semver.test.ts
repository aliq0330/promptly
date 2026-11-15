import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpSemver, compareSemver, isValidSemver, latestSemver, parseSemver } from "./semver.ts";

test("parse accepts only MAJOR.MINOR.PATCH numbers", () => {
  assert.deepEqual(parseSemver("1.2.3"), [1, 2, 3]);
  for (const bad of ["1.2", "v1.2.3", "1.2.3-beta", "1.2.3+b", "1.2.x", "", "1.2.3.4", "01.2.3x", " 1.2.3", "1234567890.0.0"]) assert.equal(parseSemver(bad), null, bad);
  assert.equal(isValidSemver("0.0.1"), true);
  assert.equal(isValidSemver("1.2"), false);
});

test("compare is numeric, not textual", () => {
  assert.ok(compareSemver("1.10.0", "1.9.0") > 0);
  assert.ok(compareSemver("1.9.0", "1.10.0") < 0);
  assert.ok(compareSemver("2.0.0", "1.99.99") > 0);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.ok(compareSemver("0.0.1", "garbage") > 0);
});

test("latest picks the highest valid version", () => {
  assert.equal(latestSemver(["1.9.0", "1.10.0", "1.2.0", "bad"]), "1.10.0");
  assert.equal(latestSemver([]), null);
  assert.equal(latestSemver(["bad"]), null);
});

test("bump resets lower parts", () => {
  assert.equal(bumpSemver("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpSemver("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpSemver("1.2.3", "major"), "2.0.0");
  assert.equal(bumpSemver("nope", "patch"), "1.0.0");
});
