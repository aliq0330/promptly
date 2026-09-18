"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import { feedItemAuthorId, feedItemPopularity, type FeedItem } from "./types";

type TabKey = "following" | "popular" | "for-you";

const TABS: { key: TabKey; label: string }[] = [
  { key: "following", label: "Takip Ettiklerim" },
  { key: "popular", label: "Popüler" },
  { key: "for-you", label: "Sana Özel" },
];

// Mirrors the creators followed on the Following page mock (see
// src/mocks — no real follow graph exists yet, see CLAUDE.md section 13).
const FOLLOWED_USER_IDS = new Set(["u1", "u3", "u5", "u7"]);

export function FeedTabs({ items }: { items: FeedItem[] }) {
  const [active, setActive] = useState<TabKey>("for-you");

  const visible =
    active === "popular"
      ? [...items].sort((a, b) => feedItemPopularity(b) - feedItemPopularity(a))
      : active === "following"
        ? items.filter((item) => FOLLOWED_USER_IDS.has(feedItemAuthorId(item)))
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
