"use client";

import Link from "next/link";
import { CalendarDays, MessageSquare, SquareStack } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { CommunityCover } from "./community-cover";
import { CardBandBackdrop } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
import { VisibilityLabel } from "./visibility-label";
import { CATEGORY_LABEL_KEYS, communityHref, REASON_LABEL_KEYS } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { formatUnread } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityReason, CommunitySummary } from "@/lib/supabase/communities";

/**
 * Topluluk kartı: görsel, ad, açıklama, üye sayısı, görünürlük ve içerik/etkinlik özeti. Bandın altında TEK üyelik düğmesi
 * (Katıl · İstek gönder · İstek gönderildi ▼ · Katıldın ▼ → ayrıl). Kart tamamı tıklanabilir bir bağlantıdır; düğme ayrı bir hedeftir.
 * Kapalı topluluğun kartında içerik istatistiği yoktur (üye olmayana sunucu vermez) ve "içerik yalnızca üyelere" notu görünür.
 */
export function CommunityCard({
  community,
  onStatusChange,
  onToast,
  onInvited,
  footerNote,
  reason,
}: {
  community: CommunitySummary;
  onStatusChange: (next: JoinState) => void;
  onToast: (message: string) => void;
  onInvited?: () => void;
  footerNote?: string;
  /** Öneri listesinde: bu topluluk neden önerildi. */
  reason?: CommunityReason;
}) {
  const { t } = useTranslation();
  const full = community.memberCount >= community.memberLimit;
  const isMember = community.myStatus === "member";
  const showContentStats = community.visibility === "public" || isMember;

  return (
    // Albüm kartı (docs/history/203-*): the band takes the community picture's colours (`CommunityCover`'s automatic mode),
    // big square picture + category kicker + name inside it; the one membership button and the counts under it.
    <li className="relative flex flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-colors duration-200 ease-soft hover:border-border-strong">
      <div className="relative rounded-t-xl px-4 pb-4 pt-4">
        <CardBandBackdrop backdrop={<CommunityCover coverUrl={null} coverColor={null} avatarUrl={community.avatarUrl} className="h-full sm:h-full" />} />
        <div className="relative space-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex shrink-0 rounded-[1.15rem] border-[3px] border-surface bg-surface shadow-pop">
              <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={56} className="[&>span:first-child]:rounded-[0.95rem]" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <Eyebrow tone="primary">{t(CATEGORY_LABEL_KEYS[community.category])}</Eyebrow>
              <h2 className="break-words font-display text-[1.25rem] font-extrabold leading-tight tracking-[-0.02em] text-text">
                <Link href={communityHref(community.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">
                  {community.name}
                </Link>
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <VisibilityLabel visibility={community.visibility} />
            {community.myRole && <RoleBadge role={community.myRole} />}
            {community.closed && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
          </div>
          {community.description && <p className="line-clamp-2 break-words text-small text-text-secondary">{community.description}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="relative z-10 shrink-0">
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
            onInvited={onInvited}
            size="md"
          />
        </div>
        <p className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-caption text-text-muted">
          <span>{memberCountText(t, community.memberCount)}{full && ` · ${t("groups.page.full")}`}</span>
          {showContentStats && (
            <span className="flex items-center gap-1" title={t("communities.card.postsTitle")}>
              <SquareStack size={12} aria-hidden /> {community.postCount}
            </span>
          )}
          {showContentStats && community.upcomingEventCount > 0 && (
            <span className="flex items-center gap-1">
              <CalendarDays size={12} aria-hidden /> {t("communities.card.upcomingEvents", { count: community.upcomingEventCount })}
            </span>
          )}
          {community.unreadCount > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <MessageSquare size={12} aria-hidden /> {t("communities.card.unread", { count: formatUnread(community.unreadCount) })}
            </span>
          )}
          {community.pendingRequestCount > 0 && <span className="text-primary">{t("communities.card.pendingRequests", { count: community.pendingRequestCount })}</span>}
        </p>
        {(footerNote || reason || (community.visibility === "restricted" && !isMember)) && (
          <span className="w-full text-caption text-text-muted">
            {footerNote ?? (reason ? t(REASON_LABEL_KEYS[reason]) : t("communities.search.restrictedNote"))}
          </span>
        )}
      </div>
    </li>
  );
}
