"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { AdvancedSearchBox } from "@/features/search/advanced-search-box";
import { tokensToQuery, type SearchToken } from "@/features/search/search-tokens";
import { CONTENT_TYPE_IDS, EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";

export interface ListPageStep {
  icon: LucideIcon;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

type Sort = NonNullable<ContentSearchFilters["sort"]>;
const DEBOUNCE_MS = 300;

/**
 * The shared layout of the four content list pages (Prompts, Requests,
 * Generators, Workflows): eyebrow + title + description + create button,
 * three "how it works" steps, the advanced chip search and the media-type
 * chips. The search is always scoped to THIS page's content type — it never
 * returns the other three kinds — and reuses the site's advanced search
 * (users, tags, tools, media type, sort) through the page's own `search`.
 */
export function ContentListPage<T extends { id: string; contentType?: string | null; category?: string | null; subcategory?: string | null }>({
  icon,
  eyebrow,
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
  renderItems,
  emptyTitle,
  emptyBody,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  createHref: string;
  createLabel: string;
  steps: ListPageStep[];
  baseItems: T[];
  loading?: boolean;
  search: (query: string, filters: ContentSearchFilters) => Promise<T[]>;
  matches?: (item: T, value: TaxonomyFilterValue) => boolean;
  showCategories?: boolean;
  postFilter?: (items: T[]) => T[];
  extra?: ReactNode;
  renderItems: (items: T[]) => ReactNode;
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
  const [sort, setSort] = useState<Sort>("relevant");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [results, setResults] = useState<T[] | null>(null);
  const [searching, setSearching] = useState(false);
  const normalized = text.trim();
  const active = tokens.length > 0 || Boolean(normalized);
  const { filters: tokenFilters } = useMemo(() => tokensToQuery(tokens), [tokens]);
  const filterKey = JSON.stringify([tokenFilters, taxonomy, sort]);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const filters: ContentSearchFilters = {
        ...tokenFilters,
        taxonomy: taxonomy.contentType ? taxonomy : undefined,
        sort,
      };
      const found = await search(normalized, filters);
      if (cancelled) return;
      setResults(found);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey captures every filter input
  }, [normalized, filterKey, active]);

  const visible = useMemo(() => {
    const list = results ?? baseItems.filter((item) => (matches ? matches(item, taxonomy) : matchesTaxonomy(item, taxonomy)));
    return postFilter ? postFilter(list) : list;
  }, [results, baseItems, taxonomy, matches, postFilter]);

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        icon={icon}
        title={title}
        description={description}
        actions={
          <Link href={createHref} className={buttonClassName({ size: "sm" })}>
            <Plus size={15} />
            {createLabel}
          </Link>
        }
      />

      <ol className="grid grid-cols-3 gap-2" aria-label={t("generator.howItWorks")}>
        {steps.map((step, index) => (
          <li
            key={step.titleKey}
            className="flex flex-col items-start gap-2 rounded-lg border border-border-soft bg-surface p-2.5 sm:flex-row sm:gap-3 sm:p-3.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <step.icon size={16} strokeWidth={2} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-caption font-semibold text-text-muted">
                {t("generator.step")} {index + 1}
              </span>
              <span className="block text-caption font-semibold text-text sm:text-label">{t(step.titleKey)}</span>
              <span className="mt-0.5 hidden text-caption text-text-muted sm:block">{t(step.bodyKey)}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <AdvancedSearchBox tokens={tokens} onTokensChange={setTokens} text={text} onTextChange={setText} hideKindSuggestions />
        {showCategories ? (
          <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} />
        ) : (
          <ChipRow>
            <Chip selected={!taxonomy.contentType} onClick={() => setTaxonomy(EMPTY_TAXONOMY_FILTER)}>
              {t("common.all")}
            </Chip>
            {CONTENT_TYPE_IDS.map((type) => (
              <Chip
                key={type}
                icon={CONTENT_TYPE_META[type].icon}
                selected={taxonomy.contentType === type}
                onClick={() => setTaxonomy({ contentType: type, category: null, subcategory: null })}
              >
                {t(CONTENT_TYPE_META[type].labelKey)}
              </Chip>
            ))}
          </ChipRow>
        )}
        {active && (
          <ChipRow>
            {(["relevant", "new", "popular"] as Sort[]).map((value) => (
              <Chip key={value} selected={sort === value} onClick={() => setSort(value)}>
                {t(value === "relevant" ? "search.sortRelevant" : value === "new" ? "search.sortNew" : "search.sortPopular")}
              </Chip>
            ))}
          </ChipRow>
        )}
        {extra}
      </div>

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
          description={active ? t("generator.tryDifferentSearch") : hasMore ? t("search.noMatchingFiltersOnPage") : emptyBody}
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
          {renderItems(visible)}
          {!active && hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

