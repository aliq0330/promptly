/**
 * Pure, framework-free helpers for the Generator Builder + Generator
 * Runtime module's `{{variable}}` template engine and publish validation —
 * kept dependency-free and DOM-free so the core logic can be unit-tested
 * directly (no browser needed), the same pattern already used by
 * `prompt-variables.ts`/`tag-catalog-matcher.ts` in this codebase.
 */

import type {
  GeneratorField,
  GeneratorFieldCondition,
  GeneratorSchema,
  GeneratorTemplate,
  GeneratorTemplateSection,
  GeneratorValues,
} from "@/types";

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Every distinct `{{key}}` token referenced anywhere across a template's sections, in first-appearance order. */
export function extractTemplateVariables(template: GeneratorTemplate): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const section of template.sections) {
    for (const key of extractVariablesFromText(section.content)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
}

/** Every distinct `{{key}}` token in one piece of raw text — the single-section building block `extractTemplateVariables` uses, also used directly by the template editor's own per-section "unknown variable" warning. */
export function extractVariablesFromText(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

/**
 * Joins a real multi-select value list into readable prose — "A", "A and
 * B", "A, B and C" (§33's "moonlight, rim lighting, soft fill lighting and
 * volumetric lighting" example). Empty list resolves to an empty string,
 * never "undefined"/"null".
 */
export function joinList(items: string[]): string {
  const clean = items.filter((item) => item.trim().length > 0);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

function stringifyValue(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return joinList(value);
  return value;
}

/** True when `field`'s one optional visibility condition is satisfied by the current runtime `values` — a field with no condition is always considered visible. */
export function isFieldVisible(field: GeneratorField, values: GeneratorValues): boolean {
  const condition = field.condition;
  if (!condition) return true;
  const actual = values[condition.fieldKey];
  if (Array.isArray(actual)) return actual.includes(condition.equals);
  return actual === condition.equals;
}

/**
 * Deterministically renders a single template section's `{{key}}` tokens
 * against real field values — an UNKNOWN token (no matching field, or a
 * field hidden by its own condition, or simply missing from `values`) is
 * left as literal `{{key}}` text rather than silently vanishing/turning
 * into "undefined" (same non-negotiable rule `resolvePromptText` already
 * follows for the `{name}` prompt-variable system — a generator that
 * references a deleted/renamed field must stay visibly wrong, never
 * silently wrong).
 */
export function renderTemplateSection(content: string, values: GeneratorValues, fields: GeneratorField[]): string {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  return content.replace(TOKEN_PATTERN, (match, key: string) => {
    const field = fieldsByKey.get(key);
    if (!field || !isFieldVisible(field, values)) return match;
    const raw = stringifyValue(values[key]);
    return raw.trim().length > 0 ? raw : match;
  });
}

/**
 * Renders every ENABLED section of a real template against real runtime
 * values, joining them with blank lines — the actual "Generated Prompt"
 * (§16/§17/§22) a generator produces. `renderTemplate(template, values)`
 * matches the exact shape §32 asked for.
 */
export function renderTemplate(template: GeneratorTemplate, values: GeneratorValues, schema: GeneratorSchema): string {
  return template.sections
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order)
    .map((section) => renderTemplateSection(section.content, values, schema.fields))
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/** A real field's default value, resolved to the type renderTemplate expects (never `undefined`). */
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
 * don't. Runs the exact same checks the spec lists: title/description
 * present, at least one field, unique field keys, every `{{token}}` the
 * template references resolves to a real field, select-family fields have
 * at least one option, required fields with no default are flagged as an
 * informational warning (not an error — a required field with no default
 * just means the USER filling the form must choose, which is valid).
 */
export function validateGeneratorForPublish(
  title: string,
  description: string,
  schema: GeneratorSchema,
  template: GeneratorTemplate,
): GeneratorValidationIssue[] {
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

  const knownKeys = new Set(schema.fields.map((field) => field.key));
  const referenced = extractTemplateVariables(template);
  for (const key of referenced) {
    if (!knownKeys.has(key)) {
      issues.push({ level: "error", message: `Şablonda {{${key}}} kullanılıyor ancak bu alan bulunamadı.` });
    }
  }

  const enabledSections = template.sections.filter((section) => section.enabled);
  if (enabledSections.length === 0 || enabledSections.every((section) => section.content.trim().length === 0)) {
    issues.push({ level: "error", message: "Prompt template boş olamaz — en az bir aktif bölüm dolu olmalı." });
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
    return source.options.includes(condition.equals);
  }
  return true;
}

/** One category's real, live field count — used by the sidebar and the "8 fields in this category" delete warning (§7). */
export function fieldsInCategory(schema: GeneratorSchema, categoryId: string): GeneratorField[] {
  return schema.fields.filter((field) => field.categoryId === categoryId).sort((a, b) => a.order - b.order);
}

/**
 * A section counts as the "Negative Prompt" half (§30) purely by its own
 * title text (case-insensitive "negative"/"negatif") — `GeneratorTemplate`
 * deliberately has no separate boolean field for this, so a generator with
 * negative-prompt support enabled is just an ordinary section the author
 * named "Negative Prompt"; nothing else in the schema treats it specially
 * except where the two halves need to be rendered/copied separately.
 */
export function isNegativeSection(section: GeneratorTemplateSection): boolean {
  const title = section.title.toLowerCase();
  return title.includes("negative") || title.includes("negatif");
}

/** How many times `{{key}}` literally appears across every template section — the field-list's "bu alan şablonda N yerde kullanılıyor" delete warning (§7's field-usage-count idea, applied to the generator's own `{{key}}` syntax). */
export function countKeyUsageInTemplate(template: GeneratorTemplate, key: string): number {
  if (!key) return 0;
  const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
  return template.sections.reduce((total, section) => total + (section.content.match(pattern) ?? []).length, 0);
}
