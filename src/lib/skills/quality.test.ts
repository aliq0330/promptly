import test from "node:test";
import assert from "node:assert/strict";
import { countMarkdownHeadings, skillQualityChecks } from "./quality.ts";

const base = { summary: "x".repeat(50), instructions: "# A\n" + "y".repeat(300) + "\n## B\nz", category: "design" as const, compat: ["claude-code" as const], license: "mit" as const };

test("headings inside code fences do not count", () => {
  assert.equal(countMarkdownHeadings("# One\n```sh\n# comment\n```\n## Two\n#notaheading"), 2);
});

test("a complete skill passes every check", () => {
  assert.ok(skillQualityChecks(base, true).every((c) => c.ok));
});

test("each missing piece fails only its own check", () => {
  const failing = (patch: object, hasPackage = true) => skillQualityChecks({ ...base, ...patch }, hasPackage).filter((c) => !c.ok).map((c) => c.key);
  assert.deepEqual(failing({ summary: "short" }), ["summary"]);
  assert.deepEqual(failing({ instructions: "# A\n## B" }), ["instructions"]);
  assert.deepEqual(failing({ instructions: "y".repeat(400) }), ["structure"]);
  assert.deepEqual(failing({ category: null }), ["category"]);
  assert.deepEqual(failing({ compat: [] }), ["compat"]);
  assert.deepEqual(failing({ license: "proprietary" }), ["license"]);
  assert.deepEqual(failing({}, false), ["package"]);
});
