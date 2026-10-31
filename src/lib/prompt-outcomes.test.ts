import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_OUTCOME_VOTES, outcomeToolLabel, percentages, summarizeOutcomes } from "./prompt-outcomes.ts";

test("percentages always add up to exactly 100", () => {
  for (const [w, p, f] of [[1, 1, 1], [74, 18, 8], [2, 1, 0], [5, 0, 0], [1, 2, 4], [33, 33, 34]]) {
    const [a, b, c] = percentages(w, p, f);
    assert.equal(a + b + c, 100, `${w}/${p}/${f}`);
  }
  assert.deepEqual(percentages(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(percentages(3, 0, 0), [100, 0, 0]);
});

test("summary totals every tool row and flags too few votes", () => {
  const few = summarizeOutcomes([{ tool: "Flux", toolVersion: "", worked: 1, partial: 1, failed: 0 }]);
  assert.equal(few.total, 2);
  assert.equal(few.enough, false);
  assert.ok(MIN_OUTCOME_VOTES > few.total);

  const rows = [
    { tool: "GPT Image 1", toolVersion: "v1.5", worked: 17, partial: 3, failed: 1 },
    { tool: "GPT Image 1", toolVersion: "", worked: 4, partial: 0, failed: 0 },
    { tool: "", toolVersion: "", worked: 0, partial: 0, failed: 0 },
    { tool: "Flux", toolVersion: "", worked: 2, partial: 1, failed: 1 },
  ];
  const s = summarizeOutcomes(rows);
  assert.equal(s.total, 29);
  assert.equal(s.worked, 23);
  assert.equal(s.enough, true);
  assert.equal(s.workedPct + s.partialPct + s.failedPct, 100);
  assert.equal(s.tools.length, 3, "all-zero rows are dropped");
  assert.equal(s.tools[0].tool, "GPT Image 1");
  assert.equal(s.tools[0].toolVersion, "v1.5");
});

test("negative or missing counts never produce negative totals", () => {
  const s = summarizeOutcomes([{ tool: "x", toolVersion: "", worked: -5, partial: 2, failed: 1 }]);
  assert.equal(s.total, 3);
  assert.equal(s.worked, 0);
});

test("tool label joins name and version and falls back when unspecified", () => {
  assert.equal(outcomeToolLabel("GPT Image 1", "v1.5", "Belirtilmedi"), "GPT Image 1 · v1.5");
  assert.equal(outcomeToolLabel(" Flux ", "", "Belirtilmedi"), "Flux");
  assert.equal(outcomeToolLabel("", "v2", "Belirtilmedi"), "Belirtilmedi");
});
