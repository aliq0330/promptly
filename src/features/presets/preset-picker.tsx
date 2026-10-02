"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { catalogFields, platformPresetsFor } from "@/lib/prompt-extra-settings";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
import { presetParameterCount, resolvePresetFields } from "@/lib/preset-utils";
import { fetchPresetsByCreator, fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import { cn } from "@/lib/utils";
import type { Preset } from "@/types";

/** What applying a preset hands the form: the fields it uses and the values it sets. */
export interface PresetBundle {
  fields: PresetField[];
  selection: PresetSelection;
}

type Source = "platform" | "mine" | "community";

/**
 * "Hazır ayar seç" — the sources a preset can come from: Promptly Hazır
 * Ayarları (shipped with the platform), Benim Hazır Ayarlarım (the viewer's own
 * plus the ones they saved, with "+ Hazır Ayar Oluştur") and Topluluk (public
 * presets). Only presets of the SAME media type as the form are offered, those
 * matching the form's category first. Applying only fills the form — it stays
 * fully editable (a preset is a starting point, never locked). Lists load
 * lazily, the first time their tab opens.
 */
export function PresetPicker({
  contentType,
  category = null,
  onApply,
  onCreate,
  refreshKey = 0,
}: {
  contentType: ContentTypeId;
  category?: string | null;
  /** `preset` is set for user/community presets (so the caller can record the use); platform sets pass `null`. */
  onApply: (bundle: PresetBundle, preset: Preset | null) => void;
  onCreate?: () => void;
  /** Bump to reload "Benim Hazır Ayarlarım" (a preset was just created). */
  refreshKey?: number;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [source, setSource] = useState<Source>("platform");
  const [lists, setLists] = useState<{ mine?: Preset[]; saved?: Preset[]; community?: Preset[] }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a created preset invalidates the cached "mine" list
    setLists((prev) => ({ ...prev, mine: undefined, saved: undefined }));
  }, [refreshKey]);

  useEffect(() => {
    if (source === "platform") return;
    const needs = source === "community" ? lists.community === undefined : lists.mine === undefined;
    if (!needs) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy fetch the first time a tab opens
    setLoading(true);
    const load = async () => {
      if (source === "community") {
        const items = (await fetchRecentPresets(40)).items;
        return { community: items };
      }
      if (!user) return { mine: [], saved: [] };
      const [own, saved] = await Promise.all([fetchPresetsByCreator(user.id), fetchSavedPresets(user.id)]);
      return { mine: own.filter((p) => p.status === "published"), saved };
    };
    load().then((result) => {
      if (cancelled) return;
      setLists((prev) => ({ ...prev, ...result }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source, lists.mine, lists.community, user]);

  const tabs: { key: Source; label: string }[] = [
    { key: "platform", label: t("preset.pickPlatform") },
    { key: "mine", label: t("preset.pickMine") },
    { key: "community", label: t("preset.pickCommunity") },
  ];

  const sameType = (items: Preset[] | undefined) =>
    (items ?? [])
      .filter((p) => p.contentType === contentType)
      .sort((a, b) => Number(Boolean(category && b.category === category)) - Number(Boolean(category && a.category === category)));

  function bundleOf(preset: Preset): PresetBundle {
    return { fields: resolvePresetFields(preset), selection: preset.selection };
  }

  const platformSets = platformPresetsFor(contentType, category);

  const renderUserPreset = (preset: Preset, own: boolean) => (
    <li key={preset.id} className="flex items-stretch gap-1.5">
      <button
        type="button"
        data-preset-pick={preset.id}
        onClick={() => onApply(bundleOf(preset), preset)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-soft bg-surface px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label font-semibold text-text">{preset.title}</span>
          <span className="block truncate text-caption text-text-muted">{preset.creator.displayName}</span>
        </span>
        <span className="shrink-0 text-caption text-text-secondary">{t("preset.paramCount", { count: presetParameterCount(preset) })}</span>
      </button>
      {own && (
        <Link
          href={`/presets/create?edit=${preset.id}`}
          target="_blank"
          aria-label={t("preset.editInNewTab", { name: preset.title })}
          className="grid w-9 shrink-0 place-items-center rounded-md border border-border-soft text-text-muted hover:bg-surface-soft hover:text-text"
        >
          <ExternalLink size={14} />
        </Link>
      )}
    </li>
  );

  const mine = sameType(lists.mine);
  const savedOnly = sameType(lists.saved).filter((p) => !mine.some((m) => m.id === p.id));
  const community = sameType(lists.community);
  const ownLoaded = lists.mine !== undefined;

  return (
    <section aria-label={t("extra.presets")} className="space-y-3">
      <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.presets")}</h3>
      <Tabs variant="segmented" ariaLabel={t("preset.pickAria")} active={source} onChange={setSource} items={tabs} />

      {source === "platform" &&
        (platformSets.length === 0 ? (
          <p className="text-caption text-text-muted">{t("preset.pickEmpty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {platformSets.map((set) => {
              const fields = catalogFields(Object.keys(set.selection));
              const recommended = Boolean(category && set.category === category);
              return (
                <li key={set.id}>
                  <button
                    type="button"
                    data-platform-preset={set.id}
                    onClick={() => onApply({ fields, selection: set.selection }, null)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      recommended ? "border-primary/40 bg-primary-soft/50" : "border-border-soft bg-surface",
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-soft text-lg" aria-hidden>
                      {set.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label font-semibold text-text">{language === "en" ? set.en : set.tr}</span>
                      <span className="block truncate text-caption text-text-muted">
                        {t("preset.paramCount", { count: Object.keys(set.selection).length })}
                        {recommended && ` · ${t("preset.suggested")}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {source === "mine" && (
        <div className="space-y-3">
          {onCreate && (
            <Button type="button" variant="secondary" size="sm" onClick={onCreate} data-create-preset>
              <Plus size={14} aria-hidden />
              {t("presetBuilder.createButton")}
            </Button>
          )}
          {!user ? (
            <p className="text-caption text-text-muted">{t("preset.pickLoginRequired")}</p>
          ) : loading && !ownLoaded ? (
            <p className="text-caption text-text-muted">{t("common.loading")}</p>
          ) : mine.length === 0 && savedOnly.length === 0 ? (
            <p className="text-caption text-text-muted">{t("preset.pickMineEmpty")}</p>
          ) : (
            <>
              {mine.length > 0 && <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">{mine.map((p) => renderUserPreset(p, true))}</ul>}
              {savedOnly.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-caption font-semibold text-text-secondary">{t("preset.pickSaved")}</h4>
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">{savedOnly.map((p) => renderUserPreset(p, false))}</ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {source === "community" &&
        (loading && lists.community === undefined ? (
          <p className="text-caption text-text-muted">{t("common.loading")}</p>
        ) : community.length === 0 ? (
          <p className="text-caption text-text-muted">{t("preset.pickEmpty")}</p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">{community.map((p) => renderUserPreset(p, false))}</ul>
        ))}
    </section>
  );
}
