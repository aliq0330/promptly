"use client";

import { Avatar } from "@/components/ui/avatar";
import { FollowButton } from "./follow-button";
import { useFollow } from "./follow-provider";
import { formatCount } from "@/lib/utils";
import type { UserProfile } from "@/types";

export function ProfileHeader({
  user,
  promptCount,
  isOwnProfile = false,
}: {
  user: UserProfile;
  promptCount: number;
  isOwnProfile?: boolean;
}) {
  const { isFollowing, wasInitiallyFollowing } = useFollow();
  // Optimistic count relative to the mock's static followerCount — a real
  // per-follower list doesn't exist, so this just reflects this session's
  // own follow/unfollow action, not a synced social count.
  const followerCount =
    user.followerCount + (isFollowing(user.id) ? 1 : 0) - (wasInitiallyFollowing(user.id) ? 1 : 0);

  return (
    <div className="flex flex-col items-center gap-3 px-4 pt-8 text-center lg:px-6">
      <Avatar src={user.avatarUrl} alt={user.displayName} size={80} />
      <div>
        <h1 className="text-lg font-semibold text-text">{user.displayName}</h1>
        <p className="text-sm text-text-muted">@{user.username}</p>
      </div>
      {user.bio && <p className="max-w-sm text-sm text-text-muted">{user.bio}</p>}
      <div className="flex items-center gap-4 text-sm text-text-muted">
        <span>
          <strong className="text-text">{formatCount(promptCount)}</strong> prompt
        </span>
        <span>
          <strong className="text-text">{formatCount(followerCount)}</strong> takipçi
        </span>
        <span>
          <strong className="text-text">{formatCount(user.followingCount)}</strong> takip
        </span>
      </div>
      {!isOwnProfile && <FollowButton userId={user.id} />}
    </div>
  );
}
