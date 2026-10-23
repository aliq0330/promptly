"use client";

import Link from "next/link";
import { Quote, Wrench } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ReactNode } from "react";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { toolHref } from "@/lib/utils";

/**
 * Detail pages' "tool + classification" card: the recommended/preferred tool (or model) on the left, category and tag chips on the right —
 * one quiet surface instead of three loose rows. Renders nothing when there is neither a tool nor chips. Used by Prompt, Prompt İsteği,
 * Workflow and Hazır Ayar alike; each passes its own label ("Tavsiye edilen" / "Tercih edilen") and chip components.
 */
export function DetailMetaCard({
  toolLabel,
  toolRefs,
  legacyTool,
  fallbackTool,
  hasChips,
  quoteCount = 0,
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
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const items = resolveToolRefs(toolRefs);
  const hasTool = items.length > 0 || Boolean(legacyTool) || Boolean(fallbackTool);
  if (!hasTool && !hasChips && quoteCount <= 0) return null;

  const linkClass = "transition-colors hover:text-primary";
  return (
    // An unboxed band between hairlines (docs/history/201-*): tool first, chips under it.
    <section data-testid="detail-meta" className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-y border-border-soft py-4">
      {hasTool && (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-secondary">
            <Wrench size={16} aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-label font-semibold text-text">
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
            <span className="block text-caption text-text-muted">{toolLabel}</span>
          </span>
        </div>
      )}
      {hasChips && <div className="flex min-w-0 basis-full flex-wrap gap-1.5">{children}</div>}
      {quoteCount > 0 && (
        <p data-quote-count={quoteCount} className="flex basis-full items-center gap-1.5 text-caption text-text-muted">
          <Quote size={13} aria-hidden /> {t("quotes.count", { count: quoteCount })}
        </p>
      )}
    </section>
  );
}
