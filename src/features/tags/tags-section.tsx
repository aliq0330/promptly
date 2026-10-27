"use client";

import { useEffect, useState } from "react";
import { PagedListState } from "@/features/feed/paged-list-state";
import { usePagedList } from "@/features/content/use-paged-list";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchTagsPage, fetchTrendingTags, type TrendingTag } from "@/lib/supabase/tags";
import { formatCount, tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TagFollowButton } from "./tag-follow-button";
import type { Tag } from "@/types";

/**
 * Keşfet → Etiketler (docs/history/221-*): the rising tags (only when there is real recent data, never an invented trend) and every
 * tag with its real usage count, most used first — each with the follow button, so a tag can be followed right where it is found.
 * The catalogue is read a page at a time (docs/history/256-*), the next page comes by itself on scroll. `/tags` stays the full directory page.
 */
export function TagsSection() {
  const { t } = useTranslation();
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const tags = usePagedList("discover-tags", true, (offset) => fetchTagsPage(offset), (tag) => tag.slug);

  useEffect(() => {
    let cancelled = false;
    fetchTrendingTags(12)
      .then((list) => !cancelled && setTrending(list))
      .catch((err) => console.error("rising tags", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-5" data-tags-section>
      {trending.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-h3 font-semibold text-text">
            <Sparkles size={16} className="text-primary" aria-hidden />
            {t("tag.risingHeading")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {trending.map((tag) => (
              <Link key={tag.slug} href={tagHref(tag)}>
                <Badge variant="default" className="hover:bg-accent-surface/70">
                  #{tag.label} <span className="ml-1 text-primary/70">+{tag.recentCount}</span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
      <PagedListState list={tags} skeleton={<p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>}>
        <TagRows tags={tags.items} emptyMessage={t("tag.noTagsAtAll")} />
      </PagedListState>
    </section>
  );
}

/** Tag rows: `#label` (to the tag's page) + real usage count + follow button. Used by the section and by Keşfet's tag search. */
export function TagRows({ tags, emptyMessage }: { tags: Tag[]; emptyMessage: string }) {
  const { t } = useTranslation();
  if (tags.length === 0) return <p className="py-6 text-center text-sm text-text-muted">{emptyMessage}</p>;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tags.map((tag) => (
        <li key={tag.slug} className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-3 shadow-card">
          <Link href={tagHref(tag)} className="min-w-0 flex-1 rounded-lg leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="block truncate font-semibold text-text">#{tag.label}</span>
            {tag.usageCount !== undefined && (
              <span className="block truncate text-caption text-text-muted">{t("tagPicker.usageCount", { count: formatCount(tag.usageCount) })}</span>
            )}
          </Link>
          <TagFollowButton slug={tag.slug} label={tag.label} />
        </li>
      ))}
    </ul>
  );
}
