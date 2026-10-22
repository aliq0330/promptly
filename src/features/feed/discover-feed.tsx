"use client";

import { useState } from "react";
import { LayoutGrid, Sparkles, SquareTerminal, SlidersHorizontal, Users, Workflow as WorkflowIcon } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { LoadMore } from "./load-more";
import { CategoryStrip, CreatorStrip, PopularStrip, TagStrip, useDiscoverHighlights } from "./discover-highlights";
import { useFeedPages } from "./use-feed-pages";
import type { FeedKind } from "@/lib/supabase/feed";
import { feedOrderForSort } from "@/lib/feed-cursor";
import { SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { SectionNav } from "@/features/content/section-nav";
import { SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { TaxonomyTypeChips } from "@/features/content/taxonomy-filter";
import { SearchView } from "@/features/search/search-view";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { CreatorCard } from "@/features/profile/creator-card";
import { useCreatorPages } from "@/features/profile/use-creator-pages";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SpacesIcon } from "@/features/spaces/space-visuals";
import type { TranslationKey } from "@/lib/i18n/translations";

type Section = "all" | "prompts" | "workflows" | "presets" | "requests" | "spaces" | "creators";

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompts", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "workflows", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "presets", labelKey: "nav.presets", icon: SlidersHorizontal },
  { key: "requests", labelKey: "nav.requestsShort", icon: Sparkles },
  // Akışta gönderi olarak paylaşılmış Space'ler (docs/history/215-*).
  { key: "spaces", labelKey: "nav.spaces", icon: SpacesIcon },
  { key: "creators", labelKey: "discover.creators", icon: Users },
];

/** Section → `p_kinds` of `public.feed_page` (`all` = no kind filter). "creators" is not a feed. */
const SECTION_KIND: Record<Exclude<Section, "creators">, FeedKind | "all"> = {
  all: "all",
  prompts: "prompt",
  workflows: "workflow",
  presets: "preset",
  requests: "request",
  spaces: "space",
};

/**
 * Explore — search, then a compact top (docs/history/210-*: categories, rising
 * tags, popular, creators — each one scrolling row so the first post starts on
 * the first phone screen), then one place to browse every kind of content:
 * all, prompts, workflows, presets, requests (open / all) and creators. The content sections are SERVER queries (`public.feed_page`, the
 * same keyset hook as Home): filter, sort and "Load more" are decided by the
 * database, so "Most liked" is global rather than the top of a client pool.
 * Creators are profiles, paged separately by (follower_count, id).
 */
export function DiscoverFeed() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [openOnly, setOpenOnly] = useState(false);
  // Home is "what's new"; Discover opens on what the community likes most, so the two never show the same order.
  const [sort, setSort] = useState<ContentSortKey>("most-liked");

  const isCreators = section === "creators";
  // "Most used" ranks prompts by their use counter, so it only exists while Promptlar is shown;
  // switching to another section falls back to the liked order instead of an order that means nothing there.
  const effectiveSort: ContentSortKey = sort === "most-used" && section !== "prompts" ? "most-liked" : sort;
  const sortKeys: ContentSortKey[] = section === "prompts" ? [...SORT_KEYS, "most-used"] : SORT_KEYS;
  const feed = useFeedPages(
    {
      scope: "all",
      order: feedOrderForSort(effectiveSort),
      kind: SECTION_KIND[isCreators ? "all" : section],
      taxonomy,
      // The open-only chip only exists in the requests section; other kinds are unaffected by it anyway.
      openOnly: section === "requests" && openOnly,
    },
    !isCreators,
  );
  const creatorPages = useCreatorPages(isCreators);
  const highlights = useDiscoverHighlights();

  const openOnlyChips = (
    <>
      <Chip selected={!openOnly} onClick={() => setOpenOnly(false)}>
        {t("discover.allRequests")}
      </Chip>
      <Chip selected={openOnly} onClick={() => setOpenOnly(true)}>
        {t("request.openOnly")}
      </Chip>
    </>
  );

  const idleContent = (
    <div className="space-y-4">
      <CategoryStrip sample={highlights.sample} />
      <TagStrip tags={highlights.tags} />
      <PopularStrip popular={highlights.popular} />
      <CreatorStrip creators={highlights.creators} onSeeAll={() => setSection("creators")} />

      <SectionNav
        items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon }))}
        active={section}
        onChange={setSection}
        ariaLabel={t("discover.sectionsAriaLabel")}
        hideControls={isCreators}
        // Space'in türü/kategorisi yok: süzgeçler Spaces bölümünde çizilmez (sunucu da süzgeçli sorguda Space döndürmez).
        chips={section === "spaces" ? undefined : <TaxonomyTypeChips value={taxonomy} onChange={setTaxonomy} />}
        chipsLabel={t("toolbar.contentTypeAria")}
        sort={effectiveSort}
        onSortChange={setSort}
        sortKeys={sortKeys}
        sheetSections={
          <>
            {section !== "spaces" && <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} />}
            {section === "requests" && (
              <SheetSection title={t("toolbar.status")}>
                <SheetChips>{openOnlyChips}</SheetChips>
              </SheetSection>
            )}
          </>
        }
        activeCount={taxonomyActiveCount(taxonomy, true) + (section === "requests" && openOnly ? 1 : 0)}
        onClear={() => {
          setTaxonomy(EMPTY_TAXONOMY_FILTER);
          setOpenOnly(false);
        }}
      />

      {isCreators ? (
        creatorPages.loading ? (
          <PromptCardSkeletonGrid count={3} />
        ) : creatorPages.failed && creatorPages.creators.length === 0 ? (
          <EmptyState icon={Users} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: creatorPages.retry }} />
        ) : creatorPages.creators.length === 0 ? (
          <EmptyState icon={Users} title={t("discover.noCreatorsYet")} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {creatorPages.creators.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
            <LoadMore failed={creatorPages.failed} hasMore={creatorPages.hasMore} loadingMore={creatorPages.loadingMore} onLoadMore={() => void creatorPages.loadMore()} />
          </>
        )
      ) : feed.loading ? (
        <PromptCardSkeletonGrid count={6} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
      ) : (
        <>
          <FeedItemsView items={feed.items} emptyTitle={t("discover.noMatchTitle")} emptyDescription={t("discover.noMatchDescription")} />
          <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
        </>
      )}
    </div>
  );

  return <SearchView idle={idleContent} />;
}
