import assert from "node:assert/strict";
import test from "node:test";
import {
  boardPageHref,
  boardPagesOf,
  copyTitle,
  dragBox,
  exportGeometry,
  filterThreads,
  frameMemberIds,
  groupThreads,
  initialsOf,
  lineShape,
  mentionedUsernames,
  moveBoardId,
  normalizePoints,
  parseShape,
  parseText,
  pinWorldPosition,
  presentationFrames,
  simplifyPath,
} from "./team-board.ts";

const detail = {
  mainAreaId: "pm",
  areas: [
    { id: "b2", title: "İkinci", fileId: null, isMain: false, position: 1, itemCount: 2 },
    { id: "pm", title: "Proje", fileId: null, isMain: true, position: 0, itemCount: 5, openComments: 2 },
    { id: "b1", title: "Birinci", fileId: null, isMain: false, position: 0, itemCount: 1 },
    { id: "fm", title: "Mutfak", fileId: "f1", isMain: true, position: 0, itemCount: 3 },
    { id: "fb", title: "Dolap", fileId: "f1", isMain: false, position: 0, itemCount: 0 },
  ],
  boards: [],
  files: [{ id: "f1", title: "Mutfak", mainAreaId: "fm", itemCount: 3 }],
};

test("boardPagesOf: ana pano ilk, ek panolar sıraya göre; kapsam ayrı", () => {
  assert.deepEqual(boardPagesOf(detail, null, "Ana pano").map((p) => [p.id, p.title]), [["pm", "Ana pano"], ["b1", "Birinci"], ["b2", "İkinci"]]);
  assert.deepEqual(boardPagesOf(detail, "f1", "Ana pano").map((p) => p.id), ["fm", "fb"]);
  assert.equal(boardPagesOf(detail, null, "Ana pano")[0].openComments, 2);
});

test("boardPagesOf: `areas` yoksa boards + ana alandan türetir", () => {
  const old = { mainAreaId: "pm", boards: [{ id: "b1", title: "Bir", fileId: null, itemCount: 4 }, { id: "x", title: "Dosya panosu", fileId: "f1", itemCount: 1 }], files: [{ id: "f1", title: "M", mainAreaId: "fm", itemCount: 0 }] };
  assert.deepEqual(boardPagesOf(old, null, "Ana").map((p) => p.id), ["pm", "b1"]);
  assert.deepEqual(boardPagesOf(old, "f1", "Ana").map((p) => p.id), ["fm", "x"]);
});

test("boardPageHref: board + sub=board (+ yorum)", () => {
  const href = boardPageHref("t1", "p1", "a1");
  assert.match(href, /board=a1/);
  assert.match(href, /sub=board/);
  assert.match(boardPageHref("t1", "p1", "a1", { comment: "c9" }), /comment=c9$/);
});

test("moveBoardId: sınırda değişmez, yer değiştirir", () => {
  assert.deepEqual(moveBoardId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveBoardId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveBoardId(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(moveBoardId(["a", "b", "c"], "zzz", 1), ["a", "b", "c"]);
});

test("copyTitle: 80 karakteri aşmaz", () => {
  assert.equal(copyTitle("Taslaklar", "(kopya)"), "Taslaklar (kopya)");
  assert.ok(copyTitle("x".repeat(80), "(kopya)").length <= 80);
});

test("parseShape/parseText: bozuk veri güvenli varsayılana düşer", () => {
  assert.deepEqual(parseShape(null), { shape: "rect", fill: false, sw: 4, points: [] });
  assert.equal(parseShape({ shape: "star" }).shape, "rect");
  assert.equal(parseShape({ shape: "arrow", sw: 8, fill: true }).sw, 8);
  assert.deepEqual(parseShape({ shape: "line", points: [[0, 0], [2, -1], ["x", 1], [0.5]] }).points, [[0, 0], [1, 0]]);
  assert.deepEqual(parseText(undefined), { size: "md", bold: false });
  assert.deepEqual(parseText({ size: "xl", bold: true }), { size: "xl", bold: true });
  assert.equal(parseText({ size: "huge" }).size, "md");
});

test("simplifyPath: düz çizgi iki noktaya iner, köşe korunur", () => {
  const straight = simplifyPath([[0, 0], [1, 0.01], [2, 0], [3, 0.02], [4, 0]], 0.5);
  assert.equal(straight.length, 2);
  const corner = simplifyPath([[0, 0], [5, 0], [5, 5]], 0.5);
  assert.equal(corner.length, 3);
});

test("normalizePoints: kutu en az 40, noktalar 0..1", () => {
  const out = normalizePoints([[100, 200], [300, 200]]);
  assert.equal(out.box.w, 200);
  assert.equal(out.box.h, 40);
  assert.deepEqual(out.points, [[0, 0.5], [1, 0.5]]);
  for (const [x, y] of normalizePoints([[0, 0], [10, 90], [50, 30], [80, 80]]).points) {
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  }
});

test("normalizePoints: çok uzun çizim en çok 400 noktaya iner", () => {
  const wiggle: [number, number][] = Array.from({ length: 3000 }, (_, i) => [i, Math.sin(i / 3) * 40 + (i % 7)]);
  assert.ok(normalizePoints(wiggle).points.length <= 400);
});

test("lineShape / dragBox", () => {
  const line = lineShape(0, 0, 100, 100);
  assert.equal(line.points.length, 2);
  assert.deepEqual(dragBox(100, 100, 40, 20), { x: 40, y: 20, w: 60, h: 80 });
  assert.deepEqual(dragBox(10, 10, 12, 11), { x: 10, y: 10, w: 40, h: 40 });
});

test("frameMemberIds: merkezi içeride olanlar; kilitli, çerçeve ve dışarıdakiler hariç", () => {
  const frame = { id: "f", kind: "frame", x: 0, y: 0, w: 400, h: 300 };
  const items = [
    frame,
    { id: "a", kind: "note", x: 10, y: 10, w: 100, h: 100 },
    { id: "b", kind: "note", x: 390, y: 10, w: 100, h: 100 },
    { id: "c", kind: "image", x: 10, y: 10, w: 100, h: 100, locked: true },
    { id: "d", kind: "frame", x: 20, y: 20, w: 50, h: 50 },
    { id: "e", kind: "note", x: 500, y: 500, w: 100, h: 100 },
  ];
  assert.deepEqual(frameMemberIds(frame, items), ["a"]);
});

test("presentationFrames: okuma sırası (satır, sonra soldan sağa)", () => {
  const frames = [
    { id: "c", kind: "frame", x: 0, y: 600, w: 400, h: 300 },
    { id: "b", kind: "frame", x: 500, y: 10, w: 400, h: 300 },
    { id: "a", kind: "frame", x: 0, y: 0, w: 400, h: 300 },
    { id: "n", kind: "note", x: 0, y: 0, w: 100, h: 100 },
  ];
  assert.deepEqual(presentationFrames(frames).map((f) => f.id), ["a", "b", "c"]);
  assert.deepEqual(presentationFrames([]), []);
});

test("pinWorldPosition: öğeye bağlı pin öğeyle gider; öğe yoksa kayıtlı konum", () => {
  const items = new Map([["i1", { x: 100, y: 50 }]]);
  const base = { id: "p", parentId: null, x: 7, y: 9, itemId: "i1", offX: 12, offY: 8 };
  assert.deepEqual(pinWorldPosition(base, items), { x: 112, y: 58 });
  assert.deepEqual(pinWorldPosition({ ...base, itemId: "gone" }, items), { x: 7, y: 9 });
  assert.deepEqual(pinWorldPosition({ ...base, itemId: null, offX: null, offY: null }, items), { x: 7, y: 9 });
  assert.equal(pinWorldPosition({ ...base, parentId: "root" }, items), null);
});

test("groupThreads / filterThreads", () => {
  const list = [
    { id: "1", parentId: null, resolvedAt: null, createdAt: "2026-01-01" },
    { id: "2", parentId: null, resolvedAt: "2026-01-05", createdAt: "2026-01-02" },
    { id: "r2", parentId: "1", resolvedAt: null, createdAt: "2026-01-04" },
    { id: "r1", parentId: "1", resolvedAt: null, createdAt: "2026-01-03" },
    { id: "orphan", parentId: "missing", resolvedAt: null, createdAt: "2026-01-06" },
  ];
  const threads = groupThreads(list);
  assert.deepEqual(threads.map((t) => t.root.id), ["2", "1"]);
  assert.deepEqual(threads[1].replies.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(filterThreads(threads, "open").map((t) => t.root.id), ["1"]);
  assert.deepEqual(filterThreads(threads, "resolved").map((t) => t.root.id), ["2"]);
});

test("mentionedUsernames / initialsOf", () => {
  assert.deepEqual(mentionedUsernames("@Elif ve @kaan_1 bakar mısın @elif a@b.co"), ["elif", "kaan_1"]);
  assert.equal(initialsOf("Elif Yıldız"), "EY");
  assert.equal(initialsOf("kaan"), "KA");
  assert.equal(initialsOf("  "), "?");
});

test("exportGeometry: sınır + kenar boşluğu, uzun kenar sınırlanır", () => {
  assert.equal(exportGeometry([]), null);
  const g = exportGeometry([{ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 50, w: 100, h: 100 }], 10)!;
  assert.deepEqual([g.x, g.y, g.w, g.h], [-10, -10, 320, 170]);
  assert.equal(g.scale, 2);
  const big = exportGeometry([{ x: 0, y: 0, w: 20000, h: 100 }])!;
  assert.ok(big.pixelW <= 4096);
});
