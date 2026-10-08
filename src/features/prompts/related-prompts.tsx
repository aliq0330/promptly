"use client";

import { useMemo } from "react";
import { AsideLinkRow, AsideSection } from "@/features/content/detail-parts";
import { promptHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { useRealPrompts } from "./real-prompts-provider";
import type { Prompt } from "@/types";

/**
 * "Benzer promptlar" — ranked from the already-loaded shared prompt cache
 * (no new API): shared tags weigh most, same author and same content type
 * add a little. Renders nothing when there's nothing genuinely related.
 */
export function RelatedPrompts({ prompt, limit = 4 }: { prompt: Prompt; limit?: number }) {
  const { t } = useTranslation();
  const { realPrompts } = useRealPrompts();

  const related = useMemo(() => {
    const tagSet = new Set(prompt.tags.map((tag) => tag.slug));
    return realPrompts
      .filter((candidate) => candidate.id !== prompt.id)
      .map((candidate) => {
        const sharedTags = candidate.tags.filter((tag) => tagSet.has(tag.slug)).length;
        const score =
          sharedTags * 3 +
          (candidate.author.id === prompt.author.id ? 1 : 0) +
          (candidate.contentType === prompt.contentType ? 1 : 0);
        return { candidate, score };
      })
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || b.candidate.likeCount - a.candidate.likeCount)
      .slice(0, limit)
      .map(({ candidate }) => candidate);
  }, [realPrompts, prompt, limit]);

  if (related.length === 0) return null;

  return (
    <AsideSection id="related-prompts-title" title={t("prompt.relatedPrompts")}>
      <ul className="divide-y divide-border-soft">
        {related.map((item) => {
          const meta = CONTENT_TYPE_META[item.contentType];
          return (
            <li key={item.id}>
              <AsideLinkRow
                href={promptHref(item)}
                icon={meta.icon}
                title={item.title}
                meta={`${t(meta.labelKey)} · ${item.author.displayName}`}
              />
            </li>
          );
        })}
      </ul>
    </AsideSection>
  );
}
