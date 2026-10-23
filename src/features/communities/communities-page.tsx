"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, Loader2, Mail, Plus, Search, ShieldCheck, SquareStack, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { SectionNav, type SectionNavItem } from "@/features/content/section-nav";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useToast } from "@/features/groups/use-toast";
import { CommunityCard } from "./community-card";
import { CommunityLayout } from "./community-layout";
import { HomeInviteNotice, MyCommunitiesShelf } from "./home-shelf";
import { HomeAside } from "./home-aside";
import type { JoinState } from "./community-join-button";
import { CreateCommunityModal } from "./create-community-modal";
import { HomeDiscoverTab } from "./home-discover-tab";
import { HomeInvitesTab } from "./home-invites-tab";
import { HomePostsTab } from "./home-posts-tab";
import { applyJoinState, ErrorBox, LoadingRows, type ListState } from "./home-shared";
import { useManagedCommunities } from "./use-managed-communities";
import { fetchMyInvitations, toGroupError, type GroupInvitation } from "@/lib/supabase/chat-groups";
import {
  discoverCommunities,
  listMyCommunities,
  searchCommunities,
  type CommunitySort,
  type MyCommunityScope,
} from "@/lib/supabase/communities";
import { CATEGORY_LABEL_KEYS, COMMUNITY_CATEGORIES, communityHref } from "@/lib/communities";
import { cn } from "@/lib/utils";
import { homeHref, isInvitesSection, resolveHomeView, type HomeTab, type InvitesSection } from "@/lib/community-home";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityCategory } from "@/types";

const SORTS: CommunitySort[] = ["popular", "newest", "active"];

const TAB_ICONS: Record<HomeTab, LucideIcon> = { posts: SquareStack, discover: Compass, managed: ShieldCheck, invites: Mail };


/**
 * `/communities`: Topluluklar ana sayfası (docs/history/185-*). Sekmeler:
 *   Gönderiler (varsayılan) — üye olduğum herkese açık + kapalı toplulukların gönderileri
 *   Keşfet                  — "Sana uygun topluluklar" şeridi + "Tüm topluluklar" düğmesi + görmediğin gönderilerin ilgi sıralı akışı
 *   Yönettiklerim           — yalnız yönettiği topluluğu olana
 *   Davet ve başvurular     — davetler · başvurularım · (yöneticiye) gelen başvurular
 * "Üyesi olduklarım" artık sekme değil, Gönderiler'deki "Topluluklarım" bağlantısının listesidir (`?tab=mine` çalışır). Tüm topluluklar: `/communities/all`.
 * Tamamen kapalı topluluklar hiçbir listede/aramada/öneride/akışta görünmez; onlara yalnız davet ya da davet bağlantısıyla ulaşılır.
 * Oturum açmamış ziyaretçi yalnız Keşfet'in herkese açık topluluk listesini + aramayı görür; katıl/istek/oluştur giriş diyaloğunu açar.
 * Eski `/groups` adresi buraya yönlenir.
 * Düzen (docs/history/212-*, Albüm A + D): görünür başlık yok (h1 ekran okuyucuda) — üstte arama + "+" tek satırda (Mesajlar üst menüde); altında
 * "Topluluklarım" rafı (kare kapaklar, "N yeni" rozeti), Ana Sayfa/Keşfet'teki bölüm balonları (`SectionNav`, davet sayacı balonda),
 * Gönderiler'de bekleyen davet tek satırlık bir kart.
 */
export function CommunitiesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { refresh } = useRealMessages();
  const { node: toastNode, show } = useToast();
  const { ready: managedReady, managed } = useManagedCommunities(user?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [invitations, setInvitations] = useState<GroupInvitation[] | null>(null);
  const [inviteReload, setInviteReload] = useState(0);
  const [query, setQuery] = useState("");
  const inviteCount = invitations?.length ?? null;

  const sectionParam = searchParams.get("section");
  const { view, section: defaultSection } = resolveHomeView(searchParams.get("tab"), { signedIn: Boolean(user), managesAny: managed.length > 0 });
  const section: InvitesSection = isInvitesSection(sectionParam) ? sectionParam : defaultSection;
  const incomingTotal = managed.reduce((sum, c) => sum + c.pendingRequestCount, 0);
  const actionCount = (inviteCount ?? 0) + incomingTotal;

  const tabKeys: HomeTab[] = ["posts", "discover", ...(managedReady && managed.length > 0 ? (["managed"] as const) : []), "invites"];
  const tabLabel: Record<HomeTab, string> = {
    posts: t("communities.tab.posts"),
    discover: t("communities.tab.discover"),
    managed: t("communities.tab.managed"),
    invites: t("communities.tab.invitesAndRequests"),
  };
  const tabs: SectionNavItem<HomeTab>[] = tabKeys.map((key) => ({
    key,
    label: tabLabel[key],
    icon: TAB_ICONS[key],
    count: key === "invites" && actionCount > 0 ? actionCount : undefined,
  }));
  const activeTab: HomeTab = view === "mine" ? "posts" : view;

  const goTab = (next: HomeTab) => router.replace(homeHref(next));
  const goSection = (next: InvitesSection) => router.replace(homeHref("invites", next));

  // Balon sayacı + davet kartı: bana gelen davetler (sekme açık olmasa da); bekleyen başvurularım "Başvurularım" bölümündedir.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchMyInvitations(user.id)
      .then((list) => {
        if (!cancelled) setInvitations(list);
      })
      .catch((err) => console.error("community badges", err));
    return () => {
      cancelled = true;
    };
  }, [user, inviteReload]);

  // Davetler bölümünde bir davet yanıtlanınca sayı değişir: liste (kart + sayaç) yeniden okunur.
  const inviteLength = useRef<number | null>(null);
  useEffect(() => {
    inviteLength.current = invitations?.length ?? null;
  }, [invitations]);
  const onInviteCount = useCallback((count: number) => {
    if (inviteLength.current !== null && inviteLength.current !== count) setInviteReload((k) => k + 1);
  }, []);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/communities/all?q=${encodeURIComponent(q)}` : "/communities/all");
  };

  return (
    <CommunityLayout
      aside={user ? <HomeAside managedCount={managed.length} actionCount={actionCount} /> : undefined}
      asideLabel={t("communities.aside.label")}
    >
      <h1 className="sr-only">{t("communities.page.title")}</h1>
      <div className="flex items-center gap-2">
        {user ? (
          <form role="search" onSubmit={search} className="relative min-w-0 flex-1">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("communities.all.searchPlaceholder")}
              aria-label={t("communities.all.searchPlaceholder")}
              enterKeyHint="search"
              className="h-11 w-full rounded-full border border-transparent bg-surface-soft pl-11 pr-4 text-body text-text placeholder:text-text-muted focus:border-border-strong focus:outline-none"
            />
          </form>
        ) : (
          <span className="flex-1" />
        )}
        <Button type="button" size="sm" onClick={() => requireAuth("create") && setCreateOpen(true)} className={cn(!user && "h-11")}>
          <Plus size={16} /> {user ? <span className="sr-only sm:not-sr-only">{t("communities.page.create")}</span> : t("communities.page.create")}
        </Button>
      </div>

      {user && <MyCommunitiesShelf />}
      {user && <SectionNav items={tabs} active={activeTab} onChange={goTab} ariaLabel={t("communities.page.tabsAria")} hideControls />}

      {authLoading ? (
        <LoadingRows />
      ) : !user ? (
        <DiscoverView onToast={show} onGoInvites={() => goTab("invites")} />
      ) : view === "posts" ? (
        <>
          {invitations && invitations.length > 0 && <HomeInviteNotice invitations={invitations} />}
          <HomePostsTab onToast={show} />
        </>
      ) : view === "discover" ? (
        <HomeDiscoverTab onToast={show} onGoInvites={() => goTab("invites")} />
      ) : view === "mine" ? (
        <div className="space-y-3">
          <Link href={homeHref("posts")} className="text-small text-text-secondary hover:underline">
            ← {t("communities.tab.posts")}
          </Link>
          <MyCommunitiesView scope="member" onToast={show} />
        </div>
      ) : view === "managed" ? (
        <MyCommunitiesView scope="managed" onToast={show} />
      ) : (
        <HomeInvitesTab
          userId={user.id}
          section={section}
          onSection={goSection}
          managed={managed}
          onInviteCount={onInviteCount}
          onToast={show}
        />
      )}

      {createOpen && (
        <CreateCommunityModal
          onClose={() => setCreateOpen(false)}
          onCreated={(groupId) => {
            setCreateOpen(false);
            void refresh();
            router.push(communityHref(groupId));
          }}
        />
      )}
      {toastNode}
    </CommunityLayout>
  );
}

/** Ziyaretçi için Keşfet (ve `/communities/all`): herkese açık topluluklar + arama; öneri ve akış kişiseldir, oturum ister. */
export function DiscoverView({ onToast, onGoInvites }: { onToast: (message: string) => void; onGoInvites: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<CommunitySort>("popular");
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const searching = debounced.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${debounced}|${searching ? "" : sort}|${category ?? ""}|${reloadKey}`;
  const fetchPage = useCallback(
    (offset: number) => (searching ? searchCommunities({ query: debounced, category, offset }) : discoverCommunities({ query: "", sort, category, offset })),
    [searching, debounced, sort, category],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(0)
      .then((page) => {
        if (!cancelled) setState({ key, items: page.communities, hasMore: page.hasMore, error: null });
      })
      .catch((err) => {
        console.error("communities list", err);
        if (!cancelled) setState({ key, items: [], hasMore: false, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, key]);

  const current = state && state.key === key ? state : null;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(current.items.length);
      setState({ key, items: [...current.items, ...page.communities], hasMore: page.hasMore, error: null });
    } catch (err) {
      console.error("communities list (more)", err);
      onToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function changeStatus(id: string, next: JoinState) {
    setState((prev) => (prev ? { ...prev, items: prev.items.map((c) => (c.id === id ? applyJoinState(c, next) : c)) } : prev));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">{t("communities.search.placeholder")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder={t("communities.search.placeholder")}
            className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
        {!searching && (
          <Tabs
            variant="segmented"
            ariaLabel={t("groups.page.sortAria")}
            active={sort}
            onChange={setSort}
            items={SORTS.map((value) => ({ key: value, label: t(`groups.page.sort.${value}`) }))}
          />
        )}
      </div>

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

      {searching && <h2 className="text-label font-semibold text-text">{t("communities.search.resultsTitle")}</h2>}

      {!current ? (
        <LoadingRows />
      ) : current.error ? (
        <ErrorBox message={t("communities.page.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : current.items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={searching || category ? t("groups.page.noResults") : t("communities.discover.empty")}
          description={searching || category ? t("groups.page.noResultsHelp") : t("communities.discover.emptyHelp")}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {current.items.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                onStatusChange={(next) => changeStatus(community.id, next)}
                onToast={onToast}
                onInvited={onGoInvites}
              />
            ))}
          </ul>
          {current.hasMore && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


/** Üyesi olduklarım · Yönettiklerim: `list_my_communities` (yalnız kendi üyeliğim). */
function MyCommunitiesView({ scope, onToast }: { scope: MyCommunityScope; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const { conversations, restoreConversation, refresh } = useRealMessages();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useAsyncAction();

  const key = `${scope}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    listMyCommunities(scope, 0)
      .then((page) => {
        if (!cancelled) setState({ key, items: page.communities, hasMore: page.hasMore, error: null });
      })
      .catch((err) => {
        console.error("listMyCommunities", err);
        if (!cancelled) setState({ key, items: [], hasMore: false, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [scope, key]);

  const current = state && state.key === key ? state : null;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMyCommunities(scope, current.items.length);
      setState({ key, items: [...current.items, ...page.communities], hasMore: page.hasMore, error: null });
    } catch (err) {
      onToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setLoadingMore(false);
    }
  }

  // Düğmeden ayrılınca kart listeden kalkar; başka durum değişimi (ör. yeniden katılma) bu listede olmaz.
  function changeStatus(id: string, next: JoinState) {
    setState((prev) => (prev ? { ...prev, items: next === "member" ? prev.items : prev.items.filter((c) => c.id !== id) } : prev));
    void refresh();
  }

  // Mesajlar listesinde gizlenmiş / arşivlenmiş topluluk sohbeti: üyelik sürer, yalnız kişisel liste durumu temizlenir.
  async function restoreChat(id: string) {
    setBusyId(id);
    const ok = await action.run(async () => {
      await restoreConversation(id);
      return true;
    });
    setBusyId(null);
    if (ok) onToast(t("groups.mine.restoredToast"));
  }

  const emptyKey = scope === "member" ? "mine" : "managed";

  if (!current) return <LoadingRows />;
  if (current.error) return <ErrorBox message={t("communities.page.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (current.items.length === 0) {
    return (
      <EmptyState
        icon={scope === "managed" ? ShieldCheck : Users}
        title={t(`communities.empty.${emptyKey}` as "communities.empty.mine")}
        description={t(`communities.empty.${emptyKey}Help` as "communities.empty.mineHelp")}
        action={scope === "member" ? { label: t("communities.tab.discover"), href: "/communities" } : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {action.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {action.error}
        </p>
      )}
      <ul className="space-y-3">
        {current.items.map((community) => {
          const conversation = conversations.find((c) => c.id === community.id);
          const hiddenInInbox = Boolean(conversation && (conversation.deletedAt || conversation.archivedAt));
          return (
            <CommunityCard
              key={community.id}
              community={community}
              onStatusChange={(next) => changeStatus(community.id, next)}
              onToast={onToast}
              footerNote={hiddenInInbox ? t("communities.card.hiddenInInbox") : undefined}
            />
          );
        })}
      </ul>
      {current.items.some((c) => conversations.find((x) => x.id === c.id && (x.deletedAt || x.archivedAt))) && (
        <ul className="space-y-1 rounded-lg border border-border-soft bg-surface px-4 py-3">
          {current.items
            .filter((c) => conversations.find((x) => x.id === c.id && (x.deletedAt || x.archivedAt)))
            .map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-small text-text-secondary">
                <span className="min-w-0 truncate">{c.name}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => void restoreChat(c.id)} disabled={action.busy}>
                  {busyId === c.id && action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t("communities.card.restoreChat")}
                </Button>
              </li>
            ))}
        </ul>
      )}
      {current.hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
