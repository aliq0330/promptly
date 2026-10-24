/** `presetFit` / `fieldAvailable` — "Uyumlu" rules (`npm test`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldAvailable, fieldToolOnly, presetFit, rankPresetsByFit, type FitTarget } from "./preset-fit.ts";

const target: FitTarget = { contentType: "image", category: "human_character", subcategory: "portrait", tools: ["midjourney"], tagSlugs: ["portre"] };

function preset(over: Partial<Parameters<typeof presetFit>[1]> = {}): Parameters<typeof presetFit>[1] {
  return { contentType: "image", category: "human_character", subcategory: "portrait", tools: ["midjourney"], tags: [], saveCount: 0, likeCount: 0, ...over };
}

test("a different content type never fits", () => {
  assert.equal(presetFit(target, preset({ contentType: "text" })).level, "none");
  assert.equal(presetFit(target, preset({ contentType: "video" })).level, "none");
});

test("same type + category + tool is a match", () => {
  const fit = presetFit(target, preset());
  assert.deepEqual([fit.level, fit.category, fit.tool], ["match", "same", "shared"]);
});

test("the model part of a tool ref does not matter, only the tool", () => {
  assert.equal(presetFit({ ...target, tools: ["gpt-image:gpt-image-1"] }, preset({ tools: ["gpt-image"] })).tool, "shared");
  assert.equal(presetFit({ ...target, tools: ["gpt-image"] }, preset({ tools: ["gpt-image:gpt-image-1"] })).tool, "shared");
});

test("a preset without tools or category is general: it still matches", () => {
  const fit = presetFit(target, preset({ tools: [], category: null, subcategory: null }));
  assert.deepEqual([fit.level, fit.category, fit.tool], ["match", "general", "independent"]);
  assert.equal(presetFit({ ...target, tools: [], category: null }, preset()).level, "match");
});

test("another tool or another category is only partial, with the reason", () => {
  const otherTool = presetFit(target, preset({ tools: ["gpt-image"] }));
  assert.deepEqual([otherTool.level, otherTool.tool, otherTool.otherToolId], ["partial", "other", "gpt-image"]);
  const otherCategory = presetFit(target, preset({ category: "product_commercial", subcategory: null }));
  assert.deepEqual([otherCategory.level, otherCategory.category], ["partial", "different"]);
});

test("ranking: best fit first, partial last, other types dropped, ties keep their order", () => {
  const a = preset({ tools: ["gpt-image"] }); // partial
  const b = preset(); // match, tool shared, category same
  const c = preset({ tools: [], category: null }); // match, general
  const d = preset({ contentType: "audio" }); // none
  const e = preset({ tools: [], category: null }); // ties with c
  assert.deepEqual(rankPresetsByFit(target, [a, b, c, d, e]).map((row) => row.preset), [b, c, e, a]);
});

test("popularity and shared tags lift a preset within the same fit", () => {
  const quiet = preset();
  const popular = preset({ saveCount: 40, likeCount: 20, tags: [{ slug: "portre", label: "Portre" } as never] });
  assert.equal(rankPresetsByFit(target, [quiet, popular])[0].preset, popular);
});

test("tool-only fields need their tool among the target's; unknown tool keeps them off", () => {
  assert.equal(fieldToolOnly("mj_ar"), "midjourney");
  assert.equal(fieldToolOnly("lens"), null);
  assert.equal(fieldAvailable("lens", []), true);
  assert.equal(fieldAvailable("lens", ["gpt-image"]), true);
  assert.equal(fieldAvailable("mj_ar", ["midjourney"]), true);
  assert.equal(fieldAvailable("mj_ar", ["midjourney:v7"]), true);
  assert.equal(fieldAvailable("mj_ar", ["nano-banana"]), false);
  assert.equal(fieldAvailable("mj_stylize", []), false);
});
