"use client";

import { useEffect, useMemo, useState } from "react";
import { Blocks, Flame, LayoutGrid, SquareTerminal, Sparkles, Stars, UserCheck } from "lucide-react";
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
import { fetchFollowedProfiles } from "@/lib/supabase/profiles";

type TabKey = "following" | "popular" | "for-you";
type KindFilter = "all" | FeedItem["kind"];

const TABS = [
  { key: "for-you" as const, label: "Sana Özel", icon: Stars },
  { key: "popular" as const, label: "Popüler", icon: Flame },
  { key: "following" as const, label: "Takip Ettiklerim", icon: UserCheck },
];

const KIND_FILTERS: { key: KindFilter; label: string; icon: typeof LayoutGrid }[] = [
  { key: "all", label: "Tümü", icon: LayoutGrid },
  { key: "prompt", label: "Promptlar", icon: SquareTerminal },
  { key: "generator", label: "Generatorlar", icon: Blocks },
  { key: "request", label: "İstekler", icon: Sparkles },
];

export function FeedTabs() {
  const [active, setActive] = useState<TabKey>("for-you");
  const [kind, setKind] = useState<KindFilter>("all");
  const { user } = useAuth();
  const { realPrompts, loading } = useRealPrompts();
  const { realRequests } = useRealRequests();
  const { realGenerators } = useRealGenerators();
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
    return [...promptItems, ...requestItems, ...generatorItems].sort((a, b) => feedItemCreatedAt(b) - feedItemCreatedAt(a));
  }, [realPrompts, realRequests, realGenerators]);

  const visible = useMemo(() => {
    const byTab =
      active === "popular"
        ? [...allItems].sort((a, b) => feedItemPopularity(b) - feedItemPopularity(a))
        : active === "following"
          ? allItems.filter((item) => followedIds.has(feedItemAuthorId(item)))
          : allItems;
    return kind === "all" ? byTab : byTab.filter((item) => item.kind === kind);
  }, [allItems, active, followedIds, kind]);

  return (
    <section className="space-y-4" aria-label="Akış">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs items={TABS} active={active} onChange={setActive} ariaLabel="Akış görünümü" variant="segmented" />
        <ChipRow>
          {KIND_FILTERS.map((filter) => (
            <Chip key={filter.key} icon={filter.icon} selected={kind === filter.key} onClick={() => setKind(filter.key)}>
              {filter.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {active === "following" && !user ? (
        <EmptyState
          icon={UserCheck}
          title="Takip ettiklerin burada görünür"
          description="Takip ettiğin yaratıcıların promptlarını ve generatorlarını görmek için giriş yap."
          action={{ label: "Giriş yap", href: "/login" }}
        />
      ) : loading && allItems.length === 0 ? (
        <PromptCardSkeletonGrid count={6} />
      ) : (
        <FeedGrid
          items={visible}
          emptyTitle={active === "following" ? "Takip ettiklerinden henüz paylaşım yok" : "Henüz gösterilecek içerik yok."}
          emptyDescription={active === "following" ? "Keşfet'ten yeni yaratıcılar bulup takip edebilirsin." : undefined}
          emptyAction={active === "following" ? { label: "Keşfet'e git", href: "/discover" } : undefined}
        />
      )}
    </section>
  );
}
