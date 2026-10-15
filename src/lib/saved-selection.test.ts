import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMembershipResult, dedupeSavedEntries, diffMembership, savedTransition } from "./saved-selection.ts";

const set = (...ids: string[]) => new Set(ids);
const entry = (type: string, id: string) => ({ type, data: { id } });

test("diffMembership: nothing changed means no writes (cancel / untouched modal)", () => {
  assert.deepEqual(diffMembership(set("a", "b"), set("a", "b")), { add: [], remove: [] });
  assert.deepEqual(diffMembership(set(), set()), { add: [], remove: [] });
});

test("diffMembership: only the touched collections are written", () => {
  assert.deepEqual(diffMembership(set("sw", "design"), set("design")), { add: [], remove: ["sw"] });
  assert.deepEqual(diffMembership(set("sw"), set("sw", "design")), { add: ["design"], remove: [] });
  assert.deepEqual(diffMembership(set("a", "b"), set("b", "c")), { add: ["c"], remove: ["a"] });
});

test("applyMembershipResult: a failed write leaves that collection as it was", () => {
  const initial = set("sw", "design");
  assert.deepEqual([...applyMembershipResult(initial, [], ["sw"])].sort(), ["design"]);
  assert.deepEqual([...applyMembershipResult(initial, [], [])].sort(), ["design", "sw"]);
  assert.deepEqual([...applyMembershipResult(set(), ["x"], [])], ["x"]);
  assert.deepEqual([...initial].sort(), ["design", "sw"], "the input set is never mutated");
});

test("savedTransition: the bookmark only flips on 0 <-> 1+ memberships", () => {
  assert.equal(savedTransition(false, 1), "saved");
  assert.equal(savedTransition(true, 0), "unsaved");
  assert.equal(savedTransition(true, 1), null);
  assert.equal(savedTransition(true, 2), null);
  assert.equal(savedTransition(false, 0), null);
});

test("scenarios 1-4: Yazılım -> + Tasarım -> - Yazılım -> - Tasarım", () => {
  let members = set();
  let saved = false;

  // 1. only Yazılım: saved, bookmark fills
  let diff = diffMembership(members, set("sw"));
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.equal(savedTransition(saved, members.size), "saved");
  saved = true;

  // 2. Tasarım too: still saved, no second flip
  diff = diffMembership(members, set("sw", "design"));
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.equal(savedTransition(saved, members.size), null);

  // 3. leaves Yazılım: still saved through Tasarım
  diff = diffMembership(members, set("design"));
  assert.deepEqual(diff, { add: [], remove: ["sw"] });
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.deepEqual([...members], ["design"]);
  assert.equal(savedTransition(saved, members.size), null);

  // 4. leaves Tasarım: no collection left, bookmark empties
  diff = diffMembership(members, set());
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.equal(savedTransition(saved, members.size), "unsaved");
});

test("dedupeSavedEntries: a work in two collections is listed once, at its newest save", () => {
  const rows = [entry("prompt", "p1"), entry("workflow", "w1"), entry("prompt", "p1"), entry("prompt", "p2")];
  assert.deepEqual(
    dedupeSavedEntries(rows).map((e) => `${e.type}:${e.data.id}`),
    ["prompt:p1", "workflow:w1", "prompt:p2"],
  );
});

test("dedupeSavedEntries: the same id under different content types is not a duplicate", () => {
  const rows = [entry("prompt", "x"), entry("preset", "x"), entry("workflow", "x")];
  assert.equal(dedupeSavedEntries(rows).length, 3);
  assert.deepEqual(dedupeSavedEntries([]), []);
});
