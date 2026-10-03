/**
 * Hazır Ayar (preset) FIELD MODEL — what a preset, a "hazır alan" and a
 * selected value look like, and the pure functions that turn a selection into
 * prompt text / readable chips. No React, no Supabase.
 *
 *   Preset       { …, fields: PresetField[], selection }          (src/types)
 *   PresetField  { id, presetId, name, type, options, sortOrder, config }
 *   PresetOption { id, fieldId, label, value, sortOrder }
 *
 * `PresetSelection` is the structured state: `{ [fieldId]: value }` with a
 * value shaped by the field type (option `value` string for single-select /
 * dropdown, `string[]` for multi-select, text, number, boolean, `#rrggbb`).
 * The prompt text is DERIVED from it (`composePrompt`) — an id is never
 * written into a prompt.
 *
 * Fields come from two places that share this one shape: the platform catalog
 * (`prompt-extra-settings.ts`, `source: "platform"`, ids are stable slugs like
 * `lens`) and the user's own tables (`preset_fields` / `preset_options`,
 * `source: "user"`, uuid ids). A legacy preset stored as `{ groupId: optionId }`
 * is already a valid selection: platform option `value`s ARE the old ids.
 */
import type { Language } from "@/lib/i18n/translations";
import { translateForRuntime } from "@/lib/i18n/translations";

export type PresetFieldType = "single_select" | "multi_select" | "dropdown" | "text" | "number" | "slider" | "toggle" | "color";

export const PRESET_FIELD_TYPES: readonly PresetFieldType[] = ["single_select", "multi_select", "dropdown", "text", "number", "slider", "toggle", "color"];

export type PresetValue = string | string[] | number | boolean;
export type PresetSelection = Record<string, PresetValue>;

export interface Bilingual {
  en: string;
  tr: string;
}

export interface PresetOption {
  id: string;
  fieldId: string;
  /** What the user sees. */
  label: string;
  /** What is stored in the selection and used in the prompt (defaults to the label). */
  value: string;
  sortOrder: number;
  /** Platform options carry both languages; user options are plain `label`s. */
  i18n?: Bilingual;
  /** Optional ready-made prompt phrase ("in soft diffused light"); otherwise `Name: value` is used. */
  fragment?: Bilingual;
}

export interface PresetFieldConfig {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** Prompt phrase for number/slider/toggle/color, `{value}` is replaced. */
  template?: Bilingual;
}

export interface PresetField {
  id: string;
  /** `null` for platform fields and for a user's own field library; set for a field that belongs to one preset. */
  presetId: string | null;
  name: string;
  type: PresetFieldType;
  options: PresetOption[];
  sortOrder: number;
  config: PresetFieldConfig;
  i18n?: Bilingual;
  /** `suffix` fields are tool parameters (Midjourney `--ar`), appended after the sentence. */
  kind?: "phrase" | "suffix";
  source: "platform" | "user";
  /** Content types a library field is offered for; empty / missing = all. */
  contentTypes?: string[];
}

export const OPTION_FIELD_TYPES: readonly PresetFieldType[] = ["single_select", "multi_select", "dropdown"];
export function isOptionField(type: PresetFieldType): boolean {
  return OPTION_FIELD_TYPES.includes(type);
}

export function fieldName(field: Pick<PresetField, "name" | "i18n">, language: Language): string {
  return field.i18n ? field.i18n[language] : field.name;
}
export function optionLabel(option: Pick<PresetOption, "label" | "i18n">, language: Language): string {
  return option.i18n ? option.i18n[language] : option.label;
}

export function defaultConfig(type: PresetFieldType): PresetFieldConfig {
  if (type === "slider") return { min: 0, max: 100, step: 1 };
  if (type === "number") return { step: 1 };
  return {};
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function emptyField(type: PresetFieldType = "single_select", presetId: string | null = null): PresetField {
  return { id: newId(), presetId, name: "", type, options: [], sortOrder: 0, config: defaultConfig(type), source: "user" };
}

export function emptyOption(fieldId: string, sortOrder: number, label = ""): PresetOption {
  return { id: newId(), fieldId, label, value: label, sortOrder };
}

/** A user-owned copy of a field (platform or someone else's): new ids, plain strings in `language`, option phrases kept. */
export function cloneField(field: PresetField, language: Language, presetId: string | null = null): PresetField {
  const id = newId();
  return {
    ...field,
    id,
    presetId,
    name: fieldName(field, language),
    i18n: undefined,
    source: "user",
    config: { ...field.config, template: field.config.template },
    options: field.options.map((option, index) => ({
      ...option,
      id: newId(),
      fieldId: id,
      label: optionLabel(option, language),
      i18n: undefined,
      sortOrder: index,
    })),
  };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

/** The value in the shape the field type allows, or `undefined` when it is empty/invalid (toggle: only `true` counts as set). */
export function sanitizeValue(field: PresetField, raw: unknown): PresetValue | undefined {
  switch (field.type) {
    case "single_select":
    case "dropdown": {
      const value = typeof raw === "string" ? raw : null;
      return value && field.options.some((o) => o.value === value) ? value : undefined;
    }
    case "multi_select": {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
      const valid = Array.from(new Set(list.filter((v): v is string => typeof v === "string"))).filter((v) => field.options.some((o) => o.value === v));
      return valid.length > 0 ? valid : undefined;
    }
    case "text": {
      const text = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
      return text || undefined;
    }
    case "number":
    case "slider": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return undefined;
      const { min, max } = field.config;
      return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    }
    case "toggle":
      return raw === true ? true : undefined;
    case "color":
      return typeof raw === "string" && HEX.test(raw) ? raw.toLowerCase() : undefined;
  }
}

/** Keeps only the entries whose field is in `fields` and whose value is valid for it. */
export function sanitizeSelection(selection: PresetSelection, fields: readonly PresetField[]): PresetSelection {
  const out: PresetSelection = {};
  for (const field of fields) {
    const value = sanitizeValue(field, selection[field.id]);
    if (value !== undefined) out[field.id] = value;
  }
  return out;
}

export function countSelected(selection: PresetSelection, fields: readonly PresetField[]): number {
  return Object.keys(sanitizeSelection(selection, fields)).length;
}

export function formatNumber(field: PresetField, value: number): string {
  return `${value}${field.config.unit ?? ""}`;
}

// ---------------------------------------------------------------------------
// Readable entries ("Seçtiklerin")
// ---------------------------------------------------------------------------

export interface SelectionEntry {
  fieldId: string;
  fieldName: string;
  /** Set for one chosen option of a multi-select, so just that option can be removed. */
  optionValue?: string;
  label: string;
}

export function selectionEntries(fields: readonly PresetField[], selection: PresetSelection, language: Language): SelectionEntry[] {
  const clean = sanitizeSelection(selection, fields);
  const out: SelectionEntry[] = [];
  for (const field of fields) {
    const value = clean[field.id];
    if (value === undefined) continue;
    const name = fieldName(field, language);
    if (field.type === "multi_select" && Array.isArray(value)) {
      for (const v of value) {
        const option = field.options.find((o) => o.value === v);
        if (option) out.push({ fieldId: field.id, fieldName: name, optionValue: v, label: optionLabel(option, language) });
      }
    } else if ((field.type === "single_select" || field.type === "dropdown") && typeof value === "string") {
      const option = field.options.find((o) => o.value === value);
      if (option) out.push({ fieldId: field.id, fieldName: name, label: optionLabel(option, language) });
    } else if (typeof value === "number") {
      out.push({ fieldId: field.id, fieldName: name, label: formatNumber(field, value) });
    } else if (typeof value === "boolean") {
      out.push({ fieldId: field.id, fieldName: name, label: translateForRuntime("presetField.on") });
    } else if (typeof value === "string") {
      out.push({ fieldId: field.id, fieldName: name, label: value });
    }
  }
  return out;
}

/** Removes one summary chip from the selection (one option of a multi-select, or the whole field value). */
export function removeEntry(selection: PresetSelection, entry: SelectionEntry): PresetSelection {
  const next = { ...selection };
  const current = next[entry.fieldId];
  if (entry.optionValue !== undefined && Array.isArray(current)) {
    const rest = current.filter((v) => v !== entry.optionValue);
    if (rest.length > 0) next[entry.fieldId] = rest;
    else delete next[entry.fieldId];
  } else {
    delete next[entry.fieldId];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Prompt text
// ---------------------------------------------------------------------------

function fillTemplate(template: Bilingual | undefined, language: Language, value: string): string | null {
  const text = template?.[language];
  return text ? text.replace(/\{value\}/g, value) : null;
}

/** The prompt phrase(s) one value contributes. Option phrases when the option has one, otherwise `Name: value`. */
function valuePhrases(field: PresetField, value: PresetValue, language: Language): string[] {
  const name = fieldName(field, language);
  if (typeof value === "string" && (field.type === "single_select" || field.type === "dropdown")) {
    const option = field.options.find((o) => o.value === value);
    if (!option) return [];
    return [option.fragment?.[language] ?? `${name}: ${option.value}`];
  }
  if (Array.isArray(value)) {
    const options = value.map((v) => field.options.find((o) => o.value === v)).filter((o): o is PresetOption => Boolean(o));
    if (options.length === 0) return [];
    if (options.every((o) => o.fragment)) return options.map((o) => o.fragment![language]);
    return [`${name}: ${options.map((o) => o.value).join(", ")}`];
  }
  if (typeof value === "number") {
    return [fillTemplate(field.config.template, language, String(value)) ?? `${name}: ${formatNumber(field, value)}`];
  }
  if (typeof value === "boolean") {
    return [fillTemplate(field.config.template, language, "") ?? name];
  }
  if (field.type === "color") {
    return [fillTemplate(field.config.template, language, value) ?? `${name}: ${value}`];
  }
  return [`${name}: ${value}`];
}

/**
 * ORIGINAL prompt + the phrases of the selected values (field order). The
 * original is never modified: with no selection it is returned untouched.
 * Tool parameters (`suffix` fields) go after the sentence.
 */
export function composePrompt(original: string, selection: PresetSelection, fields: readonly PresetField[], language: Language = "en"): string {
  const clean = sanitizeSelection(selection, fields);
  const phrases: string[] = [];
  const suffixes: string[] = [];
  for (const field of fields) {
    const value = clean[field.id];
    if (value === undefined) continue;
    (field.kind === "suffix" ? suffixes : phrases).push(...valuePhrases(field, value, language));
  }
  if (phrases.length === 0 && suffixes.length === 0) return original;
  const base = original.trim().replace(/[.\s]+$/, "");
  const sentence = [base, ...phrases].filter(Boolean).join(", ");
  const withStop = sentence ? `${sentence}.` : "";
  return [withStop, ...suffixes].filter(Boolean).join(" ");
}

/** Tooltip text for an option chip: the phrase it adds to the prompt. */
export function optionPhrase(field: PresetField, option: PresetOption, language: Language): string {
  return option.fragment?.[language] ?? `${fieldName(field, language)}: ${option.value}`;
}

/** Adds `incoming` fields that are not already in `current` (by id), keeping `current` order. */
export function mergeFields(current: readonly PresetField[], incoming: readonly PresetField[]): PresetField[] {
  const seen = new Set(current.map((f) => f.id));
  return [...current, ...incoming.filter((f) => !seen.has(f.id))];
}

/** Options a user typed for a field on the current creation screen only (`{ [fieldId]: options }`). */
export type CustomOptions = Record<string, PresetOption[]>;

/** `fields` with the temporary options appended to their option lists (fields without any are returned as is). */
export function withCustomOptions(fields: readonly PresetField[], custom: CustomOptions): PresetField[] {
  return fields.map((field) => {
    const extra = custom[field.id];
    if (!extra || extra.length === 0 || !isOptionField(field.type)) return field;
    const known = new Set(field.options.map((o) => o.value));
    return { ...field, options: [...field.options, ...extra.filter((o) => !known.has(o.value))] };
  });
}

/**
 * The option a typed text stands for: an existing option when the text matches
 * one (case-insensitive, either language), otherwise a new temporary option
 * whose value is the text. `null` for blank text.
 */
export function resolveTypedOption(field: PresetField, text: string): { option: PresetOption; isNew: boolean } | null {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!clean) return null;
  const key = clean.toLowerCase();
  const existing = field.options.find((o) => [o.value, o.label, o.i18n?.en, o.i18n?.tr].some((s) => s && s.toLowerCase() === key));
  if (existing) return { option: existing, isNew: false };
  return { option: { id: newId(), fieldId: field.id, label: clean, value: clean, sortOrder: field.options.length }, isNew: true };
}

/** Moves `index` by `delta` in `items`, re-numbering `sortOrder`. */
export function moveItem<T extends { sortOrder: number }>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => ({ ...item, sortOrder: i }));
}
