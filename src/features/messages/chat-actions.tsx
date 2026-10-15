"use client";

import { Archive, ArchiveRestore, Eraser, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export type ChatConfirmKind = "delete" | "clear";

const itemClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-soft disabled:opacity-50";

/**
 * The chat actions of an accepted conversation — Arşivle / Arşivden çıkar,
 * Sohbeti sil, Mesajları temizle. Rendered as leading items of the thread
 * header's existing "⋮" menu (`ProfileMoreMenu extraItems`), so there is one
 * menu, not two. Archive/unarchive act immediately (they are reversible and
 * delete nothing); delete and clear ask for confirmation first.
 */
export function ChatActionItems({
  conversation,
  busy,
  onToggleArchive,
  onAsk,
  close,
}: {
  /** `conversation.kind === "group"` ise "Sohbeti sil" yerine "Listemden kaldır" yazar (grup SİLİNMEZ; yalnız kişisel liste). */
  conversation: Conversation;
  busy: boolean;
  onToggleArchive: () => void;
  onAsk: (kind: ChatConfirmKind) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const archived = Boolean(conversation.archivedAt);
  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          close();
          onToggleArchive();
        }}
        className={cn(itemClass, "text-text")}
      >
        {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        {archived ? t("messages.unarchive") : t("messages.archive")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          close();
          onAsk("clear");
        }}
        className={cn(itemClass, "text-text")}
      >
        <Eraser size={14} />
        {t("messages.clearHistory")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          close();
          onAsk("delete");
        }}
        className={cn(itemClass, "text-danger")}
      >
        <Trash2 size={14} />
        {conversation.kind === "group" ? t("groups.chat.hideFromList") : t("messages.deleteChat")}
      </button>
    </>
  );
}

/** Confirmation for the two actions that remove something from the viewer's own view. Says exactly what happens — and what does not. */
export function ChatConfirmModal({
  kind,
  isGroup = false,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  kind: ChatConfirmKind;
  /** Grup sohbeti: metinler "diğer üyeler" der ve eylem grubu değil yalnız kişisel görünümü etkiler. */
  isGroup?: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const title = kind === "delete" ? (isGroup ? t("groups.chat.hideFromList") : t("messages.deleteChat")) : t("messages.clearHistory");
  const body =
    kind === "delete"
      ? isGroup
        ? t("groups.chat.hideFromListConfirm")
        : t("messages.deleteChatConfirm")
      : isGroup
        ? t("groups.chat.clearHistoryConfirm")
        : t("messages.clearHistoryConfirm");
  return (
    <Modal onClose={busy ? () => undefined : onCancel} labelledBy="chat-confirm-title">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <h2 id="chat-confirm-title" className="text-base font-semibold text-text">
          {title}
        </h2>
        <p className="text-small text-text-secondary">{body}</p>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant={kind === "delete" ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? t("common.loading") : title}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
