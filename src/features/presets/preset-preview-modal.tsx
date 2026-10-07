"use client";

import Link from "next/link";
import { ExternalLink, SlidersHorizontal, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { ToolChips } from "@/features/content/tool-chips";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetParameterEntries } from "@/lib/preset-utils";
import { presetHref } from "@/lib/utils";
import type { Preset } from "@/types";
import { PresetSaveCta } from "./preset-save-cta";

/**
 * A quick look at one preset from the Prompt form's panel: who made it, its
 * parameters and values, the recommended tools — plus the same "Uygula" /
 * "Kaydet" actions the list row has. Opens as a bottom sheet on mobile and a
 * centered dialog on larger screens (the shared `Modal`). It is rendered by the
 * panel as a SIBLING of the panel's own `Modal`, never inside it, so Escape
 * closes only this one and React portal bubbling can't reach the panel.
 */
export function PresetPreviewModal({
  preset,
  onClose,
  onApply,
  onSavedChange,
}: {
  preset: Preset;
  onClose: () => void;
  onApply: () => void;
  onSavedChange?: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const entries = presetParameterEntries(preset, language);
  const isOwn = user?.id === preset.creator.id;

  return (
    <Modal onClose={onClose} labelledBy="preset-preview-title">
      <div
        role="document"
        data-preset-preview={preset.id}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-pop"
      >
        <div className="flex items-start gap-3 border-b border-border-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="preset-preview-title" className="break-words text-h3 font-semibold text-text">
              {preset.title}
            </h2>
            <p className="text-caption text-text-muted">
              {preset.creator.displayName} · {t("preset.paramCount", { count: entries.length })}
            </p>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {preset.description && <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{preset.description}</p>}

          <section aria-labelledby="preset-preview-contents" className="overflow-hidden rounded-lg border border-border-soft bg-surface-soft">
            <h3 id="preset-preview-contents" className="flex items-center gap-1.5 border-b border-border-soft px-3 py-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
              <SlidersHorizontal size={13} aria-hidden />
              {t("preset.contentsTitle")}
            </h3>
            {entries.length === 0 ? (
              <p className="px-3 py-3 text-small text-text-muted">{t("preset.noParameters")}</p>
            ) : (
              <dl className="divide-y divide-border-soft">
                {entries.map((entry) => (
                  <div key={entry.fieldId} data-preview-entry className="flex items-baseline justify-between gap-3 bg-surface px-3 py-2.5">
                    <dt className="shrink-0 text-small text-text-muted">{entry.fieldLabel}</dt>
                    <dd className="min-w-0 break-words text-right text-small font-semibold text-text">{entry.valueLabel}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div className="space-y-2">
            <p className="text-caption font-medium text-text-muted">{t("tool.recommendedLabel")}</p>
            {preset.tools.length > 0 ? (
              <ToolChips refs={preset.tools} />
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">{t("preset.generalTool")}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-soft px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link
            href={presetHref(preset)}
            target="_blank"
            aria-label={t("preset.openInNewTab", { name: preset.title })}
            className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-small text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <ExternalLink size={14} aria-hidden />
            <span className="max-sm:sr-only">{t("preset.openPage")}</span>
          </Link>
          {!isOwn && <PresetSaveCta presetId={preset.id} saveCount={preset.saveCount} size="sm" onChange={onSavedChange} />}
          <button
            type="button"
            data-preview-apply
            onClick={onApply}
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("common.apply")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
