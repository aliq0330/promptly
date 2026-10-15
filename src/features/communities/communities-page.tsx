"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, Link2, Loader2, Mail, MessageCircle, Plus, Search, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useToast } from "@/features/groups/use-toast";
import { CommunityCard } from "./community-card";
import type { JoinState } from "./community-join-button";
import { CreateCommunityModal } from "./create-community-modal";
import { RulesAcceptModal } from "./rules-accept";
import { cancelJoinRequest, fetchMyInvitations, fetchMyJoinRequests, toGroupError, type GroupInvitation, type MyJoinRequest } from "@/lib/supabase/chat-groups";
import {
  discoverCommunities,
  listMyCommunities,
  respondToCommunityInvitation,
  searchCommunities,
  suggestCommunities,
  type CommunitySort,
  type CommunitySummary,
  type MyCommunityScope,
} from "@/lib/supabase/communities";
import { parseGroupJoinToken } from "@/lib/chat-groups";
import { CATEGORY_LABEL_KEYS, COMMUNITY_CATEGORIES, communityHref } from "@/lib/communities";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";
import type { CommunityCategory } from "@/types";

type View = "discover" | "mine" | "managed" | "invites" | "requests";
const VIEWS: readonly View[] = ["discover", "mine", "managed", "invites", "requests"];
const SORTS: CommunitySort[] = ["popular", "newest", "active"];

interface ListState {
  key: string;
  items: CommunitySummary[];
  hasMore: boolean;
  error: string | null;
}

/**
 * `/communities`: Topluluklar ana sayfası. Sekmeler: Keşfet (yalnız herkese açık + "Senin için önerilenler"; arama herkese açık VE kapalı
 * toplulukları bulur, kapalıya istek gönderilir), Üyesi olduklarım, Yönettiklerim, Davetler, Başvurularım (yalnız KENDİ bekleyen başvurularım).
 * Tamamen kapalı topluluklar hiçbir listede/aramada/öneride görünmez; onlara yalnız davet ya da davet bağlantısıyla ulaşılır.
 * Eski `/groups` adresi buraya yönlenir.
 */
export function CommunitiesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refresh } = useRealMessages();
  const { node: toastNode, show } = useToast();
  const tabParam = searchParams.get("tab");
  const view: View = VIEWS.includes(tabParam as View) ? (tabParam as View) : "discover";
  const [createOpen, setCreateOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [inviteCount, setInviteCount] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState<number | null>(null);

  const tabs: TabItem<View>[] = [
    { key: "discover", label: t("communities.tab.discover") },
    { key: "mine", label: t("communities.tab.mine") },
    { key: "managed", label: t("communities.tab.managed") },
    { key: "invites", label: t("communities.tab.invites"), count: inviteCount ? inviteCount : undefined },
    { key: "requests", label: t("communities.tab.requests"), count: requestCount ? requestCount : undefined },
  ];

  const openLink = () => {
    const token = parseGroupJoinToken(linkInput);
    if (!token) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    router.push(`/communities/join#${token}`);
  };

  const goTab = (next: View) => router.replace(next === "discover" ? "/communities" : `/communities?tab=${next}`);

  // Sekme rozetleri (sekme açık olmasa da): bana gelen davetler ve bekleyen başvurularım.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([fetchMyInvitations(user.id), fetchMyJoinRequests(user.id)])
      .then(([invitations, requests]) => {
        if (cancelled) return;
        setInviteCount(invitations.length);
        setRequestCount(requests.length);
      })
      .catch((err) => console.error("community badges", err));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-5 sm:py-8">
      <PageHeader
        eyebrow={t("communities.page.eyebrow")}
        icon={Users}
        title={t("communities.page.title")}
        description={t("communities.page.description")}
        actions={
          <>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> {t("communities.page.create")}
            </Button>
            <Link href="/messages" className={buttonClassName({ size: "sm", variant: "outline" })}>
              <MessageCircle size={15} /> {t("communities.page.toMessages")}
            </Link>
          </>
        }
      />

      <Tabs items={tabs} active={view} onChange={goTab} ariaLabel={t("communities.page.tabsAria")} />

      {view === "discover" && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              openLink();
            }}
            className="space-y-1.5 rounded-lg border border-border-soft bg-surface px-4 py-3"
          >
            <label htmlFor="community-link-input" className="flex items-center gap-1.5 text-label font-medium text-text">
              <Link2 size={14} aria-hidden /> {t("groups.page.haveLink")}
            </label>
            <div className="flex gap-2">
              <input
                id="community-link-input"
                value={linkInput}
                onChange={(event) => {
                  setLinkInput(event.target.value);
                  setLinkError(false);
                }}
                placeholder={t("groups.page.linkPlaceholder")}
                aria-invalid={linkError}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-primary/60"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!linkInput.trim()}>
                {t("groups.page.openLink")}
              </Button>
            </div>
            {linkError && (
              <p role="alert" className="text-caption text-danger">
                {t("groups.page.linkInvalid")}
              </p>
            )}
          </form>
          <DiscoverView onToast={show} onGoInvites={() => goTab("invites")} />
        </>
      )}
      {view === "mine" && <MyCommunitiesView scope="member" onToast={show} />}
      {view === "managed" && <MyCommunitiesView scope="managed" onToast={show} />}
      {view === "invites" && user && (
        <InvitesView
          userId={user.id}
          onCount={setInviteCount}
          onToast={show}
          onJoined={(id) => {
            void refresh();
            router.push(communityHref(id));
          }}
        />
      )}
      {view === "requests" && user && <RequestsView userId={user.id} onCount={setRequestCount} onToast={show} />}

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
    </div>
  );
}

function LoadingRows() {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-28 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
      ))}
    </ul>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
      <p role="alert" className="text-small text-danger">
        {message}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** Bir listedeki kartın üyelik durumu değişince satırı (ve üye sayısını) günceller. */
function applyJoinState(community: CommunitySummary, next: JoinState): CommunitySummary {
  const wasMember = community.myStatus === "member";
  const memberCount = next === "member" && !wasMember ? community.memberCount + 1 : next !== "member" && wasMember ? Math.max(0, community.memberCount - 1) : community.memberCount;
  return { ...community, myStatus: next, myRole: next === "member" ? (community.myRole ?? "member") : null, memberCount };
}

function DiscoverView({ onToast, onGoInvites }: { onToast: (message: string) => void; onGoInvites: () => void }) {
  const { t } = useTranslation();
  const { refresh } = useRealMessages();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<CommunitySort>("popular");
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggested, setSuggested] = useState<CommunitySummary[]>([]);
  const searching = debounced.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Öneriler: yalnız arama yokken ve kategori süzgeci yokken, sayfa başına bir kez (hata sessizce boş liste; sayfayı bozmaz).
  useEffect(() => {
    let cancelled = false;
    suggestCommunities(6)
      .then((list) => {
        if (!cancelled) setSuggested(list);
      })
      .catch((err) => console.error("suggestCommunities", err));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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
    setSuggested((prev) => prev.map((c) => (c.id === id ? applyJoinState(c, next) : c)));
    if (next === "member" || next === "none") void refresh();
  }

  const showSuggestions = !searching && category === null && suggested.length > 0;

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

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("communities.filter.categoryAria")}>
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

      {showSuggestions && (
        <section aria-labelledby="community-suggest-title" className="space-y-2.5">
          <div>
            <h2 id="community-suggest-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
              <Sparkles size={14} className="text-primary" aria-hidden /> {t("communities.suggest.title")}
            </h2>
            <p className="text-caption text-text-muted">{t("communities.suggest.help")}</p>
          </div>
          <ul className="space-y-3" data-testid="community-suggestions">
            {suggested.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                onStatusChange={(next) => changeStatus(community.id, next)}
                onToast={onToast}
                onInvited={onGoInvites}
                reason={community.reason}
              />
            ))}
          </ul>
        </section>
      )}

      {(showSuggestions || searching) && (
        <h2 className="text-label font-semibold text-text">{searching ? t("communities.search.resultsTitle") : t("communities.tab.discover")}</h2>
      )}

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

interface InvitesState {
  key: string;
  invitations: GroupInvitation[];
  error: boolean;
}

/** Bana gelen davetler: kabul / reddet (kuralları kabul zorunluysa önce kural metni onaylanır). */
function InvitesView({ userId, onCount, onToast, onJoined }: { userId: string; onCount: (n: number) => void; onToast: (message: string) => void; onJoined: (groupId: string) => void }) {
  const { t, language } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<InvitesState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rulesFor, setRulesFor] = useState<GroupInvitation | null>(null);
  const action = useAsyncAction();

  const key = `${userId}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    fetchMyInvitations(userId)
      .then((invitations) => {
        if (cancelled) return;
        setState({ key, invitations, error: false });
        onCount(invitations.length);
      })
      .catch((err) => {
        console.error("invites load", err);
        if (!cancelled) setState({ key, invitations: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, key, onCount]);

  const current = state && state.key === key ? state : null;

  const respond = useCallback(
    async (invitation: GroupInvitation, accept: boolean, acceptRules: boolean) => {
      setBusyId(invitation.id);
      const result = await action.run(() => respondToCommunityInvitation(invitation.id, accept, acceptRules));
      setBusyId(null);
      if (!result) {
        // Zaten sonuçlanmış / süresi dolmuş olabilir: listeyi gerçek durumla eşitle.
        setReloadKey((k) => k + 1);
        return false;
      }
      if (result.outcome === "expired") {
        onToast(t("groups.invites.expiredToast"));
        setReloadKey((k) => k + 1);
      } else if (accept && result.groupId) {
        onToast(t("groups.page.joinedToast", { name: invitation.group?.name ?? "" }));
        onJoined(result.groupId);
      } else {
        onToast(t("groups.invites.declinedToast"));
        setReloadKey((k) => k + 1);
      }
      return true;
    },
    [action, onJoined, onToast, t],
  );

  if (!current) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (current.error) return <ErrorBox message={t("groups.invites.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (current.invitations.length === 0) return <EmptyState icon={Mail} title={t("groups.invites.empty")} description={t("groups.invites.emptyHelp")} />;

  return (
    <div className="space-y-3">
      {action.error && !rulesFor && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {action.error}
        </p>
      )}
      <ul className="space-y-3">
        {current.invitations.map((invitation) => (
          <li key={invitation.id} className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card">
            <div className="flex items-start gap-3">
              <GroupAvatar name={invitation.group?.name ?? ""} avatarUrl={invitation.group?.avatarUrl ?? null} size={48} badge />
              <div className="min-w-0 flex-1 space-y-0.5">
                <h3 className="break-words text-sm font-semibold text-text">{invitation.group?.name}</h3>
                {invitation.group?.description && <p className="line-clamp-2 break-words text-small text-text-secondary">{invitation.group.description}</p>}
                <p className="flex flex-wrap items-center gap-1.5 text-caption text-text-muted">
                  {invitation.inviter && (
                    <>
                      <Avatar src={invitation.inviter.avatarUrl} alt={invitation.inviter.displayName} size={16} />
                      <span>{t("groups.invites.invitedBy", { name: invitation.inviter.displayName })}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{formatRelativeTime(invitation.createdAt, language)}</span>
                  {invitation.group && (
                    <>
                      <span>·</span>
                      <span>{memberCountText(t, invitation.group.memberCount)}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => void respond(invitation, false, false)} disabled={action.busy}>
                {t("groups.invites.decline")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => (invitation.group?.rulesRequired && invitation.group.rules ? setRulesFor(invitation) : void respond(invitation, true, false))}
                disabled={action.busy}
              >
                {busyId === invitation.id && action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("groups.invites.accept")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {rulesFor && rulesFor.group && (
        <RulesAcceptModal
          name={rulesFor.group.name}
          rules={rulesFor.group.rules ?? ""}
          confirmLabel={t("communities.rules.acceptAndJoin")}
          busy={action.busy}
          error={action.error}
          onClose={() => setRulesFor(null)}
          onConfirm={() => void respond(rulesFor, true, true).then((ok) => ok && setRulesFor(null))}
        />
      )}
    </div>
  );
}

/** Başvurularım: yalnız KENDİ bekleyen katılma isteklerim (geri çekilebilir). */
function RequestsView({ userId, onCount, onToast }: { userId: string; onCount: (n: number) => void; onToast: (message: string) => void }) {
  const { t, language } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ key: string; requests: MyJoinRequest[]; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useAsyncAction();

  const key = `${userId}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    fetchMyJoinRequests(userId)
      .then((requests) => {
        if (cancelled) return;
        setState({ key, requests, error: false });
        onCount(requests.length);
      })
      .catch((err) => {
        console.error("requests load", err);
        if (!cancelled) setState({ key, requests: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, key, onCount]);

  const current = state && state.key === key ? state : null;

  async function cancel(request: MyJoinRequest) {
    setBusyId(request.id);
    const ok = await action.run(async () => {
      await cancelJoinRequest(request.id);
      return true;
    });
    setBusyId(null);
    setReloadKey((k) => k + 1);
    if (ok) onToast(t("groups.invites.requestCancelledToast"));
  }

  if (!current) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (current.error) return <ErrorBox message={t("groups.invites.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (current.requests.length === 0) return <EmptyState icon={Send} title={t("communities.requests.empty")} description={t("communities.requests.emptyHelp")} />;

  return (
    <div className="space-y-3">
      {action.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {action.error}
        </p>
      )}
      <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface">
        {current.requests.map((request) => (
          <li key={request.id} className="flex items-center gap-3 px-4 py-3">
            <GroupAvatar name={request.groupName} avatarUrl={request.groupAvatarUrl} size={40} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-text">{request.groupName}</span>
              <span className="block text-caption text-text-muted">
                {t("groups.invites.requestPending")} · {formatRelativeTime(request.createdAt, language)}
              </span>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => void cancel(request)} disabled={action.busy}>
              {busyId === request.id && action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("groups.invites.cancelRequest")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
