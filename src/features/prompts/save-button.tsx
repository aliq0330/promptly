"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSaveState } from "./use-save-state";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";

/**
 * Kaydet — opens the "Koleksiyona ekle" modal instead of toggling directly
 * (CLAUDE.md koleksiyon modülü). The icon's filled state still reflects the
 * existing, unchanged general bookmark (`prompt_saves`, CLAUDE.md Bölüm 21
 * Faz 3) — adding a work to any collection also saves it generally (see
 * `addItemToCollection`), so this fills in naturally once the user adds the
 * work to at least one collection.
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
  const { isSaved: fetchedIsSaved, canSave } = useSaveState(promptId);
  const [modalOpen, setModalOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const isSaved = fetchedIsSaved || justAdded;

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

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setModalOpen(true);
        }}
        aria-pressed={isSaved}
        aria-haspopup="dialog"
        title="Koleksiyona ekle"
        className={sharedClassName}
      >
        <Bookmark size={size} fill={isSaved ? "currentColor" : "none"} />
      </button>
      {modalOpen && (
        <SaveToCollectionModal
          promptId={promptId}
          onClose={() => setModalOpen(false)}
          onAdded={() => setJustAdded(true)}
        />
      )}
    </>
  );
}
