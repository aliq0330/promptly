"use client";

import { Check } from "lucide-react";
import { findTool } from "@/lib/ai-tool-catalog";
import { contentTypeLabelKey, findCategory, taxonomyLabel } from "@/lib/content-taxonomy";
import type { PresetFit } from "@/lib/preset-fit";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Preset } from "@/types";

/** The reason line of a fit, in words ("Görsel · Portre · Midjourney ile eşleşti" / "Kısmen · Başka araç: GPT Image"). */
export function useFitSummary() {
  const { t, language } = useTranslation();
  return (fit: PresetFit, preset: Pick<Preset, "contentType" | "category">): string => {
    const toolName = (id: string | null) => (id ? (findTool(id)?.name ?? id) : "");
    const categoryLabel = (id: string | null) => {
      const category = findCategory(preset.contentType, id);
      return category ? taxonomyLabel(category.labelKey, language) : (id ?? "");
    };
    if (fit.level === "partial") {
      const reasons: string[] = [];
      if (fit.category === "different") reasons.push(t("presetFit.otherCategory", { category: categoryLabel(preset.category) }));
      if (fit.tool === "other") reasons.push(t("presetFit.otherTool", { tool: toolName(fit.otherToolId) }));
      return `${t("presetFit.partial")} · ${reasons.join("; ")}`;
    }
    const parts = [taxonomyLabel(contentTypeLabelKey(preset.contentType), language)];
    parts.push(fit.category === "same" ? categoryLabel(preset.category) : t("presetFit.general"));
    parts.push(fit.tool === "shared" ? toolName(fit.sharedToolId) : t("presetFit.anyTool"));
    return t("presetFit.reasonMatch", { parts: parts.filter(Boolean).join(" · ") });
  };
}

/** "Uyumlu" with its reason (docs/history/228-*): green check for a match, amber "Kısmen · …" when the category or tool differs. */
export function FitBadge({ fit, preset, className }: { fit: PresetFit; preset: Pick<Preset, "contentType" | "category">; className?: string }) {
  const summarize = useFitSummary();
  if (fit.level === "none") return null;
  const match = fit.level === "match";
  return (
    <span data-fit={fit.level} className={cn("inline-flex items-start gap-1 text-caption font-semibold leading-snug", match ? "text-success" : "text-warning", className)}>
      {match && <Check size={12} strokeWidth={3} aria-hidden className="mt-0.5 shrink-0" />}
      <span>{summarize(fit, preset)}</span>
    </span>
  );
}
