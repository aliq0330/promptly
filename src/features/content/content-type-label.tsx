import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The small "what is this" line at the top of every card and detail page:
 * `[icon] Görsel Prompt · Midjourney`, `[icon] Generator · Karakter`,
 * `[icon] Prompt İsteği · Video`. One consistent place for content type +
 * category/tool, so a mixed feed is scannable at a glance.
 */
export function ContentTypeLabel({
  icon: Icon,
  label,
  detail,
  className,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.07em] text-text-secondary",
        className,
      )}
    >
      <Icon size={13} strokeWidth={2.1} aria-hidden className="shrink-0 text-primary" />
      <span className="shrink-0">{label}</span>
      {detail && (
        <>
          <span aria-hidden className="text-border-strong">
            /
          </span>
          <span className="truncate font-medium normal-case tracking-normal text-text-muted">{detail}</span>
        </>
      )}
    </p>
  );
}

/** Meydan's content-type pill on a card's identity line (`[icon] Görsel Prompt`); the detail pages keep the line form above. */
export function ContentTypePill({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 text-caption font-semibold text-primary", className)}>
      <Icon size={12} strokeWidth={2.1} aria-hidden />
      {label}
    </span>
  );
}
