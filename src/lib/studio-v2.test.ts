import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComposition, locateDnaInPrompt, markSegments, normalizeSnapshot, reflectDnaChange, shuffleUnlockedValues } from "./studio-v2.ts";
import { EMPTY_SNAPSHOT } from "./studio-diff.ts";
import type { DnaSection } from "./prompt-dna/types.ts";
import type { GeneratorField, GeneratorSchema } from "../types/index.ts";

function section(id: string, content: string): DnaSection {
  return { id, type: "subject", label: null, content, source: "manual", confidence: null, orderIndex: 0 };
}

function field(key: string, type: GeneratorField["type"], options: string[] = []): GeneratorField {
  return {
    id: key, key, label: key, description: "", type, required: false,
    options: options.map((o) => ({ label: o, value: o })),
    defaultValue: type === "multi_select" ? [] : "", placeholder: "", min: null, max: null, step: null, order: 0, condition: null, jsonPath: key,
  };
}

test("locateDnaInPrompt finds Turkish text regardless of case/diacritics and maps back to the original offsets", () => {
  const text = "Yağmurlu İstanbul gecesinde genç kadın yürüyor";
  const hit = locateDnaInPrompt(text, "genç kadın");
  assert.equal(hit.matched, true);
  assert.equal(text.slice(hit.ranges[0].start, hit.ranges[0].end), "genç kadın");
  const ci = locateDnaInPrompt(text, "GENC KADIN");
  assert.equal(ci.matched, true);
  assert.equal(text.slice(ci.ranges[0].start, ci.ranges[0].end), "genç kadın");
});

test("locateDnaInPrompt handles multi-piece content and misses honestly", () => {
  const text = "neon ışık ve yağmurlu sokak";
  const multi = locateDnaInPrompt(text, "neon, yağmurlu");
  assert.equal(multi.ranges.length, 2);
  assert.equal(locateDnaInPrompt(text, "kamera 85mm").matched, false);
  assert.equal(locateDnaInPrompt(text, "").matched, false);
});

test("markSegments rejoins exactly and merges overlapping ranges", () => {
  const text = "abcdefghij";
  const segs = markSegments(text, [{ start: 2, end: 5 }, { start: 4, end: 7 }]);
  assert.equal(segs.map((s) => s.text).join(""), text);
  assert.deepEqual(segs.filter((s) => s.mark).map((s) => s.text), ["cdefg"]);
  assert.deepEqual(markSegments("x", []), [{ text: "x", mark: false }]);
});

test("reflectDnaChange reports reflected vs unmatched and ignores added/removed sections", () => {
  const prev = [section("a", "85mm lens"), section("b", "neon")];
  const next = [section("a", "50mm lens"), section("b", "gün ışığı"), section("c", "yeni")];
  const out = reflectDnaChange("Portre, 85mm lens ile", prev, next);
  assert.equal(out.text, "Portre, 50mm lens ile");
  assert.deepEqual(out.results, [{ id: "a", status: "reflected" }, { id: "b", status: "unmatched" }]);
  assert.equal(reflectDnaChange("aynı", prev, prev).results.length, 0);
});

test("shuffleUnlockedValues never touches locked or non-option fields and always moves selects", () => {
  const schema: GeneratorSchema = { fields: [field("lens", "select", ["35mm", "50mm", "85mm"]), field("light", "radio", ["neon", "gün"]), field("note", "text"), field("tags", "multi_select", ["a", "b", "c"])] };
  const values = { lens: "85mm", light: "neon", note: "x", tags: ["a"] };
  let n = 0;
  const rng = () => ((n += 0.37) % 1);
  const out = shuffleUnlockedValues(schema, values, ["lens"], rng);
  assert.equal(out.values.lens, "85mm");
  assert.equal(out.values.note, "x");
  assert.notEqual(out.values.light, "neon");
  assert.ok(Array.isArray(out.values.tags) && (out.values.tags as string[]).length > 0);
  assert.ok(!out.changed.includes("lens") && !out.changed.includes("note"));
  const allLocked = shuffleUnlockedValues(schema, values, ["lens", "light", "tags"], rng);
  assert.deepEqual(allLocked.values, values);
  assert.deepEqual(allLocked.changed, []);
});

test("buildComposition lists attached pieces in assembly order", () => {
  assert.deepEqual(buildComposition(EMPTY_SNAPSHOT), []);
  const draft = {
    ...EMPTY_SNAPSHOT,
    workflow: { title: "W", steps: [] },
    generator: { title: "G", schema: { fields: [field("a", "text")] }, values: {}, locked: ["a"] },
    prompt: { title: "P", text: "x ".repeat(200), variables: [{ name: "v", value: "" }] },
    preset: { title: "H", fields: [], selection: { k: "v" } },
  };
  const nodes = buildComposition(draft);
  assert.deepEqual(nodes.map((n) => n.kind), ["prompt", "preset", "generator", "workflow"]);
  assert.ok(nodes[0].excerpt.length <= 92 && nodes[0].excerpt.endsWith("…"));
  assert.equal(nodes[2].locked, 1);
  assert.equal(nodes[1].applied, 1);
});

test("normalizeSnapshot survives garbage and keeps valid pieces", () => {
  assert.deepEqual(normalizeSnapshot(null), EMPTY_SNAPSHOT);
  assert.deepEqual(normalizeSnapshot({ prompt: "nope", dna: 3, generator: { schema: {} } }), EMPTY_SNAPSHOT);
  const ok = normalizeSnapshot({ prompt: { title: "T", text: "metin", variables: [{ name: "a", value: "b" }, { value: "x" }] }, dna: [{ id: "1" }], generator: { title: "G", schema: { fields: [] }, values: {}, locked: ["k", 3] } });
  assert.equal(ok.prompt?.variables.length, 1);
  assert.equal(ok.dna?.length, 1);
  assert.deepEqual(ok.generator?.locked, ["k"]);
  // DNA without a prompt is dropped (it belongs to the prompt).
  assert.equal(normalizeSnapshot({ dna: [{ id: "1" }] }).dna, null);
});
