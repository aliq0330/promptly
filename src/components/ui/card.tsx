import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** The one box surface: 16px radius, soft border, faint shadow. `Card`, `HubCard` and the panel cards all start from it. */
export const CARD_SURFACE_CLASS = "rounded-lg card-flat shadow-card";

/** Card padding scale (audit §10/§11): 12 compact · 16 default · 20 roomy. */
export const CARD_PADDING = { sm: "p-3", md: "p-4", lg: "p-5" } as const;

/** Card tones: `default` raised (border + faint shadow) · `flat` the same without the shadow · `soft` a quiet nested box (no shadow) · `inset` a field-like panel on the page ground. One radius, one border tone. */
export const CARD_TONE = {
  default: CARD_SURFACE_CLASS,
  flat: "rounded-lg card-flat",
  soft: "rounded-lg card-soft",
  inset: "rounded-lg card-inset",
} as const;

/**
 * Base surface: soft border, faint shadow. `interactive` adds the shared
 * hover treatment used by every clickable content card (border + shadow
 * transition and a 1px lift) — see features/content/content-card.tsx.
 * `tone` and `padding` are the only knobs (docs/history/406-*): never rebuild a card from `rounded-* border bg-*`.
 */
export function Card({
  as: Tag = "div",
  className,
  interactive,
  padding,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" | "li" | "aside"; interactive?: boolean; padding?: keyof typeof CARD_PADDING; tone?: keyof typeof CARD_TONE }) {
  return (
    <Tag
      className={cn(
        CARD_TONE[tone],
        padding && CARD_PADDING[padding],
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-200 ease-soft hover:-translate-y-px hover:border-border hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pb-2", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center border-t border-border-soft p-4 pt-2", className)} {...props} />;
}
