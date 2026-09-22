/**
 * The Generator's JSON Output Engine — reads the creator's schema (each
 * field's own `jsonPath`) and the RUNTIME USER's own free-typed prompt/
 * negative-prompt text, and produces the generator's real, structured JSON
 * output.
 *
 *   USER INPUT (fields) → RUNTIME STATE → [JSON OUTPUT ENGINE: jsonPath → value]  (this file)
 *   USER INPUT (prompt/negative prompt, typed directly by whoever RUNS the generator)
 *     → composed with the fields' own human-readable descriptions → JSON.prompt / JSON.negative_prompt
 *
 * Nothing here hard-codes a top-level key like `subject`/`environment`/
 * `style_preset` — those are only the spec's own illustrative examples. A
 * generator's real output shape (outside of the reserved `prompt`/
 * `negative_prompt` keys) is entirely derived, at build time, from whatever
 * `jsonPath` each of the creator's own fields declares.
 *
 * NOTE — this file previously composed with `generator-template.ts`'s
 * `{{variable}}` Prompt Template Engine to compute `prompt`/`negative_prompt`
 * from a creator-authored template. That step was removed (Bölüm 9.29): the
 * person who BUILDS a generator no longer authors a prompt template at
 * all — the person who USES it types the actual prompt text directly, at
 * the top of the runtime form. `generator-template.ts`'s field-schema
 * helpers (`isFieldVisible`, `GeneratorValidationIssue`, etc.) are unrelated
 * to that removed step and are still used here unchanged.
 *
 * UPDATE (Bölüm 9.32) — the runtime user's typed prompt is no longer the
 * WHOLE `prompt` value: a user reported that their field selections (e.g. a
 * video generator's duration/aspect-ratio/camera-movement choices) appeared
 * in the structured JSON but never in the readable Prompt text — they had
 * to type everything themselves twice. `composeFinalPromptText` below now
 * appends a real, human-readable description of every visible, filled-in
 * field (using the field's own `label` and, for select-family fields, the
 * chosen option's `label` — never a raw machine `value`/`jsonPath`
 * segment) after the user's own typed sentence. This is generic across ANY
 * creator-defined schema (it walks `schema.fields`, not a hard-coded shape)
 * and is NOT the old `{{variable}}` template engine — there is no
 * creator-authored template text here, only a fixed, generic
 * "{label}: {value}" join rule applied to whatever fields the creator
 * happened to define.
 */

import { isFieldVisible, type GeneratorValidationIssue } from "./generator-template";
import type { GeneratorField, GeneratorOutput, GeneratorSchema, GeneratorValues } from "@/types";

const PATH_SEGMENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Splits a dot-notation JSON path into its real segments, trimming stray whitespace/empty segments ("subject. .eye_color" → ["subject", "eye_color"]). */
export function parseJsonPath(path: string): string[] {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** A JSON path is only valid when every one of its segments is a real identifier (letters/digits/underscore, not starting with a digit) — same character rules this app's `{{key}}` template variables already use. */
export function isValidJsonPath(path: string): boolean {
  const segments = parseJsonPath(path);
  return segments.length > 0 && segments.every((segment) => PATH_SEGMENT_PATTERN.test(segment));
}

/**
 * Writes `value` into `root` at the nested location `segments` describes,
 * creating intermediate objects as needed. When an intermediate segment
 * already holds something that isn't a plain object (a previous field's
 * scalar/array value, or nothing), it's overwritten with a fresh object —
 * a deliberate, documented "last write wins" resolution for a path
 * collision the creator's own schema caused (§22's genericness requirement
 * means this engine can't know which of two colliding fields "should" win;
 * `validateGeneratorOutputMapping` below surfaces the collision as a real,
 * visible warning in the builder so the creator can fix it themselves).
 */
export function assignAtPath(root: GeneratorOutput, segments: string[], value: unknown): void {
  if (segments.length === 0) return;
  let cursor: GeneratorOutput = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const existing = cursor[key];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as GeneratorOutput;
  }
  cursor[segments[segments.length - 1]] = value;
}

/**
 * A field's raw runtime value, coerced to the real JSON type its output
 * should carry — numbers as numbers, checkbox/toggle as real booleans,
 * multi_select as a real string array, everything else as a trimmed
 * string. Returns `undefined` when there's genuinely nothing to write
 * (an empty text field, an empty multi_select) so `buildGeneratorOutput`
 * can skip it — an untouched optional field never clutters the output
 * with an empty string/empty array.
 */
function coerceFieldValue(field: GeneratorField, raw: string | string[] | undefined): unknown {
  switch (field.type) {
    case "multi_select": {
      const list = Array.isArray(raw) ? raw.filter((item) => item.trim().length > 0) : [];
      return list.length > 0 ? list : undefined;
    }
    case "checkbox":
    case "toggle": {
      const value = Array.isArray(raw) ? "" : (raw ?? "");
      return value === "true";
    }
    case "number":
    case "slider": {
      const value = (Array.isArray(raw) ? "" : (raw ?? "")).trim();
      if (!value) return undefined;
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    }
    default: {
      const value = (Array.isArray(raw) ? "" : (raw ?? "")).trim();
      return value.length > 0 ? value : undefined;
    }
  }
}

/**
 * One visible, filled-in field's real runtime value, turned into a short,
 * human-readable fragment — the option's own `label` for select-family
 * fields (never its raw `value`), the field's own `label` alone for a
 * true checkbox/toggle (a false one contributes nothing — there's no
 * natural-language way to describe "not selected" generically), and
 * `"{label}: {value}"` for every other filled-in type. Returns `null` when
 * the field has nothing to contribute (hidden by its condition, or
 * genuinely empty) so callers can filter losslessly.
 */
function describeFieldValue(field: GeneratorField, values: GeneratorValues): string | null {
  if (!isFieldVisible(field, values)) return null;
  const raw = values[field.key];
  const label = field.label?.trim() || field.key;

  switch (field.type) {
    case "select":
    case "radio": {
      const value = Array.isArray(raw) ? "" : (raw ?? "").trim();
      if (!value) return null;
      const optionLabel = field.options.find((o) => o.value === value)?.label ?? value;
      return `${label}: ${optionLabel}`;
    }
    case "multi_select": {
      const list = Array.isArray(raw) ? raw.filter((v) => v.trim().length > 0) : [];
      if (list.length === 0) return null;
      const optionLabels = list.map((value) => field.options.find((o) => o.value === value)?.label ?? value);
      return `${label}: ${optionLabels.join(", ")}`;
    }
    case "checkbox":
    case "toggle": {
      const value = Array.isArray(raw) ? "" : (raw ?? "");
      return value === "true" ? label : null;
    }
    default: {
      const value = (Array.isArray(raw) ? "" : (raw ?? "")).trim();
      return value.length > 0 ? `${label}: ${value}` : null;
    }
  }
}

/**
 * Combines the runtime user's own typed prompt sentence with a generic,
 * readable description of every other filled-in field (§ Bölüm 9.32) — the
 * "JSON'un prompta çevrilmiş hali" the user asked for. Fields are read in
 * schema order; the user's own sentence always comes first (so it reads as
 * the main subject, with the selections as trailing descriptors) and is
 * never discarded or rewritten, only extended.
 */
export function composeFinalPromptText(schema: GeneratorSchema, values: GeneratorValues, promptText: string): string {
  const typed = promptText.trim();
  const fieldFragments = [...schema.fields]
    .sort((a, b) => a.order - b.order)
    .map((field) => describeFieldValue(field, values))
    .filter((fragment): fragment is string => fragment !== null);

  if (fieldFragments.length === 0) return typed;
  if (!typed) return fieldFragments.join(", ");
  return `${typed}, ${fieldFragments.join(", ")}`;
}

/**
 * The real Central Output Engine — reads the schema, walks every visible
 * field's real runtime value, places it at that field's own `jsonPath`
 * (nested objects/arrays auto-constructed, §5/§6), then writes the real,
 * composed prompt (`composeFinalPromptText` — the user's own typed sentence
 * plus a readable description of every other selected field, Bölüm 9.32)
 * and the runtime user's own directly-typed `negativePromptText` in last,
 * under the two reserved keys — so these always win over any field whose
 * own `jsonPath` happened to collide with `prompt`/`negative_prompt`
 * (surfaced as a warning by `validateGeneratorOutputMapping`, never
 * silently swallowed).
 */
export function buildGeneratorOutput(
  schema: GeneratorSchema,
  values: GeneratorValues,
  promptText: string,
  negativePromptText: string,
  enableNegativePrompt: boolean,
): GeneratorOutput {
  const output: GeneratorOutput = {};

  for (const field of schema.fields) {
    if (!isFieldVisible(field, values)) continue;
    const coerced = coerceFieldValue(field, values[field.key]);
    if (coerced === undefined) continue;
    const path = field.jsonPath?.trim() || field.key;
    if (!path) continue;
    assignAtPath(output, parseJsonPath(path), coerced);
  }

  output.prompt = composeFinalPromptText(schema, values, promptText);

  if (enableNegativePrompt) {
    output.negative_prompt = negativePromptText.trim();
  }

  return output;
}

/** A single field's own contribution to the output, in isolation — the field editor's live "Output Preview" mini-JSON (§10), using the field's real default (or a representative placeholder when it has none) so the preview is never empty. */
export function previewValueForField(field: GeneratorField): unknown {
  switch (field.type) {
    case "multi_select": {
      const def = Array.isArray(field.defaultValue) ? field.defaultValue : [];
      if (def.length > 0) return def;
      return field.options.length > 0 ? [field.options[0].value] : [];
    }
    case "checkbox":
    case "toggle": {
      const def = Array.isArray(field.defaultValue) ? "" : field.defaultValue;
      return def === "true";
    }
    case "number":
    case "slider": {
      const def = Array.isArray(field.defaultValue) ? "" : field.defaultValue;
      if (def.trim()) return Number(def);
      return field.min ?? 0;
    }
    default: {
      const def = Array.isArray(field.defaultValue) ? "" : field.defaultValue;
      if (def.trim()) return def;
      if ((field.type === "select" || field.type === "radio") && field.options.length > 0) return field.options[0].value;
      return "değer";
    }
  }
}

/** Builds a one-field-only preview object at that field's own `jsonPath` — used by the field editor's live Output Preview panel. */
export function buildFieldOutputPreview(field: GeneratorField): GeneratorOutput {
  const output: GeneratorOutput = {};
  const path = field.jsonPath?.trim() || field.key || "alan";
  assignAtPath(output, parseJsonPath(path), previewValueForField(field));
  return output;
}

/** Every distinct top-level segment already used by any field's `jsonPath` in this schema — the field editor's "Çıktı Grubu" (Output Group) suggestion list (§12). */
export function collectJsonPathGroups(fields: GeneratorField[]): string[] {
  const groups = new Set<string>();
  for (const field of fields) {
    const segments = parseJsonPath(field.jsonPath?.trim() || field.key);
    if (segments.length > 0) groups.add(segments[0]);
  }
  return Array.from(groups).sort();
}

/** Every distinct real `jsonPath` already used by any field in this schema — the field editor's autocomplete suggestion list (§11, "subject." → subject.type, subject.gender, …"). */
export function collectUsedJsonPaths(fields: GeneratorField[]): string[] {
  const paths = new Set<string>();
  for (const field of fields) {
    const path = field.jsonPath?.trim() || field.key;
    if (path) paths.add(path);
  }
  return Array.from(paths).sort();
}

const RESERVED_TOP_LEVEL_KEYS = new Set(["prompt", "negative_prompt"]);

/**
 * The Output Mapping half of publish validation (kept as a separate
 * function from `generator-template.ts`'s `validateGeneratorForPublish` —
 * and in this separate file — so the two engines stay genuinely
 * independent modules that `generator-builder.tsx` merges together, rather
 * than one file depending on the other's internals). Every issue here is
 * about WHERE a field's value lands in the output JSON: an empty/invalid
 * path is an error (would silently break the whole output); a path
 * colliding with another field, or with the reserved `prompt`/
 * `negative_prompt` keys, is a warning (still publishable, but the creator
 * should know one of them will be overwritten).
 */
export function validateGeneratorOutputMapping(schema: GeneratorSchema): GeneratorValidationIssue[] {
  const issues: GeneratorValidationIssue[] = [];
  const pathOwners = new Map<string, string[]>();

  for (const field of schema.fields) {
    const rawPath = field.jsonPath?.trim() || field.key;
    const label = field.label || field.key || "(adsız alan)";
    if (!rawPath) {
      issues.push({ level: "error", message: `"${label}" alanının çıktı JSON yolu boş olamaz.`, fieldId: field.id });
      continue;
    }
    if (!isValidJsonPath(rawPath)) {
      issues.push({
        level: "error",
        message: `"${label}" alanının JSON yolu geçersiz — yalnızca harf, rakam, alt çizgi ve nokta kullanabilirsin (örn. subject.eye_color).`,
        fieldId: field.id,
      });
      continue;
    }

    const segments = parseJsonPath(rawPath);
    if (RESERVED_TOP_LEVEL_KEYS.has(segments[0])) {
      issues.push({
        level: "warning",
        message: `"${label}" alanının JSON yolu ayrılmış "${segments[0]}" anahtarıyla başlıyor — bu değer, oluşturulan prompt metniyle değiştirilecek.`,
        fieldId: field.id,
      });
    }

    const owners = pathOwners.get(rawPath) ?? [];
    owners.push(label);
    pathOwners.set(rawPath, owners);
  }

  for (const [path, owners] of pathOwners) {
    if (owners.length > 1) {
      issues.push({
        level: "warning",
        message: `${owners.map((owner) => `"${owner}"`).join(", ")} alanları aynı JSON yoluna (${path}) yazıyor — yalnızca sonuncusu çıktıda görünecek.`,
      });
    }
  }

  return issues;
}
