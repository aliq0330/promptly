"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Compass, Link2, Loader2, Mail, MessageCircle, Plus, Search, Send, ShieldCheck, Users } from "lucide-react";
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
import { CreateCommunityModal } from "./create-community-modal";
import { RulesAcceptModal } from "./rules-accept";
import { cancelJoinRequest, fetchChatGroupRow, fetchMyInvitations, fetchMyJoinRequests, toGroupError, type GroupInvitation, type MyJoinRequest } from "@/lib/supabase/chat-groups";
import {
  discoverCommunities,
  joinCommunity,
  listMyCommunities,
  respondToCommunityInvitation,
  setCommunityBookmark,
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

type View = "discover" | "mine" | "managed" | "invites" | "requests" | "saved";
const VIEWS: readonly View[] = ["discover", "mine", "managed", "invites", "requests", "saved"];
const SORTS: CommunitySort[] = ["popular", "newest", "active"];

interface ListState {
  key: string;
  items: CommunitySummary[];
  hasMore: boolean;
  error: string | null;
}

/**
 * `/communities`: Topluluklar ana sayfası. Sekmeler: Keşfet (yalnız herkese açık, arama + kategori + sıralama + sayfalama),
 * Üyesi olduklarım, Yönettiklerim, Davetler, Başvurularım (yalnız KENDİ bekleyen başvurularım), Kaydedilenler (yer imi).
 * Kapalı topluluklar keşifte görünmez; onlara davet ya da davet bağlantısıyla ulaşılır. Eski `/groups` adresi buraya yönlenir.
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
    { key: "saved", label: t("communities.tab.saved") },
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
      {view === "saved" && <MyCommunitiesView scope="bookmarked" onToast={show} />}
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

function DiscoverView({ onToast, onGoInvites }: { onToast: (message: string) => void; onGoInvites: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useRealMessages();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<CommunitySort>("popular");
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const join = useAsyncAction();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [rulesFor, setRulesFor] = useState<CommunitySummary | null>(null);
  const [rules, setRules] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${debounced}|${sort}|${category ?? ""}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    discoverCommunities({ query: debounced, sort, category, offset: 0 })
      .then((page) => {
        if (!cancelled) setState({ key, items: page.communities, hasMore: page.hasMore, error: null });
      })
      .catch((err) => {
        console.error("discoverCommunities", err);
        if (!cancelled) setState({ key, items: [], hasMore: false, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, sort, category, key]);

  const current = state && state.key === key ? state : null;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await discoverCommunities({ query: debounced, sort, category, offset: current.items.length });
      setState({ key, items: [...current.items, ...page.communities], hasMore: page.hasMore, error: null });
    } catch (err) {
      console.error("discoverCommunities (more)", err);
      onToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function joinNow(community: CommunitySummary, acceptRules: boolean) {
    setJoiningId(community.id);
    const outcome = await join.run(() => joinCommunity(community.id, acceptRules));
    setJoiningId(null);
    if (!outcome) return false;
    onToast(t("groups.page.joinedToast", { name: community.name }));
    void refresh();
    router.push(communityHref(community.id));
    return true;
  }

  // Kuralları kabul zorunluysa kural metni önce okunur (kart listesinde yalnızca özet var; metin açılırken çekilir).
  async function startJoin(community: CommunitySummary) {
    if (!community.rulesRequired) {
      await joinNow(community, false);
      return;
    }
    setJoiningId(community.id);
    const row = await join.run(() => fetchChatGroupRow(community.id));
    setJoiningId(null);
    if (!row) return;
    setRules(row.rules ?? "");
    setRulesFor(community);
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
        <Tabs
          variant="segmented"
          ariaLabel={t("groups.page.sortAria")}
          active={sort}
          onChange={setSort}
          items={SORTS.map((value) => ({ key: value, label: t(`groups.page.sort.${value}`) }))}
        />
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

      {join.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {join.error}
        </p>
      )}

      {!current ? (
        <LoadingRows />
      ) : current.error ? (
        <ErrorBox message={t("communities.page.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : current.items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={debounced || category ? t("groups.page.noResults") : t("communities.discover.empty")}
          description={debounced || category ? t("groups.page.noResultsHelp") : t("communities.discover.emptyHelp")}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {current.items.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                action={
                  community.myStatus === "invited"
                    ? { kind: "invited", onClick: onGoInvites }
                    : { kind: "join", busy: joiningId === community.id && join.busy, disabled: join.busy || community.memberCount >= community.memberLimit, onClick: () => void startJoin(community) }
                }
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

      {rulesFor && (
        <RulesAcceptModal
          name={rulesFor.name}
          rules={rules}
          confirmLabel={t("communities.rules.acceptAndJoin")}
          busy={join.busy}
          error={join.error}
          onClose={() => setRulesFor(null)}
          onConfirm={() => void joinNow(rulesFor, true).then((ok) => ok && setRulesFor(null))}
        />
      )}
    </div>
  );
}

/** Üyesi olduklarım · Yönettiklerim · Kaydedilenler: `list_my_communities` (yalnız kendi üyeliğim / yer imim). */
function MyCommunitiesView({ scope, onToast }: { scope: MyCommunityScope; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const { conversations, restoreConversation } = useRealMessages();
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

  async function toggleBookmark(community: CommunitySummary) {
    setBusyId(community.id);
    const next = !community.bookmarked;
    const ok = await action.run(async () => {
      await setCommunityBookmark(community.id, next);
      return true;
    });
    setBusyId(null);
    if (!ok) return;
    setState((prev) =>
      prev
        ? { ...prev, items: scope === "bookmarked" && !next ? prev.items.filter((c) => c.id !== community.id) : prev.items.map((c) => (c.id === community.id ? { ...c, bookmarked: next } : c)) }
        : prev,
    );
    onToast(next ? t("communities.bookmark.addedToast") : t("communities.bookmark.removedToast"));
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

  const emptyKey = scope === "member" ? "mine" : scope === "managed" ? "managed" : "saved";

  if (!current) return <LoadingRows />;
  if (current.error) return <ErrorBox message={t("communities.page.loadError")} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (current.items.length === 0) {
    return (
      <EmptyState
        icon={scope === "bookmarked" ? Bookmark : scope === "managed" ? ShieldCheck : Users}
        title={t(`communities.empty.${emptyKey}` as "communities.empty.mine")}
        description={t(`communities.empty.${emptyKey}Help` as "communities.empty.mineHelp")}
        action={scope === "member" || scope === "bookmarked" ? { label: t("communities.tab.discover"), href: "/communities" } : undefined}
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
              onToggleBookmark={community.visibility === "public" || community.myRole ? () => void toggleBookmark(community) : undefined}
              bookmarkBusy={busyId === community.id && action.busy}
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
