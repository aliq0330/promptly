"use client";

import type { ReactNode } from "react";
import { Portal } from "@/components/ui/portal";

/**
 * The one toast bar (docs/history/403-*): dark ink pill, bottom centre above the mobile tab bar. Every transient message of the app
 * — `useToast` (what `announceNotice` fills), the save feedback, the version-restore notice, the chat and collection toasts —
 * is drawn by this component, so position, layer, motion and colours cannot drift. `layer="popover"` sits above sheets (z-60),
 * `layer="toast"` above everything (z-70). An optional action (a short text button) makes the bar interactive.
 */
export function ToastBar({
  children,
  actionLabel,
  onAction,
  actionProps,
  layer = "popover",
  ...data
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** `data-*` attributes of the action button (tests and anchors). */
  actionProps?: Record<`data-${string}`, string>;
  layer?: "popover" | "toast";
  [data: `data-${string}`]: string | undefined;
}) {
  const interactive = Boolean(actionLabel && onAction);
  return (
    <Portal>
      <div
        role="status"
        className={`pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex justify-center px-4 md:bottom-6 ${layer === "toast" ? "z-(--z-toast)" : "z-(--z-popover)"}`}
        {...data}
      >
        <div className="pointer-events-auto flex max-w-full animate-pop-in items-center gap-3 rounded-md bg-text px-4 py-2 text-small text-background shadow-pop">
          <span className="min-w-0">{children}</span>
          {interactive && (
            <button
              type="button"
              data-toast-action=""
              {...actionProps}
              onClick={onAction}
              className="shrink-0 rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
}
