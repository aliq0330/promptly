"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Clock, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { fetchMessageReceipts, toChatFeatureError } from "@/lib/supabase/chat-features";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { messagePreviewText } from "./message-preview";
import type { Message, MessageReceipt } from "@/types";

/**
 * "Mesaj bilgisi" (docs/history/174-*): grup sohbetinde KENDİ mesajımı kimlerin okuduğunu ve okumadığını gösterir. Veri sunucu
 * RPC'sindendir (`message_read_receipts`): yalnız mesajın göndericisine döner, gönderen listede yoktur, mesajı görme hakkı olmayanlar
 * (katılmadan önceki mesaj, geçmiş kapalıyken) "okumadı" diye sayılmaz, gruptan ayrılanların verisi üyelikle birlikte gittiği için
 * görünmez. Okuma zamanı, kişinin sohbeti bu mesaja kadar görüntülediği andır (mesaj-başı kayıt tutulmaz, üye başına tek imleç vardır).
 */
export function MessageInfoModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; receipts: MessageReceipt[] }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchMessageReceipts(message.id)
      .then((receipts) => {
        if (!cancelled) setState({ status: "ready", receipts });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("fetchMessageReceipts", err);
        setState({ status: "error", message: toChatFeatureError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [message.id]);

  const readers = state.status === "ready" ? state.receipts.filter((r) => r.hasRead) : [];
  const pending = state.status === "ready" ? state.receipts.filter((r) => !r.hasRead) : [];

  return (
    <Modal onClose={onClose} labelledBy="message-info-title">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id="message-info-title" className="text-base font-semibold text-text">
              {t("chat.msgInfo.title")}
            </h2>
            <p className="mt-1 line-clamp-2 break-words text-small text-text-muted">{messagePreviewText(message, t)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-2" data-message-info>
          {state.status === "loading" && <p className="py-4 text-center text-sm text-text-muted">{t("common.loading")}</p>}
          {state.status === "error" && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {state.message || t("chat.msgInfo.loadFailed")}
            </p>
          )}
          {state.status === "ready" && state.receipts.length === 0 && <p className="py-4 text-center text-sm text-text-muted">{t("chat.msgInfo.empty")}</p>}
          {readers.length > 0 && (
            <section aria-labelledby="receipts-read">
              <h3 id="receipts-read" className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-text">
                <CheckCheck size={14} className="text-primary" aria-hidden /> {t("chat.msgInfo.readBy")} ({readers.length})
              </h3>
              <ul className="space-y-1">
                {readers.map((r) => (
                  <li key={r.userId} data-receipt-read className="flex items-center gap-3 rounded-md px-1 py-1.5">
                    <Avatar src={r.avatarUrl} alt={r.displayName} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{r.displayName}</span>
                      {r.readAt && <span className="block text-caption text-text-muted">{t("chat.msgInfo.readAt", { time: formatRelativeTime(r.readAt, language) })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pending.length > 0 && (
            <section aria-labelledby="receipts-unread">
              <h3 id="receipts-unread" className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-text">
                <Clock size={14} className="text-text-muted" aria-hidden /> {t("chat.msgInfo.notRead")} ({pending.length})
              </h3>
              <ul className="space-y-1">
                {pending.map((r) => (
                  <li key={r.userId} data-receipt-unread className="flex items-center gap-3 rounded-md px-1 py-1.5">
                    <Avatar src={r.avatarUrl} alt={r.displayName} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{r.displayName}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {state.status === "ready" && state.receipts.length > 0 && <p className="text-caption text-text-muted">{t("chat.msgInfo.note")}</p>}
        </div>
      </div>
    </Modal>
  );
}
