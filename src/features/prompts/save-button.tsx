"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/utils";
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
 */
export function SaveButton({
  promptId,
  size = 14,
  className,
}: {
  promptId: string;
  size?: number;
  className?: string;
}) {
  const { isSaved, unsave, markSaved, isToggling, canSave } = useSaveState(promptId);
  const [modalOpen, setModalOpen] = useState(false);
  const [showRemovedToast, setShowRemovedToast] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const sharedClassName = cn(
    "flex items-center rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
    isSaved ? "text-primary" : "text-text-muted",
    className,
  );

  if (!canSave) {
    return (
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        title="Kaydetmek için giriş yapmalısın"
        className={sharedClassName}
      >
        <Bookmark size={size} />
      </Link>
    );
  }

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isToggling) return;

    if (isSaved) {
      const removed = await unsave();
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
        title={isSaved ? "Kaydedilenlerden çıkar" : "Koleksiyona ekle"}
        className={cn(sharedClassName, isToggling && "opacity-60")}
      >
        <Bookmark size={size} fill={isSaved ? "currentColor" : "none"} />
      </button>

      {modalOpen && (
        <SaveToCollectionModal promptId={promptId} onClose={() => setModalOpen(false)} onAdded={markSaved} />
      )}

      {showRemovedToast && (
        <Portal>
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6"
          >
            <div className="rounded-md bg-text px-3 py-2 text-sm text-background shadow-lg">
              Kaydedilenlerden kaldırıldı.
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
