"use client";

import { useState } from "react";
import { Bot, Hash, LayoutGrid, Quote as QuoteIcon, Sparkles, SquareTerminal, SlidersHorizontal, Users, UsersRound, Workflow as WorkflowIcon } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { LoadMore } from "./load-more";
import { DiscoverAside, DiscoverHighlightsSkeleton, PopularStrip, TopicStrip, useDiscoverHighlights } from "./discover-highlights";
import { useFeedPages } from "./use-feed-pages";
import type { FeedKind } from "@/lib/supabase/feed";
import { feedOrderForSort } from "@/lib/feed-cursor";
import { DISCOVER_SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { SectionNav } from "@/features/content/section-nav";
import { SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { SearchView, type SearchScope } from "@/features/search/search-view";
import { AI_TOOLS, getToolsForContentType } from "@/lib/ai-tool-catalog";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { CreatorCard } from "@/features/profile/creator-card";
import { useCreatorPages } from "@/features/profile/use-creator-pages";
import { EmbeddedCommunitiesBrowse } from "@/features/communities/all-communities-page";
import { TagsSection } from "@/features/tags/tags-section";
import { ToolsSection } from "@/features/tools/tools-section";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SpacesIcon } from "@/features/spaces/space-visuals";
import type { TranslationKey } from "@/lib/i18n/translations";

type FeedSection = "all" | "prompts" | "requests" | "workflows" | "presets" | "spaces" | "quotes";
type EntitySection = "tools" | "tags" | "creators" | "communities";
type Section = FeedSection | EntitySection;

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: typeof LayoutGrid; dividerBefore?: boolean }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  // The four content categories …
  { key: "prompts", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "workflows", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "presets", labelKey: "nav.presets", icon: SlidersHorizontal },
  // Akışta gönderi olarak paylaşılmış Space'ler (docs/history/215-*) ve alıntılar (docs/history/217-*): normal gönderiler gibi akar.
  { key: "spaces", labelKey: "nav.spaces", icon: SpacesIcon },
  { key: "quotes", labelKey: "quotes.discover.section", icon: QuoteIcon },
  // … and the things to find and follow (docs/history/221-*).
  { key: "tools", labelKey: "discover.sectionTools", icon: Bot, dividerBefore: true },
  { key: "tags", labelKey: "discover.sectionTags", icon: Hash },
  { key: "creators", labelKey: "discover.creators", icon: Users },
  { key: "communities", labelKey: "discover.sectionCommunities", icon: UsersRound },
];

/** Section → `p_kinds` of `public.feed_page` (`all` = no kind filter). The entity sections are not feeds. */
const SECTION_KIND: Record<FeedSection, FeedKind | "all"> = {
  all: "all",
  prompts: "prompt",
  requests: "request",
  workflows: "workflow",
  presets: "preset",
  spaces: "space",
  quotes: "quote",
};

const isEntity = (section: Section): section is EntitySection =>
  section === "tools" || section === "tags" || section === "creators" || section === "communities";

/** A Space or a quote has no content type / category / AI tool, so the post filters do not apply to them (the database leaves them out when one is set). */
const hasPostFilters = (section: FeedSection) => section !== "spaces" && section !== "quotes";

/** The kind of result the typed search looks for in each section (the sections "Tümü", Spaces and Alıntılar search the whole site, as before). */
function searchScope(section: Section, label: string): SearchScope | undefined {
  switch (section) {
    case "prompts":
      return { kind: "content", content: "prompt", label };
    case "requests":
      return { kind: "content", content: "request", label };
    case "workflows":
      return { kind: "content", content: "workflow", label };
    case "presets":
      return { kind: "content", content: "preset", label };
    case "creators":
      return { kind: "people", label };
    case "communities":
      return { kind: "communities", label };
    case "tags":
      return { kind: "tags", label };
    case "tools":
      return { kind: "tools", label };
    default:
      return undefined;
  }
}

/**
 * Keşfet (docs/history/221-*) is where new things are found: the four content categories (Promptlar, İstekler, Workflow'lar,
 * Hazır ayarlar — "Tümü" mixes them), Spaces and Alıntılar, and the things to follow: AI Araçları, Etiketler, Yaratıcılar, Topluluklar.
 * The content sections are SERVER queries (`public.feed_page`, the same keyset hook as Home): sort, filters and "Load more" are decided by
 * the database. Sorts: Önerilen (engagement score, not personalised), En yeni, Popüler (likes) and — only where a real use counter exists,
 * Promptlar — En çok kullanılan. The advanced filters (type / category, AI tool, request status) apply only to the sections they mean
 * something in. The search box above searches what the open section is about (prompts, people, communities, tags, tools).
 */
export function DiscoverFeed() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [openOnly, setOpenOnly] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  // Home is the viewer's own feed; Keşfet opens on what the community recommends, so the two never show the same thing.
  const [sort, setSort] = useState<ContentSortKey>("recommended");

  const entity = isEntity(section);
  const feedSection: FeedSection = isEntity(section) ? "all" : section;
  const postFilters = !entity && hasPostFilters(feedSection);
  // "Most used" ranks prompts by their use counter, so it only exists while Promptlar is shown;
  // switching to another section falls back to the recommended order instead of an order that means nothing there.
  const effectiveSort: ContentSortKey = sort === "most-used" && section !== "prompts" ? "recommended" : sort;
  const sortKeys: ContentSortKey[] = section === "prompts" ? [...DISCOVER_SORT_KEYS, "most-used"] : DISCOVER_SORT_KEYS;

  // Only filters that mean something in the open section reach the query (a Space has no category: carrying one over would empty the list).
  const effectiveTaxonomy = postFilters ? taxonomy : EMPTY_TAXONOMY_FILTER;
  const availableTools = taxonomy.contentType ? getToolsForContentType(taxonomy.contentType, taxonomy.category) : AI_TOOLS.filter((entry) => entry.isActive);
  const effectiveTool = postFilters && tool && availableTools.some((entry) => entry.id === tool) ? tool : null;
  const effectiveOpenOnly = section === "requests" && openOnly;

  const feed = useFeedPages(
    {
      scope: "all",
      order: feedOrderForSort(effectiveSort),
      kind: SECTION_KIND[feedSection],
      taxonomy: effectiveTaxonomy,
      openOnly: effectiveOpenOnly,
      tool: effectiveTool,
    },
    !entity,
  );
  const creatorPages = useCreatorPages(section === "creators");
  const highlights = useDiscoverHighlights();

  const activeCount = (postFilters ? taxonomyActiveCount(taxonomy, true) : 0) + (effectiveTool ? 1 : 0) + (effectiveOpenOnly ? 1 : 0);
  const clearFilters = () => {
    setTaxonomy(EMPTY_TAXONOMY_FILTER);
    setOpenOnly(false);
    setTool(null);
  };

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

  // docs/history/227-*: the main column (chip row, popular strip, section tabs, posts) and — from `xl` — a right column with the creators and rising tags.
  const idleContent = (
    <div className="xl:flex xl:items-start xl:gap-7">
      <div className="min-w-0 flex-1 space-y-4">
        {highlights.loading ? (
          <DiscoverHighlightsSkeleton />
        ) : (
          <>
            <TopicStrip sample={highlights.sample} tags={highlights.tags} />
            <PopularStrip popular={highlights.popular} />
          </>
        )}

        <SectionNav
          variant="menu"
          menuTitle={t("nav.discover")}
          items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon, dividerBefore: s.dividerBefore }))}
          active={section}
          onChange={setSection}
          ariaLabel={t("discover.sectionsAriaLabel")}
          // The entity sections (tools, tags, creators, communities) are lists to follow from, not filterable feeds: only the menu.
          hideControls={entity}
          // Space'in türü/kategorisi yok: süzgeçler Spaces ve Alıntılar bölümünde çizilmez (sunucu da süzgeçli sorguda ikisini de döndürmez).
          sort={effectiveSort}
          onSortChange={setSort}
          sortKeys={sortKeys}
          sheetSections={
            <>
              {postFilters && <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} />}
              {postFilters && (
                <SheetSection title={t("discover.toolFilter")}>
                  <SheetChips>
                    <Chip selected={effectiveTool === null} onClick={() => setTool(null)}>
                      {t("discover.toolFilterAny")}
                    </Chip>
                    {availableTools.map((entry) => (
                      <Chip key={entry.id} selected={effectiveTool === entry.id} onClick={() => setTool(entry.id)}>
                        {entry.name}
                      </Chip>
                    ))}
                  </SheetChips>
                </SheetSection>
              )}
              {section === "requests" && (
                <SheetSection title={t("toolbar.status")}>
                  <SheetChips>{openOnlyChips}</SheetChips>
                </SheetSection>
              )}
            </>
          }
          activeCount={activeCount}
          onClear={clearFilters}
        />

        {section === "tools" ? (
          <ToolsSection />
        ) : section === "tags" ? (
          <TagsSection />
        ) : section === "communities" ? (
          <EmbeddedCommunitiesBrowse />
        ) : section === "creators" ? (
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
            <FeedItemsView
              items={feed.items}
              emptyTitle={t("discover.noMatchTitle")}
              emptyDescription={t("discover.noMatchDescription")}
              emptyAction={activeCount > 0 ? { label: t("feed.clearFilters"), onClick: clearFilters } : undefined}
              // The column sits next to the right column from `xl`: two post columns at most (as on Ana Sayfa).
              layout="home"
            />
            <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          </>
        )}
      </div>
      {!highlights.loading && (
        <aside className="hidden w-[300px] shrink-0 xl:sticky xl:top-24 xl:block">
          <DiscoverAside creators={highlights.creators} tags={highlights.tags} onSeeAllCreators={() => setSection("creators")} />
        </aside>
      )}
    </div>
  );

  const label = t(SECTIONS.find((s) => s.key === section)?.labelKey ?? "common.all");
  return <SearchView idle={idleContent} scope={searchScope(section, label)} />;
}
