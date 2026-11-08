"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveRestore } from "@/components/icons/archive-restore";
import { BellOff } from "@/components/icons/bell-off";
import { Check } from "@/components/icons/check";
import { ChevronDown } from "@/components/icons/chevron-down";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Pin } from "@/components/icons/pin";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { RoomTree } from "./rooms/room-tree";
import { cn, formatRelativeTime, formatUnread, messageHref, roomsHubHref } from "@/lib/utils";
import { roomSlug } from "@/lib/community-rooms";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

const AVATAR_SIZE = 56;

export function ConversationRow({
  conversation,
  shareQuery,
  isActive,
  onUnarchive,
  unarchiveBusy,
  selection,
  onOpen,
  expandable = false,
}: {
  conversation: Conversation;
  /** Set by `/messages?sharePromptId=`/`?shareRequestId=` — appended so picking this conversation attaches the shared content there. */
  shareQuery?: string;
  /** The conversation currently open beside the list (tablet/desktop two-pane view). */
  isActive?: boolean;
  /** Only in the "Arşivlenenler" view: a one-tap way back to the inbox, beside the row's link. */
  onUnarchive?: () => void;
  unarchiveBusy?: boolean;
  /** Seçim modu: satır bağlantı olmaktan çıkar, dokununca seçilir/bırakılır; solda seçim halkası kayarak açılır. */
  selection?: { selected: boolean; onToggle: () => void };
  /** Mesajlar dock'u (docs/history/328-*): satır sayfaya götüren bir bağlantı değil, sohbeti panelde açan bir düğme olur. */
  onOpen?: (conversation: Conversation) => void;
  /** İki bölmeli masaüstü paneli (docs/history/352-*): topluluk satırının altında oda ağacı açılır; ok, oda listesi bağlantısı yerine ağacı açıp kapatır. */
  expandable?: boolean;
}) {
  const { t, language } = useTranslation();
  const participant = conversation.participants[0];
  const group = conversation.group;
  const title = group ? group.name : participant?.displayName;
  const muted = Boolean(conversation.mutedAt);
  const selecting = selection !== undefined;
  const selected = selection?.selected === true;
  const [treeOpen, setTreeOpen] = useState<boolean | null>(null);
  // Sol panel telefonda gizlidir (`hidden md:flex`) ama bağlıdır: oda ağacı yalnız görünür olduğunda yüklenir/çizilir.
  const paneVisible = useMediaQuery("(min-width: 768px)");
  const unread = conversation.unreadCount > 0;
  const pinned = Boolean(conversation.pinnedAt);
  const lastRoom = group ? conversation.lastRoom : null;

  const content = (
    <>
      {/* Seçim halkası: genişlik 0 → 40 px geçişiyle satırı sağa iter (WhatsApp tarzı). */}
      <span aria-hidden className={cn("flex shrink-0 items-center overflow-hidden transition-[width] duration-200 ease-soft", selecting ? "w-10" : "w-0")}>
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200 ease-soft",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-transparent",
          )}
        >
          {selected && <Check size={15} strokeWidth={3} />}
        </span>
      </span>
      <span className="py-2.5 pr-3">
        {group ? (
          <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={AVATAR_SIZE} badge />
        ) : (
          <PresenceAvatar userId={participant?.id} src={participant?.avatarUrl} alt={participant?.displayName ?? t("common.genericUser")} size={AVATAR_SIZE} />
        )}
      </span>
      {/* Ayırıcı çizgi yalnız metin sütunundan başlar (avatarın altı boş kalır). */}
      <span className="flex min-h-[76px] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border-soft py-2.5 pr-4">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-body tracking-[-0.01em] text-text", unread ? "font-bold" : "font-semibold")}>{title}</span>
            {muted && <BellOff size={12} className="shrink-0 text-text-muted" aria-label={t("groups.about.muteLabel")} />}
          </span>
          <span className={cn("shrink-0 text-caption tabular-nums", unread ? "font-semibold text-text" : "text-text-muted")}>
            {formatRelativeTime(conversation.lastMessageAt, language)}
          </span>
        </span>
        <span className="flex items-start justify-between gap-2">
          <span className={cn("line-clamp-2 min-w-0 flex-1 break-words text-small", unread ? "font-medium text-text" : "text-text-muted")}>
            {group?.team && <span data-team-tag className="font-bold text-primary">{group.team.name} · </span>}
            {lastRoom && <span data-last-room className="font-bold text-primary"># {roomSlug(lastRoom.name)} </span>}
            {conversation.lastMessage}
          </span>
          {pinned && !unread && <Pin size={14} className="mt-1 shrink-0 text-text-muted" aria-label={t("rooms.list.pinned")} />}
          {unread && (
            <span
              className={cn(
                "mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                muted ? "bg-border-strong text-text" : "bg-primary text-primary-foreground",
              )}
            >
              {formatUnread(conversation.unreadCount)}
            </span>
          )}
        </span>
      </span>
    </>
  );

  // Meydan düz liste (WhatsApp tarzı): kutusuz, tam genişlikte satırlar; açık sohbet ve seçili satır dolgulu zemin alır.
  const rowClass = cn(
    "flex items-stretch pl-4 text-left transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
    selected ? "bg-primary-soft" : isActive ? "bg-primary-soft" : "hover:bg-surface-soft",
  );

  return (
    <div>
    <div className="flex items-stretch">
      {selecting ? (
        <button type="button" role="checkbox" aria-checked={selected} aria-label={title} onClick={selection.onToggle} data-conversation-row className={cn(rowClass, "min-w-0 flex-1")}>
          {content}
        </button>
      ) : onOpen ? (
        <button type="button" onClick={() => onOpen(conversation)} aria-current={isActive ? "true" : undefined} data-conversation-row className={cn(rowClass, "min-w-0 flex-1")}>
          {content}
        </button>
      ) : (
        <Link
          href={shareQuery ? `${messageHref(conversation)}&${shareQuery}` : messageHref(conversation)}
          aria-current={isActive ? "page" : undefined}
          data-conversation-row
          className={cn(rowClass, "min-w-0 flex-1")}
        >
          {content}
        </Link>
      )}
      {group && expandable && !onOpen && !selecting && !onUnarchive && (
        <button
          type="button"
          onClick={() => setTreeOpen(!(treeOpen ?? Boolean(isActive)))}
          aria-expanded={treeOpen ?? Boolean(isActive)}
          aria-label={(treeOpen ?? Boolean(isActive)) ? t("rooms.tree.collapse") : t("rooms.tree.expand")}
          data-toggle-rooms
          className="flex w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {(treeOpen ?? Boolean(isActive)) ? <ChevronDown size={22} aria-hidden /> : <ChevronRight size={22} aria-hidden />}
        </button>
      )}
      {group && !expandable && !onOpen && !selecting && !onUnarchive && (
        <Link
          href={roomsHubHref(group.id)}
          aria-label={t("rooms.list.openRooms", { name: group.name })}
          data-open-rooms
          className={cn("flex w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", isActive && "bg-primary-soft")}
        >
          <ChevronRight size={22} aria-hidden />
        </Link>
      )}
      {onUnarchive && !selecting && (
        <button
          type="button"
          onClick={onUnarchive}
          disabled={unarchiveBusy}
          aria-label={`${t("messages.unarchive")}: ${title ?? ""}`}
          title={t("messages.unarchive")}
          className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
        >
          <ArchiveRestore size={16} />
        </button>
      )}
    </div>
    {group && expandable && paneVisible && !selecting && !onOpen && (treeOpen ?? Boolean(isActive)) && <RoomTree communityId={group.id} isActiveConversation={Boolean(isActive)} />}
    </div>
  );
}
