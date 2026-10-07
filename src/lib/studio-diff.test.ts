import { test } from "node:test";
import assert from "node:assert/strict";
import { diffWords, reflectDnaEdit, diffSnapshots, EMPTY_SNAPSHOT, snapshotsEqual, cloneSnapshot } from "./studio-diff.ts";

test("diffWords rejoins exactly and marks changes", () => {
  const segs = diffWords("kamera 85mm ile çek", "kamera 50mm ile çek");
  assert.equal(segs.filter((s) => s.kind !== "add").map((s) => s.text).join(""), "kamera 85mm ile çek");
  assert.equal(segs.filter((s) => s.kind !== "remove").map((s) => s.text).join(""), "kamera 50mm ile çek");
  assert.deepEqual(segs.filter((s) => s.kind === "remove").map((s) => s.text), ["85mm"]);
  assert.deepEqual(segs.filter((s) => s.kind === "add").map((s) => s.text), ["50mm"]);
});

test("diffWords identical / empty", () => {
  assert.deepEqual(diffWords("", ""), []);
  assert.deepEqual(diffWords("a b", "a b"), [{ text: "a b", kind: "same" }]);
  assert.equal(diffWords("", "yeni").length, 1);
});

test("reflectDnaEdit replaces only when old text is present", () => {
  const hit = reflectDnaEdit("Sinematik portre, 85mm lens, yağmurlu", "85mm lens", "50mm lens");
  assert.equal(hit.reflected, true);
  assert.equal(hit.text, "Sinematik portre, 50mm lens, yağmurlu");
  const ci = reflectDnaEdit("85MM Lens", "85mm lens", "50mm");
  assert.equal(ci.text, "50mm");
  const miss = reflectDnaEdit("başka metin", "85mm", "50mm");
  assert.equal(miss.reflected, false);
  assert.equal(miss.text, "başka metin");
  assert.equal(reflectDnaEdit("x (a+b) y", "(a+b)", "z").text, "x z y");
  assert.equal(reflectDnaEdit("abc", "", "z").reflected, false);
});

test("diffSnapshots lists prompt, variable and dna changes", () => {
  const a = { ...EMPTY_SNAPSHOT, prompt: { title: "T", text: "x {a}", variables: [{ name: "a", value: "1" }] }, dna: [{ id: "d1", type: "camera", label: null, content: "85mm", source: "auto", confidence: "high", orderIndex: 0 }] } as never;
  const b = cloneSnapshot(a) as typeof a;
  assert.equal(snapshotsEqual(a, b), true);
  assert.equal(diffSnapshots(a, b).length, 0);
  (b as { prompt: { variables: { value: string }[]; text: string } }).prompt.variables[0].value = "2";
  (b as { prompt: { text: string } }).prompt.text = "y {a}";
  (b as { dna: { content: string }[] }).dna[0].content = "50mm";
  const d = diffSnapshots(a, b);
  assert.deepEqual(d.map((e) => `${e.area}:${e.label}`).sort(), ["dna:camera", "prompt:text", "variables:a"]);
});
