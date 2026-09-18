"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { useComments } from "./comment-provider";

/**
 * Comment count link that reflects genuinely-posted local comments on top
 * of the mock's static commentCount, same optimistic-adjustment idea used
 * for likes/follows.
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
  const { getLocalComments } = useComments();
  const count = baseCount + getLocalComments(promptId).length;

  return (
    <Link
      href={`/prompts/${promptId}`}
      className={cn("flex items-center gap-1 text-xs hover:text-text", className)}
      title="Yorumlar"
    >
      <MessageCircle size={size} />
      {formatCount(count)}
    </Link>
  );
}
