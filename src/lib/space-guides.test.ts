import { test } from "node:test";
import assert from "node:assert/strict";
import { smartSnap } from "./space-guides.ts";

const r = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

test("smartSnap: yakın kenar hizaya yakalanır ve kılavuz çıkar", () => {
  const result = smartSnap(r(203, 500), [r(0, 0), r(200, 300)], 6);
  assert.equal(result.dx, -3);
  assert.equal(result.dy, 0);
  const vertical = result.guides.find((g) => g.axis === "x" && g.pos === 200);
  assert.ok(vertical);
  assert.equal(vertical.from, 300);
  assert.equal(vertical.to, 600);
});

test("smartSnap: eşik dışındaysa yakalanmaz, kılavuz yok", () => {
  const result = smartSnap(r(250, 500), [r(0, 0)], 6);
  assert.deepEqual(result, { dx: 0, dy: 0, guides: [] });
});

test("smartSnap: merkez merkeze hizalanır (iki eksende birden)", () => {
  const result = smartSnap(r(52, 47, 100, 100), [r(100, 100, 0 + 4, 4)], 6);
  // x: merkez 102 = hedef merkez 102; y: en yakın aday 97 → 100 (üst kenar)
  assert.equal(result.dx, 0);
  assert.equal(result.dy, 3);
  assert.ok(result.guides.some((g) => g.axis === "x") && result.guides.some((g) => g.axis === "y"));
});

test("smartSnap: en yakın aday seçilir", () => {
  const result = smartSnap(r(104, 0), [r(100, 300), r(110, 600)], 6);
  assert.equal(result.dx, -4);
});

test("smartSnap: başka nesne yoksa dokunmaz", () => {
  assert.deepEqual(smartSnap(r(10, 10), [], 6), { dx: 0, dy: 0, guides: [] });
});

test("smartSnap: aynı çizgideki birden çok nesne tek kılavuzda birleşir", () => {
  const result = smartSnap(r(200, 0), [r(200, 300), r(200, 700)], 6);
  const lines = result.guides.filter((g) => g.axis === "x" && g.pos === 200);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].from, 0);
  assert.equal(lines[0].to, 800);
});
