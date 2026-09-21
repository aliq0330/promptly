"use client";

import Link from "next/link";
import { formatCount, cn } from "@/lib/utils";

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className={cn("text-sm text-text-muted", className)}>
      <strong className="text-text">{formatCount(value)}</strong> {label}
    </span>
  );
}

function StatButton({
  label,
  value,
  onClick,
  className,
}: {
  label: string;
  value: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-sm text-sm text-text-muted transition-colors hover:text-text", className)}
    >
      <strong className="text-text">{formatCount(value)}</strong> {label}
    </button>
  );
}

/**
 * Only wires up the interactions CLAUDE.md section 7 asks for that a real
 * data source actually supports: prompt/remix counts switch this profile's
 * own tabs (no navigation needed), and — own profile only — the following
 * count links to the existing `/following` page. There is no followers- or
 * following-list data for an arbitrary OTHER user anywhere in the mock
 * model (only a static count), so the follower count is never a link
 * anywhere, and the following count is only a link on your own profile —
 * building a fake list screen for data that doesn't exist would violate
 * the "don't fake it" rule.
 */
export function ProfileStats({
  promptCount,
  remixCount,
  followerCount,
  followingCount,
  isOwnProfile,
  onSelectPrompts,
  onSelectRemixes,
}: {
  promptCount: number;
  remixCount: number;
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  onSelectPrompts: () => void;
  onSelectRemixes: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
      <StatButton label="prompt" value={promptCount} onClick={onSelectPrompts} />
      <Stat label="takipçi" value={followerCount} />
      {isOwnProfile ? (
        <Link
          href="/following"
          className="rounded-sm text-sm text-text-muted transition-colors hover:text-text"
        >
          <strong className="text-text">{formatCount(followingCount)}</strong> takip
        </Link>
      ) : (
        <Stat label="takip" value={followingCount} />
      )}
      <StatButton
        label="türetme"
        value={remixCount}
        onClick={onSelectRemixes}
        className="hidden sm:inline"
      />
    </div>
  );
}
