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
  remixCount,
  onSelectPrompts,
  onSelectRemixes,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  publishedPromptCount: number;
  remixCount: number;
  onSelectPrompts: () => void;
  onSelectRemixes: () => void;
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
    <div className="flex flex-col items-center gap-3 px-4 pt-8 text-center lg:px-6">
      <ProfileAvatar src={user.avatarUrl} alt={user.displayName} isOwnProfile={isOwnProfile} />

      <div className="min-w-0 max-w-full">
        <h1 className="truncate text-lg font-semibold text-text">{user.displayName}</h1>
        <p className="truncate text-sm text-text-muted">@{user.username}</p>
      </div>

      {bio && (
        <p className="max-w-sm text-sm text-text-muted">
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

      {user.interests && user.interests.length > 0 && (
        <div className="flex max-w-sm flex-wrap justify-center gap-1.5">
          {user.interests.slice(0, 4).map((interest) => (
            <Badge key={interest} variant="outline">
              {interest}
            </Badge>
          ))}
        </div>
      )}

      <ProfileBadges publishedPromptCount={publishedPromptCount} remixCount={remixCount} />

      <ProfileStats
        promptCount={publishedPromptCount}
        remixCount={remixCount}
        followerCount={followState.followerCount}
        followingCount={user.followingCount}
        isOwnProfile={isOwnProfile}
        onSelectPrompts={onSelectPrompts}
        onSelectRemixes={onSelectRemixes}
      />

      {isOwnProfile ? (
        <OwnProfileActions user={user} />
      ) : (
        <OtherProfileActions user={user} followState={followState} />
      )}
    </div>
  );
}
