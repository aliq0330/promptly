"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatCount, generatorHref, promptHref, requestHref } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";

/**
 * Comment count link. Reflects the target's real, database-backed
 * `comment_count` column at the time the card/detail page loaded — a
 * comment posted afterwards on the same page doesn't retroactively bump
 * this number without a reload (`CommentSection`'s own "Yorumlar (N)"
 * heading is always live; this is a known, documented, cosmetic gap).
 * `generatorSlug` (Bölüm 9.34) and `requestId` (Prompt İsteği aksiyon
 * satırı görevi) let the same component work for a real generator's/
 * request's own social footer — pass exactly one of `promptId`/
 * `generatorSlug`/`requestId`, matching `LikeButton`'s `contentType`
 * pattern.
 */
export function CommentCountLink({
  promptId,
  generatorSlug,
  requestId,
  baseCount,
  size = 16,
  className,
}: {
  promptId?: string;
  generatorSlug?: string;
  requestId?: string;
  baseCount: number;
  size?: number;
  className?: string;
}) {
  const href = generatorSlug
    ? generatorHref({ slug: generatorSlug })
    : requestId
      ? requestHref({ id: requestId })
      : promptHref({ id: promptId! });
  return (
    <Link
      href={href}
      className={contentActionClassName(false, className)}
      title="Yorumlar"
      aria-label={`Yorumlar (${formatCount(baseCount)})`}
    >
      <MessageCircle size={size} strokeWidth={1.75} />
      <span aria-hidden>{formatCount(baseCount)}</span>
    </Link>
  );
}
