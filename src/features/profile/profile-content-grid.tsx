"use client";

import type { ReactNode } from "react";
import { useViewMode } from "@/features/content/view-mode-store";
import { FocusGrid } from "@/features/focus/focus-grid";
import { PromptCard } from "@/features/prompts/prompt-card";
import type { Prompt } from "@/types";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

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
  const [mode] = useViewMode();
  if (prompts.length === 0) return <>{emptyState}</>;
  if (mode === "focus") return <FocusGrid items={prompts.map((data) => ({ kind: "prompt" as const, data }))} />;

  return (
    <ContentGrid>
      {prompts.map((prompt) => (
        <div key={prompt.id} className={CONTENT_GRID_ITEM_CLASS}>
          <PromptCard
            prompt={prompt}
            onDeleted={isOwnProfile ? () => onDeleted(prompt.id) : undefined}
          />
        </div>
      ))}
    </ContentGrid>
  );
}
