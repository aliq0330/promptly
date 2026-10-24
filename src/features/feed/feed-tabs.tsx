"use client";

import { useState } from "react";
import { Clock, LayoutGrid, SquareTerminal, SlidersHorizontal, Sparkles, UserCheck, UserStar, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/chip";
import { SectionNav } from "@/features/content/section-nav";
import { Button } from "@/components/ui/button";
import { ListToolbar, SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { useFeedPages } from "./use-feed-pages";
import { useForYouPages } from "./use-for-you-pages";
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

/**
 * Home is the viewer's own feed (docs/history/221-*; Keşfet is where new things are found). Two views, both real server queries
 * (not filters over a client-side pool):
 *   - forYou    → "Sana özel" (`public.for_you_page`, docs/history/209-*): ranked from the signed-in user's own real
 *                 signals (followed people and tags, followed AI tools, profile interests, the tags of what they liked),
 *                 each card with its reason; the default for a signed-in user. Its ranking is unchanged here.
 *   - following → "Takip Ettiklerim": the posts of the people the signed-in user follows, NEWEST FIRST (`public.feed_page`
 *                 scope `following`, order `newest`) — strictly chronological, nothing re-ranked.
 * On top of either: the post-type chips (Hepsi / Promptlar / İstekler / Workflow'lar / Hazır ayarlar), and on "Takip
 * Ettiklerim" the optional filters of followed people, tags and AI tools (`followed-filters.tsx`). Category / content-type /
 * sort filters live on Keşfet only — they are not repeated here. The two views are one row of text tabs (docs/history/227-*);
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
  const [chosen, setChosen] = useState<TabKey | null>(restoredTab);
  const [kind, setKind] = useState<KindFilter>("all");
  const [picked, setPicked] = useState<FollowedFilterValue>(EMPTY_FOLLOWED_FILTER);
  const [forYouSettingsOpen, setForYouSettingsOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { profile } = useOwnProfile();
  const followedTagStore = useFollowedTags();
  const followedToolStore = useFollowedTools();
  // "Sana özel" is the default (while the session is restored we assume the signed-in case); a guest sees its login prompt.
  const active: TabKey = chosen ?? "forYou";
  const setActive = (tab: TabKey) => {
    setChosen(tab);
    try {
      window.sessionStorage.setItem(TAB_MEMORY_KEY, tab);
    } catch {
      /* storage blocked — the tab just is not remembered */
    }
  };

  // Both views need a signed-in user: a guest gets the login prompt below and no request is made (while the session is
  // still being restored we wait instead of flashing that prompt).
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
      kind,
      taxonomy: EMPTY_TAXONOMY_FILTER,
      authors: followedFilter.people,
      tags: followedFilter.tags,
      tools: followedFilter.tools,
    },
    !isForYou && enabled,
  );
  const forYou = useForYouPages({ kind, taxonomy: EMPTY_TAXONOMY_FILTER }, isForYou && enabled);
  const feed = isForYou ? { ...forYou, retry: forYou.refresh } : feedPages;
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
      {filtersShown && <FollowedFilterSections value={followedFilter} onChange={setPicked} people={followedPeople} />}
      {isForYou && user && <ForYouSheetSection onRefresh={forYou.refresh} onOpenSettings={() => setForYouSettingsOpen(true)} refreshing={forYou.refreshing} />}
    </>
  );
  const activeCount = (kind === "all" ? 0 : 1) + (filtersShown ? followedCount : 0);
  const clearFollowedFilter = () => setPicked(EMPTY_FOLLOWED_FILTER);
  const clearFilters = () => {
    setKind("all");
    clearFollowedFilter();
  };

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")}>
      {layout === "home" ? (
        // Meydan "Bölüm balonları" (docs/history/207-*): the two views as tiles; once they scroll away they fold into a bar pinned under the header.
        <SectionNav
          items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
          active={active}
          onChange={setActive}
          ariaLabel={t("feed.viewAriaLabel")}
          spread
          variant="tabs"
          chips={kindChips}
          chipsLabel={t("toolbar.postKindAria")}
          chipsOnMobile
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

      {needsLogin ? (
        <EmptyState
          icon={isForYou ? UserStar : UserCheck}
          title={isForYou ? t("feed.emptyForYouLoginTitle") : t("feed.emptyFollowingTitle")}
          description={isForYou ? t("feed.emptyForYouLoginDescription") : t("feed.emptyFollowingDescription")}
          action={{ label: t("common.login"), href: "/login" }}
        />
      ) : feed.loading || waitingForAuth ? (
        <PromptCardSkeletonGrid count={layout === "home" ? 4 : 6} columns={layout === "home" ? "sm:columns-2" : undefined} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("feed.loadFailed")}
          action={{ label: t("common.retry"), onClick: feed.retry }}
        />
      ) : (
        <div
          aria-busy={isForYou && forYou.refreshing}
          className={cn("space-y-4 transition-opacity duration-300 ease-soft", isForYou && forYou.refreshing && "opacity-60")}
        >
          <FeedItemsView
            items={feed.items}
            layout={layout}
            // "Sana özel": every card says why it is here, and a re-ranking (new interests) glides the cards into place.
            itemNote={isForYou ? (item) => <ForYouReasonNote item={item} reason={forYou.reasons[`${item.kind}-${item.data.id}`]} /> : undefined}
            flip={isForYou}
            emptyTitle={
              isForYou
                ? t("feed.emptyForYouTitle")
                : followedCount > 0
                  ? t("feed.filteredEmptyTitle")
                  : t("feed.emptyFollowingNoPosts")
            }
            emptyDescription={
              isForYou ? t("feed.emptyForYouDescription") : followedCount > 0 ? t("feed.filteredEmptyDescription") : t("feed.emptyFollowingHint")
            }
            emptyAction={
              !isForYou && followedCount > 0
                ? { label: t("feed.clearFilters"), onClick: clearFollowedFilter }
                : { label: t("feed.goToDiscover"), href: "/discover" }
            }
          />
          {feed.failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
          {feed.hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>
                {feed.loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
