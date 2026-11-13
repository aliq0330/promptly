"use client";

import { X } from "@/components/icons/x";
import { Modal } from "@/components/ui/modal";
import { CollectionForm } from "./collection-form";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection } from "@/types";
import { iconButtonClassName } from "@/components/ui/icon-button";

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
  const { t } = useTranslation();
  const isEdit = Boolean(collection);

  return (
    <Modal onClose={onClose} labelledBy="collection-form-modal-title">
      <div
        className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="collection-form-modal-title" className="min-w-0 text-body font-semibold text-text">
            {isEdit ? t("collection.editTitle") : t("collection.createNewTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-8 w-8 rounded-md")}>
            <X size={18} />
          </button>
        </div>

        <CollectionForm
          initialName={collection?.name}
          initialVisibility={collection?.visibility}
          submitLabel={isEdit ? t("common.save") : t("common.create")}
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </Modal>
  );
}
