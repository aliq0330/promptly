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
    <p className={cn("flex min-w-0 items-center gap-1.5 text-caption font-medium text-text-secondary", className)}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs bg-primary-soft text-primary">
        <Icon size={12} strokeWidth={2.25} />
      </span>
      <span className="shrink-0">{label}</span>
      {detail && (
        <>
          <span aria-hidden className="text-border-strong">
            ·
          </span>
          <span className="truncate text-text-muted">{detail}</span>
        </>
      )}
    </p>
  );
}
