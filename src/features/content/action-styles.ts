import { cn } from "@/lib/utils";

/**
 * The one visual style for every content action (Like / Comment / Save /
 * Share) on every surface — card footers and detail pages alike. 36px touch
 * target, quiet until hovered, `active` = the viewer's own state (liked,
 * saved, just copied).
 */
export function contentActionClassName(active?: boolean, className?: string) {
  return cn(
    "relative z-10 inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-label font-medium tabular-nums",
    "transition-[background-color,color] duration-200 ease-soft",
    "hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    active ? "text-primary" : "text-text-muted hover:text-text",
    className,
  );
}
