import assert from "node:assert/strict";
import { test } from "node:test";
import { NODE_H, NODE_W, createBatchedLoader, pickArtSteps, workflowGraphLayout } from "./card-art-core.ts";

test("the loader batches keys asked in one window into one fetch and caches answers", async () => {
  const calls: string[][] = [];
  const loader = createBatchedLoader<number>(async (keys) => {
    calls.push(keys);
    return new Map(keys.filter((key) => key !== "none").map((key) => [key, key.length]));
  }, 5);
  const [a, b, none] = await Promise.all([loader.load("a"), loader.load("bb"), loader.load("none")]);
  assert.equal(a, 1);
  assert.equal(b, 2);
  assert.equal(none, null);
  assert.deepEqual(calls, [["a", "bb", "none"]]);
  assert.equal(await loader.load("a"), 1);
  assert.equal(calls.length, 1, "a second ask for the same key does not fetch again");
});

test("a failing fetch resolves every key with null instead of rejecting", async () => {
  const loader = createBatchedLoader<number>(async () => {
    throw new Error("boom");
  }, 1);
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await loader.load("x"), null);
  } finally {
    console.error = original;
  }
});

test("pickArtSteps takes first, middle and last with their 1-based numbers", () => {
  assert.deepEqual(pickArtSteps([]), []);
  assert.deepEqual(pickArtSteps(["a"]), [{ step: "a", number: 1 }]);
  assert.deepEqual(pickArtSteps(["a", "b"]), [{ step: "a", number: 1 }, { step: "b", number: 2 }]);
  assert.deepEqual(pickArtSteps(["a", "b", "c", "d", "e"]).map((entry) => entry.number), [1, 3, 5]);
  assert.deepEqual(pickArtSteps(["a", "b", "c", "d"]).map((entry) => entry.number), [1, 2, 4]);
});

test("the graph layout keeps every node inside the board and draws one arrow per gap", () => {
  for (const height of [56.25, 100]) {
    for (const count of [1, 2, 3]) {
      const { nodes, arrows } = workflowGraphLayout(count, height);
      assert.equal(nodes.length, count);
      assert.equal(arrows.length, count - 1);
      for (const node of nodes) {
        assert.ok(node.x >= 0 && node.x + NODE_W <= 100, "inside horizontally");
        assert.ok(node.y >= 0 && node.y + NODE_H <= height + 0.001, "inside vertically");
      }
    }
  }
});
