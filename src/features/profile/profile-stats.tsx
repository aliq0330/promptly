"use client";

import Link from "next/link";
import { formatCount, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

// Meydan: one inline line — "148 gönderi · 1.284 takipçi · 312 takip".
const STAT_CLASS = "inline-flex items-baseline gap-1.5 text-body text-text-secondary";
const STAT_VALUE_CLASS = "font-semibold tabular-nums text-text";

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
 * counts link to the existing `/following` and `/followers` pages. There is no followers- or
 * following-list data for an arbitrary OTHER user anywhere in the mock
 * model (only a static count), so the follower count is never a link
 * anywhere, and the following count is only a link on your own profile —
 * building a fake list screen for data that doesn't exist would violate
 * the "don't fake it" rule.
 */
export function ProfileStats({
  postCounts,
  followerCount,
  followingCount,
  isOwnProfile,
  onSelectPosts,
}: {
  postCounts: { prompts: number; requests: number; workflows: number; presets: number };
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  onSelectPosts: () => void;
}) {
  const { t } = useTranslation();
  const total = postCounts.prompts + postCounts.requests + postCounts.workflows + postCounts.presets;
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1 sm:justify-start">
      <StatButton label={t("profile.postsSuffix")} value={total} onClick={onSelectPosts} />
      {isOwnProfile ? (
        <Link href="/followers" className={cn(STAT_CLASS, "rounded-sm transition-colors hover:text-text")}>
          <strong className={STAT_VALUE_CLASS}>{formatCount(followerCount)}</strong>
          {t("profile.followersSuffix")}
        </Link>
      ) : (
        <Stat label={t("profile.followersSuffix")} value={followerCount} />
      )}
      {isOwnProfile ? (
        <Link href="/following" className={cn(STAT_CLASS, "rounded-sm transition-colors hover:text-text")}>
          <strong className={STAT_VALUE_CLASS}>{formatCount(followingCount)}</strong>
          {t("profile.followingSuffix")}
        </Link>
      ) : (
        <Stat label={t("profile.followingSuffix")} value={followingCount} />
      )}
    </div>
  );
}
