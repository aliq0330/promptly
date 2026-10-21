"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RequestList } from "@/features/requests/request-list";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { AdvancedSearchBox } from "./advanced-search-box";
import { findTool } from "@/lib/ai-tool-catalog";
import { tokensToQuery, type SearchToken } from "./search-tokens";
import { searchPromptsPage } from "@/lib/supabase/prompts";
import { searchProfiles } from "@/lib/supabase/profiles";
import { searchRequestsPage } from "@/lib/supabase/requests";
import { searchWorkflowsPage } from "@/lib/supabase/workflows";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { searchPresetsPage } from "@/lib/supabase/presets";
import { PresetCard } from "@/features/presets/preset-card";
import { searchTags } from "@/lib/supabase/tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import { findCategory, findSubcategory, isContentTypeId, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import type { SearchCursor, SearchKind } from "@/lib/supabase/search";
import { categoryHref, formatCount, profileHref, tagHref, toolHref } from "@/lib/utils";
import { Eyebrow } from "@/features/content/detail-parts";
import type { Prompt, PromptRequest, Preset, Tag, UserProfile, Workflow } from "@/types";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { useViewMode } from "@/features/content/view-mode-store";
import { ViewModeControls } from "@/features/content/view-mode-switcher";
import { FocusGrid } from "@/features/focus/focus-grid";
import { CommunityCard } from "@/features/communities/community-card";
import { applyJoinState, ErrorBox } from "@/features/communities/home-shared";
import { useToast } from "@/features/groups/use-toast";
import { searchCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";

const DEBOUNCE_MS = 300;
const NO_RESULTS = Promise.resolve({ items: [], nextCursor: null });
type Sort = NonNullable<ContentSearchFilters["sort"]>;

/**
 * Result tabs (docs/history/205-*): Tümü = every group (people/tags/communities only for a plain-text search, as before);
 * Gönderiler = the four content kinds; Kişiler / Topluluklar search by the typed text alone — the chips filter posts only.
 * The tab is kept in the address (`?tab=`), "Tümü" leaves it out.
 */
type SearchTab = "all" | "posts" | "people" | "communities";
const SEARCH_TABS: { key: SearchTab; labelKey: TranslationKey }[] = [
  { key: "all", labelKey: "common.all" },
  { key: "posts", labelKey: "notifications.categoryPosts" },
  { key: "people", labelKey: "search.tabPeople" },
  { key: "communities", labelKey: "nav.communities" },
];
const isSearchTab = (value: string | null): value is SearchTab => SEARCH_TABS.some((tab) => tab.key === value);
/** How many people / communities "Tümü" previews before its "Tümünü gör". */
const ALL_TAB_PREVIEW = 4;

/**
 * The chip search + its results. On Explore it is embedded: `idle` is what
 * shows while there is no query (the normal Explore content); once chips or
 * text exist, results replace it.
 */
export function SearchView({ idle }: { idle?: ReactNode } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [viewMode] = useViewMode();
  const [tokens, setTokens] = useState<SearchToken[]>([]);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<Sort>("relevant");
  // Category/subcategory only make sense under a single media type chip.
  const [subFilter, setSubFilter] = useState<{ category: string | null; subcategory: string | null }>({ category: null, subcategory: null });
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [communities, setCommunities] = useState<{ items: CommunitySummary[]; hasMore: boolean; failed: boolean }>({ items: [], hasMore: false, failed: false });
  const [loadingMoreCommunities, setLoadingMoreCommunities] = useState(false);
  const [tab, setTabState] = useState<SearchTab>("all");
  const [retryKey, setRetryKey] = useState(0);
  const { node: toastNode, show: showToast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  // Per-kind keyset cursor of the NEXT page (null = that group has no more results).
  const [cursors, setCursors] = useState<Record<SearchKind, SearchCursor | null>>({ prompt: null, request: null, workflow: null, preset: null });
  const [loadingMoreKind, setLoadingMoreKind] = useState<SearchKind | null>(null);
  // The query + filters the CURRENT results were fetched with, so "load more" continues that exact search.
  const searchedWith = useRef<{ query: string; filters: ContentSearchFilters } | null>(null);
  const normalized = text.trim();
  const hasTokens = tokens.length > 0;
  const active = hasTokens || Boolean(normalized);

  const { filters: tokenFilters, kinds } = useMemo(() => tokensToQuery(tokens), [tokens]);
  const singleMedia = tokenFilters.contentTypes?.length === 1 ? tokenFilters.contentTypes[0] : null;
  const category = singleMedia ? subFilter.category : null;
  const subcategory = singleMedia ? subFilter.subcategory : null;
  const filterKey = JSON.stringify([tokenFilters, kinds, category, subcategory, sort]);

  // Prefill from `?q=` (the Explore page's search box hands off here).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q");
    const type = params.get("type");
    // Old category / tool links (`?type=&category=&subcategory=`, `?tool=<id>`, shared before docs/history/211-*) open the
    // topic's own page instead of a search.
    const legacyCategory = isContentTypeId(type) ? findCategory(type, params.get("category")) : null;
    if (isContentTypeId(type) && legacyCategory) {
      router.replace(categoryHref(type, legacyCategory.id, findSubcategory(type, legacyCategory.id, params.get("subcategory"))?.id));
      return;
    }
    const toolId = params.get("tool");
    if (toolId && findTool(toolId)) {
      router.replace(toolHref(toolId));
      return;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL on mount */
    if (initial) setText(initial);
    // A bare `?type=` (no category) still starts a search with that media chip.
    if (isContentTypeId(type)) setTokens([{ kind: "media", type }]);
    const initialTab = params.get("tab");
    if (isSearchTab(initialTab)) setTabState(initialTab);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setPrompts([]);
      setUsers([]);
      setTags([]);
      setRequests([]);
      setWorkflows([]);
      setPresets([]);
      setCommunities({ items: [], hasMore: false, failed: false });
      setCursors({ prompt: null, request: null, workflow: null, preset: null });
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const filters: ContentSearchFilters = {
        ...tokenFilters,
        taxonomy: singleMedia ? { contentType: singleMedia, category, subcategory } : undefined,
        sort,
      };
      // Plain text only (no chips): tags are results too. People and communities follow the typed text whenever there is
      // some (their own tabs); "Tümü" still shows them only for a plain-text search.
      const textOnly = !hasTokens;
      const [foundPrompts, foundWorkflows, foundPresets, foundRequests, foundUsers, foundTags, foundCommunities] = await Promise.all([
        kinds.includes("prompt") ? searchPromptsPage(normalized, filters) : NO_RESULTS,
        kinds.includes("workflow") ? searchWorkflowsPage(normalized, filters) : NO_RESULTS,
        kinds.includes("preset") ? searchPresetsPage(normalized, filters) : NO_RESULTS,
        kinds.includes("request") ? searchRequestsPage(normalized, filters) : NO_RESULTS,
        normalized ? searchProfiles(normalized) : [],
        textOnly ? searchTags(normalized, 6) : [],
        normalized
          ? searchCommunities({ query: normalized, category: null, offset: 0 }).then(
              (page) => ({ items: page.communities, hasMore: page.hasMore, failed: false }),
              (err) => {
                console.error("searchCommunities", err);
                return { items: [], hasMore: false, failed: true };
              },
            )
          : { items: [], hasMore: false, failed: false },
      ]);
      if (cancelled) return;
      searchedWith.current = { query: normalized, filters };
      setPrompts(foundPrompts.items);
      setWorkflows(foundWorkflows.items);
      setPresets(foundPresets.items);
      setRequests(foundRequests.items);
      setCursors({ prompt: foundPrompts.nextCursor, workflow: foundWorkflows.nextCursor, preset: foundPresets.nextCursor, request: foundRequests.nextCursor });
      setUsers(foundUsers);
      setTags(foundTags);
      setCommunities(foundCommunities);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey captures every filter input
  }, [normalized, filterKey, active, retryKey]);

  function setTab(next: SearchTab) {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      if (next === "all") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is only a convenience; the tab works without it.
    }
  }

  async function loadMoreCommunities() {
    const last = searchedWith.current;
    if (!last?.query || loadingMoreCommunities) return;
    setLoadingMoreCommunities(true);
    try {
      const page = await searchCommunities({ query: last.query, category: null, offset: communities.items.length });
      setCommunities((prev) => {
        const seen = new Set(prev.items.map((item) => item.id));
        return { items: [...prev.items, ...page.communities.filter((item) => !seen.has(item.id))], hasMore: page.hasMore, failed: false };
      });
    } catch (err) {
      console.error("searchCommunities (more)", err);
      showToast(t("communities.page.loadError"));
    } finally {
      setLoadingMoreCommunities(false);
    }
  }

  /** Appends the next keyset page of ONE result group, continuing the exact search that produced it. */
  async function loadMore(kind: SearchKind) {
    const last = searchedWith.current;
    const cursor = cursors[kind];
    if (!last || !cursor || loadingMoreKind) return;
    setLoadingMoreKind(kind);
    try {
      const append = <T extends { id: string }>(prev: T[], items: T[]) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...items.filter((item) => !seen.has(item.id))];
      };
      if (kind === "prompt") {
        const page = await searchPromptsPage(last.query, last.filters, undefined, cursor);
        setPrompts((prev) => append(prev, page.items));
        setCursors((prev) => ({ ...prev, prompt: page.nextCursor }));
      } else if (kind === "workflow") {
        const page = await searchWorkflowsPage(last.query, last.filters, undefined, cursor);
        setWorkflows((prev) => append(prev, page.items));
        setCursors((prev) => ({ ...prev, workflow: page.nextCursor }));
      } else if (kind === "preset") {
        const page = await searchPresetsPage(last.query, last.filters, undefined, cursor);
        setPresets((prev) => append(prev, page.items));
        setCursors((prev) => ({ ...prev, preset: page.nextCursor }));
      } else {
        const page = await searchRequestsPage(last.query, last.filters, undefined, cursor);
        setRequests((prev) => append(prev, page.items));
        setCursors((prev) => ({ ...prev, request: page.nextCursor }));
      }
    } finally {
      setLoadingMoreKind(null);
    }
  }

  const loadMoreButton = (kind: SearchKind) =>
    cursors[kind] && (
      <div className="flex justify-center pt-1">
        <Button variant="outline" onClick={() => void loadMore(kind)} disabled={loadingMoreKind !== null}>
          {loadingMoreKind === kind ? t("common.loadingMore") : t("common.loadMore")}
        </Button>
      </div>
    );

  const textOnly = !hasTokens;
  const noPosts = prompts.length === 0 && workflows.length === 0 && presets.length === 0 && requests.length === 0;
  const nothingFound = noPosts && (!textOnly || (users.length === 0 && tags.length === 0 && communities.items.length === 0));
  const taxonomy: TaxonomyFilterValue = { contentType: singleMedia, category, subcategory };
  const showPosts = tab === "all" || tab === "posts";

  const peopleList = (people: UserProfile[]) => (
    <div className="overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
      {people.map((user) => (
        <Link
          key={user.id}
          href={profileHref(user)}
          className="group flex items-center gap-3 border-b border-border-soft px-4 py-3 transition-colors duration-200 ease-soft last:border-0 hover:bg-surface-soft"
        >
          <Avatar src={user.avatarUrl} alt={user.displayName} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-text transition-colors group-hover:text-primary">{user.displayName}</p>
            <p className="truncate text-xs text-text-muted">
              @{user.username} · {formatCount(user.followerCount)} {t("profile.followersSuffix")}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );

  const communityList = (items: CommunitySummary[]) => (
    <ul className="grid gap-3 md:grid-cols-2" data-search-communities>
      {items.map((community) => (
        <CommunityCard
          key={community.id}
          community={community}
          onStatusChange={(next) =>
            setCommunities((prev) => ({ ...prev, items: prev.items.map((c) => (c.id === community.id ? applyJoinState(c, next) : c)) }))
          }
          onToast={showToast}
        />
      ))}
    </ul>
  );

  /** "Tümü" previews a group; the rest lives in its own tab. */
  const viewAllButton = (target: SearchTab) => (
    <div className="flex justify-center pt-1">
      <Button variant="outline" size="sm" onClick={() => setTab(target)}>
        {t("common.viewAll")}
      </Button>
    </div>
  );

  return (
    <div className={idle ? "space-y-4" : "mx-auto w-full max-w-[1400px] space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8"}>
      <div className="space-y-3">
        <AdvancedSearchBox tokens={tokens} onTokensChange={setTokens} text={text} onTextChange={setText} autoFocus={!idle} />
        {singleMedia && (
          <TaxonomyFilter
            value={taxonomy}
            onChange={(next) => {
              if (!next.contentType) {
                setTokens(tokens.filter((token) => token.kind !== "media"));
                setSubFilter({ category: null, subcategory: null });
              } else {
                setSubFilter({ category: next.category, subcategory: next.subcategory });
                if (next.contentType !== singleMedia) {
                  setTokens([...tokens.filter((token) => token.kind !== "media"), { kind: "media", type: next.contentType }]);
                }
              }
            }}
          />
        )}
        {active && (
          <Tabs
            items={SEARCH_TABS.map((item) => ({ key: item.key, label: t(item.labelKey) }))}
            active={tab}
            onChange={setTab}
            ariaLabel={t("search.tabsAria")}
          />
        )}
        {active && showPosts && (
          <div className="flex items-center gap-2">
            <ChipRow className="min-w-0 flex-1">
              {(["relevant", "new", "popular"] as Sort[]).map((value) => (
                <Chip key={value} selected={sort === value} onClick={() => setSort(value)}>
                  {t(value === "relevant" ? "search.sortRelevant" : value === "new" ? "search.sortNew" : "search.sortPopular")}
                </Chip>
              ))}
            </ChipRow>
            <ViewModeControls />
          </div>
        )}
      </div>

      {!active ? (
        idle ?? <p className="py-10 text-center text-sm text-text-muted">
          {t("search.startTyping")}
        </p>
      ) : isSearching ? (
        <p className="py-10 text-center text-sm text-text-muted">{t("search.searching")}</p>
      ) : (
        tab === "people" || tab === "communities" ? (
          !normalized ? (
            <p className="py-6 text-center text-sm text-text-muted">{t("search.textOnlyHint")}</p>
          ) : tab === "people" ? (
            users.length > 0 ? (
              <section className="space-y-3">
                <ResultsHeading count={users.length}>{t("search.usersHeading")}</ResultsHeading>
                {peopleList(users)}
              </section>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">{t("common.noResults")}</p>
            )
          ) : communities.failed ? (
            <ErrorBox message={t("communities.page.loadError")} onRetry={() => setRetryKey((key) => key + 1)} />
          ) : communities.items.length > 0 ? (
            <section className="space-y-3">
              <ResultsHeading count={communities.items.length}>{t("nav.communities")}</ResultsHeading>
              {communityList(communities.items)}
              {communities.hasMore && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" onClick={() => void loadMoreCommunities()} disabled={loadingMoreCommunities}>
                    {loadingMoreCommunities ? t("common.loadingMore") : t("common.loadMore")}
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">{t("common.noResults")}</p>
          )
        ) : (
          <div className="space-y-8">
            {tab === "all" && textOnly && tags.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={tags.length}>{t("nav.tags")}</ResultsHeading>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Link key={tag.slug} href={tagHref(tag)}>
                      <Badge variant="default" className="hover:bg-accent-surface/70">
                        # {tag.label}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {tab === "all" && textOnly && users.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={users.length}>{t("search.usersHeading")}</ResultsHeading>
                {peopleList(users.slice(0, ALL_TAB_PREVIEW))}
                {users.length > ALL_TAB_PREVIEW && viewAllButton("people")}
              </section>
            )}

            {tab === "all" && textOnly && communities.items.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={communities.items.length}>{t("nav.communities")}</ResultsHeading>
                {communityList(communities.items.slice(0, ALL_TAB_PREVIEW))}
                {(communities.items.length > ALL_TAB_PREVIEW || communities.hasMore) && viewAllButton("communities")}
              </section>
            )}

            {workflows.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={workflows.length}>{t("nav.workflows")}</ResultsHeading>
                {viewMode === "focus" ? (
                  <FocusGrid items={workflows.map((data) => ({ kind: "workflow" as const, data }))} />
                ) : (
                  <ContentGrid>
                    {workflows.map((workflow) => (
                      <div key={workflow.id} className={CONTENT_GRID_ITEM_CLASS}>
                        <WorkflowCard workflow={workflow} />
                      </div>
                    ))}
                  </ContentGrid>
                )}
                {loadMoreButton("workflow")}
              </section>
            )}

            {presets.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={presets.length}>{t("nav.presets")}</ResultsHeading>
                {viewMode === "focus" ? (
                  <FocusGrid items={presets.map((data) => ({ kind: "preset" as const, data }))} />
                ) : (
                  <ContentGrid>
                    {presets.map((preset) => (
                      <div key={preset.id} className={CONTENT_GRID_ITEM_CLASS}>
                        <PresetCard preset={preset} />
                      </div>
                    ))}
                  </ContentGrid>
                )}
                {loadMoreButton("preset")}
              </section>
            )}

            {requests.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={requests.length}>{t("search.requestsHeading")}</ResultsHeading>
                <RequestList requests={requests} />
                {loadMoreButton("request")}
              </section>
            )}

            {prompts.length > 0 && (
              <section className="space-y-3">
                <ResultsHeading count={prompts.length}>{t("feed.filterPrompts")}</ResultsHeading>
                <PromptGrid prompts={prompts} />
                {loadMoreButton("prompt")}
              </section>
            )}
            {(tab === "posts" ? noPosts : nothingFound) && (
              <p className="py-6 text-center text-sm text-text-muted">
                {hasTokens ? t("search.noMatchingFilters") : t("common.noResults")}
              </p>
            )}
          </div>
        )
      )}
      {toastNode}
    </div>
  );
}

/** A results group heading: the editorial eyebrow plus the group's count. */
function ResultsHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <Eyebrow as="h2" className="px-1">
      {children}
      <span className="rounded-xs bg-surface-soft px-1.5 py-0.5 tabular-nums tracking-normal text-text-muted">{count}</span>
    </Eyebrow>
  );
}
