"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
import { presetParameterEntries, resolvePresetFields } from "@/lib/preset-utils";
import { fetchPresetsByCreator, fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import type { Preset } from "@/types";
import { PresetSaveCta } from "./preset-save-cta";

/** What applying a preset hands the form: the fields it uses and the values it sets. */
export interface PresetBundle {
  fields: PresetField[];
  selection: PresetSelection;
}

export type PresetListTab = "saved" | "community";

/** A preset of the same media type as the form, those matching the form's category first. */
function sameType(items: Preset[] | undefined, contentType: ContentTypeId, category: string | null): Preset[] {
  return (items ?? [])
    .filter((p) => p.contentType === contentType)
    .sort((a, b) => Number(Boolean(category && b.category === category)) - Number(Boolean(category && a.category === category)));
}

/**
 * The preset tabs of the Prompt form's "Hazır Ayarlar ve Ek Alan Önerileri"
 * panel:
 *
 *  - `community` — "Topluluk": one list of everyone's published public presets
 *    (the viewer's own mixed in). A "Ben" toggle on top narrows it to the
 *    viewer's own published presets (public or private). Every row can be
 *    applied ("Uygula") or saved ("Kaydet", not on one's own), and tapping the
 *    row previews its parameters (`onPreview`).
 *  - `saved` — "Kaydettiklerim": presets the viewer saved with the ordinary
 *    save (any collection), applied with "Uygula".
 *
 * Only presets of the form's media type are shown. Applying only fills the form
 * — it stays fully editable. Lists load lazily, the first time they are shown;
 * "Kaydettiklerim" reloads when `savedVersion` changes (something was saved or
 * unsaved here or in the preview).
 */
export function PresetLists({
  tab,
  contentType,
  category = null,
  onApply,
  onPreview,
  savedVersion,
  onSavedChange,
}: {
  tab: PresetListTab;
  contentType: ContentTypeId;
  category?: string | null;
  onApply: (bundle: PresetBundle) => void;
  onPreview: (preset: Preset) => void;
  savedVersion: number;
  onSavedChange: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  const [lists, setLists] = useState<{ saved?: Preset[]; mine?: Preset[]; all?: Preset[] }>({});
  const need: keyof typeof lists = tab === "saved" ? "saved" : onlyMine ? "mine" : "all";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a save/unsave elsewhere invalidates the cached "Kaydettiklerim" list
    setLists((prev) => ({ ...prev, saved: undefined }));
  }, [savedVersion]);

  useEffect(() => {
    if (lists[need] !== undefined) return;
    if (need !== "all" && !user) return;
    let cancelled = false;
    const load = async (): Promise<Preset[]> => {
      if (need === "all") return (await fetchRecentPresets(60)).items;
      if (!user) return [];
      if (need === "mine") return (await fetchPresetsByCreator(user.id)).filter((p) => p.status === "published");
      return fetchSavedPresets(user.id);
    };
    load().then((items) => {
      if (!cancelled) setLists((prev) => ({ ...prev, [need]: items }));
    });
    return () => {
      cancelled = true;
    };
  }, [need, lists, user]);

  function bundleOf(preset: Preset): PresetBundle {
    return { fields: resolvePresetFields(preset), selection: preset.selection };
  }

  const renderRow = (preset: Preset, withSave: boolean) => {
    const entries = presetParameterEntries(preset, language);
    const summary = entries.slice(0, 3);
    const isOwn = user?.id === preset.creator.id;
    return (
      <li key={preset.id} data-preset-row={preset.id} className="flex items-center gap-2 rounded-md border border-border-soft bg-surface p-1.5 pl-1.5">
        <button
          type="button"
          data-preset-open={preset.id}
          onClick={() => onPreview(preset)}
          aria-haspopup="dialog"
          aria-label={t("preset.previewAria", { name: preset.title })}
          className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="block truncate text-label font-semibold text-text">{preset.title}</span>
          <span className="block truncate text-caption text-text-muted">
            {preset.creator.displayName} · {t("preset.paramCount", { count: entries.length })}
          </span>
          {summary.length > 0 && <span className="block truncate text-caption text-text-secondary">{summary.map((entry) => `${entry.fieldLabel}: ${entry.valueLabel}`).join(" · ")}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-preset-pick={preset.id}
            onClick={() => onApply(bundleOf(preset))}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("common.apply")}
          </button>
          {withSave && !isOwn && <PresetSaveCta presetId={preset.id} saveCount={preset.saveCount} size="sm" iconOnly onChange={onSavedChange} />}
        </div>
      </li>
    );
  };

  const empty = (message: string) => <p className="rounded-md border border-dashed border-border-soft px-3 py-4 text-center text-caption text-text-muted">{message}</p>;
  const loading = <p className="text-caption text-text-muted">{t("common.loading")}</p>;
  const loginRequired = <p className="text-caption text-text-muted">{t("preset.pickLoginRequired")}</p>;

  if (tab === "saved") {
    const saved = sameType(lists.saved, contentType, category);
    return (
      <div className="space-y-2">
        {!user ? loginRequired : lists.saved === undefined ? loading : saved.length === 0 ? empty(t("extra.savedEmpty")) : <ul className="space-y-1.5">{saved.map((p) => renderRow(p, false))}</ul>}
      </div>
    );
  }

  const current = sameType(lists[onlyMine ? "mine" : "all"], contentType, category);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Chip selected={onlyMine} onClick={() => setOnlyMine((v) => !v)} data-community-mine>
          {t("extra.communityMe")}
        </Chip>
        <p className="min-w-0 truncate text-caption text-text-muted">{t("extra.communityTapHint")}</p>
      </div>
      {onlyMine && !user ? (
        loginRequired
      ) : lists[onlyMine ? "mine" : "all"] === undefined ? (
        loading
      ) : current.length === 0 ? (
        empty(onlyMine ? t("extra.mineEmpty") : t("extra.othersEmpty"))
      ) : (
        <ul className="space-y-1.5">{current.map((p) => renderRow(p, true))}</ul>
      )}
    </div>
  );
}
