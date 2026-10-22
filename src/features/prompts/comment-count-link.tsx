"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatCount, presetHref, promptHref, requestHref, resultHref, workflowHref } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";
import { useCommentCountDelta } from "./comment-count-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import { spaceHref } from "@/lib/spaces";

/**
 * Comment count link. Reflects the target's real, database-backed
 * `comment_count` column at load time, plus a live delta
 * (`comment-count-store`) fed by `CommentSection`, so a comment posted or
 * deleted on the same page updates it immediately.
 * `requestId` (Prompt İsteği aksiyon satırı görevi) lets the same component
 * work for a request's own social footer — pass exactly one target id,
 * matching `LikeButton`'s `contentType` pattern.
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
  requestId,
  resultId,
  workflowId,
  presetId,
  spaceId,
  baseCount,
  size = 16,
  className,
}: {
  promptId?: string;
  requestId?: string;
  resultId?: string;
  workflowId?: string;
  presetId?: string;
  /** Akışta paylaşılmış Space (docs/history/215-*): yorumlar Space sayfasının sonunda. */
  spaceId?: string;
  baseCount: number;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const delta = useCommentCountDelta(promptId ?? requestId ?? resultId ?? workflowId ?? presetId ?? spaceId);
  const count = Math.max(0, baseCount + delta);
  const baseHref = spaceId
    ? spaceHref(spaceId)
    : presetId
    ? presetHref({ id: presetId })
    : workflowId
    ? workflowHref({ id: workflowId })
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
