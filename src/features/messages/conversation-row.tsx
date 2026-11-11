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
import { TeamMark } from "@/features/teams/team-ui";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { memberCountText } from "@/lib/group-labels";
import { RoomTree } from "./rooms/room-tree";
import { cn, formatRelativeTime, formatUnread, messageHref } from "@/lib/utils";
import { communityHubHref, teamHubHref } from "@/lib/team-chat";
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
  showKindTag = false,
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
  /** "Tümü" görünümünde ekip/topluluk satırının adının yanında EKİP / TOPLULUK etiketi (Yön A, docs/history/353-*). */
  showKindTag?: boolean;
}) {
  const { t, language } = useTranslation();
  const participant = conversation.participants[0];
  const group = conversation.group;
  const team = group?.team ?? null;
  // Ekip satırında başlık ekibin adıdır (kanalın adı değil); kanal adı ikinci satırda "# kanal" olarak görünür.
  const title = team ? team.name : group ? group.name : participant?.displayName;
  const muted = Boolean(conversation.mutedAt);
  const selecting = selection !== undefined;
  const selected = selection?.selected === true;
  const [treeOpen, setTreeOpen] = useState<boolean | null>(null);
  // Sol panel telefonda gizlidir (`hidden md:flex`) ama bağlıdır: oda ağacı yalnız görünür olduğunda yüklenir/çizilir.
  const paneVisible = useMediaQuery("(min-width: 768px)");
  const unread = conversation.unreadCount > 0;
  const pinned = Boolean(conversation.pinnedAt);
  const lastRoom = group ? conversation.lastRoom : null;
  // Ekip (kanallar toplanmış) ve topluluk satırı bir SAYFAYA açılır (docs/history/369-*): kanallar/odalar orada listelenir. Paylaşım modunda (`shareQuery`) doğrudan sohbet açılır.
  const rollup = team ? conversation.teamRollup : undefined;
  const opensHub = !shareQuery && !onOpen && ((team && Boolean(rollup)) || (group && !team));
  const hubHref = opensHub ? (team ? teamHubHref(team.id) : communityHubHref(group!.id)) : null;
  const names = rollup ? [...rollup.names, ...(rollup.extraNames > 0 ? [t("th.row.moreNames", { count: rollup.extraNames })] : [])].join(", ") : "";

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
        {opensHub ? (
          // Üst üste binen iki soluk katman: "birden çok sohbet tek satırda" (WhatsApp Toplulukları).
          <span data-stacked-mark className="relative ml-2 inline-block" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
            <span aria-hidden className="absolute inset-y-1 -left-2 w-full rounded-[18px] bg-border-strong/40" />
            <span aria-hidden className="absolute inset-y-0.5 -left-1 w-full rounded-[18px] bg-border-strong/70" />
            <span className="relative block">
              {team ? <TeamMark name={team.name} tone={team.tone} size={AVATAR_SIZE} className="rounded-[18px]" /> : <GroupAvatar name={group!.name} avatarUrl={group!.avatarUrl} size={AVATAR_SIZE} badge />}
            </span>
          </span>
        ) : team ? (
          <TeamMark name={team.name} tone={team.tone} size={AVATAR_SIZE} className="rounded-[18px]" />
        ) : group ? (
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
            {showKindTag && group && (
              <span
                data-kind-tag={team ? "team" : "community"}
                className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]", team ? "bg-primary-soft text-primary" : "bg-success/10 text-success")}
              >
                {t(team ? "rooms.filter.team" : "rooms.filter.community")}
              </span>
            )}
          </span>
          <span className={cn("shrink-0 text-caption tabular-nums", unread ? "font-semibold text-text" : "text-text-muted")}>
            {formatRelativeTime(conversation.lastMessageAt, language)}
          </span>
        </span>
        <span className="flex items-start justify-between gap-2">
          {rollup ? (
            // Ekip satırının ikinci satırı kanal adlarıdır ("genel, duyurular, mimari · 2 proje"); son mesaj üçüncü satırda.
            <span data-team-names className={cn("line-clamp-2 min-w-0 flex-1 break-words text-small", unread ? "font-medium text-text" : "text-text-muted")}>
              {names}
              {rollup.projects > 0 && ` · ${t("th.row.projects", { count: rollup.projects })}`}
            </span>
          ) : (
          <span className={cn("line-clamp-2 min-w-0 flex-1 break-words text-small", unread ? "font-medium text-text" : "text-text-muted")}>
            {team && (
              <span data-team-channel className="font-bold text-primary">
                # {team.channelName} ·{" "}
              </span>
            )}
            {lastRoom && <span data-last-room className="font-bold text-primary"># {roomSlug(lastRoom.name)} </span>}
            {conversation.lastMessage}
          </span>
          )}
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
          {opensHub && !selecting && <ChevronRight size={16} className="mt-1 shrink-0 text-text-muted" aria-hidden />}
        </span>
        {group && (
          <span data-row-meta className="truncate text-caption text-text-muted">
            {team ? (
              <>
                {rollup ? (
                  <span data-team-last>
                    <span data-team-channel className="font-bold text-primary"># {team.channelName}</span> · {conversation.lastMessage}
                  </span>
                ) : (
                  <>
                    {conversation.teamRollup && conversation.teamRollup.unreadChannelCount > 0
                      ? t("tm.list.rollup", { count: conversation.teamRollup.unreadChannelCount })
                      : t("tm.list.noNew")}
                    {" · "}
                    {memberCountText(t, group.memberCount)}
                  </>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                <VisibilityLabel visibility={group.visibility} size={11} className="inline-flex items-center gap-1" />
                <span aria-hidden>·</span>
                {memberCountText(t, group.memberCount)}
              </span>
            )}
          </span>
        )}
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
          href={hubHref ?? (shareQuery ? `${messageHref(conversation)}&${shareQuery}` : messageHref(conversation))}
          aria-current={isActive ? "page" : undefined}
          data-conversation-row
          className={cn(rowClass, "min-w-0 flex-1")}
        >
          {content}
        </Link>
      )}
      {group && !team && expandable && !onOpen && !selecting && !onUnarchive && (
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
    {group && !team && expandable && paneVisible && !selecting && !onOpen && (treeOpen ?? Boolean(isActive)) && <RoomTree communityId={group.id} isActiveConversation={Boolean(isActive)} />}
    </div>
  );
}
