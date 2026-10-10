import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDna, sectionTokens, tokenize, MIN_SCORE } from "./dna-similarity.ts";
import type { DnaFeatureSet } from "./dna-similarity.ts";

const set = (sections: [string, string][], extra: Partial<DnaFeatureSet> = {}): DnaFeatureSet => ({
  sections: sections.map(([type, content]) => ({ type: type as never, content })),
  tags: [],
  category: null,
  subcategory: null,
  ...extra,
});

test("tokenize folds Turkish characters and drops stopwords/short words", () => {
  assert.deepEqual(tokenize("Neon IŞIKLAR ve bir sokak").sort(), ["isiklar", "neon", "sokak"]);
});

test("identical sections give a high score and report the shared pieces", () => {
  const a = set([["lighting", "neon ışıklar, yumuşak gölge"], ["style", "cyberpunk"]]);
  const b = set([["lighting", "Neon Işıklar, yumuşak gölge"], ["style", "Cyberpunk"]]);
  const r = compareDna(a, b)!;
  assert.equal(r.level, "high");
  assert.ok(r.score >= 0.6);
  assert.deepEqual(r.shared.map((s) => s.type).sort(), ["lighting", "style"]);
  assert.deepEqual(r.shared.find((s) => s.type === "lighting")!.pieces, ["neon ışıklar", "yumuşak gölge"]);
});

test("is Turkish case/diacritic insensitive and tolerates simple suffixes", () => {
  const r = compareDna(set([["lighting", "ışık"]]), set([["lighting", "IŞIKLAR"]]));
  assert.ok(r, "ışık ~ IŞIKLAR");
});

test("unrelated prompts do not match", () => {
  assert.equal(compareDna(set([["lighting", "neon ışıklar"]]), set([["lighting", "gün batımı"]])), null);
});

test("metadata alone never creates a suggestion", () => {
  const a = set([["lighting", "neon"]], { tags: ["a", "b", "c"], category: "x", subcategory: "y" });
  const b = set([["lighting", "gün batımı"]], { tags: ["a", "b", "c"], category: "x", subcategory: "y" });
  assert.equal(compareDna(a, b), null);
});

test("a match only in a weak section (output/format/…) is not enough", () => {
  assert.equal(compareDna(set([["output", "4k"], ["subject", "kedi"]]), set([["output", "4k"], ["subject", "araba"]])), null);
});

test("shared tags and category add a small, capped bonus and are reported", () => {
  const base = [["lighting", "neon ışıklar"], ["style", "cyberpunk"], ["camera", "wide angle"]] as [string, string][];
  const plain = compareDna(set(base), set([["lighting", "neon ışıklar"], ["style", "anime"], ["camera", "close up"]]))!;
  const boosted = compareDna(
    set(base, { tags: ["neon", "city"], category: "scene", subcategory: "street" }),
    set([["lighting", "neon ışıklar"], ["style", "anime"], ["camera", "close up"]], { tags: ["neon", "city"], category: "scene", subcategory: "street" }),
  )!;
  assert.ok(boosted.score > plain.score);
  assert.ok(boosted.score - plain.score <= 0.13);
  assert.deepEqual(boosted.sharedTags, ["neon", "city"]);
  assert.equal(boosted.sameSubcategory, true);
});

test("a prompt with more unshared sections scores lower than a full match", () => {
  const a = set([["lighting", "neon"], ["style", "cyberpunk"]]);
  const full = compareDna(a, set([["lighting", "neon"], ["style", "cyberpunk"]]))!;
  const partial = compareDna(a, set([["lighting", "neon"], ["style", "anime"], ["camera", "wide"], ["composition", "centered"]]))!;
  assert.ok(partial.score < full.score);
});

test("empty / missing DNA gives null", () => {
  assert.equal(compareDna(set([]), set([["lighting", "neon"]])), null);
  assert.equal(compareDna(set([["lighting", "  ,  ;"]]), set([["lighting", "neon"]])), null);
});

test("is deterministic and symmetric in score", () => {
  const a = set([["lighting", "neon ışıklar"], ["style", "cyberpunk"]]);
  const b = set([["lighting", "neon"], ["style", "cyberpunk"], ["camera", "wide"]]);
  assert.equal(compareDna(a, b)!.score, compareDna(a, b)!.score);
  assert.equal(compareDna(a, b)!.score, compareDna(b, a)!.score);
  assert.ok(compareDna(a, b)!.score >= MIN_SCORE);
});

test("sectionTokens builds the candidate-lookup payload per type", () => {
  const out = sectionTokens([
    { type: "lighting", content: "neon ışıklar" },
    { type: "lighting", content: "yumuşak gölge" },
    { type: "style", content: "x" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "lighting");
  assert.deepEqual(out[0].tokens.sort(), ["golge", "isiklar", "neon", "yumusak"]);
});
