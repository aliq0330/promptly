"use client";

import Link from "next/link";
import { CalendarDays, MessageSquare, SquareStack } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { VisibilityLabel } from "./visibility-label";
import { CATEGORY_LABEL_KEYS, communityHref } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunitySummary } from "@/lib/supabase/communities";

/**
 * Topluluk kartı: görsel, ad, açıklama, üye sayısı, görünürlük ve içerik/etkinlik özeti. Sağ üstte TEK üyelik düğmesi
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
  reason?: "category" | "popular";
}) {
  const { t } = useTranslation();
  const full = community.memberCount >= community.memberLimit;
  const isMember = community.myStatus === "member";
  const showContentStats = community.visibility === "public" || isMember;

  return (
    <li className="relative flex flex-col gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong">
      <div className="flex items-start gap-3">
        <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={48} badge />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="break-words text-sm font-semibold leading-snug text-text">
            <Link href={communityHref(community.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">
              {community.name}
            </Link>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{t(CATEGORY_LABEL_KEYS[community.category])}</Badge>
            <VisibilityLabel visibility={community.visibility} />
            {community.myRole && <RoleBadge role={community.myRole} />}
            {community.closed && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
          </div>
        </div>
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
          />
        </div>
      </div>

      {community.description && <p className="line-clamp-2 break-words text-small text-text-secondary">{community.description}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
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
              <MessageSquare size={12} aria-hidden /> {t("communities.card.unread", { count: community.unreadCount })}
            </span>
          )}
          {community.pendingRequestCount > 0 && <span className="text-primary">{t("communities.card.pendingRequests", { count: community.pendingRequestCount })}</span>}
        </p>
        {(footerNote || reason || (community.visibility === "restricted" && !isMember)) && (
          <span className="text-caption text-text-muted">
            {footerNote ?? (reason ? t(reason === "category" ? "communities.suggest.reasonCategory" : "communities.suggest.reasonPopular") : t("communities.search.restrictedNote"))}
          </span>
        )}
      </div>
    </li>
  );
}
