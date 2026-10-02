import { allSettingGroups, getSettingGroup, settingLabel, type SettingSelection } from "@/lib/prompt-extra-settings";
import type { Language } from "@/lib/i18n/translations";

export interface PresetParameterEntry {
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionLabel: string;
}

/**
 * A preset's `{ groupId: optionId }` selection as readable rows
 * (`Işık: Yumuşak`), in the setting catalog's own order — never the JSON
 * key order. Ids the catalog no longer knows are dropped (a preset written
 * against an older catalog must never crash or print raw ids).
 */
export function presetParameterEntries(selection: SettingSelection, language: Language): PresetParameterEntry[] {
  const entries: PresetParameterEntry[] = [];
  for (const group of allSettingGroups()) {
    const optionId = selection[group.id];
    if (!optionId) continue;
    const option = group.options.find((o) => o.id === optionId);
    if (!option) continue;
    entries.push({
      groupId: group.id,
      groupLabel: settingLabel(group, language),
      optionId,
      optionLabel: settingLabel(option, language),
    });
  }
  return entries;
}

/** How many of the preset's parameters the catalog still understands — the "N parametre" number everywhere. */
export function presetParameterCount(selection: SettingSelection): number {
  return Object.entries(selection).filter(([groupId, optionId]) => getSettingGroup(groupId)?.options.some((o) => o.id === optionId)).length;
}
