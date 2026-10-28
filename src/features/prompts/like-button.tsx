"use client";

import { ReactionButton } from "@/features/reactions/reaction-button";
import type { LikeableContentType } from "@/lib/supabase/likes";

/**
 * The like control of every surface — since docs/history/265-* it is the reaction button: pressing it opens the six-reaction picker (Telegram
 * emojis + effects); every reaction is one like, so the count stays the total. Persistence and the signed-out login dialog live in
 * `ReactionButton` / `useLikeState`. The name and props stay as they were, so no call site changed.
 */
export function LikeButton({
  id,
  likeCount,
  contentType = "prompt",
  size = 16,
  className,
}: {
  id: string;
  likeCount: number;
  /** Defaults to "prompt" — every existing prompt call site keeps working unchanged. */
  contentType?: LikeableContentType;
  size?: number;
  className?: string;
}) {
  return <ReactionButton id={id} likeCount={likeCount} contentType={contentType} size={size} className={className} />;
}
