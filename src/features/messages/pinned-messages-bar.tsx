"use client";

import { useState } from "react";
import { List, Pin, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { messagePreviewText } from "./message-preview";
import type { PinnedItem } from "./use-pinned-messages";
import type { Message } from "@/types";

/**
 * Başlığın altındaki ince sabit-mesaj çubuğu (docs/history/174-*). Çubuğa dokunmak o mesaja götürür ve bir sonraki sabite geçer
 * (birden fazla sabit varsa sırayla gezilir); sağdaki simge tüm sabitlerin listesini açar. Sabitlemeyi kaldırma yalnız yetkilide görünür
 * — gerçek yetki sunucudadır. Hiç sabit yoksa hiçbir şey çizilmez.
 */
export function PinnedMessagesBar({
  items,
  canPin,
  senderLabel,
  onJump,
  onUnpin,
}: {
  items: readonly PinnedItem[];
  canPin: boolean;
  senderLabel: (senderId: string) => string;
  onJump: (message: Message) => void;
  onUnpin: (message: Message) => void;
}) {
  const { t, language } = useTranslation();
  const [cursor, setCursor] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  if (items.length === 0) return null;

  function handleUnpin(message: Message) {
    if (items.length <= 1) setListOpen(false);
    onUnpin(message);
  }

  const index = cursor % items.length;
  const current = items[index];

  return (
    <>
      <div data-pinned-bar className="flex items-center gap-1 border-b border-border-soft bg-surface px-2 py-1 lg:px-4">
        <button
          type="button"
          onClick={() => {
            onJump(current.message);
            setCursor(index + 1);
          }}
          aria-label={`${t("chat.pin.barLabel")}: ${messagePreviewText(current.message, t)}`}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md border-l-2 border-primary py-1 pl-2 pr-1 text-left transition-colors hover:bg-surface-soft"
        >
          <Pin size={14} className="shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 leading-tight">
            <span className="flex items-center gap-1.5 text-caption font-semibold text-primary">
              {t("chat.pin.barLabel")}
              {items.length > 1 && <span className="font-normal text-text-muted">{t("chat.pin.barPosition", { index: index + 1, total: items.length })}</span>}
            </span>
            <span className="block truncate text-small text-text-secondary">{messagePreviewText(current.message, t)}</span>
          </span>
        </button>
        {canPin && (
          <button
            type="button"
            onClick={() => handleUnpin(current.message)}
            aria-label={t("chat.pin.unpin")}
            title={t("chat.pin.unpin")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setListOpen(true)}
          aria-label={t("chat.pin.showAll")}
          title={t("chat.pin.showAll")}
          aria-haspopup="dialog"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
        >
          <List size={15} />
        </button>
      </div>
      {listOpen && (
        <Modal onClose={() => setListOpen(false)} labelledBy="pinned-list-title">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
              <h2 id="pinned-list-title" className="flex items-center gap-2 text-base font-semibold text-text">
                <Pin size={16} className="text-primary" aria-hidden /> {t("chat.pin.listTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                aria-label={t("common.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-5 pt-1">
              {items.map(({ pin, message }) => (
                <li key={pin.messageId} className="flex items-stretch gap-1 rounded-lg border border-border-soft bg-surface">
                  <button
                    type="button"
                    onClick={() => {
                      setListOpen(false);
                      onJump(message);
                    }}
                    aria-label={`${t("chat.pin.goTo")}: ${messagePreviewText(message, t)}`}
                    className={cn("min-w-0 flex-1 rounded-l-lg px-3 py-2 text-left transition-colors hover:bg-surface-soft")}
                  >
                    <span className="flex items-center gap-2 text-caption text-text-muted">
                      <span className="max-w-[10rem] truncate font-semibold text-text-secondary">{senderLabel(message.senderId)}</span>
                      <span>{formatRelativeTime(message.createdAt, language)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 break-words text-sm text-text">{messagePreviewText(message, t)}</span>
                  </button>
                  {canPin && (
                    <button
                      type="button"
                      onClick={() => handleUnpin(message)}
                      aria-label={t("chat.pin.unpin")}
                      title={t("chat.pin.unpin")}
                      className="flex w-10 shrink-0 items-center justify-center rounded-r-lg text-text-muted transition-colors hover:bg-surface-soft hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </>
  );
}
