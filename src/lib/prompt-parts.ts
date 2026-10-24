/**
 * How a prompt and a preset's phrases become ONE final prompt — and which part of the text came from where (docs/history/228-*).
 * Pure (no React, no catalog) so it is unit-tested; `composePrompt` / `composePromptParts` in `preset-fields.ts` feed it the phrases.
 *
 *   "<prompt, without its trailing full stop>, <phrase>, <phrase>." then each suffix (Midjourney `--ar 3:4` …) after a space.
 */
export interface PromptPart {
  text: string;
  from: "prompt" | "preset";
}

/** The final text as parts whose `text`s concatenate to exactly what `composePrompt` returns. */
export function assemblePromptParts(original: string, phrases: readonly string[], suffixes: readonly string[]): PromptPart[] {
  if (phrases.length === 0 && suffixes.length === 0) return original ? [{ text: original, from: "prompt" }] : [];
  const base = original.trim().replace(/[.\s]+$/, "");
  const usedPhrases = phrases.filter(Boolean);
  const parts: PromptPart[] = [];
  if (base) parts.push({ text: base, from: "prompt" });
  usedPhrases.forEach((phrase, index) => parts.push({ text: (base || index > 0 ? ", " : "") + phrase, from: "preset" }));
  if (parts.length > 0) parts.push({ text: ".", from: base ? "prompt" : "preset" });
  for (const suffix of suffixes.filter(Boolean)) parts.push({ text: (parts.length > 0 ? " " : "") + suffix, from: "preset" });
  return parts;
}

/** Concatenation of the parts. */
export function joinPromptParts(parts: readonly PromptPart[]): string {
  return parts.map((part) => part.text).join("");
}
