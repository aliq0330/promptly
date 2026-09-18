"use client";

import { Heart } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { useLike } from "./like-save-provider";

/**
 * Real, working like toggle (see CLAUDE.md section 14) — persisted to
 * localStorage via LikeProvider. Works for both prompts and request
 * responses since their ids never collide ("p*" vs "rr*").
 */
export function LikeButton({
  id,
  likeCount,
  size = 14,
  className,
}: {
  id: string;
  likeCount: number;
  size?: number;
  className?: string;
}) {
  const { isLiked, wasInitiallyLiked, toggleLike } = useLike();
  const liked = isLiked(id);
  // Optimistic count relative to the mock's static likeCount, same
  // technique ProfileHeader uses for the follower count.
  const count = likeCount + (liked ? 1 : 0) - (wasInitiallyLiked(id) ? 1 : 0);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleLike(id);
      }}
      aria-pressed={liked}
      title={liked ? "Beğenmekten vazgeç" : "Beğen"}
      className={cn(
        "flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
        liked ? "text-primary" : "text-text-muted",
        className,
      )}
    >
      <Heart size={size} fill={liked ? "currentColor" : "none"} />
      {formatCount(count)}
    </button>
  );
}
