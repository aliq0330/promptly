"use client";

import { useState } from "react";
import { Clock, Flame, Hash, Inbox, LayoutGrid, SquareTerminal, SlidersHorizontal, Sparkles, UserCheck, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { ListToolbar, SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { FocusFeed } from "@/features/focus/focus-feed";
import { useViewMode } from "@/features/content/view-mode-store";
import { useFeedPages } from "./use-feed-pages";
import type { FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useFollowedTags } from "@/features/tags/followed-tags-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Home's three views are real server queries (`public.feed_page`), not filters
 * over a client-side pool:
 *   - newest    → every public post, newest first
 *   - popular   → every public post by like_count (then newest)
 *   - following → posts by the people the signed-in user follows
 *   - tags      → posts tagged with a tag the signed-in user follows
 * There is deliberately no "For You" tab: nothing here is personalised, so the
 * first tab is honestly called "Newest".
 */
type TabKey = "newest" | "popular" | "following" | "tags";
type KindFilter = "all" | FeedItem["kind"];

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Clock }[] = [
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

export function FeedTabs({ layout = "grid" }: { layout?: "grid" | "home" } = {}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>("newest");
  const [kind, setKind] = useState<KindFilter>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const { user, loading: authLoading } = useAuth();
  const followedTags = useFollowedTags();
  // Odak Akışı (docs/history/199-*) is Ana Sayfa's third view: a layer over this same feed (same pages, same cards underneath).
  const [viewMode] = useViewMode();
  const focusFeed = layout === "home" && viewMode === "feed";

  // "Following" and "My tags" need a signed-in user: a guest gets the login prompt below and no request is made
  // (while the session is still being restored we wait instead of flashing that prompt).
  const needsAccount = active === "following" || active === "tags";
  const waitingForAuth = needsAccount && authLoading;
  const needsLogin = needsAccount && !authLoading && !user;
  const feed = useFeedPages(
    { scope: active === "following" ? "following" : active === "tags" ? "tags" : "all", order: active === "popular" ? "popular" : "newest", kind, taxonomy },
    !needsLogin && !waitingForAuth,
  );

  // A signed-in viewer with no followed tags gets "start by following one" instead of a misleading "no posts".
  const noTagsFollowed = followedTags.loaded && followedTags.tags.length === 0;

  const emptyTitle =
    active === "following"
      ? t("feed.emptyFollowingNoPosts")
      : active === "tags"
        ? noTagsFollowed
          ? t("feed.emptyTagsNoneTitle")
          : t("feed.emptyTagsNoPosts")
        : t("feed.emptyDefault");
  const emptyDescription = active === "following" ? t("feed.emptyFollowingHint") : active === "tags" && noTagsFollowed ? t("feed.emptyTagsNoneDescription") : undefined;
  const emptyAction =
    active === "following"
      ? { label: t("feed.goToDiscover"), href: "/discover" }
      : active === "tags"
        ? { label: t("feed.goToTags"), href: "/tags" }
        : undefined;
  const loginState = (
    <EmptyState
      icon={active === "tags" ? Hash : UserCheck}
      title={active === "tags" ? t("feed.emptyTagsLoginTitle") : t("feed.emptyFollowingTitle")}
      description={active === "tags" ? t("feed.emptyTagsLoginDescription") : t("feed.emptyFollowingDescription")}
      action={{ label: t("common.login"), href: "/login" }}
    />
  );

  const kindChips = (
    <>
      {KIND_FILTERS.map((filter) => (
        <Chip key={filter.key} icon={filter.icon} selected={kind === filter.key} onClick={() => setKind(filter.key)}>
          {t(filter.labelKey)}
        </Chip>
      ))}
    </>
  );

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")}>
      <ListToolbar
        tabsBelow
        stream={layout === "home"}
        allowFeedView={layout === "home"}
        leading={
          layout === "home" ? (
            // Meydan: equal-width underline tabs across the column (they scroll on a phone).
            <Tabs
              items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))}
              active={active}
              onChange={setActive}
              ariaLabel={t("feed.viewAriaLabel")}
              className="sm:[&>button]:flex-1 sm:[&>button]:justify-center [&>button]:text-small [&>button]:font-semibold"
            />
          ) : (
            <Tabs
              items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
              active={active}
              onChange={setActive}
              ariaLabel={t("feed.viewAriaLabel")}
              variant="segmented"
            />
          )
        }
        tabs={kindChips}
        tabsLabel={t("toolbar.postKindAria")}
        sheetSections={
          <>
            <SheetSection title={t("toolbar.postKind")}>
              <SheetChips>{kindChips}</SheetChips>
            </SheetSection>
            <TaxonomySheetSections value={taxonomy} onChange={setTaxonomy} />
          </>
        }
        activeCount={(kind === "all" ? 0 : 1) + taxonomyActiveCount(taxonomy, true)}
        onClear={() => {
          setKind("all");
          setTaxonomy(EMPTY_TAXONOMY_FILTER);
        }}
      />

      {needsLogin ? (
        loginState
      ) : feed.loading || waitingForAuth ? (
        <PromptCardSkeletonGrid count={layout === "home" ? 4 : 6} columns={layout === "home" ? "sm:columns-2" : undefined} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("feed.loadFailed")}
          action={{ label: t("common.retry"), onClick: feed.retry }}
        />
      ) : (
        <>
          <FeedItemsView items={feed.items} layout={layout} emptyTitle={emptyTitle} emptyDescription={emptyDescription} emptyAction={emptyAction} />
          {feed.failed && <p className="text-center text-small text-danger">{t("feed.loadFailed")}</p>}
          {feed.hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>
                {feed.loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      {focusFeed && (
        <FocusFeed
          items={needsLogin ? [] : feed.items}
          loading={!needsLogin && (feed.loading || waitingForAuth)}
          failed={!needsLogin && feed.failed}
          hasMore={!needsLogin && feed.hasMore}
          loadingMore={feed.loadingMore}
          onLoadMore={() => void feed.loadMore()}
          onRetry={feed.retry}
          empty={needsLogin ? loginState : <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} action={emptyAction} />}
          controls={
            <Tabs
              items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
              active={active}
              onChange={setActive}
              ariaLabel={t("feed.viewAriaLabel")}
              variant="segmented"
              className="w-max bg-surface/80 backdrop-blur-md"
            />
          }
          memoryKey={`home:${active}:${kind}:${taxonomy.contentType ?? ""}:${taxonomy.category ?? ""}:${taxonomy.subcategory ?? ""}`}
        />
      )}
    </section>
  );
}
