"use client";

import { useState } from "react";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileStats } from "./profile-stats";
import { ProfileBadges } from "./profile-badges";
import { OwnProfileActions, OtherProfileActions } from "./profile-actions";
import { useFollowState } from "./use-follow-state";
import { Badge } from "@/components/ui/badge";
import type { UserProfile } from "@/types";

const BIO_CLAMP_LENGTH = 140;

export function ProfileHeader({
  user,
  isOwnProfile,
  publishedPromptCount,
  onSelectPrompts,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  publishedPromptCount: number;
  onSelectPrompts: () => void;
}) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const bio = user.bio ?? "";
  const bioIsLong = bio.length > BIO_CLAMP_LENGTH;
  const visibleBio = bioIsLong && !bioExpanded ? `${bio.slice(0, BIO_CLAMP_LENGTH).trimEnd()}…` : bio;

  // Genuinely real for a real (Supabase) profile — the true `follower_
  // count` column, kept in sync by Bölüm 19's trigger; still an
  // optimistic local adjustment relative to the mock's static count for a
  // mock profile, same as before. Called once here (not inside
  // OtherProfileActions/FollowButton) so the stat below and the action
  // button share one state instance — see FollowButtonView's comment.
  const followState = useFollowState(user);

  return (
    <header className="rounded-lg border border-border-soft bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <ProfileAvatar src={user.avatarUrl} alt={user.displayName} isOwnProfile={isOwnProfile} />

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-h1 font-semibold text-text">{user.displayName}</h1>
              <p className="truncate text-small text-text-muted">@{user.username}</p>
            </div>
            {isOwnProfile ? (
              <OwnProfileActions user={user} />
            ) : (
              <OtherProfileActions user={user} followState={followState} />
            )}
          </div>

          {bio && (
            <p className="max-w-2xl text-body text-text-secondary">
              {visibleBio}{" "}
              {bioIsLong && (
                <button
                  type="button"
                  onClick={() => setBioExpanded((prev) => !prev)}
                  className="font-medium text-primary hover:underline"
                >
                  {bioExpanded ? "Daha az göster" : "Devamını gör"}
                </button>
              )}
            </p>
          )}

          {((user.interests && user.interests.length > 0) || publishedPromptCount > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {user.interests?.slice(0, 4).map((interest) => (
                <Badge key={interest} variant="neutral">
                  {interest}
                </Badge>
              ))}
              <ProfileBadges publishedPromptCount={publishedPromptCount} />
            </div>
          )}

          <ProfileStats
            promptCount={publishedPromptCount}
            followerCount={followState.followerCount}
            followingCount={user.followingCount}
            isOwnProfile={isOwnProfile}
            onSelectPrompts={onSelectPrompts}
          />
        </div>
      </div>
    </header>
  );
}
