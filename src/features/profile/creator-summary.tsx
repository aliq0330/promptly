"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FollowButton } from "./follow-button";
import { DetailCard, Eyebrow } from "@/features/content/detail-parts";
import type { UserProfile } from "@/types";

/** Detail pages' side-column creator block: identity, short bio, follow. */
export function CreatorSummary({ creator, isOwn, label }: { creator: UserProfile; isOwn?: boolean; label?: string }) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("profile.creatorLabel");
  return (
    <DetailCard aria-label={resolvedLabel} className="space-y-3.5 p-4">
      <Eyebrow>{resolvedLabel}</Eyebrow>
      <Link href={profileHref(creator)} className="group flex items-center gap-3 rounded-md">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={48} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-serif text-[1.0625rem] text-text transition-colors group-hover:text-primary">{creator.displayName}</span>
          <span className="block truncate text-caption text-text-muted">@{creator.username}</span>
        </span>
      </Link>
      {creator.bio && <p className="line-clamp-3 text-caption leading-relaxed text-text-secondary">{creator.bio}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-3">
        <span className="text-caption text-text-muted">
          <span className="font-semibold tabular-nums text-text">{formatCount(creator.followerCount)}</span> {t("profile.followersSuffix")}
        </span>
        {!isOwn && <FollowButton user={creator} />}
      </div>
    </DetailCard>
  );
}
