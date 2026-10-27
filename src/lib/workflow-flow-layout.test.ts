import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrowLabel,
  computeFlowLayout,
  fitScale,
  flowItemSize,
  FLOW_HEADER_H,
  FLOW_NODE_H,
  FLOW_NODE_W,
  FLOW_PAD_X,
  type FlowOptions,
  type FlowStepLike,
} from "./workflow-flow-layout.ts";

const ALL: FlowOptions = { showIo: true, showLinks: true, showRelations: true };

function steps(n: number): FlowStepLike[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    inputs: i === 0 ? [] : [{ source: { stepId: `s${i - 1}`, outputId: `o${i - 1}` } }],
    outputs: [{ id: `o${i}`, label: `Çıktı ${i}` }],
  }));
}

describe("computeFlowLayout", () => {
  it("tek satır: sütun = adım sayısı, ardışık adımlar arasında düz ok", () => {
    const layout = computeFlowLayout(steps(3), ALL);
    assert.equal(layout.columns, 3);
    assert.equal(layout.rows, 1);
    assert.equal(layout.nodes.length, 3);
    assert.equal(layout.arrows.length, 2);
    assert.ok(layout.arrows.every((a) => !a.path.includes("V")), "aynı satırdaki ok dik parça içermez");
    assert.equal(layout.nodes[0].x, FLOW_PAD_X);
    assert.equal(layout.nodes[0].y, FLOW_HEADER_H);
    assert.ok(layout.nodes[1].x > layout.nodes[0].x + FLOW_NODE_W);
  });

  it("dörtten fazla adım sarar; satır sonundan sonrakine dirsekli ok çizilir", () => {
    const layout = computeFlowLayout(steps(6), ALL);
    assert.equal(layout.columns, 4);
    assert.equal(layout.rows, 2);
    assert.equal(layout.nodes[4].row, 1);
    assert.equal(layout.nodes[4].x, layout.nodes[0].x);
    assert.ok(layout.nodes[4].y > layout.nodes[0].y + FLOW_NODE_H);
    const wrap = layout.arrows.find((a) => a.from === 3);
    assert.ok(wrap?.path.includes("V"), "satır değiştiren ok dirsekli");
  });

  it("katmanlar yüksekliği belirler: içerik kartları ve ilişkiler kapalıysa daha alçak", () => {
    const full = computeFlowLayout(steps(2), ALL);
    const noRel = computeFlowLayout(steps(2), { ...ALL, showRelations: false });
    const bare = computeFlowLayout(steps(2), { showIo: false, showLinks: false, showRelations: false });
    assert.ok(full.height > noRel.height);
    assert.ok(noRel.height > bare.height);
    assert.equal(bare.links.length, 0);
    assert.equal(full.links.length, 2);
    assert.equal(full.links[0].x, full.nodes[0].x);
    assert.ok(full.links[0].y >= full.nodes[0].y + FLOW_NODE_H);
  });

  it("aynı satırdaki ilişki yay olur; satırlar arası olan yay değil ayrı listeye düşer", () => {
    const layout = computeFlowLayout(steps(6), ALL, [
      { a: 0, b: 1 },
      { a: 1, b: 0 }, // aynı çiftin ters yönü tekrar sayılmaz
      { a: 2, b: 5 },
    ]);
    assert.equal(layout.relations.length, 1);
    assert.equal(layout.relations[0].a, 0);
    assert.equal(layout.relations[0].b, 1);
    assert.equal(layout.crossRowRelations.length, 1);
    assert.equal(layout.crossRowRelations[0].b, 5);
  });

  it("ilişki katmanı kapalıyken ilişki yoktur; geçersiz uçlar yok sayılır", () => {
    assert.equal(computeFlowLayout(steps(3), { ...ALL, showRelations: false }, [{ a: 0, b: 1 }]).relations.length, 0);
    const layout = computeFlowLayout(steps(2), ALL, [
      { a: 0, b: 0 },
      { a: -1, b: 1 },
      { a: 0, b: 9 },
    ]);
    assert.equal(layout.relations.length + layout.crossRowRelations.length, 0);
  });

  it("içerik kartı kapalıyken ilişki yayı düğümlerin altına bağlanır", () => {
    const layout = computeFlowLayout(steps(2), { showIo: true, showLinks: false, showRelations: true }, [{ a: 0, b: 1 }]);
    assert.equal(layout.relations.length, 1);
    assert.ok(layout.relations[0].labelY > layout.nodes[0].y + FLOW_NODE_H);
    assert.ok(layout.height > layout.nodes[0].y + FLOW_NODE_H);
  });

  it("adımsız workflow güvenli bir boş tuval verir", () => {
    const layout = computeFlowLayout([], ALL);
    assert.equal(layout.nodes.length, 0);
    assert.equal(layout.arrows.length, 0);
    assert.ok(layout.width > 0 && layout.height > 0);
  });
});

describe("arrowLabel", () => {
  it("sonraki adımın bağlı girdisinin kaynağı olan çıktının adını verir", () => {
    const from: FlowStepLike = { id: "a", inputs: [], outputs: [{ id: "o1", label: "Taslak" }, { id: "o2", label: "Başlık" }] };
    const to: FlowStepLike = { id: "b", inputs: [{ source: { stepId: "a", outputId: "o2" } }], outputs: [] };
    assert.equal(arrowLabel(from, to), "Başlık");
  });
  it("bağlantı yoksa ilk çıktı, çıktı da yoksa null", () => {
    const to: FlowStepLike = { id: "b", inputs: [{ source: null }], outputs: [] };
    assert.equal(arrowLabel({ id: "a", inputs: [], outputs: [{ id: "o1", label: "Taslak" }] }, to), "Taslak");
    assert.equal(arrowLabel({ id: "a", inputs: [], outputs: [] }, to), null);
    assert.equal(arrowLabel({ id: "a", inputs: [], outputs: [{ id: "o1", label: "  " }] }, to), null);
  });
});

describe("ölçek", () => {
  it("fitScale: oranı korur, varsayılan olarak büyütmez", () => {
    const layout = { width: 1000, height: 500 };
    assert.equal(fitScale(layout, { w: 500, h: 500 }), 0.5);
    assert.equal(fitScale(layout, { w: 2000, h: 2000 }), 1);
    assert.equal(fitScale(layout, { w: 2000, h: 2000 }, true), 2);
    assert.equal(fitScale(layout, { w: 250 }), 0.25);
  });
  it("flowItemSize panonun sınırlarında kalır", () => {
    const size = flowItemSize({ width: 100, height: 100 });
    assert.ok(size.w >= 320 && size.h >= 200);
    const big = flowItemSize({ width: 90000, height: 90000 });
    assert.ok(big.w <= 4000 && big.h <= 4000);
  });
});
