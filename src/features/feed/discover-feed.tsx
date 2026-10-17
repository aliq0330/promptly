"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash, LayoutGrid, Sparkles, SquareTerminal, SlidersHorizontal, TrendingUp, Users, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { useFeedPages } from "./use-feed-pages";
import type { FeedKind } from "@/lib/supabase/feed";
import { feedOrderForSort } from "@/lib/feed-cursor";
import { SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { ListToolbar, SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { TaxonomyTypeChips } from "@/features/content/taxonomy-filter";
import { SearchView } from "@/features/search/search-view";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { CreatorCard } from "@/features/profile/creator-card";
import { WeeklyChallengeBanner } from "@/features/challenges/weekly-challenge-banner";
import { useCreatorPages } from "@/features/profile/use-creator-pages";
import { fetchPopularTags } from "@/lib/supabase/tags";
import { cn, tagHref } from "@/lib/utils";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { SuggestionStrip } from "@/features/communities/suggestion-strip";
import { useToast } from "@/features/groups/use-toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Tag } from "@/types";

type Section = "all" | "prompts" | "workflows" | "presets" | "requests" | "creators";

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompts", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "workflows", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "presets", labelKey: "nav.presets", icon: SlidersHorizontal },
  { key: "requests", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "creators", labelKey: "discover.creators", icon: Users },
];

/** Section → `p_kinds` of `public.feed_page` (`all` = no kind filter). "creators" is not a feed. */
const SECTION_KIND: Record<Exclude<Section, "creators">, FeedKind | "all"> = {
  all: "all",
  prompts: "prompt",
  workflows: "workflow",
  presets: "preset",
  requests: "request",
};

/**
 * Explore — search, trending tags, and one place to browse every kind of
 * content: all, prompts, workflows, presets, requests (open / all) and
 * creators. The content sections are SERVER queries (`public.feed_page`, the
 * same keyset hook as Home): filter, sort and "Load more" are decided by the
 * database, so "Most liked" is global rather than the top of a client pool.
 * Creators are profiles, paged separately by (follower_count, id).
 */
export function DiscoverFeed() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { node: toastNode, show: showToast } = useToast();
  const [section, setSection] = useState<Section>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [openOnly, setOpenOnly] = useState(false);
  // Home is "what's new"; Discover opens on what the community likes most, so the two never show the same order.
  const [sort, setSort] = useState<ContentSortKey>("most-liked");
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    // Genuinely usage-sorted (CLAUDE.md Bölüm 9.23); a fixed strip of chips, not paginated.
    fetchPopularTags(14).then(setTags);
  }, []);

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
    <div className="space-y-6 max-md:space-y-5">
      {/* Meydan (docs/history/190-*): the four content types as large tiles — the same taxonomy filter as the chips below. */}
      <ContentTypeTiles value={taxonomy} onChange={setTaxonomy} />
      {tags.length > 0 && (
        <section aria-labelledby="discover-trending" className="space-y-2.5">
          <h2 id="discover-trending" className="flex items-center gap-1.5 text-label font-semibold text-text">
            <TrendingUp size={14} className="text-secondary" aria-hidden />
            {t("discover.trending")}
          </h2>
          <div className="scrollbar-none -mx-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:flex-wrap sm:px-0">
            {tags.map((tag) => (
              <Link
                key={tag.slug}
                href={tagHref(tag)}
                className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-surface-soft px-3.5 text-label font-semibold text-text-secondary transition-colors duration-200 hover:bg-primary-soft hover:text-primary"
              >
                <Hash size={13} className="text-text-muted" aria-hidden />
                {tag.label}
              </Link>
            ))}
          </div>
        </section>
      )}
      {user && <SuggestionStrip onToast={showToast} onGoInvites={() => router.push("/communities?tab=invites")} />}
      <WeeklyChallengeBanner />

      <div className="space-y-3">
        <Tabs
          items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon }))}
          active={section}
          onChange={setSection}
          ariaLabel={t("discover.sectionsAriaLabel")}
        />

        {section !== "creators" && (
          <ListToolbar
            tabs={<TaxonomyTypeChips value={taxonomy} onChange={setTaxonomy} />}
            tabsLabel={t("toolbar.contentTypeAria")}
            hideTabsOnMobile
            sort={effectiveSort}
            onSortChange={setSort}
            sortKeys={sortKeys}
            sheetSections={
              <>
                <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} />
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
        )}
      </div>

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

  return (
    <>
      <SearchView idle={idleContent} />
      {toastNode}
    </>
  );
}

/** Image / Text / Audio / Video as large toggle tiles; picking the selected one again clears the type filter. */
function ContentTypeTiles({ value, onChange }: { value: TaxonomyFilterValue; onChange: (next: TaxonomyFilterValue) => void }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("toolbar.contentTypeAria")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CONTENT_TYPE_IDS.map((type) => {
        const meta = CONTENT_TYPE_META[type];
        const Icon = meta.icon;
        const selected = value.contentType === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange({ contentType: selected ? null : type, category: null, subcategory: null })}
            className={cn(
              "flex h-24 flex-col justify-between rounded-xl p-4 text-left transition-[background-color,box-shadow,transform] duration-200 ease-soft active:scale-[0.98] sm:h-28",
              selected ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-soft hover:bg-border-soft",
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", selected ? "bg-primary text-primary-foreground" : "bg-surface text-primary")}>
              <Icon size={18} strokeWidth={1.9} aria-hidden />
            </span>
            <span className="font-display text-[1.125rem] font-bold tracking-[-0.02em] text-text">{t(meta.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Failure line + "Load more" under a paged list (shared by the feed and the creators list). */
function LoadMore({ failed, hasMore, loadingMore, onLoadMore }: { failed: boolean; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      {failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
