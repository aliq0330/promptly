import { Inbox, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { GeneratorCard } from "@/features/generators/generator-card";
import { feedItemKey, type FeedItem } from "./types";

/**
 * Same CSS-columns masonry as PromptGrid (see prompt-grid.tsx), but for a
 * mixed list of prompts (any content type), prompt requests, and — since
 * Bölüm 9.36's Prompt/Generator parity pass — generators too, all through
 * the same card shell/masonry, not a separate generator feed.
 */
export function FeedGrid({
  items,
  emptyIcon = Inbox,
  emptyTitle = "Henüz gösterilecek içerik yok.",
  emptyDescription,
  emptyAction,
}: {
  items: FeedItem[];
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href: string };
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
      {items.map((item) => (
        <div key={feedItemKey(item)} className="mb-3 break-inside-avoid sm:mb-4">
          {item.kind === "prompt" ? (
            <PromptCard prompt={item.data} />
          ) : item.kind === "request" ? (
            <RequestCard request={item.data} />
          ) : (
            <GeneratorCard generator={item.data} />
          )}
        </div>
      ))}
    </div>
  );
}
