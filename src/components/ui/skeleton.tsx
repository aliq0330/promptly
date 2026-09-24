import { cn } from "@/lib/utils";

/** Theme-aware shimmer block (see `skeleton-shimmer` in globals.css). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-sm", className)} {...props} />;
}
