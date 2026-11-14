"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { removeCollectionMember, type CollectionMember } from "@/lib/supabase/collection-members";
import { cn } from "@/lib/utils";
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
        <div role="radiogroup" aria-label={t("collab.keepItems")} className="space-y-2" data-remove-member-options="">
          <Option selected={!removeItems} title={t("collab.keepItems")} hint={t("collab.keepItemsHint")} onSelect={() => setRemoveItems(false)} disabled={busy} />
          <Option selected={removeItems} title={t("collab.removeItemsOption")} hint={t("collab.removeItemsHint", { count: member.itemCount })} onSelect={() => setRemoveItems(true)} disabled={busy} />
        </div>
      )}
    </ConfirmDialog>
  );
}

function Option({ selected, title, hint, onSelect, disabled }: { selected: boolean; title: string; hint: string; onSelect: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn("flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors", selected ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-soft")}
    >
      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-border-strong")}>
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-small font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-caption text-text-muted">{hint}</span>
      </span>
    </button>
  );
}
