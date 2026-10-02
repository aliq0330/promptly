import { getCatalogField } from "@/lib/prompt-extra-settings";
import { cloneField, fieldName, optionLabel, selectionEntries, type PresetField, type PresetSelection } from "@/lib/preset-fields";
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
 * Turns `fields` (platform catalog fields, or someone else's) into
 * user-owned copies a preset can edit — new ids, plain strings — and rewrites
 * the selection's keys to match. Fields that are already the user's own are
 * kept untouched. Used when saving the prompt form's current choices as a
 * preset, and when an old catalog-only preset is opened in the editor.
 */
export function adoptForPreset(
  fields: readonly PresetField[],
  selection: PresetSelection,
  language: Language,
  presetId: string | null = null,
): { fields: PresetField[]; selection: PresetSelection } {
  const outFields: PresetField[] = [];
  const outSelection: PresetSelection = {};
  fields.forEach((field, index) => {
    const own = field.source === "user" ? { ...field, presetId, sortOrder: index } : { ...cloneField(field, language, presetId), sortOrder: index };
    outFields.push(own);
    const value = selection[field.id];
    if (value === undefined) return;
    // Option values are kept verbatim by `cloneField`, so the stored value stays valid.
    outSelection[own.id] = value;
  });
  return { fields: outFields, selection: outSelection };
}
