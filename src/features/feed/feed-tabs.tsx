"use client";

import { useEffect, useState } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import { Clock } from "@/components/icons/clock";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { UserCheck } from "@/components/icons/user-check";
import { UserStar } from "@/components/icons/user-star";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/chip";
import { SectionNav } from "@/features/content/section-nav";
import { ListToolbar, SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { TaxonomyTypeChips } from "@/features/content/taxonomy-filter";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedGrid } from "./feed-grid";
import { useFeedPages } from "./use-feed-pages";
import { NewPostsPill } from "./new-posts-pill";
import { useForYouPages } from "./use-for-you-pages";
import { useInterestFeedback } from "./interest-feedback";
import { useCreatorStrips } from "./creator-suggestions";
import { ForYouReasonNote, ForYouSettingsModal, ForYouSetupBanner, ForYouSheetSection } from "./for-you-parts";
import {
  EMPTY_FOLLOWED_FILTER,
  FollowedFilterSections,
  FollowedFilterSummary,
  followedFilterCount,
  useEffectiveFollowedFilter,
  useFollowedPeople,
  type FollowedFilterValue,
} from "./followed-filters";
import { cameFromHistory } from "@/lib/history-navigation";
import { cn } from "@/lib/utils";
import type { FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useFollowedTags } from "@/features/tags/followed-tags-store";
import { useFollowedTools } from "@/features/tools/followed-tools-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { GRID_COLUMNS_ASIDE } from "@/lib/grid-columns";
import { FollowingFeed } from "@/features/following/following-feed";
import { FollowFeedSettingsList } from "@/features/following/following-rail";
import { FollowManageModal } from "@/features/following/follow-manage-modal";
import { setHomeTab, useFollowFeedState } from "@/features/following/follow-feed-store";
import { Button } from "@/components/ui/button";
import { FeaturedPostCard, useFeaturedPosts } from "./featured-post-card";
import { StaleFeedNotice } from "./stale-feed-notice";

/**
 * Home is the viewer's own feed (docs/history/221-*; Keşfet is where new things are found). Two views, both real server queries
 * (not filters over a client-side pool):
 *   - forYou    → "Sana özel" (`public.for_you_page`, docs/history/209-*): ranked from the signed-in user's own real
 *                 signals (followed people and tags, followed AI tools, profile interests, the tags of what they liked),
 *                 each card with its reason; the default for a signed-in user. Its ranking is unchanged here.
 *   - following → "Takip Ettiklerim": the posts of the people the signed-in user follows, NEWEST FIRST (`public.feed_page`
 *                 scope `following`, order `newest`) — strictly chronological, nothing re-ranked.
 * On top of either: the post-type chips (Hepsi / Promptlar / İstekler / Workflow'lar / Hazır ayarlar), and on "Takip
 * Ettiklerim" the optional filters of followed people, tags and AI tools (`followed-filters.tsx`). The Filtre sheet also has the
 * content type — Görsel / Metin / Ses / Video (docs/history/245-*; `p_content_type`, which both RPCs already take, so no migration).
 * Category and sort stay on Keşfet only — they are not repeated here. The two views are one row of text tabs (docs/history/227-*);
 * "Yenile" / "Sana özel'i ayarla" live in the Filtre sheet and the first-time hint is a one-line banner, so the first post starts high.
 */
type TabKey = "forYou" | "following";
type KindFilter = "all" | FeedItem["kind"];

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Clock }[] = [
  { key: "forYou", labelKey: "home.tabForYou", icon: UserStar },
  { key: "following", labelKey: "nav.following", icon: UserCheck },
];

const KIND_FILTERS: { key: KindFilter; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompt", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "request", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "workflow", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "preset", labelKey: "nav.presets", icon: SlidersHorizontal },
];

const TAB_MEMORY_KEY = "promptly-home-tab";

/** The tab picked last, put back only when the page is reached with the Back button (the list comes back with it). */
function restoredTab(): TabKey | null {
  if (!cameFromHistory()) return null;
  try {
    const value = window.sessionStorage.getItem(TAB_MEMORY_KEY);
    return TABS.some((tab) => tab.key === value) ? (value as TabKey) : null;
  } catch {
    return null;
  }
}

export function FeedTabs({ layout = "grid" }: { layout?: "grid" | "home" } = {}) {
  const { t } = useTranslation();
  // The open tab lives in the shared store (docs/history/451-*): the right rail follows it and "Sana Özel'e geç" inside the following feed switches it.
  const { tab: storedTab } = useFollowFeedState();
  useEffect(() => {
    const restored = restoredTab();
    if (restored) setHomeTab(restored);
  }, []);
  const [manageOpen, setManageOpen] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  // Content type only (category / subcategory stay empty on Home): Görsel · Metin · Ses · Video, a view filter like the kind chips.
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const [picked, setPicked] = useState<FollowedFilterValue>(EMPTY_FOLLOWED_FILTER);
  const [forYouSettingsOpen, setForYouSettingsOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { profile } = useOwnProfile();
  const followedTagStore = useFollowedTags();
  const followedToolStore = useFollowedTools();
  // "Sana özel" is the default (while the session is restored we assume the signed-in case); a guest sees its login prompt.
  const active: TabKey = storedTab;
  const setActive = (tab: TabKey) => {
    setHomeTab(tab);
    try {
      window.sessionStorage.setItem(TAB_MEMORY_KEY, tab);
    } catch {
      /* storage blocked — the tab just is not remembered */
    }
  };

  // Both views need a signed-in user: a guest gets the login prompt below and no request is made (while the session is
  // still being restored we wait instead of flashing that prompt).
  const feedKind = kind;
  const isForYou = active === "forYou";
  const waitingForAuth = authLoading;
  const needsLogin = !authLoading && !user;
  const enabled = !needsLogin && !waitingForAuth;

  // The followed-people / tags / tools filters narrow "Takip Ettiklerim" only; a pick of something no longer followed is dropped.
  const followedPeople = useFollowedPeople(active === "following" && enabled);
  const followedFilter = useEffectiveFollowedFilter(picked, followedPeople);
  const followedCount = followedFilterCount(followedFilter);
  const filtersShown = active === "following";

  const feedPages = useFeedPages(
    {
      scope: "following",
      order: "newest",
      kind: feedKind,
      taxonomy,
      authors: followedFilter.people,
      tags: followedFilter.tags,
      tools: followedFilter.tools,
    },
    // Takip Ettiklerin artık etkinlik akışıdır (`FollowingFeed`, docs/history/451-*); bu liste yalnız Ana Sayfa dışındaki "grid" düzeninde kullanılır.
    !isForYou && enabled && layout !== "home",
    { watchNew: false },
  );
  const forYou = useForYouPages({ kind: feedKind, taxonomy }, isForYou && enabled);
  const feed = isForYou ? { ...forYou, retry: forYou.refresh } : feedPages;
  // "İlgimi çekiyor / çekmiyor" (docs/history/275-*): Sana özel only (Takip Ettiklerim is the strictly chronological list of people they chose).
  // Sana özel never lists a post already answered, so there is nothing to read first; an answer of "çekmiyor" collapses the card with "Geri al".
  const interest = useInterestFeedback(forYou.items, { enabled: isForYou && enabled, loadExisting: false, hideOnDislike: true });
  // "Öne çıkan" büyük kart (docs/history/451-*): yalnız Sana Özel, en çok 8 gönderide bir.
  const featuredPosts = useFeaturedPosts(forYou.items, isForYou && enabled && layout === "home");
  // "Takip edilecek kişiler" (docs/history/285-*): a strip of people between the posts of BOTH tabs — signed in only.
  const creatorStrips = useCreatorStrips(enabled);
  // Nothing to learn from yet (no interests, no followed person, tag or AI tool): "Sana özel" shows its first-time card instead of guessing.
  const coldStart =
    isForYou &&
    Boolean(user) &&
    profile !== null &&
    (profile.interests ?? []).length === 0 &&
    profile.followingCount === 0 &&
    followedTagStore.loaded &&
    followedTagStore.tags.length === 0 &&
    followedToolStore.loaded &&
    followedToolStore.tools.length === 0;

  const kindChips = (
    <>
      {KIND_FILTERS.map((filter) => (
        <Chip key={filter.key} icon={filter.icon} selected={kind === filter.key} onClick={() => setKind(filter.key)}>
          {t(filter.labelKey)}
        </Chip>
      ))}
    </>
  );

  const sheetSections = (
    <>
      <SheetSection title={t("toolbar.postKind")}>
        <SheetChips>{kindChips}</SheetChips>
      </SheetSection>
      <SheetSection title={t("toolbar.contentType")}>
        <SheetChips>
          <TaxonomyTypeChips value={taxonomy} onChange={setTaxonomy} />
        </SheetChips>
      </SheetSection>
      {filtersShown && <FollowedFilterSections value={followedFilter} onChange={setPicked} people={followedPeople} />}
      {isForYou && user && <ForYouSheetSection onRefresh={forYou.refresh} onOpenSettings={() => setForYouSettingsOpen(true)} refreshing={forYou.refreshing} />}
      {!isForYou && user && layout === "home" && (
        <SheetSection title={t("follow.settings.title")}>
          <FollowFeedSettingsList />
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setManageOpen(true)} aria-haspopup="dialog">
            {t("follow.manage.open")}
          </Button>
        </SheetSection>
      )}
    </>
  );
  const typeNarrowed = taxonomy.contentType !== null;
  const activeCount = (kind === "all" ? 0 : 1) + (typeNarrowed ? 1 : 0) + (filtersShown ? followedCount : 0);
  const clearFollowedFilter = () => setPicked(EMPTY_FOLLOWED_FILTER);
  const clearFilters = () => {
    setKind("all");
    setTaxonomy(EMPTY_TAXONOMY_FILTER);
    clearFollowedFilter();
  };
  // A narrowing the person picked (followed people / tags / tools, or a content type) that left nothing: say so and offer the way back.
  const narrowedEmpty = typeNarrowed || (!isForYou && followedCount > 0);
  const clearNarrowing = () => {
    setTaxonomy(EMPTY_TAXONOMY_FILTER);
    if (!isForYou) clearFollowedFilter();
  };

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")}>
      {!isForYou && layout !== "home" && <NewPostsPill count={feedPages.newCount} plus={feedPages.newPlus} onClick={() => void feedPages.showNew()} />}
      {manageOpen && <FollowManageModal onClose={() => setManageOpen(false)} />}
      {layout === "home" ? (
        // Meydan "Bölüm balonları" (docs/history/207-*): the two views as tiles; once they scroll away they fold into a bar pinned under the header.
        <SectionNav
          items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
          active={active}
          onChange={setActive}
          ariaLabel={t("feed.viewAriaLabel")}
          variant="tabs"
          sheetSections={sheetSections}
          activeCount={activeCount}
          onClear={clearFilters}
        />
      ) : (
        <ListToolbar
          tabsBelow
          leading={
            <Tabs
              items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
              active={active}
              onChange={setActive}
              ariaLabel={t("feed.viewAriaLabel")}
              variant="segmented"
            />
          }
          tabs={kindChips}
          tabsLabel={t("toolbar.postKindAria")}
          sheetSections={sheetSections}
          activeCount={activeCount}
          onClear={clearFilters}
        />
      )}

      {filtersShown && followedCount > 0 && (
        <FollowedFilterSummary value={followedFilter} people={followedPeople.people} onChange={setPicked} onClear={clearFollowedFilter} />
      )}

      {coldStart && <ForYouSetupBanner onOpen={() => setForYouSettingsOpen(true)} />}
      {forYouSettingsOpen && <ForYouSettingsModal onClose={() => setForYouSettingsOpen(false)} onChanged={forYou.refresh} />}

      {!isForYou && layout === "home" && enabled ? (
        <FollowingFeed
          kinds={kind === "all" ? null : [kind]}
          authors={followedFilter.people}
          tags={followedFilter.tags}
          tools={followedFilter.tools}
          contentType={taxonomy.contentType}
          narrowed={kind !== "all" || followedCount > 0 || taxonomy.contentType !== null}
          onClearNarrowing={clearFilters}
        />
      ) : needsLogin ? (
        <EmptyState scene="inbox"
          icon={isForYou ? UserStar : UserCheck}
          title={isForYou ? t("feed.emptyForYouLoginTitle") : t("feed.emptyFollowingTitle")}
          description={isForYou ? t("feed.emptyForYouLoginDescription") : t("feed.emptyFollowingDescription")}
          action={{ label: t("common.login"), href: "/login" }}
        />
      ) : feed.loading || waitingForAuth ? (
        <PromptCardSkeletonGrid count={layout === "home" ? 4 : 6} columns={layout === "home" ? GRID_COLUMNS_ASIDE : undefined} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState scene="feedStalled"
          icon={Clock}
          title={t("feed.loadFailed")}
          action={{ label: t("common.retry"), onClick: feed.retry }}
        />
      ) : (
        <div
          aria-busy={isForYou && (forYou.refreshing || (forYou.stale && !forYou.failed))}
          className={cn("space-y-4 transition-opacity duration-300 ease-soft", isForYou && forYou.refreshing && "opacity-60")}
        >
          {/* docs/history/466-*: saklanan liste ekrandayken gerçek liste gelmediyse küçük band (büyük hata ekranı değil). */}
          {isForYou && forYou.stale && forYou.failed && <StaleFeedNotice onRetry={forYou.refresh} />}
          <FeedGrid
            items={feed.items}
            interest={isForYou ? interest : undefined}
            creatorStrips={creatorStrips}
            featured={
              isForYou
                ? {
                    keys: featuredPosts.keys,
                    render: (item) =>
                      item.kind === "prompt" ? <FeaturedPostCard prompt={item.data} stats={featuredPosts.stats.get(item.data.id)} /> : null,
                  }
                : undefined
            }
            layout={layout}
            // "Sana özel": every card says why it is here, and a re-ranking (new interests) glides the cards into place.
            itemNote={isForYou ? (item) => <ForYouReasonNote item={item} reason={forYou.reasons[`${item.kind}-${item.data.id}`]} /> : undefined}
            flip={isForYou}
            emptyScene={narrowedEmpty ? "search" : isForYou ? "search" : "community"}
            emptyTitle={
              narrowedEmpty ? t("feed.filteredEmptyTitle") : isForYou ? t("feed.emptyForYouTitle") : t("feed.emptyFollowingNoPosts")
            }
            emptyDescription={
              narrowedEmpty ? t("feed.filteredEmptyDescription") : isForYou ? t("feed.emptyForYouDescription") : t("feed.emptyFollowingHint")
            }
            emptyAction={narrowedEmpty ? { label: t("feed.clearFilters"), onClick: clearNarrowing } : { label: t("feed.goToDiscover"), href: "/discover" }}
          />
          {feed.failed && !(isForYou && forYou.stale) && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
          {feed.hasMore && (
            <LoadMoreButton onLoadMore={() => void feed.loadMore()} loading={feed.loadingMore} error={feed.failed} />
          )}
        </div>
      )}
    </section>
  );
}
