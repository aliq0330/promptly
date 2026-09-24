import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}) {
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
  linkLabel = "Tümünü gör",
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
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
          {linkLabel}
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
