/**
 * Pure, framework-free helpers for the Generator Builder + Generator
 * Runtime module's field schema (visibility conditions, default values,
 * publish validation) — kept dependency-free and DOM-free so the core
 * logic can be unit-tested directly (no browser needed), the same pattern
 * already used by `prompt-variables.ts`/`tag-catalog-matcher.ts` in this
 * codebase.
 *
 * NOTE — this file previously also held a `{{variable}}` prompt template
 * rendering engine (`renderTemplate`/`renderTemplateSection`/
 * `isNegativeSection`/`extractTemplateVariables`/`extractVariablesFromText`/
 * `countKeyUsageInTemplate`, plus the `TemplateEditor` builder step that
 * authored it). That step was removed: the person who BUILDS a generator no
 * longer authors a prompt template at all — the person who USES it types
 * the actual `prompt`/`negative_prompt` text directly, at the top of the
 * runtime form (`generator-playground.tsx`), and that text is written into
 * the JSON output as-is (`generator-output.ts`'s `buildGeneratorOutput`).
 */

import type { GeneratorField, GeneratorFieldCondition, GeneratorSchema, GeneratorValues } from "@/types";

/** True when `field`'s one optional visibility condition is satisfied by the current runtime `values` — a field with no condition is always considered visible. */
export function isFieldVisible(field: GeneratorField, values: GeneratorValues): boolean {
  const condition = field.condition;
  if (!condition) return true;
  const actual = values[condition.fieldKey];
  if (Array.isArray(actual)) return actual.includes(condition.equals);
  return actual === condition.equals;
}

/** A real field's default value, resolved to the type the runtime form expects (never `undefined`). */
export function defaultValuesFromSchema(schema: GeneratorSchema): GeneratorValues {
  const values: GeneratorValues = {};
  for (const field of schema.fields) {
    values[field.key] = field.type === "multi_select" ? (Array.isArray(field.defaultValue) ? field.defaultValue : []) : Array.isArray(field.defaultValue) ? "" : field.defaultValue;
  }
  return values;
}

export interface GeneratorValidationIssue {
  level: "error" | "warning";
  message: string;
  fieldId?: string;
}

/**
 * The real publish validation engine (§28) — errors block publish, warnings
 * don't. Runs the checks the spec lists that still apply now that the
 * creator no longer authors a `{{token}}` prompt template at all (that
 * responsibility moved to whoever RUNS the generator, who types the actual
 * prompt/negative-prompt text directly at runtime — see
 * `generator-playground.tsx`): title/description present, at least one
 * field, unique field keys, select-family fields have at least one option,
 * required fields with no default are flagged as an informational warning
 * (not an error — a required field with no default just means the USER
 * filling the form must choose, which is valid). There is no longer any
 * template-content check here — a generator with zero schema fields is
 * still blocked (above), but an "empty template" is no longer a concept
 * this function knows about.
 */
export function validateGeneratorForPublish(title: string, description: string, schema: GeneratorSchema): GeneratorValidationIssue[] {
  const issues: GeneratorValidationIssue[] = [];

  if (title.trim().length === 0) {
    issues.push({ level: "error", message: "Generator başlığı boş olamaz." });
  }
  if (description.trim().length === 0) {
    issues.push({ level: "error", message: "Kısa açıklama boş olamaz." });
  }
  if (schema.fields.length === 0) {
    issues.push({ level: "error", message: "En az bir alan eklemelisin." });
  }

  const seenKeys = new Set<string>();
  for (const field of schema.fields) {
    if (seenKeys.has(field.key)) {
      issues.push({ level: "error", message: `"${field.label}" alanının değişken adı (${field.key}) başka bir alanla aynı.`, fieldId: field.id });
    }
    seenKeys.add(field.key);

    if (field.label.trim().length === 0) {
      issues.push({ level: "error", message: "Bir alanın adı boş bırakılamaz.", fieldId: field.id });
    }

    if (["select", "multi_select", "radio"].includes(field.type) && field.options.length === 0) {
      issues.push({ level: "error", message: `"${field.label}" için en az bir seçenek eklemelisin.`, fieldId: field.id });
    }

    const hasDefault = Array.isArray(field.defaultValue) ? field.defaultValue.length > 0 : field.defaultValue.trim().length > 0;
    if (field.required && !hasDefault) {
      issues.push({ level: "warning", message: `"${field.label}" zorunlu ama varsayılan değeri yok.`, fieldId: field.id });
    }
  }

  return issues;
}

/** Converts a free-typed title into a URL-safe slug base — ASCII, lowercase, single hyphens (same transliteration rules as `normalizeTagLabel`, applied to a whole title instead of a single tag). */
export function slugifyGeneratorTitle(title: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i" };
  return title
    .trim()
    .toLowerCase()
    .replace(/[çğıöşüİ]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generator";
}

/** Builds a fresh, valid `GeneratorField` with sensible defaults for a given key/label — used by the Add Field modal so every new field starts internally consistent. */
export function makeFieldKeyFromLabel(label: string, existingKeys: string[]): string {
  const base = slugifyGeneratorTitle(label).replace(/-/g, "_") || "field";
  if (!existingKeys.includes(base)) return base;
  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function isConditionSatisfiable(condition: GeneratorFieldCondition, fields: GeneratorField[]): boolean {
  const source = fields.find((field) => field.key === condition.fieldKey);
  if (!source) return false;
  if (source.type === "select" || source.type === "radio" || source.type === "multi_select") {
    return source.options.some((option) => option.value === condition.equals);
  }
  return true;
}
