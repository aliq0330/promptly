"use client";

import { Inbox, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { GeneratorCard } from "@/features/generators/generator-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { feedItemKey, type FeedItem } from "./types";
import { staggerStyle } from "@/components/ui/entrance";

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
}: {
  items: FeedItem[];
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

  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
      {items.map((item, index) => (
        <div key={feedItemKey(item)} className="pb-3 animate-grid-in break-inside-avoid sm:pb-4" style={staggerStyle(index)}>
          {item.kind === "prompt" ? (
            <PromptCard prompt={item.data} />
          ) : item.kind === "request" ? (
            <RequestCard request={item.data} />
          ) : item.kind === "generator" ? (
            <GeneratorCard generator={item.data} />
          ) : item.kind === "preset" ? (
            <PresetCard preset={item.data} />
          ) : (
            <WorkflowCard workflow={item.data} />
          )}
        </div>
      ))}
    </div>
  );
}
