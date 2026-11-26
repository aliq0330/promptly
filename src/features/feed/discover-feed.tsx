"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot } from "@/components/icons/bot";
import { Hash } from "@/components/icons/hash";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Quote as QuoteIcon } from "@/components/icons/quote";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Users } from "@/components/icons/users";
import { UsersRound } from "@/components/icons/users-round";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedGrid } from "./feed-grid";
import { LoadMore } from "./load-more";
import { useFeedPages } from "./use-feed-pages";
import { useInterestFeedback } from "./interest-feedback";
import { useNearViewportOnce } from "./use-near-viewport";
import { StaleFeedNotice } from "./stale-feed-notice";
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
import { SkillDiscoverSection } from "@/features/skills/skill-discover-section";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import type { TranslationKey } from "@/lib/i18n/translations";
import dynamic from "next/dynamic";

/** Editoryal blok tembel yüklenir (docs/history/451-*): Keşfet'in ilk paketi ve hidrasyonu hafif kalır; yüklenirken aynı iskelet. */
const DiscoverEditorial = dynamic(() => import("./discover-editorial").then((m) => m.DiscoverEditorial), {
  ssr: false,
  loading: () => <DiscoverEditorialSkeleton />,
});

function DiscoverEditorialSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" data-discover-editorial-loading="">
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skeleton-shimmer h-36 w-48 shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <span className="skeleton-shimmer col-span-2 row-span-2 aspect-square rounded-lg" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton-shimmer aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}

type FeedSection = "all" | "prompts" | "requests" | "workflows" | "presets" | "quotes";
type EntitySection = "skills" | "tools" | "tags" | "creators" | "communities";
type Section = FeedSection | EntitySection;

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: typeof LayoutGrid; dividerBefore?: boolean }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  // The four content categories …
  { key: "prompts", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "workflows", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "presets", labelKey: "nav.presets", icon: SlidersHorizontal },
  // Alıntılar (docs/history/217-*). Space bölümü docs/history/459-* ile kalktı (Space'ler özel).
  // Skill'ler (docs/history/392-*): karma akışa girmez, kendi sunucu sorgusu (`skill_feed_page`); menü girişi bayrak arkasındadır.
  ...(SKILLS_MENU_ENABLED ? [{ key: "skills" as const, labelKey: "skill.pageTitle" as const, icon: GraduationCap }] : []),
  { key: "quotes", labelKey: "quotes.discover.section", icon: QuoteIcon },
  // … and the things to find and follow (docs/history/221-*).
  { key: "tools", labelKey: "discover.sectionTools", icon: Bot, dividerBefore: true },
  { key: "tags", labelKey: "discover.sectionTags", icon: Hash },
  { key: "creators", labelKey: "discover.creators", icon: UsersRound },
  { key: "communities", labelKey: "discover.sectionCommunities", icon: Users },
];

/** Section → `p_kinds` of `public.feed_page` (`all` = no kind filter). The entity sections are not feeds. */
const SECTION_KIND: Record<FeedSection, FeedKind | "all"> = {
  all: "all",
  prompts: "prompt",
  requests: "request",
  workflows: "workflow",
  presets: "preset",
  quotes: "quote",
};

const isEntity = (section: Section): section is EntitySection =>
  section === "skills" || section === "tools" || section === "tags" || section === "creators" || section === "communities";

/** A quote has no content type / category / AI tool, so the post filters do not apply to it (the database leaves it out when one is set). */
const hasPostFilters = (section: FeedSection) => section !== "quotes";

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
 * Hazır ayarlar — "Tümü" mixes them), Alıntılar, public Spaces (a list of their own: a Space reaches the feed only as a quote, docs/history/241-*), and the things to follow: AI Araçları, Etiketler, Yaratıcılar, Topluluklar.
 * The content sections are SERVER queries (`public.feed_page`, the same keyset hook as Home): sort, filters and "Load more" are decided by
 * the database. Sorts: Önerilen (engagement score, not personalised), En yeni, Popüler (likes) and — only where a real use counter exists,
 * Promptlar — En çok kullanılan. The advanced filters (type / category, AI tool, request status) apply only to the sections they mean
 * something in. The search box above searches what the open section is about (prompts, people, communities, tags, tools).
 */
export function DiscoverFeed() {
  const { t } = useTranslation();
  // "Tümünü gör" of Ana Sayfa's "Takip edilecek kişiler" strip (docs/history/285-*) opens this page on the creators section.
  const searchParams = useSearchParams();
  const [section, setSection] = useState<Section>(() => {
    // Derin bağlantı: `?section=` bir bölüm anahtarıysa o bölümde açılır (Skill'ler yalnız bayrak açıkken).
    const wanted = searchParams.get("section");
    return SECTIONS.some((entry) => entry.key === wanted) ? (wanted as Section) : "all";
  });
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [openOnly, setOpenOnly] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  // Home is the viewer's own feed; Keşfet opens on what the community recommends, so the two never show the same thing.
  const [sort, setSort] = useState<ContentSortKey>("recommended");

  const entity = isEntity(section);
  const feedSection: FeedSection = isEntity(section) ? "all" : section;
  const postFilters = !entity && hasPostFilters(feedSection);
  // "Most used" / "Kanıtlanmış" rank prompts (by their use counter / their "Çalıştı mı?" votes), so they only exist while Promptlar is shown;
  // switching to another section falls back to the recommended order instead of an order that means nothing there.
  // "Yükselen" (docs/history/451-*) ranks posts by their last-48-hour growth; a quote has no such counter, so Alıntılar falls back too.
  const effectiveSort: ContentSortKey =
    ((sort === "most-used" || sort === "most-proven") && section !== "prompts") || (sort === "rising" && section === "quotes") ? "recommended" : sort;
  const sortKeys: ContentSortKey[] =
    section === "prompts" ? [...DISCOVER_SORT_KEYS, "most-used", "most-proven"] : section === "quotes" ? DISCOVER_SORT_KEYS.filter((key) => key !== "rising") : DISCOVER_SORT_KEYS;

  // Only filters that mean something in the open section reach the query (a quote has no category: carrying one over would empty the list).
  const effectiveTaxonomy = postFilters ? taxonomy : EMPTY_TAXONOMY_FILTER;
  const availableTools = taxonomy.contentType ? getToolsForContentType(taxonomy.contentType, taxonomy.category) : AI_TOOLS.filter((entry) => entry.isActive);
  const effectiveTool = postFilters && tool && availableTools.some((entry) => entry.id === tool) ? tool : null;
  const effectiveOpenOnly = section === "requests" && openOnly;

  const activeCount = (postFilters ? taxonomyActiveCount(taxonomy, true) : 0) + (effectiveTool ? 1 : 0) + (effectiveOpenOnly ? 1 : 0);
  // docs/history/451-*: "Tümü" without filters opens on the editorial magazine (topics, popular, text/audio/video, workflows + open requests,
  // creators, rising tools, Spaces, Skills); the section menu and the full post list follow under "Tüm paylaşımlar".
  const editorial = section === "all" && activeCount === 0;
  // docs/history/466-*: under the editorial the full list ("Tüm paylaşımlar") loads only once it nears the viewport — the page no longer opens with
  // the editorial AND the list hitting the server at the same moment.
  const [allRef, allNear] = useNearViewportOnce<HTMLDivElement>("600px");
  const listWaiting = editorial && !allNear;
  const feed = useFeedPages(
    {
      scope: "all",
      order: feedOrderForSort(effectiveSort),
      kind: SECTION_KIND[feedSection],
      taxonomy: effectiveTaxonomy,
      openOnly: effectiveOpenOnly,
      tool: effectiveTool,
    },
    !entity && !listWaiting,
  );
  // "İlgimi çekiyor / çekmiyor" (docs/history/275-*): answers here only tune Ana Sayfa → Sana özel; Keşfet's ranking and list stay as they are.
  const interest = useInterestFeedback(feed.items, { enabled: !entity, loadExisting: true, hideOnDislike: false });
  const creatorPages = useCreatorPages(section === "creators");

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

  const idleContent = (
    <div className="space-y-6">
      {editorial && <DiscoverEditorial onSeeAllCreators={() => setSection("creators")} />}
      <div ref={allRef} className="space-y-4" data-discover-all="">
        {editorial && <h2 className="pt-6 font-display text-h1 font-bold text-text">{t("discover.ed.allPosts")}</h2>}
        <SectionNav
          variant="menu"
          menuTitle={t("nav.discover")}
          items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon, dividerBefore: s.dividerBefore }))}
          active={section}
          onChange={setSection}
          ariaLabel={t("discover.sectionsAriaLabel")}
          // The entity sections (Spaces, tools, tags, creators, communities) are lists to browse / follow from, not filterable feeds: only the menu.
          hideControls={entity}
          // Alıntının türü/kategorisi yok: süzgeçler Alıntılar bölümünde çizilmez (sunucu da süzgeçli sorguda döndürmez).
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

        {section === "skills" ? (
          <SkillDiscoverSection />
        ) : section === "tools" ? (
          <ToolsSection />
        ) : section === "tags" ? (
          <TagsSection />
        ) : section === "communities" ? (
          <EmbeddedCommunitiesBrowse />
        ) : section === "creators" ? (
          creatorPages.loading ? (
            <PromptCardSkeletonGrid count={3} />
          ) : creatorPages.failed && creatorPages.creators.length === 0 ? (
            <EmptyState scene="feedStalled" icon={AlertCircle} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: creatorPages.retry }} />
          ) : creatorPages.creators.length === 0 ? (
            <EmptyState scene="community" icon={UsersRound} title={t("discover.noCreatorsYet")} />
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
        ) : feed.loading || listWaiting ? (
          <PromptCardSkeletonGrid count={6} />
        ) : feed.failed && feed.items.length === 0 ? (
          <EmptyState scene="feedStalled" icon={AlertCircle} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
        ) : (
          <>
            {feed.stale && feed.failed && <StaleFeedNotice onRetry={feed.retry} />}
            <FeedGrid
              items={feed.items}
              interest={interest}
              emptyScene="search"
              emptyTitle={t("discover.noMatchTitle")}
              emptyDescription={t("discover.noMatchDescription")}
              emptyAction={activeCount > 0 ? { label: t("feed.clearFilters"), onClick: clearFilters } : undefined}
            />
            <LoadMore failed={feed.failed && !feed.stale} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          </>
        )}
      </div>
    </div>
  );

  const label = t(SECTIONS.find((s) => s.key === section)?.labelKey ?? "common.all");
  return <SearchView idle={idleContent} scope={searchScope(section, label)} />;
}
