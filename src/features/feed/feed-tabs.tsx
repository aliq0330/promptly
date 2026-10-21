"use client";

import { useState } from "react";
import { Clock, Flame, Hash, LayoutGrid, SquareTerminal, SlidersHorizontal, Sparkles, UserCheck, UserStar, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/chip";
import { SectionNav } from "@/features/content/section-nav";
import { Button } from "@/components/ui/button";
import { ListToolbar, SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { useFeedPages } from "./use-feed-pages";
import { useForYouPages } from "./use-for-you-pages";
import { ForYouInterests, ForYouReasonNote } from "./for-you-parts";
import { cameFromHistory } from "@/lib/history-navigation";
import { cn } from "@/lib/utils";
import type { FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useFollowedTags } from "@/features/tags/followed-tags-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Home's views are real server queries, not filters over a client-side pool:
 *   - forYou    → "Sana özel" (`public.for_you_page`, docs/history/209-*): ranked from the signed-in user's own real
 *                 signals (followed people and tags, profile interests, the tags of what they liked), each card with its
 *                 reason; the default for a signed-in user
 *   - newest    → every public post, newest first (`public.feed_page`, like the rest)
 *   - popular   → every public post by like_count (then newest)
 *   - following → posts by the people the signed-in user follows
 *   - tags      → posts tagged with a tag the signed-in user follows
 */
type TabKey = "forYou" | "newest" | "popular" | "following" | "tags";
type KindFilter = "all" | FeedItem["kind"];

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Clock }[] = [
  { key: "forYou", labelKey: "home.tabForYou", icon: UserStar },
  { key: "newest", labelKey: "home.tabNewest", icon: Clock },
  { key: "popular", labelKey: "home.tabPopular", icon: Flame },
  { key: "following", labelKey: "nav.following", icon: UserCheck },
  { key: "tags", labelKey: "home.tabTags", icon: Hash },
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
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const { user, loading: authLoading } = useAuth();
  const followedTags = useFollowedTags();
  // Signed in → "Sana özel" first; a guest opens on "En yeni" (while the session is restored we assume the former).
  const active: TabKey = chosen ?? (user || authLoading ? "forYou" : "newest");
  const setActive = (tab: TabKey) => {
    setChosen(tab);
    try {
      window.sessionStorage.setItem(TAB_MEMORY_KEY, tab);
    } catch {
      /* storage blocked — the tab just is not remembered */
    }
  };

  // "Sana özel", "Following" and "My tags" need a signed-in user: a guest gets the login prompt below and no request is
  // made (while the session is still being restored we wait instead of flashing that prompt).
  const isForYou = active === "forYou";
  const needsAccount = isForYou || active === "following" || active === "tags";
  const waitingForAuth = needsAccount && authLoading;
  const needsLogin = needsAccount && !authLoading && !user;
  const feedPages = useFeedPages(
    { scope: active === "following" ? "following" : active === "tags" ? "tags" : "all", order: active === "popular" ? "popular" : "newest", kind, taxonomy },
    !isForYou && !needsLogin && !waitingForAuth,
  );
  const forYou = useForYouPages({ kind, taxonomy }, isForYou && !needsLogin && !waitingForAuth);
  const feed = isForYou ? { ...forYou, retry: forYou.refresh } : feedPages;

  // A signed-in viewer with no followed tags gets "start by following one" instead of a misleading "no posts".
  const noTagsFollowed = followedTags.loaded && followedTags.tags.length === 0;

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
      <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} />
    </>
  );
  const activeCount = (kind === "all" ? 0 : 1) + taxonomyActiveCount(taxonomy, true);
  const clearFilters = () => {
    setKind("all");
    setTaxonomy(EMPTY_TAXONOMY_FILTER);
  };

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")}>
      {layout === "home" ? (
        // Meydan "Bölüm balonları" (docs/history/207-*): the four views as tiles; once they scroll away they fold into a bar pinned under the header.
        <SectionNav
          items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
          active={active}
          onChange={setActive}
          ariaLabel={t("feed.viewAriaLabel")}
          spread
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

      {isForYou && user && <ForYouInterests onChanged={forYou.refresh} />}

      {needsLogin ? (
        <EmptyState
          icon={isForYou ? UserStar : active === "tags" ? Hash : UserCheck}
          title={isForYou ? t("feed.emptyForYouLoginTitle") : active === "tags" ? t("feed.emptyTagsLoginTitle") : t("feed.emptyFollowingTitle")}
          description={
            isForYou
              ? t("feed.emptyForYouLoginDescription")
              : active === "tags"
                ? t("feed.emptyTagsLoginDescription")
                : t("feed.emptyFollowingDescription")
          }
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
                : active === "following"
                  ? t("feed.emptyFollowingNoPosts")
                  : active === "tags"
                    ? noTagsFollowed
                      ? t("feed.emptyTagsNoneTitle")
                      : t("feed.emptyTagsNoPosts")
                    : t("feed.emptyDefault")
            }
            emptyDescription={
              isForYou
                ? t("feed.emptyForYouDescription")
                : active === "following"
                  ? t("feed.emptyFollowingHint")
                  : active === "tags" && noTagsFollowed
                    ? t("feed.emptyTagsNoneDescription")
                    : undefined
            }
            emptyAction={
              isForYou || active === "following"
                ? { label: t("feed.goToDiscover"), href: "/discover" }
                : active === "tags"
                  ? { label: t("feed.goToTags"), href: "/tags" }
                  : undefined
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
