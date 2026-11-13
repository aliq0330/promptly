"use client";

import Link from "next/link";
import { ChevronRight } from "@/components/icons/chevron-right";
import { useCommunityOnlineMembers } from "@/features/presence/community-presence";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { RoleBadge } from "@/features/groups/role-badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { communityHref } from "@/lib/communities";
import { cn, profileHref } from "@/lib/utils";
import type { ChatGroup, CommunityRoom, Message } from "@/types";
import { messagePreviewText } from "../message-preview";
import type { PinnedItem } from "../use-pinned-messages";

/**
 * Masaüstü sağ paneli "Bu oda" (docs/history/352-*, mockup 7): odanın sabit mesajı, çevrimiçi üyeler, topluluk sayfası ve (yetkiliye) oda ayarları.
 * Yalnız `lg`+ ve başlıktaki üye düğmesiyle açılıp kapanır; telefonda/tablette yoktur (aynı bilgiler çip satırı ve oda değiştiricidedir).
 */
export function RoomSidePanel({
  group,
  pinned,
  canManage,
  senderLabel,
  onJump,
  className,
}: {
  group: ChatGroup;
  room: CommunityRoom;
  pinned: readonly PinnedItem[];
  canManage: boolean;
  senderLabel: (senderId: string) => string;
  onJump: (message: Message) => void;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const { enabled, members } = useCommunityOnlineMembers(group.id, { limit: 6 });
  const firstPin = pinned[0];
  const pageHref = communityHref(group.id);
  const link = "flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border-soft px-3 text-small font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  void language;
  return (
    <aside data-room-panel aria-label={t("rooms.panel.title")} className={cn("w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border-soft bg-surface px-4 py-5", className)}>
      <h2 className="font-display text-h3 font-bold text-text">{t("rooms.panel.title")}</h2>

      <section aria-label={t("rooms.panel.pinned")}>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">{t("rooms.panel.pinned")}</h3>
        {firstPin ? (
          <button
            type="button"
            onClick={() => onJump(firstPin.message)}
            className="w-full rounded-xl bg-surface-soft px-3 py-3 text-left text-small leading-relaxed text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {messagePreviewText(firstPin.message, (key, params) => t(key as never, params as never))}
            <span className="text-text-muted"> · {senderLabel(firstPin.message.senderId)}</span>
          </button>
        ) : (
          <p className="text-small text-text-muted">{t("rooms.panel.pinnedNone")}</p>
        )}
      </section>

      {enabled && (
        <section aria-label={t("rooms.panel.online", { count: members.length })} data-room-panel-online>
          <h3 className="mb-2 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">
            <span>{t("rooms.panel.online", { count: members.length })}</span>
            <Link href={communityHref(group.id, "members")} className="text-small font-bold normal-case tracking-normal text-primary hover:underline">{t("rooms.panel.all")}</Link>
          </h3>
          {members.length === 0 ? (
            <p className="text-small text-text-muted">{t("rooms.panel.onlineNone")}</p>
          ) : (
            <ul className="space-y-1">
              {members.map((member) => (
                <li key={member.userId}>
                  <Link href={profileHref({ username: member.username })} className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <PresenceAvatar userId={member.userId} src={member.avatarUrl} alt={member.displayName} size={40} />
                    <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{member.displayName}</span>
                    {member.role !== "member" && <RoleBadge role={member.role} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        <Link href={pageHref} className={link}>
          {t("rooms.panel.communityPage")}
          <ChevronRight size={18} aria-hidden />
        </Link>
        {canManage && (
          <Link href={communityHref(group.id, "manage", "rooms")} className={link} data-room-panel-settings>
            {t("rooms.panel.roomSettings")}
            <ChevronRight size={18} aria-hidden />
          </Link>
        )}
      </div>
    </aside>
  );
}
