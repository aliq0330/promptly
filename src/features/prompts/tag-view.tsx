"use client";

import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash } from "lucide-react";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RequestList } from "@/features/requests/request-list";
import { fetchPromptsByTag, fetchRequestsByTagSlug, fetchTagBySlug } from "@/lib/supabase/tags";
import { formatCount, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { Prompt, PromptRequest, Tag } from "@/types";

type SortMode = "newest" | "popular";

/**
 * Client-rendered counterpart to the old static `/tags/[tag]` — tags are
 * real, possibly user-created rows (CLAUDE.md Bölüm 9.23), not known at
 * build time, so this looks prompts/requests up client-side by a `?tag=`
 * slug (see `tagHref()` in lib/utils.ts). Shows the tag's real label +
 * usage stats (not the raw slug), a content-type filter, a real
 * newest/popular sort, and a requests section — a real gap fix over the
 * previous minimal version, which only ever showed prompts under the raw
 * slug as a heading.
 */
export function TagView() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const slug = searchParams.get("tag");
  const [tag, setTag] = useState<Tag | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no slug to look up, nothing async to wait on
      setLoaded(true);
      return;
    }
    setLoaded(false);
    Promise.all([fetchTagBySlug(slug), fetchPromptsByTag(slug), fetchRequestsByTagSlug(slug)]).then(
      ([foundTag, foundPrompts, foundRequests]) => {
        if (cancelled) return;
        setTag(foundTag);
        setPrompts(foundPrompts);
        setRequests(foundRequests);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const filteredPrompts = useMemo(() => {
    const filtered = prompts.filter((p) => matchesTaxonomy(p, taxonomy));
    const sorted = [...filtered];
    if (sortMode === "popular") sorted.sort((a, b) => b.likeCount - a.likeCount);
    else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [prompts, taxonomy, sortMode]);

  if (!slug) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("tag.notFound")}.</div>;
  }

  if (!loaded) {
    return <DetailSkeleton />;
  }

  if (!tag) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("tag.notFound")}</h1>
        <p className="text-sm text-text-muted">{t("tag.notFoundBody")}</p>
      </div>
    );
  }

  const totalCount = tag.usageCount ?? prompts.length + requests.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Hash size={20} className="text-primary" />
          <h1 className="text-h1 font-semibold text-text">{tag.label}</h1>
        </div>
        <p className="text-sm text-text-muted">{t("tag.usedInCount", { count: formatCount(totalCount) })}</p>
      </div>

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h3 font-semibold text-text">{t("tag.requestsHeading", { count: requests.length })}</h2>
          <RequestList requests={requests} />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3 font-semibold text-text">{t("tag.promptsHeading", { count: filteredPrompts.length })}</h2>
          <div className="flex gap-1.5">
            {(["newest", "popular"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  sortMode === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-text-muted hover:text-text",
                )}
              >
                {mode === "newest" ? t("profile.sortNewest") : t("home.tabPopular")}
              </button>
            ))}
          </div>
        </div>

        <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} />

        {filteredPrompts.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {taxonomy.contentType ? t("tag.emptyForFilter") : t("tag.emptyAll")}
          </p>
        ) : (
          <PromptGrid prompts={filteredPrompts} />
        )}
      </section>

      {requests.length === 0 && prompts.length === 0 && (
        <p className="py-10 text-center text-sm text-text-muted">{t("tag.emptyEverything")}</p>
      )}
    </div>
  );
}
