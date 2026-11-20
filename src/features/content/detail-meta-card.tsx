"use client";

import Link from "next/link";
import { Quote } from "@/components/icons/quote";
import { Wrench } from "@/components/icons/wrench";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ReactNode } from "react";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { toolHref } from "@/lib/utils";

/**
 * Detail pages' "tool + classification" card: the recommended/preferred tool (or model) on the left, category and tag chips on the right —
 * one labelled card (tool · category · #tags · relation map). Renders nothing when there is neither a tool nor chips. Used by Prompt, Prompt İsteği,
 * Workflow and Hazır Ayar alike; each passes its own label ("Tavsiye edilen" / "Tercih edilen") and chip components.
 */
export function DetailMetaCard({
  toolLabel,
  toolRefs,
  legacyTool,
  fallbackTool,
  hasChips,
  quoteCount = 0,
  footer,
  children,
}: {
  toolLabel: string;
  toolRefs: string[] | null | undefined;
  legacyTool?: string | null;
  /** Shown (as plain text) when no tool is set but the card should still say so — e.g. a preset that fits any tool. */
  fallbackTool?: string;
  /** Whether `children` will render any chip (the chip components render nothing on their own when empty). */
  hasChips: boolean;
  /** "N kez alıntılandı" (docs/history/217-*); 0 ise satır çizilmez. */
  quoteCount?: number;
  /** A last row under a hairline (the prompt page's "İlişki haritasını aç"); it keeps the card on screen even with no tool or chips. */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const items = resolveToolRefs(toolRefs);
  const hasTool = items.length > 0 || Boolean(legacyTool) || Boolean(fallbackTool);
  if (!hasTool && !hasChips && quoteCount <= 0 && !footer) return null;

  const linkClass = "transition-colors hover:text-primary";
  return (
    // One context card (docs/history/448-*): tool, category path and #tags as labelled blocks on one left edge, the relation-map strip last.
    <section data-testid="detail-meta" className="overflow-hidden rounded-lg card-flat shadow-card">
      {hasTool && (
        <DetailMetaBlock label={toolLabel}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-secondary">
              <Wrench size={16} aria-hidden />
            </span>
            <span className="min-w-0 text-label font-semibold text-text">
              {items.length > 0
                ? items.map((item, index) => (
                    <span key={item.ref}>
                      {index > 0 && ", "}
                      <Link href={toolHref(item.tool.id)} className={linkClass}>
                        {item.label}
                      </Link>
                    </span>
                  ))
                : legacyTool
                  ? <Link href={`/discover?q=${encodeURIComponent(legacyTool)}`} className={linkClass}>{legacyTool}</Link>
                  : fallbackTool}
            </span>
          </div>
        </DetailMetaBlock>
      )}
      {hasChips && children}
      {quoteCount > 0 && (
        <p data-quote-count={quoteCount} className="flex items-center gap-1.5 border-t border-border-soft px-4 py-3 text-caption text-text-muted">
          <Quote size={12} aria-hidden /> {t("quotes.count", { count: quoteCount })}
        </p>
      )}
      {footer}
    </section>
  );
}

/** One labelled block of the meta card: a small label over its content, a hairline above every block but the first. */
export function DetailMetaBlock({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div data-meta-block className={cn("space-y-2 border-t border-border-soft px-4 py-3 first:border-t-0", className)}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}
