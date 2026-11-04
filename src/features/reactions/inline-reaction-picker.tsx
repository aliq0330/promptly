"use client";

import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useLikeState, type ReactResult } from "@/features/prompts/use-like-state";
import type { ReactionKey } from "@/lib/reactions";
import type { ReactionTargetType } from "@/lib/supabase/likes";
import { cn } from "@/lib/utils";
import { ReactionGrid } from "./reaction-picker";
import { playReactionEffect } from "./reaction-player";

/**
 * The reaction picker laid OPEN in the page (docs/history/327-*): the notification detail shows the same six animated emojis as the popover of a post's
 * heart, without the press that opens it. Same state and rules as `ReactionButton` (`useLikeState`): nothing is selected until an emoji is picked, the viewer's
 * current reaction is highlighted, picking it again takes it back; the chosen emoji plays its animation and Telegram's big effect.
 */
export function InlineReactionPicker({
  id,
  likeCount,
  contentType = "comment",
  onResult,
  className,
}: {
  id: string;
  likeCount: number;
  contentType?: ReactionTargetType;
  onResult?: (result: ReactResult, prev: ReactionKey | null, next: ReactionKey | null) => void;
  className?: string;
}) {
  const { reaction, react, canLike } = useLikeState(id, likeCount, contentType);
  const { requireAuth } = useAuthPrompt();

  function choose(picked: ReactionKey | null, element?: HTMLElement | null) {
    if (!canLike) {
      requireAuth("like");
      return;
    }
    const next = picked !== null && picked === reaction ? null : picked;
    const prev = reaction;
    if (next && element) playReactionEffect(next, element);
    void react(next).then((result) => {
      if (result !== "failed" && result !== "ignored") onResult?.(result, prev, next);
    });
  }

  return (
    <div data-inline-reaction-picker="" className={cn("rounded-[28px] border border-border-soft bg-surface p-2", className)}>
      <ReactionGrid current={reaction} onChoose={choose} playOnChoose />
    </div>
  );
}
