import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Filter/selection chip — a real toggle button (`aria-pressed`). */
export const Chip = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: LucideIcon }
>(({ selected, icon: Icon, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={selected}
    className={cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label font-medium whitespace-nowrap",
      "transition-[background-color,border-color,color] duration-200 ease-soft",
      selected
        ? "border-text bg-text text-background"
        : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text",
      className,
    )}
    {...props}
  >
    {Icon && <Icon size={14} />}
    {children}
  </button>
));
Chip.displayName = "Chip";

/**
 * Horizontal chip row: wraps on desktop, scrolls edge-to-edge on mobile.
 * `touch-pan-x`/`overscroll-x-contain` keep a horizontal swipe from also
 * scrolling the page vertically or chaining into it at the edge (same
 * real iOS Safari fix as `Tabs`).
 */
export function ChipRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "scrollbar-none -mx-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
