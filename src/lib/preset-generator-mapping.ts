import { emptyField, emptyOption, fieldName, optionLabel, sanitizeValue, type PresetField, type PresetFieldType, type PresetSelection, type PresetValue } from "@/lib/preset-fields";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import type { GeneratorField, GeneratorSchema, GeneratorValues } from "@/types";

/**
 * A preset's parameters are STRUCTURED values (`{ fieldId: value }` against
 * its fields, `src/lib/preset-fields.ts`); a Generator's inputs are free,
 * creator-defined fields. There is no shared id between the two, so the
 * bridge is a BEST-EFFORT match on the human label (case/Turkish-insensitive,
 * both languages): a preset field "Işık / Lighting" fills a generator field
 * labelled "Işık"/"Lighting", and the chosen option(s) are matched against
 * that field's own options by label or value. Anything that doesn't match is
 * simply left untouched — applying a preset never overwrites a field it
 * can't confidently understand, and never invents a field.
 */

const norm = (value: string) => normalizeTagLabel(value);

function nameMatches(field: PresetField, generatorField: GeneratorField): boolean {
  const label = norm(generatorField.label);
  const key = norm(generatorField.key);
  return [field.i18n?.tr, field.i18n?.en, field.name].filter((n): n is string => Boolean(n)).some((name) => {
    const n = norm(name);
    return n === label || n === key;
  });
}

function generatorFieldFor(schema: GeneratorSchema, field: PresetField): GeneratorField | undefined {
  return schema.fields.find((g) => nameMatches(field, g));
}

function matchOption(generatorField: GeneratorField, names: string[]): string | null {
  const wanted = names.map(norm);
  const match = generatorField.options.find((o) => wanted.includes(norm(o.label)) || wanted.includes(norm(o.value)));
  return match ? match.value : null;
}

/** Fills the generator's values from a preset's structured selection. Returns the new values and how many parameters actually landed on a field. */
export function applyPresetToGeneratorValues(
  schema: GeneratorSchema,
  values: GeneratorValues,
  preset: { fields: PresetField[]; selection: PresetSelection },
): { values: GeneratorValues; applied: number } {
  const next: GeneratorValues = { ...values };
  let applied = 0;
  for (const field of preset.fields) {
    const value = sanitizeValue(field, preset.selection[field.id]);
    if (value === undefined) continue;
    const target = generatorFieldFor(schema, field);
    if (!target) continue;

    if (field.type === "single_select" || field.type === "dropdown" || field.type === "multi_select") {
      const chosen = (Array.isArray(value) ? value : [value as string])
        .map((v) => field.options.find((o) => o.value === v))
        .filter((o): o is NonNullable<typeof o> => Boolean(o));
      if (target.type === "text" || target.type === "textarea") {
        next[target.key] = chosen.map((o) => optionLabel(o, "tr")).join(", ");
        applied += 1;
      } else if (target.type === "select" || target.type === "radio" || target.type === "multi_select") {
        const matched = chosen.map((o) => matchOption(target, [o.label, o.i18n?.tr ?? "", o.i18n?.en ?? "", o.value])).filter((v): v is string => v !== null);
        if (matched.length === 0) continue;
        next[target.key] = target.type === "multi_select" ? matched : matched[0];
        applied += 1;
      }
    } else if (field.type === "text") {
      if (target.type === "text" || target.type === "textarea" || target.type === "url") {
        next[target.key] = value as string;
        applied += 1;
      }
    } else if (field.type === "number" || field.type === "slider") {
      if (target.type === "number" || target.type === "slider") {
        let n = value as number;
        if (target.min !== null) n = Math.max(target.min, n);
        if (target.max !== null) n = Math.min(target.max, n);
        next[target.key] = String(n);
        applied += 1;
      }
    } else if (field.type === "toggle") {
      if (target.type === "toggle" || target.type === "checkbox") {
        next[target.key] = "true";
        applied += 1;
      }
    } else if (field.type === "color") {
      if (target.type === "color") {
        next[target.key] = value as string;
        applied += 1;
      }
    }
  }
  return { values: next, applied };
}

function presetTypeFor(field: GeneratorField): PresetFieldType | null {
  switch (field.type) {
    case "select":
    case "radio":
      return "single_select";
    case "multi_select":
      return "multi_select";
    case "text":
    case "textarea":
    case "url":
      return "text";
    case "number":
      return "number";
    case "slider":
      return "slider";
    case "toggle":
    case "checkbox":
      return "toggle";
    case "color":
      return "color";
  }
}

/**
 * The reverse: the user's current generator values as a preset — every filled
 * field becomes one of the preset's OWN fields (name, type, the generator
 * field's options) with its value as the default, so saving loses nothing the
 * generator knew. Empty fields are skipped.
 */
export function generatorValuesToPreset(schema: GeneratorSchema, values: GeneratorValues): { fields: PresetField[]; selection: PresetSelection } {
  const fields: PresetField[] = [];
  const selection: PresetSelection = {};
  for (const generatorField of [...schema.fields].sort((a, b) => a.order - b.order)) {
    const type = presetTypeFor(generatorField);
    const raw = values[generatorField.key];
    if (!type || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    const field: PresetField = {
      ...emptyField(type),
      name: generatorField.label,
      sortOrder: fields.length,
      options: generatorField.options.map((o, index) => ({ ...emptyOption("", index, o.label), value: o.value })),
    };
    field.options = field.options.map((o) => ({ ...o, fieldId: field.id }));
    if (type === "slider") field.config = { min: generatorField.min ?? 0, max: generatorField.max ?? 100, step: generatorField.step ?? 1 };
    if (type === "number") field.config = { min: generatorField.min ?? undefined, max: generatorField.max ?? undefined, step: generatorField.step ?? 1 };
    let value: PresetValue | undefined;
    if (type === "single_select") value = Array.isArray(raw) ? raw[0] : raw;
    else if (type === "multi_select") value = Array.isArray(raw) ? raw : [raw];
    else if (type === "text" || type === "color") value = Array.isArray(raw) ? raw[0] : raw;
    else if (type === "number" || type === "slider") value = Number(Array.isArray(raw) ? raw[0] : raw);
    else if (type === "toggle") value = (Array.isArray(raw) ? raw[0] : raw) === "true" ? true : undefined;
    const clean = sanitizeValue(field, value);
    if (clean === undefined) continue;
    fields.push(field);
    selection[field.id] = clean;
  }
  return { fields, selection };
}

/** Display name used when listing which of a preset's fields a generator could not take. */
export function unmatchedFieldNames(schema: GeneratorSchema, preset: { fields: PresetField[]; selection: PresetSelection }, language: "tr" | "en"): string[] {
  return preset.fields.filter((f) => preset.selection[f.id] !== undefined && !generatorFieldFor(schema, f)).map((f) => fieldName(f, language));
}
