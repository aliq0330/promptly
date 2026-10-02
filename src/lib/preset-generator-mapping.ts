import { allSettingGroups, getSettingGroup, type SettingGroup, type SettingSelection } from "@/lib/prompt-extra-settings";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import type { GeneratorField, GeneratorSchema, GeneratorValues } from "@/types";

/**
 * A preset's parameters are the "Ek Ayar Önerileri" catalog selection
 * (`{ groupId: optionId }`, Bölüm 9.83); a Generator's inputs are free,
 * creator-defined fields. There is no shared id between the two, so the
 * bridge is a BEST-EFFORT match on the human label (case/Turkish-insensitive,
 * both languages): a preset group "Işık / Lighting" fills a generator field
 * labelled "Işık"/"Lighting", and the chosen option is matched against that
 * field's own options by label or value. Anything that doesn't match is
 * simply left untouched — applying a preset never overwrites a field it
 * can't confidently understand, and never invents a field.
 */

const norm = (value: string) => normalizeTagLabel(value);

function groupMatchesField(group: SettingGroup, field: GeneratorField): boolean {
  const label = norm(field.label);
  const key = norm(field.key);
  return [group.tr, group.en].some((name) => {
    const n = norm(name);
    return n === label || n === key;
  });
}

function optionNames(option: { id: string; tr: string; en: string }): string[] {
  return [option.tr, option.en, option.id].map(norm);
}

function fieldFor(schema: GeneratorSchema, group: SettingGroup): GeneratorField | undefined {
  return schema.fields.find((field) => groupMatchesField(group, field));
}

/** Fills the generator's values from a preset selection. Returns the new values and how many parameters actually landed on a field. */
export function applyPresetToGeneratorValues(
  schema: GeneratorSchema,
  values: GeneratorValues,
  selection: SettingSelection,
): { values: GeneratorValues; applied: number } {
  const next: GeneratorValues = { ...values };
  let applied = 0;
  for (const [groupId, optionId] of Object.entries(selection)) {
    const group = getSettingGroup(groupId);
    const option = group?.options.find((o) => o.id === optionId);
    if (!group || !option) continue;
    const field = fieldFor(schema, group);
    if (!field) continue;
    const names = optionNames(option);
    if (field.type === "text" || field.type === "textarea") {
      next[field.key] = option.tr;
      applied += 1;
      continue;
    }
    if (field.type === "select" || field.type === "radio" || field.type === "multi_select") {
      const match = field.options.find((o) => names.includes(norm(o.label)) || names.includes(norm(o.value)));
      if (!match) continue;
      next[field.key] = field.type === "multi_select" ? [match.value] : match.value;
      applied += 1;
    }
  }
  return { values: next, applied };
}

/** The reverse: the parameters the user's current generator values can be expressed as — only those that match a catalog group AND option. */
export function generatorValuesToPresetSelection(schema: GeneratorSchema, values: GeneratorValues): SettingSelection {
  const selection: SettingSelection = {};
  for (const group of allSettingGroups()) {
    const field = fieldFor(schema, group);
    if (!field || (field.type !== "select" && field.type !== "radio" && field.type !== "multi_select")) continue;
    const raw = values[field.key];
    const chosen = Array.isArray(raw) ? raw[0] : raw;
    if (!chosen) continue;
    const chosenOption = field.options.find((o) => o.value === chosen);
    const names = [chosen, chosenOption?.label ?? ""].filter(Boolean).map(norm);
    const match = group.options.find((o) => optionNames(o).some((name) => names.includes(name)));
    if (match) selection[group.id] = match.id;
  }
  return selection;
}
