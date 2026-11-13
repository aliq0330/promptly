import type { IconComponent } from "@/components/icons/icon";
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
  icon: IconComponent;
  label: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-micro font-semibold uppercase leading-none tracking-[0.07em] text-text-secondary",
        className,
      )}
    >
      <Icon size={12} aria-hidden className="shrink-0 text-primary" />
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

/**
 * A card's kicker (Albüm card, docs/history/202-*): the type's icon + an uppercase label (+ `detail`, e.g. the tool), in the
 * brand colour — the same voice as the detail band's `ContentTypeLabel`.
 */
export function ContentTypePill({ icon: Icon, label, detail, className }: { icon: IconComponent; label: string; detail?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-micro font-bold uppercase leading-none tracking-[0.08em] text-primary", className)}>
      <Icon size={12} aria-hidden className="shrink-0" />
      <span className="truncate">
        {label}
        {detail && <span className="font-semibold normal-case tracking-normal text-text-secondary"> · {detail}</span>}
      </span>
    </span>
  );
}
