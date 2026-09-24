import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Base surface: soft border, faint shadow. `interactive` adds the shared
 * hover treatment used by every clickable content card (border + shadow
 * transition and a 1px lift) — see features/content/content-card.tsx.
 */
export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-soft bg-surface shadow-card",
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
