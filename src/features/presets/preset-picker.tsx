"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SETTING_PRESETS, settingLabel, type SettingSelection } from "@/lib/prompt-extra-settings";
import { fetchPresetsByCreator, fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import { presetParameterCount } from "@/lib/preset-utils";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { Preset } from "@/types";

type Source = "system" | "mine" | "saved" | "community";

/**
 * "Hazır ayar seç" — one picker for the four places a preset can come from:
 * the built-in sets (Sistem), the viewer's own (Benim), the ones they saved
 * (Kaydettiklerim) and public ones from the community (Topluluk). Only
 * presets of the SAME media type as the form are offered. Applying only fills
 * the parameter selection — it stays fully editable (a preset is a starting
 * point, never locked). Lists load lazily, the first time their tab opens.
 */
export function PresetPicker({
  contentType,
  onApply,
}: {
  contentType: ContentTypeId;
  /** `preset` is set for user/community presets (so the caller can record the use); built-in sets pass `null`. */
  onApply: (selection: SettingSelection, preset: Preset | null) => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [source, setSource] = useState<Source>("system");
  const [lists, setLists] = useState<Partial<Record<Exclude<Source, "system">, Preset[]>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (source === "system" || lists[source] !== undefined) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy fetch the first time a tab opens
    setLoading(true);
    const load = async (): Promise<Preset[]> => {
      if (source === "community") return (await fetchRecentPresets(40)).items;
      if (!user) return [];
      if (source === "mine") return (await fetchPresetsByCreator(user.id)).filter((p) => p.status === "published");
      return fetchSavedPresets(user.id);
    };
    load().then((items) => {
      if (cancelled) return;
      setLists((prev) => ({ ...prev, [source]: items }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source, lists, user]);

  const tabs: { key: Source; label: string }[] = [
    { key: "system", label: t("preset.pickSystem") },
    { key: "mine", label: t("preset.pickMine") },
    { key: "saved", label: t("preset.pickSaved") },
    { key: "community", label: t("preset.pickCommunity") },
  ];

  const systemSets = SETTING_PRESETS.filter((p) => p.contentType === contentType);
  const userPresets = source === "system" ? [] : (lists[source] ?? []).filter((p) => p.contentType === contentType);
  const needsLogin = (source === "mine" || source === "saved") && !user;

  return (
    <section aria-label={t("extra.presets")} className="space-y-2">
      <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.presets")}</h3>
      <Tabs variant="segmented" ariaLabel={t("preset.pickAria")} active={source} onChange={setSource} items={tabs} />
      {source === "system" ? (
        systemSets.length === 0 ? (
          <p className="text-caption text-text-muted">{t("preset.pickEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {systemSets.map((set) => (
              <Chip key={set.id} onClick={() => onApply(set.selection, null)}>
                <span aria-hidden>{set.emoji}</span> {settingLabel(set, language)}
              </Chip>
            ))}
          </div>
        )
      ) : needsLogin ? (
        <p className="text-caption text-text-muted">{t("preset.pickLoginRequired")}</p>
      ) : loading && lists[source] === undefined ? (
        <p className="text-caption text-text-muted">{t("common.loading")}</p>
      ) : userPresets.length === 0 ? (
        <p className="text-caption text-text-muted">{t("preset.pickEmpty")}</p>
      ) : (
        <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {userPresets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                data-preset-pick={preset.id}
                onClick={() => onApply(preset.selection, preset)}
                className="flex w-full items-center gap-2 rounded-md border border-border-soft bg-surface px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-semibold text-text">{preset.title}</span>
                  <span className="block truncate text-caption text-text-muted">{preset.creator.displayName}</span>
                </span>
                <span className="shrink-0 text-caption text-text-secondary">{t("preset.paramCount", { count: presetParameterCount(preset.selection) })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
