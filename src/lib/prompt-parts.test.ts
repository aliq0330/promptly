/**
 * `assemblePromptParts` — the final prompt of a prompt + a preset, with the source of every piece (`npm test`).
 * `legacyCompose` is the text rule `composePrompt` had before the parts were introduced: the joined parts must equal it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assemblePromptParts, joinPromptParts } from "./prompt-parts.ts";

function legacyCompose(original: string, phrases: string[], suffixes: string[]): string {
  if (phrases.length === 0 && suffixes.length === 0) return original;
  const base = original.trim().replace(/[.\s]+$/, "");
  const sentence = [base, ...phrases].filter(Boolean).join(", ");
  const withStop = sentence ? `${sentence}.` : "";
  return [withStop, ...suffixes].filter(Boolean).join(" ");
}

test("the joined parts are exactly the old composePrompt text, in every shape", () => {
  const originals = ["", "   ", "a cat", "a cat.", "a cat . ", "  a cat on a sofa...  "];
  const phraseSets = [[], ["soft light"], ["soft light", "85mm lens"], ["", "warm tones"]];
  const suffixSets = [[], ["--ar 3:4"], ["--ar 3:4", "--stylize 250"]];
  for (const original of originals)
    for (const phrases of phraseSets)
      for (const suffixes of suffixSets)
        assert.equal(joinPromptParts(assemblePromptParts(original, phrases, suffixes)), legacyCompose(original, phrases, suffixes), JSON.stringify({ original, phrases, suffixes }));
});

test("the prompt's own words are 'prompt', what the preset adds is 'preset'", () => {
  const parts = assemblePromptParts("a cat on a sofa.", ["soft light", "85mm lens"], ["--ar 3:4"]);
  assert.deepEqual(parts, [
    { text: "a cat on a sofa", from: "prompt" },
    { text: ", soft light", from: "preset" },
    { text: ", 85mm lens", from: "preset" },
    { text: ".", from: "prompt" },
    { text: " --ar 3:4", from: "preset" },
  ]);
});

test("with nothing to add the prompt comes back untouched (not trimmed), and an empty prompt gives no parts", () => {
  assert.deepEqual(assemblePromptParts(" a cat. ", [], []), [{ text: " a cat. ", from: "prompt" }]);
  assert.deepEqual(assemblePromptParts("", [], []), []);
});

test("an empty prompt: the preset's phrases stand alone and own the full stop", () => {
  const parts = assemblePromptParts("", ["soft light", "warm tones"], []);
  assert.equal(joinPromptParts(parts), "soft light, warm tones.");
  assert.ok(parts.every((part) => part.from === "preset"));
});
