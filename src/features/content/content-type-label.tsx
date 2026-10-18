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

/** A card's content-type row (docs/history/196-*): a small tinted icon tile + the label (`[▣] Görsel Prompt`); the detail pages keep the line form above. */
export function ContentTypePill({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-small font-medium text-text-secondary", className)}>
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
