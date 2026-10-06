"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Blocks, Hash, LayoutGrid, Sparkles, SquareTerminal, SlidersHorizontal, TrendingUp, Users, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedGrid } from "./feed-grid";
import { feedItemCreatedAt, feedItemPopularity, type FeedItem } from "./types";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { SearchView } from "@/features/search/search-view";
import { EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { CreatorCard } from "@/features/profile/creator-card";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { fetchTopCreators } from "@/lib/supabase/profiles";
import { fetchPopularTags } from "@/lib/supabase/tags";
import { tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

type Section = "all" | "prompts" | "generators" | "workflows" | "presets" | "requests" | "creators";

type SortKey = "newest" | "oldest" | "most-liked";
const SORT_LABELS: Record<SortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompts", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "generators", labelKey: "nav.generators", icon: Blocks },
  { key: "workflows", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "presets", labelKey: "nav.presets", icon: SlidersHorizontal },
  { key: "requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "creators", labelKey: "discover.creators", icon: Users },
];

/**
 * Explore — search, trending tags, and one place to browse every kind of
 * content: all, prompts (by content type), generators (by topic), requests
 * (open / all) and creators. All filtering happens on the already-loaded
 * shared caches (RealPrompts/Requests/Generators providers), no new API.
 */
export function DiscoverFeed() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [creators, setCreators] = useState<UserProfile[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const { realPrompts, loading } = useRealPrompts();
  const { realRequests } = useRealRequests();
  const { realGenerators } = useRealGenerators();
  const { realWorkflows } = useRealWorkflows();
  const { realPresets } = useRealPresets();

  useEffect(() => {
    // Genuinely usage-sorted (CLAUDE.md Bölüm 9.23).
    fetchPopularTags(14).then(setTags);
    fetchTopCreators(12).then(setCreators);
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    const prompts: FeedItem[] = realPrompts
      .filter((prompt) => matchesTaxonomy(prompt, taxonomy))
      .map((prompt) => ({ kind: "prompt", data: prompt }));
    const generators: FeedItem[] = realGenerators
      .filter((generator) => matchesTaxonomy(generator, taxonomy))
      .map((generator) => ({ kind: "generator", data: generator }));
    // A workflow spans several content types — it matches a content-type filter when it chains that type; category/subcategory are its own (shared taxonomy).
    const workflows: FeedItem[] = realWorkflows
      .filter((workflow) => (!taxonomy.contentType || workflow.contentTypes.includes(taxonomy.contentType)) && (!taxonomy.category || workflow.category === taxonomy.category) && (!taxonomy.subcategory || workflow.subcategory === taxonomy.subcategory))
      .map((workflow) => ({ kind: "workflow", data: workflow }));
    // A preset carries the shared taxonomy (type/category/subcategory) like a prompt/generator, so the same filter applies.
    const presets: FeedItem[] = realPresets
      .filter((preset) => matchesTaxonomy(preset, taxonomy))
      .map((preset) => ({ kind: "preset", data: preset }));
    const requests: FeedItem[] = realRequests
      .filter((request) => matchesTaxonomy(request, taxonomy))
      .filter((request) => !openOnly || request.status === "open")
      .map((request) => ({ kind: "request", data: request }));
    const pick =
      section === "prompts"
        ? prompts
        : section === "generators"
          ? generators
          : section === "workflows"
            ? workflows
            : section === "presets"
              ? presets
              : section === "requests"
                ? requests
                : [...prompts, ...generators, ...workflows, ...presets, ...requests];
    return pick.sort((a, b) =>
      sort === "most-liked" ? feedItemPopularity(b) - feedItemPopularity(a) || feedItemCreatedAt(b) - feedItemCreatedAt(a) : sort === "oldest" ? feedItemCreatedAt(a) - feedItemCreatedAt(b) : feedItemCreatedAt(b) - feedItemCreatedAt(a),
    );
  }, [realPrompts, realGenerators, realWorkflows, realPresets, realRequests, taxonomy, openOnly, section, sort]);

  const idleContent = (
    <div className="space-y-6">
      {tags.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="hidden shrink-0 items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted sm:flex">
            <TrendingUp size={13} />
            {t("discover.trending")}
          </span>
          <div className="scrollbar-none -mx-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0">
            {tags.map((tag) => (
              <Link
                key={tag.slug}
                href={tagHref(tag)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface px-3 text-label font-medium text-text-secondary transition-colors duration-200 hover:border-primary/40 hover:text-primary"
              >
                <Hash size={13} className="text-text-muted" />
                {tag.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Tabs
          items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon }))}
          active={section}
          onChange={setSection}
          ariaLabel={t("discover.sectionsAriaLabel")}
        />

        {section !== "creators" && <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} />}
        {section !== "creators" && (
          <div className="flex justify-end">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label={t("profile.sortAriaLabel")}
              className="h-9 shrink-0 rounded-md border border-border bg-surface px-3 text-label font-medium text-text"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {t(SORT_LABELS[key])}
                </option>
              ))}
            </select>
          </div>
        )}
        {section === "requests" && (
          <ChipRow>
            <Chip selected={!openOnly} onClick={() => setOpenOnly(false)}>
              {t("discover.allRequests")}
            </Chip>
            <Chip selected={openOnly} onClick={() => setOpenOnly(true)}>
              {t("request.openOnly")}
            </Chip>
          </ChipRow>
        )}
      </div>

      {section === "creators" ? (
        creators === null ? (
          <PromptCardSkeletonGrid count={3} />
        ) : creators.length === 0 ? (
          <EmptyState icon={Users} title={t("discover.noCreatorsYet")} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {creators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        )
      ) : loading && items.length === 0 ? (
        <PromptCardSkeletonGrid count={6} />
      ) : (
        <FeedGrid items={items} emptyTitle={t("discover.noMatchTitle")} emptyDescription={t("discover.noMatchDescription")} />
      )}
    </div>
  );

  return <SearchView idle={idleContent} />;
}
