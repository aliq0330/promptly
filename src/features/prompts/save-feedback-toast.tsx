"use client";

import { Portal } from "@/components/ui/portal";

/**
 * The small bottom toast shared by every save surface (docs/history/336-*). A plain message ("Kaydedilenlerden
 * kaldırıldı", an error), or — right after a one-tap save — a message with the "Koleksiyona ekle" action, which is how a
 * saved work is filed into collections without a second trip to the bookmark.
 */
export function SaveFeedbackToast({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const interactive = Boolean(actionLabel && onAction);
  return (
    <Portal>
      <div
        role="status"
        data-save-toast=""
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-(--z-popover) flex justify-center px-4 md:bottom-6"
      >
        <div className="pointer-events-auto flex max-w-full animate-pop-in items-center gap-3 rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">
          <span className="min-w-0">{message}</span>
          {interactive && (
            <button
              type="button"
              data-save-toast-action=""
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
