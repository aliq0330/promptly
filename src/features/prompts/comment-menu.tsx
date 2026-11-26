"use client";

import { Bell } from "@/components/icons/bell";
import { BellOff } from "@/components/icons/bell-off";
import { Clock } from "@/components/icons/clock";
import { Flag } from "@/components/icons/flag";
import { Link2 } from "@/components/icons/link-2";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Pencil } from "@/components/icons/pencil";
import { Pin } from "@/components/icons/pin";
import { PinOff } from "@/components/icons/pin-off";
import { Trash2 } from "@/components/icons/trash-2";
import { PopoverMenu, type PopoverMenuItem } from "@/components/ui/popover-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useReport } from "@/features/moderation/report-provider";
import { applyMute, useIsMuted } from "@/features/notifications/mute-store";
import { commentLink } from "@/lib/comment-follow";
import { useTranslation } from "@/lib/i18n/language-provider";
import { copyTextToClipboard } from "@/lib/utils";
import type { PromptComment } from "@/types";
import type { CommentTree } from "./comment-node";

/**
 * Yorumun ⋮ menüsü (docs/history/452-*). Herkes için: bağlantıyı kopyala, düzenlenmişse düzenleme geçmişi, başlığı takip et, yazarın bildirimlerini
 * sessize al, şikâyet et. Kendi yorumunda ayrıca düzenle ve sil; içerik sahibinde (ana yorumda) sabitle / sabitlemeyi kaldır.
 * Her işlem mevcut tek yolu çağırır (sabitleme `set_comment_pinned`, silme iki adımlı onay, şikâyet merkezi pencere, sessize alma `mute-store`).
 */
export function CommentMenu({ comment, depth, tree, isOwn, isPinned }: { comment: PromptComment; depth: number; tree: CommentTree; isOwn: boolean; isPinned: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openReport } = useReport();
  const menu = tree.menu;
  const authorMute = useIsMuted("actor", user && !isOwn ? comment.author.id : null);
  const notify = menu?.notify;
  const follow = menu?.follow;
  const edited = Boolean(comment.editedAt);

  async function copyLink() {
    const ok = await copyTextToClipboard(commentLink(window.location.href, comment.id));
    if (ok) notify?.(t("comments.menu.linkCopied"));
  }

  async function toggleThread() {
    if (!follow) return;
    const next = await follow.toggleThread(comment.id);
    if (next !== null) notify?.(t(next ? "comments.follow.threadOn" : "comments.follow.threadOff"));
  }

  async function toggleMute() {
    const nextMuted = !authorMute.muted;
    try {
      await applyMute("actor", comment.author.id, comment.author.displayName, nextMuted);
      notify?.(t(nextMuted ? "comments.menu.muted" : "comments.menu.unmuted", { name: comment.author.displayName }));
    } catch (err) {
      console.error("applyMute", err);
    }
  }

  const items: PopoverMenuItem[] = [
    { key: "copy", label: t("comments.menu.copyLink"), icon: Link2, onSelect: () => void copyLink() },
    { key: "pin", label: isPinned ? t("comments.unpin") : t("comments.pin"), icon: isPinned ? PinOff : Pin, onSelect: () => tree.onTogglePin?.(comment.id), hidden: !tree.onTogglePin || depth !== 0 },
    { key: "edit", label: t("common.edit"), icon: Pencil, onSelect: () => tree.onStartEdit(comment), hidden: !isOwn },
    { key: "history", label: t("comments.menu.history"), icon: Clock, onSelect: () => menu?.openHistory(comment), hidden: !edited },
    {
      key: "follow",
      label: follow?.isThreadFollowed(comment.id) ? t("comments.menu.unfollowThread") : t("comments.menu.followThread"),
      icon: Bell,
      onSelect: () => void toggleThread(),
      hidden: depth !== 0 || !follow?.canFollow,
    },
    {
      key: "mute",
      label: authorMute.muted ? t("comments.menu.unmuteAuthor") : t("comments.menu.muteAuthor"),
      icon: BellOff,
      onSelect: () => void toggleMute(),
      hidden: isOwn || !user,
    },
    { key: "report", label: t("messages.reportAction"), icon: Flag, onSelect: () => openReport({ type: "comment", id: comment.id }), danger: true, hidden: isOwn || !user },
    { key: "delete", label: t("common.delete"), icon: Trash2, onSelect: () => tree.onRequestDelete(comment.id), danger: true, hidden: !isOwn },
  ];

  return (
    <PopoverMenu
      items={items}
      label={t("comments.menu")}
      trigger={<MoreVertical size={16} aria-hidden />}
      triggerClassName="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      className="-my-1.5 -mr-2"
    />
  );
}
