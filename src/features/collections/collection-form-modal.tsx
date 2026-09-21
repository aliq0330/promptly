"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
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
  const isEdit = Boolean(collection);

  return (
    <Modal onClose={onClose} labelledBy="collection-form-modal-title">
      <div
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 id="collection-form-modal-title" className="text-base font-semibold text-text">
              {isEdit ? "Koleksiyonu düzenle" : "Yeni koleksiyon oluştur"}
            </h2>
            {collection?.isDefault && <Badge variant="accent">Varsayılan</Badge>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>
        {collection?.isDefault && (
          <p className="text-xs text-text-muted">
            Bu senin varsayılan koleksiyonun — adını ve gizliliğini değiştirebilirsin, ama silinemez.
          </p>
        )}

        <CollectionForm
          initialName={collection?.name}
          initialVisibility={collection?.visibility}
          submitLabel={isEdit ? "Kaydet" : "Oluştur"}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </Modal>
  );
}
