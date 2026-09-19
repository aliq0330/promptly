"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import { feedItemAuthorId, feedItemCreatedAt, feedItemPopularity, type FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";

type TabKey = "following" | "popular" | "for-you";

const TABS: { key: TabKey; label: string }[] = [
  { key: "following", label: "Takip Ettiklerim" },
  { key: "popular", label: "Popüler" },
  { key: "for-you", label: "Sana Özel" },
];

export function FeedTabs() {
  const [active, setActive] = useState<TabKey>("for-you");
  const { user } = useAuth();
  const { realPrompts } = useRealPrompts();
  const { realRequests } = useRealRequests();
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setFollowedIds(new Set());
      return;
    }
    fetchFollowedProfiles(user.id).then((profiles) => {
      if (!cancelled) setFollowedIds(new Set(profiles.map((profile) => profile.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const allItems = useMemo<FeedItem[]>(() => {
    const promptItems: FeedItem[] = realPrompts.map((prompt) => ({ kind: "prompt", data: prompt }));
    const requestItems: FeedItem[] = realRequests.map((request) => ({ kind: "request", data: request }));
    return [...promptItems, ...requestItems].sort((a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a));
  }, [realPrompts, realRequests]);

  const visible =
    active === "popular"
      ? [...allItems].sort((a, b) => feedItemPopularity(b) - feedItemPopularity(a))
      : active === "following"
        ? allItems.filter((item) => followedIds.has(feedItemAuthorId(item)))
        : allItems;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex gap-1 border-b border-border px-4 lg:px-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="px-4 lg:px-6">
        {active === "following" && !user ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Takip ettiklerinin paylaşımlarını görmek için{" "}
            <Link href="/login" className="font-medium text-primary underline">
              giriş yapmalısın
            </Link>
            .
          </p>
        ) : (
          <FeedGrid items={visible} />
        )}
      </div>
    </div>
  );
}
