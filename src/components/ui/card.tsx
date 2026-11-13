import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** The one box surface: 16px radius, soft border, faint shadow. `Card`, `HubCard` and the panel cards all start from it. */
export const CARD_SURFACE_CLASS = "rounded-lg border border-border-soft bg-surface shadow-card";

/** Card padding scale (audit §10/§11): 12 compact · 16 default · 20 roomy. */
export const CARD_PADDING = { sm: "p-3", md: "p-4", lg: "p-5" } as const;

/**
 * Base surface: soft border, faint shadow. `interactive` adds the shared
 * hover treatment used by every clickable content card (border + shadow
 * transition and a 1px lift) — see features/content/content-card.tsx.
 */
export function Card({
  className,
  interactive,
  padding,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; padding?: keyof typeof CARD_PADDING }) {
  return (
    <div
      className={cn(
        CARD_SURFACE_CLASS,
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
