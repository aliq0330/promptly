"use client";

import { Chip } from "@/components/ui/chip";
import { useTranslation } from "@/lib/i18n/language-provider";
import { settingFragment, settingLabel, type SettingGroup, type SettingSelection } from "@/lib/prompt-extra-settings";

/**
 * One chip row per setting group — the parameter picker shared by the Prompt
 * form's "Ek Ayar Önerileri" panel and the Hazır Ayar editor (a preset's
 * parameters ARE that same `{ groupId: optionId }` selection, Bölüm 9.83), so
 * both pick from exactly the same catalog with exactly the same UI. Tapping
 * the selected chip again clears that group.
 */
export function SettingGroupsEditor({
  groups,
  selection,
  onChange,
  fragmentLanguage,
}: {
  groups: SettingGroup[];
  selection: SettingSelection;
  onChange: (next: SettingSelection) => void;
  /** Language for the chip tooltip's prompt fragment (the panel lets the user force English). */
  fragmentLanguage?: "tr" | "en";
}) {
  const { language } = useTranslation();
  const fragLang = fragmentLanguage ?? language;

  function toggle(groupId: string, optionId: string) {
    const next = { ...selection };
    if (next[groupId] === optionId) delete next[groupId];
    else next[groupId] = optionId;
    onChange(next);
  }

  return (
    <>
      {groups.map((g) => (
        <section key={g.id} aria-label={settingLabel(g, language)}>
          <h3 className="mb-2 text-label font-semibold text-text">{settingLabel(g, language)}</h3>
          <div className="flex flex-wrap gap-2">
            {g.options.map((option) => (
              <Chip
                key={option.id}
                selected={selection[g.id] === option.id}
                onClick={() => toggle(g.id, option.id)}
                title={settingFragment(option, fragLang)}
                data-option={`${g.id}:${option.id}`}
              >
                {settingLabel(option, language)}
              </Chip>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
