import { test } from "node:test";
import assert from "node:assert/strict";
import { assemblyProgress, resolvePromptText, segmentPromptAssembly } from "./prompt-variables.ts";

test("assembly segments read like the resolved text", () => {
  const template = "Bir {konu} portresi, {ışık} ışıkta.";
  const values = { konu: "kedi", "ışık": "yumuşak" };
  const segments = segmentPromptAssembly(template, values);
  assert.equal(segments.map((s) => s.text).join(""), resolvePromptText(template, values));
  assert.deepEqual(
    segments.filter((s) => s.kind === "value").map((s) => (s.kind === "value" ? s.name : "")),
    ["konu", "ışık"],
  );
});

test("an empty visible variable becomes a placeholder, a hidden one vanishes", () => {
  const template = "A {x} B {y} C";
  const segments = segmentPromptAssembly(template, { x: "", y: "" }, { x: true, y: false });
  assert.deepEqual(segments, [
    { kind: "text", text: "A " },
    { kind: "empty", text: "x", name: "x" },
    { kind: "text", text: " B  C" },
  ]);
});

test("an undefined token stays literal and adjacent text merges", () => {
  const segments = segmentPromptAssembly("{unknown} ve {a}", { a: "" }, { a: false });
  assert.deepEqual(segments, [{ kind: "text", text: "{unknown} ve " }]);
});

test("progress counts only visible variables", () => {
  const variables = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(assemblyProgress(variables, { a: "1", b: "", c: "" }, { a: true, b: true, c: false }), { filled: 1, total: 2, complete: false });
  assert.deepEqual(assemblyProgress(variables, { a: "1", b: "2", c: "" }, { a: true, b: true, c: false }), { filled: 2, total: 2, complete: true });
  assert.deepEqual(assemblyProgress([], {}, {}), { filled: 0, total: 0, complete: false });
});
