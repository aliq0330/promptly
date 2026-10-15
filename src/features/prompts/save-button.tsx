"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { cn, formatCount } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useSaveState } from "./use-save-state";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";

/**
 * Kaydet — the bookmark always opens the same collection picker
 * (`SaveToCollectionModal`): empty → "pick where to save it", filled → "it is
 * in these collections, untick the ones to leave". A filled bookmark never
 * removes anything by itself — saved means "in at least one collection", so
 * un-saving is the user taking it out of every collection, one explicit
 * choice at a time. The bookmark empties only when the modal reports that no
 * collection holds the work any more.
 *
 * Pass exactly one of `promptId` (mirrors `PostMenu`'s/
 * `CommentCountLink`'s established pattern) — workflows and presets use this
 * SAME button/modal.
 */
export function SaveButton({
  promptId,
  workflowId,
  presetId,
  saveCount = 0,
  size = 16,
  className,
}: {
  promptId?: string;
  workflowId?: string;
  presetId?: string;
  /** Real, trigger-maintained `save_count` column — the count seed for this id's engagement-store entry. */
  saveCount?: number;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();
  const id = (presetId ?? workflowId ?? promptId)!;
  const contentType = presetId ? "preset" : workflowId ? "workflow" : "prompt";
  const { isSaved, saveCount: count, markSaved, markUnsaved, canSave } = useSaveState(id, contentType, saveCount);
  const [modalOpen, setModalOpen] = useState(false);
  // Counted on the viewer's own save/unsave, never on the async "is it saved?" answer arriving.
  const [popSeq, setPopSeq] = useState(0);
  const [showRemovedToast, setShowRemovedToast] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const sharedClassName = contentActionClassName(isSaved, className);

  if (!canSave) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          requireAuth("save");
        }}
        aria-haspopup="dialog"
        title={t("prompt.loginToSave")}
        aria-label={t("prompt.loginToSaveAria", { count })}
        className={sharedClassName}
      >
        <Bookmark size={size} strokeWidth={1.75} />
        <span aria-hidden>{formatCount(count)}</span>
      </button>
    );
  }

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setModalOpen(true);
  }

  function showRemoved() {
    setShowRemovedToast(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShowRemovedToast(false), 2200);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={isSaved}
        aria-haspopup="dialog"
        title={isSaved ? t("prompt.manageSaved") : t("prompt.addToCollection")}
        aria-label={isSaved ? t("prompt.manageSaved") : t("prompt.saveAria", { count })}
        className={sharedClassName}
      >
        <Bookmark
          key={popSeq}
          size={size}
          fill={isSaved ? "currentColor" : "none"}
          strokeWidth={1.75}
          className={cn("transition-[fill] duration-200", popSeq > 0 && isSaved && "animate-state-pop")}
        />
        <span aria-hidden>{formatCount(count)}</span>
      </button>

      {modalOpen && (
        <SaveToCollectionModal
          {...(contentType === "preset" ? { presetId: id } : contentType === "workflow" ? { workflowId: id } : { promptId: id })}
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            setPopSeq((n) => n + 1);
            markSaved();
          }}
          onRemoved={() => {
            markUnsaved();
            showRemoved();
          }}
        />
      )}

      {showRemovedToast && (
        <Portal>
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6"
          >
            <div className="animate-pop-in rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">
              {t("prompt.removedFromSavedToast")}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
