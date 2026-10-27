"use client";

import { useEffect, useMemo, useState } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import Link from "next/link";
import { Hash, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchAllTagsWithStats, fetchTrendingTags, type TrendingTag } from "@/lib/supabase/tags";
import { formatCount, tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TagFollowButton } from "./tag-follow-button";
import type { Tag } from "@/types";

/** The full tag list is long; it is shown in steps (the order — most used first — comes from the database). */
const PAGE = 30;

/**
 * Keşfet → Etiketler (docs/history/221-*): the rising tags (only when there is real recent data, never an invented trend) and every
 * tag with its real usage count, most used first — each with the follow button, so a tag can be followed right where it is found.
 * `/tags` stays the full directory page.
 */
export function TagsSection() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ all: Tag[]; trending: TrendingTag[] } | "failed" | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllTagsWithStats(), fetchTrendingTags(12)])
      .then(([all, trending]) => !cancelled && setState({ all, trending }))
      .catch((err) => {
        console.error("tags section", err);
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const all = useMemo(() => (state && state !== "failed" ? [...state.all].sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0)) : []), [state]);

  if (state === null) return <p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>;
  if (state === "failed") {
    return <EmptyState icon={Hash} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: () => (setState(null), setRetry((n) => n + 1)) }} />;
  }

  return (
    <section className="space-y-5" data-tags-section>
      {state.trending.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-h3 font-semibold text-text">
            <Sparkles size={16} className="text-primary" aria-hidden />
            {t("tag.risingHeading")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {state.trending.map((tag) => (
              <Link key={tag.slug} href={tagHref(tag)}>
                <Badge variant="default" className="hover:bg-accent-surface/70">
                  #{tag.label} <span className="ml-1 text-primary/70">+{tag.recentCount}</span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
      <TagRows tags={all.slice(0, shown)} emptyMessage={t("tag.noTagsAtAll")} />
      {all.length > shown && (
        <LoadMoreButton wrapperClassName="flex justify-center" onLoadMore={() => setShown((n) => n + PAGE)} />
      )}
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
