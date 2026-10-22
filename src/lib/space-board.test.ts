import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignItems,
  boundsOf,
  clampZoom,
  distributeItems,
  emptyHistory,
  findFreeSpot,
  fitViewport,
  groupFrames,
  itemsInRect,
  MAX_ZOOM,
  MIN_ZOOM,
  placeMany,
  pushHistory,
  rectsIntersect,
  redoHistory,
  resizeFromCorner,
  restack,
  screenToWorld,
  tidyItems,
  undoHistory,
  worldToScreen,
  zoomAt,
  type BoardGeom,
} from "./space-board.ts";

const g = (id: string, x: number, y: number, w = 100, h = 100, z = 0, groupId: string | null = null): BoardGeom => ({ id, x, y, w, h, z, groupId });

test("world ↔ screen round trip at any zoom", () => {
  const vp = { x: 120, y: -40, zoom: 1.7 };
  const s = worldToScreen(vp, 33, -91);
  const w = screenToWorld(vp, s.x, s.y);
  assert.ok(Math.abs(w.x - 33) < 1e-9 && Math.abs(w.y + 91) < 1e-9);
});

test("zoomAt keeps the point under the cursor fixed and clamps the zoom", () => {
  const vp = { x: 10, y: 20, zoom: 1 };
  const before = screenToWorld(vp, 300, 200);
  const next = zoomAt(vp, 2.5, 300, 200);
  const after = screenToWorld(next, 300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(zoomAt(vp, 99, 0, 0).zoom, MAX_ZOOM);
  assert.equal(zoomAt(vp, 0.0001, 0, 0).zoom, MIN_ZOOM);
  assert.equal(clampZoom(Number.NaN), 1);
});

test("fitViewport centres the content and never enlarges a small board", () => {
  const vp = fitViewport([g("a", 0, 0, 100, 100)], 800, 600);
  assert.equal(vp.zoom, 1);
  const centre = worldToScreen(vp, 50, 50);
  assert.deepEqual([Math.round(centre.x), Math.round(centre.y)], [400, 300]);
  const big = fitViewport([g("a", -2000, 0, 4000, 1000)], 800, 600);
  assert.ok(big.zoom < 1 && big.zoom >= MIN_ZOOM);
  assert.deepEqual(fitViewport([], 800, 600), { x: 400, y: 300, zoom: 1 });
});

test("findFreeSpot never overlaps existing items (with a gap) and is deterministic", () => {
  const existing = [g("a", -130, -130, 260, 260), g("b", 150, -130, 260, 260)];
  const spot = findFreeSpot(existing, { w: 260, h: 260 });
  const rect = { ...spot, w: 260, h: 260 };
  assert.ok(existing.every((r) => !rectsIntersect(rect, r)));
  assert.deepEqual(findFreeSpot(existing, { w: 260, h: 260 }), spot);
  assert.deepEqual(findFreeSpot([], { w: 100, h: 100 }, { x: 500, y: 500 }), { x: 450, y: 450 });
});

test("placeMany places a batch without overlaps between the new items", () => {
  const spots = placeMany([], [{ w: 200, h: 200 }, { w: 200, h: 200 }, { w: 200, h: 200 }]);
  const rects = spots.map((s) => ({ ...s, w: 200, h: 200 }));
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.ok(!rectsIntersect(rects[i], rects[j]));
});

test("resizeFromCorner clamps sizes and keeps an image's ratio", () => {
  assert.deepEqual(resizeFromCorner({ x: 0, y: 0, w: 100, h: 100 }, -500, 20), { x: 0, y: 0, w: 40, h: 120 });
  const r = resizeFromCorner({ x: 0, y: 0, w: 200, h: 100 }, 100, 0, true);
  assert.equal(r.w / r.h, 2);
});

test("alignItems: left / centreY / bottom share one edge; a single item is left alone", () => {
  const items = [g("a", 10, 10, 50, 50), g("b", 100, 60, 80, 20)];
  assert.deepEqual(alignItems(items, "left"), { a: { x: 10, y: 10 }, b: { x: 10, y: 60 } });
  assert.deepEqual(alignItems(items, "bottom"), { a: { x: 10, y: 30 }, b: { x: 100, y: 60 } });
  const mid = alignItems(items, "centerY");
  assert.equal(mid.a.y + 25, mid.b.y + 10);
  assert.deepEqual(alignItems([items[0]], "left"), {});
});

test("distributeItems: equal gaps, end items stay put, fewer than 3 is a no-op", () => {
  const out = distributeItems([g("a", 0, 0, 100), g("b", 130, 0, 100), g("c", 400, 0, 100)], "x");
  assert.equal(out.a.x, 0);
  assert.equal(out.c.x, 400);
  assert.equal(out.b.x - (out.a.x + 100), out.c.x - (out.b.x + 100));
  assert.deepEqual(distributeItems([g("a", 0, 0), g("b", 10, 0)], "x"), {});
});

test("tidyItems lays items in reading order on a grid from the top-left corner", () => {
  const out = tidyItems([g("c", 500, 400), g("a", 10, 10), g("b", 300, 20), g("d", 50, 420)], 2, 20);
  assert.deepEqual(out.a, { x: 10, y: 10 });
  assert.deepEqual(out.b, { x: 130, y: 10 });
  assert.deepEqual(out.d, { x: 10, y: 130 });
  assert.deepEqual(out.c, { x: 130, y: 130 });
});

test("restack moves the chosen items above / below the rest, keeping their order", () => {
  const items = [g("a", 0, 0, 1, 1, 1), g("b", 0, 0, 1, 1, 5), g("c", 0, 0, 1, 1, 3)];
  assert.deepEqual(restack(items, ["a", "c"], "front"), { a: 6, c: 7 });
  assert.deepEqual(restack(items, ["b"], "back"), { b: 0 });
});

test("itemsInRect / groupFrames / boundsOf", () => {
  const items = [g("a", 0, 0, 100, 100, 0, "G"), g("b", 300, 300, 100, 100, 0, "G"), g("c", 1000, 0)];
  assert.deepEqual(itemsInRect(items, { x: 50, y: 50, w: 300, h: 300 }).sort(), ["a", "b"]);
  const [frame] = groupFrames(items, 10, 20);
  assert.deepEqual(frame, { groupId: "G", count: 2, rect: { x: -10, y: -30, w: 420, h: 440 } });
  assert.equal(boundsOf([]), null);
});

test("history: push clears redo, undo/redo walk both ways, the limit drops the oldest", () => {
  let h = pushHistory(pushHistory(emptyHistory<number>(), 1), 2);
  const u = undoHistory(h);
  assert.equal(u.entry, 2);
  h = u.history;
  const r = redoHistory(h);
  assert.equal(r.entry, 2);
  h = pushHistory(u.history, 3);
  assert.deepEqual(h, { past: [1, 3], future: [] });
  assert.equal(undoHistory(emptyHistory<number>()).entry, null);
  let big = emptyHistory<number>();
  for (let i = 0; i < 5; i += 1) big = pushHistory(big, i, 3);
  assert.deepEqual(big.past, [2, 3, 4]);
});
