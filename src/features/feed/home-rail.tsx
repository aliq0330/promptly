"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";
import { FollowButton } from "@/features/profile/follow-button";
import { useAuth } from "@/features/auth/auth-provider";
import { useFollowFeedState } from "@/features/following/follow-feed-store";
import { FollowingRail } from "@/features/following/following-rail";
import { fetchCreatorsPage } from "@/lib/supabase/profiles";
import { profileHref } from "@/lib/utils";
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
  const { user } = useAuth();
  const { tab } = useFollowFeedState();
  // Takip Ettiklerin açıkken sütun o akışın sütunudur; Sana Özel'de yalnız Haftalık tema + Önerilen yaratıcılar (docs/history/451-*: gündem
  // ve araçlar Keşfet'te, aynı şey iki sayfada gösterilmez).
  if (user && tab === "following") return <FollowingRail />;
  return (
    <div className="space-y-4">
      <WeeklyChallengeBanner />
      <SuggestedCreatorsCard />
    </div>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-soft p-4">
      <h2 className="mb-3 font-display text-h3 font-bold text-text">{title}</h2>
      {children}
    </section>
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
