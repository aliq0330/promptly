import { foldText } from "./prompt-dna/text.ts";
import { reflectDnaEdit } from "./studio-diff.ts";
import type { StudioSnapshot } from "./studio-diff.ts";
import type { DnaSection } from "./prompt-dna/types.ts";
import type { GeneratorField, GeneratorSchema, GeneratorValues } from "../types/index.ts";

/**
 * Studio V2's pure helpers (no React/DOM, so `npm test` runs them): where a DNA
 * section's words sit inside the prompt, DNA→prompt reflection with an explicit
 * per-section status, deterministic "variation" shuffling that respects locked
 * generator fields, the composition recipe, and defensive snapshot coercion for
 * sessions loaded from storage.
 */

/* ------------------------------------------------------------------ DNA ↔ prompt */

export interface TextRange {
  start: number;
  end: number;
}

const MAX_RANGES = 24;

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextRange[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
}

/**
 * Where the words of a DNA section appear in the prompt. A section's content
 * can hold several comma/semicolon separated pieces ("neon, yağmurlu"); each
 * piece is looked up on its own. Matching is case- and Turkish-diacritic-
 * insensitive (the fold keeps string length, so offsets map straight back to
 * the user's own text).
 */
export function locateDnaInPrompt(promptText: string, content: string): { ranges: TextRange[]; matched: boolean } {
  const folded = foldText(promptText);
  const ranges: TextRange[] = [];
  for (const piece of content.split(/[,;\n]/)) {
    const needle = foldText(piece).trim();
    if (!needle) continue;
    let from = 0;
    while (ranges.length < MAX_RANGES) {
      const at = folded.indexOf(needle, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  const merged = mergeRanges(ranges);
  return { ranges: merged, matched: merged.length > 0 };
}

export interface MarkSegment {
  text: string;
  mark: boolean;
}

/** Splits `text` into plain and highlighted parts; the parts rejoin to exactly `text`. */
export function markSegments(text: string, ranges: TextRange[]): MarkSegment[] {
  const out: MarkSegment[] = [];
  let cursor = 0;
  for (const range of mergeRanges(ranges)) {
    const start = Math.max(range.start, cursor);
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > cursor) out.push({ text: text.slice(cursor, start), mark: false });
    out.push({ text: text.slice(start, end), mark: true });
    cursor = end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), mark: false });
  return out;
}

export type ReflectStatus = "reflected" | "unmatched";

export interface DnaReflection {
  text: string;
  /** One entry per section whose content changed, in order. Added/removed sections never touch the prompt. */
  results: { id: string; status: ReflectStatus }[];
}

/**
 * Applies the DNA edit to the DRAFT prompt where the old words really occur
 * and reports, per changed section, whether that happened — so the UI never
 * silently changes (or silently fails to change) the text.
 */
export function reflectDnaChange(promptText: string, previous: DnaSection[], next: DnaSection[]): DnaReflection {
  let text = promptText;
  const results: DnaReflection["results"] = [];
  for (const section of next) {
    const before = previous.find((p) => p.id === section.id);
    if (!before || before.content === section.content) continue;
    const outcome = reflectDnaEdit(text, before.content, section.content);
    text = outcome.text;
    results.push({ id: section.id, status: outcome.reflected ? "reflected" : "unmatched" });
  }
  return { text, results };
}

/* ------------------------------------------------------------------ variations */

/** Fields whose value can be varied by picking among options. */
export function isVariableField(field: GeneratorField): boolean {
  return (field.type === "select" || field.type === "radio" || field.type === "multi_select") && field.options.length > 1;
}

/**
 * Re-rolls option-based generator fields that are NOT locked. A select/radio
 * always moves to a different option; a multi-select gets a new non-empty
 * subset. Locked fields, free-text/number/etc. fields and everything else stay
 * exactly as they were. `rng` is injectable so the result is testable.
 */
export function shuffleUnlockedValues(
  schema: GeneratorSchema,
  values: GeneratorValues,
  locked: readonly string[],
  rng: () => number = Math.random,
): { values: GeneratorValues; changed: string[] } {
  const next: GeneratorValues = { ...values };
  const changed: string[] = [];
  const lockedSet = new Set(locked);
  for (const field of schema.fields) {
    if (lockedSet.has(field.key) || !isVariableField(field)) continue;
    const all = field.options.map((o) => o.value);
    if (field.type === "multi_select") {
      const current = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
      const size = 1 + Math.floor(rng() * Math.min(3, all.length));
      const pool = [...all];
      const pick: string[] = [];
      while (pick.length < size && pool.length > 0) pick.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      const ordered = all.filter((v) => pick.includes(v));
      if (ordered.join("|") !== [...current].sort().join("|") && ordered.join("|") !== current.join("|")) {
        next[field.key] = ordered;
        changed.push(field.key);
      }
      continue;
    }
    const current = typeof values[field.key] === "string" ? (values[field.key] as string) : "";
    const others = all.filter((v) => v !== current);
    if (others.length === 0) continue;
    next[field.key] = others[Math.floor(rng() * others.length)];
    changed.push(field.key);
  }
  return { values: next, changed };
}

/* ------------------------------------------------------------------ composition recipe */

export type CompositionKind = "prompt" | "preset" | "generator" | "workflow";

export interface CompositionNode {
  kind: CompositionKind;
  title: string;
  /** A short excerpt (prompt) — empty for the other kinds. */
  excerpt: string;
  variables: number;
  sections: number;
  applied: number;
  total: number;
  parameters: number;
  locked: number;
  steps: number;
}

const EXCERPT_LENGTH = 90;

/**
 * The order the Studio result is actually assembled in (prompt → preset →
 * generator), with the workflow last (it is a sequence of steps, not a
 * text transform). Only attached pieces appear.
 */
export function buildComposition(draft: StudioSnapshot): CompositionNode[] {
  const base: Omit<CompositionNode, "kind" | "title" | "excerpt"> = { variables: 0, sections: 0, applied: 0, total: 0, parameters: 0, locked: 0, steps: 0 };
  const nodes: CompositionNode[] = [];
  if (draft.prompt) {
    const flat = draft.prompt.text.replace(/\s+/g, " ").trim();
    nodes.push({
      ...base,
      kind: "prompt",
      title: draft.prompt.title,
      excerpt: flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…` : flat,
      variables: draft.prompt.variables.length,
      sections: draft.dna?.length ?? 0,
    });
  }
  if (draft.preset) {
    nodes.push({ ...base, kind: "preset", title: draft.preset.title, excerpt: "", applied: Object.keys(draft.preset.selection).length, total: draft.preset.fields.length });
  }
  if (draft.generator) {
    nodes.push({ ...base, kind: "generator", title: draft.generator.title, excerpt: "", parameters: draft.generator.schema.fields.length, locked: draft.generator.locked?.length ?? 0 });
  }
  if (draft.workflow) {
    nodes.push({ ...base, kind: "workflow", title: draft.workflow.title, excerpt: "", steps: draft.workflow.steps.length });
  }
  return nodes;
}

/* ------------------------------------------------------------------ stored sessions */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerces JSON read back from storage into a snapshot, tolerating missing or
 * malformed pieces (they become null) so an old or hand-edited row can never
 * crash the workspace.
 */
export function normalizeSnapshot(raw: unknown): StudioSnapshot {
  const value = isObject(raw) ? raw : {};
  const prompt = isObject(value.prompt) && typeof value.prompt.text === "string"
    ? {
        title: typeof value.prompt.title === "string" ? value.prompt.title : "",
        text: value.prompt.text,
        variables: Array.isArray(value.prompt.variables)
          ? value.prompt.variables.filter(isObject).map((v) => ({ name: String(v.name ?? ""), value: String(v.value ?? "") })).filter((v) => v.name)
          : [],
      }
    : null;
  const generator = isObject(value.generator) && isObject(value.generator.schema) && Array.isArray((value.generator.schema as { fields?: unknown }).fields)
    ? {
        title: typeof value.generator.title === "string" ? value.generator.title : "",
        schema: value.generator.schema as unknown as GeneratorSchema,
        values: isObject(value.generator.values) ? (value.generator.values as GeneratorValues) : {},
        locked: Array.isArray(value.generator.locked) ? value.generator.locked.filter((k): k is string => typeof k === "string") : [],
      }
    : null;
  const preset = isObject(value.preset) && Array.isArray(value.preset.fields)
    ? {
        title: typeof value.preset.title === "string" ? value.preset.title : "",
        fields: value.preset.fields as unknown as NonNullable<StudioSnapshot["preset"]>["fields"],
        selection: isObject(value.preset.selection) ? (value.preset.selection as NonNullable<StudioSnapshot["preset"]>["selection"]) : {},
      }
    : null;
  const workflow = isObject(value.workflow) && Array.isArray(value.workflow.steps)
    ? { title: typeof value.workflow.title === "string" ? value.workflow.title : "", steps: value.workflow.steps as unknown as NonNullable<StudioSnapshot["workflow"]>["steps"] }
    : null;
  const dna = Array.isArray(value.dna) ? (value.dna.filter(isObject) as unknown as DnaSection[]) : null;
  return { prompt, dna: prompt ? dna : null, generator, preset, workflow };
}
