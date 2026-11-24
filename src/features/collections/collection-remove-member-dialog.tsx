"use client";

import { OptionGroup } from "@/components/ui/option-group";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { removeCollectionMember, type CollectionMember } from "@/lib/supabase/collection-members";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ortağı çıkar (sahip) ya da ortaklıktan ayrıl (kişinin kendisi) — docs/history/386-*. Bir içeriği yalnız onu ekleyen kaldırabildiği için,
 * kişinin eklediği içerikler için ne olacağı burada sorulur: koleksiyonda kalır (sahibe geçer) ya da kişiyle birlikte kaldırılır.
 */
export function RemoveMemberDialog({
  collectionId,
  member,
  self,
  onClose,
  onDone,
}: {
  collectionId: string;
  member: CollectionMember;
  /** Kişinin kendisi ayrılıyor (başlık/metin/düğme değişir). */
  self: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [removeItems, setRemoveItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeCollectionMember(collectionId, member.userId, removeItems);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("common.actionFailedRetry"));
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      id={id}
      overLayers
      title={self ? t("collab.leaveTitle") : t("collab.removeTitle", { name: member.displayName })}
      body={self ? t("collab.leaveBody", { count: member.itemCount }) : t("collab.removeBody", { name: member.displayName, count: member.itemCount })}
      confirmLabel={self ? t("collab.leaveConfirm") : t("collab.removeConfirm")}
      danger
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {member.itemCount > 0 && (
        <div data-remove-member-options="">
          <OptionGroup<"keep" | "remove">
            ariaLabel={t("collab.keepItems")}
            value={removeItems ? "remove" : "keep"}
            disabled={busy}
            onChange={(key) => setRemoveItems(key === "remove")}
            options={[
              { key: "keep", label: t("collab.keepItems"), description: t("collab.keepItemsHint") },
              { key: "remove", label: t("collab.removeItemsOption"), description: t("collab.removeItemsHint", { count: member.itemCount }) },
            ]}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}
