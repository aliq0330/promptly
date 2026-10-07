"use client";

import { Check, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { PresetFieldList } from "@/features/presets/preset-field-list";
import type { Preset } from "@/types";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

/** Applying a preset only changes the Studio draft (and is undoable); the saved preset and the original prompt stay as they are. */
export function PresetPane({ draft, preset, edit }: { draft: StudioSnapshot; preset: Preset; edit: Update }) {
  const { t } = useTranslation();
  const piece = draft.preset;
  if (!piece) return null;
  const appliedCount = Object.keys(piece.selection).length;
  const presetCount = Object.keys(preset.selection).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => edit((d) => (d.preset ? { ...d, preset: { ...d.preset, selection: { ...preset.selection } } } : d))}
          disabled={presetCount === 0}
          className="h-11"
        >
          <Check className="h-4 w-4" aria-hidden />
          {t("studio.applyPreset")}
        </Button>
        <Button type="button" variant="outline" onClick={() => edit((d) => (d.preset ? { ...d, preset: { ...d.preset, selection: {} } } : d))} disabled={appliedCount === 0} className="h-11">
          <Eraser className="h-4 w-4" aria-hidden />
          {t("studio.clearPreset")}
        </Button>
        <p role="status" className="text-small text-text-secondary">
          {appliedCount > 0 ? t("studio.changesApplied", { count: appliedCount }) : t("studio.presetNotApplied", { count: presetCount })}
        </p>
      </div>
      <PresetFieldList
        fields={piece.fields}
        selection={piece.selection}
        onChange={(selection) => edit((d) => (d.preset ? { ...d, preset: { ...d.preset, selection } } : d), "preset")}
        defaultOpenFirst={false}
      />
    </div>
  );
}
