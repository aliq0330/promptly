"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { FeedGrid } from "./feed-grid";
import type { FeedItem } from "./types";

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

  const filtered = useMemo(() => {
    if (active === "all") return items;
    if (active === "request") return items.filter((item) => item.kind === "request");
    return items.filter((item) => item.kind === "prompt" && item.data.contentType === active);
  }, [items, active]);

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
