"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { FollowButton } from "@/features/profile/follow-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentEngager, StatisticsKind } from "@/lib/supabase/content-statistics";
import { formatRelativeTime, profileHref } from "@/lib/utils";

const EMPTY_KEYS: Record<StatisticsKind, TranslationKey> = {
  likes: "statistics.emptyLikes",
  comments: "statistics.emptyComments",
  saves: "statistics.emptySaves",
};

/** Same row height as a loaded row, so the sheet doesn't jump when data arrives. */
function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </li>
  );
}

function EngagerRow({ item, kind, onNavigate }: { item: ContentEngager; kind: StatisticsKind; onNavigate: () => void }) {
  const { t, language } = useTranslation();
  const { user: viewer } = useAuth();
  const time = formatRelativeTime(item.interactedAt, language);

  // Deleted account / missing public profile — a safe, non-linking fallback.
  if (!item.user) {
    return (
      <li className="flex items-center gap-3 px-1 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-muted">
          <UserX size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-text-secondary">{t("statistics.deletedUser")}</p>
          <p className="text-caption text-text-muted">{time}</p>
        </div>
      </li>
    );
  }

  const profile = item.user;
  const showFollow = kind !== "comments" && viewer?.id !== profile.id;

  return (
    <li className="flex items-start gap-3 px-1 py-2.5">
      <Link href={profileHref(profile)} onClick={onNavigate} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={profileHref(profile)} onClick={onNavigate} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="block truncate text-small font-semibold text-text">{profile.displayName}</span>
          <span className="block truncate text-caption text-text-muted">@{profile.username}</span>
        </Link>
        {kind === "comments" && item.commentBody && (
          <p className="mt-1 line-clamp-2 break-words rounded-md bg-surface-soft px-2.5 py-1.5 text-small text-text-secondary">{item.commentBody}</p>
        )}
        <p className="mt-0.5 text-caption text-text-muted">{time}</p>
      </div>
      {showFollow && <FollowButton user={profile} size="sm" className="shrink-0" />}
    </li>
  );
}

/**
 * One tab's body: skeleton while the first page loads, a retryable error, a
 * designed empty state, the real list, and "load more" (keyset pagination
 * lives in `useEngagers`). `list` is that hook's result, passed in so the
 * parent keeps all three tabs' data alive across tab switches.
 */
export function UserInteractionList({
  kind,
  icon,
  list,
  onNavigate,
}: {
  kind: StatisticsKind;
  icon: LucideIcon;
  list: {
    items: ContentEngager[];
    status: "loading" | "ready" | "error";
    hasMore: boolean;
    loadingMore: boolean;
    loadMore: () => void;
    retry: () => void;
  };
  onNavigate: () => void;
}) {
  const { t } = useTranslation();

  if (list.status === "loading") {
    return (
      <ul aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
        {Array.from({ length: 6 }, (_, index) => (
          <RowSkeleton key={index} />
        ))}
      </ul>
    );
  }

  if (list.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-small text-text-secondary">{t("statistics.loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={list.retry}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (list.items.length === 0 && !list.hasMore) {
    return <EmptyState compact icon={icon} title={t(EMPTY_KEYS[kind])} className="m-2" />;
  }

  return (
    <div>
      <ul className="divide-y divide-border-soft">
        {list.items.map((item) => (
          <EngagerRow key={item.key} item={item} kind={kind} onNavigate={onNavigate} />
        ))}
      </ul>
      {list.hasMore && (
        <div className="flex justify-center py-3">
          <Button type="button" variant="outline" size="sm" onClick={list.loadMore} disabled={list.loadingMore}>
            {list.loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
