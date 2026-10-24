/**
 * "Uyumlu" — how well a preset fits a prompt (docs/history/228-*). Pure (no React, no Supabase) so it is unit-tested.
 *
 * Two separate questions, never mixed:
 *  1. PRESET vs PROMPT (`presetFit`): is this preset meant for this kind of prompt? Same content type is required; category and
 *     recommended tool only decide "Uyumlu" (match) vs "Kısmen" (partial) — nothing is hidden for them, because most phrases
 *     ("85 mm lens, soft light") work in any image model.
 *  2. FIELD vs TARGET TOOL (`fieldAvailable`): some fields are one tool's own syntax (Midjourney's `--ar` / `--stylize` /
 *     `--chaos` suffixes) and would be garbage in another tool, so they switch off by themselves.
 * It says "made for this kind of prompt", not "the result will be good": text already in the prompt (an "50 mm" next to a preset's
 * "85 mm") is not detected — the final-prompt preview and the per-field switches are how the user settles that.
 */
import type { Preset, Prompt } from "../types/index.ts";

/** Field id → the one tool it belongs to. The catalog (`prompt-extra-settings.ts`) builds its Midjourney field list from this. */
export const TOOL_ONLY_FIELDS: Readonly<Record<string, string>> = {
  mj_ar: "midjourney",
  mj_stylize: "midjourney",
  mj_chaos: "midjourney",
};

/** Tool id of a catalog ref ("gpt-image:gpt-image-1" → "gpt-image"); same rule as `parseToolRef`. */
function toolIdOf(ref: string): string {
  return ref.split(":")[0];
}

/** Does a field work with the target tools? A tool-only field needs ITS tool among them; no known tool means it stays off. */
export function fieldAvailable(fieldId: string, targetToolRefs: readonly string[]): boolean {
  const only = TOOL_ONLY_FIELDS[fieldId];
  if (!only) return true;
  return targetToolRefs.some((ref) => toolIdOf(ref) === only);
}

/** The tool a tool-only field needs, or null for an ordinary field. */
export function fieldToolOnly(fieldId: string): string | null {
  return TOOL_ONLY_FIELDS[fieldId] ?? null;
}

export type FitLevel = "match" | "partial" | "none";
export type CategoryFit = "same" | "general" | "different";
export type ToolFit = "shared" | "independent" | "other";

export interface FitTarget {
  contentType: Prompt["contentType"];
  category: string | null;
  subcategory: string | null;
  /** Recommended tool refs of the prompt. */
  tools: readonly string[];
  tagSlugs?: readonly string[];
}

export interface PresetFit {
  level: FitLevel;
  category: CategoryFit;
  tool: ToolFit;
  /** The first tool both have (for "… Midjourney ile eşleşti"), else null. */
  sharedToolId: string | null;
  /** The preset's first tool id that is not among the target's (for "başka araç: X"), else null. */
  otherToolId: string | null;
  score: number;
}

export function targetOfPrompt(prompt: Pick<Prompt, "contentType" | "category" | "subcategory" | "tools" | "tags">): FitTarget {
  return {
    contentType: prompt.contentType,
    category: prompt.category,
    subcategory: prompt.subcategory,
    tools: prompt.tools,
    tagSlugs: prompt.tags.map((tag) => tag.slug),
  };
}

type PresetLike = Pick<Preset, "contentType" | "category" | "subcategory" | "tools" | "tags" | "saveCount" | "likeCount">;

export function presetFit(target: FitTarget, preset: PresetLike): PresetFit {
  if (preset.contentType !== target.contentType) return { level: "none", category: "different", tool: "other", sharedToolId: null, otherToolId: null, score: 0 };

  const category: CategoryFit = !preset.category || !target.category ? "general" : preset.category === target.category ? "same" : "different";

  const presetToolIds = preset.tools.map(toolIdOf);
  const targetToolIds = target.tools.map(toolIdOf);
  const sharedToolId = presetToolIds.find((id) => targetToolIds.includes(id)) ?? null;
  const shared = sharedToolId !== null;
  const tool: ToolFit = presetToolIds.length === 0 || targetToolIds.length === 0 ? "independent" : shared ? "shared" : "other";
  const otherToolId = tool === "other" ? (presetToolIds[0] ?? null) : null;

  const level: FitLevel = category === "different" || tool === "other" ? "partial" : "match";

  let score = 100;
  score += tool === "shared" ? 30 : tool === "independent" ? 10 : 0;
  score += category === "same" ? 25 : category === "general" ? 8 : 0;
  if (category === "same" && target.subcategory && preset.subcategory === target.subcategory) score += 10;
  const targetTags = new Set(target.tagSlugs ?? []);
  score += Math.min(15, preset.tags.filter((tag) => targetTags.has(tag.slug)).length * 5);
  score += Math.min(10, Math.round(Math.log(preset.saveCount + preset.likeCount + 1) * 3));
  if (level === "partial") score -= 60;

  return { level, category, tool, sharedToolId, otherToolId, score };
}

export interface RankedPreset<P> {
  preset: P;
  fit: PresetFit;
}

/** Presets that can be used with the target (same type), best fit first; ties keep the given order. */
export function rankPresetsByFit<P extends PresetLike>(target: FitTarget, presets: readonly P[]): RankedPreset<P>[] {
  return presets
    .map((preset, index) => ({ preset, fit: presetFit(target, preset), index }))
    .filter((row) => row.fit.level !== "none")
    .sort((a, b) => b.fit.score - a.fit.score || a.index - b.index)
    .map(({ preset, fit }) => ({ preset, fit }));
}
