import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_EXPORT_FORMAT, boardToJson, buildPdf, exportFileName } from "./board-export.ts";

const item = (over: Record<string, unknown> = {}) => ({ id: "i1", kind: "note", x: 0, y: 0, w: 100, h: 80, z: 1, title: "T", body: "B", note: "", color: "neutral", mediaUrl: null, contentType: null, contentId: null, promptId: null, paletteId: null, ...over });

test("boardToJson: zarf + öğe/ok/palet; kişi ve yorum alanı yok", () => {
  const json = boardToJson({
    title: "Sosyal medya",
    exportedAt: "2026-11-11T00:00:00.000Z",
    items: [item({ mediaUrl: "https://x/space-media/a/b.jpg", kind: "image" }), item({ id: "i2", kind: "shape", data: { shape: "arrow" } })],
    connections: [{ fromItemId: "i1", toItemId: "i2", label: "", arrow: "end", lineStyle: "solid", color: "primary" }],
    palettes: [{ id: "p1", name: "Yaz", colors: ["#ffffff"] }],
  });
  assert.equal(json.format, BOARD_EXPORT_FORMAT);
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.items.length, 2);
  assert.equal(json.items[0].mediaUrl, "https://x/space-media/a/b.jpg");
  assert.deepEqual(json.items[1].data, { shape: "arrow" });
  assert.equal("createdBy" in json.items[0], false);
  assert.deepEqual(json.connections[0], { from: "i1", to: "i2", label: "", arrow: "end", lineStyle: "solid", color: "primary" });
});

test("exportFileName: ASCII, tireli", () => {
  assert.equal(exportFileName("Yaz Kampanyası · Sosyal medya", "png"), "yaz-kampanyasi-sosyal-medya.png");
  assert.equal(exportFileName("???", "pdf"), "pano.pdf");
});

test("buildPdf: geçerli iskelet, xref ofsetleri nesne başlarını gösterir", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const bytes = buildPdf([{ jpeg, width: 800, height: 600 }, { jpeg, width: 400, height: 300 }]);
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 600 450\]/);
  const start = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.equal(text.slice(start, start + 4), "xref");
  const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(entries.length, 3 + 2 * 3 - 1);
  entries.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `nesne ${index + 1}`));
});

test("buildPdf: sayfasız PDF reddedilir", () => {
  assert.throws(() => buildPdf([]), /pdf_empty/);
});
