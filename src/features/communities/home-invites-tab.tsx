"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Mail, Send, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { ErrorBox } from "./home-shared";
import { RulesAcceptModal } from "./rules-accept";
import { cancelJoinRequest, fetchMyInvitations, fetchMyJoinRequests, type GroupInvitation, type MyJoinRequest } from "@/lib/supabase/chat-groups";
import { respondToCommunityInvitation, type CommunitySummary } from "@/lib/supabase/communities";
import { parseGroupJoinToken } from "@/lib/chat-groups";
import { communityHref } from "@/lib/communities";
import { INVITES_SECTIONS, type InvitesSection } from "@/lib/community-home";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";
import type { TranslationKey } from "@/lib/i18n/translations";

const ignoreCount = () => undefined;

const SECTION_LABEL: Record<InvitesSection, TranslationKey> = {
  invites: "communities.invitesTab.invites",
  mine: "communities.invitesTab.mine",
  incoming: "communities.invitesTab.incoming",
};

/**
 * Davet ve başvurular: bana gelen davetler · benim gönderdiğim başvurular · (yöneticiysem) yönettiğim topluluklara gelen başvurular.
 * "Davet bağlantın var mı?" kutusu da burada. Davet bağlantısı / kabul / reddet / geri çek akışları eskisiyle aynıdır.
 */
export function HomeInvitesTab({
  userId,
  section,
  onSection,
  managed,
  onInviteCount,
  onToast,
}: {
  userId: string;
  section: InvitesSection;
  onSection: (next: InvitesSection) => void;
  /** Yönettiğim topluluklar (gelen başvuru sayaçlarıyla); hiç yoksa "Gelen başvurular" bölümü görünmez. */
  managed: CommunitySummary[];
  onInviteCount: (n: number) => void;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useRealMessages();
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState(false);
  const sections = INVITES_SECTIONS.filter((value) => value !== "incoming" || managed.length > 0);
  const active = sections.includes(section) ? section : "invites";
  const incoming = managed.reduce((sum, c) => sum + c.pendingRequestCount, 0);

  const openLink = () => {
    const token = parseGroupJoinToken(linkInput);
    if (!token) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    router.push(`/communities/join#${token}`);
  };

  return (
    <div className="space-y-4">
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

      <Tabs
        variant="segmented"
        ariaLabel={t("communities.invitesTab.aria")}
        active={active}
        onChange={onSection}
        items={sections.map((value) => ({ key: value, label: t(SECTION_LABEL[value]), count: value === "incoming" && incoming > 0 ? incoming : undefined }))}
      />

      {active === "invites" && (
        <InvitesView
          userId={userId}
          onCount={onInviteCount}
          onToast={onToast}
          onJoined={(id) => {
            void refresh();
            router.push(communityHref(id));
          }}
        />
      )}
      {active === "mine" && <RequestsView userId={userId} onCount={ignoreCount} onToast={onToast} />}
      {active === "incoming" && <IncomingRequestsView managed={managed} />}
    </div>
  );
}

/** Yönettiğim topluluklara gelen bekleyen başvurular: topluluk başına sayaç; başvurular Üyeler → Katılım istekleri'nde karara bağlanır. */
function IncomingRequestsView({ managed }: { managed: CommunitySummary[] }) {
  const { t } = useTranslation();
  const pending = managed.filter((c) => c.pendingRequestCount > 0);
  if (pending.length === 0) return <EmptyState icon={ShieldCheck} title={t("communities.invitesTab.incomingEmpty")} description={t("communities.invitesTab.incomingEmptyHelp")} />;
  return (
    <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface" data-testid="incoming-requests">
      {pending.map((community) => (
        <li key={community.id} className="flex items-center gap-3 px-4 py-3">
          <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={40} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-text">{community.name}</span>
            <span className="block text-caption text-text-muted">
              {t("communities.card.pendingRequests", { count: community.pendingRequestCount })} · {memberCountText(t, community.memberCount)}
            </span>
          </span>
          <Link href={communityHref(community.id, "members", "requests")} className="shrink-0 rounded-md border border-border px-3 py-1.5 text-small font-medium text-text hover:border-border-strong">
            {t("communities.invitesTab.review")}
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface InvitesState {
  key: string;
  invitations: GroupInvitation[];
  error: boolean;
}

/** Bana gelen davetler: kabul / reddet (kuralları kabul zorunluysa önce kural metni onaylanır). */
export function InvitesView({ userId, onCount, onToast, onJoined }: { userId: string; onCount: (n: number) => void; onToast: (message: string) => void; onJoined: (groupId: string) => void }) {
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
export function RequestsView({ userId, onCount, onToast }: { userId: string; onCount: (n: number) => void; onToast: (message: string) => void }) {
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
