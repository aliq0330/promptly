import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The card inside a `Modal` (audit §6): 16px radius, soft border, overlay shadow, the layout (`flex max-h-[85dvh] flex-col`, sticky header/footer with `SpaceDialog`'s `DIALOG_FOOTER_CLASS`) is the caller's. `Modal` owns the backdrop, scroll lock, focus and the mobile bottom-sheet behaviour; this owns what
 * the card looks like, so the ~90 dialogs stop drawing their own. Pass the width (`max-w-md`) and padding at the call site.
 * Click-through to the backdrop is stopped here, so callers do not write `onClick={e => e.stopPropagation()}`.
 */
export const DIALOG_SHELL_CLASS = "w-full rounded-lg border border-border-soft bg-surface shadow-pop";

export function DialogShell({ className, onClick, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(DIALOG_SHELL_CLASS, className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    />
  );
}
