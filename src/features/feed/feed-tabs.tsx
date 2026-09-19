"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import { feedItemAuthorId, feedItemCreatedAt, feedItemPopularity, type FeedItem } from "./types";
import { useFollow } from "@/features/profile/follow-provider";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRequests } from "@/features/requests/requests-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";

type TabKey = "following" | "popular" | "for-you";

const TABS: { key: TabKey; label: string }[] = [
  { key: "following", label: "Takip Ettiklerim" },
  { key: "popular", label: "Popüler" },
  { key: "for-you", label: "Sana Özel" },
];

export function FeedTabs({ items }: { items: FeedItem[] }) {
  const [active, setActive] = useState<TabKey>("for-you");
  const { isFollowing } = useFollow();
  const { localPrompts } = useLocalPrompts();
  const { realPrompts } = useRealPrompts();
  const { allRequests } = useRequests();
  const { realRequests } = useRealRequests();

  // Real requests/answers created in this browser (prompt-request module),
  // genuinely real prompts, and genuinely real requests published to
  // Supabase (CLAUDE.md Bölüm 21) all belong in the same mixed feed as the
  // server-rendered mock items — merged client-side since none of them are
  // known at build time.
  const allItems = useMemo<FeedItem[]>(() => {
    const localRequestItems: FeedItem[] = allRequests
      .filter((request) => request.id.startsWith("local-req-"))
      .map((request) => ({ kind: "request", data: request }));
    const localPromptItems: FeedItem[] = localPrompts.map((prompt) => ({ kind: "prompt", data: prompt }));
    const realPromptItems: FeedItem[] = realPrompts.map((prompt) => ({ kind: "prompt", data: prompt }));
    const realRequestItems: FeedItem[] = realRequests.map((request) => ({ kind: "request", data: request }));
    return [...items, ...localRequestItems, ...localPromptItems, ...realPromptItems, ...realRequestItems].sort(
      (a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a),
    );
  }, [items, allRequests, localPrompts, realPrompts, realRequests]);

  const visible =
    active === "popular"
      ? [...allItems].sort((a, b) => feedItemPopularity(b) - feedItemPopularity(a))
      : active === "following"
        ? allItems.filter((item) => isFollowing(feedItemAuthorId(item)))
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
        <FeedGrid items={visible} />
      </div>
    </div>
  );
}
