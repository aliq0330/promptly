import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The card inside a `Modal` (audit §6): 16px radius, soft border, overlay shadow. `Modal` owns the backdrop, scroll lock, focus and the
 * mobile bottom-sheet behaviour; this owns what the card looks like, so the dialogs stop drawing their own. The layout (`flex max-h-[85dvh]
 * flex-col`, sticky header/footer with `SpaceDialog`'s `DIALOG_FOOTER_CLASS`), the width (`max-w-md`) and the padding are the caller's.
 * Click-through to the backdrop is stopped here, so callers do not write `onClick={e => e.stopPropagation()}`.
 */
export const DIALOG_SHELL_CLASS = "w-full rounded-lg border border-border-soft bg-surface shadow-pop";

export const DialogShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, onClick, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(DIALOG_SHELL_CLASS, className)}
    onClick={(event) => {
      event.stopPropagation();
      onClick?.(event);
    }}
    {...props}
  />
));
DialogShell.displayName = "DialogShell";
