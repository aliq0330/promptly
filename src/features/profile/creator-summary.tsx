"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FollowButton } from "./follow-button";
import type { UserProfile } from "@/types";

/** Detail pages' side-column creator block: identity, short bio, follow. */
export function CreatorSummary({ creator, isOwn, label }: { creator: UserProfile; isOwn?: boolean; label?: string }) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("profile.creatorLabel");
  return (
    <section aria-label={resolvedLabel} className="space-y-3 rounded-lg border border-border-soft bg-surface p-4">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{resolvedLabel}</p>
      <Link href={profileHref(creator)} className="group flex items-center gap-3 rounded-md">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={44} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-semibold text-text group-hover:text-primary">{creator.displayName}</span>
          <span className="block truncate text-caption text-text-muted">@{creator.username}</span>
        </span>
      </Link>
      {creator.bio && <p className="line-clamp-3 text-caption text-text-secondary">{creator.bio}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">
          <span className="font-semibold tabular-nums text-text">{formatCount(creator.followerCount)}</span> {t("profile.followersSuffix")}
        </span>
        {!isOwn && <FollowButton user={creator} />}
      </div>
    </section>
  );
}
