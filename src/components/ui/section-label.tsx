import type { IconComponent } from "@/components/icons/icon";
import { cn } from "@/lib/utils";

/**
 * The one small label above a group (docs/history/406-*): sidebar group names, form section labels, a card's "type · tool" kicker,
 * table headings. 12 px, semibold, sentence case, no letter spacing — the hierarchy comes from size and colour, never from
 * capitals. `tone="overlay"` is for labels drawn on a picture or the dark Odak stage (`text-on-art-muted`).
 */
export function SectionLabel({
  as: Tag = "p",
  tone = "muted",
  icon: Icon,
  id,
  className,
  children,
}: {
  as?: "p" | "h2" | "h3" | "span" | "div";
  tone?: "muted" | "secondary" | "primary" | "overlay";
  icon?: IconComponent;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-caption font-semibold",
        tone === "muted" && "text-text-muted",
        tone === "secondary" && "text-text-secondary",
        tone === "primary" && "text-primary",
        tone === "overlay" && "text-on-art-muted",
        className,
      )}
    >
      {Icon && <Icon size={12} aria-hidden className="shrink-0" />}
      {children}
    </Tag>
  );
}
