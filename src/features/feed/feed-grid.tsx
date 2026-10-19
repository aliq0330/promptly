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
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

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
  /** "home" = Ana Sayfa's column next to its right rail (two columns at most); "grid" = the full-width lists (up to three). */
  layout?: "grid" | "home";
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

  return (
    <ContentGrid columns={layout === "home" ? "sm:columns-2" : undefined}>
      {items.map((item, index) => (
        <Reveal key={feedItemKey(item)} index={index} className={CONTENT_GRID_ITEM_CLASS}>
          {card(item)}
        </Reveal>
      ))}
    </ContentGrid>
  );
}
