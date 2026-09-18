"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import type { Prompt } from "@/types";

type TabKey = "for-you" | "popular" | "following";

const TABS: { key: TabKey; label: string }[] = [
  { key: "for-you", label: "Sana Özel" },
  { key: "popular", label: "Popüler" },
  { key: "following", label: "Takip Ettiklerim" },
];

// Mirrors the creators followed on the Following page mock (see
// src/mocks — no real follow graph exists yet, see CLAUDE.md section 13).
const FOLLOWED_USER_IDS = new Set(["u1", "u3", "u5", "u7"]);

export function FeedTabs({ prompts }: { prompts: Prompt[] }) {
  const [active, setActive] = useState<TabKey>("for-you");

  const visible =
    active === "popular"
      ? [...prompts].sort((a, b) => b.likeCount - a.likeCount)
      : active === "following"
        ? prompts.filter((prompt) => FOLLOWED_USER_IDS.has(prompt.author.id))
        : prompts;

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
        <PromptGrid prompts={visible} />
      </div>
    </div>
  );
}
