import type { ReactNode } from "react";
import { PromptCard } from "@/features/prompts/prompt-card";
import { ProfileContentMenu } from "./profile-content-menu";
import type { Prompt } from "@/types";

/**
 * Same CSS multi-column masonry as the shared PromptGrid (CSS Grid
 * stretches short cards to the tallest row-mate, columns don't) — kept as
 * its own small component instead of extending PromptGrid because only the
 * profile view ever needs the per-card management menu overlay.
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
        <div key={prompt.id} className="relative mb-4 break-inside-avoid">
          {isOwnProfile && (
            <div className="absolute right-2 top-2 z-20">
              <ProfileContentMenu promptId={prompt.id} onDeleted={() => onDeleted(prompt.id)} />
            </div>
          )}
          <PromptCard prompt={prompt} />
        </div>
      ))}
    </div>
  );
}
