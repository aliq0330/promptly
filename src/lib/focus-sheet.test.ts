import { test } from "node:test";
import assert from "node:assert/strict";
import { focusActiveIndex, focusKeyAction, focusResultStep, focusSheetGesture, focusSheetStep, focusTabs } from "./focus-sheet.ts";

test("the card steps closed → half → full and back; the ends stay put", () => {
  assert.equal(focusSheetStep(null, "up"), "half");
  assert.equal(focusSheetStep("half", "up"), "full");
  assert.equal(focusSheetStep("full", "up"), "full");
  assert.equal(focusSheetStep("full", "down"), "half");
  assert.equal(focusSheetStep("half", "down"), null);
  assert.equal(focusSheetStep(null, "down"), null);
});

test("a drag counts past 48 px or as a quick flick; a small slow one decides nothing", () => {
  assert.equal(focusSheetGesture(-60, 400), "up");
  assert.equal(focusSheetGesture(60, 400), "down");
  assert.equal(focusSheetGesture(-30, 400), null);
  assert.equal(focusSheetGesture(-30, 40), "up", "fast flick");
  assert.equal(focusSheetGesture(6, 10), null, "a tap's jitter is nothing");
});

test("only a prompt has results and versions; the other kinds have their own tab + comments", () => {
  assert.deepEqual(focusTabs("prompt", false), ["main", "comments", "results"]);
  assert.deepEqual(focusTabs("prompt", true), ["main", "comments", "results", "versions"]);
  for (const kind of ["request", "workflow", "preset", "skill"] as const) assert.deepEqual(focusTabs(kind, true), ["main", "comments"]);
});

test("results step sideways and stop at the ends", () => {
  assert.equal(focusResultStep(0, 4, 1), 1);
  assert.equal(focusResultStep(3, 4, 1), 3);
  assert.equal(focusResultStep(0, 4, -1), 0);
  assert.equal(focusResultStep(2, 0, 1), 0);
});

test("the active post is the screen the vertical scroller rests on", () => {
  assert.equal(focusActiveIndex(0, 800, 10), 0);
  assert.equal(focusActiveIndex(799, 800, 10), 1);
  assert.equal(focusActiveIndex(2400, 800, 10), 3);
  assert.equal(focusActiveIndex(99999, 800, 10), 9, "never past the last post");
  assert.equal(focusActiveIndex(100, 0, 10), 0);
  assert.equal(focusActiveIndex(100, 800, 0), 0);
});

test("keys: ↑ ↓ move between posts, ← → between results, P panel, C copy, Esc close", () => {
  assert.equal(focusKeyAction("ArrowDown"), "next");
  assert.equal(focusKeyAction("j"), "next");
  assert.equal(focusKeyAction("PageUp"), "prev");
  assert.equal(focusKeyAction("ArrowRight"), "resultNext");
  assert.equal(focusKeyAction("h"), "resultPrev");
  assert.equal(focusKeyAction("p"), "panel");
  assert.equal(focusKeyAction("C"), "copy");
  assert.equal(focusKeyAction("Escape"), "close");
  assert.equal(focusKeyAction("Home"), "first");
  assert.equal(focusKeyAction("x"), null);
});
