"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requestHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useRealRequests } from "./real-requests-provider";
import type { PromptRequest } from "@/types";

/**
 * "Benzer prompt istekleri" — ranked from the already-loaded shared request
 * cache (no new API), same rule as `RelatedPrompts`: shared tags weigh most,
 * same author / content type add a little. Renders nothing when nothing is
 * genuinely related.
 */
export function RelatedRequests({ request, limit = 4 }: { request: PromptRequest; limit?: number }) {
  const { t } = useTranslation();
  const { realRequests } = useRealRequests();

  const related = useMemo(() => {
    const tagSet = new Set(request.tags.map((tag) => tag.slug));
    return realRequests
      .filter((candidate) => candidate.id !== request.id && !candidate.deletedAt)
      .map((candidate) => {
        const sharedTags = candidate.tags.filter((tag) => tagSet.has(tag.slug)).length;
        const score =
          sharedTags * 3 +
          (candidate.author.id === request.author.id ? 1 : 0) +
          (candidate.contentType && candidate.contentType === request.contentType ? 1 : 0);
        return { candidate, score };
      })
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || b.candidate.likeCount - a.candidate.likeCount)
      .slice(0, limit)
      .map(({ candidate }) => candidate);
  }, [realRequests, request, limit]);

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-requests-title" className="space-y-2">
      <h2 id="related-requests-title" className="px-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
        {t("request.relatedRequests")}
      </h2>
      <ul className="divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface">
        {related.map((item) => (
          <li key={item.id}>
            <Link href={requestHref(item)} className="flex items-start gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-soft">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                <Sparkles size={14} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="line-clamp-2 break-words text-label font-semibold text-text">{item.title}</span>
                <span className="mt-0.5 block truncate text-caption text-text-muted">{item.author.displayName}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
