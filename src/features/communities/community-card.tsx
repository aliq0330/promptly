"use client";

import { CalendarDays } from "@/components/icons/calendar-days";
import { SquareStack } from "@/components/icons/square-stack";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Badge } from "@/components/ui/badge";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { CommunityCover } from "./community-cover";
import { HUB_CARD_CHIP_CLASS, HubCard } from "@/features/hub/hub-kit";
import { VisibilityLabel } from "./visibility-label";
import { useCommunityPresenceCount } from "@/features/presence/community-presence";
import { OnlineCountText } from "@/features/presence/presence-ui";
import { CATEGORY_LABEL_KEYS, communityHref, REASON_LABEL_KEYS } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { formatUnread } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityReason, CommunitySummary } from "@/lib/supabase/communities";

/**
 * Topluluk kartı (Hub düzeni, docs/history/379-*): üç alanda aynı `HubCard` — 16:9 kapak (topluluğun görseli, renkleri bulanık arka plan),
 * sol üstte kategori, kapağın altında "N yeni" rozeti; gövdede ad, üye sayısı · aktif · gönderi · etkinlik · okunmamış özeti, alt satırda
 * görünürlük/rol/kapalı rozetleri ve TEK üyelik düğmesi (Katıl · İstek gönder · İstek gönderildi ▼ · Katıldın ▼ → ayrıl). Kart tamamı tıklanabilir bir
 * bağlantıdır; düğme ayrı bir hedeftir. Kapalı topluluğun kartında içerik istatistiği yoktur (üye olmayana sunucu vermez) ve "içerik yalnızca
 * üyelere" notu görünür; açıklama kartta yerine ad bağlantısının ipucundadır.
 */
export function CommunityCard({
  community,
  onStatusChange,
  onToast,
  onInvited,
  footerNote,
  reason,
  unseen = 0,
}: {
  community: CommunitySummary;
  onStatusChange: (next: JoinState) => void;
  onToast: (message: string) => void;
  onInvited?: () => void;
  footerNote?: string;
  /** Öneri listesinde: bu topluluk neden önerildi. */
  reason?: CommunityReason;
  /** Görmediğim gönderi sayısı (`my_community_unseen_counts`); kapağın altında "N yeni" rozeti olur. */
  unseen?: number;
}) {
  const { t } = useTranslation();
  const full = community.memberCount >= community.memberLimit;
  const isMember = community.myStatus === "member";
  const showContentStats = community.visibility === "public" || isMember;
  // Aktif üye sayısı (docs/history/329-*): kartlar tek çağrıda toplanır; okuyamadığın (kapalı, üye değilsin) toplulukta sunucu sayı vermez.
  const activeCount = useCommunityPresenceCount(community.id);
  const note = footerNote ?? (reason ? t(REASON_LABEL_KEYS[reason]) : community.visibility === "restricted" && !isMember ? t("communities.search.restrictedNote") : null);

  const meta = note ? (
    note
  ) : (
    <span className="inline-flex min-w-0 items-center gap-x-2.5 whitespace-nowrap">
      <span className="truncate">
        {memberCountText(t, community.memberCount)}
        {full && ` · ${t("groups.page.full")}`}
      </span>
      <OnlineCountText count={activeCount} variant="active" className="text-success" />
      {showContentStats && (
        <span className="inline-flex items-center gap-1" title={t("communities.card.postsTitle")}>
          <SquareStack size={12} aria-hidden /> {community.postCount}
        </span>
      )}
      {showContentStats && community.upcomingEventCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={12} aria-hidden /> {t("communities.card.upcomingEvents", { count: community.upcomingEventCount })}
        </span>
      )}
      {community.unreadCount > 0 && (
        <span className="inline-flex items-center gap-1 text-primary">
          <MessagesSquare size={12} aria-hidden /> {t("communities.card.unread", { count: formatUnread(community.unreadCount) })}
        </span>
      )}
      {community.pendingRequestCount > 0 && <span className="text-primary">{t("communities.card.pendingRequests", { count: community.pendingRequestCount })}</span>}
    </span>
  );

  return (
    <HubCard
      href={communityHref(community.id)}
      title={<span title={community.description || undefined}>{community.name}</span>}
      meta={meta}
      data-community-card={community.id}
      cover={
        <>
          <CommunityCover coverUrl={null} coverColor={null} avatarUrl={community.avatarUrl} className="h-full sm:h-full" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="inline-flex rounded-[1.15rem] border-[3px] border-surface bg-surface shadow-pop">
              <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={64} className="[&>span:first-child]:rounded-[0.95rem]" />
            </span>
          </span>
        </>
      }
      chip={<span className={HUB_CARD_CHIP_CLASS}>{t(CATEGORY_LABEL_KEYS[community.category])}</span>}
      coverOverlay={
        unseen > 0 ? (
          <span data-shelf-unseen={unseen} className="ml-auto rounded-full bg-primary px-2 py-0.5 text-caption font-bold text-primary-foreground shadow-xs">
            {t("communities.shelf.unseen", { count: unseen >= 99 ? "99+" : unseen })}
          </span>
        ) : undefined
      }
      footerStart={
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          <VisibilityLabel visibility={community.visibility} />
          {community.myRole && <RoleBadge role={community.myRole} />}
          {community.closed && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
        </span>
      }
      footerEnd={
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
          size="sm"
        />
      }
    />
  );
}
