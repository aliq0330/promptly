"use client";

import { AsideSection } from "@/features/content/detail-parts";
import { RelatedCards, RelatedCardsSkeleton } from "@/features/content/related-cards";
import { useRelated } from "@/features/content/use-related";
import { fetchRelatedPrompts } from "@/lib/supabase/prompts";
import { promptHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_TYPE_META } from "./content-type-meta";
import type { Prompt } from "@/types";

/**
 * "Benzer promptlar" — chosen by the database from the source prompt itself
 * (`fetchRelatedPrompts`: shared DNA, then shared tags, then same category; at
 * most `limit`, visible prompts only), so it works on a directly opened detail
 * page too. Cards lead with the prompt's picture when it has one. Skeleton while
 * loading; renders nothing when empty or when the request fails.
 */
export function RelatedPrompts({ prompt, limit = 4 }: { prompt: Prompt; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(prompt.id, () => fetchRelatedPrompts(prompt.id, limit));

  if (failed || (!loading && items.length === 0)) return null;

  return (
    <AsideSection id="related-prompts-title" title={t("prompt.relatedPrompts")} href={prompt.category ? `/search?${new URLSearchParams({ type: prompt.contentType, category: prompt.category }).toString()}` : "/prompts"}>
      {loading ? (
        <RelatedCardsSkeleton count={limit} />
      ) : (
        <RelatedCards
          items={items.map((item) => {
            const meta = CONTENT_TYPE_META[item.contentType];
            const cover = item.media[0];
            return {
              id: item.id,
              href: promptHref(item),
              title: item.title,
              meta: `${t(meta.labelKey)} · ${item.author.displayName}`,
              icon: meta.icon,
              image: cover ? { url: cover.url, alt: cover.alt } : null,
            };
          })}
        />
      )}
    </AsideSection>
  );
}
