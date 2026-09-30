"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatCount, generatorHref, promptHref, requestHref, resultHref, workflowHref } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";
import { useCommentCountDelta } from "./comment-count-store";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Comment count link. Reflects the target's real, database-backed
 * `comment_count` column at load time, plus a live delta
 * (`comment-count-store`) fed by `CommentSection`, so a comment posted or
 * deleted on the same page updates it immediately.
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
  generatorId,
  requestId,
  resultId,
  workflowId,
  baseCount,
  size = 16,
  className,
}: {
  promptId?: string;
  generatorSlug?: string;
  /** Only needed so the live count can follow comments posted on the same page (generators are linked by slug). */
  generatorId?: string;
  requestId?: string;
  resultId?: string;
  workflowId?: string;
  baseCount: number;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const delta = useCommentCountDelta(promptId ?? generatorId ?? requestId ?? resultId ?? workflowId);
  const count = Math.max(0, baseCount + delta);
  const baseHref = workflowId
    ? workflowHref({ id: workflowId })
    : generatorSlug
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
      title={t("comments.title")}
      aria-label={`${t("comments.title")} (${formatCount(count)})`}
    >
      <MessageCircle size={size} strokeWidth={1.75} />
      <span aria-hidden>{formatCount(count)}</span>
    </Link>
  );
}
