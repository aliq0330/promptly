import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { FollowButton } from "./follow-button";
import { formatCount, profileHref } from "@/lib/utils";
import type { UserProfile } from "@/types";

export function CreatorRow({ user }: { user: UserProfile }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
      <Link href={profileHref(user)} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={user.avatarUrl} alt={user.displayName} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
          <p className="truncate text-xs text-text-muted">{formatCount(user.followerCount)} takipçi</p>
        </div>
      </Link>
      <FollowButton userId={user.id} className="shrink-0" />
    </div>
  );
}
