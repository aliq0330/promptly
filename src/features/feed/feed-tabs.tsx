"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import { feedItemAuthorId, feedItemPopularity, type FeedItem } from "./types";
import { useFollow } from "@/features/profile/follow-provider";

type TabKey = "following" | "popular" | "for-you";

const TABS: { key: TabKey; label: string }[] = [
  { key: "following", label: "Takip Ettiklerim" },
  { key: "popular", label: "Popüler" },
  { key: "for-you", label: "Sana Özel" },
];

export function FeedTabs({ items }: { items: FeedItem[] }) {
  const [active, setActive] = useState<TabKey>("for-you");
  const { isFollowing } = useFollow();

  const visible =
    active === "popular"
      ? [...items].sort((a, b) => feedItemPopularity(b) - feedItemPopularity(a))
      : active === "following"
        ? items.filter((item) => isFollowing(feedItemAuthorId(item)))
        : items;

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
