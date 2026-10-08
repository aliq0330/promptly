"use client";

import { useMemo, useState } from "react";
import { Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { isVariableField } from "@/lib/studio-v2";

/**
 * "+ Varyasyon": names a new variation of the current draft. When a generator
 * is attached the user can also let option-based fields that are NOT locked
 * take new values — locked fields are never touched. Nothing is written until
 * "Oluştur"; the pre-variation state is kept as a version automatically.
 */
export function VariationModal({
  draft,
  defaultLabel,
  onCreate,
  onClose,
}: {
  draft: StudioSnapshot;
  defaultLabel: string;
  onCreate: (label: string, shuffle: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(defaultLabel);
  const generator = draft.generator;
  const counts = useMemo(() => {
    const variable = (generator?.schema.fields ?? []).filter(isVariableField);
    const locked = new Set(generator?.locked ?? []);
    return { open: variable.filter((f) => !locked.has(f.key)).length, locked: variable.filter((f) => locked.has(f.key)).length };
  }, [generator]);
  const [shuffle, setShuffle] = useState(counts.open > 0);

  return (
    <Modal onClose={onClose} labelledBy="studio-variation-title">
      <form
        className="flex max-h-[85dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl border border-border-soft bg-surface p-5 shadow-pop"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCreate(label.trim() || defaultLabel, shuffle && counts.open > 0);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="studio-variation-title" className="font-display text-h3 font-semibold text-text">
            {t("studio.variation")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-small text-text-secondary">{t("studio.variationHint")}</p>
        <label className="block">
          <span className="mb-1.5 block text-small font-medium text-text">{t("studio.versionLabel")}</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            autoFocus
            className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-body text-text focus:border-primary"
          />
        </label>
        {generator && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border-soft bg-surface-soft p-3">
            <input type="checkbox" checked={shuffle && counts.open > 0} disabled={counts.open === 0} onChange={(event) => setShuffle(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 text-small text-text">
              <span className="flex items-center gap-1.5 font-medium">
                <Shuffle className="h-4 w-4 text-primary" aria-hidden />
                {t("studio.variationShuffle")}
              </span>
              <span className="mt-1 block text-caption text-text-secondary">
                {counts.open > 0 ? t("studio.variationShuffleInfo", { open: counts.open, locked: counts.locked }) : t("studio.variationNothingToShuffle")}
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-11">
            {t("common.cancel")}
          </Button>
          <Button type="submit" className="h-11">
            {t("studio.createVariation")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
