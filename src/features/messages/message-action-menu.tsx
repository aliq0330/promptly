"use client";

import { CheckCheck, Copy, CornerUpLeft, Flag, Pencil, Pin, PinOff, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useReport } from "@/features/moderation/report-provider";
import { cn } from "@/lib/utils";
import { formatMessageStamp } from "@/lib/chat-grouping";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Message } from "@/types";
import type { DeleteMode, MessageBubbleActions } from "./message-bubble-types";

/** "Şikayet Et": merkezi şikâyet penceresini açar (docs/history/284-*); menü kapansa da pencere `ReportProvider`'da yaşar. */
function ReportMessageMenuItem({ messageId, preview, onClose }: { messageId: string; preview: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openReport } = useReport();
  if (!user) return null;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        openReport({ type: "message", id: messageId, title: preview });
        // The long-press sheet covers the screen: close it so the report window is not hidden behind it.
        onClose();
      }}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-soft"
    >
      <Flag size={14} />
      {t("messages.reportAction")}
    </button>
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
 * The action list of the long-press / "⋮" sheet for one message bubble (`MessageActionSheet`, docs/history/290-*) — Aşama 3/4's two option sets,
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
  canEditOrDelete,
  actions,
  onReply,
  onClose,
}: {
  message: Message;
  isMe: boolean;
  canEditOrDelete: boolean;
  actions: MessageBubbleActions;
  onReply: () => void;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const isConfirmingDeleteEveryone = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "everyone";
  const isConfirmingDeleteMe = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "me";
  const isConfirmingModerate = actions.deleteConfirm?.id === message.id && actions.deleteConfirm.mode === "moderator";
  const isDeletingHere = actions.isDeletingId === message.id;

  function requestDelete(mode: DeleteMode) {
    actions.onRequestDelete(message.id, mode);
  }

  return (
    <div
      role="menu"
      aria-label={t("messages.messageOptionsAriaLabel")}
      className={cn(
        "w-60 max-w-full origin-top overflow-hidden rounded-3xl bg-surface-elevated/90 py-1.5 shadow-pop backdrop-blur-xl animate-pop-in",
        // Larger touch targets than the old small popover: rows and icons are sized here once, not per item.
        "[&_[role=menuitem]]:gap-3.5 [&_[role=menuitem]]:px-4 [&_[role=menuitem]]:py-3 [&_[role=menuitem]]:text-base [&_[role=menuitem]_svg]:size-5",
      )}
    >
      <div className="px-4 pb-1 pt-2 text-caption font-medium uppercase tracking-wide text-text-muted">
        {formatMessageStamp(message.createdAt, language)}
      </div>
      <MenuItem
        icon={<CornerUpLeft size={14} />}
        label={t("request.reply")}
        onClick={() => {
          onReply();
          onClose();
        }}
      />
      {actions.onToggleStar && (
        <MenuItem
          icon={<Star size={14} className={actions.isStarred?.(message.id) ? "fill-current text-warning" : undefined} />}
          label={actions.isStarred?.(message.id) ? t("chat.star.unstar") : t("chat.star.star")}
          onClick={() => {
            actions.onToggleStar?.(message);
            onClose();
          }}
        />
      )}
      {actions.canPin && actions.onTogglePin && (
        <MenuItem
          icon={actions.isPinned?.(message.id) ? <PinOff size={14} /> : <Pin size={14} />}
          label={actions.isPinned?.(message.id) ? t("chat.pin.unpin") : t("chat.pin.pin")}
          onClick={() => {
            actions.onTogglePin?.(message);
            onClose();
          }}
        />
      )}
      {actions.onCopy && message.body && (
        <MenuItem
          icon={<Copy size={14} />}
          label={t("common.copy")}
          onClick={() => {
            actions.onCopy?.(message);
            onClose();
          }}
        />
      )}
      {isMe && actions.onShowInfo && (
        <MenuItem
          icon={<CheckCheck size={14} />}
          label={t("chat.msgInfo.action")}
          onClick={() => {
            actions.onShowInfo?.(message);
            onClose();
          }}
        />
      )}

      {isMe ? (
        <>
          {canEditOrDelete && (
            <MenuItem
              icon={<Pencil size={14} />}
              label={t("common.edit")}
              onClick={() => {
                actions.onStartEdit(message);
                onClose();
              }}
            />
          )}
          <MenuItem
            icon={<Trash2 size={14} />}
            label={isDeletingHere && actions.deleteConfirm?.mode === "me" ? t("messages.deletingEllipsis") : isConfirmingDeleteMe ? t("common.confirmDelete") : t("messages.deleteForMe")}
            onClick={() => requestDelete("me")}
            onBlur={actions.onCancelDeleteConfirm}
            disabled={isDeletingHere}
          />
          {canEditOrDelete && (
            <MenuItem
              icon={<Trash2 size={14} />}
              label={
                isDeletingHere && actions.deleteConfirm?.mode === "everyone"
                  ? t("messages.deletingEllipsis")
                  : isConfirmingDeleteEveryone
                    ? t("common.confirmDelete")
                    : t("messages.deleteForEveryone")
              }
              onClick={() => requestDelete("everyone")}
              onBlur={actions.onCancelDeleteConfirm}
              disabled={isDeletingHere}
              danger
            />
          )}
          {!canEditOrDelete && (
            <div className="border-t border-border px-3 py-2 text-xs text-text-muted">
              <p>{t("messages.editWindowExpired")}</p>
              <p>{t("messages.deleteForEveryoneWindowExpired")}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <ReportMessageMenuItem messageId={message.id} preview={message.body ? message.body.slice(0, 120) : null} onClose={onClose} />
          {actions.onReportToStaff && !message.deletedAt && (
            <MenuItem
              icon={<Flag size={14} />}
              label={t("communities.report.toStaff")}
              onClick={() => {
                actions.onReportToStaff?.(message);
                onClose();
              }}
            />
          )}
          <MenuItem
            icon={<Trash2 size={14} />}
            label={isDeletingHere && actions.deleteConfirm?.mode === "me" ? t("messages.deletingEllipsis") : isConfirmingDeleteMe ? t("common.confirmDelete") : t("messages.deleteForMe")}
            onClick={() => requestDelete("me")}
            onBlur={actions.onCancelDeleteConfirm}
            disabled={isDeletingHere}
          />
          {actions.canModerate?.(message) && (
            <MenuItem
              icon={<ShieldAlert size={14} />}
              label={
                isDeletingHere && actions.deleteConfirm?.mode === "moderator"
                  ? t("messages.deletingEllipsis")
                  : isConfirmingModerate
                    ? t("common.confirmDelete")
                    : t("groups.chat.deleteAsModerator")
              }
              onClick={() => requestDelete("moderator")}
              onBlur={actions.onCancelDeleteConfirm}
              disabled={isDeletingHere}
              danger
            />
          )}
        </>
      )}
    </div>
  );
}
