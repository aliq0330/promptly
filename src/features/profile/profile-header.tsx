"use client";

import { useState } from "react";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileStats } from "./profile-stats";
import { ProfileBadges } from "./profile-badges";
import { OwnProfileActions, OtherProfileActions } from "./profile-actions";
import { useFollow } from "./follow-provider";
import { Badge } from "@/components/ui/badge";
import type { UserProfile } from "@/types";

const BIO_CLAMP_LENGTH = 140;

export function ProfileHeader({
  user,
  isOwnProfile,
  publishedPromptCount,
  remixCount,
  conversationId,
  onSelectPrompts,
  onSelectRemixes,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  publishedPromptCount: number;
  remixCount: number;
  conversationId?: string;
  onSelectPrompts: () => void;
  onSelectRemixes: () => void;
}) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const bio = user.bio ?? "";
  const bioIsLong = bio.length > BIO_CLAMP_LENGTH;
  const visibleBio = bioIsLong && !bioExpanded ? `${bio.slice(0, BIO_CLAMP_LENGTH).trimEnd()}…` : bio;

  const { isFollowing, wasInitiallyFollowing } = useFollow();
  // Optimistic count relative to the mock's static followerCount — a real
  // per-follower list doesn't exist, so this just reflects this session's
  // own follow/unfollow action, not a synced social count.
  const followerCount =
    user.followerCount + (isFollowing(user.id) ? 1 : 0) - (wasInitiallyFollowing(user.id) ? 1 : 0);

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
        followerCount={followerCount}
        followingCount={user.followingCount}
        isOwnProfile={isOwnProfile}
        onSelectPrompts={onSelectPrompts}
        onSelectRemixes={onSelectRemixes}
      />

      {isOwnProfile ? (
        <OwnProfileActions username={user.username} />
      ) : (
        <OtherProfileActions userId={user.id} username={user.username} conversationId={conversationId} />
      )}
    </div>
  );
}
