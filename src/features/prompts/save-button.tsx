"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useSaveState } from "./use-save-state";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";

/**
 * Kaydet — a real toggle, not "always open the modal":
 * - Not saved yet → opens the "Koleksiyona ekle" modal (create/choose a
 *   collection; adding to one also saves generally, see
 *   SaveToCollectionModal/collections.ts).
 * - Already saved → tapping the filled icon removes the general save
 *   DIRECTLY (no modal — this was the reported bug: the icon's own filled
 *   state already means "kayıtlı", so bringing up "kaydetmek için bir
 *   koleksiyon seç" again was backwards).
 *
 * Pass exactly one of `promptId`/`generatorId` (mirrors `PostMenu`'s/
 * `CommentCountLink`'s established pattern) — a generator uses this SAME
 * button/modal a prompt does (Bölüm 9.36's Prompt/Generator parity pass),
 * not a separate, simpler, modal-less save toggle.
 */
export function SaveButton({
  promptId,
  generatorId,
  workflowId,
  size = 16,
  className,
}: {
  promptId?: string;
  generatorId?: string;
  workflowId?: string;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const id = (workflowId ?? generatorId ?? promptId)!;
  const contentType = workflowId ? "workflow" : generatorId ? "generator" : "prompt";
  const { isSaved, removeEverywhere, markSaved, markUnsaved, isToggling, canSave } = useSaveState(
    id,
    contentType,
  );
  const [modalOpen, setModalOpen] = useState(false);
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
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        title={t("prompt.loginToSave")}
        aria-label={t("prompt.loginToSave")}
        className={sharedClassName}
      >
        <Bookmark size={size} strokeWidth={1.75} />
      </Link>
    );
  }

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isToggling) return;

    if (isSaved) {
      const removed = await removeEverywhere();
      if (removed) {
        setShowRemovedToast(true);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setShowRemovedToast(false), 2200);
      }
      return;
    }

    setModalOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isToggling}
        aria-pressed={isSaved}
        aria-haspopup={isSaved ? undefined : "dialog"}
        title={isSaved ? t("prompt.removeFromSaved") : t("prompt.addToCollection")}
        aria-label={isSaved ? t("prompt.removeFromSaved") : t("prompt.addToCollection")}
        className={cn(sharedClassName, isToggling && "opacity-60")}
      >
        <Bookmark size={size} fill={isSaved ? "currentColor" : "none"} strokeWidth={1.75} />
      </button>

      {modalOpen && (
        <SaveToCollectionModal
          {...(contentType === "workflow" ? { workflowId: id } : contentType === "generator" ? { generatorId: id } : { promptId: id })}
          onClose={() => setModalOpen(false)}
          onAdded={markSaved}
          onRemoved={markUnsaved}
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
