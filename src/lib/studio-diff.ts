import type { DnaSection } from "@/lib/prompt-dna/types";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
import type { GeneratorSchema, GeneratorValues, WorkflowStep } from "@/types";

/**
 * Studio's pure, framework-free core: the snapshot shape a Studio draft/version
 * is made of, word-level text diff, the DNA→prompt reflection rule, and the
 * snapshot-to-snapshot change list. No React/DOM (so `npm test` runs it).
 */

type Lang = "tr" | "en";

export interface StudioVariable {
  name: string;
  value: string;
}

export interface StudioSnapshot {
  prompt: { title: string; text: string; variables: StudioVariable[] } | null;
  dna: DnaSection[] | null;
  generator: { title: string; schema: GeneratorSchema; values: GeneratorValues } | null;
  preset: { title: string; fields: PresetField[]; selection: PresetSelection } | null;
  workflow: { title: string; steps: WorkflowStep[] } | null;
}

export const EMPTY_SNAPSHOT: StudioSnapshot = { prompt: null, dna: null, generator: null, preset: null, workflow: null };

export type DiffSegmentKind = "same" | "add" | "remove";
export interface DiffSegment {
  text: string;
  kind: DiffSegmentKind;
}

const MAX_DIFF_TOKENS = 1500;

/** Longest-common-subsequence word diff. Whitespace runs are kept as their own tokens so the segments rejoin to exactly the inputs. */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ text: before, kind: "same" }] : [];
  const a = before.split(/(\s+)/).filter((token) => token !== "");
  const b = after.split(/(\s+)/).filter((token) => token !== "");
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    const out: DiffSegment[] = [];
    if (before) out.push({ text: before, kind: "remove" });
    if (after) out.push({ text: after, kind: "add" });
    return out;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const out: DiffSegment[] = [];
  const push = (text: string, kind: DiffSegmentKind) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push(a[i], "remove");
      i++;
    } else {
      push(b[j], "add");
      j++;
    }
  }
  while (i < a.length) push(a[i++], "remove");
  while (j < b.length) push(b[j++], "add");
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * When a DNA section's text changes and the OLD text appears in the draft
 * prompt, the draft prompt follows (case-insensitive, all occurrences). If
 * the old text is not in the prompt the change stays a DNA-only change — it
 * never invents text. The stored/original prompt is never touched; callers
 * apply this to the Studio draft only.
 */
export function reflectDnaEdit(promptText: string, before: string, after: string): { text: string; reflected: boolean } {
  const needle = before.trim();
  const replacement = after.trim();
  if (!needle || needle.toLowerCase() === replacement.toLowerCase()) return { text: promptText, reflected: false };
  const pattern = new RegExp(escapeRegExp(needle), "gi");
  if (!pattern.test(promptText)) return { text: promptText, reflected: false };
  pattern.lastIndex = 0;
  return { text: promptText.replace(pattern, () => replacement), reflected: true };
}

export type DiffArea = "prompt" | "variables" | "dna" | "generator" | "preset" | "workflow";

export interface DiffEntry {
  area: DiffArea;
  /** Raw, already human-readable label (field/variable/step name). */
  label: string;
  /** DNA section type, so the UI can translate the label. */
  sectionType?: string;
  before: string | null;
  after: string | null;
}

function show(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  return String(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  return show(a) === show(b);
}

function optionLabelOf(field: PresetField, value: unknown, language: Lang): string {
  const labels = (Array.isArray(value) ? value : [value]).map((v) => {
    const option = field.options.find((o) => o.value === v);
    return option ? (option.i18n ? option.i18n[language] : option.label) : show(v);
  });
  return labels.join(", ");
}

function dnaKey(section: DnaSection): string {
  return section.id;
}

function stepSourceText(steps: WorkflowStep[], step: WorkflowStep): string {
  const parts: string[] = [];
  for (const input of step.inputs) {
    if (!input.source) continue;
    const from = steps.findIndex((s) => s.id === input.source?.stepId);
    if (from >= 0) parts.push(`${input.label || "·"} ← #${from + 1}`);
  }
  return parts.join(", ");
}

/** The list of meaningful differences between two snapshots (prompt TEXT is word-diffed separately by the UI via `diffWords`). */
export function diffSnapshots(a: StudioSnapshot, b: StudioSnapshot, language: Lang = "tr"): DiffEntry[] {
  const out: DiffEntry[] = [];

  if (a.prompt || b.prompt) {
    if ((a.prompt?.title ?? "") !== (b.prompt?.title ?? "")) out.push({ area: "prompt", label: "title", before: a.prompt?.title ?? null, after: b.prompt?.title ?? null });
    if ((a.prompt?.text ?? "") !== (b.prompt?.text ?? "")) out.push({ area: "prompt", label: "text", before: a.prompt?.text ?? null, after: b.prompt?.text ?? null });
    const names = new Set([...(a.prompt?.variables ?? []), ...(b.prompt?.variables ?? [])].map((v) => v.name));
    for (const name of names) {
      const before = a.prompt?.variables.find((v) => v.name === name)?.value ?? null;
      const after = b.prompt?.variables.find((v) => v.name === name)?.value ?? null;
      if (before !== after) out.push({ area: "variables", label: name, before, after });
    }
  }

  if (a.dna || b.dna) {
    const before = new Map((a.dna ?? []).map((s) => [dnaKey(s), s]));
    const after = new Map((b.dna ?? []).map((s) => [dnaKey(s), s]));
    for (const [key, section] of after) {
      const prev = before.get(key);
      if (!prev) out.push({ area: "dna", label: section.label ?? section.type, sectionType: section.type, before: null, after: section.content });
      else if (prev.content !== section.content) out.push({ area: "dna", label: section.label ?? section.type, sectionType: section.type, before: prev.content, after: section.content });
    }
    for (const [key, section] of before) {
      if (!after.has(key)) out.push({ area: "dna", label: section.label ?? section.type, sectionType: section.type, before: section.content, after: null });
    }
  }

  if (a.generator || b.generator) {
    if ((a.generator?.title ?? "") !== (b.generator?.title ?? "")) out.push({ area: "generator", label: "title", before: a.generator?.title ?? null, after: b.generator?.title ?? null });
    const beforeFields = new Map((a.generator?.schema.fields ?? []).map((f) => [f.id, f]));
    const afterFields = new Map((b.generator?.schema.fields ?? []).map((f) => [f.id, f]));
    for (const [id, field] of afterFields) {
      const prev = beforeFields.get(id);
      if (!prev) {
        out.push({ area: "generator", label: field.label || field.key, before: null, after: field.type });
        continue;
      }
      const prevShape = `${prev.label}|${prev.type}|${prev.options.map((o) => o.value).join(",")}|${show(prev.defaultValue)}|${prev.required}`;
      const nextShape = `${field.label}|${field.type}|${field.options.map((o) => o.value).join(",")}|${show(field.defaultValue)}|${field.required}`;
      if (prevShape !== nextShape) {
        out.push({ area: "generator", label: field.label || field.key, before: prev.label === field.label ? `${prev.type} · ${show(prev.defaultValue)}` : prev.label, after: prev.label === field.label ? `${field.type} · ${show(field.defaultValue)}` : field.label });
      }
    }
    for (const [id, field] of beforeFields) if (!afterFields.has(id)) out.push({ area: "generator", label: field.label || field.key, before: field.type, after: null });
    const keys = new Set([...Object.keys(a.generator?.values ?? {}), ...Object.keys(b.generator?.values ?? {})]);
    for (const key of keys) {
      const before = a.generator?.values[key];
      const after = b.generator?.values[key];
      if (sameValue(before, after)) continue;
      const field = b.generator?.schema.fields.find((f) => f.key === key) ?? a.generator?.schema.fields.find((f) => f.key === key);
      const lookup = (value: string | string[] | undefined) =>
        field && value !== undefined ? (Array.isArray(value) ? value : [value]).map((v) => field.options.find((o) => o.value === v)?.label ?? v).join(", ") : show(value);
      out.push({ area: "generator", label: field?.label || key, before: before === undefined ? null : lookup(before), after: after === undefined ? null : lookup(after) });
    }
  }

  if (a.preset || b.preset) {
    const fields = new Map<string, PresetField>();
    for (const f of [...(a.preset?.fields ?? []), ...(b.preset?.fields ?? [])]) fields.set(f.id, f);
    const keys = new Set([...Object.keys(a.preset?.selection ?? {}), ...Object.keys(b.preset?.selection ?? {})]);
    for (const key of keys) {
      const before = a.preset?.selection[key];
      const after = b.preset?.selection[key];
      if (sameValue(before, after)) continue;
      const field = fields.get(key);
      out.push({
        area: "preset",
        label: field ? (field.i18n ? field.i18n[language] : field.name) : key,
        before: before === undefined || before === "" ? null : field ? optionLabelOf(field, before, language) : show(before),
        after: after === undefined || after === "" ? null : field ? optionLabelOf(field, after, language) : show(after),
      });
    }
  }

  if (a.workflow || b.workflow) {
    if ((a.workflow?.title ?? "") !== (b.workflow?.title ?? "")) out.push({ area: "workflow", label: "title", before: a.workflow?.title ?? null, after: b.workflow?.title ?? null });
    const stepsA = a.workflow?.steps ?? [];
    const stepsB = b.workflow?.steps ?? [];
    const byIdA = new Map(stepsA.map((s) => [s.id, s]));
    const byIdB = new Map(stepsB.map((s) => [s.id, s]));
    const orderA = stepsA.map((s) => s.id).join(",");
    const orderB = stepsB.filter((s) => byIdA.has(s.id)).map((s) => s.id).join(",");
    const orderACommon = stepsA.filter((s) => byIdB.has(s.id)).map((s) => s.id).join(",");
    if (orderA && orderB && orderACommon !== orderB) {
      out.push({ area: "workflow", label: "order", before: stepsA.map((s) => s.title || "·").join(" → "), after: stepsB.map((s) => s.title || "·").join(" → ") });
    }
    stepsB.forEach((step, index) => {
      const prev = byIdA.get(step.id);
      if (!prev) {
        out.push({ area: "workflow", label: `#${index + 1}`, before: null, after: step.title || "·" });
        return;
      }
      if (prev.title !== step.title) out.push({ area: "workflow", label: `#${index + 1}`, before: prev.title, after: step.title });
      if (prev.instructions !== step.instructions) out.push({ area: "workflow", label: `#${index + 1}`, before: prev.instructions || null, after: step.instructions || null });
      const sourceBefore = stepSourceText(stepsA, prev);
      const sourceAfter = stepSourceText(stepsB, step);
      if (sourceBefore !== sourceAfter) out.push({ area: "workflow", label: `#${index + 1} ⇢`, before: sourceBefore || null, after: sourceAfter || null });
    });
    stepsA.forEach((step, index) => {
      if (!byIdB.has(step.id)) out.push({ area: "workflow", label: `#${index + 1}`, before: step.title || "·", after: null });
    });
  }

  return out;
}

export function snapshotsEqual(a: StudioSnapshot, b: StudioSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSnapshot(snapshot: StudioSnapshot): StudioSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as StudioSnapshot;
}
