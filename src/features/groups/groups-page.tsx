"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, Link2, Loader2, Mail, Plus, Search, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { CreateGroupModal } from "./create-group-modal";
import { GroupAvatar } from "./group-avatar";
import { useAsyncAction } from "./use-async-action";
import { useToast } from "./use-toast";
import {
  cancelJoinRequest,
  discoverChatGroups,
  fetchMyInvitations,
  fetchMyJoinRequests,
  joinChatGroup,
  respondToInvitation,
  toGroupError,
  type DiscoverSort,
  type DiscoveredGroup,
  type GroupInvitation,
  type MyJoinRequest,
} from "@/lib/supabase/chat-groups";
import { parseGroupJoinToken } from "@/lib/chat-groups";
import { formatRelativeTime, messageHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";

type View = "discover" | "mine" | "invites";

interface DiscoverState {
  key: string;
  groups: DiscoveredGroup[];
  hasMore: boolean;
  error: string | null;
}

const SORTS: DiscoverSort[] = ["popular", "newest", "active"];

/**
 * `/groups`: "Grupları keşfet" (yalnız herkese açık gruplar; arama, sıralama, sayfalama) ve "Davetlerim"
 * (bana gelen davetler + bekleyen başvurularım). Birebir kullanıcı aramasından ayrı bir ekrandır. Kapalı gruplar burada
 * listelenmez; onlara davet ya da davet bağlantısıyla ulaşılır.
 */
export function GroupsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refresh } = useRealMessages();
  const { node: toastNode, show } = useToast();
  const tabParam = searchParams.get("tab");
  const view: View = tabParam === "invites" ? "invites" : tabParam === "mine" ? "mine" : "discover";
  const [createOpen, setCreateOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [inviteCount, setInviteCount] = useState<number | null>(null);

  const tabs: TabItem<View>[] = [
    { key: "discover", label: t("groups.page.tabDiscover") },
    { key: "mine", label: t("groups.page.tabMine") },
    { key: "invites", label: t("groups.page.tabInvites"), count: inviteCount ? inviteCount : undefined },
  ];

  function openLink() {
    const token = parseGroupJoinToken(linkInput);
    if (!token) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    router.push(`/groups/join#${token}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-5 sm:py-8">
      <PageHeader
        eyebrow={t("groups.page.eyebrow")}
        icon={Users}
        title={t("groups.page.title")}
        description={t("groups.page.description")}
        actions={
          <>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> {t("groups.page.create")}
            </Button>
            <Link href="/messages" className={buttonClassName({ size: "sm", variant: "outline" })}>
              {t("groups.page.toMessages")}
            </Link>
          </>
        }
      />

      <Tabs items={tabs} active={view} onChange={(next) => router.replace(next === "discover" ? "/groups" : `/groups?tab=${next}`)} ariaLabel={t("groups.page.tabsAria")} />

      {view === "discover" ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              openLink();
            }}
            className="space-y-1.5 rounded-lg border border-border-soft bg-surface px-4 py-3"
          >
            <label htmlFor="group-link-input" className="flex items-center gap-1.5 text-label font-medium text-text">
              <Link2 size={14} aria-hidden /> {t("groups.page.haveLink")}
            </label>
            <div className="flex gap-2">
              <input
                id="group-link-input"
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
          <DiscoverView onToast={show} onJoined={(id) => { void refresh(); router.push(messageHref({ id })); }} />
        </>
      ) : view === "mine" ? (
        <MyGroupsView onToast={show} />
      ) : (
        user && (
          <InvitesView
            userId={user.id}
            onCount={setInviteCount}
            onToast={show}
            onJoined={(id) => {
              void refresh();
              router.push(messageHref({ id }));
            }}
          />
        )
      )}
      {!user ? null : <InviteCountLoader userId={user.id} onCount={setInviteCount} />}

      {createOpen && (
        <CreateGroupModal
          onClose={() => setCreateOpen(false)}
          onCreated={(groupId) => {
            setCreateOpen(false);
            void refresh();
            router.push(messageHref({ id: groupId }));
          }}
        />
      )}
      {toastNode}
    </div>
  );
}

/** Sekme rozeti için davet sayısını (sekme açık olmasa da) bir kez okur. */
function InviteCountLoader({ userId, onCount }: { userId: string; onCount: (n: number) => void }) {
  useEffect(() => {
    let cancelled = false;
    fetchMyInvitations(userId)
      .then((list) => {
        if (!cancelled) onCount(list.length);
      })
      .catch((err) => console.error("invite count", err));
    return () => {
      cancelled = true;
    };
  }, [userId, onCount]);
  return null;
}

function DiscoverView({ onToast, onJoined }: { onToast: (message: string) => void; onJoined: (groupId: string) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<DiscoverSort>("popular");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DiscoverState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const join = useAsyncAction();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const key = `${debounced}|${sort}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    discoverChatGroups({ query: debounced, sort, offset: 0 })
      .then((page) => {
        if (!cancelled) setState({ key, groups: page.groups, hasMore: page.hasMore, error: null });
      })
      .catch((err) => {
        console.error("discoverChatGroups", err);
        if (!cancelled) setState({ key, groups: [], hasMore: false, error: err instanceof Error ? err.message : t("groups.error.generic") });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, sort, key, t]);

  const current = state && state.key === key ? state : null;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await discoverChatGroups({ query: debounced, sort, offset: current.groups.length });
      setState({ key, groups: [...current.groups, ...page.groups], hasMore: page.hasMore, error: null });
    } catch (err) {
      console.error("discoverChatGroups (more)", err);
      onToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function joinGroup(group: DiscoveredGroup) {
    setJoiningId(group.id);
    const outcome = await join.run(() => joinChatGroup(group.id));
    setJoiningId(null);
    if (!outcome) return;
    onToast(t("groups.page.joinedToast", { name: group.name }));
    onJoined(group.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">{t("groups.page.searchPlaceholder")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder={t("groups.page.searchPlaceholder")}
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

      {join.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {join.error}
        </p>
      )}

      {!current ? (
        <ul className="space-y-3" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-24 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
          ))}
        </ul>
      ) : current.error ? (
        <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
          <p role="alert" className="text-small text-danger">
            {t("groups.page.loadError")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            {t("common.retry")}
          </Button>
        </div>
      ) : current.groups.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={debounced ? t("groups.page.noResults") : t("groups.page.empty")}
          description={debounced ? t("groups.page.noResultsHelp") : t("groups.page.emptyHelp")}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {current.groups.map((group) => (
              <li key={group.id} className="flex items-start gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card">
                <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={48} badge />
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="break-words text-sm font-semibold text-text">{group.name}</h2>
                  {group.description && <p className="line-clamp-2 break-words text-small text-text-secondary">{group.description}</p>}
                  <p className="text-caption text-text-muted">
                    {memberCountText(t, group.memberCount)}
                    {group.memberCount >= group.memberLimit && ` · ${t("groups.page.full")}`}
                  </p>
                </div>
                <div className="shrink-0">
                  {group.myStatus === "member" ? (
                    <Link href={messageHref({ id: group.id })} className={buttonClassName({ size: "sm", variant: "outline" })}>
                      {t("groups.page.open")}
                    </Link>
                  ) : group.myStatus === "invited" ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => router.push("/groups?tab=invites")}>
                      {t("groups.page.invited")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void joinGroup(group)}
                      disabled={join.busy || group.memberCount >= group.memberLimit}
                      aria-label={t("groups.page.joinAria", { name: group.name })}
                    >
                      {joiningId === group.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      {t("groups.page.join")}
                    </Button>
                  )}
                </div>
              </li>
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

interface InvitesState {
  key: string;
  invitations: GroupInvitation[];
  requests: MyJoinRequest[];
  error: boolean;
}

function InvitesView({
  userId,
  onCount,
  onToast,
  onJoined,
}: {
  userId: string;
  onCount: (n: number) => void;
  onToast: (message: string) => void;
  onJoined: (groupId: string) => void;
}) {
  const { t, language } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<InvitesState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useAsyncAction();

  const key = `${userId}|${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyInvitations(userId), fetchMyJoinRequests(userId)])
      .then(([invitations, requests]) => {
        if (cancelled) return;
        setState({ key, invitations, requests, error: false });
        onCount(invitations.length);
      })
      .catch((err) => {
        console.error("invites load", err);
        if (!cancelled) setState({ key, invitations: [], requests: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, key, onCount]);

  const current = state && state.key === key ? state : null;

  async function respond(invitation: GroupInvitation, accept: boolean) {
    setBusyId(invitation.id);
    const result = await action.run(() => respondToInvitation(invitation.id, accept));
    setBusyId(null);
    if (!result) {
      // Zaten sonuçlanmış / süresi dolmuş olabilir: listeyi gerçek durumla eşitle.
      setReloadKey((k) => k + 1);
      return;
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
  }

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
  if (current.error) {
    return (
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
        <p role="alert" className="text-small text-danger">
          {t("groups.invites.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (current.invitations.length === 0 && current.requests.length === 0) {
    return <EmptyState icon={Mail} title={t("groups.invites.empty")} description={t("groups.invites.emptyHelp")} />;
  }

  return (
    <div className="space-y-6">
      {action.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {action.error}
        </p>
      )}
      {current.invitations.length > 0 && (
        <section aria-labelledby="my-invitations-title" className="space-y-3">
          <h2 id="my-invitations-title" className="text-label font-semibold text-text">
            {t("groups.invites.receivedTitle")}
          </h2>
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
                  <Button type="button" size="sm" variant="ghost" onClick={() => void respond(invitation, false)} disabled={action.busy}>
                    {t("groups.invites.decline")}
                  </Button>
                  <Button type="button" size="sm" onClick={() => void respond(invitation, true)} disabled={action.busy}>
                    {busyId === invitation.id && action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t("groups.invites.accept")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {current.requests.length > 0 && (
        <section aria-labelledby="my-requests-title" className="space-y-3">
          <h2 id="my-requests-title" className="text-label font-semibold text-text">
            {t("groups.invites.myRequestsTitle")}
          </h2>
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
                  {t("groups.invites.cancelRequest")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * "Gruplarım": üyesi olduğum TÜM gruplar — "Listemden kaldır" ile mesaj listesinden çıkarılmış ya da arşivlenmiş olanlar dahil
 * (kapalı bir grup keşifte görünmediği için başka dönüş yolu olmazdı). Gizli grup "Listeme geri ekle" ile listeye döner;
 * grup zaten açık (üyelik değişmemişti), yalnız kişisel liste durumu temizlenir.
 */
function MyGroupsView({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const { conversations, ready, restoreConversation } = useRealMessages();
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useAsyncAction();
  const groups = conversations.filter((c) => c.group).sort((a, b) => (a.group?.name ?? "").localeCompare(b.group?.name ?? ""));

  async function restore(id: string) {
    setBusyId(id);
    const ok = await action.run(async () => {
      await restoreConversation(id);
      return true;
    });
    setBusyId(null);
    if (ok) onToast(t("groups.mine.restoredToast"));
  }

  if (!ready) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (groups.length === 0) return <EmptyState icon={Users} title={t("groups.mine.empty")} description={t("groups.mine.emptyHelp")} />;

  return (
    <div className="space-y-3">
      {action.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {action.error}
        </p>
      )}
      <ul className="space-y-3" aria-label={t("groups.page.tabMine")}>
        {groups.map((conversation) => {
          const group = conversation.group;
          if (!group) return null;
          const hidden = Boolean(conversation.deletedAt);
          return (
            <li key={conversation.id} className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card">
              <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={44} badge />
              <div className="min-w-0 flex-1 space-y-0.5">
                <h2 className="break-words text-sm font-semibold text-text">{group.name}</h2>
                <p className="text-caption text-text-muted">
                  {memberCountText(t, group.memberCount)}
                  {hidden ? ` · ${t("groups.mine.hidden")}` : conversation.archivedAt ? ` · ${t("groups.mine.archived")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(hidden || conversation.archivedAt) && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => void restore(conversation.id)} disabled={action.busy}>
                    {busyId === conversation.id && action.busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t("groups.mine.restore")}
                  </Button>
                )}
                <Link href={messageHref(conversation)} className={buttonClassName({ size: "sm", variant: "outline" })}>
                  {t("groups.page.open")}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
