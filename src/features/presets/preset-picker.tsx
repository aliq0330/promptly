"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
import { presetParameterEntries, resolvePresetFields } from "@/lib/preset-utils";
import { fetchPresetsByCreator, fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import { presetHref } from "@/lib/utils";
import type { Preset } from "@/types";
import { PresetSaveCta } from "./preset-save-cta";

/** What applying a preset hands the form: the fields it uses and the values it sets. */
export interface PresetBundle {
  fields: PresetField[];
  selection: PresetSelection;
}

export type PresetListTab = "saved" | "community";
type CommunityTab = "mine" | "others";

/** A preset of the same media type as the form, those matching the form's category first. */
function sameType(items: Preset[] | undefined, contentType: ContentTypeId, category: string | null): Preset[] {
  return (items ?? [])
    .filter((p) => p.contentType === contentType)
    .sort((a, b) => Number(Boolean(category && b.category === category)) - Number(Boolean(category && a.category === category)));
}

/**
 * The preset tabs of the Prompt form's "Ek Ayar Önerileri" panel:
 *
 *  - `saved` — "Kaydettiklerim": presets the viewer saved with the ordinary
 *    save (any collection), applied with "Uygula".
 *  - `community` — "Topluluk": "Paylaştıklarım" (the viewer's own published
 *    presets, public or private, applied directly) and "Diğerleri" (other
 *    people's public presets — these are only SAVED here; once saved they show
 *    up under Kaydettiklerim and are applied from there).
 *
 * Only presets of the form's media type are shown. Applying only fills the form
 * — it stays fully editable. Lists load lazily, the first time they are shown,
 * and "Kaydettiklerim" reloads when something is saved/unsaved from "Diğerleri".
 */
export function PresetLists({
  tab,
  contentType,
  category = null,
  onApply,
}: {
  tab: PresetListTab;
  contentType: ContentTypeId;
  category?: string | null;
  onApply: (bundle: PresetBundle) => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [communityTab, setCommunityTab] = useState<CommunityTab>("mine");
  const [lists, setLists] = useState<{ saved?: Preset[]; mine?: Preset[]; others?: Preset[] }>({});
  const [savedVersion, setSavedVersion] = useState(0);
  const need: keyof typeof lists = tab === "saved" ? "saved" : communityTab;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a save/unsave elsewhere invalidates the cached "Kaydettiklerim" list
    setLists((prev) => ({ ...prev, saved: undefined }));
  }, [savedVersion]);

  useEffect(() => {
    if (lists[need] !== undefined) return;
    if (need !== "others" && !user) return;
    let cancelled = false;
    const load = async (): Promise<Preset[]> => {
      if (need === "others") return (await fetchRecentPresets(60)).items.filter((p) => p.creator.id !== user?.id);
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

  const renderRow = (preset: Preset, action: "apply" | "save") => {
    const entries = presetParameterEntries(preset, language);
    const summary = entries.slice(0, 3);
    return (
      <li key={preset.id} data-preset-row={preset.id} className="flex items-center gap-2 rounded-md border border-border-soft bg-surface px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-semibold text-text">{preset.title}</p>
          <p className="truncate text-caption text-text-muted">
            {preset.creator.displayName} · {t("preset.paramCount", { count: entries.length })}
          </p>
          {summary.length > 0 && <p className="truncate text-caption text-text-secondary">{summary.map((entry) => `${entry.fieldLabel}: ${entry.valueLabel}`).join(" · ")}</p>}
        </div>
        <Link
          href={presetHref(preset)}
          target="_blank"
          aria-label={t("preset.openInNewTab", { name: preset.title })}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border-soft text-text-muted hover:bg-surface-soft hover:text-text"
        >
          <ExternalLink size={14} />
        </Link>
        {action === "apply" ? (
          <button
            type="button"
            data-preset-pick={preset.id}
            onClick={() => onApply(bundleOf(preset))}
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-3 text-small font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("common.apply")}
          </button>
        ) : (
          <PresetSaveCta presetId={preset.id} saveCount={preset.saveCount} size="sm" onChange={() => setSavedVersion((v) => v + 1)} />
        )}
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
        {!user ? loginRequired : lists.saved === undefined ? loading : saved.length === 0 ? empty(t("extra.savedEmpty")) : <ul className="space-y-1.5">{saved.map((p) => renderRow(p, "apply"))}</ul>}
      </div>
    );
  }

  const mine = sameType(lists.mine, contentType, category);
  const others = sameType(lists.others, contentType, category);
  return (
    <div className="space-y-3">
      <Tabs
        variant="segmented"
        ariaLabel={t("extra.tabCommunity")}
        active={communityTab}
        onChange={setCommunityTab}
        items={[
          { key: "mine", label: t("extra.communityMine") },
          { key: "others", label: t("extra.communityOthers") },
        ]}
      />
      {communityTab === "mine" ? (
        !user ? (
          loginRequired
        ) : lists.mine === undefined ? (
          loading
        ) : mine.length === 0 ? (
          empty(t("extra.mineEmpty"))
        ) : (
          <ul className="space-y-1.5">{mine.map((p) => renderRow(p, "apply"))}</ul>
        )
      ) : lists.others === undefined ? (
        loading
      ) : others.length === 0 ? (
        empty(t("extra.othersEmpty"))
      ) : (
        <ul className="space-y-1.5">{others.map((p) => renderRow(p, "save"))}</ul>
      )}
    </div>
  );
}
