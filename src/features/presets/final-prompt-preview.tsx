"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptPart } from "@/lib/prompt-parts";
import { cn } from "@/lib/utils";

/** The final prompt (prompt + preset) as mono text with the preset's pieces tinted, plus a legend while any piece comes from a preset (docs/history/228-*). */
export function FinalPromptPreview({ parts, label, className, heading = false }: { parts: readonly PromptPart[]; label: string; className?: string; heading?: boolean }) {
  const { t } = useTranslation();
  const fromPreset = parts.some((part) => part.from === "preset");
  return (
    <div className={className}>
      <p className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption font-medium text-text-muted">
        <span className={cn(heading && "font-bold uppercase tracking-[0.06em]")}>{label}</span>
        {fromPreset && (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-text-muted/40" />
              {t("presetFit.legendPrompt")}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-primary/20 ring-1 ring-primary/40" />
              {t("presetFit.legendPreset")}
            </span>
          </span>
        )}
      </p>
      <p data-final-prompt className="prompt-text break-words rounded-lg border border-border-soft bg-surface-soft p-3 text-small text-text-secondary">
        {parts.map((part, index) => (
          <span key={index} data-from={part.from} className={cn(part.from === "preset" ? "rounded-sm bg-primary/20 text-text [box-decoration-break:clone]" : "text-text-secondary")}>
            {part.text}
          </span>
        ))}
      </p>
    </div>
  );
}
