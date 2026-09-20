"use client";

import { useState } from "react";
import { CornerUpLeft, Flag } from "lucide-react";
import { SharedPromptCard, SharedRequestCard } from "./shared-content-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { fileReport } from "@/lib/supabase/reports";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Message } from "@/types";

export type DeleteMode = "everyone" | "me";

/** Compact inline report action for a message bubble — expands to a one-line reason field in place, since this app has no modal (Bölüm 9.2). */
function ReportMessageAction({ messageId }: { messageId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) return null;
  if (done) return <span>Şikayet edildi</span>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 hover:text-text">
        <Flag size={11} />
        Şikayet Et
      </button>
    );
  }

  async function handleSubmit() {
    if (!reason.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fileReport(user!.id, "message", messageId, reason);
      setDone(true);
    } catch (err) {
      console.error("fileReport", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Neden?"
        autoFocus
        className="h-6 w-28 rounded border border-border bg-surface px-1.5 text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button type="button" onClick={handleSubmit} disabled={!reason.trim() || isSubmitting} className="font-medium text-primary disabled:opacity-50">
        Gönder
      </button>
      <button type="button" onClick={() => setOpen(false)} className="hover:text-text">
        İptal
      </button>
    </div>
  );
}

export interface MessageBubbleActions {
  onStartReply: (message: Message) => void;
  onStartEdit: (message: Message) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string) => void;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  isSavingEdit: boolean;
  editError: string | null;
  onRequestDelete: (id: string, mode: DeleteMode) => void;
  onCancelDeleteConfirm: () => void;
  deleteConfirm: { id: string; mode: DeleteMode } | null;
  isDeletingId: string | null;
}

/**
 * One message bubble — plain text, a shared prompt/request card, or a
 * reply, in any combination. Deleted-for-everyone shows a placeholder but
 * keeps its place in the thread (Bölüm 9.5/9.7's safe-delete philosophy,
 * applied to messages: the row survives, only its content is gone).
 */
export function MessageBubble({
  message,
  isMe,
  replyPreview,
  isEditingHere,
  actions,
}: {
  message: Message;
  isMe: boolean;
  /** The message this one replies to, already looked up from the loaded thread — null if it replies to nothing, or that message fell outside the loaded page. */
  replyPreview: Message | null;
  isEditingHere: boolean;
  actions: MessageBubbleActions;
}) {
  const isDeleted = Boolean(message.deletedAt);
  const isConfirmingDeleteEveryone = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "everyone";
  const isConfirmingDeleteMe = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "me";
  const isDeletingHere = actions.isDeletingId === message.id;

  return (
    <div data-message-id={message.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
      {replyPreview && (
        <div
          className={cn(
            "mb-1 flex max-w-[75%] items-center gap-1 rounded-t-md border-l-2 border-primary bg-accent-surface/50 px-2 py-1 text-xs text-text-muted",
            isMe && "flex-row-reverse border-l-0 border-r-2 text-right",
          )}
        >
          <CornerUpLeft size={11} className="shrink-0" />
          <span className="truncate">
            {replyPreview.deletedAt
              ? "Silinmiş mesaj"
              : replyPreview.body ?? (replyPreview.sharedPromptId ? "Bir prompt" : "Bir istek")}
          </span>
        </div>
      )}

      {isDeleted ? (
        <div className="max-w-[75%] rounded-lg bg-accent-surface/40 px-3 py-2 text-sm italic text-text-muted">
          Bu mesaj silindi.
        </div>
      ) : isEditingHere ? (
        <div className="w-full max-w-[75%] space-y-1.5">
          <textarea
            value={actions.editDraft}
            onChange={(event) => actions.onEditDraftChange(event.target.value)}
            rows={2}
            autoFocus
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!actions.editDraft.trim() || actions.isSavingEdit}
              onClick={() => actions.onSubmitEdit(message.id)}
            >
              {actions.isSavingEdit ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={actions.onCancelEdit}>
              İptal
            </Button>
          </div>
          {actions.editError && <p className="text-xs text-red-500">{actions.editError}</p>}
        </div>
      ) : (
        <div className="flex max-w-[75%] flex-col gap-1.5">
          {message.sharedPromptId && <SharedPromptCard promptId={message.sharedPromptId} />}
          {message.sharedRequestId && <SharedRequestCard requestId={message.sharedRequestId} />}
          {message.body && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                isMe ? "bg-primary text-primary-foreground" : "bg-accent-surface text-text",
              )}
            >
              <p className="break-words">{message.body}</p>
            </div>
          )}
        </div>
      )}

      <div className={cn("mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted", isMe && "flex-row-reverse")}>
        <span>
          {formatRelativeTime(message.createdAt)}
          {message.editedAt && !isDeleted && " · düzenlendi"}
        </span>
        {!isDeleted && (
          <>
            <button type="button" onClick={() => actions.onStartReply(message)} className="font-medium hover:text-text">
              Yanıtla
            </button>
            {isMe && (
              <>
                <button type="button" onClick={() => actions.onStartEdit(message)} className="hover:text-text">
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => actions.onRequestDelete(message.id, "everyone")}
                  onBlur={actions.onCancelDeleteConfirm}
                  disabled={isDeletingHere}
                  className={cn("hover:text-text", isConfirmingDeleteEveryone && "font-medium text-red-600")}
                >
                  {isDeletingHere && actions.deleteConfirm?.mode === "everyone"
                    ? "Siliniyor..."
                    : isConfirmingDeleteEveryone
                      ? "Emin misin? Tekrar tıkla"
                      : "Herkesten sil"}
                </button>
              </>
            )}
            {!isMe && <ReportMessageAction messageId={message.id} />}
            <button
              type="button"
              onClick={() => actions.onRequestDelete(message.id, "me")}
              onBlur={actions.onCancelDeleteConfirm}
              disabled={isDeletingHere}
              className={cn("hover:text-text", isConfirmingDeleteMe && "font-medium text-red-600")}
            >
              {isDeletingHere && actions.deleteConfirm?.mode === "me"
                ? "Siliniyor..."
                : isConfirmingDeleteMe
                  ? "Emin misin? Tekrar tıkla"
                  : "Benden sil"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
