"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, CalendarDays, Globe, Loader2, Lock, MessageSquare, SquareStack } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { CATEGORY_LABEL_KEYS, communityHref } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { CommunitySummary } from "@/lib/supabase/communities";

export type CommunityCardAction =
  | { kind: "join"; busy: boolean; disabled: boolean; onClick: () => void }
  | { kind: "invited"; onClick: () => void };

/**
 * Topluluk kartı: görsel, ad, açıklama, üye sayısı, görünürlük ve içerik/etkinlik özeti. Eylem duruma göre değişir
 * (Katıl · İstekte bulundun · Daveti gör · Aç). Kart tamamı tıklanabilir bir bağlantıdır; eylem düğmesi ayrı bir hedeftir.
 * Kapalı toplulukların kartı yalnızca üye/davetli/başvurucu için okunabilir olduğundan keşif listesinde bulunmaz.
 */
export function CommunityCard({
  community,
  action,
  onToggleBookmark,
  bookmarkBusy = false,
  footerNote,
}: {
  community: CommunitySummary;
  action?: CommunityCardAction;
  onToggleBookmark?: () => void;
  bookmarkBusy?: boolean;
  footerNote?: string;
}) {
  const { t } = useTranslation();
  const full = community.memberCount >= community.memberLimit;

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
            <span className="flex items-center gap-1 text-caption text-text-muted">
              {community.visibility === "public" ? <Globe size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
              {community.visibility === "public" ? t("groups.visibility.public") : t("groups.visibility.private")}
            </span>
            {community.myRole && <RoleBadge role={community.myRole} />}
            {community.closed && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
          </div>
        </div>
        {onToggleBookmark && (
          <button
            type="button"
            onClick={onToggleBookmark}
            disabled={bookmarkBusy}
            aria-pressed={community.bookmarked}
            aria-label={community.bookmarked ? t("communities.bookmark.remove") : t("communities.bookmark.add")}
            className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {community.bookmarked ? <BookmarkCheck size={18} className="text-primary" /> : <Bookmark size={18} />}
          </button>
        )}
      </div>

      {community.description && <p className="line-clamp-2 break-words text-small text-text-secondary">{community.description}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
          <span>{memberCountText(t, community.memberCount)}{full && ` · ${t("groups.page.full")}`}</span>
          <span className="flex items-center gap-1" title={t("communities.card.postsTitle")}>
            <SquareStack size={12} aria-hidden /> {community.postCount}
          </span>
          {community.upcomingEventCount > 0 && (
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
        <div className="relative z-10 flex items-center gap-2">
          {footerNote && <span className="text-caption text-text-muted">{footerNote}</span>}
          {community.myStatus === "member" ? (
            <Link href={communityHref(community.id)} className={buttonClassName({ size: "sm", variant: "outline" })}>
              {t("groups.page.open")}
            </Link>
          ) : community.myStatus === "requested" ? (
            <Link href={communityHref(community.id)} className={buttonClassName({ size: "sm", variant: "secondary" })}>
              {t("communities.card.requested")}
            </Link>
          ) : action?.kind === "invited" || community.myStatus === "invited" ? (
            <Button type="button" size="sm" variant="secondary" onClick={action?.kind === "invited" ? action.onClick : undefined}>
              {t("groups.page.invited")}
            </Button>
          ) : action?.kind === "join" ? (
            <Button type="button" size="sm" onClick={action.onClick} disabled={action.disabled} aria-label={t("groups.page.joinAria", { name: community.name })}>
              {action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("groups.page.join")}
            </Button>
          ) : (
            <Link href={communityHref(community.id)} className={cn(buttonClassName({ size: "sm", variant: "outline" }))}>
              {t("groups.page.open")}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
