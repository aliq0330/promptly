import { test } from "node:test";
import assert from "node:assert/strict";
import { draftMissing, draftPreviewText } from "./draft-status.ts";

test("prompt draft needs title, description and prompt text", () => {
  assert.deepEqual(draftMissing("prompt", { title: "", description: " ", promptText: "" }), ["title", "description", "promptText"]);
  assert.deepEqual(draftMissing("prompt", { title: "A", description: "B", promptText: "C" }), []);
});

test("request draft needs title and description only", () => {
  assert.deepEqual(draftMissing("request", { title: "Bir istek", description: "" }), ["description"]);
});

test("workflow without steps is incomplete; unknown step count is not judged", () => {
  assert.deepEqual(draftMissing("workflow", { title: "Akış", stepCount: 0 }), ["steps"]);
  assert.deepEqual(draftMissing("workflow", { title: "Akış", stepCount: 2 }), []);
  assert.deepEqual(draftMissing("workflow", { title: "Akış" }), []);
});

test("preset needs a 3+ character title and a parameter", () => {
  assert.deepEqual(draftMissing("preset", { title: "ab", paramCount: 0 }), ["title", "params"]);
  assert.deepEqual(draftMissing("preset", { title: "abc", paramCount: 1 }), []);
});

test("preview text collapses whitespace and is shortened with an ellipsis", () => {
  assert.equal(draftPreviewText("  a\n\n b  "), "a b");
  assert.equal(draftPreviewText("x".repeat(10), 5), "xxxx…");
  assert.equal(draftPreviewText(null), "");
});
