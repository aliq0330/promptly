"use client";

import Link from "next/link";
import { formatCount, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

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
  postCounts,
  followerCount,
  followingCount,
  isOwnProfile,
  onSelectPosts,
}: {
  postCounts: { prompts: number; requests: number; generators: number; workflows: number };
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  onSelectPosts: () => void;
}) {
  const { t } = useTranslation();
  const total = postCounts.prompts + postCounts.requests + postCounts.generators + postCounts.workflows;
  return (
    <div className="space-y-3 border-t border-border-soft pt-4">
    <div className="flex flex-wrap items-stretch divide-x divide-border-soft *:px-5 *:first:pl-0">
      <StatButton label={t("profile.postsSuffix")} value={total} onClick={onSelectPosts} />
      <Stat label={t("profile.followersSuffix")} value={followerCount} />
      {isOwnProfile ? (
        <Link href="/following" className={cn(STAT_CLASS, "rounded-sm transition-colors hover:text-text")}>
          <strong className={STAT_VALUE_CLASS}>{formatCount(followingCount)}</strong>
          {t("profile.followingSuffix")}
        </Link>
      ) : (
        <Stat label={t("profile.followingSuffix")} value={followingCount} />
      )}
    </div>
    <p className="text-caption text-text-muted">
      {[
        `${postCounts.prompts} Prompt`,
        `${postCounts.requests} ${t("profile.postKindRequest")}`,
        `${postCounts.generators} Generator`,
        `${postCounts.workflows} Workflow`,
      ].join(" · ")}
    </p>
    </div>
  );
}
