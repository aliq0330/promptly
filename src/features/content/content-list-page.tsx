"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { type ContentSortKey } from "@/features/content/sort-select";
import { SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { type SectionMenuItem } from "@/features/content/section-menu";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useViewMode } from "@/features/content/view-mode-store";
import { FocusGrid } from "@/features/focus/focus-grid";
import type { FeedItem } from "@/features/feed/types";
import { AdvancedSearchBox } from "@/features/search/advanced-search-box";
import { tokensToQuery, type SearchToken } from "@/features/search/search-tokens";
import { CONTENT_TYPE_IDS, EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptContentType } from "@/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import type { SearchCursor, SearchPage } from "@/lib/supabase/search";

export interface ListPageStep {
  icon: LucideIcon;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

const DEBOUNCE_MS = 300;

/**
 * The shared layout of the four content list pages (Prompts, Requests,
 * Generators, Workflows): eyebrow + title + description + create button,
 * three "how it works" steps, the advanced chip search and the media-type
 * chips. The search is always scoped to THIS page's content type — it never
 * returns the other three kinds — and reuses the site's advanced search
 * (users, tags, tools, media type, sort) through the page's own `search`.
 */
export function ContentListPage<T extends { id: string; createdAt: string; likeCount: number; contentType?: string | null; category?: string | null; subcategory?: string | null }>({
  icon,
  title,
  description,
  createHref,
  createLabel,
  steps,
  baseItems,
  loading,
  search,
  /** Workflows have no category; the media-type chips still narrow them. */
  matches,
  showCategories = true,
  postFilter,
  extra,
  desktopActiveExtra = 0,
  onClearExtra,
  searchPlaceholder,
  renderItems,
  focusKind,
  emptyTitle,
  emptyBody,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  createHref: string;
  createLabel: string;
  steps: ListPageStep[];
  baseItems: T[];
  loading?: boolean;
  /** One keyset page of search results; pass the previous page's `nextCursor` for "load more". */
  search: (query: string, filters: ContentSearchFilters, limit?: number, cursor?: SearchCursor | null) => Promise<SearchPage<T>>;
  matches?: (item: T, value: TaxonomyFilterValue) => boolean;
  showCategories?: boolean;
  postFilter?: (items: T[]) => T[];
  /** Extra chip row under the type chips (md+). */
  /** Page-specific filter (e.g. request status chips) — a section of the Filtre sheet at every width. */
  extra?: ReactNode;
  desktopActiveExtra?: number;
  onClearExtra?: () => void;
  searchPlaceholder?: string;
  renderItems: (items: T[]) => ReactNode;
  /** What the items are, so the Focus View ("Izgara") can render them; `renderItems` stays the Card view. */
  focusKind?: FeedItem["kind"];
  emptyTitle: string;
  emptyBody: string;
  /** Whether a further real page of `baseItems` exists beyond what's already loaded (CLAUDE.md's keyset-paginated "Daha fazla yükle" — only meaningful in browse mode, never while actively searching/filtering). */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<ContentSortKey>("newest");
  const [searchOpen, setSearchOpen] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [viewMode] = useViewMode();
  const [results, setResults] = useState<T[] | null>(null);
  const [searchCursor, setSearchCursor] = useState<SearchCursor | null>(null);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  // The query + filters the CURRENT results were fetched with, so "load more" continues that exact search.
  const searchedWith = useRef<{ query: string; filters: ContentSearchFilters } | null>(null);
  const [searching, setSearching] = useState(false);
  const normalized = text.trim();
  const active = tokens.length > 0 || Boolean(normalized);
  const { filters: tokenFilters } = useMemo(() => tokensToQuery(tokens), [tokens]);
  const filterKey = JSON.stringify([tokenFilters, taxonomy, sort]);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setResults(null);
      setSearchCursor(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const filters: ContentSearchFilters = {
        ...tokenFilters,
        taxonomy: taxonomy.contentType ? taxonomy : undefined,
        // The server orders AND pages the results, so the sort is sent as-is.
        sort: sort === "most-liked" ? "popular" : sort === "oldest" ? "oldest" : "new",
      };
      const found = await search(normalized, filters);
      if (cancelled) return;
      searchedWith.current = { query: normalized, filters };
      setResults(found.items);
      setSearchCursor(found.nextCursor);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey captures every filter input
  }, [normalized, filterKey, active]);

  async function loadMoreSearch() {
    const last = searchedWith.current;
    if (!last || !searchCursor || searchLoadingMore) return;
    setSearchLoadingMore(true);
    try {
      const page = await search(last.query, last.filters, undefined, searchCursor);
      setResults((prev) => {
        const seen = new Set((prev ?? []).map((item) => item.id));
        return [...(prev ?? []), ...page.items.filter((item) => !seen.has(item.id))];
      });
      setSearchCursor(page.nextCursor);
    } finally {
      setSearchLoadingMore(false);
    }
  }

  const visible = useMemo(() => {
    const list = results ?? baseItems.filter((item) => (matches ? matches(item, taxonomy) : matchesTaxonomy(item, taxonomy)));
    const filtered = postFilter ? postFilter(list) : list;
    // Search results keep the server's order (it is what the cursor continues from); only the browse list is sorted here.
    if (results) return filtered;
    return [...filtered].sort((a, b) =>
      sort === "most-liked"
        ? b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  }, [results, baseItems, taxonomy, matches, postFilter, sort]);

  const menuItems: SectionMenuItem<"all" | PromptContentType>[] = [
    { key: "all", label: t("common.all"), icon: LayoutGrid },
    ...CONTENT_TYPE_IDS.map((type) => ({ key: type, label: t(CONTENT_TYPE_META[type].labelKey), icon: CONTENT_TYPE_META[type].icon })),
  ];
  const statusActive = desktopActiveExtra;

  return (
    <PageContainer className="space-y-5 pb-16 pt-3 sm:pt-5">
      <SadeTitle>{title}</SadeTitle>
      {/* Sade düzen (docs/history/234-*): tek "Tümü ▾" tür menüsü + arama · Filtre · Kart/Izgara · "+". Eski açıklama, "nasıl çalışır" adımları ve sayfaya özel süzgeçler (istek durumu) Filtre penceresindedir. */}
      <ListControlRow
        menu={{
          items: menuItems,
          active: taxonomy.contentType ?? "all",
          onChange: (key) => setTaxonomy({ contentType: key === "all" ? null : key, category: null, subcategory: null }),
          ariaLabel: t("toolbar.contentTypeAria"),
          title,
        }}
        search={{ open: searchOpen || active, onToggle: () => (active ? (setTokens([]), setText(""), setSearchOpen(false)) : setSearchOpen((open) => !open)), label: t("header.searchAriaLabel") }}
        filter={{
          sheetSections: (
            <>
              <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} showCategories={showCategories} />
              {extra ? <SheetSection title={t("toolbar.status")}>{extra}</SheetSection> : null}
              <SheetSection title={t("list.howItWorks")}>
                <p className="text-small text-text-muted">{description}</p>
                <ol aria-label={t("list.howItWorks")} className="space-y-2">
                  {steps.map((step, index) => (
                    <li key={step.titleKey} className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <step.icon size={16} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-text-muted">
                          {t("list.step")} {index + 1}
                        </span>
                        <span className="mt-1 block text-label font-semibold text-text">{t(step.titleKey)}</span>
                        <span className="mt-1 block text-caption leading-snug text-text-muted">{t(step.bodyKey)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </SheetSection>
            </>
          ),
          sort,
          onSortChange: setSort,
          activeCount: taxonomyActiveCount(taxonomy, false) + statusActive,
          onClear: () => {
            setTaxonomy(EMPTY_TAXONOMY_FILTER);
            onClearExtra?.();
          },
        }}
        create={{ href: createHref, label: createLabel }}
      />
      {(searchOpen || active) && (
        <AdvancedSearchBox tokens={tokens} onTokensChange={setTokens} text={text} onTextChange={setText} hideKindSuggestions placeholder={searchPlaceholder} />
      )}

      {(loading && baseItems.length === 0 && !active) || searching ? (
        <PromptCardSkeletonGrid count={3} />
      ) : visible.length === 0 ? (
        // In browse mode (no active search), the currently loaded page can
        // legitimately have zero items matching the media-type chip even
        // while `hasMore` is true — a matching item may just be further
        // back. Falling through to the generic "nothing here, go create
        // one" empty state would strand the user on a false dead end, so
        // this branch offers "load more" instead of (never alongside) the
        // create action.
        <EmptyState
          icon={icon}
          title={active || hasMore ? t("search.noMatchingFilters") : emptyTitle}
          description={active ? t("list.tryDifferentSearch") : hasMore ? t("search.noMatchingFiltersOnPage") : emptyBody}
          action={
            active
              ? undefined
              : hasMore
                ? { label: loadingMore ? t("common.loadingMore") : t("common.loadMore"), onClick: () => onLoadMore?.() }
                : { label: createLabel, href: createHref }
          }
        />
      ) : (
        <>
          {focusKind && viewMode === "focus" ? (
            <FocusGrid items={visible.map((data) => ({ kind: focusKind, data }) as unknown as FeedItem)} />
          ) : (
            renderItems(visible)
          )}
          {!active && hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
          {active && searchCursor && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => void loadMoreSearch()} disabled={searchLoadingMore}>
                {searchLoadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

