import test from "node:test";
import assert from "node:assert/strict";
import { computeCrop, dimensionSteps } from "./image-geometry.ts";

test("computeCrop: tam görüntü, ortadan kare ve ortadan geniş şerit", () => {
  assert.deepEqual(computeCrop(4000, 3000), { sx: 0, sy: 0, sw: 4000, sh: 3000 });
  assert.deepEqual(computeCrop(4000, 3000, { square: true }), { sx: 500, sy: 0, sw: 3000, sh: 3000 });
  assert.deepEqual(computeCrop(3000, 4000, { square: true }), { sx: 0, sy: 500, sw: 3000, sh: 3000 });
  // 10:3 şerit: genişlik tam, yükseklik 3000 * 3/10
  assert.deepEqual(computeCrop(3000, 2000, { aspect: 10 / 3 }), { sx: 0, sy: 550, sw: 3000, sh: 900 });
  // çok yatay kaynak: yükseklik tam, genişlik kırpılır
  assert.deepEqual(computeCrop(4000, 100, { aspect: 10 / 3 }), { sx: 1833, sy: 0, sw: 333, sh: 100 });
});

test("computeCrop: geçersiz oran tüm görüntüyü korur", () => {
  assert.deepEqual(computeCrop(800, 600, { aspect: 0 }), { sx: 0, sy: 0, sw: 800, sh: 600 });
  assert.deepEqual(computeCrop(800, 600, { aspect: Number.NaN }), { sx: 0, sy: 0, sw: 800, sh: 600 });
});

test("dimensionSteps: istenen boyuttan başlar, her adım %80'e düşer, asla büyümez ve biter", () => {
  const steps = dimensionSteps(1600);
  assert.equal(steps[0], 1600);
  assert.equal(steps[1], 1280);
  assert.ok(steps.every((value, i) => i === 0 || value < steps[i - 1]));
  assert.ok(steps[steps.length - 1] < 260, "son adım küçük");
  assert.ok(steps.length < 15);
  // zaten küçük kaynak: tek adım, büyütülmez
  assert.deepEqual(dimensionSteps(200), [200]);
});
