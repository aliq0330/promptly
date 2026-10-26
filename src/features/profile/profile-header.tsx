"use client";

import { useState, type ReactNode } from "react";
import { Calendar, Globe, Repeat2 } from "lucide-react";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileStats } from "./profile-stats";
import { ProfileBadges } from "./profile-badges";
import { formatJoinDate } from "./profile-about";
import { Badge } from "@/components/ui/badge";
import { DemoAccountBadge } from "@/components/ui/demo-badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount } from "@/lib/utils";
import { useProfileStories } from "@/features/stories/story-highlights";
import { INTEREST_OPTION_LABELS, type InterestOption } from "./interest-options";
import type { UserProfile } from "@/types";

const BIO_CLAMP_LENGTH = 140;

/**
 * The profile's header (docs/history/243-*, direction "Sade" chosen from three mockups): no tinted band — the avatar (with its story ring),
 * the name and @handle on the left and the actions inline on the right (a full-width row under the name on phones), then, left-aligned and
 * quiet: the bio, the stats line, one meta line (website · joined · reuse) and the interest/badge chips. The tabs, rail and lists follow in
 * `ProfileView`; the follower count shown here comes from the same `useFollowState` as the Takip et button in `actions`.
 */
export function ProfileHeader({
  user,
  isOwnProfile,
  postCounts,
  followerCount,
  reuseCount = 0,
  onSelectPosts,
  actions,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  postCounts: { prompts: number; requests: number; workflows: number; presets: number };
  followerCount: number;
  /** Sum of the listed prompts' real use counters; the line is hidden at 0. */
  reuseCount?: number;
  onSelectPosts: () => void;
  actions: ReactNode;
}) {
  const { t, language } = useTranslation();
  const [bioExpanded, setBioExpanded] = useState(false);
  const stories = useProfileStories(user.id);
  const bio = user.bio ?? "";
  const bioIsLong = bio.length > BIO_CLAMP_LENGTH;
  const visibleBio = bioIsLong && !bioExpanded ? `${bio.slice(0, BIO_CLAMP_LENGTH).trimEnd()}…` : bio;
  const interestLabel = (interest: string) =>
    interest in INTEREST_OPTION_LABELS ? t(INTEREST_OPTION_LABELS[interest as InterestOption]) : interest;
  const website = user.website;
  const hasChips = (user.interests && user.interests.length > 0) || postCounts.prompts > 0;

  return (
    <header data-profile-band="" className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pt-9">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-4 sm:gap-5">
          {/* Hikâye halkası (docs/history/198-*): etkin hikâye varsa avatar onu açar; görülmemişse sıcak vurgu, görülmüşse sakin. */}
          <span
            data-profile-story-ring={stories ? (stories.unseen ? "unseen" : "seen") : "none"}
            className={cn(
              "relative inline-flex shrink-0 rounded-full p-[3px]",
              stories?.unseen ? "border-[3px] border-secondary" : stories ? "border-[3px] border-border-strong" : "border-[3px] border-transparent",
            )}
          >
            <ProfileAvatar src={user.avatarUrl} alt={user.displayName} isOwnProfile={isOwnProfile} size={88} />
            {stories && (
              <button
                type="button"
                onClick={stories.open}
                aria-label={t("stories.profile.open", { name: user.displayName })}
                className="absolute inset-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="break-words font-display text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-text sm:text-[2.125rem]">
              {user.displayName}
            </h1>
            <div className="mt-1 flex max-w-full flex-wrap items-center gap-2">
              <p className="truncate text-body text-text-secondary">@{user.username}</p>
              {user.isDemo && <DemoAccountBadge />}
            </div>
          </div>
        </div>
        {actions}
      </div>

      <div className="mt-4 space-y-3">
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
        <ProfileStats
          postCounts={postCounts}
          followerCount={followerCount}
          followingCount={user.followingCount}
          isOwnProfile={isOwnProfile}
          onSelectPosts={onSelectPosts}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-text-muted" data-profile-meta="">
          {website && (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
            >
              <Globe size={15} className="shrink-0" aria-hidden />
              <span className="truncate">{website}</span>
            </a>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={15} className="shrink-0" aria-hidden />
            {t("profile.joinedOn", { date: formatJoinDate(user.createdAt, language) })}
          </span>
          {reuseCount > 0 && (
            <span className="inline-flex items-center gap-1.5" data-profile-reuse>
              <Repeat2 size={15} className="shrink-0" aria-hidden />
              {t("profile.reuseLine", { count: formatCount(reuseCount) })}
            </span>
          )}
        </div>
        {hasChips && (
          <div className="flex flex-wrap items-center gap-1.5">
            {user.interests?.slice(0, 4).map((interest) => (
              <Badge key={interest} variant="neutral">
                {interestLabel(interest)}
              </Badge>
            ))}
            <ProfileBadges publishedPromptCount={postCounts.prompts} />
          </div>
        )}
      </div>
    </header>
  );
}
