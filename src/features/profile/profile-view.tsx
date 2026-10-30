"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Images, Info, Pencil, Plus, Quote as QuoteIcon, Bookmark, Search, Shapes, SlidersHorizontal, SearchX, Sparkles, SquareTerminal, Folder, Workflow as WorkflowIcon, X } from "lucide-react";
import { ProfileHeader } from "./profile-header";
import { OtherProfileActions, OwnProfileActions } from "./profile-actions";
import { ProfileRail } from "./profile-rail";
import { useFollowState } from "./use-follow-state";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/features/content/view-mode-store";
import { CompactViewToggle } from "@/features/content/view-mode-switcher";
import { CONTROL_ICON_BUTTON, SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { FocusGrid } from "@/features/focus/focus-grid";
import { ContributionMap } from "./contribution-map";
import { ProfileFilterControl, type ProfileSortKey } from "./profile-toolbar";
import { PROFILE_TYPE_OPTIONS } from "./profile-type-options";
import { ProfileContentGrid } from "./profile-content-grid";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileAbout } from "./profile-about";
import { ProfileDraftsPanel } from "./profile-drafts-panel";
import { RequestList } from "@/features/requests/request-list";
import { CollectionsPanel } from "@/features/collections/collections-panel";
import { CollectionCard } from "@/features/collections/collection-card";
import { fetchPublicCollectionsByOwner } from "@/lib/supabase/collections";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { fetchAuthorPromptsPage, fetchLikedPromptsPage, fetchProfileContentStats, type ProfileContentStats } from "@/lib/supabase/prompts";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListSkeleton, PagedListState } from "@/features/feed/paged-list-state";
import { LoadMore } from "@/features/feed/load-more";
import { fetchWorkflowsByCreatorPage } from "@/lib/supabase/workflows";
import { fetchRequestsByAuthorPage } from "@/lib/supabase/requests";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { ProfilePresetsPanel } from "@/features/presets/profile-presets-panel";
import type { Collection, Prompt, PromptContentType, UserProfile } from "@/types";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid, ContentGridColumns } from "@/features/content/content-card";
import { ProfileSpacesPanel, usePublicSpaces, type PublicSpaces } from "@/features/spaces/public-spaces";
import { ProfileQuotesPanel } from "@/features/quotes/profile-quotes-panel";
import { ProfileResultsPanel } from "./profile-results-panel";
import { fetchProfileResultCount } from "@/lib/supabase/prompt-results";
import { fetchProfileQuoteCount } from "@/lib/supabase/quotes";

function sortPrompts(prompts: Prompt[], sort: ProfileSortKey): Prompt[] {
  const sorted = [...prompts];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "most-liked":
      return sorted.sort((a, b) => b.likeCount - a.likeCount);
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

/** One flat set of sections since Meydan (docs/history/190-*). Since docs/history/272-* ALL of them sit in ONE "Promptlar ▾" menu pill (the tabs + "Daha fazla" of 243-* are gone), like Topluluklar / Spaces. */
export type ProfileTabKey = "prompts" | "requests" | "workflows" | "presets" | "drafts" | "saved" | "collections" | "spaces" | "quotes" | "results" | "liked" | "about";

export function ProfileView({
  user,
  isOwnProfile,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
}) {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  // One follow state for the band's follower count and the actions row's button (see FollowButtonView's comment).
  const followState = useFollowState(user);

  // Real likes — only ever fetched for one's own profile, and only for the
  // signed-in real viewer (RLS keeps prompt_likes' "did I like this"
  // private to its own user regardless). "Kaydedilenler" no longer has a
  // flat, separate list of its own here — it IS the collections view now
  // (CollectionsPanel, starting with the default "Genel" collection), so
  // there's nothing left to fetch/hold at this level for it (CLAUDE.md
  // Bölüm 9.22 §1 — the old "Tümü" sub-tab and its state were removed
  // structurally, not just hidden with CSS).

  // The creator's public collections: the ring strip under the header on every profile, and (for a visitor) the "Koleksiyonlar" tab.
  // The owner manages all of theirs, private ones too, under "Kaydedilenler" instead.
  const [publicCollections, setPublicCollections] = useState<Collection[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPublicCollectionsByOwner(user.id).then((list) => !cancelled && setPublicCollections(list));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Herkese açık Space'ler (docs/history/214-*): sahibi dahil herkes için aynı vitrin; hiç yoksa sekme yok.
  const fetchedSpaces = usePublicSpaces({ ownerId: user.id });
  const [spacesOverride, setSpacesOverride] = useState<{ owner: string; data: PublicSpaces } | null>(null);
  const publicSpaces = spacesOverride?.owner === user.id ? spacesOverride.data : fetchedSpaces;
  const spaceCount = publicSpaces?.spaces.length ?? 0;

  // Alıntılar (docs/history/217-*): kişinin alıntıladığı gönderiler; hiç yoksa başkasının profilinde sekme yok (kendi profilinde boş durum + ipucu).
  const [quoteCount, setQuoteCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchProfileQuoteCount(user.id).then((count) => !cancelled && setQuoteCount(count));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Sonuçlar (docs/history/282-*): kişinin paylaştığı kullanıcı sonuçları; hiç yoksa başkasının profilinde bölüm yok (kendi profilinde boş durum + ipucu).
  const [resultCount, setResultCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchProfileResultCount(user.id).then((count) => !cancelled && setResultCount(count));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("prompts");
  // "İstekler" and "Workflow'lar": a page at a time like the prompts (RLS: a visitor sees the public ones, the owner their private ones too); "Hazır Ayarlar" pages itself.
  const requests = usePagedList(`requests|${user.id}`, activeTab === "requests", (offset) => fetchRequestsByAuthorPage(user.id, {}, offset));
  const workflows = usePagedList(`workflows|${user.id}`, activeTab === "workflows", (offset) => fetchWorkflowsByCreatorPage(user.id, {}, offset));
  const [activeType, setActiveType] = useState<PromptContentType | "all">("all");
  const [sort, setSort] = useState<ProfileSortKey>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const [viewMode] = useViewMode();
  const [searchOpen, setSearchOpen] = useState(false);

  // The header numbers come from the database (`profile_content_stats`): the prompt list is read a page at a time, so its length is no count.
  const [stats, setStats] = useState<ProfileContentStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchProfileContentStats(user.id).then((result) => !cancelled && setStats(result));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // "Promptlar": filters, sort and text search are query conditions (server side), 24 per page; the list grows as it is scrolled.
  const prompts = usePagedList(`prompts|${user.id}|${sort}|${activeType}|${debouncedSearch}`, activeTab === "prompts", (offset) =>
    fetchAuthorPromptsPage({ authorId: user.id, sort, contentType: activeType === "all" ? null : activeType, search: debouncedSearch }, offset),
  );
  // "Beğeniler" (own profile only): the viewer's likes, newest first, a page at a time; the chips filter what is loaded.
  const liked = usePagedList(`liked|${user.id}`, isOwnProfile && Boolean(authUser) && activeTab === "liked", (offset) => fetchLikedPromptsPage(authUser?.id ?? "", offset));

  function handleDeleted(promptId: string) {
    prompts.removeItem(promptId);
    setStats((prev) => (prev ? { ...prev, prompts: Math.max(0, prev.prompts - 1) } : prev));
  }

  // Published posts only — an owner's drafts (visible to them via RLS) aren't "posts" yet.
  const postCounts = useMemo(
    () => ({
      prompts: stats?.prompts ?? prompts.total ?? 0,
      requests: stats?.requests ?? requests.total ?? 0,
      workflows: stats?.workflows ?? workflows.total ?? 0,
      presets: stats?.presets ?? 0,
    }),
    [stats, prompts.total, requests.total, workflows.total],
  );
  // Real `copy_count` (one per signed-in person per day, never the author — docs/history/160-*), summed by the database over the prompts this profile lists.
  const reuseCount = stats?.reuse ?? 0;

  const tabs = useMemo(() => {
    // Three groups, a divider between them (docs/history/233-*): what the creator posted · what is theirs to keep (Spaces, and — owner only — Taslaklar, Kaydedilenler, Beğeniler) · Hakkında.
    // Taslaklar/Kaydedilenler/Beğeniler are owner-only (RLS already hides draft rows from others; the entries are never offered to a visitor — Bölüm 9.65/9.66).
    // "Kaydedilenler" has no single flat count — it's a list of collections (Bölüm 9.22 §1).
    const base: SectionMenuItem<ProfileTabKey>[] = [
      { key: "prompts", label: t("feed.filterPrompts"), icon: SquareTerminal, meta: postCounts.prompts },
      { key: "requests", label: t("nav.requests"), icon: Sparkles, meta: postCounts.requests },
      { key: "workflows", label: t("nav.workflows"), icon: WorkflowIcon, meta: postCounts.workflows },
      { key: "presets", label: t("nav.presets"), icon: SlidersHorizontal, meta: postCounts.presets },
    ];
    if (quoteCount > 0 || isOwnProfile) base.push({ key: "quotes", label: t("quotes.profile.tab"), icon: QuoteIcon, meta: quoteCount });
    if (resultCount > 0 || isOwnProfile) base.push({ key: "results", label: t("results.profile.tab"), icon: Images, meta: resultCount });
    let firstOfGroup = true;
    const group = (item: SectionMenuItem<ProfileTabKey>) => {
      base.push(firstOfGroup ? { ...item, dividerBefore: true } : item);
      firstOfGroup = false;
    };
    if (spaceCount > 0) group({ key: "spaces", label: t("spaces.discover.profileTab"), icon: Shapes, meta: spaceCount });
    if (isOwnProfile) {
      group({ key: "drafts", label: t("profile.tabDrafts"), icon: Pencil });
      group({ key: "saved", label: t("profile.tabSaved"), icon: Bookmark });
      group({ key: "liked", label: t("profile.tabLiked"), icon: Heart, meta: liked.total ?? undefined });
    }
    if (!isOwnProfile && publicCollections.length > 0) group({ key: "collections", label: t("profile.tabCollections"), icon: Folder, meta: publicCollections.length });
    base.push({ key: "about", label: t("profile.tabAbout"), icon: Info, dividerBefore: true });
    return base;
  }, [postCounts, quoteCount, resultCount, isOwnProfile, liked.total, publicCollections.length, spaceCount, t]);

  const normalizedSearch = search.trim().toLocaleLowerCase("tr");

  // Prompts arrive filtered and sorted by the database; the liked list is filtered here (it holds what has been loaded so far).
  const filteredLiked = useMemo(() => {
    let items = liked.items;
    if (activeType !== "all") items = items.filter((prompt) => prompt.contentType === activeType);
    if (normalizedSearch) {
      items = items.filter(
        (prompt) =>
          prompt.title.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.description.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.tags.some((tag) => tag.label.toLocaleLowerCase("tr").includes(normalizedSearch)),
      );
    }
    return sortPrompts(items, sort);
  }, [liked.items, activeType, normalizedSearch, sort]);
  const list = activeTab === "liked" ? { items: filteredLiked, loading: liked.loading, failed: liked.failed, hasMore: liked.hasMore, loadingMore: liked.loadingMore, loadMore: liked.loadMore, retry: liked.retry, total: liked.total } : prompts;

  // The section's own filter icon (prompts / liked lists) and the Kart | Izgara toggle (every list that has one) sit in the control row next to the menu.
  const filterable = activeTab === "prompts" || activeTab === "liked";
  const hasActiveFilters = activeType !== "all" || normalizedSearch.length > 0;
  // The control row shows once there is something to filter, or while a filter is on (an empty result must still let the filter be cleared).
  const listKnown = !list.loading && (list.items.length > 0 || hasActiveFilters || (list.total ?? 0) > 0);
  // Once shown it stays: changing a filter reloads the list, and the control (which owns the open filter sheet) must not vanish — and close the
  // sheet — while the new page loads.
  const [filterShown, setFilterShown] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latches once the list is known (see above); nothing async to wait on
    if (listKnown) setFilterShown((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [listKnown, activeTab]);
  const showFilter = filterable && (listKnown || filterShown[activeTab] === true);
  const viewable = (filterable && (listKnown || filterShown[activeTab] === true) && (list.items.length > 0 || list.loading)) || (activeTab === "requests" && requests.items.length > 0) || (activeTab === "workflows" && workflows.items.length > 0);

  function clearFilters() {
    setActiveType("all");
    setSearch("");
  }

  // The menu lists every section; the first entry never needs a divider above it.
  const menuItems = tabs.map((item, index) => (index === 0 ? { ...item, dividerBefore: false } : item));
  const searchable = filterable && showFilter;

  return (
    // Sade (docs/history/243-*, 272-*): header · rail (stories + collections) · [section menu pill + tools] · list.
    <ContentGridColumns value="sm:columns-2">
      <div className="w-full animate-rise-in pb-16">
        <ProfileHeader
          user={user}
          isOwnProfile={isOwnProfile}
          postCounts={postCounts}
          followerCount={followState.followerCount}
          reuseCount={reuseCount}
          onSelectPosts={() => setActiveTab("prompts")}
          actions={isOwnProfile ? <OwnProfileActions user={user} /> : <OtherProfileActions user={user} followState={followState} />}
        />
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
          <ProfileRail ownerId={user.id} isOwnProfile={isOwnProfile} collections={publicCollections} />

          {/* Sade (docs/history/272-*): one control row — the section menu pill on the left, the section's tools on the right (search · filter · Kart|Izgara · "+" on one's own profile). */}
          <div className="mt-5 flex min-w-0 items-center gap-1.5" data-profile-controls="">
            <SectionMenu items={menuItems} active={activeTab} onChange={setActiveTab} ariaLabel={t("profile.sectionsAriaLabel")} title={user.displayName} />
            <span className="flex-1" />
            {searchable && (
              <button
                type="button"
                onClick={() => (searchOpen && search ? (setSearch(""), setSearchOpen(false)) : setSearchOpen((open) => !open))}
                aria-label={t("profile.searchPlaceholder")}
                title={t("profile.searchPlaceholder")}
                aria-pressed={searchOpen}
                data-profile-search=""
                className={cn(CONTROL_ICON_BUTTON, searchOpen && "bg-surface-soft")}
              >
                {searchOpen ? <X size={22} strokeWidth={1.75} aria-hidden /> : <Search size={22} strokeWidth={1.75} aria-hidden />}
              </button>
            )}
            {showFilter && (
              <ProfileFilterControl
                availableTypes={PROFILE_TYPE_OPTIONS}
                activeType={activeType}
                onTypeChange={setActiveType}
                sort={sort}
                onSortChange={setSort}
                search={search}
                onSearchChange={setSearch}
                showSearch={false}
                hasActiveFilters={hasActiveFilters}
                onClear={() => {
                  clearFilters();
                  setSearchOpen(false);
                }}
              />
            )}
            {viewable && <CompactViewToggle />}
            {isOwnProfile && (
              <Link href="/create" aria-label={t("create.promptTitle")} title={t("create.promptTitle")} data-profile-create="" className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft")}>
                <Plus size={22} strokeWidth={1.75} aria-hidden />
              </Link>
            )}
          </div>
          {searchable && searchOpen && (
            <label className="mt-2 flex h-11 items-center gap-2 rounded-full bg-surface-soft px-4 focus-within:ring-2 focus-within:ring-primary" data-profile-search-field="">
              <Search size={16} className="shrink-0 text-text-muted" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("profile.searchPlaceholder")}
                aria-label={t("profile.searchPlaceholder")}
                className="h-full w-full bg-transparent text-body text-text outline-none placeholder:text-text-muted"
              />
            </label>
          )}

          <div className="mt-4 space-y-4">
            {activeTab === "about" ? (
              // The side column is gone (docs/history/243-*): the tab carries the details and the contribution map.
              <div className="space-y-5">
                <ProfileAbout user={user} />
                <ContributionMap userId={user.id} />
              </div>
            ) : activeTab === "requests" ? (
              <PagedListState list={requests}>
                {requests.items.length === 0 ? (
                  <ProfileEmptyState
                    icon={Sparkles}
                    title={t("profile.noRequestsYetTitle")}
                    description={isOwnProfile ? t("profile.noRequestsYetOwnBody") : t("profile.noRequestsYetOtherBody")}
                    action={isOwnProfile ? { label: t("create.requestTitle"), href: "/requests/new" } : undefined}
                  />
                ) : (
                  <RequestList requests={requests.items} />
                )}
              </PagedListState>
            ) : activeTab === "workflows" ? (
              <PagedListState list={workflows}>
                {workflows.items.length === 0 ? (
                  <ProfileEmptyState
                    icon={WorkflowIcon}
                    title={t("workflow.noneYetTitle")}
                    description={isOwnProfile ? t("workflow.noneYetBody") : t("workflow.noneYetOtherBody")}
                    action={isOwnProfile ? { label: t("workflow.create"), href: "/workflows/create" } : undefined}
                  />
                ) : viewMode === "focus" ? (
                  <FocusGrid items={workflows.items.map((data) => ({ kind: "workflow" as const, data }))} />
                ) : (
                  <ContentGrid>
                    {workflows.items.map((workflow) => (
                      <div key={workflow.id} className={CONTENT_GRID_ITEM_CLASS}>
                        <WorkflowCard workflow={workflow} />
                      </div>
                    ))}
                  </ContentGrid>
                )}
              </PagedListState>
            ) : activeTab === "quotes" ? (
              <ProfileQuotesPanel authorId={user.id} isOwn={isOwnProfile} />
            ) : activeTab === "results" ? (
              <ProfileResultsPanel creator={user} isOwn={isOwnProfile} />
            ) : activeTab === "presets" ? (
              <ProfilePresetsPanel ownerId={user.id} isOwn={isOwnProfile} />
            ) : activeTab === "saved" ? (
              // No more separate flat "Tümü" list here — Kaydedilenler IS the
              // collections view now, "Genel" (the default, general-save
              // bucket) always shown first (CLAUDE.md Bölüm 9.22 §1). Removed
              // structurally, not hidden: no sub-tab state, no filter/sort
              // toolbar, no second data source for this tab anymore.
              <CollectionsPanel ownerId={user.id} ownerProfile={user} />
            ) : activeTab === "collections" ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2 sm:grid-cols-3 sm:gap-x-4">
                {publicCollections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} readOnly />
                ))}
              </div>
            ) : activeTab === "spaces" && publicSpaces ? (
              <ProfileSpacesPanel data={publicSpaces} onChange={(data) => setSpacesOverride({ owner: user.id, data })} />
            ) : activeTab === "drafts" ? (
              // Owner-only (the tab itself is only ever offered when
              // isOwnProfile, see `tabs` above) — all four content types'
              // drafts, reusing the same fetch/delete/continue flow as the
              // per-creation-page "Taslaklar (N)" button (Bölüm 9.65).
              <ProfileDraftsPanel userId={user.id} />
            ) : (
              <>
                {list.loading ? (
                  <PagedListSkeleton />
                ) : list.failed && list.items.length === 0 ? (
                  <div className="space-y-3 py-8 text-center" role="alert">
                    <p className="text-small text-danger">{t("feed.loadFailed")}</p>
                    <Button variant="outline" onClick={list.retry} data-testid="profile-list-retry">
                      {t("common.retry")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <ProfileContentGrid
                      prompts={list.items}
                      isOwnProfile={isOwnProfile && activeTab === "prompts"}
                      onDeleted={handleDeleted}
                      emptyState={
                        hasActiveFilters ? (
                          <ProfileEmptyState
                            icon={SearchX}
                            title={t("profile.noMatchForFilterTitle")}
                            description={t("profile.noMatchForFilterBody")}
                          />
                        ) : (
                          <TabEmptyState tab={activeTab} isOwnProfile={isOwnProfile} />
                        )
                      }
                    />
                    <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={() => void list.loadMore()} auto />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ContentGridColumns>
  );
}

function TabEmptyState({ tab, isOwnProfile }: { tab: ProfileTabKey; isOwnProfile: boolean }) {
  const { t } = useTranslation();
  if (tab === "liked") {
    return (
      <ProfileEmptyState
        icon={Heart}
        title={t("profile.likedPromptsHereTitle")}
        description={t("profile.likedPromptsHereBody")}
        action={{ label: t("profile.explorePrompts"), href: "/discover" }}
      />
    );
  }
  return (
    <ProfileEmptyState
      icon={Sparkles}
      title={t("profile.creativeJourneyStartsHereTitle")}
      description={t("profile.creativeJourneyStartsHereBody")}
      action={isOwnProfile ? { label: t("create.promptTitle"), href: "/create" } : undefined}
    />
  );
}
