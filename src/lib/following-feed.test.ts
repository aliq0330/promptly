import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addedVariables,
  dedupeActivity,
  diffLines,
  isFeaturedWorthy,
  nextActivityCursor,
  pickFeatured,
  summaryParts,
  summaryTotal,
} from "./following-feed.ts";

test("dedupeActivity: a post already shown in a group is dropped on the next page", () => {
  const seen = new Set<string>();
  const page1 = dedupeActivity(
    [
      { key: "g:selin:1", kind: "group", item: null, members: ["prompt:1", "prompt:2", "prompt:3"] },
      { key: "p:prompt:9", kind: "post", item: "prompt:9" },
    ],
    seen,
  );
  assert.equal(page1.length, 2);
  const page2 = dedupeActivity(
    [
      { key: "p:prompt:3", kind: "post", item: "prompt:3" },
      { key: "p:prompt:4", kind: "post", item: "prompt:4" },
    ],
    seen,
  );
  assert.deepEqual(page2.map((event) => event.key), ["p:prompt:4"]);
});

test("dedupeActivity: a group whose members were mostly shown shrinks, or becomes a single post", () => {
  const seen = new Set<string>(["prompt:1", "prompt:2"]);
  const out = dedupeActivity([{ key: "g:a", kind: "group", item: null, members: ["prompt:1", "prompt:2", "prompt:3"] }], seen);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "post");
  assert.equal(out[0].item, "prompt:3");
  const seen2 = new Set<string>(["prompt:1"]);
  const out2 = dedupeActivity([{ key: "g:b", kind: "group", item: null, members: ["prompt:1", "prompt:2", "prompt:3"] }], seen2);
  assert.deepEqual(out2[0].members, ["prompt:2", "prompt:3"]);
});

test("dedupeActivity: events without an item (version, Space activity) are only deduped by key", () => {
  const seen = new Set<string>();
  const events = [
    { key: "v:prompt:1:3", kind: "version", item: null },
    { key: "v:prompt:1:3", kind: "version", item: null },
  ];
  assert.equal(dedupeActivity(events, seen).length, 1);
});

test("nextActivityCursor: from the last RAW row, null on a short page", () => {
  const rows = [
    { occurred_at: "2026-11-23T10:00:00Z", event_key: "b" },
    { occurred_at: "2026-11-23T09:00:00Z", event_key: "a" },
  ];
  assert.deepEqual(nextActivityCursor(rows, 2), { at: "2026-11-23T09:00:00Z", key: "a" });
  assert.equal(nextActivityCursor(rows, 3), null);
});

test("diffLines: changed lines marked, distant unchanged lines collapsed", () => {
  const before = ["a", "b", "c", "d", "e", "f"].join("\n");
  const after = ["a", "b", "c", "d", "e", "F", "g"].join("\n");
  const diff = diffLines(before, after);
  assert.deepEqual(
    diff.filter((line) => line.type !== "same").map((line) => `${line.type}:${line.text}`),
    ["del:f", "add:F", "add:g"],
  );
  assert.equal(diff[0].text, "…", "lines far from a change collapse into one marker");
  assert.ok(diff.some((line) => line.type === "same" && line.text === "e"), "one line of context is kept");
});

test("diffLines: identical texts give only unchanged lines", () => {
  assert.ok(diffLines("x\ny", "x\ny").every((line) => line.type === "same"));
});

test("addedVariables: only new {names}", () => {
  assert.deepEqual(addedVariables("Write {ton} text", "Write {ton} text with {hitap}"), ["hitap"]);
  assert.deepEqual(addedVariables("{a}", "{a}"), []);
});

test("summaryParts / summaryTotal: zero kinds are left out", () => {
  const counts = { posts: 9, versions: 0, spaces: 1, tags: 2 };
  assert.deepEqual(summaryParts(counts).map((part) => part.key), ["posts", "spaces", "tags"]);
  assert.equal(summaryTotal(counts), 12);
});

test("isFeaturedWorthy: at least 10 votes and 80 % yes", () => {
  assert.equal(isFeaturedWorthy({ yes: 8, no: 2 }), true);
  assert.equal(isFeaturedWorthy({ yes: 7, no: 2 }), false, "too few votes");
  assert.equal(isFeaturedWorthy({ yes: 15, no: 5 }), false, "75 %");
  assert.equal(isFeaturedWorthy(null), false);
});

test("pickFeatured: at most one in every 8 posts, not before the 5th, only after an even number of cards; earlier picks stay", () => {
  const keys = Array.from({ length: 20 }, (_, i) => `k${i}`);
  const worthy = (key: string) => ["k1", "k3", "k4", "k10", "k12", "k13", "k19"].includes(key);
  const first = pickFeatured(keys.slice(0, 12), worthy);
  const all = pickFeatured(keys, worthy);
  assert.ok(!all.has("k1") && !all.has("k3"), "the first screen opens with normal cards");
  assert.deepEqual([...first], ["k4"]);
  // After k4 the count restarts: k13 has 8 cards before it (5..12) → even, and far enough from k4.
  assert.deepEqual([...all], ["k4", "k13"]);
  assert.ok(!all.has("k12"), "too close to the previous one");
  assert.ok(!all.has("k19"), "an odd number of cards before it in the new page block (18) would leave a column empty");
  // Page blocks restart the count: index 20 = 2 cards into the second block.
  assert.deepEqual([...pickFeatured(Array.from({ length: 22 }, (_, i) => `k${i}`), (key) => key === "k20")], ["k20"]);
  assert.deepEqual([...pickFeatured(Array.from({ length: 22 }, (_, i) => `k${i}`), (key) => key === "k19")], []);
});
