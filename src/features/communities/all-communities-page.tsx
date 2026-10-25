"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionMenu } from "@/features/content/section-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useToast } from "@/features/groups/use-toast";
import { CommunityCard } from "./community-card";
import { CommunityLayout } from "./community-layout";
import type { JoinState } from "./community-join-button";
import { DiscoverView } from "./communities-page";
import { applyJoinState, ErrorBox, LoadingRows, type ListState } from "./home-shared";
import { toGroupError } from "@/lib/supabase/chat-groups";
import { browseCommunities, type BrowseSort } from "@/lib/supabase/communities";
import { CATEGORY_LABEL_KEYS, COMMUNITY_CATEGORIES } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { CommunityCategory } from "@/types";

const SORTS: BrowseSort[] = ["relevant", "popular", "newest", "active"];
const SORT_LABEL: Record<BrowseSort, TranslationKey> = {
  relevant: "communities.all.sort.relevant",
  popular: "groups.page.sort.popular",
  newest: "groups.page.sort.newest",
  active: "groups.page.sort.active",
};

/**
 * `/communities/all`: Tüm topluluklar. Üstte arama (ad, açıklama, etiket), kategori süzgeci ve sıralama; varsayılan sıra ilgi puanı
 * (gerçek sinyaller: ortak kategori, ilgi alanları, takip edilen etiket/kişiler, etkinlik — sinyal yoksa yaygınlık). Herkese açık + kapalı topluluklar
 * listelenir (kapalıda içerik istatistiği yoktur), tamamen kapalı HİÇ (sunucu zorlar); üye olduklarım da durumuyla görünür. Sayfa sonuna yaklaşınca
 * sıradaki sayfa gelir; "Daha fazla" düğmesi de vardır. Oturumsuz ziyaretçi: herkese açık topluluk listesi + arama (eski Keşfet görünümü).
 */
export function AllCommunitiesPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { node: toastNode, show } = useToast();

  return (
    <CommunityLayout>
      <div className="space-y-2">
        <Link href="/communities" className="inline-flex items-center gap-1.5 text-small text-text-secondary hover:underline" data-testid="all-back">
          <ArrowLeft size={14} aria-hidden /> {t("communities.page.title")}
        </Link>
        <h1 className="text-h1 font-medium text-text">{t("communities.all.title")}</h1>
      </div>
      {authLoading ? <LoadingRows /> : user ? <BrowseView onToast={show} /> : <DiscoverView onToast={show} onGoInvites={() => undefined} />}
      {toastNode}
    </CommunityLayout>
  );
}

function BrowseView({ onToast, hideSearch }: { onToast: (message: string) => void; hideSearch?: boolean }) {
  const { t } = useTranslation();
  const { refresh } = useRealMessages();
  // `?q=` comes from the Topluluklar search box (docs/history/212-*); read once, the box below owns it after that.
  const [query, setQuery] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("q") ?? "")));
  const [debounced, setDebounced] = useState(() => query.trim());
  const [sort, setSort] = useState<BrowseSort>("relevant");
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${debounced}|${sort}|${category ?? ""}|${reloadKey}`;
  const fetchPage = useCallback((offset: number) => browseCommunities({ query: debounced, category, sort, offset }), [debounced, category, sort]);

  useEffect(() => {
    let cancelled = false;
    fetchPage(0)
      .then((page) => {
        if (!cancelled) setState({ key, items: page.communities, hasMore: page.hasMore, error: null });
      })
      .catch((err) => {
        console.error("browseCommunities", err);
        if (!cancelled) setState({ key, items: [], hasMore: false, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, key]);

  const current = state && state.key === key ? state : null;

  const loadMore = useCallback(async () => {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchPage(current.items.length);
      // Kopyasız birleştir (sunucu sırası değişmişse aynı topluluk iki kez girmesin).
      const known = new Set(current.items.map((c) => c.id));
      setState({ key, items: [...current.items, ...page.communities.filter((c) => !known.has(c.id))], hasMore: page.hasMore, error: null });
    } catch (err) {
      console.error("browseCommunities (more)", err);
      setMoreError(true);
      onToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setLoadingMore(false);
    }
  }, [current, fetchPage, key, loadingMore, onToast]);

  const hasMore = Boolean(current?.hasMore);
  const itemCount = current?.items.length ?? 0;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || moreError || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, moreError, itemCount, loadMore]);

  function changeStatus(id: string, next: JoinState) {
    setState((prev) => (prev ? { ...prev, items: prev.items.map((c) => (c.id === id ? applyJoinState(c, next) : c)) } : prev));
    if (next === "member" || next === "none") void refresh();
  }

  const filtered = debounced.length > 0 || category !== null;

  return (
    <div className="space-y-4">
      {!hideSearch && (
        <label className="relative block">
          <span className="sr-only">{t("communities.all.searchPlaceholder")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder={t("communities.all.searchPlaceholder")}
            data-testid="all-search"
            className="h-11 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label={t("communities.filter.categoryAria")}>
          {[null, ...COMMUNITY_CATEGORIES].map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                (category === value ? "border-primary/50 bg-primary-soft text-primary" : "border-border-soft bg-surface text-text-secondary hover:border-border-strong")
              }
            >
              {value ? t(CATEGORY_LABEL_KEYS[value]) : t("communities.filter.all")}
            </button>
          ))}
        </div>
        <SectionMenu ariaLabel={t("groups.page.sortAria")} title={t("groups.page.sortAria")} active={sort} onChange={setSort} items={SORTS.map((value) => ({ key: value, label: t(SORT_LABEL[value]) }))} />
      </div>

      {!current ? (
        <LoadingRows />
      ) : current.error ? (
        <ErrorBox message={t("communities.page.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : current.items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={filtered ? t("groups.page.noResults") : t("communities.all.empty")}
          description={filtered ? t("communities.all.noResultsHelp") : t("communities.discover.emptyHelp")}
        />
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="all-communities-list">
            {current.items.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                onStatusChange={(next) => changeStatus(community.id, next)}
                onToast={onToast}
                reason={sort === "relevant" && community.reason && community.reason !== "popular" ? community.reason : undefined}
              />
            ))}
          </ul>
          {current.hasMore && (
            <div ref={sentinel} className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : moreError ? t("common.retry") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The same browse list inside Keşfet's Topluluklar section (docs/history/221-*): oturumlu kullanıcı ilgi sıralı gözatı, ziyaretçi herkese açık
 * listeyi görür. Typed search is Keşfet's own search box (it searches communities while this section is open), so the list shows no second box.
 */
export function EmbeddedCommunitiesBrowse() {
  const { user, loading: authLoading } = useAuth();
  const { node: toastNode, show } = useToast();
  return (
    <>
      {authLoading ? <LoadingRows /> : user ? <BrowseView onToast={show} hideSearch /> : <DiscoverView onToast={show} onGoInvites={() => undefined} hideSearch />}
      {toastNode}
    </>
  );
}
