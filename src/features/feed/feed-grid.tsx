import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { feedItemKey, type FeedItem } from "./types";

/**
 * Same CSS-columns masonry as PromptGrid (see prompt-grid.tsx), but for a
 * mixed list of prompts (any content type) and prompt requests.
 */
export function FeedGrid({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz gösterilecek içerik yok.</p>
    );
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {items.map((item) => (
        <div key={feedItemKey(item)} className="mb-4 break-inside-avoid">
          {item.kind === "prompt" ? (
            <PromptCard prompt={item.data} />
          ) : (
            <RequestCard request={item.data} />
          )}
        </div>
      ))}
    </div>
  );
}
