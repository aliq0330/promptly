import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPosition, cornerForKey, cornerPosition, isDrag, nearestCorner, toLocalDelta } from "./call-window.ts";

const box = { w: 800, h: 500 };
const item = { w: 170, h: 226 };

test("köşe konumları: kenar boşluğu ve ek boşluklar", () => {
  assert.deepEqual(cornerPosition(box, item, "tl"), { x: 14, y: 14 });
  assert.deepEqual(cornerPosition(box, item, "tr"), { x: 800 - 170 - 14, y: 14 });
  assert.deepEqual(cornerPosition(box, item, "bl"), { x: 14, y: 500 - 226 - 14 });
  assert.deepEqual(cornerPosition(box, item, "br", 20), { x: 800 - 170 - 20, y: 500 - 226 - 20 });
  assert.deepEqual(cornerPosition(box, item, "tr", 14, { top: 56 }), { x: 616, y: 70 }, "üst çubuk payı");
  assert.deepEqual(cornerPosition(box, item, "bl", 14, { bottom: 84 }), { x: 14, y: 500 - 226 - 98 }, "alt denetim payı");
  assert.deepEqual(cornerPosition({ w: 100, h: 100 }, { w: 200, h: 200 }, "br"), { x: 0, y: 0 }, "sığmayan öğe negatife düşmez");
});

test("en yakın köşe: merkezin çeyreği", () => {
  assert.equal(nearestCorner(box, item, { x: 10, y: 10 }), "tl");
  assert.equal(nearestCorner(box, item, { x: 700, y: 20 }), "tr");
  assert.equal(nearestCorner(box, item, { x: 30, y: 400 }), "bl");
  assert.equal(nearestCorner(box, item, { x: 640, y: 290 }), "br");
  assert.equal(nearestCorner(box, item, { x: 300, y: 130 }), "tl", "ortaya yakın: merkez sol-üst çeyrekte");
  assert.equal(nearestCorner(box, item, { x: 315, y: 137 }), "br", "tam ortada: sağ-alt (eşitlik)");
});

test("sürüklerken kapsayıcıdan çıkmaz", () => {
  assert.deepEqual(clampPosition(box, item, { x: -50, y: -50 }), { x: 4, y: 4 });
  assert.deepEqual(clampPosition(box, item, { x: 5000, y: 5000 }), { x: 800 - 170 - 4, y: 500 - 226 - 4 });
  assert.deepEqual(clampPosition(box, item, { x: 100, y: 100 }), { x: 100, y: 100 });
  assert.deepEqual(clampPosition({ w: 50, h: 50 }, item, { x: 9, y: 9 }), { x: 4, y: 4 }, "kapsayıcı öğeden küçükse sabit");
});

test("klavye: oklar köşe değiştirir, diğer tuşlar null", () => {
  assert.equal(cornerForKey("tr", "ArrowLeft"), "tl");
  assert.equal(cornerForKey("tl", "ArrowRight"), "tr");
  assert.equal(cornerForKey("tr", "ArrowDown"), "br");
  assert.equal(cornerForKey("bl", "ArrowUp"), "tl");
  assert.equal(cornerForKey("br", "ArrowRight"), "br", "zaten sağda");
  assert.equal(cornerForKey("br", "Enter"), null);
});

test("ölçek ve dokunma eşiği", () => {
  assert.equal(toLocalDelta(100, 0.5), 200);
  assert.equal(toLocalDelta(100, 0), 100);
  assert.equal(toLocalDelta(100, Number.NaN), 100);
  assert.equal(isDrag(1, 2), false);
  assert.equal(isDrag(3, 3), true);
  assert.equal(isDrag(0, 4), true);
});
