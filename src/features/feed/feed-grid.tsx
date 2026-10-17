"use client";

import { Inbox, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { feedItemKey, type FeedItem } from "./types";
import { Reveal } from "@/components/ui/reveal";
import { ContentStream } from "@/features/content/content-card";

/**
 * Same CSS-columns masonry as PromptGrid (see prompt-grid.tsx), but for a
 * mixed list of prompts (any content type), prompt requests, and — since
 * Bölüm 9.36's Prompt/Generator parity pass — generators too, all through
 * the same card shell/masonry, not a separate generator feed.
 */
export function FeedGrid({
  items,
  emptyIcon = Inbox,
  emptyTitle,
  emptyDescription,
  emptyAction,
  layout = "grid",
}: {
  items: FeedItem[];
  /** "stream" = Home's single social column (Meydan, docs/history/190-*); "grid" = the masonry everywhere else. */
  layout?: "grid" | "stream";
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href: string };
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? t("feed.emptyDefault")}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const card = (item: FeedItem) =>
    item.kind === "prompt" ? (
      <PromptCard prompt={item.data} />
    ) : item.kind === "request" ? (
      <RequestCard request={item.data} />
    ) : item.kind === "preset" ? (
      <PresetCard preset={item.data} />
    ) : (
      <WorkflowCard workflow={item.data} />
    );

  // Home: one hairline-separated stream (Meydan Faz 6) — no box per post.
  if (layout === "stream") {
    return (
      <ContentStream>
        {items.map((item, index) => (
          <Reveal key={feedItemKey(item)} index={index}>
            {card(item)}
          </Reveal>
        ))}
      </ContentStream>
    );
  }

  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
      {items.map((item, index) => (
        <Reveal key={feedItemKey(item)} index={index} className="pb-3 break-inside-avoid sm:pb-4">
          {card(item)}
        </Reveal>
      ))}
    </div>
  );
}
