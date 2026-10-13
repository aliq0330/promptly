"use client";

import { useState } from "react";
import { Clock, Flame, LayoutGrid, SquareTerminal, SlidersHorizontal, Sparkles, UserCheck, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { ListToolbar, SheetChips, SheetSection, TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedItemsView } from "./feed-items-view";
import { useFeedPages } from "./use-feed-pages";
import type { FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Home's three views are real server queries (`public.feed_page`), not filters
 * over a client-side pool:
 *   - newest    → every public post, newest first
 *   - popular   → every public post by like_count (then newest)
 *   - following → posts by the people the signed-in user follows
 * There is deliberately no "For You" tab: nothing here is personalised, so the
 * first tab is honestly called "Newest".
 */
type TabKey = "newest" | "popular" | "following";
type KindFilter = "all" | FeedItem["kind"];

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Clock }[] = [
  { key: "newest", labelKey: "home.tabNewest", icon: Clock },
  { key: "popular", labelKey: "home.tabPopular", icon: Flame },
  { key: "following", labelKey: "nav.following", icon: UserCheck },
];

const KIND_FILTERS: { key: KindFilter; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompt", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "request", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "workflow", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "preset", labelKey: "nav.presets", icon: SlidersHorizontal },
];

export function FeedTabs() {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>("newest");
  const [kind, setKind] = useState<KindFilter>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const { user, loading: authLoading } = useAuth();

  // "Following" needs a signed-in user: a guest gets the login prompt below and no request is made
  // (while the session is still being restored we wait instead of flashing that prompt).
  const waitingForAuth = active === "following" && authLoading;
  const needsLogin = active === "following" && !authLoading && !user;
  const feed = useFeedPages(
    { scope: active === "following" ? "following" : "all", order: active === "popular" ? "popular" : "newest", kind, taxonomy },
    !needsLogin && !waitingForAuth,
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
        <EmptyState
          icon={UserCheck}
          title={t("feed.emptyFollowingTitle")}
          description={t("feed.emptyFollowingDescription")}
          action={{ label: t("common.login"), href: "/login" }}
        />
      ) : feed.loading || waitingForAuth ? (
        <PromptCardSkeletonGrid count={6} />
      ) : feed.failed && feed.items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("feed.loadFailed")}
          action={{ label: t("common.retry"), onClick: feed.retry }}
        />
      ) : (
        <>
          <FeedItemsView
            items={feed.items}
            emptyTitle={active === "following" ? t("feed.emptyFollowingNoPosts") : t("feed.emptyDefault")}
            emptyDescription={active === "following" ? t("feed.emptyFollowingHint") : undefined}
            emptyAction={active === "following" ? { label: t("feed.goToDiscover"), href: "/discover" } : undefined}
          />
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
    </section>
  );
}
