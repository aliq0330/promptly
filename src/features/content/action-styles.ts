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
    "transition-[background-color,color,transform] duration-200 ease-soft active:scale-[0.94]",
    "hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    active ? "text-primary" : "text-text-muted hover:text-text",
    className,
  );
}

/** A card's Kaydet icon: the count stays on the detail page; the compact card row keeps only the bookmark (`SaveButton` draws the count as its direct `<span>`). */
export const CARD_SAVE_CLASS = "[&>span]:hidden";

/** The reaction control laid over a picture (a result card's corner, docs/history/281-*): a translucent dark pill, white on any image. */
export function overlayActionClassName(className?: string) {
  return cn(
    "relative z-10 inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full bg-black/50 px-2.5 text-label font-semibold tabular-nums text-white backdrop-blur-sm",
    "transition-[background-color,transform] duration-200 ease-soft active:scale-[0.94] hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
    className,
  );
}
