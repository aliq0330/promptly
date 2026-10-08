"use client";

import { useMemo } from "react";
import { AsideLinkRow, AsideSection } from "@/features/content/detail-parts";
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
    <AsideSection id="related-requests-title" title={t("request.relatedRequests")}>
      <ul className="divide-y divide-border-soft">
        {related.map((item) => (
          <li key={item.id}>
            <AsideLinkRow href={requestHref(item)} icon={Sparkles} title={item.title} meta={item.author.displayName} />
          </li>
        ))}
      </ul>
    </AsideSection>
  );
}
