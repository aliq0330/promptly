"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark } from "@/components/icons/bookmark";
import { formatCount } from "@/lib/utils";
import { BookmarkIcon } from "@/components/ui/motion-icons";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useSaveState } from "./use-save-state";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";
import { SaveFeedbackToast } from "./save-feedback-toast";

/**
 * Kaydet (docs/history/336-*) — saving and collections are separate. An empty bookmark SAVES the work with one tap
 * ("Kaydedilenlerin tümü") and offers "Koleksiyona ekle" in a toast; a filled bookmark opens the collection sheet
 * (`SaveToCollectionModal`: tick collections, create one, or "Kaydedilenlerden kaldır"). A filled bookmark never
 * removes anything by itself.
 *
 * Pass exactly one of `promptId` (mirrors `PostMenu`'s/
 * `CommentCountLink`'s established pattern) — workflows and presets use this
 * SAME button/modal. `communityPostId`: a community APPLICATION post is saved as
 * the post itself (docs/history/184-*); same button, same modal, same collections.
 */
export function SaveButton({
  promptId,
  workflowId,
  presetId,
  communityPostId,
  saveCount = 0,
  size = 16,
  className,
}: {
  promptId?: string;
  workflowId?: string;
  presetId?: string;
  communityPostId?: string;
  /** Real, trigger-maintained `save_count` column — the count seed for this id's engagement-store entry. */
  saveCount?: number;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();
  const id = (communityPostId ?? presetId ?? workflowId ?? promptId)!;
  const contentType = communityPostId ? "community_post" : presetId ? "preset" : workflowId ? "workflow" : "prompt";
  const { isSaved, saveCount: count, markSaved, markUnsaved, quickSave, saving, canSave } = useSaveState(id, contentType, saveCount);
  const [modalOpen, setModalOpen] = useState(false);
  // Counted on the viewer's own save/unsave, never on the async "is it saved?" answer arriving.
  const [popSeq, setPopSeq] = useState(0);
  const [toast, setToast] = useState<{ kind: "saved" | "removed" | "failed" } | null>(null);
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
        <Bookmark size={size} />
        <span aria-hidden>{formatCount(count)}</span>
      </button>
    );
  }

  function showToast(kind: "saved" | "removed" | "failed") {
    setToast({ kind });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), kind === "saved" ? 4500 : 2200);
  }

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Saved → the collection sheet. Not saved → save right away; filing it into collections is the toast's "Koleksiyona ekle".
    if (isSaved) {
      setModalOpen(true);
      return;
    }
    if (saving) return;
    if (await quickSave()) {
      setPopSeq((n) => n + 1);
      showToast("saved");
    } else {
      showToast("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={isSaved}
        aria-haspopup={isSaved ? "dialog" : undefined}
        title={isSaved ? t("prompt.addToCollection") : t("common.save")}
        aria-label={isSaved ? t("prompt.addToCollection") : t("prompt.saveAria", { count })}
        className={sharedClassName}
      >
        <BookmarkIcon filled={isSaved} popSeq={popSeq} size={size} strokeWidth={1.75} />
        <span aria-hidden>{formatCount(count)}</span>
      </button>

      {modalOpen && (
        <SaveToCollectionModal
          {...(contentType === "community_post" ? { communityPostId: id } : contentType === "preset" ? { presetId: id } : contentType === "workflow" ? { workflowId: id } : { promptId: id })}
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            setPopSeq((n) => n + 1);
            markSaved();
          }}
          onRemoved={() => {
            markUnsaved();
            showToast("removed");
          }}
        />
      )}

      {toast && (
        <SaveFeedbackToast
          message={toast.kind === "saved" ? t("prompt.savedToast") : toast.kind === "removed" ? t("prompt.removedFromSavedToast") : t("common.actionFailedRetry")}
          actionLabel={toast.kind === "saved" ? t("prompt.addToCollection") : undefined}
          onAction={
            toast.kind === "saved"
              ? () => {
                  setToast(null);
                  setModalOpen(true);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
