import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, profileHref } from "@/lib/utils";
import { FollowButton } from "./follow-button";
import type { UserProfile } from "@/types";

/** Compact creator tile (Explore → Yaratıcılar, "Öne çıkan yaratıcılar" strips). */
export function CreatorCard({ creator }: { creator: UserProfile }) {
  return (
    <article className="group relative flex flex-col gap-3 rounded-lg border border-border-soft bg-surface p-4 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border hover:shadow-card-hover">
      <div className="flex items-center gap-3">
        <Avatar src={creator.avatarUrl} alt={creator.displayName} size={44} />
        <div className="min-w-0 flex-1 leading-tight">
          <h3 className="truncate text-label font-semibold text-text">
            <Link href={profileHref(creator)} className="relative z-10 hover:text-primary">
              {creator.displayName}
            </Link>
          </h3>
          <p className="truncate text-caption text-text-muted">@{creator.username}</p>
        </div>
      </div>
      {creator.bio && <p className="line-clamp-2 text-caption text-text-secondary">{creator.bio}</p>}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">
          <span className="font-semibold tabular-nums text-text">{formatCount(creator.followerCount)}</span> takipçi
        </span>
        <FollowButton user={creator} className="relative z-10" />
      </div>
      <Link href={profileHref(creator)} className="absolute inset-0 z-0 rounded-lg" aria-hidden tabIndex={-1} />
    </article>
  );
}
