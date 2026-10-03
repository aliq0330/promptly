import { getCatalogField } from "@/lib/prompt-extra-settings";
import { fieldName, formatNumber, newId, optionLabel, selectionEntries, type PresetField, type PresetSelection, type PresetValue } from "@/lib/preset-fields";
import type { Language } from "@/lib/i18n/translations";

export interface PresetParameterEntry {
  fieldId: string;
  fieldLabel: string;
  /** The chosen value(s) ("Soft light, Rim light"); when none is set, the field's options (so a preset made of option lists still reads as content). */
  valueLabel: string;
  /** `true` when `valueLabel` is a chosen default rather than the offered options. */
  hasValue: boolean;
}

/**
 * Every field a preset's selection refers to: its own fields first, then any
 * key the platform catalog knows (a preset built from catalog fields, or one
 * saved before custom fields existed, carries only `{ fieldId: value }`).
 * Keys neither side knows are dropped — a preset written against an older
 * catalog must never crash or print raw ids.
 */
export function resolvePresetFields(preset: { fields: PresetField[]; selection: PresetSelection }): PresetField[] {
  const out = [...preset.fields];
  const seen = new Set(out.map((f) => f.id));
  for (const key of Object.keys(preset.selection)) {
    if (seen.has(key)) continue;
    const field = getCatalogField(key);
    if (field) {
      out.push(field);
      seen.add(key);
    }
  }
  return out;
}

/** A preset's parameters as readable rows (`Işık: Yumuşak`), one per field, in field order. */
export function presetParameterEntries(preset: { fields: PresetField[]; selection: PresetSelection }, language: Language): PresetParameterEntry[] {
  const fields = resolvePresetFields(preset);
  const chosen = new Map<string, string[]>();
  for (const entry of selectionEntries(fields, preset.selection, language)) {
    if (!chosen.has(entry.fieldId)) chosen.set(entry.fieldId, []);
    chosen.get(entry.fieldId)!.push(entry.label);
  }
  const rows: PresetParameterEntry[] = [];
  for (const field of fields) {
    const values = chosen.get(field.id);
    if (values) {
      rows.push({ fieldId: field.id, fieldLabel: fieldName(field, language), valueLabel: values.join(", "), hasValue: true });
    } else if (field.source === "user") {
      // A preset's own field with no default: show what it offers.
      const labels = field.options.slice(0, 4).map((o) => optionLabel(o, language));
      const more = field.options.length > 4 ? "…" : "";
      rows.push({ fieldId: field.id, fieldLabel: fieldName(field, language), valueLabel: labels.length > 0 ? labels.join(", ") + more : "", hasValue: false });
    }
  }
  return rows;
}

/** How many parameters the preset has — the "N parametre" number everywhere. */
export function presetParameterCount(preset: { fields: PresetField[]; selection: PresetSelection }): number {
  return presetParameterEntries(preset, "en").length;
}

/**
 * A brand-new preset-only field: a name and ONE option, type always
 * single-select. The option is the value, so the selection key is the option's
 * `value` (= its text).
 */
export function newOwnField(name: string, optionText: string, presetId: string | null = null): { field: PresetField; value: string } {
  const id = newId();
  const text = optionText.trim();
  const field: PresetField = {
    id,
    presetId,
    name: name.trim(),
    type: "single_select",
    options: [{ id: newId(), fieldId: id, label: text, value: text, sortOrder: 0 }],
    sortOrder: 0,
    config: {},
    kind: "phrase",
    source: "user",
  };
  return { field, value: text };
}

/** Renames/re-words an own field while keeping its single option and its selected value in step. */
export function rewordOwnField(field: PresetField, name: string, optionText: string): { field: PresetField; value: string } {
  const option = field.options[0];
  const text = optionText.trim() === "" ? optionText : optionText.trim();
  const next: PresetField = {
    ...field,
    name,
    options: [{ ...(option ?? { id: newId(), fieldId: field.id, sortOrder: 0 }), label: text, value: text }],
  };
  return { field: next, value: text };
}

/**
 * Brings a preset saved before "one value per field" into the new shape: a
 * preset-owned field keeps only the option that was chosen (type becomes
 * single-select) or, for non-option types, one option holding the value as
 * text. Own fields without a value are dropped. Catalog keys are untouched.
 */
export function normalizePresetForEditing(
  fields: readonly PresetField[],
  selection: PresetSelection,
  language: Language,
): { fields: PresetField[]; selection: PresetSelection } {
  const outFields: PresetField[] = [];
  const outSelection: PresetSelection = {};
  const ownIds = new Set(fields.map((f) => f.id));
  for (const key of Object.keys(selection)) {
    if (ownIds.has(key)) continue;
    const raw = selection[key];
    // One value per field: a catalog multi-select keeps only its first chosen option.
    outSelection[key] = getCatalogField(key)?.type === "multi_select" && Array.isArray(raw) ? raw.slice(0, 1) : raw;
  }
  for (const field of fields) {
    const value: PresetValue | undefined = selection[field.id];
    if (value === undefined) continue;
    let text: string | null = null;
    if ((field.type === "single_select" || field.type === "dropdown") && typeof value === "string") {
      const option = field.options.find((o) => o.value === value);
      text = option ? optionLabel(option, language) : null;
    } else if (field.type === "multi_select" && Array.isArray(value) && value.length > 0) {
      const option = field.options.find((o) => o.value === value[0]);
      text = option ? optionLabel(option, language) : null;
    } else if (typeof value === "number") {
      text = formatNumber(field, value);
    } else if (typeof value === "string") {
      text = value;
    } else if (value === true) {
      text = fieldName(field, language);
    }
    if (!text) continue;
    const { field: own, value: ownValue } = newOwnField(fieldName(field, language), text, field.presetId);
    const keepId = { ...own, id: field.id, options: own.options.map((o) => ({ ...o, fieldId: field.id })), sortOrder: outFields.length };
    outFields.push(keepId);
    outSelection[field.id] = ownValue;
  }
  return { fields: outFields, selection: outSelection };
}

/**
 * A preset holds exactly ONE value per field, so the picker for a catalog
 * field is always a single choice — a multi-select field is offered as a
 * single-select here and its value is stored as a one-item array (what the
 * Prompt form's multi-select expects).
 */
export function singleChoiceField(field: PresetField): PresetField {
  return field.type === "multi_select" ? { ...field, type: "single_select" } : field;
}
export function toStoredValue(field: PresetField, value: PresetValue): PresetValue {
  return field.type === "multi_select" && typeof value === "string" ? [value] : value;
}
export function fromStoredValue(field: PresetField, value: PresetValue | undefined): PresetValue | undefined {
  return field.type === "multi_select" && Array.isArray(value) ? value[0] : value;
}
