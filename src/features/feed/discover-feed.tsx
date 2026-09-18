"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import { feedItemCreatedAt, type FeedItem } from "./types";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { useRequests } from "@/features/requests/requests-provider";

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "image", label: "Görsel" },
  { key: "text", label: "Metin" },
  { key: "video", label: "Video" },
  { key: "code", label: "Kod" },
  { key: "music", label: "Müzik" },
  { key: "request", label: "İstekler" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function DiscoverFeed({ items }: { items: FeedItem[] }) {
  const [active, setActive] = useState<FilterKey>("all");
  const { localPrompts } = useLocalPrompts();
  const { allRequests } = useRequests();

  const allItems = useMemo<FeedItem[]>(() => {
    const localRequestItems: FeedItem[] = allRequests
      .filter((request) => request.id.startsWith("local-req-"))
      .map((request) => ({ kind: "request", data: request }));
    const localPromptItems: FeedItem[] = localPrompts.map((prompt) => ({ kind: "prompt", data: prompt }));
    return [...items, ...localRequestItems, ...localPromptItems].sort(
      (a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a),
    );
  }, [items, allRequests, localPrompts]);

  const filtered = useMemo(() => {
    if (active === "all") return allItems;
    if (active === "request") return allItems.filter((item) => item.kind === "request");
    return allItems.filter((item) => item.kind === "prompt" && item.data.contentType === active);
  }, [allItems, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActive(filter.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active === filter.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <FeedGrid items={filtered} />
    </div>
  );
}
