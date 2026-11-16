"use client";

import { ToastBar } from "@/components/ui/toast";

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
  return (
    <ToastBar actionLabel={actionLabel} onAction={onAction} actionProps={{ "data-save-toast-action": "" }} data-save-toast="">
      {message}
    </ToastBar>
  );
}
