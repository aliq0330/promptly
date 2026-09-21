"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { CollectionForm } from "./collection-form";
import type { Collection } from "@/types";

/**
 * Standalone create/edit modal — used from the profile page's "+ Koleksiyon
 * oluştur" (no `collection` prop, creates a genuinely empty collection, no
 * item ever auto-added — see SaveToCollectionModal for the "create while
 * saving a work" flow, which is a different, embedded use of the same
 * CollectionForm) and from a collection card's "Koleksiyonu düzenle".
 */
export function CollectionFormModal({
  collection,
  onClose,
  onSubmit,
}: {
  /** Present → edit mode (fields pre-filled, "Kaydet"); absent → create mode ("Oluştur"). */
  collection?: Collection;
  onClose: () => void;
  onSubmit: (values: { name: string; visibility: "public" | "private" }) => Promise<void>;
}) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const isEdit = Boolean(collection);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-form-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="collection-form-modal-title" className="text-base font-semibold text-text">
            {isEdit ? "Koleksiyonu düzenle" : "Yeni koleksiyon oluştur"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <CollectionForm
          initialName={collection?.name}
          initialVisibility={collection?.visibility}
          submitLabel={isEdit ? "Kaydet" : "Oluştur"}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
