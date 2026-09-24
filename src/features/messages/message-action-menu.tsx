"use client";

import { useState, type RefObject } from "react";
import { CornerUpLeft, Flag, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { fileReport } from "@/lib/supabase/reports";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import type { DeleteMode, MessageBubbleActions } from "./message-bubble-types";

/** Compact inline "Şikayet Et" — this app has no modal (Bölüm 9.2), so it expands into a one-line reason field inside the menu itself instead of opening a second layer. */
function ReportMessageMenuItem({ messageId }: { messageId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) return null;
  if (done) {
    return <p className="px-3 py-2 text-sm text-text-muted">Şikayet edildi.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-soft"
      >
        <Flag size={14} />
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
    <div className="space-y-1.5 px-3 py-2">
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Neden?"
        autoFocus
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={handleSubmit} disabled={!reason.trim() || isSubmitting} className="font-medium text-primary disabled:opacity-50">
          Gönder
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text">
          İptal
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  onBlur,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-soft disabled:pointer-events-none disabled:opacity-60",
        danger ? "text-danger hover:bg-danger/10" : "text-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * The "⋮" popover for one message bubble — Aşama 3/4's two option sets,
 * decided purely from `message.senderId === currentUserId` (never from
 * which side of the screen the bubble renders on, per Aşama 4's explicit
 * warning). `canEditOrDelete` is computed by the caller from a live-ticking
 * clock while this menu is open (Aşama 5's "menü açıkken süre dolarsa
 * güncellensin"), so Düzenle/Herkesten sil disappear here — not as a
 * disabled button, entirely removed — the instant the 15-minute window
 * closes, without a page reload.
 */
export function MessageActionMenu({
  message,
  isMe,
  align,
  canEditOrDelete,
  actions,
  onReply,
  onClose,
  panelRef,
}: {
  message: Message;
  isMe: boolean;
  align: "left" | "right";
  canEditOrDelete: boolean;
  actions: MessageBubbleActions;
  onReply: () => void;
  onClose: () => void;
  /** Attached to the root so `usePopoverAlign` can measure it against the viewport and flip sides if it would overflow. */
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const isConfirmingDeleteEveryone = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "everyone";
  const isConfirmingDeleteMe = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "me";
  const isDeletingHere = actions.isDeletingId === message.id;

  function requestDelete(mode: DeleteMode) {
    actions.onRequestDelete(message.id, mode);
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Mesaj seçenekleri"
      className={cn(
        "absolute top-full z-30 mt-1.5 w-52 overflow-hidden rounded-md border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      <MenuItem
        icon={<CornerUpLeft size={14} />}
        label="Yanıtla"
        onClick={() => {
          onReply();
          onClose();
        }}
      />

      {isMe ? (
        <>
          {canEditOrDelete && (
            <MenuItem
              icon={<Pencil size={14} />}
              label="Düzenle"
              onClick={() => {
                actions.onStartEdit(message);
                onClose();
              }}
            />
          )}
          <MenuItem
            icon={<Trash2 size={14} />}
            label={isDeletingHere && actions.deleteConfirm?.mode === "me" ? "Siliniyor..." : isConfirmingDeleteMe ? "Emin misin? Tekrar tıkla" : "Benden sil"}
            onClick={() => requestDelete("me")}
            onBlur={actions.onCancelDeleteConfirm}
            disabled={isDeletingHere}
          />
          {canEditOrDelete && (
            <MenuItem
              icon={<Trash2 size={14} />}
              label={
                isDeletingHere && actions.deleteConfirm?.mode === "everyone"
                  ? "Siliniyor..."
                  : isConfirmingDeleteEveryone
                    ? "Emin misin? Tekrar tıkla"
                    : "Herkesten sil"
              }
              onClick={() => requestDelete("everyone")}
              onBlur={actions.onCancelDeleteConfirm}
              disabled={isDeletingHere}
              danger
            />
          )}
          {!canEditOrDelete && (
            <div className="border-t border-border px-3 py-2 text-xs text-text-muted">
              <p>Düzenleme süresi doldu.</p>
              <p>Herkesten silme süresi doldu.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <ReportMessageMenuItem messageId={message.id} />
          <MenuItem
            icon={<Trash2 size={14} />}
            label={isDeletingHere && actions.deleteConfirm?.mode === "me" ? "Siliniyor..." : isConfirmingDeleteMe ? "Emin misin? Tekrar tıkla" : "Benden sil"}
            onClick={() => requestDelete("me")}
            onBlur={actions.onCancelDeleteConfirm}
            disabled={isDeletingHere}
          />
        </>
      )}
    </div>
  );
}
