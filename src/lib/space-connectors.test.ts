import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrowHead,
  borderPoint,
  centerOf,
  chainPairs,
  chooseSides,
  connectionExists,
  connectorGeometry,
  dashArray,
  hasArrowAtEnd,
  hasArrowAtStart,
} from "./space-connectors.ts";

const A = { x: 0, y: 0, w: 200, h: 100 };

describe("chooseSides", () => {
  it("yatay ayrılıkta sağ/sol, dikeyde alt/üst", () => {
    assert.deepEqual(chooseSides(A, { x: 400, y: 0, w: 200, h: 100 }), { from: "right", to: "left" });
    assert.deepEqual(chooseSides({ x: 400, y: 0, w: 200, h: 100 }, A), { from: "left", to: "right" });
    assert.deepEqual(chooseSides(A, { x: 0, y: 300, w: 200, h: 100 }), { from: "bottom", to: "top" });
    assert.deepEqual(chooseSides({ x: 0, y: 300, w: 200, h: 100 }, A), { from: "top", to: "bottom" });
  });
});

describe("borderPoint", () => {
  it("merkezden hedefe doğru kutu kenarını bulur", () => {
    assert.deepEqual(borderPoint(A, { x: 1000, y: 50 }), { x: 200, y: 50 });
    assert.deepEqual(borderPoint(A, { x: -500, y: 50 }), { x: 0, y: 50 });
    assert.deepEqual(borderPoint(A, { x: 100, y: 900 }), { x: 100, y: 100 });
    const diagonal = borderPoint(A, { x: 300, y: 250 });
    assert.ok(diagonal.x <= 200 && diagonal.y <= 100);
    assert.deepEqual(borderPoint(A, centerOf(A)), centerOf(A));
  });
});

describe("connectorGeometry", () => {
  const B = { x: 400, y: 200, w: 200, h: 100 };
  it("eğri: kenar ortalarından çıkar, uçlar kutu kenarlarında, etiket iki ucun arasında", () => {
    const g = connectorGeometry(A, { x: 400, y: 0, w: 200, h: 100 }, "curve");
    assert.deepEqual(g.start, { x: 200, y: 50 });
    assert.deepEqual(g.end, { x: 400, y: 50 });
    assert.ok(g.d.startsWith("M200 50C"));
    assert.ok(g.label.x > 200 && g.label.x < 400);
    assert.ok(Math.abs(g.endAngle) < 1e-9, "ok sağa bakar");
    assert.ok(Math.abs(g.startAngle) < 1e-9, "başlangıçtan dışarı da sağa");
  });
  it("düz: merkezden merkeze, kutu kenarında biter; açı çizgi yönündedir", () => {
    const g = connectorGeometry(A, B, "straight");
    assert.ok(g.d.startsWith("M") && g.d.includes("L"));
    assert.ok(g.end.x >= 400 && g.end.y >= 200);
    assert.ok(Math.abs(g.endAngle - Math.atan2(g.end.y - g.start.y, g.end.x - g.start.x)) < 1e-9);
  });
  it("dirsekli: yalnız yatay/dikey parçalar", () => {
    const h = connectorGeometry(A, { x: 400, y: 200, w: 200, h: 100 }, "elbow");
    assert.match(h.d, /^M[\d. -]+H[\d. -]+V[\d. -]+H[\d. -]+$/);
    const v = connectorGeometry(A, { x: 0, y: 400, w: 200, h: 100 }, "elbow");
    assert.match(v.d, /^M[\d. -]+V[\d. -]+H[\d. -]+V[\d. -]+$/);
  });
  it("öğe taşınınca (kutu değişince) yol değişir — konum saklanmaz", () => {
    const before = connectorGeometry(A, { x: 400, y: 0, w: 200, h: 100 }, "curve");
    const after = connectorGeometry(A, { x: 400, y: 300, w: 200, h: 100 }, "curve");
    assert.notEqual(before.d, after.d);
  });
});

describe("ok başı", () => {
  it("ucu `tip`tedir ve yöne bakar", () => {
    const [tip, a, b] = arrowHead({ x: 100, y: 100 }, 0, 10);
    assert.deepEqual(tip, { x: 100, y: 100 });
    assert.ok(a.x < 100 && b.x < 100, "geride");
    assert.ok(a.y !== b.y, "simetrik iki kanat");
  });
  it("ok yönleri", () => {
    assert.ok(hasArrowAtEnd("end") && hasArrowAtEnd("both") && !hasArrowAtEnd("start") && !hasArrowAtEnd("none"));
    assert.ok(hasArrowAtStart("start") && hasArrowAtStart("both") && !hasArrowAtStart("end") && !hasArrowAtStart("none"));
  });
  it("çizgi stili", () => {
    assert.equal(dashArray("solid", 2), undefined);
    assert.ok(dashArray("dashed", 2));
    assert.ok(dashArray("dotted", 2));
  });
});

describe("çift mantığı", () => {
  const existing = [{ fromItemId: "a", toItemId: "b" }];
  it("ters yönde de aynı çift sayılır", () => {
    assert.ok(connectionExists(existing, "a", "b"));
    assert.ok(connectionExists(existing, "b", "a"));
    assert.ok(!connectionExists(existing, "a", "c"));
  });
  it("zincir: bağlı çiftler ve tekrarlar atlanır", () => {
    assert.deepEqual(chainPairs(["a", "b", "c", "d"], existing), [["b", "c"], ["c", "d"]]);
    assert.deepEqual(chainPairs(["a"], []), []);
    assert.deepEqual(chainPairs(["a", "a"], []), []);
    assert.deepEqual(chainPairs(["a", "b", "a", "b"], []), [["a", "b"]]);
  });
});
