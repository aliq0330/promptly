import { test } from "node:test";
import assert from "node:assert/strict";
import { colorDistance, extractPalette, hexToRgb, normalizeHex, rgbToHex } from "./color-palette.ts";

test("normalizeHex accepts short / long / with or without # and lowercases; rejects the rest", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("ff7A1a"), "#ff7a1a");
  assert.equal(normalizeHex("  #0a0b2c "), "#0a0b2c");
  for (const bad of ["", "#12", "#12345g", "red", "#1234567"]) assert.equal(normalizeHex(bad), null, bad);
});

test("rgb ↔ hex", () => {
  assert.deepEqual(hexToRgb("#ff7a1a"), [255, 122, 26]);
  assert.equal(rgbToHex(255, 122.4, 26), "#ff7a1a");
  assert.equal(rgbToHex(-4, 300, 0), "#00ff00");
});

function pixels(spec: [number, number, number, number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [r, g, b, n] of spec) for (let i = 0; i < n; i += 1) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

test("extractPalette finds the dominant colours, most common first", () => {
  const data = pixels([
    [20, 30, 120, 600],
    [250, 120, 30, 300],
    [245, 245, 240, 100],
  ]);
  const palette = extractPalette(data, 3);
  assert.equal(palette.length, 3);
  assert.ok(colorDistance(palette[0], "#141e78") < 10, palette[0]);
  assert.ok(colorDistance(palette[1], "#fa781e") < 10, palette[1]);
  assert.ok(colorDistance(palette[2], "#f5f5f0") < 10, palette[2]);
});

test("extractPalette drops near-duplicates, ignores transparent pixels and is deterministic", () => {
  const data = pixels([
    [100, 100, 100, 500],
    [102, 101, 99, 500],
  ]);
  assert.equal(extractPalette(data, 5).length, 1);
  const transparent = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 10]);
  assert.deepEqual(extractPalette(transparent, 3), []);
  const mixed = pixels([[10, 200, 30, 50], [200, 10, 30, 50], [30, 10, 200, 50]]);
  assert.deepEqual(extractPalette(mixed, 3), extractPalette(mixed, 3));
});
