"use client";

import { Sparkles } from "lucide-react";
import { AsideSection } from "@/features/content/detail-parts";
import { RelatedCards, RelatedCardsSkeleton } from "@/features/content/related-cards";
import { useRelated } from "@/features/content/use-related";
import { fetchRelatedRequests } from "@/lib/supabase/requests";
import { requestHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptRequest } from "@/types";

/**
 * "Benzer prompt istekleri" — chosen by the database from the source request
 * itself (`fetchRelatedRequests`: shared tags, then same category; visible
 * requests only), same rule and look as `RelatedPrompts`. Skeleton while loading;
 * renders nothing when empty or when the request fails.
 */
export function RelatedRequests({ request, limit = 4 }: { request: PromptRequest; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(request.id, () => fetchRelatedRequests(request.id, limit));

  if (failed || (!loading && items.length === 0)) return null;

  return (
    <AsideSection id="related-requests-title" title={t("request.relatedRequests")} href="/requests">
      {loading ? (
        <RelatedCardsSkeleton count={limit} />
      ) : (
        <RelatedCards
          items={items.map((item) => {
            const cover = item.media[0];
            return {
              id: item.id,
              href: requestHref(item),
              title: item.title,
              meta: item.author.displayName,
              icon: Sparkles,
              image: cover ? { url: cover.url, alt: cover.alt } : null,
            };
          })}
        />
      )}
    </AsideSection>
  );
}
