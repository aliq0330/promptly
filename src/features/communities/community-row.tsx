"use client";

import Link from "next/link";
import { Flag } from "@/components/icons/flag";
import { Link2 } from "@/components/icons/link-2";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { HUB_COL_LG, HUB_ROW_LINK_CLASS, HUB_CARD_CORNER_BUTTON_CLASS, HubRow } from "@/features/hub/hub-kit";
import { useReport } from "@/features/moderation/report-provider";
import { useCommunityPresenceCount } from "@/features/presence/community-presence";
import { OnlineCountText } from "@/features/presence/presence-ui";
import { communityHref, communityTopicLabelKey } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunitySummary } from "@/lib/supabase/communities";
import { absoluteUrl, cn, formatRelativeTime, formatUnread } from "@/lib/utils";
import { CommunityJoinButton, type JoinState } from "./community-join-button";

/** Topluluklarım tablo sütunları (Yön D, docs/history/459-*): Topluluk · Rolüm · Üye · Çevrimiçi · Yeni · Son etkinlik · eylemler. */
export const COMMUNITY_TABLE = {
  cols: "minmax(0,1fr) 6rem 6.5rem 5.5rem 5.5rem 6rem 10.5rem",
  colsMd: "minmax(0,1fr) 5.5rem 10.5rem",
} as const;

/**
 * Topluluk satırı: `CommunityCard`ın tablo karşılığı — aynı veri, aynı üyelik düğmesi ve ⋮ menüsü, aynı test öznitelikleri.
 * Telefonda üye sayısı ve "N yeni" adın altındaki ikinci satıra iner.
 */
export function CommunityRow({
  community,
  onStatusChange,
  onToast,
  footerNote,
  unseen = 0,
  phone = false,
}: {
  community: CommunitySummary;
  onStatusChange: (next: JoinState) => void;
  onToast: (message: string) => void;
  footerNote?: string;
  unseen?: number;
  /** Telefon: "N yeni" ayrı sütun yerine adın altındaki satıra iner (yalnız telefonda çizilir; metin tek yerde durur). */
  phone?: boolean;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const { openReport } = useReport();
  const activeCount = useCommunityPresenceCount(community.id);
  const full = community.memberCount >= community.memberLimit;
  const freshPill =
    unseen > 0 ? (
      <span data-shelf-unseen={unseen} className="inline-flex w-fit rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground">
        {t("communities.shelf.unseen", { count: unseen >= 99 ? "99+" : unseen })}
      </span>
    ) : null;
  const unreadText = community.unreadCount > 0 ? <span className="text-caption text-primary">{t("communities.card.unread", { count: formatUnread(community.unreadCount) })}</span> : null;

  return (
    <HubRow data-community-card={community.id}>
      <div className="flex min-w-0 items-center gap-3">
        <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={40} className="shrink-0 [&>span:first-child]:rounded-lg" />
        <span className="min-w-0 flex-1">
          <h3 className="min-w-0 font-display text-body font-bold text-text">
            <Link href={communityHref(community.id)} title={community.description || undefined} className={cn("block truncate", HUB_ROW_LINK_CLASS)}>
              {community.name}
            </Link>
          </h3>
          <span className="flex min-w-0 items-center gap-2 text-caption text-text-muted">
            <span className="truncate">{footerNote ?? t(communityTopicLabelKey(community))}</span>
            {phone && (freshPill ?? unreadText)}
          </span>
        </span>
      </div>
      <span className={cn("flex", HUB_COL_LG)}>{community.myRole ? <RoleBadge role={community.myRole} /> : <span className="text-text-muted">—</span>}</span>
      <span className={cn("truncate text-small text-text-secondary", HUB_COL_LG)}>
        {memberCountText(t, community.memberCount)}
        {full && ` · ${t("groups.page.full")}`}
      </span>
      <span className={cn("text-small", HUB_COL_LG)}>
        <OnlineCountText count={activeCount} variant="active" className="text-success" />
      </span>
      {!phone && (
        <span className="flex flex-col items-start gap-0.5">
          {freshPill}
          {unreadText}
          {!freshPill && !unreadText && <span className="text-text-muted">—</span>}
        </span>
      )}
      <span className={cn("whitespace-nowrap text-small text-text-secondary", HUB_COL_LG)}>{formatRelativeTime(community.lastActivityAt ?? community.createdAt, language)}</span>
      <span className="relative z-10 flex items-center justify-end gap-1.5">
        <CommunityJoinButton
          target={{
            id: community.id,
            name: community.name,
            visibility: community.visibility,
            rulesRequired: community.rulesRequired,
            memberCount: community.memberCount,
            memberLimit: community.memberLimit,
            closed: community.closed,
          }}
          status={community.myStatus}
          role={community.myRole}
          onChange={onStatusChange}
          onToast={onToast}
          size="sm"
        />
        <PopoverMenu
          label={t("communities.card.menu", { name: community.name })}
          triggerClassName={cn(HUB_CARD_CORNER_BUTTON_CLASS, "bg-transparent shadow-none")}
          items={[
            {
              key: "copy",
              label: t("common.copyLink"),
              icon: Link2,
              onSelect: () => void navigator.clipboard?.writeText(absoluteUrl(communityHref(community.id))).then(() => onToast(t("common.copied")), () => undefined),
            },
            {
              key: "report",
              label: t("communities.about.reportCommunity"),
              icon: Flag,
              danger: true,
              hidden: !user || community.myRole === "owner",
              onSelect: () => openReport({ type: "community", id: community.id, title: community.name }),
            },
          ]}
        />
      </span>
    </HubRow>
  );
}
