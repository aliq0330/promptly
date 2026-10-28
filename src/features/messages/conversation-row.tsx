"use client";

import Link from "next/link";
import { ArchiveRestore, BellOff, Check } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { cn, formatRelativeTime, formatUnread, messageHref } from "@/lib/utils";
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
}) {
  const { t, language } = useTranslation();
  const participant = conversation.participants[0];
  const group = conversation.group;
  const title = group ? group.name : participant?.displayName;
  const muted = Boolean(conversation.mutedAt);
  const selecting = selection !== undefined;
  const selected = selection?.selected === true;
  const unread = conversation.unreadCount > 0;

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
          <Avatar src={participant?.avatarUrl} alt={participant?.displayName ?? t("common.genericUser")} size={AVATAR_SIZE} />
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
          <span className={cn("line-clamp-2 min-w-0 flex-1 break-words text-small", unread ? "font-medium text-text" : "text-text-muted")}>{conversation.lastMessage}</span>
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
    <div className="flex items-stretch">
      {selecting ? (
        <button type="button" role="checkbox" aria-checked={selected} aria-label={title} onClick={selection.onToggle} data-conversation-row className={cn(rowClass, "min-w-0 flex-1")}>
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
  );
}
