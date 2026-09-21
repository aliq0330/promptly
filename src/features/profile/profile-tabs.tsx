"use client";

import { cn } from "@/lib/utils";

export type ProfileTabKey = "prompts" | "remixes" | "requests" | "saved" | "liked" | "about";

export function ProfileTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: ProfileTabKey; label: string; count?: number }[];
  active: ProfileTabKey;
  onChange: (tab: ProfileTabKey) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-border px-4 lg:px-6 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-text-muted hover:text-text",
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1 text-xs text-text-muted">({tab.count})</span>}
        </button>
      ))}
    </div>
  );
}
