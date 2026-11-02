import test from "node:test";
import assert from "node:assert/strict";
import { activeSectionIndex, neighborSection, pagerProgress } from "./section-pager.ts";

test("active section is the last one whose top has passed the anchor line", () => {
  const anchor = 120;
  assert.equal(activeSectionIndex([300, 900, 1500], anchor, false), 0, "none passed yet → the first");
  assert.equal(activeSectionIndex([-50, 600, 1200], anchor, false), 0);
  assert.equal(activeSectionIndex([-700, 100, 800], anchor, false), 1);
  assert.equal(activeSectionIndex([-1500, -700, 40], anchor, false), 2);
  assert.equal(activeSectionIndex([120, 700], anchor, false), 0, "exactly on the line counts as passed");
});

test("at the bottom of the page the last section wins, even if it never reached the line", () => {
  assert.equal(activeSectionIndex([-900, -300, 480], 120, true), 2);
  assert.equal(activeSectionIndex([-900, -300, 480], 120, false), 1);
});

test("empty list has no active section", () => {
  assert.equal(activeSectionIndex([], 120, false), -1);
  assert.equal(activeSectionIndex([], 120, true), -1);
});

test("progress counts the current section: 1/6 … 6/6", () => {
  assert.equal(pagerProgress(0, 6), 1 / 6);
  assert.equal(pagerProgress(2, 6), 0.5);
  assert.equal(pagerProgress(5, 6), 1);
  assert.equal(pagerProgress(9, 6), 1);
  assert.equal(pagerProgress(-1, 6), 0);
  assert.equal(pagerProgress(0, 0), 0);
});

test("neighbours stay inside the list", () => {
  assert.equal(neighborSection(2, 6, -1), 1);
  assert.equal(neighborSection(2, 6, 1), 3);
  assert.equal(neighborSection(0, 6, -1), 0);
  assert.equal(neighborSection(5, 6, 1), 5);
  assert.equal(neighborSection(0, 0, 1), -1);
});
