import type { ReactNode } from "react";
import { PromptCard } from "@/features/prompts/prompt-card";
import type { Prompt } from "@/types";

/**
 * Same CSS multi-column masonry as the shared PromptGrid (CSS Grid
 * stretches short cards to the tallest row-mate, columns don't). Each
 * card's own header now carries its three-dot menu (copy link, and for
 * the card's own author, duplicate/delete) — `onDeleted` only matters when
 * `isOwnProfile`, since only then can the menu's delete action ever fire.
 */
export function ProfileContentGrid({
  prompts,
  isOwnProfile,
  onDeleted,
  emptyState,
}: {
  prompts: Prompt[];
  isOwnProfile: boolean;
  onDeleted: (promptId: string) => void;
  emptyState: ReactNode;
}) {
  if (prompts.length === 0) return <>{emptyState}</>;

  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {prompts.map((prompt) => (
        <div key={prompt.id} className="mb-4 break-inside-avoid">
          <PromptCard
            prompt={prompt}
            onDeleted={isOwnProfile ? () => onDeleted(prompt.id) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
