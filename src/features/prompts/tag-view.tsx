"use client";

import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash } from "lucide-react";
import { FeedItemsView } from "@/features/feed/feed-items-view";
import { ViewModeSwitcher } from "@/features/content/view-mode-switcher";
import type { FeedItem } from "@/features/feed/types";
import { Tabs } from "@/components/ui/tabs";
import { fetchGeneratorsByTagSlug, fetchPromptsByTag, fetchRequestsByTagSlug, fetchTagBySlug, fetchWorkflowsByTagSlug } from "@/lib/supabase/tags";
import { fetchPresetsByTagSlug } from "@/lib/supabase/presets";
import { formatCount, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { Generator, Preset, Prompt, PromptRequest, Tag, Workflow } from "@/types";

type SortMode = "newest" | "popular";
type KindFilter = "all" | "prompt" | "generator" | "workflow" | "preset" | "request";

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
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
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
    Promise.all([
      fetchTagBySlug(slug),
      fetchPromptsByTag(slug),
      fetchRequestsByTagSlug(slug),
      fetchGeneratorsByTagSlug(slug),
      fetchWorkflowsByTagSlug(slug),
      fetchPresetsByTagSlug(slug),
    ]).then(
      ([foundTag, foundPrompts, foundRequests, foundGenerators, foundWorkflows, foundPresets]) => {
        if (cancelled) return;
        setTag(foundTag);
        setPrompts(foundPrompts);
        setRequests(foundRequests);
        setGenerators(foundGenerators);
        setWorkflows(foundWorkflows);
        setPresets(foundPresets);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const items = useMemo<FeedItem[]>(() => {
    const promptItems: FeedItem[] = kind === "all" || kind === "prompt" ? prompts.filter((p) => matchesTaxonomy(p, taxonomy)).map((data) => ({ kind: "prompt", data })) : [];
    const otherItems: FeedItem[] = [
      ...(kind === "all" || kind === "request" ? requests.map((data): FeedItem => ({ kind: "request", data })) : []),
      ...(kind === "all" || kind === "generator" ? generators.map((data): FeedItem => ({ kind: "generator", data })) : []),
      ...(kind === "all" || kind === "workflow" ? workflows.map((data): FeedItem => ({ kind: "workflow", data })) : []),
      ...(kind === "all" || kind === "preset" ? presets.map((data): FeedItem => ({ kind: "preset", data })) : []),
    ];
    const created = (i: FeedItem) => new Date(i.data.createdAt).getTime();
    const likes = (i: FeedItem) => (i.kind === "request" ? i.data.responseCount : i.data.likeCount);
    return [...promptItems, ...otherItems].sort((a, b) => (sortMode === "popular" ? likes(b) - likes(a) : created(b) - created(a)));
  }, [prompts, requests, generators, workflows, presets, kind, taxonomy, sortMode]);

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

  const totalCount = tag.usageCount ?? prompts.length + requests.length + generators.length + workflows.length + presets.length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Hash size={20} className="text-primary" />
          <h1 className="text-h1 font-semibold text-text">{tag.label}</h1>
        </div>
        <p className="text-sm text-text-muted">{t("tag.usedInCount", { count: formatCount(totalCount) })}</p>
      </div>

      <Tabs
        variant="segmented"
        ariaLabel={t("tag.filtersAria")}
        active={kind}
        onChange={setKind}
        items={[
          { key: "all", label: t("common.all") },
          { key: "prompt", label: t("tag.filterPrompts") },
          { key: "generator", label: t("tag.filterGenerators") },
          { key: "workflow", label: t("tag.filterWorkflows") },
          { key: "preset", label: t("tag.filterPresets") },
          { key: "request", label: t("tag.filterRequests") },
        ]}
      />

      <div className="flex items-center justify-between gap-2">
       <div className="flex gap-1.5">
        {(["newest", "popular"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              sortMode === mode ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {mode === "newest" ? t("profile.sortNewest") : t("home.tabPopular")}
          </button>
        ))}
       </div>
       <ViewModeSwitcher />
      </div>

      {(kind === "all" || kind === "prompt") && <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} />}

      <FeedItemsView items={items} emptyTitle={taxonomy.contentType && kind === "prompt" ? t("tag.emptyForFilter") : t("tag.emptyAll")} />
    </div>
  );
}
