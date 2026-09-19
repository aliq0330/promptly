"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn, formatCount, promptHref } from "@/lib/utils";

/**
 * Comment count link. Reflects the prompt's real, database-backed
 * `comment_count` column at the time the card/detail page loaded — a
 * comment posted afterwards on the same page doesn't retroactively bump
 * this number without a reload (`CommentSection`'s own "Yorumlar (N)"
 * heading is always live; this is a known, documented, cosmetic gap).
 */
export function CommentCountLink({
  promptId,
  baseCount,
  size = 14,
  className,
}: {
  promptId: string;
  baseCount: number;
  size?: number;
  className?: string;
}) {
  return (
    <Link
      href={promptHref({ id: promptId })}
      className={cn("flex items-center gap-1 text-xs hover:text-text", className)}
      title="Yorumlar"
    >
      <MessageCircle size={size} />
      {formatCount(baseCount)}
    </Link>
  );
}
