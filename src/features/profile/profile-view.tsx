"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, Info, Pencil, Quote as QuoteIcon, Bookmark, Shapes, SlidersHorizontal, SearchX, Sparkles, SquareTerminal, Folder, Workflow as WorkflowIcon } from "lucide-react";
import { ProfileBand } from "./profile-header";
import { OtherProfileActions, OwnProfileActions } from "./profile-actions";
import { ProfileAside } from "./profile-aside";
import { useFollowState } from "./use-follow-state";
import { DetailShell } from "@/features/content/detail-parts";
import { StoryHighlightsRow } from "@/features/stories/story-highlights";
import { useViewMode } from "@/features/content/view-mode-store";
import { CompactViewToggle } from "@/features/content/view-mode-switcher";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { FocusGrid } from "@/features/focus/focus-grid";
import { ContributionMap } from "./contribution-map";
import { ProfileFilterControl, type ProfileSortKey } from "./profile-toolbar";
import { ProfileContentGrid } from "./profile-content-grid";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileAbout } from "./profile-about";
import { ProfileDraftsPanel } from "./profile-drafts-panel";
import { RequestList } from "@/features/requests/request-list";
import { CollectionRings } from "@/features/profile/collection-rings";
import { CollectionsPanel } from "@/features/collections/collections-panel";
import { CollectionCard } from "@/features/collections/collection-card";
import { fetchPublicCollectionsByOwner } from "@/lib/supabase/collections";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchLikedPrompts } from "@/lib/supabase/prompts";
import { fetchWorkflowsByCreator } from "@/lib/supabase/workflows";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { fetchPresetsByCreator } from "@/lib/supabase/presets";
import { ProfilePresetsPanel } from "@/features/presets/profile-presets-panel";
import type { Collection, Preset, Prompt, PromptContentType, PromptRequest, UserProfile, Workflow } from "@/types";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid, ContentGridColumns } from "@/features/content/content-card";
import { ProfileSpacesPanel, usePublicSpaces, type PublicSpaces } from "@/features/spaces/public-spaces";
import { ProfileQuotesPanel } from "@/features/quotes/profile-quotes-panel";
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

/** One flat set of sections since Meydan (docs/history/190-*); since docs/history/233-* they live in ONE "Promptlar ▾" menu instead of a tab row. */
export type ProfileTabKey = "prompts" | "requests" | "workflows" | "presets" | "drafts" | "saved" | "collections" | "spaces" | "quotes" | "liked" | "about";

export function ProfileView({
  user,
  isOwnProfile,
  authorPrompts: initialAuthorPrompts,
  authorRequests,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  authorPrompts: Prompt[];
  /** This profile's own real prompt requests (Prompt İstekleri) — always public, shown on every profile, not just the owner's (CLAUDE.md prompt-request module). */
  authorRequests: PromptRequest[];
}) {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  // One follow state for the band's follower count and the actions row's button (see FollowButtonView's comment).
  const followState = useFollowState(user);

  const [authorPrompts, setAuthorPrompts] = useState(initialAuthorPrompts);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched prompt list (a new array) replaces the previous one, e.g. navigating to a different profile
    setAuthorPrompts(initialAuthorPrompts);
  }, [initialAuthorPrompts]);

  function handleDeleted(promptId: string) {
    setAuthorPrompts((prev) => prev.filter((prompt) => prompt.id !== promptId));
  }

  // Real likes — only ever fetched for one's own profile, and only for the
  // signed-in real viewer (RLS keeps prompt_likes' "did I like this"
  // private to its own user regardless). "Kaydedilenler" no longer has a
  // flat, separate list of its own here — it IS the collections view now
  // (CollectionsPanel, starting with the default "Genel" collection), so
  // there's nothing left to fetch/hold at this level for it (CLAUDE.md
  // Bölüm 9.22 §1 — the old "Tümü" sub-tab and its state were removed
  // structurally, not just hidden with CSS).
  const [likedPrompts, setLikedPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOwnProfile || !authUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch for someone else's profile or a signed-out viewer
      setLikedPrompts([]);
      return;
    }
    fetchLikedPrompts(authUser.id).then((prompts) => {
      if (!cancelled) setLikedPrompts(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, authUser]);

  // RLS: a visitor gets this creator's published workflows, the owner their drafts too.
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchWorkflowsByCreator(user.id).then((list) => !cancelled && setWorkflows(list));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Same RLS rule: a visitor gets this creator's public published presets, the owner all of theirs (private + drafts).
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchPresetsByCreator(user.id).then((list) => !cancelled && setPresets(list));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("prompts");
  const [activeType, setActiveType] = useState<PromptContentType | "all">("all");
  const [sort, setSort] = useState<ProfileSortKey>("newest");
  const [search, setSearch] = useState("");
  const [viewMode] = useViewMode();

  // Published posts only — an owner's drafts (visible to them via RLS) aren't "posts" yet.
  const postCounts = useMemo(
    () => ({
      prompts: authorPrompts.length,
      requests: authorRequests.length,
      workflows: workflows.filter((w) => w.status === "published").length,
      presets: presets.filter((p) => p.status === "published").length,
    }),
    [authorPrompts.length, authorRequests.length, workflows, presets],
  );
  // Real `copy_count` (one per signed-in person per day, never the author — docs/history/160-*), summed over the prompts this profile lists.
  const reuseCount = useMemo(() => authorPrompts.reduce((sum, prompt) => sum + prompt.copyCount, 0), [authorPrompts]);

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
    let firstOfGroup = true;
    const group = (item: SectionMenuItem<ProfileTabKey>) => {
      base.push(firstOfGroup ? { ...item, dividerBefore: true } : item);
      firstOfGroup = false;
    };
    if (spaceCount > 0) group({ key: "spaces", label: t("spaces.discover.profileTab"), icon: Shapes, meta: spaceCount });
    if (isOwnProfile) {
      group({ key: "drafts", label: t("profile.tabDrafts"), icon: Pencil });
      group({ key: "saved", label: t("profile.tabSaved"), icon: Bookmark });
      group({ key: "liked", label: t("profile.tabLiked"), icon: Heart, meta: likedPrompts.length });
    }
    if (!isOwnProfile && publicCollections.length > 0) group({ key: "collections", label: t("profile.tabCollections"), icon: Folder, meta: publicCollections.length });
    base.push({ key: "about", label: t("profile.tabAbout"), icon: Info, dividerBefore: true });
    return base;
  }, [postCounts, quoteCount, isOwnProfile, likedPrompts.length, publicCollections.length, spaceCount, t]);

  const activeSource = useMemo(() => {
    switch (activeTab) {
      case "liked":
        return likedPrompts;
      default:
        return authorPrompts;
    }
  }, [activeTab, authorPrompts, likedPrompts]);

  const availableTypes = useMemo(() => {
    const types = new Set<PromptContentType>();
    activeSource.forEach((prompt) => types.add(prompt.contentType));
    return Array.from(types);
  }, [activeSource]);

  const normalizedSearch = search.trim().toLocaleLowerCase("tr");

  const filtered = useMemo(() => {
    let items = activeSource;
    if (activeType !== "all") {
      items = items.filter((prompt) => prompt.contentType === activeType);
    }
    if (normalizedSearch) {
      items = items.filter(
        (prompt) =>
          prompt.title.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.description.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.tags.some((tag) => tag.label.toLocaleLowerCase("tr").includes(normalizedSearch)),
      );
    }
    return sortPrompts(items, sort);
  }, [activeSource, activeType, normalizedSearch, sort]);

  // The section's own filter icon (prompts / liked lists) and the Kart | Izgara toggle (every list that has one) sit in the control row next to the menu.
  const filterable = activeTab === "prompts" || activeTab === "liked";
  const viewable =
    (filterable && activeSource.length > 0) || (activeTab === "requests" && authorRequests.length > 0) || (activeTab === "workflows" && workflows.length > 0);

  const hasActiveFilters = activeType !== "all" || normalizedSearch.length > 0;

  function clearFilters() {
    setActiveType("all");
    setSearch("");
  }

  return (
    // Albüm (docs/history/203-*): band (avatar-tinted) · actions row · [tabs + lists | Hakkında from `lg`].
    <ContentGridColumns value="sm:columns-2">
      <DetailShell
        band={
          <ProfileBand
            user={user}
            isOwnProfile={isOwnProfile}
            postCounts={postCounts}
            followerCount={followState.followerCount}
            reuseCount={reuseCount}
            onSelectPosts={() => setActiveTab("prompts")}
          />
        }
        actions={isOwnProfile ? <OwnProfileActions user={user} /> : <OtherProfileActions user={user} followState={followState} />}
        aside={<ProfileAside user={user} />}
      >
        <div className="space-y-5">
          {/* Öne çıkan hikâyeler (docs/history/198-*); topluluk halkalarının yerini aldı. */}
          <StoryHighlightsRow ownerId={user.id} isOwnProfile={isOwnProfile} />
          <CollectionRings collections={publicCollections} />

          <div className="flex items-center gap-1.5">
            <SectionMenu items={tabs} active={activeTab} onChange={setActiveTab} ariaLabel={t("profile.sectionsAriaLabel")} title={user.displayName} />
            <span className="flex-1" />
            {filterable && activeSource.length > 0 && (
              <ProfileFilterControl
                availableTypes={availableTypes}
                activeType={activeType}
                onTypeChange={setActiveType}
                sort={sort}
                onSortChange={setSort}
                search={search}
                onSearchChange={setSearch}
                showSearch={activeSource.length > 8}
                hasActiveFilters={hasActiveFilters}
                onClear={clearFilters}
              />
            )}
            {viewable && <CompactViewToggle />}
          </div>

          <div className="space-y-4">
            {activeTab === "about" ? (
              // The contribution map moved here from under the header (it took a full-width card before every visit).
              // From `lg` the side column already shows the about details, so the tab keeps only the map there.
              <div className="space-y-5">
                <div className="lg:hidden">
                  <ProfileAbout user={user} />
                </div>
                <ContributionMap userId={user.id} />
              </div>
            ) : activeTab === "requests" ? (
              authorRequests.length === 0 ? (
                <ProfileEmptyState
                  icon={Sparkles}
                  title={t("profile.noRequestsYetTitle")}
                  description={
                    isOwnProfile
                      ? t("profile.noRequestsYetOwnBody")
                      : t("profile.noRequestsYetOtherBody")
                  }
                  action={isOwnProfile ? { label: t("create.requestTitle"), href: "/requests/new" } : undefined}
                />
              ) : (
                <RequestList requests={authorRequests} />
              )
            ) : activeTab === "workflows" ? (
              workflows.length === 0 ? (
                <ProfileEmptyState
                  icon={WorkflowIcon}
                  title={t("workflow.noneYetTitle")}
                  description={isOwnProfile ? t("workflow.noneYetBody") : t("workflow.noneYetOtherBody")}
                  action={isOwnProfile ? { label: t("workflow.create"), href: "/workflows/create" } : undefined}
                />
              ) : (
                viewMode === "focus" ? (
                  <FocusGrid items={workflows.map((data) => ({ kind: "workflow" as const, data }))} />
                ) : (
                  <ContentGrid>
                    {workflows.map((workflow) => (
                      <div key={workflow.id} className={CONTENT_GRID_ITEM_CLASS}>
                        <WorkflowCard workflow={workflow} />
                      </div>
                    ))}
                  </ContentGrid>
                )
              )
            ) : activeTab === "quotes" ? (
              <ProfileQuotesPanel authorId={user.id} isOwn={isOwnProfile} />
            ) : activeTab === "presets" ? (
              <ProfilePresetsPanel ownerId={user.id} isOwn={isOwnProfile} created={presets} />
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
                <ProfileContentGrid
                  prompts={filtered}
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
              </>
            )}
          </div>
        </div>
      </DetailShell>
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
