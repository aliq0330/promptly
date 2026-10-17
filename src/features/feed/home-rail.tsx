"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";
import { FollowButton } from "@/features/profile/follow-button";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchTrendingTags, type TrendingTag } from "@/lib/supabase/tags";
import { fetchCreatorsPage } from "@/lib/supabase/profiles";
import { profileHref, tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

/**
 * Home's right column on wide screens (Meydan, docs/history/190-*): the
 * running weekly theme, what is trending this week and a few creators to
 * follow. Every block shows real data only — a block with nothing to show
 * (no theme, no recent tag usage, a failed request) is left out rather than
 * filled with placeholders.
 */
export function HomeRail() {
  return (
    <div className="space-y-4">
      <WeeklyChallengeBanner />
      <TrendingTagsCard />
      <SuggestedCreatorsCard />
    </div>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-soft p-4">
      <h2 className="mb-3 font-display text-[1.1875rem] font-bold tracking-[-0.02em] text-text">{title}</h2>
      {children}
    </section>
  );
}

function TrendingTagsCard() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TrendingTag[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTrendingTags(5).then((rows) => {
      if (!cancelled) setTags(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tags || tags.length === 0) return null;
  return (
    <RailCard title={t("home.railTrending")}>
      <ul className="space-y-3">
        {tags.map((tag) => (
          <li key={tag.slug}>
            <Link href={tagHref(tag)} className="group block rounded-sm">
              <span className="block truncate font-semibold text-text group-hover:text-primary">#{tag.label}</span>
              <span className="text-caption text-text-muted">{t("home.railTrendCount", { count: tag.recentCount })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function SuggestedCreatorsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [creators, setCreators] = useState<UserProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCreatorsPage(null, 4)
      .then((page) => {
        if (!cancelled) setCreators(page.creators);
      })
      .catch(() => {
        if (!cancelled) setCreators([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (creators ?? []).filter((creator) => creator.id !== user?.id).slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <RailCard title={t("home.railSuggested")}>
      <ul className="space-y-3">
        {visible.map((creator) => (
          <li key={creator.id} className="flex items-center gap-3">
            <Link href={profileHref(creator)} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm">
              <Avatar src={creator.avatarUrl} alt={creator.displayName} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-small font-semibold text-text">{creator.displayName}</span>
                <span className="block truncate text-caption text-text-muted">@{creator.username}</span>
              </span>
            </Link>
            <FollowButton user={creator} />
          </li>
        ))}
      </ul>
    </RailCard>
  );
}
