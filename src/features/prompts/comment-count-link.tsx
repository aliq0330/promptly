"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatCount, generatorHref, promptHref, requestHref, resultHref } from "@/lib/utils";
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
 *
 * The href always ends in `#comments` — every detail page's own comment
 * section carries that same id (`scroll-mt-20`, matching the request
 * detail page's `#request-responses` anchor), so clicking this from a
 * CARD lands directly on the actual comment thread instead of the top of
 * the page, and clicking it from the detail page itself just scrolls down
 * to it. No new navigation/scroll system — plain anchor behavior.
 *
 * `resultId` (Kullanıcı Sonuçları) follows the same one-of pattern.
 */
export function CommentCountLink({
  promptId,
  generatorSlug,
  requestId,
  resultId,
  baseCount,
  size = 16,
  className,
}: {
  promptId?: string;
  generatorSlug?: string;
  requestId?: string;
  resultId?: string;
  baseCount: number;
  size?: number;
  className?: string;
}) {
  const baseHref = generatorSlug
    ? generatorHref({ slug: generatorSlug })
    : requestId
      ? requestHref({ id: requestId })
      : resultId
        ? resultHref({ id: resultId })
        : promptHref({ id: promptId! });
  const href = `${baseHref}#comments`;
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
