"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { useLikeState } from "./use-like-state";

/** Real, working like toggle — genuinely persisted to Supabase; shows a login link instead while signed out. */
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
  const { isLiked, likeCount: count, toggle, canLike } = useLikeState(id, likeCount);

  const content = (
    <>
      <Heart size={size} fill={isLiked ? "currentColor" : "none"} />
      {formatCount(count)}
    </>
  );

  const sharedClassName = cn(
    "flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
    isLiked ? "text-primary" : "text-text-muted",
    className,
  );

  if (!canLike) {
    return (
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        title="Beğenmek için giriş yapmalısın"
        className={sharedClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      aria-pressed={isLiked}
      title={isLiked ? "Beğenmekten vazgeç" : "Beğen"}
      className={sharedClassName}
    >
      {content}
    </button>
  );
}
