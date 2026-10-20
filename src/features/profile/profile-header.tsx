"use client";

import { useState } from "react";
import Image from "next/image";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileStats } from "./profile-stats";
import { ProfileBadges } from "./profile-badges";
import { Badge } from "@/components/ui/badge";
import { DetailBand, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount } from "@/lib/utils";
import { useProfileStories } from "@/features/stories/story-highlights";
import { INTEREST_OPTION_LABELS, type InterestOption } from "./interest-options";
import type { UserProfile } from "@/types";

const BIO_CLAMP_LENGTH = 140;

/**
 * The profile's ALBÜM band (docs/history/203-*, the detail pages' language — docs/history/201-*): tinted by the avatar
 * (enlarged + blurred), the avatar as the "album art" (with its story ring), "Yaratıcı" kicker, the name as the big title,
 * then @handle, the stats, the bio and the interest/badge chips. Centred on phones, beside the avatar from `lg`.
 * The actions row under it is `ProfileActionRow`; the follower count shown here comes from the same `useFollowState`.
 */
export function ProfileBand({
  user,
  isOwnProfile,
  postCounts,
  followerCount,
  reuseCount = 0,
  onSelectPosts,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  postCounts: { prompts: number; requests: number; workflows: number; presets: number };
  followerCount: number;
  /** Sum of the listed prompts' real use counters; the line is hidden at 0. */
  reuseCount?: number;
  onSelectPosts: () => void;
}) {
  const { t } = useTranslation();
  const [bioExpanded, setBioExpanded] = useState(false);
  const stories = useProfileStories(user.id);
  const bio = user.bio ?? "";
  const bioIsLong = bio.length > BIO_CLAMP_LENGTH;
  const visibleBio = bioIsLong && !bioExpanded ? `${bio.slice(0, BIO_CLAMP_LENGTH).trimEnd()}…` : bio;
  const interestLabel = (interest: string) =>
    interest in INTEREST_OPTION_LABELS ? t(INTEREST_OPTION_LABELS[interest as InterestOption]) : interest;
  const firstInterest = user.interests?.[0];

  return (
    <DetailBand
      align="center"
      data-profile-band=""
      backdrop={user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="100vw" className="object-cover" /> : undefined}
      art={
        // Hikâye halkası (docs/history/198-*): etkin hikâye varsa avatar onu açar; görülmemişse sıcak vurgu, görülmüşse sakin.
        <span
          data-profile-story-ring={stories ? (stories.unseen ? "unseen" : "seen") : "none"}
          className={cn(
            "relative inline-flex shrink-0 rounded-full bg-surface p-1 shadow-pop",
            stories?.unseen ? "border-[3px] border-secondary" : stories ? "border-[3px] border-border-strong" : "border-4 border-surface",
          )}
        >
          <ProfileAvatar src={user.avatarUrl} alt={user.displayName} isOwnProfile={isOwnProfile} size={136} />
          {stories && (
            <button
              type="button"
              onClick={stories.open}
              aria-label={t("stories.profile.open", { name: user.displayName })}
              className="absolute inset-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          )}
        </span>
      }
      kicker={
        <Eyebrow tone="primary">
          {t("profile.creatorLabel")}
          {firstInterest && <> · {interestLabel(firstInterest)}</>}
        </Eyebrow>
      }
      title={<DetailTitle>{user.displayName}</DetailTitle>}
      byline={
        <div className="flex w-full flex-col items-center gap-3 lg:items-start">
          <p className="truncate text-body text-text-secondary">@{user.username}</p>
          <ProfileStats
            postCounts={postCounts}
            followerCount={followerCount}
            followingCount={user.followingCount}
            isOwnProfile={isOwnProfile}
            onSelectPosts={onSelectPosts}
          />
          {bio && (
            <p className="max-w-2xl break-words text-body leading-relaxed text-text-secondary">
              {visibleBio}{" "}
              {bioIsLong && (
                <button type="button" onClick={() => setBioExpanded((prev) => !prev)} className="font-medium text-primary hover:underline">
                  {t(bioExpanded ? "common.showLess" : "common.readMore")}
                </button>
              )}
            </p>
          )}
          {reuseCount > 0 && (
            <p className="-mt-1 text-small text-text-muted" data-profile-reuse>
              {t("profile.reuseLine", { count: formatCount(reuseCount) })}
            </p>
          )}
          {((user.interests && user.interests.length > 0) || postCounts.prompts > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start">
              {user.interests?.slice(0, 4).map((interest) => (
                <Badge key={interest} variant="neutral">
                  {interestLabel(interest)}
                </Badge>
              ))}
              <ProfileBadges publishedPromptCount={postCounts.prompts} />
            </div>
          )}
        </div>
      }
    />
  );
}
