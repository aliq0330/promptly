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
