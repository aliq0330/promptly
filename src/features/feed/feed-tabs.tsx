"use client";

import { useEffect, useMemo, useState } from "react";
import { Blocks, Flame, LayoutGrid, SquareTerminal, SlidersHorizontal, Sparkles, Stars, UserCheck, Workflow as WorkflowIcon } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { FeedGrid } from "./feed-grid";
import { feedItemAuthorId, feedItemCreatedAt, feedItemPopularity, type FeedItem } from "./types";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

type TabKey = "following" | "popular" | "for-you";
type KindFilter = "all" | FeedItem["kind"];
type SortKey = "newest" | "oldest" | "most-liked";
const SORT_LABELS: Record<SortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

const TABS: { key: TabKey; labelKey: TranslationKey; icon: typeof Stars }[] = [
  { key: "for-you", labelKey: "home.tabForYou", icon: Stars },
  { key: "popular", labelKey: "home.tabPopular", icon: Flame },
  { key: "following", labelKey: "nav.following", icon: UserCheck },
];

const KIND_FILTERS: { key: KindFilter; labelKey: TranslationKey; icon: typeof LayoutGrid }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompt", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "generator", labelKey: "nav.generators", icon: Blocks },
  { key: "request", labelKey: "nav.requestsShort", icon: Sparkles },
  { key: "workflow", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "preset", labelKey: "nav.presets", icon: SlidersHorizontal },
];

export function FeedTabs() {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>("for-you");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const { user } = useAuth();
  const { realPrompts, loading } = useRealPrompts();
  const { realRequests } = useRealRequests();
  const { realGenerators } = useRealGenerators();
  const { realWorkflows } = useRealWorkflows();
  const { realPresets } = useRealPresets();
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
      setFollowedIds(new Set());
      return;
    }
    fetchFollowedProfiles(user.id).then((profiles) => {
      if (!cancelled) setFollowedIds(new Set(profiles.map((profile) => profile.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const allItems = useMemo<FeedItem[]>(() => {
    const promptItems: FeedItem[] = realPrompts.map((prompt) => ({ kind: "prompt", data: prompt }));
    const requestItems: FeedItem[] = realRequests.map((request) => ({ kind: "request", data: request }));
    const generatorItems: FeedItem[] = realGenerators.map((generator) => ({ kind: "generator", data: generator }));
    const workflowItems: FeedItem[] = realWorkflows.map((workflow) => ({ kind: "workflow", data: workflow }));
    const presetItems: FeedItem[] = realPresets.map((preset) => ({ kind: "preset", data: preset }));
    return [...promptItems, ...requestItems, ...generatorItems, ...workflowItems, ...presetItems].sort((a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a));
  }, [realPrompts, realRequests, realGenerators, realWorkflows, realPresets]);

  const visible = useMemo(() => {
    const byTab = active === "following" ? allItems.filter((item) => followedIds.has(feedItemAuthorId(item))) : allItems;
    const byKind = kind === "all" ? byTab : byTab.filter((item) => item.kind === kind);
    return [...byKind].sort((a, b) =>
      sort === "most-liked" ? feedItemPopularity(b) - feedItemPopularity(a) || feedItemCreatedAt(b) - feedItemCreatedAt(a) : sort === "oldest" ? feedItemCreatedAt(a) - feedItemCreatedAt(b) : feedItemCreatedAt(b) - feedItemCreatedAt(a),
    );
  }, [allItems, active, followedIds, kind, sort]);

  return (
    <section className="space-y-4" aria-label={t("feed.ariaLabel")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          items={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), icon: tab.icon }))}
          active={active}
          onChange={(tab) => {
            setActive(tab);
            setSort(tab === "popular" ? "most-liked" : "newest");
          }}
          ariaLabel={t("feed.viewAriaLabel")}
          variant="segmented"
        />
        <ChipRow scroll>
          {KIND_FILTERS.map((filter) => (
            <Chip key={filter.key} icon={filter.icon} selected={kind === filter.key} onClick={() => setKind(filter.key)}>
              {t(filter.labelKey)}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <div className="flex justify-end">
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label={t("profile.sortAriaLabel")}
          className="h-9 shrink-0 rounded-md border border-border bg-surface px-3 text-label font-medium text-text"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {t(SORT_LABELS[key])}
            </option>
          ))}
        </select>
      </div>

      {active === "following" && !user ? (
        <EmptyState
          icon={UserCheck}
          title={t("feed.emptyFollowingTitle")}
          description={t("feed.emptyFollowingDescription")}
          action={{ label: t("common.login"), href: "/login" }}
        />
      ) : loading && allItems.length === 0 ? (
        <PromptCardSkeletonGrid count={6} />
      ) : (
        <FeedGrid
          items={visible}
          emptyTitle={active === "following" ? t("feed.emptyFollowingNoPosts") : t("feed.emptyDefault")}
          emptyDescription={active === "following" ? t("feed.emptyFollowingHint") : undefined}
          emptyAction={active === "following" ? { label: t("feed.goToDiscover"), href: "/discover" } : undefined}
        />
      )}
    </section>
  );
}
