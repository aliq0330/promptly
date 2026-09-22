/**
 * The Generator's JSON Output Engine — a second, separate pure layer from
 * `generator-template.ts`'s `{{variable}}` Prompt Template Engine (per the
 * architecture correction: "İki ayrı engine" — never merged into one file,
 * never deleted the template engine).
 *
 *   USER INPUT → RUNTIME STATE
 *     → [JSON OUTPUT ENGINE: jsonPath → value]  (this file)
 *     → STRUCTURED JSON
 *     → [PROMPT TEMPLATE ENGINE: {{variables}}]  (generator-template.ts)
 *     → JSON.prompt / JSON.negative_prompt
 *
 * Nothing here hard-codes a top-level key like `subject`/`environment`/
 * `style_preset` — those are only the spec's own illustrative examples. A
 * generator's real output shape is entirely derived, at build time, from
 * whatever `jsonPath` each of the creator's own fields declares.
 */

import { isFieldVisible, isNegativeSection, renderTemplate, type GeneratorValidationIssue } from "./generator-template";
import type { GeneratorField, GeneratorOutput, GeneratorSchema, GeneratorTemplate, GeneratorValues } from "@/types";

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
 * The real Central Output Engine — reads the schema, walks every visible
 * field's real runtime value, places it at that field's own `jsonPath`
 * (nested objects/arrays auto-constructed, §5/§6), then hands the SAME
 * schema/template/values to the separate Prompt Template Engine
 * (`renderTemplate`) to compute `prompt` (and `negative_prompt`, when
 * enabled) and writes those two reserved keys in last — so the generated
 * prompt text always wins over any field whose own `jsonPath` happened to
 * collide with `prompt`/`negative_prompt` (surfaced as a warning by
 * `validateGeneratorOutputMapping`, never silently swallowed).
 */
export function buildGeneratorOutput(
  schema: GeneratorSchema,
  template: GeneratorTemplate,
  values: GeneratorValues,
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

  const positiveTemplate: GeneratorTemplate = { sections: template.sections.filter((section) => !isNegativeSection(section)) };
  output.prompt = renderTemplate(positiveTemplate, values, schema);

  if (enableNegativePrompt) {
    const negativeTemplate: GeneratorTemplate = { sections: template.sections.filter((section) => isNegativeSection(section)) };
    output.negative_prompt = renderTemplate(negativeTemplate, values, schema);
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
