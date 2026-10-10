import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutRadial, fitTransform, NODE_W, NODE_H, CENTER_W, CENTER_H } from "./graph-layout.ts";

interface Rect { x: number; y: number; w: number; h: number }

function overlaps(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

for (const ratio of [0.9, 1, 1.4, 1.6, 2.2]) for (const n of [0, 1, 2, 3, 5, 8, 12, 20, 33, 40, 60]) {
  test(`no node overlaps another (n=${n}, ratio=${ratio})`, () => {
    const keys = Array.from({ length: n }, (_, i) => `n${i}`);
    const { positions } = layoutRadial("c", keys, { ratio });
    assert.equal(Object.keys(positions).length, n + 1);
    const rects: Rect[] = [{ x: 0, y: 0, w: CENTER_W, h: CENTER_H }, ...keys.map((k) => ({ x: positions[k].x, y: positions[k].y, w: NODE_W, h: NODE_H }))];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert.equal(overlaps(rects[i], rects[j]), false, `${i} overlaps ${j}`);
      }
    }
  });
}

test("is deterministic", () => {
  const keys = ["a", "b", "c", "d"];
  assert.deepEqual(layoutRadial("c", keys), layoutRadial("c", keys));
});

test("fitTransform frames the bounds inside the viewport", () => {
  const { bounds } = layoutRadial("c", Array.from({ length: 12 }, (_, i) => `n${i}`));
  const t = fitTransform(bounds, { width: 800, height: 600 });
  assert.ok(t.zoom > 0.2 && t.zoom <= 1);
  const left = bounds.minX * t.zoom + t.x;
  const right = bounds.maxX * t.zoom + t.x;
  assert.ok(left >= 0 && right <= 800, `${left}..${right}`);
});

test("a tall stage gets rings that are closer to a circle than a wide stage", () => {
  const keys = Array.from({ length: 12 }, (_, i) => `n${i}`);
  const tall = layoutRadial("c", keys, { ratio: 0.9 }).bounds;
  const wide = layoutRadial("c", keys, { ratio: 2.2 }).bounds;
  const aspect = (b: typeof tall) => (b.maxX - b.minX) / (b.maxY - b.minY);
  assert.ok(aspect(tall) < aspect(wide));
});

test("fitTransform stays readable: never zooms below minZoom and then frames the center node", () => {
  const { bounds } = layoutRadial("c", Array.from({ length: 40 }, (_, i) => `n${i}`));
  const t = fitTransform(bounds, { width: 390, height: 500 }, 32, 1, 0.6);
  assert.equal(t.zoom, 0.6);
  assert.equal(t.x, 195);
  assert.equal(t.y, 250);
});
