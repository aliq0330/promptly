import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMembershipResult, diffMembership, savedAfterCommit } from "./saved-selection.ts";

const set = (...ids: string[]) => new Set(ids);

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

test("savedAfterCommit: only an add can save an unsaved work; removals never change the saved state", () => {
  assert.equal(savedAfterCommit(false, 1), "saved");
  assert.equal(savedAfterCommit(false, 3), "saved");
  assert.equal(savedAfterCommit(false, 0), null, "nothing was added");
  assert.equal(savedAfterCommit(true, 2), null, "already saved");
});

test("scenario: saved first, then Yazılım -> + Tasarım -> - Yazılım -> - Tasarım: it stays saved throughout", () => {
  let members = set();
  const saved = true; // saving was its own step ("Kaydedilenlerin tümü"), before any collection

  let diff = diffMembership(members, set("sw"));
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.equal(savedAfterCommit(saved, diff.add.length), null);

  diff = diffMembership(members, set("sw", "design"));
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.deepEqual([...members].sort(), ["design", "sw"]);

  diff = diffMembership(members, set("design"));
  assert.deepEqual(diff, { add: [], remove: ["sw"] });
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.deepEqual([...members], ["design"]);

  diff = diffMembership(members, set());
  members = applyMembershipResult(members, diff.add, diff.remove);
  assert.equal(members.size, 0);
  assert.equal(savedAfterCommit(saved, 0), null, "leaving every collection does not unsave");
});

test("scenario: adding an unsaved work to a collection saves it as well", () => {
  const diff = diffMembership(set(), set("film"));
  assert.equal(savedAfterCommit(false, diff.add.length), "saved");
});
