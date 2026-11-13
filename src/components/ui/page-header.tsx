"use client";

import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { ArrowRight } from "@/components/icons/arrow-right";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Top-of-page title block: optional eyebrow, title, one-line description, actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  icon?: IconComponent;
  actions?: React.ReactNode;
  className?: string;
}) {
  // Meydan (docs/history/190-*): one plain, large title block everywhere — the illustrated header card is gone.
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-primary">
            {Icon && <Icon size={12} />}
            {eyebrow}
          </p>
        )}
        <h1 className="text-h1 font-bold text-text">{title}</h1>
        {description && <p className="max-w-2xl text-small text-text-muted sm:text-body">{description}</p>}
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
        <h2 className="text-h2 font-medium text-text">{title}</h2>
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

/**
 * The one page gutter (12 / 24 / 32 px) and vertical rhythm. Every page shell — `PageContainer`, the Hub pages, settings, the
 * compose form — uses these, so a tablet is 24 px everywhere (audit G12). Pages outside `PageContainer` import the class names.
 */
export const PAGE_GUTTER_CLASS = "px-3 sm:px-6 lg:px-8";
export const PAGE_PADDING_Y_CLASS = "py-5 sm:py-6 lg:py-8";
export const PAGE_WIDTH_CLASS = { wide: "max-w-[1400px]", hub: "max-w-6xl", reading: "max-w-3xl", narrow: "max-w-xl" } as const;

/** Standard page gutter. Tight on mobile so cards use the screen width. */
export function PageContainer({
  className,
  children,
  width = "wide",
}: {
  className?: string;
  children: React.ReactNode;
  width?: "wide" | "hub" | "reading" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        PAGE_GUTTER_CLASS,
        PAGE_PADDING_Y_CLASS,
        PAGE_WIDTH_CLASS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
