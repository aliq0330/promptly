"use client";

import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash } from "lucide-react";
import { fetchTagBySlug } from "@/lib/supabase/tags";
import { tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { BAND_PRIMARY_CLASS } from "@/features/content/detail-parts";
import { TopicKicker, TopicPage } from "@/features/content/topic-page";
import { TagFollowButton } from "@/features/tags/tag-follow-button";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import type { Tag } from "@/types";

/**
 * A tag's page (`/tags/local?tag=<slug>` — tags are real, possibly user-created rows, so they are looked up client-side):
 * the shared topic-page template (docs/history/211-*) with the tag's real label, Takip Et and Paylaş, then
 * the section tiles and the tagged posts — server-side `feed_page` with `p_tag`, keyset paginated.
 */
// The count comes from `feed_count` like the list itself (`tags.usage_count` counts differently, so the two could disagree).
export function TagView() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const slug = searchParams.get("tag");
  const [found, setFound] = useState<{ slug: string; tag: Tag | null } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchTagBySlug(slug).then((tag) => !cancelled && setFound({ slug, tag }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("tag.notFound")}.</div>;
  }
  if (!found || found.slug !== slug) return <DetailSkeleton />;
  const tag = found.tag;
  if (!tag) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("tag.notFound")}</h1>
        <p className="text-sm text-text-muted">{t("tag.notFoundBody")}</p>
      </div>
    );
  }

  return (
    <TopicPage
      filter={{ taxonomy: EMPTY_TAXONOMY_FILTER, tag: tag.slug }}
      kicker={<TopicKicker>{t("tag.kicker")}</TopicKicker>}
      title={`#${tag.label}`}
      icon={Hash}
      countKey="tag.usedInCount"
      primary={<TagFollowButton slug={tag.slug} label={tag.label} className={BAND_PRIMARY_CLASS} />}
      shareUrl={tagHref(tag)}
      shareTitle={`#${tag.label}`}
      actionsLabel={t("tag.actionsAria")}
    />
  );
}
