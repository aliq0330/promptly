"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { HeaderArt, type HeaderArtVariant } from "@/components/ui/header-art";

/** Top-of-page title block: optional eyebrow, title, one-line description, actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  art,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  /** Optional decorative illustration shown on the right of the header card. */
  art?: HeaderArtVariant;
  className?: string;
}) {
  if (art) {
    return (
      <header className={cn("relative overflow-hidden rounded-lg border border-border-soft bg-surface px-4 py-5 shadow-card sm:px-6 sm:py-6", className)}>
        <div className="relative z-10 flex flex-col gap-4">
          <div className="min-w-0 space-y-1.5 sm:max-w-[60%]">
            {eyebrow && (
              <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-primary">
                {Icon && <Icon size={13} strokeWidth={2.25} />}
                {eyebrow}
              </p>
            )}
            <h1 className="text-h1 font-semibold text-text">{title}</h1>
            {description && <p className="max-w-2xl text-small text-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <HeaderArt variant={art} className="absolute right-0 top-0 h-28 opacity-90 sm:right-4 sm:top-1/2 sm:h-36 sm:-translate-y-1/2" />
      </header>
    );
  }
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-primary">
            {Icon && <Icon size={13} strokeWidth={2.25} />}
            {eyebrow}
          </p>
        )}
        <h1 className="text-h1 font-semibold text-text">{title}</h1>
        {description && <p className="max-w-2xl text-small text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section title row inside a page, with an optional "see all" link. */
export function SectionHeader({
  title,
  description,
  href,
  linkLabel,
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const resolvedLinkLabel = linkLabel ?? t("common.viewAll");
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-h2 font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-small text-text-muted">{description}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-label font-medium text-text-secondary transition-colors hover:text-primary"
        >
          {resolvedLinkLabel}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

/** Standard page gutter. Tight on mobile so cards use the screen width. */
export function PageContainer({
  className,
  children,
  width = "wide",
}: {
  className?: string;
  children: React.ReactNode;
  width?: "wide" | "reading" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8",
        width === "wide" && "max-w-[1400px]",
        width === "reading" && "max-w-3xl",
        width === "narrow" && "max-w-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
