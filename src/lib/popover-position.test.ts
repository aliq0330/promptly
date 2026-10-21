import { test } from "node:test";
import assert from "node:assert/strict";
import { boxIntersects, computePopoverPlacement, intersectBoxes, type Box } from "./popover-position.ts";

// A phone's message list: header above (0–120), composer below (700–844), 390 wide.
const LIST: Box = { top: 120, left: 0, bottom: 700, right: 390 };
const MENU = { width: 208, height: 260 };
const at = (top: number, left = 340, size = 32): Box => ({ top, left, bottom: top + size, right: left + size });

test("fits below: opens under the anchor, right edges aligned for `end`", () => {
  const p = computePopoverPlacement({ anchor: at(200), panel: MENU, bounds: LIST, align: "end" });
  assert.equal(p.side, "below");
  assert.equal(p.top, 200 + 32 + 6);
  assert.equal(p.left, 372 - 208);
  assert.equal(p.maxHeight, null);
});

test("near the composer: flips above instead of running under it", () => {
  const p = computePopoverPlacement({ anchor: at(620), panel: MENU, bounds: LIST, align: "end" });
  assert.equal(p.side, "above");
  assert.equal(p.top, 620 - 6 - 260);
  assert.ok(p.top >= LIST.top + 8, "never under the header");
});

test("near the header: stays below (never covers the header)", () => {
  const p = computePopoverPlacement({ anchor: at(130), panel: MENU, bounds: LIST, align: "start" });
  assert.equal(p.side, "below");
  assert.ok(p.top + MENU.height <= LIST.bottom - 8);
});

test("fits neither side: the roomier side, capped with maxHeight, inside the bounds", () => {
  const short: Box = { top: 120, left: 0, bottom: 520, right: 390 }; // keyboard open
  const p = computePopoverPlacement({ anchor: at(300), panel: { width: 208, height: 400 }, bounds: short, align: "end" });
  assert.equal(p.side, "below");
  assert.equal(p.top, 338);
  assert.equal(p.maxHeight, Math.floor(512 - 338));
  assert.ok(p.top + (p.maxHeight ?? 0) <= short.bottom - 8);
});

test("almost no room on either side: uses the whole visible area", () => {
  const tiny: Box = { top: 120, left: 0, bottom: 300, right: 390 };
  const p = computePopoverPlacement({ anchor: at(190), panel: { width: 208, height: 260 }, bounds: tiny, align: "end" });
  assert.equal(p.top, 128);
  assert.equal(p.maxHeight, 300 - 8 - 128);
});

test("horizontal clamp: a menu anchored at the left edge of a `kendi` message never leaves the screen", () => {
  const p = computePopoverPlacement({ anchor: at(200, 12), panel: MENU, bounds: LIST, align: "end" });
  assert.equal(p.left, 8);
  const q = computePopoverPlacement({ anchor: at(200, 360), panel: MENU, bounds: LIST, align: "start" });
  assert.equal(q.left, 390 - 8 - 208);
});

test("panel wider than the visible area gets maxWidth", () => {
  const narrow: Box = { top: 0, left: 0, bottom: 800, right: 200 };
  const p = computePopoverPlacement({ anchor: at(100, 100), panel: MENU, bounds: narrow, align: "end" });
  assert.equal(p.maxWidth, 184);
  assert.equal(p.left, 8);
});

test("an anchor half outside the bounds is clamped (the panel is still placed in view)", () => {
  const p = computePopoverPlacement({ anchor: { top: 690, left: 340, bottom: 722, right: 372 }, panel: MENU, bounds: LIST, align: "end" });
  assert.equal(p.side, "above");
  assert.ok(p.top >= LIST.top + 8 && p.top + MENU.height <= LIST.bottom - 8);
});

test("intersections", () => {
  assert.equal(boxIntersects(at(50), LIST), false);
  assert.equal(boxIntersects(at(100), LIST), true);
  assert.deepEqual(intersectBoxes(LIST, { top: 0, left: 0, bottom: 500, right: 1000 }), { top: 120, left: 0, bottom: 500, right: 390 });
});
