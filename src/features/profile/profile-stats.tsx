"use client";

import Link from "next/link";
import { formatCount, cn } from "@/lib/utils";

const STAT_CLASS = "flex flex-col items-start text-caption text-text-muted";
const STAT_VALUE_CLASS = "font-display text-h2 font-semibold tabular-nums leading-tight text-text";

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
    <span className={cn(STAT_CLASS, className)}>
      <strong className={STAT_VALUE_CLASS}>{formatCount(value)}</strong>
      {label}
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
      className={cn(STAT_CLASS, "rounded-sm transition-colors hover:text-text", className)}
    >
      <strong className={STAT_VALUE_CLASS}>{formatCount(value)}</strong>
      {label}
    </button>
  );
}

/**
 * Only wires up the interactions CLAUDE.md section 7 asks for that a real
 * data source actually supports: the prompt count switches this profile's
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
  followerCount,
  followingCount,
  isOwnProfile,
  onSelectPrompts,
}: {
  promptCount: number;
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  onSelectPrompts: () => void;
}) {
  return (
    <div className="flex flex-wrap items-stretch divide-x divide-border-soft border-t border-border-soft pt-4 *:px-5 *:first:pl-0">
      <StatButton label="prompt" value={promptCount} onClick={onSelectPrompts} />
      <Stat label="takipçi" value={followerCount} />
      {isOwnProfile ? (
        <Link href="/following" className={cn(STAT_CLASS, "rounded-sm transition-colors hover:text-text")}>
          <strong className={STAT_VALUE_CLASS}>{formatCount(followingCount)}</strong>
          takip
        </Link>
      ) : (
        <Stat label="takip" value={followingCount} />
      )}
    </div>
  );
}
